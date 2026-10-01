import { useAuth } from '@/providers/auth-provider';
import { DocumentsScreen } from '@/features/documents/DocumentsScreen';

export default function Documents() {
  const { session } = useAuth();
  if (!session) return null;
  // A different account must never inherit the previous account's list or modal state.
  return <DocumentsScreen key={session.user.id} userId={session.user.id} accessToken={session.access_token} />;
}
