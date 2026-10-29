import { useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '@/providers/auth-provider';
import { DocumentsScreen } from '@/features/documents/DocumentsScreen';
import { styles as ui } from '@/features/modules/ui';
import { PatientHeader } from '@/features/patients/PatientHeader';
import { PatientNotes } from '@/features/patients/PatientNotes';
import { Prescriptions } from '@/features/prescriptions/Prescriptions';

type Tab = 'details' | 'notes' | 'prescriptions' | 'exams';
const tabs: { value: Tab; label: string }[] = [
  { value: 'details', label: 'Dados' }, { value: 'notes', label: 'Anamnese' },
  { value: 'prescriptions', label: 'Receitas' }, { value: 'exams', label: 'Exames' },
];

export default function Patient() {
  const { session } = useAuth();
  const { patientId } = useLocalSearchParams<{ patientId: string }>();
  // The anamnesis opens first, like the paper record the doctor picks up (docs/anamnesis.md).
  const [tab, setTab] = useState<Tab>('notes');
  if (!session || typeof patientId !== 'string') return null;
  const header = <>
    <PatientHeader patientId={patientId} accessToken={session.access_token} details={tab === 'details'} />
    <View accessibilityRole="tablist" style={ui.chips}>
      {tabs.map(option => <Pressable key={option.value} accessibilityRole="tab" accessibilityState={{ selected: tab === option.value }}
        onPress={() => setTab(option.value)} style={[ui.chip, tab === option.value && ui.activeChip]}>
        <Text style={ui.buttonText}>{option.label}</Text>
      </Pressable>)}
    </View>
  </>;
  // A different account or patient must never inherit the previous list or modal state.
  const key = `${session.user.id}:${patientId}`;
  if (tab === 'details') return <SafeAreaView style={ui.screen}><ScrollView contentContainerStyle={ui.content}>{header}</ScrollView></SafeAreaView>;
  if (tab === 'notes') return <PatientNotes key={key} patientId={patientId} accessToken={session.access_token} header={header} />;
  if (tab === 'prescriptions') return <Prescriptions key={key} patientId={patientId} accessToken={session.access_token} header={header} />;
  return <DocumentsScreen key={key} userId={session.user.id} accessToken={session.access_token} patientId={patientId} header={header} />;
}
