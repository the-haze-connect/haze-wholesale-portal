import Link from 'next/link';
import type { Prisma } from '@prisma/client';
import { money } from '@/components/format';
import { LedgerTable, toLedgerRow } from '@/components/ledger-table';
import { ledgerEntries, payouts, repTotals } from '@/lib/commission-ledger';
import { fmtDate } from '@/lib/order-access';
import { reverseEntry } from './actions';
import { AdjustmentForm, PayoutForm } from './forms';

export const dynamic = 'force-dynamic';

const STATES = [['all', 'All'], ['EARNED', 'Earned, unpaid'], ['PENDING', 'Waiting on payment'], ['PAID', 'Paid out'], ['REVERSED', 'Reversed']] as const;

export default async function CommissionsAdmin({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const repId = Number(sp.rep) || null;
  const state = STATES.some(([k]) => k === sp.state) ? sp.state! : 'all';
  const where: Prisma.CommissionEntryWhereInput = {
    ...(repId ? { repId } : {}),
    ...(state !== 'all' ? { state: state as 'EARNED' } : {}),
  };
  const [totals, entries, history] = await Promise.all([repTotals(), ledgerEntries(where), payouts(repId ? { repId } : {})]);
  const sum = (k: 'pending' | 'earned' | 'paid') => totals.reduce((s, t) => s + t[k], 0);
  const qs = (over: Record<string, string | number | null>) => {
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries({ rep: repId, state, ...over })) if (v && v !== 'all') p.set(k, String(v));
    const s = p.toString();
    return `/admin/commissions${s ? `?${s}` : ''}`;
  };

  return (
    <main className="wrap">
      <div className="page-head">
        <div>
          <h1 className="display">Commissions</h1>
          <p>Written automatically with every portal order: 10% on retail accounts, 8% on Distro, bulk flower $75/lb ($50/lb at 10+ lb). Commission is earned when the customer pays.</p>
        </div>
        <a className="btn btn-ghost" href={`/admin/commissions/export${repId ? `?rep=${repId}` : ''}`}>Download CSV</a>
      </div>

      <div className="kpis">
        <div className="kpi"><small>Earned, not paid out</small><strong>{money(sum('earned'))}</strong></div>
        <div className="kpi"><small>Waiting on customer payment</small><strong>{money(sum('pending'))}</strong></div>
        <div className="kpi"><small>Paid out to date</small><strong>{money(sum('paid'))}</strong></div>
      </div>

      <section className="panel">
        <div className="panel-head"><h2 className="display">By rep</h2></div>
        <div className="table-wrap">
          <table>
            <thead><tr><th>Rep</th><th className="num">Waiting on payment</th><th className="num">Earned, unpaid</th><th className="num">Paid to date</th><th style={{ textAlign: 'right' }}>Payout</th></tr></thead>
            <tbody>
              {totals.map(t => (
                <tr key={t.repId}>
                  <td><Link href={qs({ rep: t.repId })}><b>{t.name}</b></Link></td>
                  <td className="num">{money(t.pending)}</td>
                  <td className="num"><b>{money(t.earned)}</b></td>
                  <td className="num">{money(t.paid)}</td>
                  <td><PayoutForm repId={t.repId} repName={t.name} earned={t.earned} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="muted" style={{ fontSize: 13, marginBottom: 0 }}>Recording a payout marks the rep’s earned commission as paid. Pay the rep the way you normally do; the portal doesn’t send money.</p>
      </section>

      <div className="two">
        <section className="panel">
          <div className="panel-head">
            <h2 className="display">Ledger{repId ? ` · ${totals.find(t => t.repId === repId)?.name ?? ''}` : ''}</h2>
            {repId && <Link className="btn btn-ghost btn-sm" href={qs({ rep: null })}>All reps</Link>}
          </div>
          <div className="chips" role="group" aria-label="Status" style={{ marginBottom: 12 }}>
            {STATES.map(([k, label]) => (
              <Link key={k} href={qs({ state: k })} className="btn btn-sm btn-ghost" aria-current={state === k ? 'page' : undefined}
                style={state === k ? { background: 'var(--night)', color: 'var(--night-text)', borderColor: 'var(--night)' } : undefined}>{label}</Link>
            ))}
          </div>
          <LedgerTable rows={entries.map(toLedgerRow)} showRep={!repId} reverse={reverseEntry} />
        </section>

        <aside className="rail">
          <section className="panel">
            <p className="label">Adjustment</p>
            <p className="muted" style={{ fontSize: 13.5 }}>For partial returns, bonuses or corrections. For a full return or cancelled order, use Reverse on the ledger line instead.</p>
            <AdjustmentForm reps={totals.map(t => ({ id: t.repId, name: t.name }))} />
          </section>
          <section className="panel">
            <p className="label">Payout history</p>
            {history.length ? history.slice(0, 20).map(p => (
              <div key={p.payoutId} className="sum-row"><span>{p.repName}<span className="sub">{p.payoutId} · {fmtDate(p.paidAt)}</span></span><b>{money(p.amount)}</b></div>
            )) : <p className="empty">No payouts recorded yet.</p>}
          </section>
        </aside>
      </div>
    </main>
  );
}
