import { OrderTime, configFromEnv } from '../ordertime/client';
import { BLOCKED_STATES } from '../rules';
import { applySnapshot } from './apply';
import { fetchOrderTime } from './fetch';
import { assignPhotos } from './photos';
import { buildSnapshot } from './snapshot';

/** Pull from Order Time and write to the database. Read-only on the Order Time side. */
export async function runSync() {
  const raw = await fetchOrderTime(new OrderTime(configFromEnv()));
  const snap = buildSnapshot(raw, process.env.ORDERTIME_STOCK_LOCATION || 'HQ', BLOCKED_STATES);
  const { db } = await import('../db');
  await applySnapshot(db, snap);
  // Keep the latest data issues for Admin > Data health
  const issues = JSON.stringify({ at: snap.builtAt, ...snap.issues });
  await db.setting.upsert({ where: { key: 'sync_issues' }, create: { key: 'sync_issues', value: issues, updatedBy: 'sync' }, update: { value: issues, updatedBy: 'sync' } });
  const photos = await assignPhotos(db).catch(err => { console.error('[photos] failed:', err instanceof Error ? err.message : err); return null; });
  const cases = snap.products.filter(p => p.wholesale);
  return { photos, products: cases.length, inStock: cases.filter(p => p.available > 0).length, singles: snap.products.length - cases.length, accounts: snap.accounts.length };
}
