export type AnnouncementType = 'DEAL' | 'DELAY' | 'NEWS';

export interface AnnouncementView {
  id: number;
  type: AnnouncementType;
  title: string;
  body: string;
  ctaLabel: string | null;
  ctaCategory: string | null;
  pinned: boolean;
  date: string;
  endsAt: string | null;
}

const fmt = (d: Date) => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'America/Chicago' });

/** Live announcements, newest first. Expired ones drop off automatically. */
export async function getAnnouncements(): Promise<AnnouncementView[]> {
  if (!process.env.DATABASE_URL) return [];
  const { db } = await import('./db');
  const now = new Date();
  const rows = await db.announcement.findMany({
    where: { live: true, OR: [{ endsAt: null }, { endsAt: { gt: now } }] },
    orderBy: { createdAt: 'desc' },
  });
  return rows.map(r => ({
    id: r.id, type: r.type, title: r.title, body: r.body, ctaLabel: r.ctaLabel, ctaCategory: r.ctaCategory,
    pinned: r.pinned, date: fmt(r.createdAt), endsAt: r.endsAt ? fmt(r.endsAt) : null,
  }));
}
