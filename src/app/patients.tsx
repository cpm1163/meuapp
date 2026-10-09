import { useAuth } from '@/providers/auth-provider';
import { PatientsScreen } from '@/features/patients/PatientsScreen';

export default function Patients() {
  const { session } = useAuth();
  if (!session) return null;
  // A different account must never inherit the previous account's list.
  return <PatientsScreen key={session.user.id} accessToken={session.access_token} />;
}
