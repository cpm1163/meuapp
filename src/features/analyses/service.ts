import { createClient, FunctionsHttpError } from '@supabase/supabase-js';
import type { Finding } from '../../../modules/lab-report/findings';

export const MODULE_ID = 'lab-report';

export type Analysis = {
  id: string;
  document_id: string;
  status: 'processing' | 'ready' | 'failed';
  failure_reason: string | null;
  findings: Finding[] | null;
  model: string | null;
  created_at: string;
  completed_at: string | null;
};
export type Quota = { daily_limit: number; used: number; remaining: number; next_available_at: string | null };
export type ModuleAccess = 'ready' | 'not_granted' | 'terms_pending' | 'not_available';

/** Error with the code returned by the analysis functions (e.g. daily_limit_reached). */
export class AnalysisError extends Error {
  constructor(public code: string, public nextAvailableAt: string | null = null) { super(code); }
}

// Each operation stays bound to the session that initiated it, even during account switches.
// The app never calls the AI: the Edge Functions hold the key and the database authorizes each analysis.
export function createAnalysisService(accessToken: string) {
  const client = createClient(
    process.env.EXPO_PUBLIC_SUPABASE_URL!,
    process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    { accessToken: async () => accessToken, auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } },
  );

  async function invoke(name: string, body: Record<string, unknown>) {
    const { data, error } = await client.functions.invoke(name, { body });
    if (error instanceof FunctionsHttpError) {
      const payload = await error.context.json().catch(() => null) as { error?: string; next_available_at?: string | null } | null;
      throw new AnalysisError(payload?.error ?? 'request_failed', payload?.next_available_at ?? null);
    }
    if (error) throw new AnalysisError('network');
    return data;
  }

  return {
    async latest(documentId: string) {
      const { data, error } = await client.from('document_analyses')
        .select('id, document_id, status, failure_reason, findings, model, created_at, completed_at')
        .eq('document_id', documentId).order('created_at', { ascending: false }).limit(1).maybeSingle();
      if (error) throw error;
      return data as Analysis | null;
    },
    async access(): Promise<ModuleAccess> {
      const { data, error } = await client.rpc('my_modules');
      if (error) throw error;
      const item = (data as { module_id: string; active: boolean; terms_accepted: boolean; module_status: string }[])
        .find(row => row.module_id === MODULE_ID);
      if (!item || !item.active) return 'not_granted';
      if (!['testing', 'active'].includes(item.module_status)) return 'not_available';
      return item.terms_accepted ? 'ready' : 'terms_pending';
    },
    async quota() {
      const { data, error } = await client.rpc('get_analysis_quota');
      if (error) throw error;
      return ((data as Quota[])[0] ?? null);
    },
    start: (documentId: string) => invoke('analyze-document', { document_id: documentId }),
    collect: () => invoke('collect-analyses', {}),
  };
}

const MESSAGES: Record<string, string> = {
  daily_limit_reached: 'Você atingiu o limite diário de análises.',
  analysis_in_progress: 'Já existe uma análise em andamento para este documento.',
  module_not_available: 'O módulo de análise não está liberado para sua conta, ou os termos não foram aceitos.',
  document_not_available: 'Documento indisponível. Atualize a lista.',
  invalid_document_state: 'Conclua o envio do arquivo antes de pedir a análise.',
  unsupported_file_type: 'Este tipo de arquivo não pode ser analisado.',
  not_authenticated: 'Sua sessão expirou. Entre novamente.',
  network: 'Sem conexão com o servidor. Tente novamente.',
};

export function analysisError(error: unknown): string {
  if (typeof __DEV__ !== 'undefined' && __DEV__) console.warn('[analyses]', error);
  if (error instanceof AnalysisError) {
    const base = MESSAGES[error.code] ?? 'Não foi possível pedir a análise. Tente novamente mais tarde.';
    if (error.code === 'daily_limit_reached' && error.nextAvailableAt) {
      return `${base} A próxima fica disponível em ${new Date(error.nextAvailableAt).toLocaleString('pt-BR')}.`;
    }
    return base;
  }
  return 'Não foi possível carregar a análise. Confira sua conexão e tente novamente.';
}

/** Why an analysis failed, in words for the doctor. Codes come from the Edge Functions and findings.ts. */
export function failureText(reason: string | null): string {
  switch (reason) {
    case 'no_lab_exams': return 'Nenhum exame laboratorial foi encontrado neste documento. Laudos descritivos (ultrassom, raio-X etc.) ainda não são analisados.';
    case 'unreadable': return 'O documento está ilegível. Envie um arquivo ou uma foto mais nítida.';
    case 'no_exams_found': return 'Nenhum exame foi encontrado no documento.';
    case 'output_truncated': return 'O laudo é longo demais para uma única análise.';
    case 'model_refusal': return 'O serviço de IA recusou este documento.';
    case 'timeout': return 'A análise não terminou a tempo.';
    case 'provider_invalid_request': return 'O serviço de IA recusou o pedido por um problema técnico do app. O erro foi registrado para correção.';
    default: return 'A análise não pôde ser concluída. Você pode tentar novamente.';
  }
}
