import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { ActivityIndicator, FlatList, Modal, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Action, styles as ui } from '@/features/modules/ui';
import { DoctorProfileForm } from './DoctorProfileForm';
import { createPrescriptionService, formatPrescriptionDate, MAX_ITEMS, prescriptionError,
  type DoctorProfile, type Prescription, type PrescriptionItem } from './service';
import { printPrescription, sharePrescriptionPdf } from './share-prescription';

type Props = { patientId: string; accessToken: string; header: ReactNode };
const emptyItem = (): PrescriptionItem => ({ medication: '', dosage: '', quantity: '' });

// "Receitas" tab of the patient (docs/prescriptions.md): one card per prescription, most recent first.
// A prescription is never changed or deleted; "Repetir" opens a new one with the same items.
export function Prescriptions({ patientId, accessToken, header }: Props) {
  const service = useMemo(() => createPrescriptionService(accessToken), [accessToken]);
  const [prescriptions, setPrescriptions] = useState<Prescription[]>([]);
  // undefined: not loaded yet; null: the doctor has no profile.
  const [profile, setProfile] = useState<DoctorProfile | null | undefined>(undefined);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [editingProfile, setEditingProfile] = useState(false);
  // Items of the prescription being written (empty or repeated), or null when the editor is closed.
  const [draft, setDraft] = useState<{ items: PrescriptionItem[]; notes: string } | null>(null);
  const [opened, setOpened] = useState<Prescription | null>(null);

  const load = useCallback(() => Promise.all([service.list(patientId), service.getProfile()])
    .then(([rows, row]) => { setPrescriptions(rows); setProfile(row); setError(''); })
    .catch(e => setError(prescriptionError(e)))
    .finally(() => setLoading(false)), [patientId, service]);
  useEffect(() => { void load(); }, [load]);

  // The first prescription asks for the doctor's data before the editor opens.
  function startPrescription(items: PrescriptionItem[] = [emptyItem()], notes = '') {
    setOpened(null);
    setDraft({ items, notes });
    if (profile === null) setEditingProfile(true);
  }

  const listHeader = <View style={ui.header}>
    {header}
    <Action title="+ Nova receita" onPress={() => startPrescription()} disabled={profile === undefined} />
    {profile !== undefined && <Action title={profile ? 'Meus dados na receita' : 'Cadastrar meus dados na receita'}
      onPress={() => { setDraft(null); setEditingProfile(true); }} />}
    {!!error && <Text accessibilityRole="alert" style={ui.danger}>{error}</Text>}
  </View>;

  return <SafeAreaView style={ui.screen}>
    <FlatList data={prescriptions} keyExtractor={item => item.id} contentContainerStyle={ui.content}
      ListHeaderComponent={listHeader}
      ListEmptyComponent={loading ? <ActivityIndicator accessibilityLabel="Carregando receitas" /> : <Text style={ui.empty}>Nenhuma receita ainda.</Text>}
      renderItem={({ item }) => <Pressable accessibilityRole="button" accessibilityHint="Abre a receita para imprimir, compartilhar ou repetir"
        onPress={() => setOpened(item)} style={({ pressed }) => [ui.card, pressed && ui.dim]}>
        <Text style={ui.hint}>{formatPrescriptionDate(item.created_at)}</Text>
        <Text style={ui.subtitle}>{item.items.map(row => row.medication).join('\n')}</Text>
      </Pressable>} />
    {editingProfile && <DoctorProfileForm profile={profile ?? null} onClose={() => setEditingProfile(false)}
      onSave={async next => { await service.saveProfile(next); setProfile(next); }} />}
    {/* Without a profile (first prescription, form cancelled) the editor stays closed. */}
    {draft && profile && !editingProfile && <PrescriptionEditor initial={draft} onClose={() => setDraft(null)} onSave={async (items, notes) => {
      const created = await service.create(patientId, items, notes);
      await load();
      setOpened(created);
    }} />}
    {opened && <PrescriptionView prescription={opened} onClose={() => setOpened(null)}
      onRepeat={() => startPrescription(opened.items.map(item => ({ ...item })), opened.notes ?? '')} />}
  </SafeAreaView>;
}

function PrescriptionEditor({ initial, onClose, onSave }: {
  initial: { items: PrescriptionItem[]; notes: string }; onClose: () => void;
  onSave: (items: PrescriptionItem[], notes: string) => Promise<void>;
}) {
  const [items, setItems] = useState(initial.items);
  const [notes, setNotes] = useState(initial.notes);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const filled = items.filter(item => item.medication.trim());
  const incomplete = filled.some(item => !item.dosage.trim());

  async function save() {
    if (busy) return;
    setBusy(true); setError('');
    try { await onSave(items, notes); onClose(); }
    catch (e) { setError(prescriptionError(e)); }
    finally { setBusy(false); }
  }

  const change = (index: number, field: keyof PrescriptionItem, text: string) =>
    setItems(current => current.map((item, i) => i === index ? { ...item, [field]: text } : item));

  return <Modal visible transparent animationType="fade" onRequestClose={() => { if (!busy) onClose(); }}>
    <View style={ui.backdrop}><View accessibilityViewIsModal style={ui.modal}>
      <ScrollView contentContainerStyle={{ gap: 12 }} keyboardShouldPersistTaps="handled">
        <Text style={ui.cardTitle}>Nova receita</Text>
        <Text style={ui.hint}>Só medicamentos comuns. Depois de gerada, a receita não muda: para alterar, use “Repetir”.</Text>
        {items.map((item, index) => <View key={index} style={[ui.card, { borderWidth: 1, borderColor: '#ECECF4', padding: 12 }]}>
          <Text style={ui.hint}>Medicamento {index + 1}</Text>
          <TextInput accessibilityLabel={`Medicamento ${index + 1}`} placeholder="Ex.: Amoxicilina 500 mg" value={item.medication}
            onChangeText={text => change(index, 'medication', text)} maxLength={200} editable={!busy} style={ui.input} />
          <TextInput accessibilityLabel={`Posologia do medicamento ${index + 1}`} placeholder="Ex.: 1 cápsula de 8/8 h por 7 dias"
            value={item.dosage} onChangeText={text => change(index, 'dosage', text)} maxLength={500} multiline editable={!busy}
            textAlignVertical="top" style={[ui.input, { minHeight: 64 }]} />
          <TextInput accessibilityLabel={`Quantidade do medicamento ${index + 1}`} placeholder="Quantidade (opcional). Ex.: 21 cápsulas"
            value={item.quantity} onChangeText={text => change(index, 'quantity', text)} maxLength={100} editable={!busy} style={ui.input} />
          {items.length > 1 && <Action title="Remover medicamento" danger disabled={busy}
            onPress={() => setItems(current => current.filter((_, i) => i !== index))} />}
        </View>)}
        {items.length < MAX_ITEMS && <Action title="+ Adicionar medicamento" disabled={busy}
          onPress={() => setItems(current => [...current, emptyItem()])} />}
        <Text style={ui.hint}>Observações (opcional)</Text>
        <TextInput accessibilityLabel="Observações" placeholder="Ex.: retorno em 7 dias" value={notes} onChangeText={setNotes}
          maxLength={2000} multiline editable={!busy} textAlignVertical="top" style={[ui.input, { minHeight: 64 }]} />
        {incomplete && <Text style={ui.hint}>Cada medicamento precisa da posologia.</Text>}
        {!!error && <Text accessibilityRole="alert" style={ui.danger}>{error}</Text>}
        <Action title={busy ? 'Gerando…' : 'Gerar receita'} onPress={() => void save()} disabled={busy || !filled.length || incomplete} />
        <Action title="Cancelar" onPress={onClose} disabled={busy} />
      </ScrollView>
    </View></View>
  </Modal>;
}

function PrescriptionView({ prescription, onClose, onRepeat }: { prescription: Prescription; onClose: () => void; onRepeat: () => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function run(action: () => Promise<unknown>) {
    if (busy) return;
    setBusy(true); setError('');
    try { await action(); }
    catch (e) { setError(prescriptionError(e)); }
    finally { setBusy(false); }
  }

  return <Modal visible transparent animationType="fade" onRequestClose={() => { if (!busy) onClose(); }}>
    <View style={ui.backdrop}><View accessibilityViewIsModal style={ui.modal}>
      <ScrollView contentContainerStyle={{ gap: 12 }}>
        <Text style={ui.cardTitle}>Receita de {formatPrescriptionDate(prescription.created_at)}</Text>
        {prescription.items.map((item, index) => <View key={index} style={{ gap: 2 }}>
          <Text style={ui.subtitle}><Text style={{ fontWeight: '600' }}>{index + 1}. {item.medication}</Text>{item.quantity ? ` — ${item.quantity}` : ''}</Text>
          <Text style={ui.hint}>{item.dosage}</Text>
        </View>)}
        {!!prescription.notes && <Text style={ui.hint}>Observações: {prescription.notes}</Text>}
        <Text style={ui.hint}>Imprima e assine à mão. Vale só para medicamentos comuns.</Text>
        {!!error && <Text accessibilityRole="alert" style={ui.danger}>{error}</Text>}
        <Action title="Imprimir" disabled={busy} onPress={() => void run(() => printPrescription(prescription))} />
        <Action title={busy ? 'Preparando…' : 'Compartilhar PDF'} disabled={busy} onPress={() => void run(() => sharePrescriptionPdf(prescription))} />
        <Action title="Repetir" disabled={busy} onPress={onRepeat} />
        <Action title="Fechar" disabled={busy} onPress={onClose} />
      </ScrollView>
    </View></View>
  </Modal>;
}
