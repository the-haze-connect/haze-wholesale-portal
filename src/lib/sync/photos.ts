import type { PrismaClient } from '@prisma/client';
import { PhotoIndex, fetchStoreProducts } from '../photos';

const HOUR = 60 * 60_000;
let cache: { at: number; index: PhotoIndex } | null = null;

/** Store feeds are cached for an hour so the 5-minute sync doesn't hit the storefronts every time. */
async function photoIndex(): Promise<PhotoIndex> {
  if (cache && Date.now() - cache.at < HOUR) return cache.index;
  const haze = process.env.PHOTO_STORE_HAZE ?? 'https://thehazeconnect.com';
  const tb = process.env.PHOTO_STORE_TB ?? 'https://totallybakedhemp.com';
  const [hz, tbp] = await Promise.all([
    haze ? fetchStoreProducts(haze).catch(err => { console.error('[photos] Haze store:', err.message); return null; }) : [],
    tb ? fetchStoreProducts(tb).catch(err => { console.error('[photos] TB store:', err.message); return null; }) : [],
  ]);
  if (hz === null && tbp === null && cache) return cache.index; // keep last good matches
  const index = new PhotoIndex().addHazeStore(hz ?? []).addTotallyBakedStore(tbp ?? []);
  cache = { at: Date.now(), index };
  return index;
}

/** Sets each product's automatic photo. Admin overrides are never touched. */
export async function assignPhotos(db: PrismaClient) {
  if (process.env.DISABLE_PHOTO_MATCH === '1') return { matched: 0, total: 0 };
  const index = await photoIndex();
  if (!index.size) return { matched: 0, total: 0 };
  const products = await db.product.findMany({ where: { active: true }, select: { id: true, code: true, photoUrl: true, photoSource: true } });
  let matched = 0;
  for (const p of products) {
    const m = index.match(p.code);
    if (m) matched++;
    const url = m?.url ?? null, source = m?.source ?? null;
    if (url !== p.photoUrl || source !== p.photoSource) {
      await db.product.update({ where: { id: p.id }, data: { photoUrl: url, photoSource: source } });
    }
  }
  return { matched, total: products.length };
}
