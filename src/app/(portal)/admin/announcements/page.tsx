import Link from 'next/link';
import { db } from '@/lib/db';
import { deleteAnnouncement, toggleAnnouncement } from './actions';
import { AnnouncementForm, type AnnouncementDraft } from './form';

export const dynamic = 'force-dynamic';

const fmt = (d: Date) => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'America/Chicago' });
const ymd = (d: Date) => d.toLocaleDateString('en-CA', { timeZone: 'America/Chicago' });
const TYPE_LABEL = { DEAL: 'Deal', DELAY: 'Delay/Back Order', NEWS: 'News' } as const;

export default async function AnnouncementsAdmin({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const editId = Number((await searchParams).edit) || null;
  const rows = await db.announcement.findMany({ orderBy: [{ pinned: 'desc' }, { createdAt: 'desc' }], take: 100 });
  const now = new Date();
  const editing = editId ? rows.find(r => r.id === editId) : null;

  const draft: AnnouncementDraft = editing
    ? { id: editing.id, type: editing.type, title: editing.title, body: editing.body, ctaLabel: editing.ctaLabel ?? '', ctaCategory: editing.ctaCategory ?? '', pinned: editing.pinned, live: editing.live, endsAt: editing.endsAt ? ymd(editing.endsAt) : '', emailed: editing.emailed }
    : { id: null, type: 'DEAL', title: '', body: '', ctaLabel: '', ctaCategory: '', pinned: false, live: true, endsAt: '', emailed: false };

  const status = (r: (typeof rows)[number]) =>
    !r.live ? { text: 'Hidden', pill: 'pill-out' } :
    r.endsAt && r.endsAt <= now ? { text: `Ended ${fmt(r.endsAt)}`, pill: 'pill-out' } :
    { text: r.endsAt ? `Live · ends ${fmt(r.endsAt)}` : 'Live', pill: 'pill-in' };

  return (
    <main className="wrap">
      <div className="page-head">
        <div>
          <h1 className="display">Announcements</h1>
          <p>Deals, delays, back orders and news on every buyer’s home page. One announcement can be pinned as the banner at the top.</p>
        </div>
      </div>
      <div className="two">
        <section className="panel">
          <div className="panel-head"><h2 className="display">Posted</h2></div>
          {rows.length ? (
            <div className="table-wrap">
              <table>
                <thead><tr><th>Announcement</th><th>Status</th><th><span className="sr">Actions</span></th></tr></thead>
                <tbody>
                  {rows.map(r => {
                    const s = status(r);
                    return (
                      <tr key={r.id} style={editId === r.id ? { background: 'var(--gold-tint)' } : undefined}>
                        <td>
                          <span className={`tag t-${r.type}`}>{TYPE_LABEL[r.type]}</span>{r.pinned && <span className="tag" style={{ marginLeft: 6, background: 'var(--night)', color: 'var(--night-text)' }}>Pinned</span>}
                          <b style={{ display: 'block', marginTop: 4 }}>{r.title}</b>
                          <span className="sub">Posted {fmt(r.createdAt)}{r.emailed ? ' · emailed to buyers' : ''}</span>
                        </td>
                        <td><span className={`pill ${s.pill}`}>{s.text}</span></td>
                        <td>
                          <div className="row-actions">
                            <Link className="btn btn-ghost btn-sm" href={`/admin/announcements?edit=${r.id}`}>Edit</Link>
                            <form action={toggleAnnouncement}><input type="hidden" name="id" value={r.id} /><input type="hidden" name="field" value="pinned" /><button className="btn btn-ghost btn-sm" type="submit">{r.pinned ? 'Unpin' : 'Pin'}</button></form>
                            <form action={toggleAnnouncement}><input type="hidden" name="id" value={r.id} /><input type="hidden" name="field" value="live" /><button className="btn btn-ghost btn-sm" type="submit">{r.live ? 'Hide' : 'Show'}</button></form>
                            <form action={deleteAnnouncement}><input type="hidden" name="id" value={r.id} /><button className="btn btn-ghost btn-sm" type="submit" style={{ color: 'var(--red-ink)' }}>Delete</button></form>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : <p className="empty">Nothing posted yet. Your first deal or shipping update will show on every buyer’s home page.</p>}
        </section>
        <aside className="rail">
          <section className="panel">
            <div className="panel-head"><h2 className="display">{editing ? 'Edit announcement' : 'New announcement'}</h2></div>
            <AnnouncementForm draft={draft} />
          </section>
        </aside>
      </div>
    </main>
  );
}
