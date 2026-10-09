import { useLocalSearchParams } from 'expo-router';
import { useAuth } from '@/providers/auth-provider';
import { DocumentsScreen } from '@/features/documents/DocumentsScreen';

export default function Documents() {
  const { session } = useAuth();
  const { scope } = useLocalSearchParams<{ scope?: string }>();
  if (!session) return null;
  const initialScope = scope === 'shared' || scope === 'unassigned' ? scope : 'mine';
  // A different account must never inherit the previous account's list or modal state.
  return <DocumentsScreen key={`${session.user.id}:${initialScope}`} initialScope={initialScope} userId={session.user.id} accessToken={session.access_token} />;
}
