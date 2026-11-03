import { createClient, FunctionsHttpError } from '@supabase/supabase-js';
import { REPLIES, type Decision } from '../../../modules/patient-chat/decision';

export type ChatReply = Pick<Decision, 'outcome' | 'text' | 'item'>;

// What the screen shows when the server refuses or cannot be reached. Everything else comes from the server.
const REFUSALS: Record<string, string> = {
  chat_limit_reached: `Você atingiu o limite de perguntas de teste por hoje. Se for urgência, ligue 192 (SAMU) ou vá ao pronto-socorro mais próximo.`,
  invalid_question: 'Escreva uma pergunta de até 500 caracteres.',
  module_not_available: 'O chat de teste não está disponível para esta conta.',
  not_authenticated: 'Sua sessão terminou. Entre novamente.',
};

// The app never calls the AI and never reads the KB: only the Edge Function does.
export function createPatientChatService(accessToken: string) {
  const client = createClient(
    process.env.EXPO_PUBLIC_SUPABASE_URL!,
    process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    { accessToken: async () => accessToken, auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } },
  );

  return {
    // Never rejects: a failure becomes the fixed reply, which carries the urgency guidance.
    async ask(question: string): Promise<ChatReply> {
      try {
        const { data, error } = await client.functions.invoke('patient-chat', { body: { question } });
        if (error instanceof FunctionsHttpError) {
          const payload = await error.context.json().catch(() => null) as { error?: string } | null;
          const text = REFUSALS[payload?.error ?? ''];
          if (text) return { outcome: 'unavailable', text, item: null };
        } else if (!error && typeof data?.text === 'string') {
          return { outcome: data.outcome, text: data.text, item: data.item ?? null };
        }
      } catch {
        // Falls through to the fixed reply.
      }
      return { outcome: 'unavailable', text: REPLIES.unavailable, item: null };
    },
  };
}
