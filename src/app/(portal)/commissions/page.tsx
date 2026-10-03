import { redirect } from 'next/navigation';
import { money } from '@/components/format';
import { LedgerTable, toLedgerRow } from '@/components/ledger-table';
import { ledgerEntries, payouts, repTotals } from '@/lib/commission-ledger';
import { db } from '@/lib/db';
import { fmtDate } from '@/lib/order-access';
import { requireUser } from '@/lib/session';

export const dynamic = 'force-dynamic';

/** A rep's own commissions. */
export default async function MyCommissions() {
  const user = await requireUser(['REP', 'ADMIN']);
  if (user.role === 'ADMIN') redirect('/admin/commissions');
  const repId = user.repId ?? -1;
  const rep = await db.rep.findUnique({ where: { id: repId } });
  const [totals, entries, history] = await Promise.all([repTotals({ repId }), ledgerEntries({ repId }, 200), payouts({ repId })]);
  const t = totals.find(x => x.repId === repId) ?? { pending: 0, earned: 0, paid: 0 };

  return (
    <main className="wrap">
      <div className="page-head">
        <div>
          <h1 className="display">My commissions</h1>
          <p>{rep?.commissioned
            ? 'Every portal order from your shops: 10% on retail accounts, 8% on Distro, bulk flower $75/lb ($50/lb at 10+ lb in one order). It counts as earned once the customer pays.'
            : 'Your accounts are house accounts, so portal orders don’t earn commission.'}</p>
        </div>
        <a className="btn btn-ghost" href="/admin/commissions/export">Download CSV</a>
      </div>
      <div className="kpis">
        <div className="kpi"><small>Earned, not yet paid</small><strong>{money(t.earned)}</strong></div>
        <div className="kpi"><small>Waiting on customer payment</small><strong>{money(t.pending)}</strong></div>
        <div className="kpi"><small>Paid to you</small><strong>{money(t.paid)}</strong></div>
      </div>
      <div className="two">
        <section className="panel">
          <div className="panel-head"><h2 className="display">Activity</h2></div>
          <LedgerTable rows={entries.map(toLedgerRow)} showRep={false} />
        </section>
        <aside className="rail">
          <section className="panel">
            <p className="label">Payouts</p>
            {history.length ? history.map(p => (
              <div key={p.payoutId} className="sum-row"><span>{fmtDate(p.paidAt)}<span className="sub">{p.payoutId} · {p.entries} entr{p.entries === 1 ? 'y' : 'ies'}</span></span><b>{money(p.amount)}</b></div>
            )) : <p className="empty">No payouts yet.</p>}
          </section>
        </aside>
      </div>
    </main>
  );
}
