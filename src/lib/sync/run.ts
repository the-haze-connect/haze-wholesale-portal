import { OrderTime, configFromEnv } from '../ordertime/client';
import { BLOCKED_STATES } from '../rules';
import { applySnapshot } from './apply';
import { fetchOrderTime } from './fetch';
import { buildSnapshot } from './snapshot';

/** Pull from Order Time and write to the database. Read-only on the Order Time side. */
export async function runSync() {
  const raw = await fetchOrderTime(new OrderTime(configFromEnv()));
  const snap = buildSnapshot(raw, process.env.ORDERTIME_STOCK_LOCATION || 'HQ', BLOCKED_STATES);
  const { db } = await import('../db');
  await applySnapshot(db, snap);
  return { products: snap.products.length, inStock: snap.products.filter(p => p.available > 0).length, accounts: snap.accounts.length };
}
