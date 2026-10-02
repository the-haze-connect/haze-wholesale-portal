import Link from 'next/link';
import { money } from '@/components/format';
import { db } from '@/lib/db';
import { STATUS_LABEL, fmtDate, orderScope } from '@/lib/order-access';
import { ACH_SETTING, getSetting } from '@/lib/orders';
import { requireUser } from '@/lib/session';
import { saveAchInstructions } from './actions';
import { AchInstructionsForm } from './forms';

export const dynamic = 'force-dynamic';

const FILTERS = [['all', 'All'], ['waiting', 'Waiting on payment'], ['approved', 'Approved'], ['issues', 'Not in Order Time']] as const;

export default async function OrdersPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const user = await requireUser();
  const isAdmin = user.role === 'ADMIN';
  const filter = (await searchParams).show ?? (isAdmin ? 'waiting' : 'all');
  const extra =
    filter === 'waiting' ? { status: 'SUBMITTED' as const } :
    filter === 'approved' ? { status: 'APPROVED' as const } :
    filter === 'issues' ? { status: 'APPROVED' as const, otSalesOrderNo: null } : {};

  const [orders, waitingCount, issueCount, ach] = await Promise.all([
    db.order.findMany({ where: { ...orderScope(user), ...extra }, include: { account: { select: { name: true } } }, orderBy: { createdAt: 'desc' }, take: 200 }),
    db.order.count({ where: { ...orderScope(user), status: 'SUBMITTED' } }),
    isAdmin ? db.order.count({ where: { status: 'APPROVED', otSalesOrderNo: null } }) : Promise.resolve(0),
    isAdmin ? getSetting(ACH_SETTING) : Promise.resolve(null),
  ]);

  return (
    <main className="wrap">
      <div className="page-head">
        <div>
          <h1 className="display">Orders</h1>
          <p>
            {isAdmin
              ? `${waitingCount} waiting on ACH / wire payment${issueCount ? ` · ${issueCount} approved but not in Order Time yet` : ''}.`
              : user.role === 'REP' ? 'Orders from your shops.' : 'Your shop’s portal orders.'}
          </p>
        </div>
      </div>

      <div className={isAdmin ? 'two' : undefined}>
        <section className="panel">
          <div className="chips" role="group" aria-label="Filter orders" style={{ marginBottom: 12 }}>
            {FILTERS.filter(([k]) => isAdmin || k !== 'issues').map(([k, label]) => (
              <Link key={k} href={`/orders?show=${k}`} className="btn btn-sm btn-ghost" aria-current={filter === k ? 'page' : undefined}
                style={filter === k ? { background: 'var(--night)', color: 'var(--night-text)', borderColor: 'var(--night)' } : undefined}>{label}</Link>
            ))}
          </div>
          {orders.length ? (
            <div className="table-wrap">
              <table>
                <thead><tr><th>Order</th><th>Shop</th><th>Payment</th><th>Status</th><th className="num">Total</th></tr></thead>
                <tbody>
                  {orders.map(o => (
                    <tr key={o.id}>
                      <td><Link href={`/orders/${o.id}`}><b>#{o.id}</b></Link><span className="sub">{fmtDate(o.createdAt)}</span></td>
                      <td>{o.account.name}{o.customerPO && <span className="sub">PO {o.customerPO}</span>}</td>
                      <td>{o.paymentMethod === 'CARD' ? `Card${o.cardLast4 ? ` ••${o.cardLast4}` : ''}` : 'ACH / wire'}</td>
                      <td>
                        <span className={`pill ${STATUS_LABEL[o.status]!.pill}`}>{STATUS_LABEL[o.status]!.text}</span>
                        {isAdmin && o.status === 'APPROVED' && (o.otSalesOrderNo ? <span className="sub">SO {o.otSalesOrderNo}</span> : <span className="sub" style={{ color: 'var(--red-ink)' }}>Not in Order Time</span>)}
                      </td>
                      <td className="num"><b>{money(Number(o.total))}</b></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : <p className="empty">No orders here yet.</p>}
        </section>

        {isAdmin && (
          <aside className="rail">
            <section className="panel">
              <p className="label">Payment details</p>
              <p style={{ fontSize: 14, color: 'var(--ink-2)' }}>Shown to buyers on ACH / wire orders. Until you add them, buyers see “We’ll email our ACH and wire details shortly.”</p>
              <AchInstructionsForm action={saveAchInstructions} initial={ach ?? ''} />
            </section>
          </aside>
        )}
      </div>
    </main>
  );
}
