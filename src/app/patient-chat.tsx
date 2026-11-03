import { useAuth } from '@/providers/auth-provider';
import { PatientChatScreen } from '@/features/patient-chat/PatientChatScreen';

export default function PatientChat() {
  const { session } = useAuth();
  if (!session) return null;
  // A different account must never inherit the previous account's question or reply.
  return <PatientChatScreen key={session.user.id} accessToken={session.access_token} />;
}
