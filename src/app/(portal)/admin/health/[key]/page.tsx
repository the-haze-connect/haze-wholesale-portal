import Link from 'next/link';
import { notFound } from 'next/navigation';
import { healthReport } from '@/lib/health';
import { HealthTable } from '../table';

export const dynamic = 'force-dynamic';

const PAGE = 50;

export default async function HealthList({ params, searchParams }: { params: Promise<{ key: string }>; searchParams: Promise<Record<string, string | undefined>> }) {
  const { key } = await params;
  const sp = await searchParams;
  const { lists } = await healthReport();
  const list = lists.find(l => l.key === key);
  if (!list) notFound();

  const q = (sp.q ?? '').trim().toLowerCase();
  const filtered = list.rows
    .map((row, i) => ({ row, i }))
    .filter(({ row }) => !q || row.some(v => String(v).toLowerCase().includes(q)));
  const pages = Math.max(1, Math.ceil(filtered.length / PAGE));
  const page = Math.min(pages, Math.max(1, Number(sp.page) || 1));
  const slice = filtered.slice((page - 1) * PAGE, page * PAGE);
  // Keep each row's own link when searching
  const view = { ...list, links: slice.map(({ i }) => list.links?.[i] ?? null) };
  const qs = (p: number) => `/admin/health/${key}?${new URLSearchParams({ ...(q ? { q } : {}), page: String(p) })}`;
  const idx = lists.findIndex(l => l.key === key);
  const prev = lists[idx - 1], next = lists[idx + 1];

  return (
    <main className="wrap">
      <div className="page-head">
        <div>
          <p className="label"><Link href="/admin/health">Data health</Link></p>
          <h1 className="display">{list.title}</h1>
          <p>{list.why}</p>
        </div>
        {list.rows.length > 0 && <a className="btn btn-ghost" href={`/admin/health/export?list=${key}`}>Download CSV</a>}
      </div>

      <nav className="subnav" aria-label="Issues">
        {lists.map(l => (
          <Link key={l.key} href={`/admin/health/${l.key}`} aria-current={l.key === key ? 'page' : undefined}>
            {l.title.replace(/^Accounts (with |on |in )?/, '').replace(/^Items with a /, '').replace(/^./, c => c.toUpperCase())}
            {l.rows.length ? <span className="count">{l.rows.length}</span> : null}
          </Link>
        ))}
      </nav>

      <section className="panel">
        {list.error ? <p className="note-warn">{list.error}</p> : (
          <>
            <p style={{ margin: '0 0 14px', fontSize: 14.5 }}><b>Fix:</b> {list.fix}</p>
            {list.rows.length ? (
              <>
                <form className="filters" action={`/admin/health/${key}`} method="get" style={{ marginBottom: 12 }}>
                  <div className="field" style={{ flex: '1 1 260px' }}><label htmlFor="q">Search this list</label><input id="q" name="q" defaultValue={sp.q ?? ''} placeholder="Name, code, rep, state…" /></div>
                  <button className="btn btn-dark" type="submit">Search</button>
                  {q && <Link className="btn btn-ghost" href={`/admin/health/${key}`}>Clear</Link>}
                </form>
                <p className="muted" style={{ margin: '0 0 8px' }}>
                  {filtered.length ? `Showing ${(page - 1) * PAGE + 1}–${Math.min(page * PAGE, filtered.length)} of ${filtered.length}` : 'No matches'}{q ? ` matching “${sp.q}”` : ''}
                </p>
                {slice.length > 0 && <HealthTable list={view} rows={slice.map(s => s.row)} />}
                {pages > 1 && (
                  <div style={{ display: 'flex', gap: 10, justifyContent: 'center', alignItems: 'center', marginTop: 16, flexWrap: 'wrap' }}>
                    {page > 1 ? <Link className="btn btn-ghost btn-sm" href={qs(page - 1)}>← Previous</Link> : <span />}
                    <span className="muted">Page {page} of {pages}</span>
                    {page < pages ? <Link className="btn btn-ghost btn-sm" href={qs(page + 1)}>Next →</Link> : <span />}
                  </div>
                )}
              </>
            ) : <p className="note-ok">All clear. Nothing to fix here.</p>}
          </>
        )}
      </section>

      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        {prev ? <Link className="btn btn-ghost" href={`/admin/health/${prev.key}`}>← {prev.title}</Link> : <span />}
        {next ? <Link className="btn btn-ghost" href={`/admin/health/${next.key}`}>{next.title} →</Link> : <span />}
      </div>
    </main>
  );
}
