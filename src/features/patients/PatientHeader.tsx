import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';
import { router } from 'expo-router';
import { Action, styles as ui } from '@/features/modules/ui';
import { PatientForm } from './PatientForm';
import { createPatientService, formatBirthDate, formatCpf, patientError, type Patient } from './service';

const sexLabels = { female: 'Feminino', male: 'Masculino' } as const;

// Patient data at the top of the patient's document list, with correction and deletion.
export function PatientHeader({ patientId, accessToken }: { patientId: string; accessToken: string }) {
  const service = useMemo(() => createPatientService(accessToken), [accessToken]);
  const [patient, setPatient] = useState<Patient | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [editing, setEditing] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => service.get(patientId).then(row => {
    setPatient(row); setError(row ? '' : 'Paciente indisponível.');
  }).catch(e => setError(patientError(e))).finally(() => setLoading(false)), [patientId, service]);
  useEffect(() => { void load(); }, [load]);

  async function remove() {
    if (!confirmDelete) { setConfirmDelete(true); return; }
    setBusy(true); setError('');
    try { await service.remove(patientId); router.back(); }
    catch (e) { setError(patientError(e)); setConfirmDelete(false); }
    finally { setBusy(false); }
  }

  return <View style={ui.header}>
    <Action title="‹ Pacientes" onPress={() => router.back()} />
    {loading ? <ActivityIndicator accessibilityLabel="Carregando paciente" /> : patient && <>
      <Text style={ui.title}>{patient.display_name}</Text>
      <Text style={ui.subtitle}>{[formatCpf(patient.cpf) && `CPF ${formatCpf(patient.cpf)}`, patient.birth_date && `Nasc. ${formatBirthDate(patient.birth_date)}`,
        patient.sex && sexLabels[patient.sex]].filter(Boolean).join(' · ') || 'Sem CPF, nascimento ou sexo informados.'}</Text>
      <View style={ui.actions}>
        <Action title="Corrigir dados" onPress={() => setEditing(true)} disabled={busy} />
        <Action title={confirmDelete ? 'Confirmar exclusão do paciente' : 'Excluir paciente'} danger onPress={() => void remove()} disabled={busy} />
        {confirmDelete && <Action title="Não excluir" onPress={() => setConfirmDelete(false)} disabled={busy} />}
      </View>
      {confirmDelete && <Text style={ui.danger}>Só é possível excluir um paciente sem documentos. Esta ação não pode ser desfeita.</Text>}
    </>}
    {!!error && <Text accessibilityRole="alert" style={ui.danger}>{error}</Text>}
    {editing && patient && <PatientForm patient={patient} onClose={() => setEditing(false)} onSave={async input => {
      await service.update(patient.id, input);
      await load();
    }} />}
  </View>;
}
