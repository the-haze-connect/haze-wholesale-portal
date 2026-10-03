'use client';

import { useActionState, useEffect, useState } from 'react';
import { saveSampleLimit, setProductPhoto, type PhotoResult } from './actions';

/** Upload a file or paste a link. Collapsed to one button until opened. */
export function PhotoForm({ productId, hasPhoto }: { productId: number; hasPhoto: boolean }) {
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState<PhotoResult | null, FormData>(setProductPhoto, null);
  useEffect(() => { if (state?.ok) setOpen(false); }, [state]);
  if (!open) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, alignItems: 'flex-end' }}>
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => setOpen(true)}>{hasPhoto ? 'Change photo' : 'Add photo'}</button>
        {state?.ok && <span className="pill pill-in" role="status">Saved</span>}
      </div>
    );
  }
  return (
    <form action={action} style={{ display: 'flex', flexDirection: 'column', gap: 8, minWidth: 240 }}>
      <input type="hidden" name="productId" value={productId} />
      <label className="check" style={{ fontWeight: 600 }}>
        <span className="sr">Image file</span>
        <input type="file" name="file" accept="image/jpeg,image/png,image/webp,image/gif" style={{ width: '100%', height: 'auto', fontSize: 13 }} />
      </label>
      <input name="url" type="url" placeholder="…or paste an image link (https://)" aria-label="Image link"
        style={{ font: 'inherit', fontSize: 13.5, minHeight: 36, borderRadius: 9, border: '1px solid var(--line-2)', padding: '0 10px' }} />
      <div className="row-actions">
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => setOpen(false)}>Cancel</button>
        <button type="submit" className="btn btn-dark btn-sm" disabled={pending}>{pending ? 'Saving…' : 'Save photo'}</button>
      </div>
      {state && !state.ok && <p className="note-warn" role="alert">{state.message}</p>}
    </form>
  );
}

export function SampleLimitForm({ initial }: { initial: number }) {
  const [state, action, pending] = useActionState<PhotoResult | null, FormData>(saveSampleLimit, null);
  return (
    <form action={action} style={{ display: 'flex', gap: 8, alignItems: 'flex-end', flexWrap: 'wrap' }}>
      <div className="field" style={{ width: 150 }}>
        <label htmlFor="sample-limit">Free samples per order</label>
        <input id="sample-limit" name="limit" type="number" min={0} max={100} defaultValue={initial} />
      </div>
      <button type="submit" className="btn btn-dark btn-sm" disabled={pending} style={{ minHeight: 44 }}>{pending ? 'Saving…' : 'Save'}</button>
      {state && <p className={state.ok ? 'note-ok' : 'note-warn'} role="status" style={{ flexBasis: '100%' }}>{state.message}</p>}
    </form>
  );
}
