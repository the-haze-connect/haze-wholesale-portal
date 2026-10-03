import Link from 'next/link';
import { db } from '@/lib/db';
import { fmtDate } from '@/lib/order-access';

export const dynamic = 'force-dynamic';

const SHOW = [['PENDING', 'Waiting for review'], ['APPROVED', 'Approved'], ['DECLINED', 'Declined']] as const;

export default async function RequestsAdmin({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const show = SHOW.some(([k]) => k === sp.show) ? sp.show as 'PENDING' : 'PENDING';
  const rows = await db.accessRequest.findMany({ where: { status: show }, orderBy: { createdAt: show === 'PENDING' ? 'asc' : 'desc' }, take: 200 });
  return (
    <main className="wrap">
      <div className="page-head">
        <div>
          <h1 className="display">Wholesale requests</h1>
          <p>Shops apply at <a href="/apply">/apply</a> (linked from the sign-in page). Each request creates a lead in Order Time; approving converts it to a customer and emails the buyer their login.</p>
        </div>
      </div>
      <section className="panel">
        <div className="chips" role="group" aria-label="Show" style={{ marginBottom: 12 }}>
          {SHOW.map(([k, label]) => (
            <Link key={k} href={`/admin/requests?show=${k}`} className="btn btn-sm btn-ghost" aria-current={show === k ? 'page' : undefined}
              style={show === k ? { background: 'var(--night)', color: 'var(--night-text)', borderColor: 'var(--night)' } : undefined}>{label}</Link>
          ))}
        </div>
        {rows.length ? (
          <div className="table-wrap">
            <table>
              <thead><tr><th>Business</th><th>Location</th><th>Contact</th><th>Rep named</th><th>Order Time</th><th>Received</th></tr></thead>
              <tbody>
                {rows.map(r => (
                  <tr key={r.id}>
                    <td><Link href={`/admin/requests/${r.id}`}><b>{r.businessName}</b></Link>{r.storeType && <span className="sub">{r.storeType}</span>}</td>
                    <td>{r.city}, {r.state}</td>
                    <td>{r.contactName}<span className="sub">{r.email}</span></td>
                    <td>{r.repName ?? <span className="muted">—</span>}</td>
                    <td>{r.customerId ? <span className="pill pill-in">Customer {r.customerId}</span> : r.leadId ? <span className="pill pill-in">Lead {r.leadId}</span> : <span className="pill pill-low">No lead yet</span>}</td>
                    <td>{fmtDate(r.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <p className="empty">{show === 'PENDING' ? 'No requests waiting. New ones show up here and in your inbox.' : 'None yet.'}</p>}
      </section>
    </main>
  );
}
