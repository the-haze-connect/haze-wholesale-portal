import Link from 'next/link';
import { db } from '@/lib/db';
import { healthReport } from '@/lib/health';

export const dynamic = 'force-dynamic';

const PREVIEW = 25;

export default async function DataHealth() {
  const [{ lists, syncedAt }, noPhoto] = await Promise.all([
    healthReport(),
    db.product.count({ where: { active: true, wholesale: true, visible: true, available: { gt: 0 }, OR: [{ photoOverride: 'none' }, { photoOverride: null, photoUrl: null }] } }),
  ]);
  const synced = syncedAt ? new Date(syncedAt).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: 'America/Chicago' }) : null;

  return (
    <main className="wrap">
      <div className="page-head">
        <div>
          <h1 className="display">Data health</h1>
          <p>What to fix in Order Time so pricing, shipping and orders work smoothly. Lists update with every sync{synced ? ` (last: ${synced})` : ''}; fixes made in Order Time show up here within 5 minutes.</p>
        </div>
        <a className="btn btn-ghost" href="/admin/health/export">Download everything (CSV)</a>
      </div>

      <div className="kpis">
        {lists.map(l => (
          <a key={l.key} href={`#${l.key}`} className="kpi" style={{ textDecoration: 'none', color: 'inherit' }}>
            <small>{l.title}</small><strong style={l.rows.length ? undefined : { color: 'var(--kush-ink)' }}>{l.error ? '—' : l.rows.length}</strong>
          </a>
        ))}
        <Link href="/admin/products?show=nophoto" className="kpi" style={{ textDecoration: 'none', color: 'inherit' }}>
          <small>In-stock items without a photo</small><strong>{noPhoto}</strong>
        </Link>
      </div>

      {lists.map(l => (
        <section key={l.key} id={l.key} className="panel">
          <div className="panel-head">
            <h2 className="display" style={{ fontSize: 20 }}>{l.title} <span className={`pill ${l.rows.length ? 'pill-low' : 'pill-in'}`} style={{ verticalAlign: 'middle' }}>{l.error ? 'not checked' : l.rows.length ? l.rows.length : 'All clear'}</span></h2>
            {l.rows.length > 0 && <a className="btn btn-ghost btn-sm" href={`/admin/health/export?list=${l.key}`}>Download CSV</a>}
          </div>
          {l.error ? <p className="note-warn">{l.error}</p> : (
            <>
              <p style={{ margin: '0 0 4px', color: 'var(--ink-2)' }}>{l.why}</p>
              <p style={{ margin: '0 0 12px', fontSize: 14 }}><b>Fix:</b> {l.fix}</p>
              {l.rows.length > 0 && (
                <div className="table-wrap">
                  <table>
                    <thead><tr>{l.columns.map(c => <th key={c}>{c}</th>)}</tr></thead>
                    <tbody>{l.rows.slice(0, PREVIEW).map((r, i) => <tr key={i}>{r.map((v, j) => <td key={j}>{String(v)}</td>)}</tr>)}</tbody>
                  </table>
                </div>
              )}
              {l.rows.length > PREVIEW && <p className="muted" style={{ marginBottom: 0 }}>Showing {PREVIEW} of {l.rows.length}. Download the CSV for the full list.</p>}
            </>
          )}
        </section>
      ))}
    </main>
  );
}
