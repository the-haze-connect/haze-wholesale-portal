'use client';

import { usePathname, useRouter } from 'next/navigation';
import { useState } from 'react';

/**
 * Reps (their shops) and admins (any account) choose which shop they're ordering for;
 * prices follow that shop's tier. Long lists get a type-to-search box.
 */
export function RepAccountPicker({ accounts, selected, admin = false }: { accounts: { id: number; name: string }[]; selected: number | null; admin?: boolean }) {
  const router = useRouter();
  const path = usePathname();
  const go = (id: number | null) => router.push(id ? `${path}?for=${id}` : path);
  const current = accounts.find(a => a.id === selected);
  const [text, setText] = useState(current?.name ?? '');
  const searchable = accounts.length > 40;

  return (
    <div className="behalf" role="region" aria-label="Ordering for">
      <label htmlFor="rep-for" style={{ fontWeight: 700 }}>Ordering for</label>
      {searchable ? (
        <>
          <input id="rep-for" list="rep-for-list" value={text} placeholder="Type a shop name"
            onChange={e => {
              setText(e.target.value);
              const hit = accounts.find(a => a.name.toLowerCase() === e.target.value.trim().toLowerCase());
              if (hit) go(hit.id);
            }}
            style={{ font: 'inherit', minHeight: 40, borderRadius: 10, border: '1px solid #F3C98F', padding: '0 10px', background: '#fff', minWidth: 260 }} />
          <datalist id="rep-for-list">{accounts.map(a => <option key={a.id} value={a.name} />)}</datalist>
          {selected && <button type="button" className="btn btn-ghost btn-sm" onClick={() => { setText(''); go(null); }}>Clear</button>}
        </>
      ) : (
        <select id="rep-for" value={selected ?? ''} onChange={e => go(e.target.value ? Number(e.target.value) : null)}
          style={{ font: 'inherit', minHeight: 40, borderRadius: 10, border: '1px solid #F3C98F', padding: '0 10px', background: '#fff', minWidth: 240 }}>
          <option value="">{admin ? 'Choose an account' : 'Choose one of your shops'}</option>
          {accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
        </select>
      )}
      <span style={{ fontWeight: 500 }}>
        {selected
          ? (admin ? 'Prices follow this account’s tier. Commission goes to the account’s rep.' : 'Orders you place are credited to you.')
          : admin ? `${accounts.length} active accounts.` : `${accounts.length} shops assigned to you.`}
      </span>
    </div>
  );
}
