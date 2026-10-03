import { requireUser } from '@/lib/session';
import { AdminNav } from './nav';

export const dynamic = 'force-dynamic';

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  await requireUser(['ADMIN']);
  return <><AdminNav />{children}</>;
}
