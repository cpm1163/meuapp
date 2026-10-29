import { useAuth } from '@/providers/auth-provider';
import { AlertsScreen } from '@/features/alerts/AlertsScreen';

export default function Alerts() {
  const { session } = useAuth();
  if (!session) return null;
  // A different account must never inherit the previous account's alerts or selection.
  return <AlertsScreen key={session.user.id} accessToken={session.access_token} />;
}
