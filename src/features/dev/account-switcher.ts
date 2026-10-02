// Development-only quick account switching. Disabled outside __DEV__ (never in store builds).
// Stores Supabase sessions of accounts that signed in on this device, in the same local storage
// the Supabase client already uses for the current session. No passwords are stored.
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { AuthChangeEvent, Session } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';

export const devAccountSwitcherEnabled = typeof __DEV__ !== 'undefined' && __DEV__;

const KEY = 'dev.accountSwitcher.sessions';
type Saved = { userId: string; email: string; accessToken: string; refreshToken: string };
export type SavedAccount = { userId: string; email: string };

let keepNextSignOut = false;
let currentUserId: string | null = null;

async function read(): Promise<Record<string, Saved>> {
  try { return JSON.parse((await AsyncStorage.getItem(KEY)) ?? '{}'); } catch { return {}; }
}
async function write(value: Record<string, Saved>) {
  await AsyncStorage.setItem(KEY, JSON.stringify(value));
}

async function remember(session: Session) {
  const all = await read();
  all[session.user.id] = {
    userId: session.user.id, email: session.user.email ?? session.user.id,
    accessToken: session.access_token, refreshToken: session.refresh_token,
  };
  await write(all);
}

export async function forgetAccount(userId: string) {
  const all = await read();
  delete all[userId];
  await write(all);
}

export async function listSavedAccounts(): Promise<SavedAccount[]> {
  if (!devAccountSwitcherEnabled) return [];
  return Object.values(await read()).map(({ userId, email }) => ({ userId, email })).sort((a, b) => a.email.localeCompare(b.email));
}

// Called by the auth provider on every auth event. Keeps the latest rotated tokens of each account.
export function trackAuthEvent(event: AuthChangeEvent, session: Session | null) {
  if (!devAccountSwitcherEnabled) return;
  if (session) {
    currentUserId = session.user.id;
    void remember(session).catch(() => {});
    return;
  }
  if (event === 'SIGNED_OUT') {
    const previous = currentUserId;
    currentUserId = null;
    // A regular sign-out revokes the session on the server, so the saved copy is useless.
    if (!keepNextSignOut && previous) void forgetAccount(previous).catch(() => {});
    keepNextSignOut = false;
  }
}

export async function switchToAccount(userId: string) {
  const target = (await read())[userId];
  if (!target) throw new Error('Conta não encontrada na lista.');
  const { data } = await supabase.auth.getSession();
  if (data.session) await remember(data.session);
  const { error } = await supabase.auth.setSession({ access_token: target.accessToken, refresh_token: target.refreshToken });
  if (error) {
    await forgetAccount(userId);
    throw new Error('A sessão salva desta conta expirou. Entre com ela novamente.');
  }
}

// Clears only the local session (not revoked on the server), so it stays switchable, then shows login.
export async function addAnotherAccount() {
  const { data } = await supabase.auth.getSession();
  if (data.session) await remember(data.session);
  keepNextSignOut = true;
  const { error } = await supabase.auth.signOut({ scope: 'local' });
  if (error) { keepNextSignOut = false; throw error; }
}
