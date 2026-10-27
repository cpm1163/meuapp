import type { Verification } from '../../../modules/lab-report/verification';
import { createClient, FunctionsHttpError } from '@supabase/supabase-js';
import type { Extraction, Finding } from '../../../modules/lab-report/findings';
import type { Group } from '../../../modules/clinical-considerations/grouping';
import type { Draft } from '../../../modules/clinical-considerations/writing';

export const MODULE_ID = 'lab-report';

export type Analysis = {
  id: string;
  document_id: string;
  status: 'processing' | 'ready' | 'failed';
  failure_reason: string | null;
  findings: Finding[] | null;
  extraction: Extraction | null;
  model: string | null;
  created_at: string;
  completed_at: string | null;
  verification: Verification | null;
};
export type AnalysisSummary = Pick<Analysis, 'id' | 'status' | 'created_at'>;
const ANALYSIS_COLUMNS = 'id, document_id, status, failure_reason, findings, extraction, model, created_at, completed_at, verification';
export type Quota ={ daily_limit: number; used: number; remaining: number; next_available_at: string | null };
export type ModuleAccess = 'ready' | 'not_granted' | 'terms_pending' | 'not_available';

/** Error with the code returned by the analysis functions (e.g. daily_limit_reached). */
export class AnalysisError extends Error {
  constructor(public code: string, public nextAvailableAt: string | null = null) { super(code); }
}

// Each operation stays bound to the session that initiated it, even during account switches.
// The app never calls the AI: the Edge Functions hold the key and the database authorizes each analysis.
export type Grouping = { status: 'processing' | 'ready' | 'failed'; groups: Group[] | null; failure_reason: string | null };
export type ConsiderationsDraft = {
  status: 'processing' | 'ready' | 'failed'; draft: Draft | null; failure_reason: string | null;
  approved_text: string | null; approved_at: string | null;
};

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
        .select(ANALYSIS_COLUMNS)
        .eq('document_id', documentId).order('created_at', { ascending: false }).limit(1).maybeSingle();
      if (error) throw error;
      return data as Analysis | null;
    },
    // All analyses of the document, most recent first, without the findings (loaded only when one is opened).
    async history(documentId: string) {
      const { data, error } = await client.from('document_analyses')
        .select('id, status, created_at').eq('document_id', documentId).order('created_at', { ascending: false });
      if (error) throw error;
      return data as AnalysisSummary[];
    },
    async get(id: string) {
      const { data, error } = await client.from('document_analyses').select(ANALYSIS_COLUMNS).eq('id', id).maybeSingle();
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
    /** The theme grouping of an analysis (clinical considerations, type 1), or null if none was started. */
    async grouping(analysisId: string): Promise<Grouping | null> {
      const { data, error } = await client.from('analysis_groupings').select('status, groups, failure_reason')
        .eq('analysis_id', analysisId).maybeSingle();
      if (error) throw error;
      return data as Grouping | null;
    },
    /** Asks the server to group a ready analysis; it calls the AI at most once per analysis. */
    startGrouping: (analysisId: string) => invoke('group-analysis', { analysis_id: analysisId }),
    /** The draft of the clinical considerations of an analysis, or null if the doctor has not asked for it. */
    async considerationsDraft(analysisId: string): Promise<ConsiderationsDraft | null> {
      const { data, error } = await client.from('analysis_considerations')
        .select('status, draft, failure_reason, approved_text, approved_at').eq('analysis_id', analysisId).maybeSingle();
      if (error) throw error;
      return data as ConsiderationsDraft | null;
    },
    /** Asks the server to write the draft; it calls the AI at most once per analysis. */
    startConsiderations: (analysisId: string) => invoke('write-considerations', { analysis_id: analysisId }),
    /** Records the doctor's text, edited or not; only the approved text goes to the PDF. */
    async approveConsiderations(analysisId: string, text: string): Promise<string> {
      const { data, error } = await client.rpc('approve_analysis_considerations', { analysis_id: analysisId, text });
      if (error) throw new AnalysisError(error.message);
      return data as string;
    },
    /** Whether a level B add-on module (e.g. 'clinical-considerations') can be shown to this account. */
    async moduleReady(moduleId: string): Promise<boolean> {
      const { data, error } = await client.rpc('my_modules');
      if (error) throw error;
      const item = (data as { module_id: string; active: boolean; terms_accepted: boolean; module_status: string }[])
        .find(row => row.module_id === moduleId);
      return !!item && item.active && item.terms_accepted && ['testing', 'active'].includes(item.module_status);
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
