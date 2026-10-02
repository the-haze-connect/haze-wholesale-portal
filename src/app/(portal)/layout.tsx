import { Suspense } from 'react';
import { Header, PreviewStrip } from '@/components/chrome';
import { requireUser } from '@/lib/session';

export const dynamic = 'force-dynamic';

export default async function PortalLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  const who = {
    role: user.role,
    label: user.role === 'ADMIN' ? 'Admin' : user.role === 'REP' ? 'Rep' : user.account?.name ?? user.email,
    initials: (user.name ?? user.email).split(/[\s@.]+/).filter(Boolean).slice(0, 2).map(s => s[0]!.toUpperCase()).join(''),
  };
  return (
    <>
      {user.role === 'ADMIN' && <Suspense fallback={null}><PreviewStrip /></Suspense>}
      <Suspense fallback={<header className="top" />}><Header who={who} /></Suspense>
      {children}
    </>
  );
}
