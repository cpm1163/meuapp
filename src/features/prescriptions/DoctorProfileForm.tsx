import { useState } from 'react';
import { Modal, ScrollView, Switch, Text, TextInput, View } from 'react-native';
import { Action, styles as ui } from '@/features/modules/ui';
import { FIELD_LABELS, OPTIONAL_FIELDS, prescriptionError, UFS, type DoctorProfile, type OptionalField } from './service';

type Props = { profile: DoctorProfile | null; onClose: () => void; onSave: (profile: DoctorProfile) => Promise<void> };
const placeholders: Record<OptionalField, string> = {
  specialty: 'Ex.: Clínica médica', rqe: 'Número do RQE', address: 'Rua, número, cidade', phone: '(11) 99999-0000', email: 'nome@exemplo.com',
};

// The doctor's data for the prescription header (docs/prescriptions.md). Name and CRM/UF always go on it;
// each other field has its own "sair na receita" switch.
export function DoctorProfileForm({ profile, onClose, onSave }: Props) {
  const [name, setName] = useState(profile?.full_name ?? '');
  const [crm, setCrm] = useState(profile?.crm ?? '');
  const [uf, setUf] = useState(profile?.crm_uf ?? '');
  const [values, setValues] = useState<Record<OptionalField, string>>(
    Object.fromEntries(OPTIONAL_FIELDS.map(field => [field, profile?.[field] ?? ''])) as Record<OptionalField, string>);
  // A first profile prints every field the doctor fills in.
  const [printed, setPrinted] = useState<Set<OptionalField>>(new Set(profile ? profile.printed : OPTIONAL_FIELDS));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function save() {
    if (busy) return;
    const state = uf.trim().toUpperCase();
    if (!UFS.includes(state)) { setError('Informe a UF do CRM com duas letras, por exemplo SP.'); return; }
    setBusy(true); setError('');
    try {
      await onSave({ full_name: name, crm, crm_uf: state, ...values,
        printed: OPTIONAL_FIELDS.filter(field => printed.has(field) && values[field].trim()) });
      onClose();
    } catch (e) { setError(prescriptionError(e)); }
    finally { setBusy(false); }
  }

  function toggle(field: OptionalField, on: boolean) {
    setPrinted(current => { const next = new Set(current); if (on) next.add(field); else next.delete(field); return next; });
  }

  return <Modal visible transparent animationType="fade" onRequestClose={() => { if (!busy) onClose(); }}>
    <View style={ui.backdrop}><View accessibilityViewIsModal style={ui.modal}>
      <ScrollView contentContainerStyle={{ gap: 12 }} keyboardShouldPersistTaps="handled">
        <Text style={ui.cardTitle}>Meus dados na receita</Text>
        <Text style={ui.hint}>Nome e CRM saem sempre na receita. Os outros dados saem só se você deixar ligado.</Text>
        <Text style={ui.hint}>Nome (obrigatório)</Text>
        <TextInput accessibilityLabel="Nome do médico" placeholder="Ex.: Dra. Maria Souza" value={name} onChangeText={setName}
          maxLength={120} editable={!busy} style={ui.input} />
        <View style={ui.actions}>
          <View style={{ flex: 1, gap: 6 }}>
            <Text style={ui.hint}>CRM (obrigatório)</Text>
            <TextInput accessibilityLabel="Número do CRM" keyboardType="number-pad" value={crm} onChangeText={setCrm} maxLength={12}
              editable={!busy} style={ui.input} />
          </View>
          <View style={{ width: 80, gap: 6 }}>
            <Text style={ui.hint}>UF</Text>
            <TextInput accessibilityLabel="UF do CRM" placeholder="SP" autoCapitalize="characters" value={uf}
              onChangeText={text => setUf(text.replace(/[^a-zA-Z]/g, '').toUpperCase())} maxLength={2} editable={!busy} style={ui.input} />
          </View>
        </View>
        {OPTIONAL_FIELDS.map(field => <View key={field} style={{ gap: 6 }}>
          <View style={[ui.actions, { justifyContent: 'space-between' }]}>
            <Text style={ui.hint}>{FIELD_LABELS[field]} (opcional)</Text>
            <View style={ui.actions}>
              <Text style={ui.hint}>Sair na receita</Text>
              <Switch accessibilityLabel={`${FIELD_LABELS[field]} sai na receita`} value={printed.has(field)}
                onValueChange={on => toggle(field, on)} disabled={busy} />
            </View>
          </View>
          <TextInput accessibilityLabel={FIELD_LABELS[field]} placeholder={placeholders[field]} value={values[field]}
            onChangeText={text => setValues(current => ({ ...current, [field]: text }))}
            keyboardType={field === 'phone' ? 'phone-pad' : field === 'email' ? 'email-address' : 'default'}
            autoCapitalize={field === 'email' ? 'none' : 'sentences'} maxLength={{ address: 300, rqe: 20, phone: 40 }[field as string] ?? 120}
            editable={!busy} style={ui.input} />
        </View>)}
        {!!error && <Text accessibilityRole="alert" style={ui.danger}>{error}</Text>}
        <Action title={busy ? 'Salvando…' : 'Salvar'} onPress={() => void save()} disabled={busy || !name.trim() || !crm.trim() || !uf.trim()} />
        <Action title="Cancelar" onPress={onClose} disabled={busy} />
      </ScrollView>
    </View></View>
  </Modal>;
}
