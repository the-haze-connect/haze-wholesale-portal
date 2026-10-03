'use client';

import type { SampleItem } from '@/lib/samples';
import { useCart } from './cart';
import { TILE } from './format';

/** Free samples buyers can add to a case order, up to the per-order limit. */
export function SamplesSection({ samples, limit, canOrder }: { samples: SampleItem[]; limit: number; canOrder: boolean }) {
  const cart = useCart();
  if (!samples.length || limit < 1) return null;
  const used = cart.lines.filter(l => l.uom === 'SAMPLE').reduce((n, l) => n + l.quantity, 0);
  const left = Math.max(0, limit - used);

  return (
    <section id="samples" className="panel" aria-labelledby="samples-h">
      <div className="panel-head">
        <div>
          <h2 className="display" id="samples-h">Free samples</h2>
          <p style={{ margin: '4px 0 0', color: 'var(--ink-2)' }}>Try something new with your next case order. Up to {limit} free sample{limit === 1 ? '' : 's'} per order.</p>
        </div>
        {canOrder && <span className={`pill ${left ? 'pill-in' : 'pill-low'}`}>{left ? `${left} of ${limit} left` : 'Sample limit reached'}</span>}
      </div>
      <div className="samples">
        {samples.map(s => {
          const n = cart.qty(s.id, 'SAMPLE');
          const canAdd = canOrder && left > 0 && n < s.available;
          return (
            <article key={s.id} className="sample">
              {s.photo
                ? <img src={s.photo} alt="" loading="lazy" decoding="async" />
                : <div className="sample-tile" style={{ background: TILE[s.category] ?? '#204B57' }} aria-hidden="true">{s.category}</div>}
              <div className="sample-body">
                <b>{s.name}</b>
                <span className="sub">{s.code}</span>
              </div>
              {canOrder && (
                <div className="step" style={{ alignSelf: 'stretch', justifyContent: 'space-between' }}>
                  <button type="button" aria-label={`Fewer samples of ${s.name}`} onClick={() => cart.set(s.id, 'SAMPLE', n - 1)} disabled={n < 1}>−</button>
                  <output aria-live="polite">{n}</output>
                  <button type="button" aria-label={`Add a sample of ${s.name}`} onClick={() => cart.set(s.id, 'SAMPLE', n + 1)} disabled={!canAdd}>+</button>
                </div>
              )}
            </article>
          );
        })}
      </div>
    </section>
  );
}
