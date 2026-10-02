'use client';

import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { CartBadge } from './cart';
import { PREVIEW_LEVELS } from './format';

function useLevelQuery() {
  const sp = useSearchParams();
  const level = sp.get('level');
  return level && level !== 'Base' ? `?level=${encodeURIComponent(level)}` : '';
}

export function Header() {
  const path = usePathname();
  const q = useLevelQuery();
  const links = [['/', 'Home'], ['/quick-order', 'Quick order'], ['/cart', 'Cart']] as const;
  return (
    <header className="top">
      <div className="wrap">
        <Link className="brand" href={`/${q}`}><b>The Haze Connect</b><span className="chip-w">Wholesale</span></Link>
        <nav className="nav" aria-label="Main">
          {links.map(([href, label]) => (
            <Link key={href} href={`${href}${q}`} aria-current={path === href ? 'page' : undefined}>{label}</Link>
          ))}
        </nav>
        <div className="tools">
          <Link className="icon-btn" href={`/cart${q}`} aria-label="Cart">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M3 4h2l2.4 11.2a1 1 0 0 0 1 .8h9.2a1 1 0 0 0 1-.8L20 8H6.2" /><circle cx="9" cy="20" r="1.3" /><circle cx="17" cy="20" r="1.3" /></svg>
            <CartBadge />
          </Link>
        </div>
      </div>
    </header>
  );
}

/** Lets you preview prices at any tier until sign-in assigns the account's real tier. */
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
