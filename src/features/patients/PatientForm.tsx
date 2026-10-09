import { useState } from 'react';
import { Modal, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { Action, styles as ui } from '@/features/modules/ui';
import { formatBirthDate, formatCpf, parseBirthDate, patientError, type Patient, type PatientInput } from './service';

type Props = { patient?: Patient | null; onClose: () => void; onSave: (input: PatientInput) => Promise<void> };
const sexes: { value: Patient['sex']; label: string }[] = [
  { value: 'female', label: 'Feminino' }, { value: 'male', label: 'Masculino' }, { value: null, label: 'Não informar' },
];

// Create or correct a patient record. Only the name is required (docs/exam-comparison.md).
export function PatientForm({ patient, onClose, onSave }: Props) {
  const [name, setName] = useState(patient?.display_name ?? '');
  const [cpf, setCpf] = useState(formatCpf(patient?.cpf ?? null));
  const [birth, setBirth] = useState(formatBirthDate(patient?.birth_date ?? null));
  const [sex, setSex] = useState<Patient['sex']>(patient?.sex ?? null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function save() {
    if (busy) return;
    setBusy(true); setError('');
    try {
      await onSave({ displayName: name, cpf, birthDate: parseBirthDate(birth), sex });
      onClose();
    } catch (e) { setError(patientError(e)); }
    finally { setBusy(false); }
  }

  return <Modal visible transparent animationType="fade" onRequestClose={() => { if (!busy) onClose(); }}>
    <View style={ui.backdrop}><View accessibilityViewIsModal style={ui.modal}>
      <ScrollView contentContainerStyle={{ gap: 12 }} keyboardShouldPersistTaps="handled">
        <Text style={ui.cardTitle}>{patient ? 'Corrigir paciente' : 'Novo paciente'}</Text>
        <Text style={ui.hint}>Nome (obrigatório)</Text>
        <TextInput accessibilityLabel="Nome do paciente" value={name} onChangeText={setName} maxLength={120} editable={!busy} style={ui.input} />
        <Text style={ui.hint}>CPF (opcional) — evita cadastrar a mesma pessoa duas vezes</Text>
        <TextInput accessibilityLabel="CPF" placeholder="000.000.000-00" keyboardType="number-pad" value={cpf} onChangeText={setCpf} maxLength={14} editable={!busy} style={ui.input} />
        <Text style={ui.hint}>Data de nascimento (opcional)</Text>
        <TextInput accessibilityLabel="Data de nascimento" placeholder="DD/MM/AAAA" keyboardType="number-pad" value={birth}
          onChangeText={text => setBirth(maskDate(text))} maxLength={10} editable={!busy} style={ui.input} />
        <Text style={ui.hint}>Sexo (opcional)</Text>
        <View style={ui.chips}>
          {sexes.map(option => <Pressable key={option.label} accessibilityRole="radio" accessibilityState={{ selected: sex === option.value, disabled: busy }}
            disabled={busy} onPress={() => setSex(option.value)} style={[ui.chip, sex === option.value && ui.activeChip]}>
            <Text style={ui.buttonText}>{option.label}</Text>
          </Pressable>)}
        </View>
        {!!error && <Text accessibilityRole="alert" style={ui.danger}>{error}</Text>}
        <Action title={busy ? 'Salvando…' : 'Salvar'} onPress={() => void save()} disabled={busy || !name.trim()} />
        <Action title="Cancelar" onPress={onClose} disabled={busy} />
      </ScrollView>
    </View></View>
  </Modal>;
}

// Inserts the slashes while typing: 01021980 -> 01/02/1980.
function maskDate(text: string) {
  const digits = text.replace(/\D/g, '').slice(0, 8);
  return [digits.slice(0, 2), digits.slice(2, 4), digits.slice(4)].filter(Boolean).join('/');
}
