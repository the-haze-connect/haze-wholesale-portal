'use client';

import Link from 'next/link';
import { useActionState, useState } from 'react';
import { saveAnnouncement, type FormResult } from './actions';

export interface AnnouncementDraft {
  id: number | null;
  type: 'DEAL' | 'DELAY' | 'NEWS';
  title: string;
  body: string;
  ctaLabel: string;
  ctaCategory: string;
  pinned: boolean;
  live: boolean;
  endsAt: string; // YYYY-MM-DD
  emailed: boolean;
}

const CATEGORIES = ['Flower', 'Pre-Rolls', 'Vapes', 'Concentrates', 'Edibles', 'Bulk Flower'];
const TYPE_LABEL = { DEAL: 'Deal', DELAY: 'Delay', NEWS: 'News' } as const;

export function AnnouncementForm({ draft }: { draft: AnnouncementDraft }) {
  const [state, action, pending] = useActionState<FormResult | null, FormData>(saveAnnouncement, null);
  const [type, setType] = useState(draft.type);
  const [title, setTitle] = useState(draft.title);
  const [body, setBody] = useState(draft.body);
  const [cta, setCta] = useState(draft.ctaLabel);
  const [pinned, setPinned] = useState(draft.pinned);

  return (
    <form action={action} key={draft.id ?? 'new'} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {draft.id && <input type="hidden" name="id" value={draft.id} />}
      <input type="hidden" name="type" value={type} />
      <div className="seg" role="group" aria-label="Type">
        {(Object.keys(TYPE_LABEL) as (keyof typeof TYPE_LABEL)[]).map(t => (
          <button key={t} type="button" aria-pressed={type === t} onClick={() => setType(t)}>{TYPE_LABEL[t]}</button>
        ))}
      </div>
      <div className="field"><label htmlFor="a-title">Title</label><input id="a-title" name="title" value={title} onChange={e => setTitle(e.target.value)} maxLength={140} required placeholder="e.g. 10% off all vape cases this week" /></div>
      <div className="field"><label htmlFor="a-body">Message</label><textarea id="a-body" name="body" value={body} onChange={e => setBody(e.target.value)} rows={4} maxLength={1500} required /></div>
      <div className="form">
        <div className="field"><label htmlFor="a-cta">Button text <span style={{ fontWeight: 400 }}>(pinned only)</span></label><input id="a-cta" name="ctaLabel" value={cta} onChange={e => setCta(e.target.value)} maxLength={40} placeholder="Shop vapes" /></div>
        <div className="field">
          <label htmlFor="a-cat">Button opens</label>
          <select id="a-cat" name="ctaCategory" defaultValue={draft.ctaCategory}>
            <option value="">All products</option>
            {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
        <div className="field"><label htmlFor="a-ends">Ends on <span style={{ fontWeight: 400 }}>(optional)</span></label><input id="a-ends" name="endsAt" type="date" defaultValue={draft.endsAt} /><span className="hint">Hidden automatically after this day.</span></div>
        <div className="field" style={{ justifyContent: 'center', gap: 10 }}>
          <label className="check"><input type="checkbox" name="pinned" checked={pinned} onChange={e => setPinned(e.target.checked)} /> Pin to the top of the home page</label>
          <label className="check"><input type="checkbox" name="live" value="off" defaultChecked={!draft.live} /> Save as hidden draft</label>
          {!draft.emailed && <label className="check"><input type="checkbox" name="email" /> Email it to all buyers</label>}
        </div>
      </div>

      <div>
        <p className="label" style={{ marginBottom: 8 }}>Preview</p>
        {pinned ? (
          <section className="hero" aria-label="Preview">
            <div className="hero-copy">
              <div className="meta"><span className="tag-solid">{TYPE_LABEL[type]}</span><span>Pinned</span></div>
              <h2 className="display" style={{ fontSize: 30 }}>{title || 'Your title'}</h2>
              <p>{body || 'Your message'}</p>
            </div>
            {cta && <div style={{ position: 'relative', zIndex: 1 }}><span className="btn btn-gold">{cta}</span></div>}
          </section>
        ) : (
          <article className="ann" style={{ borderTop: 0, background: 'var(--ground)', borderRadius: 14, padding: 16 }}>
            <div className="ann-body">
              <div className="ann-meta"><span className={`tag t-${type}`}>{TYPE_LABEL[type]}</span><span>Today</span></div>
              <h3>{title || 'Your title'}</h3>
              <p style={{ margin: 0 }}>{body || 'Your message'}</p>
            </div>
          </article>
        )}
      </div>

      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        <button type="submit" className="btn btn-kush" disabled={pending}>{pending ? 'Saving…' : draft.id ? 'Save changes' : 'Post announcement'}</button>
        {draft.id && <Link className="btn btn-ghost" href="/admin/announcements">Cancel editing</Link>}
      </div>
      {state && <p className={state.ok ? 'note-ok' : 'note-warn'} role="status">{state.message}</p>}
    </form>
  );
}
