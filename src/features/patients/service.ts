import { createClient } from '@supabase/supabase-js';

export type Patient = {
  id: string;
  display_name: string;
  cpf: string | null;
  birth_date: string | null;
  sex: 'female' | 'male' | null;
  created_at: string;
};
export type PatientListItem = Patient & { document_count: number; last_activity_at: string };
export type PatientInput = { displayName: string; cpf: string; birthDate: string | null; sex: Patient['sex'] };

export const PATIENT_MODULE = 'patient-records';
export const PATIENT_PAGE_SIZE = 20;

// Each operation stays bound to the session that initiated it, even during account switches.
// Authorization (owner only, module for creating and linking) is enforced by the database.
export function createPatientService(accessToken: string) {
  const client = createClient(
    process.env.EXPO_PUBLIC_SUPABASE_URL!,
    process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    { accessToken: async () => accessToken, auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } },
  );
  const params = (input: PatientInput) => ({
    display_name: input.displayName.trim(), cpf: input.cpf.trim() || null, birth_date: input.birthDate, sex: input.sex,
  });

  return {
    async list(search = '', offset = 0) {
      const { data, error } = await client.rpc('list_patients', { search: search.trim() || null, page_offset: offset });
      if (error) throw error;
      return data as PatientListItem[];
    },
    async get(id: string) {
      const { data, error } = await client.from('patients').select('*').eq('id', id).maybeSingle();
      if (error) throw error;
      return data as Patient | null;
    },
    async create(input: PatientInput) {
      const { data, error } = await client.rpc('create_patient', params(input));
      if (error) throw error;
      return data as Patient;
    },
    async update(id: string, input: PatientInput) {
      const { error } = await client.rpc('update_patient', { patient_id: id, ...params(input) });
      if (error) throw error;
    },
    async remove(id: string) {
      const { error } = await client.rpc('delete_patient', { patient_id: id });
      if (error) throw error;
    },
    // A null patient unlinks the document.
    async setDocumentPatient(documentId: string, patientId: string | null) {
      const { error } = await client.rpc('set_document_patient', { document_id: documentId, patient_id: patientId });
      if (error) throw error;
    },
    // Display only: whether to show the patients area and whether creating and linking are allowed now.
    async moduleAccess() {
      const { data, error } = await client.rpc('my_modules');
      if (error) throw error;
      const row = (data as { module_id: string; module_status: string; active: boolean; terms_accepted: boolean }[])
        .find(item => item.module_id === PATIENT_MODULE);
      return {
        granted: !!row,
        canUse: !!row && row.active && row.terms_accepted && ['testing', 'active'].includes(row.module_status),
      };
    },
  };
}

export function formatCpf(cpf: string | null) {
  return cpf && /^\d{11}$/.test(cpf) ? `${cpf.slice(0, 3)}.${cpf.slice(3, 6)}.${cpf.slice(6, 9)}-${cpf.slice(9)}` : '';
}

// DD/MM/AAAA typed by the user <-> AAAA-MM-DD stored in the database.
export function parseBirthDate(text: string): string | null {
  const value = text.trim();
  if (!value) return null;
  const match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(value);
  if (!match) throw new Error('Informe a data de nascimento como DD/MM/AAAA.');
  const [, day, month, year] = match;
  const date = new Date(`${year}-${month}-${day}T00:00:00Z`);
  if (Number.isNaN(date.getTime()) || date.getUTCDate() !== Number(day)) throw new Error('Informe uma data de nascimento válida.');
  return `${year}-${month}-${day}`;
}
export function formatBirthDate(date: string | null) {
  return date ? date.split('-').reverse().join('/') : '';
}

export function patientError(error: unknown): string {
  if (typeof __DEV__ !== 'undefined' && __DEV__) console.warn('[patients]', error);
  const code = error && typeof error === 'object' && 'code' in error ? String(error.code) : '';
  const message = error && typeof error === 'object' && 'message' in error ? String(error.message) : '';
  if (message === 'invalid_cpf') return 'CPF inválido. Confira os números.';
  if (message === 'invalid_birth_date') return 'Informe uma data de nascimento válida.';
  if (message === 'patient_has_documents') return 'Este paciente ainda tem documentos. Exclua ou desvincule os documentos antes.';
  if (message === 'module_not_available') return 'A gestão por paciente não está liberada para você. Veja em “Meus módulos”.';
  if (code === '23505') return 'Você já cadastrou um paciente com este CPF.';
  if (code === '23514') return 'Confira o nome do paciente.';
  if (code === '42501') return 'Paciente ou documento indisponível. Atualize a lista.';
  if (error instanceof Error && !code && /^Informe/.test(error.message)) return error.message;
  return 'Não foi possível concluir. Confira sua conexão e tente novamente.';
}
