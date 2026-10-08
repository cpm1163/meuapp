// Shared by the analysis Edge Functions: HTTP helpers, Supabase clients and the Anthropic client.
// The AI key lives only in the Supabase secrets (ANTHROPIC_API_KEY); logs never carry document content.

import Anthropic from '@anthropic-ai/sdk';
import {createClient, type SupabaseClient, type User} from '@supabase/supabase-js';

export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

export const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {status, headers: {...corsHeaders, 'Content-Type': 'application/json'}});

export const errorResponse = (code: string, status: number, extra: Record<string, unknown> = {}) =>
  json({error: code, ...extra}, status);

/** One structured line per event: identifiers, timings, token counts and error codes only. */
export const log = (event: string, fields: Record<string, unknown>) =>
  console.log(JSON.stringify({event, ...fields}));

// New API keys come as a JSON dictionary; the legacy variables remain as a fallback.
function apiKey(current: string, legacy: string): string {
  const raw = Deno.env.get(current);
  if (raw) {
    try {
      const keys = JSON.parse(raw) as Record<string, string>;
      const key = keys.default ?? Object.values(keys)[0];
      if (key) return key;
    } catch {
      // Not a dictionary: fall through to the legacy variable.
    }
  }
  const key = Deno.env.get(legacy);
  if (!key) throw new Error(`missing ${current}`);
  return key;
}

const supabaseUrl = () => {
  const url = Deno.env.get('SUPABASE_URL');
  if (!url) throw new Error('missing SUPABASE_URL');
  return url;
};

/** Client that acts as the caller: RLS and the database functions see the user's token. */
export function userClient(authorization: string): SupabaseClient {
  return createClient(supabaseUrl(), apiKey('SUPABASE_PUBLISHABLE_KEYS', 'SUPABASE_ANON_KEY'), {
    global: {headers: {Authorization: authorization}},
    auth: {persistSession: false, autoRefreshToken: false},
  });
}

/** Server client: bypasses RLS. Only used after the user's authorization was checked in the database. */
export function serviceClient(): SupabaseClient {
  return createClient(supabaseUrl(), apiKey('SUPABASE_SECRET_KEYS', 'SUPABASE_SERVICE_ROLE_KEY'), {
    auth: {persistSession: false, autoRefreshToken: false},
  });
}

/** Validates the caller's session with the Auth server. */
export async function authenticate(req: Request): Promise<{user: User; client: SupabaseClient} | Response> {
  const authorization = req.headers.get('Authorization');
  if (!authorization?.startsWith('Bearer ')) return errorResponse('not_authenticated', 401);
  const client = userClient(authorization);
  const {data, error} = await client.auth.getUser(authorization.slice('Bearer '.length));
  if (error || !data.user) return errorResponse('not_authenticated', 401);
  return {user: data.user, client};
}

/**
 * Anthropic client. Creating a batch is never retried automatically: a retry after a lost response
 * could submit (and bill) the same analysis twice (docs/compliance.md, Travas de custo).
 */
export function anthropicClient({retries}: {retries: 0 | 2}): Anthropic {
  const key = Deno.env.get('ANTHROPIC_API_KEY');
  if (!key) throw new Error('missing ANTHROPIC_API_KEY');
  return new Anthropic({apiKey: key, maxRetries: retries, timeout: 60_000});
}
