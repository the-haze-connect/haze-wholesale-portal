import Link from 'next/link';
import type { Prisma } from '@prisma/client';
import { money } from '@/components/format';
import { db } from '@/lib/db';
import { BLOCKED_STATES } from '@/lib/rules';

export const dynamic = 'force-dynamic';

const SHOW = [
  ['active', 'Active'], ['nologin', 'No login yet'], ['notier', 'No price tier'], ['nostate', 'No state'],
  ['blocked', 'Blocked state'], ['hold', 'On hold'], ['closed', 'Closed'], ['all', 'All'],
] as const;
const STATUS = { ACTIVE: ['Active', 'pill-in'], ON_HOLD: ['On hold', 'pill-low'], CLOSED: ['Closed', 'pill-out'], PENDING: ['Pending', 'pill-low'] } as const;
const PAGE = 100;

export default async function AccountsAdmin({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const q = (sp.q ?? '').trim();
  const show = SHOW.some(([k]) => k === sp.show) ? sp.show! : 'active';
  const repId = Number(sp.rep) || null;
  const page = Math.max(1, Number(sp.page) || 1);

  const where: Prisma.AccountWhereInput = {
    ...(q ? { name: { contains: q, mode: 'insensitive' } } : {}),
    ...(repId ? { repId } : {}),
    ...(show === 'active' ? { status: 'ACTIVE' } :
      show === 'hold' ? { status: 'ON_HOLD' } :
      show === 'closed' ? { status: 'CLOSED' } :
      show === 'nologin' ? { status: 'ACTIVE', users: { none: {} } } :
      show === 'notier' ? { status: 'ACTIVE', OR: [{ priceLevelId: null }, { priceLevel: { active: false } }] } :
      show === 'nostate' ? { status: 'ACTIVE', shipState: null } :
      show === 'blocked' ? { shipState: { in: BLOCKED_STATES } } : {}),
  };

  const [accounts, total, reps, counts] = await Promise.all([
    db.account.findMany({
      where, orderBy: { name: 'asc' }, skip: (page - 1) * PAGE, take: PAGE,
      include: { priceLevel: true, rep: true, _count: { select: { users: true, orders: true } } },
    }),
    db.account.count({ where }),
    db.rep.findMany({ orderBy: [{ active: 'desc' }, { name: 'asc' }] }),
    Promise.all([
      db.account.count({ where: { status: 'ACTIVE' } }),
      db.account.count({ where: { status: 'ACTIVE', users: { some: {} } } }),
      db.account.count({ where: { status: 'ACTIVE', OR: [{ priceLevelId: null }, { priceLevel: { active: false } }] } }),
      db.account.count({ where: { shipState: { in: BLOCKED_STATES } } }),
    ]),
  ]);
  const sales = accounts.length
    ? await db.order.groupBy({ by: ['accountId'], where: { accountId: { in: accounts.map(a => a.id) }, status: 'APPROVED' }, _sum: { subtotal: true } })
    : [];
  const salesBy = new Map(sales.map(s => [s.accountId, Number(s._sum.subtotal ?? 0)]));
  const [activeCount, withLogin, noTier, blocked] = counts;
  const qs = (over: Record<string, string | number | null>) => {
    const p = new URLSearchParams();
    const merged = { q, show, rep: repId, page: null, ...over };
    for (const [k, v] of Object.entries(merged)) if (v !== null && v !== '' && v !== undefined) p.set(k, String(v));
    return `/admin/accounts?${p.toString()}`;
  };

  return (
    <main className="wrap">
      <div className="page-head">
        <div>
          <h1 className="display">Accounts</h1>
          <p>Synced from Order Time every 5 minutes. Tier, rep and address are edited in Order Time; ordering status and logins are managed here.</p>
        </div>
      </div>

      <div className="kpis">
        <div className="kpi"><small>Active accounts</small><strong>{activeCount}</strong></div>
        <div className="kpi"><small>With a portal login</small><strong>{withLogin}</strong></div>
        <div className="kpi"><small>No current price tier</small><strong>{noTier}</strong></div>
        <div className="kpi"><small>In blocked states</small><strong>{blocked}</strong></div>
      </div>

      <section className="panel">
        <form className="filters" action="/admin/accounts" method="get" style={{ marginBottom: 12 }}>
          <div className="field" style={{ flex: '1 1 240px' }}><label htmlFor="q">Search</label><input id="q" name="q" defaultValue={q} placeholder="Shop name" /></div>
          <div className="field">
            <label htmlFor="rep">Rep</label>
            <select id="rep" name="rep" defaultValue={repId ?? ''}>
              <option value="">All reps</option>
              {reps.map(r => <option key={r.id} value={r.id}>{r.name}{r.commissioned ? '' : ' (house)'}</option>)}
            </select>
          </div>
          <input type="hidden" name="show" value={show} />
          <button className="btn btn-dark" type="submit">Search</button>
        </form>
        <div className="chips" role="group" aria-label="Show" style={{ marginBottom: 8 }}>
          {SHOW.map(([k, label]) => (
            <Link key={k} href={qs({ show: k })} className="btn btn-sm btn-ghost" aria-current={show === k ? 'page' : undefined}
              style={show === k ? { background: 'var(--night)', color: 'var(--night-text)', borderColor: 'var(--night)' } : undefined}>{label}</Link>
          ))}
        </div>
        <p className="muted" style={{ margin: '8px 0' }}>{total} account{total === 1 ? '' : 's'}</p>

        {accounts.length ? (
          <div className="table-wrap">
            <table>
              <thead><tr><th>Shop</th><th>Tier</th><th>Rep</th><th>State</th><th>Status</th><th className="num">Logins</th><th className="num">Portal sales</th><th><span className="sr">Actions</span></th></tr></thead>
              <tbody>
                {accounts.map(a => {
                  const tierOk = a.priceLevel?.active;
                  const blockedState = a.shipState && BLOCKED_STATES.includes(a.shipState);
                  const [label, pill] = STATUS[a.status];
                  return (
                    <tr key={a.id}>
                      <td><Link href={`/admin/accounts/${a.id}`}><b>{a.name}</b></Link>{a.terms && <span className="sub">{a.terms}</span>}</td>
                      <td>{tierOk ? a.priceLevel!.name : <span className="muted">{a.priceLevel ? `${a.priceLevel.name} (old) → base` : 'Base price'}</span>}</td>
                      <td>{a.rep ? <>{a.rep.name}{!a.rep.commissioned && <span className="sub">House</span>}</> : <span className="muted">House</span>}</td>
                      <td>{a.shipState ? (blockedState ? <span className="pill pill-out">{a.shipState} blocked</span> : a.shipState) : <span className="muted">Missing</span>}</td>
                      <td><span className={`pill ${pill}`}>{label}</span></td>
                      <td className="num">{a._count.users || <span className="muted">0</span>}</td>
                      <td className="num">{salesBy.get(a.id) ? money(salesBy.get(a.id)!) : <span className="muted">—</span>}</td>
                      <td>
                        <div className="row-actions">
                          {a.status === 'ACTIVE' && !blockedState && <Link className="btn btn-ghost btn-sm" href={`/?for=${a.id}`}>Order for</Link>}
                          <Link className="btn btn-ghost btn-sm" href={`/admin/accounts/${a.id}`}>Open</Link>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : <p className="empty">No accounts match.</p>}

        {total > PAGE && (
          <div style={{ display: 'flex', gap: 10, justifyContent: 'center', marginTop: 16 }}>
            {page > 1 && <Link className="btn btn-ghost btn-sm" href={qs({ page: page - 1 })}>Previous</Link>}
            <span className="muted" style={{ alignSelf: 'center' }}>Page {page} of {Math.ceil(total / PAGE)}</span>
            {page * PAGE < total && <Link className="btn btn-ghost btn-sm" href={qs({ page: page + 1 })}>Next</Link>}
          </div>
        )}
      </section>
    </main>
  );
}
