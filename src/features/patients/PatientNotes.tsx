import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { ActivityIndicator, FlatList, Modal, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Action, styles as ui } from '@/features/modules/ui';
import { createPatientService, formatNoteDate, NOTE_MAX_LENGTH, patientError, type PatientNote } from './service';

type Props = { patientId: string; accessToken: string; header: ReactNode };

// "Ficha" tab of the patient (docs/anamnesis.md): one card per note, most recent first, like the paper record.
// Tapping a card corrects it; there is no delete.
export function PatientNotes({ patientId, accessToken, header }: Props) {
  const service = useMemo(() => createPatientService(accessToken), [accessToken]);
  const [notes, setNotes] = useState<PatientNote[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  // null: editor closed; 'new': new note; otherwise the note being corrected.
  const [editing, setEditing] = useState<PatientNote | 'new' | null>(null);

  const load = useCallback(() => service.listNotes(patientId)
    .then(rows => { setNotes(rows); setError(''); })
    .catch(e => setError(patientError(e)))
    .finally(() => setLoading(false)), [patientId, service]);
  useEffect(() => { void load(); }, [load]);

  const listHeader = <View style={ui.header}>
    {header}
    <Action title="+ Nova anotação" onPress={() => setEditing('new')} />
    {!!error && <Text accessibilityRole="alert" style={ui.danger}>{error}</Text>}
  </View>;

  return <SafeAreaView style={ui.screen}>
    <FlatList data={notes} keyExtractor={note => note.id} contentContainerStyle={ui.content}
      ListHeaderComponent={listHeader}
      ListEmptyComponent={loading ? <ActivityIndicator accessibilityLabel="Carregando ficha" /> : <Text style={ui.empty}>Nenhuma anotação ainda.</Text>}
      renderItem={({ item }) => <Pressable accessibilityRole="button" accessibilityHint="Abre a anotação para corrigir"
        onPress={() => setEditing(item)} style={({ pressed }) => [ui.card, pressed && ui.dim]}>
        <Text style={ui.hint}>{formatNoteDate(item.created_at)}</Text>
        <Text style={ui.subtitle}>{item.body}</Text>
      </Pressable>} />
    {editing && <NoteEditor note={editing === 'new' ? null : editing} onClose={() => setEditing(null)} onSave={async body => {
      if (editing === 'new') await service.createNote(patientId, body);
      else await service.updateNote(editing.id, body);
      await load();
    }} />}
  </SafeAreaView>;
}

function NoteEditor({ note, onClose, onSave }: { note: PatientNote | null; onClose: () => void; onSave: (body: string) => Promise<void> }) {
  const [body, setBody] = useState(note?.body ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function save() {
    if (busy) return;
    setBusy(true); setError('');
    try { await onSave(body); onClose(); }
    catch (e) { setError(patientError(e)); }
    finally { setBusy(false); }
  }

  return <Modal visible transparent animationType="fade" onRequestClose={() => { if (!busy) onClose(); }}>
    <View style={ui.backdrop}><View accessibilityViewIsModal style={ui.modal}>
      <ScrollView contentContainerStyle={{ gap: 12 }} keyboardShouldPersistTaps="handled">
        <Text style={ui.cardTitle}>{note ? `Corrigir anotação de ${formatNoteDate(note.created_at)}` : 'Nova anotação'}</Text>
        <Text style={ui.hint}>Para ditar, toque no microfone do teclado.{note ? ' Só o texto corrigido fica guardado.' : ''}</Text>
        <TextInput accessibilityLabel="Texto da anotação" value={body} onChangeText={setBody} multiline
          placeholder="Ex.: queixas, doenças, medicamentos em uso, alergias, peso…" maxLength={NOTE_MAX_LENGTH} editable={!busy}
          textAlignVertical="top" style={[ui.input, { minHeight: 200 }]} />
        {!!error && <Text accessibilityRole="alert" style={ui.danger}>{error}</Text>}
        <Action title={busy ? 'Salvando…' : 'Salvar'} onPress={() => void save()} disabled={busy || !body.trim() || body === note?.body} />
        <Action title="Cancelar" onPress={onClose} disabled={busy} />
      </ScrollView>
    </View></View>
  </Modal>;
}
