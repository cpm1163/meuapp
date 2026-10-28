import { createClient } from '@supabase/supabase-js';

// Receitas (docs/prescriptions.md): common medicines, printed as PDF and signed by hand. No AI.
export type PrescriptionItem = { medication: string; dosage: string; quantity: string };
// Header copied from the doctor's profile when the prescription was issued.
export type Prescriber = {
  full_name: string; crm: string; crm_uf: string;
  specialty?: string; rqe?: string; address?: string; phone?: string; email?: string;
};
export type Prescription = {
  id: string; patient_id: string; items: PrescriptionItem[]; notes: string | null;
  prescriber: Prescriber; patient_name: string; created_at: string;
};

// Optional fields of the profile; the doctor chooses which of them go on the prescription. Name and CRM always do.
export const OPTIONAL_FIELDS = ['specialty', 'rqe', 'address', 'phone', 'email'] as const;
export type OptionalField = typeof OPTIONAL_FIELDS[number];
export const FIELD_LABELS: Record<OptionalField, string> = {
  specialty: 'Especialidade', rqe: 'RQE', address: 'Endereço', phone: 'Telefone', email: 'E-mail',
};
export type DoctorProfile = {
  full_name: string; crm: string; crm_uf: string; printed: OptionalField[];
} & Record<OptionalField, string | null>;

export const UFS = ['AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MT', 'MS', 'MG', 'PA', 'PB', 'PR',
  'PE', 'PI', 'RJ', 'RN', 'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO'];
export const MAX_ITEMS = 20;

// Each operation stays bound to the session that initiated it, even during account switches.
// Authorization (owner only, module for prescribing) is enforced by the database.
export function createPrescriptionService(accessToken: string) {
  const client = createClient(
    process.env.EXPO_PUBLIC_SUPABASE_URL!,
    process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    { accessToken: async () => accessToken, auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } },
  );

  return {
    async getProfile() {
      const { data, error } = await client.from('doctor_profiles')
        .select('full_name, crm, crm_uf, specialty, rqe, address, phone, email, printed').maybeSingle();
      if (error) throw error;
      return data as DoctorProfile | null;
    },
    async saveProfile(profile: DoctorProfile) {
      const { error } = await client.rpc('save_doctor_profile', {
        full_name: profile.full_name.trim(), crm: profile.crm.trim(), crm_uf: profile.crm_uf,
        ...Object.fromEntries(OPTIONAL_FIELDS.map(field => [field, profile[field]?.trim() || null])),
        printed: profile.printed,
      });
      if (error) throw error;
    },
    async list(patientId: string) {
      const { data, error } = await client.from('prescriptions')
        .select('id, patient_id, items, notes, prescriber, patient_name, created_at')
        .eq('patient_id', patientId).order('created_at', { ascending: false });
      if (error) throw error;
      return data as Prescription[];
    },
    // Items with an empty medication are left out; the database rejects the rest if invalid.
    async create(patientId: string, items: PrescriptionItem[], notes: string) {
      const filled = items.map(item => ({ medication: item.medication.trim(), dosage: item.dosage.trim(), quantity: item.quantity.trim() }))
        .filter(item => item.medication);
      const { data, error } = await client.rpc('create_prescription', { patient_id: patientId, items: filled, notes: notes.trim() || null });
      if (error) throw error;
      return data as Prescription;
    },
  };
}

// Day of issue in the device's time zone: 28/10/2026.
export function formatPrescriptionDate(iso: string) {
  const date = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(date.getDate())}/${pad(date.getMonth() + 1)}/${date.getFullYear()}`;
}

export function prescriptionError(error: unknown): string {
  if (typeof __DEV__ !== 'undefined' && __DEV__) console.warn('[prescriptions]', error);
  const code = error && typeof error === 'object' && 'code' in error ? String(error.code) : '';
  const message = error && typeof error === 'object' && 'message' in error ? String(error.message) : '';
  if (message === 'doctor_profile_missing') return 'Cadastre seus dados de médico antes da primeira receita.';
  if (message === 'invalid_prescription_items') return 'Confira os medicamentos: cada um precisa de nome e posologia.';
  if (message === 'module_not_available') return 'A gestão por paciente não está liberada para você. Veja em “Meus módulos”.';
  if (code === '23514' || code === '23502') return 'Confira os dados: nome, CRM e UF são obrigatórios.';
  if (code === '42501') return 'Paciente indisponível. Atualize a lista.';
  if (error instanceof Error && !code && /^(Este aparelho|Informe)/.test(error.message)) return error.message;
  return 'Não foi possível concluir. Confira sua conexão e tente novamente.';
}
