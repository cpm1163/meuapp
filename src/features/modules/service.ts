import { createClient } from '@supabase/supabase-js';

export type MyModule = {
  module_id: string;
  name: string;
  description: string;
  module_status: 'draft' | 'testing' | 'active' | 'disabled';
  granted_at: string;
  expires_at: string | null;
  active: boolean;
  terms_version: string;
  terms_accepted: boolean;
};
export type CatalogModule = { id: string; name: string; status: MyModule['module_status'] };
export type FoundUser = { user_id: string; email: string };
export type ModuleGrant = {
  grant_id: string;
  user_id: string;
  email: string;
  module_id: string;
  granted_at: string;
  expires_at: string | null;
  revoked_at: string | null;
  active: boolean;
  note: string | null;
};

// Each operation stays bound to the session that initiated it, even during account switches.
// Authorization is enforced by the database; the client checks only decide what to show.
export function createModuleService(accessToken: string) {
  const client = createClient(
    process.env.EXPO_PUBLIC_SUPABASE_URL!,
    process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    { accessToken: async () => accessToken, auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } },
  );

  return {
    async isAdmin(userId: string) {
      const { data, error } = await client.from('app_admins').select('user_id').eq('user_id', userId).maybeSingle();
      if (error) throw error;
      return !!data;
    },
    async myModules() {
      const { data, error } = await client.rpc('my_modules');
      if (error) throw error;
      return data as MyModule[];
    },
    async acceptTerms(moduleId: string) {
      const { error } = await client.rpc('accept_module_terms', { module_id: moduleId });
      if (error) throw error;
    },
    async catalog() {
      const { data, error } = await client.from('analysis_modules').select('id,name,status').order('name');
      if (error) throw error;
      return data as CatalogModule[];
    },
    async findUser(email: string) {
      const { data, error } = await client.rpc('admin_find_user', { search_email: email.trim() });
      if (error) throw error;
      return (data as FoundUser[])[0] ?? null;
    },
    async grantsFor(userId: string) {
      const { data, error } = await client.rpc('admin_list_module_grants');
      if (error) throw error;
      return (data as ModuleGrant[]).filter(grant => grant.user_id === userId);
    },
    async grant(userId: string, moduleId: string, note: string) {
      const { error } = await client.rpc('admin_grant_module', { user_id: userId, module_id: moduleId, note: note.trim() || null });
      if (error) throw error;
    },
    async revoke(grantId: string) {
      const { error } = await client.rpc('admin_revoke_module_grant', { grant_id: grantId });
      if (error) throw error;
    },
  };
}

export function moduleError(error: unknown): string {
  if (typeof __DEV__ !== 'undefined' && __DEV__) console.warn('[modules]', error);
  const code = error && typeof error === 'object' && 'code' in error ? String(error.code) : '';
  if (code === 'PGRST205' || code === 'PGRST202' || code === '42P01') return 'O serviço de módulos ainda não está disponível. Tente novamente mais tarde.';
  if (code === '23505') return 'Esta conta já tem este módulo liberado.';
  if (code === '22023') return 'Confira a conta e o módulo escolhidos e tente novamente.';
  if (code === '42501') return 'Você não tem acesso a esta operação.';
  return 'Não foi possível concluir. Confira sua conexão e tente novamente.';
}

export function formatDate(value: string | null) {
  return value ? new Date(value).toLocaleDateString('pt-BR') : '';
}
