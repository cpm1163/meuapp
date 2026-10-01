import { createClient } from '@supabase/supabase-js';

export type DocumentRecord = {
  id: string;
  owner_id: string;
  name: string;
  storage_path: string;
  mime_type: string;
  size_bytes: number | null;
  status: 'pending_upload' | 'uploaded' | 'processing' | 'ready' | 'failed' | 'deleting';
  created_at: string;
};
export type DocumentShare = { user_id: string; email: string; created_at: string };
export const MAX_FILE_BYTES = 10 * 1024 * 1024;
export const DOCUMENT_TYPES = ['application/pdf', 'image/jpeg', 'image/png'];
export const PAGE_SIZE = 20;

// Each operation stays bound to the session that initiated it, even during account switches.
export function createDocumentService(accessToken: string) {
  const client = createClient(
    process.env.EXPO_PUBLIC_SUPABASE_URL!,
    process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    { accessToken: async () => accessToken, auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } },
  );
  const bucket = client.storage.from('documents');

  return {
    async list(userId: string, scope: 'mine' | 'shared', offset = 0) {
      let query = client.from('documents').select('*').order('created_at', { ascending: false }).order('id');
      query = scope === 'mine' ? query.eq('owner_id', userId) : query.neq('owner_id', userId);
      const { data, error } = await query.range(offset, offset + PAGE_SIZE - 1);
      if (error) throw error;
      return data as DocumentRecord[];
    },
    async upload(name: string, bytes: ArrayBuffer) {
      const contentType = detectDocumentType(bytes);
      const { data, error } = await client.rpc('create_document', { document_name: name, content_type: contentType });
      if (error) throw error;
      const document = data as DocumentRecord;
      // Keep the reservation if upload/finalization fails. The owner can retry completion or delete it.
      const result = await bucket.upload(document.storage_path, bytes, { contentType, upsert: false, cacheControl: '0' });
      if (result.error) throw new Error('O envio não foi concluído. Atualize a lista e remova o item pendente antes de enviar novamente.');
      const completed = await client.rpc('complete_document_upload', { document_id: document.id });
      if (completed.error) throw new Error('O arquivo foi enviado, mas falta confirmar. Use “Concluir envio” na lista.');
    },
    async complete(id: string) {
      const { error } = await client.rpc('complete_document_upload', { document_id: id });
      if (error) throw error;
    },
    async open(document: DocumentRecord) {
      const { data, error } = await bucket.createSignedUrl(document.storage_path, 60);
      if (error) throw error;
      return data.signedUrl;
    },
    async remove(id: string) {
      const begun = await client.rpc('begin_document_delete', { document_id: id });
      if (begun.error) throw begun.error;
      const removed = await bucket.remove([begun.data as string]);
      if (removed.error) throw removed.error;
      const finished = await client.rpc('finish_document_delete', { document_id: id });
      if (finished.error) throw finished.error;
    },
    async rename(id: string, name: string) {
      const { data, error } = await client.from('documents').update({ name: name.trim() }).eq('id', id).select('id').single();
      if (error || !data) throw error ?? new Error('Documento indisponível.');
    },
    async share(id: string, email: string) {
      const { error } = await client.rpc('share_document', { document_id: id, recipient_email: email.trim() });
      if (error) throw error;
    },
    async shares(id: string) {
      const { data, error } = await client.rpc('list_document_shares', { document_id: id });
      if (error) throw error;
      return data as DocumentShare[];
    },
    async revoke(id: string, userId: string) {
      const { error } = await client.from('document_shares').delete().eq('document_id', id).eq('user_id', userId);
      if (error) throw error;
    },
  };
}

// Basic format recognition for the picker; not a substitute for sandboxed server-side parsing.
export function detectDocumentType(buffer: ArrayBuffer) {
  if (!buffer.byteLength || buffer.byteLength > MAX_FILE_BYTES) throw new Error('Escolha um arquivo de até 10 MB que não esteja vazio.');
  const bytes = new Uint8Array(buffer);
  if ([0x25, 0x50, 0x44, 0x46, 0x2d].every((b, i) => bytes[i] === b)) return 'application/pdf';
  if ([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a].every((b, i) => bytes[i] === b)) return 'image/png';
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg';
  throw new Error('Selecione um PDF ou uma imagem PNG/JPEG válida.');
}

export function documentError(error: unknown): string {
  const code = error && typeof error === 'object' && 'code' in error ? String(error.code) : '';
  if (code === 'PGRST205' || code === 'PGRST202' || code === '42P01') return 'O serviço de documentos ainda não está disponível. Tente novamente mais tarde.';
  if (code === '23505') return 'Este documento já está compartilhado com essa pessoa.';
  if (code === '22023') return 'Confira o destinatário e se o envio do arquivo já foi concluído.';
  if (code === '42501') return 'Você não tem acesso a esta operação. Atualize a lista.';
  if (error instanceof Error && !code && /^(Escolha|Selecione|O envio|O arquivo)/.test(error.message)) return error.message;
  return 'Não foi possível concluir. Confira sua conexão, atualize a lista e tente novamente.';
}
