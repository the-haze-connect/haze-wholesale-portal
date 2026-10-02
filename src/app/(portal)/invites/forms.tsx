'use client';

import { useActionState } from 'react';
import { inviteBuyer, inviteRep, type InviteResult } from './actions';

export function InviteBuyerForm({ accounts }: { accounts: { id: number; name: string }[] }) {
  const [state, action, pending] = useActionState<InviteResult | null, FormData>(inviteBuyer, null);
  return (
    <form action={action} className="form" style={{ marginTop: 12 }}>
      <div className="field span">
        <label htmlFor="inv-account">Shop</label>
        <select id="inv-account" name="accountId" required defaultValue="">
          <option value="" disabled>Choose a shop</option>
          {accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
        </select>
      </div>
      <div className="field"><label htmlFor="inv-email">Buyer’s email</label><input id="inv-email" name="email" type="email" required autoComplete="off" /></div>
      <div className="field"><label htmlFor="inv-name">Buyer’s name</label><input id="inv-name" name="name" autoComplete="off" /></div>
      <div className="field">
        <label htmlFor="inv-access">Access</label>
        <select id="inv-access" name="access" defaultValue="BUYER">
          <option value="BUYER">Can place orders</option>
          <option value="VIEW_ONLY">View inventory only</option>
        </select>
      </div>
      <div className="field" style={{ justifyContent: 'flex-end' }}>
        <button className="btn btn-dark" type="submit" disabled={pending}>{pending ? 'Sending…' : 'Send invite'}</button>
      </div>
      {state && <p className={`field span ${state.ok ? 'note-ok' : 'note-warn'}`} role="status">{state.message}</p>}
    </form>
  );
}

export function InviteRepForm({ reps }: { reps: { id: number; name: string; commissioned: boolean }[] }) {
  const [state, action, pending] = useActionState<InviteResult | null, FormData>(inviteRep, null);
  return (
    <form action={action} className="form" style={{ marginTop: 12 }}>
      <div className="field span">
        <label htmlFor="rep-id">Rep in Order Time</label>
        <select id="rep-id" name="repId" required defaultValue="">
          <option value="" disabled>Choose a rep</option>
          {reps.map(r => <option key={r.id} value={r.id}>{r.name}{r.commissioned ? '' : ' (house, no commission)'}</option>)}
        </select>
      </div>
      <div className="field"><label htmlFor="rep-email">Rep’s email</label><input id="rep-email" name="email" type="email" required autoComplete="off" /></div>
      <div className="field"><label htmlFor="rep-name">Name</label><input id="rep-name" name="name" autoComplete="off" /></div>
      <div className="field span"><button className="btn btn-dark" type="submit" disabled={pending}>{pending ? 'Sending…' : 'Send rep login'}</button></div>
      {state && <p className={`field span ${state.ok ? 'note-ok' : 'note-warn'}`} role="status">{state.message}</p>}
    </form>
  );
}
