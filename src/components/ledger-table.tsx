import Link from 'next/link';
import { STATE_LABEL } from '@/lib/commission-ledger';
import { fmtDate } from '@/lib/order-access';
import { money } from './format';

export interface LedgerRow {
  id: number;
  createdAt: Date;
  repName: string;
  orderId: number | null;
  accountName: string | null;
  rule: string;
  basis: number;
  amount: number;
  state: keyof typeof STATE_LABEL;
  note: string | null;
  payoutId: string | null;
}

/** Commission entries. `reverse` is a server action shown to admins only. */
export function LedgerTable({ rows, showRep, reverse }: { rows: LedgerRow[]; showRep: boolean; reverse?: (form: FormData) => Promise<void> }) {
  if (!rows.length) return <p className="empty">No commission entries here.</p>;
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Date</th>{showRep && <th>Rep</th>}<th>Order</th><th>Rule</th><th className="num">Basis</th><th className="num">Amount</th><th>Status</th>{reverse && <th><span className="sr">Actions</span></th>}
          </tr>
        </thead>
        <tbody>
          {rows.map(r => {
            const s = STATE_LABEL[r.state];
            const lbs = r.rule.startsWith('Bulk');
            return (
              <tr key={r.id}>
                <td>{fmtDate(r.createdAt)}</td>
                {showRep && <td>{r.repName}</td>}
                <td>{r.orderId ? <><Link href={`/orders/${r.orderId}`}>#{r.orderId}</Link><span className="sub">{r.accountName}</span></> : <span className="muted">—</span>}</td>
                <td>{r.rule}{r.note && <span className="sub">{r.note}</span>}</td>
                <td className="num">{r.basis ? (lbs ? `${r.basis} lb` : money(r.basis)) : <span className="muted">—</span>}</td>
                <td className="num"><b style={r.amount < 0 ? { color: 'var(--red-ink)' } : undefined}>{money(r.amount)}</b></td>
                <td><span className={`pill ${s.pill}`}>{s.text}</span>{r.payoutId && <span className="sub">{r.payoutId}</span>}</td>
                {reverse && (
                  <td>
                    {r.state !== 'REVERSED' && (
                      <form action={reverse} className="row-actions">
                        <input type="hidden" name="id" value={r.id} />
                        <input type="hidden" name="note" value={r.state === 'PAID' ? 'Clawback after payout' : 'Reversed by admin'} />
                        <button type="submit" className="btn btn-ghost btn-sm" style={{ color: 'var(--red-ink)' }}
                          title={r.state === 'PAID' ? 'Already paid: adds an offsetting entry to the next payout' : 'Removes this commission'}>Reverse</button>
                      </form>
                    )}
                  </td>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

type Entry = Awaited<ReturnType<typeof import('@/lib/commission-ledger').ledgerEntries>>[number];
export const toLedgerRow = (e: Entry): LedgerRow => ({
  id: e.id, createdAt: e.createdAt, repName: e.rep.name, orderId: e.orderId, accountName: e.order?.account.name ?? null,
  rule: e.rule, basis: Number(e.basis), amount: Number(e.amount), state: e.state, note: e.note, payoutId: e.payoutId,
});
