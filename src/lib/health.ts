import 'server-only';
import { db } from './db';
import { OrderTime, configFromEnv, RecordType, type OtCustomerAddress } from './ordertime/client';
import { BLOCKED_STATES, PRICE_LEVELS } from './rules';

export interface HealthList {
  key: string;
  title: string;
  why: string;
  fix: string;
  columns: string[];
  rows: (string | number)[][];
  /** Portal page for each row (same order as rows), when there is one. */
  links?: (string | null)[];
  /** Shown instead of rows when the list couldn't be built. */
  error?: string;
}

const DISTRO_LEVELS = Object.entries(PRICE_LEVELS).filter(([, r]) => r.kind === 'ITEM_PRICE').map(([name]) => name);
const qty = (n: unknown) => Math.round(Number(n) * 1000) / 1000;

let shipToCache: { at: number; ids: Set<number> } | null = null;

/** Order Time customers that have at least one active address (cached 30 minutes). */
async function customersWithAddress(): Promise<Set<number>> {
  if (shipToCache && Date.now() - shipToCache.at < 30 * 60_000) return shipToCache.ids;
  const rows = await new OrderTime(configFromEnv()).listAll<OtCustomerAddress>(RecordType.CustomerAddress);
  const ids = new Set(rows.filter(r => r.IsActive !== false && r.CustomerRef?.Id).map(r => r.CustomerRef!.Id));
  shipToCache = { at: Date.now(), ids };
  return ids;
}

export async function healthReport(): Promise<{ lists: HealthList[]; syncedAt: string | null }> {
  const issuesRow = await db.setting.findUnique({ where: { key: 'sync_issues' } });
  const issues = issuesRow ? JSON.parse(issuesRow.value) as { at?: string; productsWithoutPrice?: string[] } : {};
  const lists: HealthList[] = [];

  // 1. Case items with no base price: kept off the portal
  const noPriceCodes = issues.productsWithoutPrice ?? [];
  const noPrice = noPriceCodes.length
    ? (await db.product.findMany({ where: { code: { in: noPriceCodes } }, orderBy: [{ category: 'asc' }, { code: 'asc' }] })).sort((a, b) => Number(b.available) - Number(a.available))
    : [];
  const noPriceKnown = new Set(noPrice.map(p => p.code));
  lists.push({
    key: 'no-price', title: 'Items with a $0 base price',
    why: 'These are case items, but they have no price in Order Time, so the portal hides them.',
    fix: 'Set the item’s Price in Order Time (per lb for bulk flower).',
    columns: ['Order Time code', 'Description', 'Category', 'HQ stock'],
    rows: [
      ...noPrice.map(p => [p.code, p.name, p.category, qty(p.available)]),
      ...noPriceCodes.filter(c => !noPriceKnown.has(c)).map(c => [c, '', '', '']),
    ],
    links: [
      ...noPrice.map(p => `/admin/products?show=singles&q=${encodeURIComponent(p.code)}`),
      ...noPriceCodes.filter(c => !noPriceKnown.has(c)).map(() => null),
    ],
  });

  // 2. Distro per-item prices missing (the account falls back to base price)
  const products = await db.product.findMany({
    where: { active: true, wholesale: true },
    include: { prices: { include: { priceLevel: true } } },
    orderBy: [{ brand: 'asc' }, { category: 'asc' }, { code: 'asc' }],
  });
  const missingRows: (string | number)[][] = [];
  for (const p of products) {
    const relevant = DISTRO_LEVELS.filter(l => (l === 'Master Distro TB') === (p.brand === 'TOTALLY_BAKED'));
    const have = new Set(p.prices.map(x => x.priceLevel.name));
    const missing = relevant.filter(l => !have.has(l));
    if (missing.length) missingRows.push([p.code, p.name, missing.join(', '), Number(p.basePrice), qty(p.available)]);
  }
  missingRows.sort((a, b) => Number(b[4]) - Number(a[4])); // in-stock items first
  const missingLinks = missingRows.map(r => `/admin/products?show=all&q=${encodeURIComponent(String(r[0]))}`);
  lists.push({
    key: 'distro-prices', title: 'Missing Distro prices',
    why: 'Distro accounts pay per-item prices. Where an item has none for their level, they’re charged the base price. In-stock items are listed first.',
    fix: 'Add the item’s price on each listed price level in Order Time.',
    columns: ['Order Time code', 'Description', 'Missing levels', 'Base price', 'HQ stock'],
    rows: missingRows,
    links: missingLinks,
  });

  // 3. Account address problems
  const accounts = await db.account.findMany({
    where: { status: { not: 'CLOSED' } },
    include: { rep: true },
    orderBy: { name: 'asc' },
  });
  const repName = (a: (typeof accounts)[number]) => a.rep?.name ?? 'House';
  lists.push({
    key: 'no-state', title: 'Accounts with no ship-to state',
    why: 'The portal can’t confirm these shops are outside blocked states.',
    fix: 'Fill in the customer’s primary ship-to address in Order Time.',
    columns: ['Account', 'Rep', 'Order Time ID'],
    links: accounts.filter(a => !a.rawShipState).map(a => `/admin/accounts/${a.id}`),
    rows: accounts.filter(a => !a.rawShipState).map(a => [a.name, repName(a), a.otCustomerId ?? '']),
  });
  lists.push({
    key: 'bad-state', title: 'Accounts with an unreadable state',
    why: 'The state on file isn’t a recognizable US state name or code.',
    fix: 'Correct the State on the customer’s ship-to address (e.g. "TX").',
    columns: ['Account', 'State as entered', 'Rep', 'Order Time ID'],
    links: accounts.filter(a => a.rawShipState && !a.shipState).map(a => `/admin/accounts/${a.id}`),
    rows: accounts.filter(a => a.rawShipState && !a.shipState).map(a => [a.name, a.rawShipState!, repName(a), a.otCustomerId ?? '']),
  });
  lists.push({
    key: 'blocked', title: 'Accounts in blocked states',
    why: `We don’t ship to ${BLOCKED_STATES.join(', ')}. These accounts can sign in but can’t order.`,
    fix: 'If the address is wrong, fix it in Order Time. Otherwise consider closing the account in Admin > Accounts.',
    columns: ['Account', 'State', 'Rep', 'Order Time ID'],
    links: accounts.filter(a => a.shipState && BLOCKED_STATES.includes(a.shipState)).map(a => `/admin/accounts/${a.id}`),
    rows: accounts.filter(a => a.shipState && BLOCKED_STATES.includes(a.shipState)).map(a => [a.name, a.shipState!, repName(a), a.otCustomerId ?? '']),
  });

  // 4. Price tier problems
  lists.push({
    key: 'old-tier', title: 'Accounts on an outdated price level',
    why: 'Their Order Time price level isn’t one the portal honors, so they get base prices.',
    fix: 'Move them to Tier 2, Tier 3 or a Distro level in Order Time, or leave as-is for base pricing.',
    columns: ['Account', 'Order Time level', 'Rep', 'Order Time ID'],
    links: accounts.filter(a => a.otPriceLevel && !a.priceLevelId).map(a => `/admin/accounts/${a.id}`),
    rows: accounts.filter(a => a.otPriceLevel && !a.priceLevelId).map(a => [a.name, a.otPriceLevel!, repName(a), a.otCustomerId ?? '']),
  });
  lists.push({
    key: 'no-tier', title: 'Accounts with no price level',
    why: 'They get base prices. Fine for retail shops at base; worth checking for anyone who should be on a tier.',
    fix: 'Set the customer’s Price Level in Order Time if they should get a discount.',
    columns: ['Account', 'Rep', 'Order Time ID'],
    links: accounts.filter(a => !a.otPriceLevel).map(a => `/admin/accounts/${a.id}`),
    rows: accounts.filter(a => !a.otPriceLevel).map(a => [a.name, repName(a), a.otCustomerId ?? '']),
  });

  // 5. Ship-to addresses (needed to create sales orders)
  try {
    const withAddress = await customersWithAddress();
    lists.push({
      key: 'no-ship-to', title: 'Accounts with no ship-to address record',
      why: 'Order Time needs a ship-to address on every sales order, so portal orders for these shops can’t be sent to Order Time.',
      fix: 'Add an address to the customer in Order Time (Addresses tab) and mark it primary.',
      columns: ['Account', 'Rep', 'Order Time ID'],
      links: accounts.filter(a => a.otCustomerId && !withAddress.has(a.otCustomerId)).map(a => `/admin/accounts/${a.id}`),
    rows: accounts.filter(a => a.otCustomerId && !withAddress.has(a.otCustomerId)).map(a => [a.name, repName(a), a.otCustomerId!]),
    });
  } catch (err) {
    lists.push({
      key: 'no-ship-to', title: 'Accounts with no ship-to address record', why: '', fix: '', columns: [], rows: [],
      error: `Couldn’t check Order Time addresses: ${err instanceof Error ? err.message : String(err)}`,
    });
  }

  return { lists, syncedAt: issues.at ?? null };
}
