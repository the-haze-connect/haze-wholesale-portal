'use client';

import { useActionState } from 'react';
import { submitRequest, type ApplyResult } from './actions';

const STORE_TYPES = ['Smoke / vape shop', 'Dispensary / CBD store', 'Convenience / gas station', 'Liquor store', 'Distributor', 'Online retailer', 'Other'];

export function ApplyForm({ reps }: { reps: string[] }) {
  const [state, action, pending] = useActionState<ApplyResult | null, FormData>(submitRequest, null);
  if (state?.ok) {
    return (
      <div className="sent" role="status">
        <b>Thanks! Your request is in.</b>
        <span>We’ll review it and email you within 1–2 business days. Once approved, you’ll get a link to sign in and order.</span>
      </div>
    );
  }
  const f = state?.fields ?? {};
  const field = (name: string, label: string, props: React.InputHTMLAttributes<HTMLInputElement> = {}, span = false) => (
    <div className={`field${span ? ' span' : ''}`}>
      <label htmlFor={`ap-${name}`}>{label}</label>
      <input id={`ap-${name}`} name={name} defaultValue={f[name] ?? ''} {...props} />
    </div>
  );
  return (
    <form action={action} className="form" encType="multipart/form-data">
      <div aria-hidden="true" style={{ position: 'absolute', left: '-9999px', width: 1, height: 1, overflow: 'hidden' }}>
        <label>Company website <input name="company_site" tabIndex={-1} autoComplete="off" /></label>
      </div>
      {field('businessName', 'Business name', { required: true, autoComplete: 'organization', maxLength: 100 }, true)}
      {field('contactName', 'Your name', { required: true, autoComplete: 'name' })}
      {field('email', 'Email', { required: true, type: 'email', autoComplete: 'email' })}
      {field('phone', 'Phone', { type: 'tel', autoComplete: 'tel' })}
      <div className="field">
        <label htmlFor="ap-storeType">Type of business</label>
        <select id="ap-storeType" name="storeType" defaultValue={f.storeType ?? ''}>
          <option value="">Choose one</option>
          {STORE_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
        </select>
      </div>
      {field('addr1', 'Ship-to street address', { required: true, autoComplete: 'address-line1' }, true)}
      {field('addr2', 'Suite / unit (optional)', { autoComplete: 'address-line2' }, true)}
      {field('city', 'City', { required: true, autoComplete: 'address-level2' })}
      <div className="field" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <div className="field"><label htmlFor="ap-state">State</label><input id="ap-state" name="state" required maxLength={20} autoComplete="address-level1" defaultValue={f.state ?? ''} placeholder="TX" /></div>
        <div className="field"><label htmlFor="ap-zip">ZIP</label><input id="ap-zip" name="zip" required maxLength={10} autoComplete="postal-code" inputMode="numeric" defaultValue={f.zip ?? ''} /></div>
      </div>
      {field('licenseNumber', 'Hemp / business license #')}
      {field('resaleNumber', 'Resale or sales tax permit #')}
      <div className="field span">
        <label htmlFor="ap-document">Upload your license or resale certificate <span style={{ fontWeight: 400 }}>(optional, PDF or photo, up to 5 MB)</span></label>
        <input id="ap-document" name="document" type="file" accept="application/pdf,image/jpeg,image/png,image/webp" style={{ height: 'auto', padding: 8 }} />
      </div>
      {field('website', 'Website or Instagram (optional)')}
      <div className="field">
        <label htmlFor="ap-repName">Do you work with one of our reps?</label>
        <select id="ap-repName" name="repName" defaultValue={f.repName ?? ''}>
          <option value="">No / not sure</option>
          {reps.map(r => <option key={r} value={r}>{r}</option>)}
        </select>
      </div>
      <div className="field span">
        <label htmlFor="ap-notes">Anything else we should know? (optional)</label>
        <textarea id="ap-notes" name="notes" rows={3} maxLength={1500} defaultValue={f.notes ?? ''} placeholder="Products you’re interested in, number of locations…" />
      </div>
      {state && !state.ok && <p className="note-warn field span" role="alert">{state.message}</p>}
      <div className="field span">
        <button className="btn btn-dark" type="submit" disabled={pending} style={{ minHeight: 48 }}>{pending ? 'Sending…' : 'Request wholesale access'}</button>
        <span className="hint">Wholesale accounts are for licensed retailers and distributors. We don’t ship to {['ID', 'AR', 'NH', 'TN', 'NJ'].join(', ')}.</span>
      </div>
    </form>
  );
}
