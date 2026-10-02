'use client';

import { useRouter } from 'next/navigation';

/** Reps choose which of their shops they're ordering for; prices follow that shop's tier. */
export function RepAccountPicker({ accounts, selected }: { accounts: { id: number; name: string }[]; selected: number | null }) {
  const router = useRouter();
  return (
    <div className="behalf" role="region" aria-label="Ordering for">
      <label htmlFor="rep-for" style={{ fontWeight: 700 }}>Ordering for</label>
      <select id="rep-for" value={selected ?? ''} onChange={e => router.push(e.target.value ? `/?for=${e.target.value}` : '/')}
        style={{ font: 'inherit', minHeight: 40, borderRadius: 10, border: '1px solid #F3C98F', padding: '0 10px', background: '#fff', minWidth: 240 }}>
        <option value="">Choose one of your shops</option>
        {accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
      </select>
      <span style={{ fontWeight: 500 }}>{selected ? 'Orders you place are credited to you.' : `${accounts.length} shops assigned to you.`}</span>
    </div>
  );
}
