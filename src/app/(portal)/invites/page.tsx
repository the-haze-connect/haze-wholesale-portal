import { db } from '@/lib/db';
import { requireUser } from '@/lib/session';
import { AdminNav } from '../admin/nav';
import { resendInvite } from './actions';
import { InviteBuyerForm, InviteRepForm } from './forms';

export const dynamic = 'force-dynamic';

const fmt = (d: Date) => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'America/Chicago' });

export default async function InvitesPage() {
  const me = await requireUser(['REP', 'ADMIN']);
  const isAdmin = me.role === 'ADMIN';
  const accountWhere = isAdmin ? { status: 'ACTIVE' as const } : { status: 'ACTIVE' as const, repId: me.repId ?? -1 };

  const [accounts, buyers, reps] = await Promise.all([
    db.account.findMany({ where: accountWhere, select: { id: true, name: true }, orderBy: { name: 'asc' } }),
    db.buyerUser.findMany({
      where: { role: { in: ['BUYER', 'VIEW_ONLY'] }, account: isAdmin ? undefined : { repId: me.repId ?? -1 } },
      include: { account: { select: { name: true } } },
      orderBy: { createdAt: 'desc' },
      take: 200,
    }),
    isAdmin ? db.rep.findMany({ where: { active: true }, orderBy: [{ commissioned: 'desc' }, { name: 'asc' }] }) : Promise.resolve([]),
  ]);
  const withLogin = new Set(buyers.map(b => b.accountId));
  const noLogin = accounts.filter(a => !withLogin.has(a.id)).length;

  return (
    <>
    {(isAdmin) && <AdminNav />}
    <main className="wrap">
      <div className="page-head">
        <div>
          <h1 className="display">Invites</h1>
          <p>{isAdmin ? 'Invite buyers for any shop, and give reps their own login.' : `Invite buyers at your ${accounts.length} shops. ${noLogin} of them don’t have a login yet.`}</p>
        </div>
      </div>

      <div className="two">
        <section className="panel">
          <div className="panel-head"><h2 className="display">Invited buyers</h2></div>
          {buyers.length ? (
            <div className="table-wrap">
              <table>
                <thead><tr><th>Buyer</th><th>Shop</th><th>Access</th><th>Status</th><th><span className="sr">Resend</span></th></tr></thead>
                <tbody>
                  {buyers.map(b => (
                    <tr key={b.id}>
                      <td><b>{b.name ?? b.email}</b><span className="sub">{b.email}</span></td>
                      <td>{b.account?.name ?? '—'}</td>
                      <td>{b.role === 'VIEW_ONLY' ? 'View only' : 'Can order'}</td>
                      <td>{b.lastLogin ? <span className="pill pill-in">Signed in {fmt(b.lastLogin)}</span> : <span className="pill pill-low">Invited {fmt(b.createdAt)}</span>}</td>
                      <td className="num">{!b.lastLogin && (
                        <form action={resendInvite}><input type="hidden" name="userId" value={b.id} /><button className="btn btn-ghost btn-sm" type="submit">Resend</button></form>
                      )}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : <p className="empty">No buyers invited yet. Use the form to send the first invite.</p>}
        </section>

        <aside className="rail">
          <section className="panel">
            <p className="label">Invite a buyer</p>
            {accounts.length ? <InviteBuyerForm accounts={accounts} /> : <p className="empty">No active shops are assigned to you in Order Time yet.</p>}
          </section>
          {isAdmin && (
            <section className="panel">
              <p className="label">Add a rep login</p>
              <InviteRepForm reps={reps.map(r => ({ id: r.id, name: r.name, commissioned: r.commissioned }))} />
            </section>
          )}
        </aside>
      </div>
    </main>
    </>
  );
}
