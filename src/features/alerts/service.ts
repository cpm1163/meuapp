import { createClient } from '@supabase/supabase-js';

// Alerts are created and resolved by the database (supabase/migrations/20261029000100_alerts.sql).
export type AlertKind = 'document_unassigned' | 'document_shared';
export type AlertRecord = {
  id: string;
  kind: AlertKind;
  document_id: string;
  created_at: string;
  read_at: string | null;
  document: { name: string } | null;
};
export const ALERT_PAGE_SIZE = 50;

export const alertTitles: Record<AlertKind, string> = {
  document_unassigned: 'Documento sem paciente', document_shared: 'Documento compartilhado com você',
};

export function createAlertService(accessToken: string) {
  const client = createClient(
    process.env.EXPO_PUBLIC_SUPABASE_URL!,
    process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    { accessToken: async () => accessToken, auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } },
  );

  return {
    async list(limit = ALERT_PAGE_SIZE) {
      const { data, error } = await client.from('alerts').select('id, kind, document_id, created_at, read_at, document:documents(name)')
        .order('created_at', { ascending: false }).order('id').limit(limit);
      if (error) throw error;
      return data as unknown as AlertRecord[];
    },
    async count(unreadOnly = false) {
      let query = client.from('alerts').select('id', { count: 'exact', head: true });
      if (unreadOnly) query = query.is('read_at', null);
      const { count, error } = await query;
      if (error) throw error;
      return count ?? 0;
    },
    async markRead(id: string) {
      const { error } = await client.from('alerts').update({ read_at: new Date().toISOString() }).eq('id', id).is('read_at', null);
      if (error) throw error;
    },
    async remove(ids: string[]) {
      if (!ids.length) return;
      const { error } = await client.from('alerts').delete().in('id', ids);
      if (error) throw error;
    },
  };
}

// Where "Visualizar" takes the doctor: the inbox tab that holds the document.
export function alertTarget(alert: Pick<AlertRecord, 'kind'>) {
  return { pathname: '/documents' as const, params: { scope: alert.kind === 'document_shared' ? 'shared' : 'unassigned' } };
}

export function alertError(error: unknown): string {
  if (typeof __DEV__ !== 'undefined' && __DEV__) console.warn('[alerts]', error);
  const code = error && typeof error === 'object' && 'code' in error ? String(error.code) : '';
  if (code === 'PGRST205' || code === '42P01') return 'Os alertas ainda não estão disponíveis. Tente novamente mais tarde.';
  return 'Não foi possível concluir. Confira sua conexão e tente novamente.';
}
