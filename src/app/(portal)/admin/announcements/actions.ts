'use server';

import { revalidatePath } from 'next/cache';
import { db } from '@/lib/db';
import { linkEmail, sendMail } from '@/lib/mail';
import { appUrl, requireUser } from '@/lib/session';

export interface FormResult { ok: boolean; message: string }

const TYPES = ['DEAL', 'DELAY', 'NEWS'] as const;
const CATEGORIES = ['Flower', 'Pre-Rolls', 'Vapes', 'Concentrates', 'Edibles', 'Bulk Flower'];

function refresh() {
  revalidatePath('/admin/announcements');
  revalidatePath('/');
}

/** Create or update an announcement. Optionally emails it to every buyer who can sign in. */
export async function saveAnnouncement(_: FormResult | null, form: FormData): Promise<FormResult> {
  const me = await requireUser(['ADMIN']);
  const id = Number(form.get('id')) || null;
  const type = TYPES.find(t => t === form.get('type'));
  const title = String(form.get('title') ?? '').trim().slice(0, 140);
  const body = String(form.get('body') ?? '').trim().slice(0, 1500);
  const ctaLabel = String(form.get('ctaLabel') ?? '').trim().slice(0, 40) || null;
  const cat = String(form.get('ctaCategory') ?? '');
  const ctaCategory = CATEGORIES.includes(cat) ? cat : null;
  const pinned = form.get('pinned') === 'on';
  const live = form.get('live') !== 'off';
  const endsRaw = String(form.get('endsAt') ?? '');
  // Date inputs give YYYY-MM-DD; end at 11:59 pm Central that day
  const endsAt = /^\d{4}-\d{2}-\d{2}$/.test(endsRaw) ? new Date(`${endsRaw}T23:59:00-05:00`) : null;
  const email = form.get('email') === 'on';

  if (!type) return { ok: false, message: 'Choose Deal, Delay or News.' };
  if (!title) return { ok: false, message: 'Add a title.' };
  if (!body) return { ok: false, message: 'Add a message.' };

  const data = { type, title, body, ctaLabel, ctaCategory, pinned, live, endsAt };
  const saved = await db.$transaction(async tx => {
    if (pinned) await tx.announcement.updateMany({ where: { pinned: true, ...(id ? { NOT: { id } } : {}) }, data: { pinned: false } });
    return id ? tx.announcement.update({ where: { id }, data }) : tx.announcement.create({ data });
  });
  await db.auditLog.create({ data: { actor: me.email, action: id ? 'announcement.update' : 'announcement.create', detail: { id: saved.id, title } } });

  let note = '';
  if (email && live && !saved.emailed) {
    const sent = await emailBuyers(saved.title, saved.body, saved.type);
    await db.announcement.update({ where: { id: saved.id }, data: { emailed: true } });
    note = ` Emailed to ${sent.ok} buyer${sent.ok === 1 ? '' : 's'}${sent.failed ? ` (${sent.failed} failed)` : ''}.`;
  }
  refresh();
  return { ok: true, message: `${id ? 'Updated' : 'Posted'} “${title}”.${note}` };
}

async function emailBuyers(title: string, body: string, type: string) {
  const buyers = await db.buyerUser.findMany({
    where: { role: { in: ['BUYER', 'VIEW_ONLY'] }, account: { status: 'ACTIVE' } },
    select: { email: true },
  });
  const label = type === 'DEAL' ? 'New deal' : type === 'DELAY' ? 'Heads up' : 'News';
  const { text, html } = linkEmail({ heading: title, intro: body, button: 'Open Haze Wholesale', url: `${appUrl()}/`, note: 'You’re getting this because you have a Haze Wholesale login.' });
  let ok = 0, failed = 0;
  for (const b of buyers) {
    try { await sendMail(b.email, `${label}: ${title}`, text, html); ok++; }
    catch (err) { failed++; console.error('[mail] announcement failed:', err instanceof Error ? err.message : err); }
  }
  return { ok, failed };
}

export async function toggleAnnouncement(form: FormData) {
  await requireUser(['ADMIN']);
  const id = Number(form.get('id'));
  const field = form.get('field') === 'pinned' ? 'pinned' : 'live';
  const row = await db.announcement.findUnique({ where: { id } });
  if (!row) return;
  const value = !row[field];
  await db.$transaction(async tx => {
    if (field === 'pinned' && value) await tx.announcement.updateMany({ where: { pinned: true }, data: { pinned: false } });
    await tx.announcement.update({ where: { id }, data: { [field]: value } });
  });
  refresh();
}

export async function deleteAnnouncement(form: FormData) {
  const me = await requireUser(['ADMIN']);
  const id = Number(form.get('id'));
  const row = await db.announcement.delete({ where: { id } }).catch(() => null);
  if (row) await db.auditLog.create({ data: { actor: me.email, action: 'announcement.delete', detail: { id, title: row.title } } });
  refresh();
}
