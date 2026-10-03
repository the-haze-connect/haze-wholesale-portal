'use client';

import { useActionState } from 'react';
import { addAdjustment, payOutRep, type FormResult } from './actions';

export function PayoutForm({ repId, repName, earned }: { repId: number; repName: string; earned: number }) {
  const [state, action, pending] = useActionState<FormResult | null, FormData>(payOutRep, null);
  return (
    <form action={action} onSubmit={e => { if (!window.confirm(`Record a payout to ${repName}? This marks their earned commission as paid.`)) e.preventDefault(); }}
      style={{ display: 'flex', gap: 8, alignItems: 'flex-end', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
      <input type="hidden" name="repId" value={repId} />
      <div className="field" style={{ minWidth: 150 }}>
        <label htmlFor={`thru-${repId}`} style={{ fontSize: 12 }}>Through (optional)</label>
        <input id={`thru-${repId}`} type="date" name="through" style={{ minHeight: 36, padding: '4px 8px' }} />
      </div>
      <button className="btn btn-kush btn-sm" type="submit" disabled={pending || earned <= 0}>{pending ? 'Saving…' : 'Record payout'}</button>
      {state && <p className={state.ok ? 'note-ok' : 'note-warn'} role="status" style={{ flexBasis: '100%' }}>{state.message}</p>}
    </form>
  );
}

export function AdjustmentForm({ reps }: { reps: { id: number; name: string }[] }) {
  const [state, action, pending] = useActionState<FormResult | null, FormData>(addAdjustment, null);
  return (
    <form action={action} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div className="field">
        <label htmlFor="adj-rep">Rep</label>
        <select id="adj-rep" name="repId" required defaultValue="">
          <option value="" disabled>Choose a rep</option>
          {reps.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
        </select>
      </div>
      <div className="form">
        <div className="field"><label htmlFor="adj-amt">Amount ($)</label><input id="adj-amt" name="amount" type="number" step="0.01" required placeholder="-40.00" /><span className="hint">Negative takes it out of the next payout.</span></div>
        <div className="field"><label htmlFor="adj-order">Order # <span style={{ fontWeight: 400 }}>(optional)</span></label><input id="adj-order" name="orderId" type="number" min="1" /></div>
      </div>
      <div className="field"><label htmlFor="adj-note">Reason</label><input id="adj-note" name="note" required maxLength={200} placeholder="Partial return on order #12" /></div>
      <button className="btn btn-dark" type="submit" disabled={pending}>{pending ? 'Saving…' : 'Add adjustment'}</button>
      {state && <p className={state.ok ? 'note-ok' : 'note-warn'} role="status">{state.message}</p>}
    </form>
  );
}
