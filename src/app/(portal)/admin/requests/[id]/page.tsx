import Link from 'next/link';
import { notFound } from 'next/navigation';
import { db } from '@/lib/db';
import { fmtDate } from '@/lib/order-access';
import { BLOCKED_STATES } from '@/lib/rules';
import { ApproveForm, DeclineForm, RetryLeadButton } from '../forms';

export const dynamic = 'force-dynamic';

export default async function RequestDetail({ params }: { params: Promise<{ id: string }> }) {
  const id = Number((await params).id);
  if (!Number.isInteger(id)) notFound();
  const r = await db.accessRequest.findUnique({ where: { id } });
  if (!r) notFound();
  const [reps, levels, accounts, doc, similar] = await Promise.all([
    db.rep.findMany({ where: { active: true }, orderBy: [{ commissioned: 'desc' }, { name: 'asc' }] }),
    db.priceLevel.findMany({ where: { active: true }, orderBy: { name: 'asc' } }),
    db.account.findMany({ where: { status: { not: 'CLOSED' } }, select: { id: true, name: true }, orderBy: { name: 'asc' } }),
    r.documentId ? db.document.findUnique({ where: { id: r.documentId }, select: { name: true, mime: true, bytes: true } }) : null,
    db.account.findMany({ where: { name: { contains: r.businessName.split(/\s+/)[0] ?? r.businessName, mode: 'insensitive' } }, select: { id: true, name: true, shipState: true }, take: 5 }),
  ]);
  const defaultRep = r.repName ? reps.find(x => x.name === r.repName)?.id ?? null : null;
  const row = (label: string, value: React.ReactNode) => value ? <div className="sum-row"><span>{label}</span><b style={{ textAlign: 'right' }}>{value}</b></div> : null;

  return (
    <main className="wrap">
      <div className="page-head">
        <div>
          <p className="label"><Link href="/admin/requests">Wholesale requests</Link></p>
          <h1 className="display">{r.businessName}</h1>
          <p>{r.city}, {r.state} · received {fmtDate(r.createdAt)}</p>
        </div>
        <span className={`pill ${r.status === 'PENDING' ? 'pill-low' : r.status === 'APPROVED' ? 'pill-in' : 'pill-out'}`} style={{ fontSize: 14 }}>
          {r.status === 'PENDING' ? 'Waiting for review' : r.status === 'APPROVED' ? 'Approved' : 'Declined'}
        </span>
      </div>

      {BLOCKED_STATES.includes(r.state) && <p className="note-warn">{r.state} is a blocked state. This request can’t be approved.</p>}

      <div className="two">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 28 }}>
          <section className="panel">
            <div className="panel-head"><h2 className="display">Application</h2></div>
            {row('Contact', `${r.contactName}`)}
            {row('Email', <a href={`mailto:${r.email}`}>{r.email}</a>)}
            {row('Phone', r.phone)}
            {row('Ship-to', <>{r.addr1}{r.addr2 ? `, ${r.addr2}` : ''}<br />{r.city}, {r.state} {r.zip}</>)}
            {row('Type of business', r.storeType)}
            {row('Hemp / business license #', r.licenseNumber)}
            {row('Resale / sales tax permit #', r.resaleNumber)}
            {row('Website / social', r.website && (/^https?:\/\//.test(r.website) ? <a href={r.website} target="_blank" rel="noreferrer">{r.website}</a> : r.website))}
            {row('Rep named', r.repName)}
            {row('Document', doc && <a href={`/admin/requests/${r.id}/document`} target="_blank" rel="noreferrer">{doc.name} ({Math.round(doc.bytes / 1024)} KB)</a>)}
            {r.notes && <p style={{ marginTop: 12 }}><span className="label">Notes</span><br />{r.notes}</p>}
          </section>

          {similar.length > 0 && r.status === 'PENDING' && (
            <section className="panel">
              <p className="label">Possible existing accounts</p>
              <p className="muted" style={{ fontSize: 13.5 }}>Accounts with a similar name. If this shop is already a customer, approve it as “Already a customer.”</p>
              {similar.map(a => <div key={a.id} className="sum-row"><span><Link href={`/admin/accounts/${a.id}`}>{a.name}</Link></span><b>{a.shipState ?? ''}</b></div>)}
            </section>
          )}
        </div>

        <aside className="rail">
          <section className="panel" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <p className="label">Order Time</p>
            {r.customerId ? <p style={{ margin: 0 }}>Customer <b>{r.customerId}</b>{r.leadId ? ` (from lead ${r.leadId})` : ''}</p>
              : r.leadId ? <p style={{ margin: 0 }}>Lead <b>{r.leadId}</b> created</p>
              : <>
                  <p className="note-warn">No lead yet{r.leadError ? `: ${r.leadError}` : ''}</p>
                  {r.status === 'PENDING' && <RetryLeadButton requestId={r.id} />}
                </>}
            {r.accountId && <Link className="btn btn-ghost btn-sm" href={`/admin/accounts/${r.accountId}`}>Open portal account</Link>}
          </section>

          {r.status === 'PENDING' && !BLOCKED_STATES.includes(r.state) && (
            <section className="panel">
              <p className="label">Approve</p>
              <ApproveForm requestId={r.id} hasLead={!!r.leadId} defaultRepId={defaultRep}
                reps={reps.map(x => ({ id: x.id, name: `${x.name}${x.commissioned ? '' : ' (house)'}` }))}
                levels={levels.map(l => ({ id: l.id, name: l.name }))} accounts={accounts} />
            </section>
          )}
          {r.status === 'PENDING' && (
            <section className="panel">
              <p className="label">Decline</p>
              <DeclineForm requestId={r.id} />
            </section>
          )}
          {r.status !== 'PENDING' && (
            <section className="panel">
              <p className="label">Reviewed</p>
              <p style={{ margin: 0 }}>{r.status === 'APPROVED' ? 'Approved' : 'Declined'} by {r.reviewedBy}{r.reviewedAt ? ` · ${fmtDate(r.reviewedAt)}` : ''}</p>
              {r.declineReason && <p className="muted" style={{ marginBottom: 0 }}>Reason: {r.declineReason}</p>}
            </section>
          )}
        </aside>
      </div>
    </main>
  );
}
