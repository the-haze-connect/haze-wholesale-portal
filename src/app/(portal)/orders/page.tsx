import Link from 'next/link';
import type { Prisma } from '@prisma/client';
import { money } from '@/components/format';
import { db } from '@/lib/db';
import { fmtDate, fmtDay, orderScope, otOrderScope, otStatus, statusOf } from '@/lib/order-access';
import { ACH_SETTING, getSetting } from '@/lib/orders';
import { requireUser } from '@/lib/session';
import { AdminNav } from '../admin/nav';
import { saveAchInstructions } from './actions';
import { AchInstructionsForm } from './forms';

export const dynamic = 'force-dynamic';

const FILTERS = [['all', 'All orders'], ['waiting', 'Waiting on payment'], ['approved', 'Approved on portal'], ['issues', 'Not in Order Time']] as const;
const PAGE = 50;

interface Row {
  key: string; href: string; date: Date; dateText: string; label: string; sub: string | null;
  shop: string; po: string | null; source: string; status: { text: string; pill: string }; extra: string | null; total: number | null;
}

export default async function OrdersPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const user = await requireUser();
  const isAdmin = user.role === 'ADMIN';
  const sp = await searchParams;
  const filter = FILTERS.some(([k]) => k === sp.show) && (isAdmin || sp.show !== 'issues') ? sp.show! : 'all';
  const q = (sp.q ?? '').trim();
  const accountId = Number(sp.account) || null;
  const page = Math.max(1, Number(sp.page) || 1);
  const qNum = /^#?\s*(so[-\s]*)?\d+$/i.test(q) ? Number(q.replace(/\D/g, '')) : null;

  // Portal orders
  const portalWhere: Prisma.OrderWhereInput = {
    ...orderScope(user),
    ...(accountId ? { accountId } : {}),
    ...(filter === 'waiting' ? { status: 'SUBMITTED' } : filter === 'approved' ? { status: 'APPROVED' } : filter === 'issues' ? { status: 'APPROVED', otSalesOrderNo: null } : {}),
    ...(q ? { OR: [
      ...(qNum !== null ? [{ id: qNum }, { otSalesOrderNo: qNum }] : []),
      { customerPO: { contains: q, mode: 'insensitive' as const } },
      { account: { name: { contains: q, mode: 'insensitive' as const } } },
    ] } : {}),
  };
  // Order Time orders, minus the ones placed on the portal (those show as portal orders)
  const portalSos = (await db.order.findMany({ where: { otSalesOrderNo: { not: null } }, select: { otSalesOrderNo: true } })).map(o => o.otSalesOrderNo!);
  const otWhere: Prisma.OtOrderWhereInput = {
    AND: [
      await otOrderScope(user),
      { portalOrderId: null, ...(portalSos.length ? { docNo: { notIn: portalSos } } : {}) },
      ...(accountId ? [{ accountId }] : []),
      ...(q ? [{ OR: [
        ...(qNum !== null ? [{ docNo: qNum }] : []),
        { customerPO: { contains: q, mode: 'insensitive' as const } },
        { account: { name: { contains: q, mode: 'insensitive' as const } } },
      ] }] : []),
    ],
  };
  const showOt = filter === 'all';
  const take = page * PAGE; // newest `take` of each list, merged, then this page sliced out

  const [portal, portalCount, otRows, otCount, waitingCount, issueCount, ach, forAccount, lastSync] = await Promise.all([
    db.order.findMany({ where: portalWhere, include: { account: { select: { name: true } } }, orderBy: { createdAt: 'desc' }, take }),
    db.order.count({ where: portalWhere }),
    showOt ? db.otOrder.findMany({ where: otWhere, include: { account: { select: { name: true } } }, orderBy: [{ date: 'desc' }, { docNo: 'desc' }], take }) : Promise.resolve([]),
    showOt ? db.otOrder.count({ where: otWhere }) : Promise.resolve(0),
    db.order.count({ where: { ...orderScope(user), status: 'SUBMITTED' } }),
    isAdmin ? db.order.count({ where: { status: 'APPROVED', otSalesOrderNo: null } }) : Promise.resolve(0),
    isAdmin ? getSetting(ACH_SETTING) : Promise.resolve(null),
    accountId ? db.account.findUnique({ where: { id: accountId }, select: { name: true } }) : Promise.resolve(null),
    db.setting.findUnique({ where: { key: 'ot_orders_full_at' } }),
  ]);

  const rows: Row[] = [
    ...portal.map((o): Row => ({
      key: `p${o.id}`, href: `/orders/${o.id}`, date: o.createdAt, dateText: fmtDate(o.createdAt),
      label: o.otSalesOrderNo ? `SO ${o.otSalesOrderNo}` : `Portal #${o.id}`, sub: o.otSalesOrderNo ? `Portal #${o.id}` : null,
      shop: o.account.name, po: o.customerPO, source: o.paymentMethod === 'CARD' ? `Portal · card${o.cardLast4 ? ` ••${o.cardLast4}` : ''}` : 'Portal · ACH / wire',
      status: statusOf(o), extra: isAdmin && o.status === 'APPROVED' && !o.otSalesOrderNo ? 'Not in Order Time' : null, total: Number(o.total),
    })),
    ...otRows.map((o): Row => ({
      key: `o${o.docNo}`, href: `/orders/ot/${o.docNo}`, date: o.date, dateText: fmtDay(o.date),
      label: `SO ${o.docNo}`, sub: null, shop: o.account?.name ?? `Order Time customer ${o.otCustomerId}`, po: o.customerPO,
      source: o.repName ? `Order Time · ${o.repName}` : 'Order Time',
      status: otStatus(o.status, Array.isArray(o.tracking) && o.tracking.length > 0), extra: null, total: o.total === null ? null : Number(o.total),
    })),
  ].sort((a, b) => b.date.getTime() - a.date.getTime()).slice((page - 1) * PAGE, page * PAGE);
  const total = portalCount + otCount;

  const qs = (over: Record<string, string | number | null>) => {
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries({ show: filter, q, account: accountId, page: null, ...over })) if (v !== null && v !== '' && v !== undefined) p.set(k, String(v));
    return `/orders?${p.toString()}`;
  };

  return (
    <>
    {isAdmin && <AdminNav />}
    <main className="wrap">
      <div className="page-head">
        <div>
          <h1 className="display">Orders{forAccount ? ` · ${forAccount.name}` : ''}</h1>
          <p>
            {isAdmin
              ? `Every sales order: portal orders and Order Time history. ${waitingCount} waiting on ACH / wire payment${issueCount ? ` · ${issueCount} approved but not in Order Time yet` : ''}.`
              : user.role === 'REP' ? 'Every order from your shops, including ones placed before the portal.' : 'Every order your shop has placed with us, including ones from before the portal.'}
          </p>
        </div>
      </div>

      <div className={isAdmin ? 'two' : undefined}>
        <section className="panel">
          <form className="filters" action="/orders" method="get" style={{ marginBottom: 12 }}>
            <div className="field" style={{ flex: '1 1 240px' }}>
              <label htmlFor="q">Search</label>
              <input id="q" name="q" defaultValue={q} placeholder={user.role === 'BUYER' || user.role === 'VIEW_ONLY' ? 'Sales order # or PO' : 'Sales order #, PO or shop'} />
            </div>
            <input type="hidden" name="show" value={filter} />
            {accountId && <input type="hidden" name="account" value={accountId} />}
            <button className="btn btn-dark" type="submit">Search</button>
            {(q || accountId) && <Link className="btn btn-ghost" href={`/orders?show=${filter}`}>Clear</Link>}
          </form>
          <div className="chips" role="group" aria-label="Filter orders" style={{ marginBottom: 12 }}>
            {FILTERS.filter(([k]) => isAdmin || k !== 'issues').map(([k, label]) => (
              <Link key={k} href={qs({ show: k })} className="btn btn-sm btn-ghost" aria-current={filter === k ? 'page' : undefined}
                style={filter === k ? { background: 'var(--night)', color: 'var(--night-text)', borderColor: 'var(--night)' } : undefined}>
                {label}{k === 'waiting' && waitingCount ? ` (${waitingCount})` : ''}
              </Link>
            ))}
          </div>
          <p className="muted" style={{ margin: '0 0 8px' }}>
            {total} order{total === 1 ? '' : 's'}
            {showOt && !lastSync && ' · Order Time history is still importing, check back in a few minutes'}
          </p>

          {rows.length ? (
            <div className="table-wrap">
              <table>
                <thead><tr><th>Order</th><th>Shop</th><th>Placed</th><th>Status</th><th className="num">Total</th></tr></thead>
                <tbody>
                  {rows.map(r => (
                    <tr key={r.key}>
                      <td><Link href={r.href}><b>{r.label}</b></Link><span className="sub">{[r.sub, r.source].filter(Boolean).join(' · ')}</span></td>
                      <td>{r.shop}{r.po && <span className="sub">PO {r.po}</span>}</td>
                      <td>{r.dateText}</td>
                      <td>
                        <span className={`pill ${r.status.pill}`}>{r.status.text}</span>
                        {r.extra && <span className="sub" style={{ color: 'var(--red-ink)' }}>{r.extra}</span>}
                      </td>
                      <td className="num">{r.total === null ? <span className="muted">—</span> : <b>{money(r.total)}</b>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : <p className="empty">{q ? 'No orders match.' : 'No orders here yet.'}</p>}

          {total > PAGE && (
            <div style={{ display: 'flex', gap: 10, justifyContent: 'center', marginTop: 16 }}>
              {page > 1 && <Link className="btn btn-ghost btn-sm" href={qs({ page: page - 1 })}>Newer</Link>}
              <span className="muted" style={{ alignSelf: 'center' }}>Page {page} of {Math.ceil(total / PAGE)}</span>
              {page * PAGE < total && <Link className="btn btn-ghost btn-sm" href={qs({ page: page + 1 })}>Older</Link>}
            </div>
          )}
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
    </>
  );
}
