import type { OtCustomer, OtInventoryByLocation, OtItem, OtLevelItemPrice, OtPriceLevel, OtSalesRep } from '../ordertime/types';
import { customerProfile, type AccountProfile } from './profile';
import { COMMISSIONED_REPS, ITEM_GROUPS, PRICE_LEVELS, isSampleItem, isWholesaleItem, normalizeState } from '../rules';

export interface RawOrderTime {
  assemblies: OtItem[];
  parts: OtItem[];
  inventoryByLocation: OtInventoryByLocation[];
  priceLevels: OtPriceLevel[];
  levelItemPrices: OtLevelItemPrice[];
  salesReps: OtSalesRep[];
  customers: OtCustomer[];
}

export interface SnapshotProduct {
  otItemId: number;
  code: string;
  sku: string | null;
  name: string;
  category: string;
  brand: 'HAZE' | 'TOTALLY_BAKED';
  isBulk: boolean;
  basePrice: number;
  msrp: number | null;
  available: number;
  reorderPoint: number | null;
  levelPrices: Record<string, number>;
  /** false for single units and sample SKUs: kept only so admins can offer them as free samples. */
  wholesale: boolean;
}

export interface SnapshotAccount {
  otCustomerId: number;
  name: string;
  customerType: string | null;
  priceLevel: string | null;
  priceLevelHonored: boolean;
  rep: string | null;
  commissioned: boolean;
  terms: string | null;
  shipState: string | null;
  rawShipState: string | null;
  profile?: AccountProfile;
  licenseNumber: string | null;
}

export interface Snapshot {
  builtAt: string;
  stockLocation: string;
  products: SnapshotProduct[];
  priceLevels: { otId: number; name: string; honored: boolean }[];
  reps: { otId: number; name: string; active: boolean; commissioned: boolean }[];
  accounts: SnapshotAccount[];
  issues: {
    productsWithoutPrice: string[];
    distroPricesMissing: Record<string, number>;
    accountsWithoutState: number;
    accountsWithUnreadableState: string[];
    accountsOnOutdatedTier: number;
    accountsWithoutTier: number;
    accountsInBlockedStates: Record<string, number>;
  };
}

const field = (cf: OtItem['CustomFields'], caption: string) => {
  const v = cf?.find(f => f.Caption === caption)?.Value;
  return v === null || v === undefined || v === '' ? null : String(v);
};

const num = (v: string | null) => {
  if (v === null) return null;
  const n = Number(v.replace(/[$,\s]/g, ''));
  return Number.isFinite(n) && n > 0 ? n : null;
};

/** Pure mapping from raw Order Time records to what the portal stores. */
export function buildSnapshot(raw: RawOrderTime, stockLocation = 'HQ', blockedStates: string[] = []): Snapshot {
  const stock = new Map<number, OtInventoryByLocation>();
  for (const r of raw.inventoryByLocation) {
    if (r.LocationRef?.Name === stockLocation) stock.set(r.ItemRef.Id, r);
  }

  const prices = new Map<number, Record<string, number>>();
  for (const p of raw.levelItemPrices) {
    const level = p.PriceLevelRef?.Name;
    if (!p.IsActive || !level || !PRICE_LEVELS[level]) continue;
    const m = prices.get(p.ItemRef.Id) ?? {};
    m[level] = p.NewPrice;
    prices.set(p.ItemRef.Id, m);
  }

  const products: SnapshotProduct[] = [];
  const productsWithoutPrice: string[] = [];
  for (const item of [...raw.assemblies, ...raw.parts]) {
    const group = item.ItemGroupRef?.Name;
    const map = group ? ITEM_GROUPS[group] : undefined;
    if (!item.IsActive || /\*\*\*/.test(item.Name)) continue;
    const sample = isSampleItem(item.Name, item.Description ?? '');
    if (!map && !sample) continue;
    const category = map?.category ?? 'Samples';
    const brand = map?.brand ?? (/^TB-/i.test(item.Name.trim()) ? 'TOTALLY_BAKED' : 'HAZE');
    const caseItem = !!map && !sample && (!!map.bulk || isWholesaleItem(item.Name, item.Description ?? '', category, brand));
    if (caseItem && !(item.Price > 0.01)) productsWithoutPrice.push(item.Name);
    const wholesale = caseItem && item.Price > 0.01;
    const inv = stock.get(item.Id);
    products.push({
      wholesale,
      otItemId: item.Id,
      code: item.Name,
      sku: field(item.CustomFields, 'SKU'),
      name: (item.Description || '').trim() || item.Name,
      category,
      brand,
      isBulk: !!map?.bulk,
      basePrice: item.Price,
      msrp: num(field(item.CustomFields, 'MSRP')),
      available: Math.max(0, inv?.Available ?? 0),
      reorderPoint: inv?.ReorderPoint ?? null,
      levelPrices: prices.get(item.Id) ?? {},
    });
  }

  const distroPricesMissing: Record<string, number> = {};
  for (const [level, rule] of Object.entries(PRICE_LEVELS)) {
    if (rule.kind !== 'ITEM_PRICE') continue;
    const relevant = products.filter(p => p.wholesale && (level === 'Master Distro TB') === (p.brand === 'TOTALLY_BAKED'));
    distroPricesMissing[level] = relevant.filter(p => !(level in p.levelPrices)).length;
  }

  const accounts: SnapshotAccount[] = raw.customers.filter(c => c.IsActive).map(c => {
    const level = c.PriceLevelRef?.Name ?? null;
    const rep = c.SalesRepRef?.Name ?? null;
    const rawState = c.PrimaryShipAddress?.State ?? null;
    return {
      otCustomerId: c.Id,
      name: c.CompanyName?.trim() || c.Name,
      customerType: c.TypeRef?.Name ?? null,
      priceLevel: level,
      priceLevelHonored: !!(level && PRICE_LEVELS[level]),
      rep,
      commissioned: !!(rep && COMMISSIONED_REPS.includes(rep)),
      terms: c.TermRef?.Name ?? null,
      shipState: normalizeState(rawState),
      rawShipState: rawState,
      licenseNumber: field(c.CustomFields, 'Hemp License #'),
      profile: customerProfile(c as unknown as Record<string, unknown>),
    };
  });

  const accountsInBlockedStates: Record<string, number> = {};
  for (const a of accounts) {
    if (a.shipState && blockedStates.includes(a.shipState)) accountsInBlockedStates[a.shipState] = (accountsInBlockedStates[a.shipState] ?? 0) + 1;
  }

  return {
    builtAt: new Date().toISOString(),
    stockLocation,
    products,
    priceLevels: raw.priceLevels.map(l => ({ otId: l.Id, name: l.Name, honored: !!PRICE_LEVELS[l.Name] && l.IsActive })),
    reps: raw.salesReps.map(r => ({ otId: r.Id, name: r.Name, active: r.IsActive, commissioned: COMMISSIONED_REPS.includes(r.Name) })),
    accounts,
    issues: {
      productsWithoutPrice,
      distroPricesMissing,
      accountsWithoutState: accounts.filter(a => !a.rawShipState?.trim()).length,
      accountsWithUnreadableState: [...new Set(accounts.filter(a => a.rawShipState?.trim() && !a.shipState).map(a => a.rawShipState!.trim()))],
      accountsOnOutdatedTier: accounts.filter(a => a.priceLevel && !a.priceLevelHonored).length,
      accountsWithoutTier: accounts.filter(a => !a.priceLevel).length,
      accountsInBlockedStates,
    },
  };
}
