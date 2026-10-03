'use client';

import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { CartBadge } from './cart';
import { PREVIEW_LEVELS } from './format';

export interface Who {
  role: 'BUYER' | 'VIEW_ONLY' | 'REP' | 'ADMIN';
  label: string;
  initials: string;
}

const NAV: Record<Who['role'], [string, string][]> = {
  BUYER: [['/', 'Home'], ['/quick-order', 'Quick order'], ['/orders', 'Orders'], ['/cart', 'Cart']],
  VIEW_ONLY: [['/', 'Home'], ['/quick-order', 'Inventory list'], ['/orders', 'Orders']],
  REP: [['/', 'Shop'], ['/quick-order', 'Quick order'], ['/orders', 'Orders'], ['/commissions', 'Commissions'], ['/invites', 'Invites'], ['/cart', 'Cart']],
  ADMIN: [['/', 'Home'], ['/quick-order', 'Quick order'], ['/orders', 'Orders'], ['/admin/announcements', 'Admin'], ['/cart', 'Cart']],
};

/** Keeps the admin's preview tier (?level=) when moving between pages. */
function useCarry() {
  const sp = useSearchParams();
  const keep = new URLSearchParams();
  for (const k of ['level', 'for']) { const v = sp.get(k); if (v) keep.set(k, v); }
  const s = keep.toString();
  return s ? `?${s}` : '';
}

export function Header({ who }: { who: Who }) {
  const path = usePathname();
  const q = useCarry();
  const canBuy = who.role !== 'VIEW_ONLY';
  return (
    <header className="top">
      <div className="wrap">
        <Link className="brand" href={`/${q}`}><b>The Haze Connect</b><span className="chip-w">{who.role === 'ADMIN' ? 'Admin' : who.role === 'REP' ? 'Rep' : 'Wholesale'}</span></Link>
        <nav className="nav" aria-label="Main">
          {NAV[who.role].map(([href, label]) => (
            <Link key={href} href={`${href}${q}`} aria-current={path === href || (href !== '/' && path.startsWith(`${href}/`)) || (href === '/admin/announcements' && (path.startsWith('/admin') || path === '/invites')) ? 'page' : undefined}>{label}</Link>
          ))}
        </nav>
        <div className="tools">
          {canBuy && (
            <Link className="icon-btn" href={`/cart${q}`} aria-label="Cart">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M3 4h2l2.4 11.2a1 1 0 0 0 1 .8h9.2a1 1 0 0 0 1-.8L20 8H6.2" /><circle cx="9" cy="20" r="1.3" /><circle cx="17" cy="20" r="1.3" /></svg>
              <CartBadge />
            </Link>
          )}
          <span className="who" title={who.label}>{who.label}</span>
          <form action="/auth/logout" method="post">
            <button className="btn btn-sm signout" type="submit">Sign out</button>
          </form>
        </div>
      </div>
    </header>
  );
}

/** Admin only: preview any tier's prices. */
export function PreviewStrip() {
  const path = usePathname();
  const sp = useSearchParams();
  const current = sp.get('level') ?? 'Base';
  return (
    <div className="preview" role="region" aria-label="Pricing preview">
      <div className="wrap">
        <strong>Preview prices as</strong>
        {PREVIEW_LEVELS.map(l => (
          <Link key={l} href={l === 'Base' ? path : `${path}?level=${encodeURIComponent(l)}`} aria-current={current === l ? 'true' : undefined}>{l}</Link>
        ))}
      </div>
    </div>
  );
}
