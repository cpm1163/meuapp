import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { useAuth } from '@/providers/auth-provider';
import { DocumentsScreen } from '@/features/documents/DocumentsScreen';
import { styles as ui } from '@/features/modules/ui';
import { PatientHeader } from '@/features/patients/PatientHeader';
import { PatientNotes } from '@/features/patients/PatientNotes';
import { Prescriptions } from '@/features/prescriptions/Prescriptions';

type Tab = 'notes' | 'documents' | 'prescriptions';
const tabs: { value: Tab; label: string }[] = [
  { value: 'notes', label: 'Ficha' }, { value: 'documents', label: 'Documentos' }, { value: 'prescriptions', label: 'Receitas' },
];

export default function Patient() {
  const { session } = useAuth();
  const { patientId } = useLocalSearchParams<{ patientId: string }>();
  // The record opens first, like the paper record the doctor picks up (docs/anamnesis.md).
  const [tab, setTab] = useState<Tab>('notes');
  if (!session || typeof patientId !== 'string') return null;
  const header = <>
    <PatientHeader patientId={patientId} accessToken={session.access_token} />
    <View accessibilityRole="tablist" style={ui.chips}>
      {tabs.map(option => <Pressable key={option.value} accessibilityRole="tab" accessibilityState={{ selected: tab === option.value }}
        onPress={() => setTab(option.value)} style={[ui.chip, tab === option.value && ui.activeChip]}>
        <Text style={ui.buttonText}>{option.label}</Text>
      </Pressable>)}
    </View>
  </>;
  // A different account or patient must never inherit the previous list or modal state.
  const key = `${session.user.id}:${patientId}`;
  if (tab === 'notes') return <PatientNotes key={key} patientId={patientId} accessToken={session.access_token} header={header} />;
  if (tab === 'prescriptions') return <Prescriptions key={key} patientId={patientId} accessToken={session.access_token} header={header} />;
  return <DocumentsScreen key={key} userId={session.user.id} accessToken={session.access_token} patientId={patientId} header={header} />;
}
