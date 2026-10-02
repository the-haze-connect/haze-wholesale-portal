'use client';

import { useActionState } from 'react';
import type { ActionResult } from './actions';

type Action = (prev: ActionResult | null, form: FormData) => Promise<ActionResult>;

/** A one-button admin action with an inline result message. */
export function OrderActionButton({ action, orderId, label, kind = 'kush', confirm }: { action: Action; orderId: number; label: string; kind?: 'kush' | 'ghost'; confirm?: string }) {
  const [state, run, pending] = useActionState(action, null);
  return (
    <form action={run} onSubmit={e => { if (confirm && !window.confirm(confirm)) e.preventDefault(); }} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <input type="hidden" name="orderId" value={orderId} />
      <button type="submit" className={`btn btn-${kind}`} disabled={pending}>{pending ? 'Working…' : label}</button>
      {state && <p className={state.ok ? 'pill pill-in' : 'note-warn'} style={{ margin: 0, whiteSpace: 'normal' }} role="status">{state.message}</p>}
    </form>
  );
}

export function AchInstructionsForm({ action, initial }: { action: Action; initial: string }) {
  const [state, run, pending] = useActionState(action, null);
  return (
    <form action={run} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div className="field">
        <label htmlFor="ach">ACH / wire instructions buyers see after ordering</label>
        <textarea id="ach" name="value" rows={7} defaultValue={initial} placeholder={'Bank name\nRouting number\nAccount number\nAccount name\nInclude the order number in the memo'} />
      </div>
      <button type="submit" className="btn btn-dark" disabled={pending}>{pending ? 'Saving…' : 'Save instructions'}</button>
      {state && <p className={state.ok ? 'pill pill-in' : 'note-warn'} style={{ margin: 0 }} role="status">{state.message}</p>}
    </form>
  );
}
