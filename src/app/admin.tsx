import { useAuth } from '@/providers/auth-provider';
import { AdminScreen } from '@/features/modules/AdminScreen';

export default function Admin() {
  const { session } = useAuth();
  if (!session) return null;
  // The screen checks the admin role for display; the database enforces it on every operation.
  return <AdminScreen key={session.user.id} userId={session.user.id} accessToken={session.access_token} />;
}
