import { useLocalSearchParams } from 'expo-router';
import { useAuth } from '@/providers/auth-provider';
import { DocumentsScreen } from '@/features/documents/DocumentsScreen';
import { PatientHeader } from '@/features/patients/PatientHeader';

export default function Patient() {
  const { session } = useAuth();
  const { patientId } = useLocalSearchParams<{ patientId: string }>();
  if (!session || typeof patientId !== 'string') return null;
  // A different account or patient must never inherit the previous list or modal state.
  return <DocumentsScreen key={`${session.user.id}:${patientId}`} userId={session.user.id} accessToken={session.access_token}
    patientId={patientId} header={<PatientHeader patientId={patientId} accessToken={session.access_token} />} />;
}
