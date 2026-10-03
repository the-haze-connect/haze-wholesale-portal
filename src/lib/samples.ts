import 'server-only';
import { effectivePhoto } from './catalog';

export interface SampleItem {
  id: number; // Order Time item ID, like catalog items
  code: string;
  name: string;
  category: string;
  brand: 'HAZE' | 'TOTALLY_BAKED';
  photo: string | null;
  available: number;
}

/** Items an admin offers as free samples that have stock at HQ. */
export async function getSamples(): Promise<SampleItem[]> {
  if (!process.env.DATABASE_URL) return [];
  const { db } = await import('./db');
  const rows = await db.product.findMany({
    where: { active: true, sampleOffered: true, available: { gte: 1 } },
    orderBy: [{ category: 'asc' }, { name: 'asc' }],
  });
  return rows.map(r => ({
    id: r.otItemId, code: r.code, name: r.name, category: r.category, brand: r.brand,
    photo: effectivePhoto(r.photoOverride, r.photoUrl), available: Math.floor(Number(r.available)),
  }));
}
