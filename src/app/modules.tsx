import { useAuth } from '@/providers/auth-provider';
import { ModulesScreen } from '@/features/modules/ModulesScreen';

export default function Modules() {
  const { session } = useAuth();
  if (!session) return null;
  // A different account must never inherit the previous account's module state.
  return <ModulesScreen key={session.user.id} accessToken={session.access_token} />;
}
