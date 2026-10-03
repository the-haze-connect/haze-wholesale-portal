'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

export function AdminTabs({ counts }: { counts: { waiting: number; earned: number; requests: number } }) {
  const path = usePathname();
  const tabs: [string, string, number?][] = [
    ['/orders', 'Orders', counts.waiting],
    ['/admin/requests', 'Requests', counts.requests],
    ['/admin/announcements', 'Announcements'],
    ['/admin/products', 'Products'],
    ['/admin/accounts', 'Accounts'],
    ['/admin/commissions', 'Commissions', counts.earned],
    ['/admin/health', 'Data health'],
    ['/invites', 'Invites'],
  ];
  return (
    <nav className="subnav" aria-label="Admin">
      {tabs.map(([href, label, n]) => (
        <Link key={href} href={href} aria-current={path === href || path.startsWith(`${href}/`) ? 'page' : undefined}>
          {label}{n ? <span className="count">{n}</span> : null}
        </Link>
      ))}
    </nav>
  );
}
