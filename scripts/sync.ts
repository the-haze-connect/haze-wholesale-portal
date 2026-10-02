/**
 * Pull catalog, HQ stock, price levels, reps and customers from Order Time.
 *
 *   npm run sync            -> writes to Postgres (DATABASE_URL)
 *   npm run sync:dry        -> writes data/snapshot.json and prints a data-quality report
 *   npm run sync:dry -- --from-dir <dir>   -> build from saved Order Time JSON instead of the API
 *
 * Railway: run `npm run sync` as a cron service every 5 minutes.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { OrderTime, configFromEnv } from '../src/lib/ordertime/client';
import { fetchOrderTime } from '../src/lib/sync/fetch';
import { buildSnapshot, type RawOrderTime } from '../src/lib/sync/snapshot';
import { BLOCKED_STATES } from '../src/lib/rules';

const args = process.argv.slice(2);
const dry = args.includes('--dry-run');
const fromDir = args.includes('--from-dir') ? args[args.indexOf('--from-dir') + 1] : null;
const location = process.env.ORDERTIME_STOCK_LOCATION || 'HQ';

function loadDir(dir: string): RawOrderTime {
  const read = (f: string) => JSON.parse(readFileSync(path.join(dir, f), 'utf8'));
  return {
    assemblies: read('assembly.json'),
    parts: read('part.json'),
    inventoryByLocation: read('inv_by_loc.json'),
    priceLevels: read('pricelevel.json'),
    levelItemPrices: read('pli_price.json'),
    salesReps: read('salesrep.json'),
    customers: read('customer.json'),
  };
}

async function main() {
  const raw = fromDir ? loadDir(fromDir) : await fetchOrderTime(new OrderTime(configFromEnv()));
  const snap = buildSnapshot(raw, location, BLOCKED_STATES);

  const inStock = snap.products.filter(p => p.available > 0).length;
  const byCat = snap.products.reduce<Record<string, number>>((m, p) => { const k = `${p.brand === 'TOTALLY_BAKED' ? 'TB ' : ''}${p.category}`; m[k] = (m[k] ?? 0) + 1; return m; }, {});
  console.log(`Products: ${snap.products.length} sellable (${inStock} in stock at ${location})`);
  console.log('By category:', byCat);
  console.log(`Accounts: ${snap.accounts.length} active, ${snap.accounts.filter(a => a.commissioned).length} with a commissioned rep`);
  console.log('Data issues:', JSON.stringify(snap.issues, null, 2));

  if (dry) {
    mkdirSync('data', { recursive: true });
    writeFileSync('data/snapshot.json', JSON.stringify(snap));
    console.log('Wrote data/snapshot.json');
    return;
  }
  const { PrismaClient } = await import('@prisma/client');
  const { applySnapshot } = await import('../src/lib/sync/apply');
  const db = new PrismaClient();
  try { await applySnapshot(db, snap); console.log('Synced to database.'); } finally { await db.$disconnect(); }
}

main().catch(err => { console.error(err); process.exit(1); });
