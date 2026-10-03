'use client';

import { useActionState, useState } from 'react';
import { approve, decline, retryLead, type ReviewResult } from './actions';

const Note = ({ s }: { s: ReviewResult | null }) => s ? (
  <>
    <p className={s.ok ? 'note-ok' : 'note-warn'} role="status">{s.message}</p>
    {s.warning && <p className="note-warn">{s.warning}</p>}
  </>
) : null;

export function ApproveForm({ requestId, hasLead, reps, levels, accounts, defaultRepId }: {
  requestId: number; hasLead: boolean;
  reps: { id: number; name: string }[]; levels: { id: number; name: string }[]; accounts: { id: number; name: string }[];
  defaultRepId: number | null;
}) {
  const [state, action, pending] = useActionState<ReviewResult | null, FormData>(approve, null);
  const [mode, setMode] = useState<'convert' | 'existing'>('convert');
  const [acctText, setAcctText] = useState('');
  const acct = accounts.find(a => a.name.toLowerCase() === acctText.trim().toLowerCase());
  if (state?.ok) return <Note s={state} />;
  return (
    <form action={action} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <input type="hidden" name="requestId" value={requestId} />
      <input type="hidden" name="mode" value={mode} />
      <div className="seg" role="group" aria-label="Approve as">
        <button type="button" aria-pressed={mode === 'convert'} onClick={() => setMode('convert')}>New customer</button>
        <button type="button" aria-pressed={mode === 'existing'} onClick={() => setMode('existing')}>Already a customer</button>
      </div>
      {mode === 'convert' ? (
        <>
          <p style={{ margin: 0, fontSize: 13.5, color: 'var(--ink-2)' }}>{hasLead ? 'Converts the Order Time lead to a customer' : 'Creates the Order Time lead and converts it to a customer'}, then sets the rep and price level below.</p>
          <div className="field">
            <label htmlFor="ap-rep">Rep</label>
            <select id="ap-rep" name="repId" defaultValue={defaultRepId ?? ''}>
              <option value="">House (no rep)</option>
              {reps.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
            </select>
          </div>
          <div className="field">
            <label htmlFor="ap-level">Price level</label>
            <select id="ap-level" name="priceLevelId" defaultValue="">
              <option value="">Base price</option>
              {levels.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
            </select>
          </div>
        </>
      ) : (
        <div className="field">
          <label htmlFor="ap-acct">Existing account</label>
          <input id="ap-acct" list="ap-acct-list" value={acctText} onChange={e => setAcctText(e.target.value)} placeholder="Type the shop name" />
          <datalist id="ap-acct-list">{accounts.map(a => <option key={a.id} value={a.name} />)}</datalist>
          <input type="hidden" name="accountId" value={acct?.id ?? ''} />
          <span className="hint">Gives this buyer a login at that account. The lead stays in Order Time; delete it there if it’s a duplicate.</span>
        </div>
      )}
      <button type="submit" className="btn btn-kush" disabled={pending || (mode === 'existing' && !acct)}>{pending ? 'Approving…' : 'Approve and send invite'}</button>
      <Note s={state} />
    </form>
  );
}

export function DeclineForm({ requestId }: { requestId: number }) {
  const [state, action, pending] = useActionState<ReviewResult | null, FormData>(decline, null);
  if (state?.ok) return <Note s={state} />;
  return (
    <form action={action} onSubmit={e => { if (!window.confirm('Decline this request?')) e.preventDefault(); }} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <input type="hidden" name="requestId" value={requestId} />
      <div className="field"><label htmlFor="dc-reason">Reason (optional, included in the email)</label><input id="dc-reason" name="reason" maxLength={500} /></div>
      <label className="check"><input type="checkbox" name="notify" defaultChecked /> Email them</label>
      <button type="submit" className="btn btn-ghost" disabled={pending}>{pending ? 'Declining…' : 'Decline'}</button>
      <Note s={state} />
    </form>
  );
}

export function RetryLeadButton({ requestId }: { requestId: number }) {
  const [state, action, pending] = useActionState<ReviewResult | null, FormData>(retryLead, null);
  return (
    <form action={action} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <input type="hidden" name="requestId" value={requestId} />
      <button type="submit" className="btn btn-ghost btn-sm" disabled={pending}>{pending ? 'Trying…' : 'Create lead in Order Time again'}</button>
      <Note s={state} />
    </form>
  );
}
