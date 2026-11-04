import type { MyModule } from '@/features/modules/service';

// Display only: the server authorizes every question. A draft or disabled module is refused there, so it offers no entry here.
export function canOpenPatientChat(item: Pick<MyModule, 'module_id' | 'module_status' | 'active' | 'terms_accepted'>) {
  return item.module_id === 'patient-chat' && item.active && item.terms_accepted
    && (item.module_status === 'testing' || item.module_status === 'active');
}
