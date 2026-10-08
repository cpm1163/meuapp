import { useLocalSearchParams } from 'expo-router';
import { useAuth } from '@/providers/auth-provider';
import { AnalysisScreen } from '@/features/analyses/AnalysisScreen';

export default function Analysis() {
  const { session } = useAuth();
  const { documentId } = useLocalSearchParams<{ documentId: string }>();
  if (!session || typeof documentId !== 'string') return null;
  // A different account or document must never inherit the previous analysis state.
  return <AnalysisScreen key={`${session.user.id}:${documentId}`} documentId={documentId} accessToken={session.access_token} />;
}
