'use client';

import { useState } from 'react';
import type { AnnouncementView } from '@/lib/announcements';

const LABEL = { DEAL: 'Deal', DELAY: 'Delay/Back Order', NEWS: 'News' } as const;
const ICON = {
  DEAL: <><path d="M20.6 13.4 13.4 20.6a2 2 0 0 1-2.8 0L3 13V3h10l7.6 7.6a2 2 0 0 1 0 2.8Z" /><circle cx="7.5" cy="7.5" r="1.5" /></>,
  DELAY: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
  NEWS: <><path d="M4 5h13v14H6a2 2 0 0 1-2-2V5Z" /><path d="M17 9h3v8a2 2 0 0 1-2 2" /><path d="M8 9h5M8 13h5" /></>,
};

export function AnnouncementFeed({ items }: { items: AnnouncementView[] }) {
  const [filter, setFilter] = useState<'ALL' | keyof typeof LABEL>('ALL');
  const tabs = [['ALL', 'All'], ['DEAL', 'Deals'], ['DELAY', 'Delay/Back Order'], ['NEWS', 'News']] as const;
  const shown = items.filter(a => filter === 'ALL' || a.type === filter);
  return (
    <section className="panel" id="news" aria-labelledby="news-h">
      <div className="panel-head">
        <h2 className="display" id="news-h">Announcements</h2>
        <div className="seg" role="group" aria-label="Filter announcements">
          {tabs.map(([k, l]) => (
            <button key={k} type="button" aria-pressed={filter === k} onClick={() => setFilter(k)}>
              {l} <span style={{ opacity: .65, fontWeight: 500 }}>{k === 'ALL' ? items.length : items.filter(a => a.type === k).length}</span>
            </button>
          ))}
        </div>
      </div>
      {shown.length ? shown.map(a => (
        <article className="ann" key={a.id}>
          <div className={`ann-ico t-${a.type}`}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{ICON[a.type]}</svg>
          </div>
          <div className="ann-body">
            <div className="ann-meta"><span className={`tag t-${a.type}`}>{LABEL[a.type]}</span><span>{a.date}</span>{a.endsAt ? <span>Ends {a.endsAt}</span> : null}</div>
            <h3>{a.title}</h3>
            <p>{a.body}</p>
          </div>
        </article>
      )) : (
        <p className="empty">{items.length ? 'Nothing in this category right now.' : 'No announcements yet. Deals, delays, back orders and news from our team will show up here.'}</p>
      )}
    </section>
  );
}
