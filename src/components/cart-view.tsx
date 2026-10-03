'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { submitOrder } from '@/app/(portal)/cart/actions';
import type { CatalogItem } from '@/lib/catalog';
import { orderTotals } from '@/lib/pricing';
import { useCart } from './cart';
import { Thumb } from './thumb';
import { money } from './format';

export interface CardConfig { apiLoginId: string; clientKey: string; acceptJsUrl: string }

interface AcceptResponse {
  opaqueData?: { dataDescriptor: string; dataValue: string };
  messages: { resultCode: 'Ok' | 'Error'; message: { code: string; text: string }[] };
}
declare global {
  interface Window { Accept?: { dispatchData: (data: unknown, cb: (r: AcceptResponse) => void) => void } }
}

/** Loads Authorize.net's Accept.js, which turns card details into a one-time token in the browser. */
function useAcceptJs(cfg: CardConfig | null) {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    if (!cfg) return;
    if (window.Accept) { setReady(true); return; }
    const s = document.createElement('script');
    s.src = cfg.acceptJsUrl;
    s.charset = 'utf-8';
    s.onload = () => setReady(true);
    document.body.appendChild(s);
  }, [cfg]);
  return ready;
}

function tokenizeCard(cfg: CardConfig, card: { number: string; month: string; year: string; cvv: string; zip: string }) {
  return new Promise<{ dataDescriptor: string; dataValue: string }>((resolve, reject) => {
    if (!window.Accept) { reject(new Error('The card form is still loading. Try again in a moment.')); return; }
    window.Accept.dispatchData({
      authData: { clientKey: cfg.clientKey, apiLoginID: cfg.apiLoginId },
      cardData: { cardNumber: card.number.replace(/\D/g, ''), month: card.month.padStart(2, '0'), year: card.year.length === 2 ? `20${card.year}` : card.year, cardCode: card.cvv, zip: card.zip },
    }, r => {
      if (r.messages.resultCode === 'Ok' && r.opaqueData) resolve(r.opaqueData);
      else reject(new Error(r.messages.message.map(m => m.text).join(' ') || 'Check your card details.'));
    });
  });
}

export function CartView({ items, feePercent, card, forAccountId, canSubmit, blockedReason }: {
  items: CatalogItem[];
  feePercent: number;
  card: CardConfig | null;
  forAccountId: number | null;
  canSubmit: boolean;
  blockedReason: string | null;
}) {
  const cart = useCart();
  const router = useRouter();
  const [pay, setPay] = useState<'CARD' | 'ACH_WIRE'>(card ? 'CARD' : 'ACH_WIRE');
  const [po, setPo] = useState('');
  const [notes, setNotes] = useState('');
  const [cc, setCc] = useState({ number: '', month: '', year: '', cvv: '', zip: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<{ message: string; problems?: string[] } | null>(null);
  const acceptReady = useAcceptJs(pay === 'CARD' ? card : null);
  const byId = new Map(items.map(i => [i.id, i]));

  const lines = cart.lines.flatMap(l => {
    const item = byId.get(l.productId);
    const opt = item?.options.find(o => o.uom === l.uom);
    return item && opt ? [{ ...l, item, opt, lineTotal: Math.round(opt.price * l.quantity * 100) / 100 }] : [];
  });
  const missing = cart.lines.length - lines.length;
  const totals = orderTotals(lines.map(l => ({ unitPrice: l.opt.price, quantity: l.quantity })), pay, feePercent);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const opaqueData = pay === 'CARD' && card ? await tokenizeCard(card, cc) : null;
      const res = await submitOrder({
        forAccountId,
        lines: lines.map(l => ({ productId: l.productId, uom: l.uom, quantity: l.quantity })),
        payment: pay, expectedTotal: totals.total, customerPO: po, notes, opaqueData,
      });
      if (res.ok) {
        cart.clear();
        router.push(`/orders/${res.orderId}?placed=1`);
        return;
      }
      setError({ message: res.message, problems: res.problems });
      router.refresh();
    } catch (err) {
      setError({ message: err instanceof Error ? err.message : 'Something went wrong. Try again.' });
    }
    setBusy(false);
  }

  if (!lines.length) {
    return (
      <section className="panel" style={{ textAlign: 'center', padding: 48 }}>
        <h2 className="display" style={{ margin: 0, fontSize: 24 }}>Your cart is empty</h2>
        <p style={{ color: 'var(--ink-2)' }}>Add cases from the shop or the quick-order list.</p>
        <Link className="btn btn-kush" href="/#shop">Shop inventory</Link>
      </section>
    );
  }

  const ccField = (key: keyof typeof cc, label: string, props: React.InputHTMLAttributes<HTMLInputElement>) => (
    <div className="field">
      <label htmlFor={`cc-${key}`}>{label}</label>
      <input id={`cc-${key}`} value={cc[key]} onChange={e => setCc({ ...cc, [key]: e.target.value })} required inputMode="numeric" {...props} />
    </div>
  );

  return (
    <form className="two" onSubmit={submit}>
      <section className="panel">
        <div className="panel-head"><h2 className="display">Items</h2></div>
        {missing > 0 && <p className="pill pill-low">{missing} item{missing > 1 ? 's are' : ' is'} no longer available and {missing > 1 ? 'were' : 'was'} left out.</p>}
        <div className="table-wrap">
          <table>
            <thead><tr><th>Product</th><th className="num">Price</th><th className="num">Quantity</th><th className="num">Total</th><th><span className="sr">Remove</span></th></tr></thead>
            <tbody>
              {lines.map(l => (
                <tr key={`${l.productId}-${l.uom}`}>
                  <td><div className="with-thumb"><Thumb src={l.item.photo} category={l.item.category} /><div><b>{l.item.name}</b><span className="sub">{l.item.isBulk ? l.opt.label : 'Case'} · {l.item.code}</span></div></div></td>
                  <td className="num">{money(l.opt.price)}</td>
                  <td className="num">
                    <div className="step" style={{ display: 'inline-flex' }}>
                      <button type="button" aria-label={`Fewer of ${l.item.name}`} onClick={() => cart.set(l.productId, l.uom, l.quantity - 1)}>−</button>
                      <output>{l.quantity}</output>
                      <button type="button" aria-label={`More of ${l.item.name}`} onClick={() => cart.set(l.productId, l.uom, l.quantity + 1)} disabled={l.quantity >= l.opt.maxQty}>+</button>
                    </div>
                  </td>
                  <td className="num"><b>{money(l.lineTotal)}</b></td>
                  <td className="num"><button type="button" className="btn btn-ghost btn-sm" onClick={() => cart.set(l.productId, l.uom, 0)}>Remove</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="form-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 14, marginTop: 20 }}>
          <div className="field">
            <label htmlFor="po">PO number <span style={{ fontWeight: 400 }}>(optional)</span></label>
            <input id="po" value={po} onChange={e => setPo(e.target.value)} maxLength={25} />
          </div>
          <div className="field span">
            <label htmlFor="notes">Notes for our team <span style={{ fontWeight: 400 }}>(optional)</span></label>
            <textarea id="notes" value={notes} onChange={e => setNotes(e.target.value)} maxLength={1000} rows={2} />
          </div>
        </div>
      </section>

      <aside className="rail">
        <section className="panel">
          <p className="label">Payment</p>
          <div className="seg" role="group" aria-label="Payment method" style={{ margin: '12px 0' }}>
            <button type="button" aria-pressed={pay === 'CARD'} onClick={() => setPay('CARD')} disabled={!card}>Card</button>
            <button type="button" aria-pressed={pay === 'ACH_WIRE'} onClick={() => setPay('ACH_WIRE')}>ACH / wire</button>
          </div>

          {pay === 'CARD' && card && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 12 }}>
              <div style={{ gridColumn: '1 / -1' }}>{ccField('number', 'Card number', { autoComplete: 'cc-number', maxLength: 23, placeholder: '•••• •••• •••• ••••' })}</div>
              {ccField('month', 'Exp. month', { autoComplete: 'cc-exp-month', maxLength: 2, placeholder: 'MM' })}
              {ccField('year', 'Exp. year', { autoComplete: 'cc-exp-year', maxLength: 4, placeholder: 'YY' })}
              {ccField('cvv', 'Security code', { autoComplete: 'cc-csc', maxLength: 4, placeholder: 'CVV' })}
              {ccField('zip', 'Billing ZIP', { autoComplete: 'postal-code', maxLength: 10, inputMode: 'text' })}
            </div>
          )}

          <div className="sum-row"><span>Subtotal</span><b>{money(totals.subtotal)}</b></div>
          <div className="sum-row"><span>Shipping</span><b>Free</b></div>
          {pay === 'CARD' && <div className="sum-row"><span>Card processing ({feePercent}%)</span><b>{money(totals.cardFee)}</b></div>}
          <div className="sum-row"><span>Total</span><b>{money(totals.total)}</b></div>
          <p style={{ fontSize: 13, color: 'var(--ink-3)' }}>
            {pay === 'CARD'
              ? 'Your card is charged when you submit, and the order is approved right away. Card details go straight to Authorize.net.'
              : 'We’ll show our ACH and wire details after you submit. Your order is approved once we confirm the payment arrived.'}
          </p>

          {error && (
            <div className="note-warn" role="alert" style={{ marginBottom: 12 }}>
              {error.message}
              {error.problems?.length ? <ul style={{ margin: '6px 0 0', paddingLeft: 18, fontWeight: 500 }}>{error.problems.map(p => <li key={p}>{p}</li>)}</ul> : null}
            </div>
          )}
          {blockedReason && <p className="note-warn" style={{ marginBottom: 12 }}>{blockedReason}</p>}

          <button type="submit" className="btn btn-kush" style={{ width: '100%' }}
            disabled={busy || !canSubmit || (pay === 'CARD' && !acceptReady)}>
            {busy ? 'Placing order…' : pay === 'CARD' ? `Pay ${money(totals.total)} and place order` : 'Place order'}
          </button>
          {!card && <p style={{ fontSize: 12.5, color: 'var(--ink-3)', marginBottom: 0 }}>Card payments aren’t switched on yet.</p>}
        </section>
      </aside>
    </form>
  );
}
