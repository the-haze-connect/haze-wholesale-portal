/**
 * Business rules confirmed with Alex on Oct 2, 2026.
 * Change them here; everything else reads from this file.
 */

export type LevelKind = 'BASE' | 'PERCENT_OFF' | 'ITEM_PRICE';
export type TierGroup = 'RETAIL' | 'DISTRO';

export interface LevelRule {
  kind: LevelKind;
  percentOff?: number;
  tierGroup: TierGroup;
}

/** Active Order Time price levels the portal honors. Anything else = base price. */
export const PRICE_LEVELS: Record<string, LevelRule> = {
  'Tier 2': { kind: 'PERCENT_OFF', percentOff: 5, tierGroup: 'RETAIL' },
  'Tier 3': { kind: 'PERCENT_OFF', percentOff: 10, tierGroup: 'RETAIL' },
  'Distro 1': { kind: 'ITEM_PRICE', tierGroup: 'DISTRO' },
  'Distro 2': { kind: 'ITEM_PRICE', tierGroup: 'DISTRO' },
  'Master Distro': { kind: 'ITEM_PRICE', tierGroup: 'DISTRO' },
  'Master Distro TB': { kind: 'ITEM_PRICE', tierGroup: 'DISTRO' },
};

export const BASE_LEVEL: LevelRule = { kind: 'BASE', tierGroup: 'RETAIL' };

export function levelRule(levelName: string | null | undefined): LevelRule {
  return (levelName && PRICE_LEVELS[levelName]) || BASE_LEVEL;
}

/** Reps who earn commission. Every other rep, and no rep, is a house account. */
export const COMMISSIONED_REPS = ['Brian Warden', 'Clay & Max Sales', 'Vinny Sales'];

export const COMMISSION = {
  retailRate: 0.10,
  distroRate: 0.08,
  bulkPerLb: 75,
  bulkPerLbAtVolume: 50,
  bulkVolumeLbs: 10,
};

export const CARD_FEE_PERCENT = Number(process.env.CARD_FEE_PERCENT ?? 3);

/** Order Time item group -> portal category and brand. Groups not listed are not sold. */
export const ITEM_GROUPS: Record<string, { category: string; brand: 'HAZE' | 'TOTALLY_BAKED'; bulk?: boolean }> = {
  'Flower Jars': { category: 'Flower', brand: 'HAZE' },
  'Pre-Rolls': { category: 'Pre-Rolls', brand: 'HAZE' },
  'Concentrates': { category: 'Concentrates', brand: 'HAZE' },
  'Vapes': { category: 'Vapes', brand: 'HAZE' },
  'Gummies': { category: 'Edibles', brand: 'HAZE' },
  'Chocolate': { category: 'Edibles', brand: 'HAZE' },
  'Drinks': { category: 'Edibles', brand: 'HAZE' },
  'Bulk Flower': { category: 'Bulk Flower', brand: 'HAZE', bulk: true },
  'TB - Flower': { category: 'Flower', brand: 'TOTALLY_BAKED' },
  'TB - Prerolls': { category: 'Pre-Rolls', brand: 'TOTALLY_BAKED' },
  'TB- Concentrates': { category: 'Concentrates', brand: 'TOTALLY_BAKED' },
  'TB - Bulk Flower': { category: 'Bulk Flower', brand: 'TOTALLY_BAKED', bulk: true },
};

/**
 * Wholesale sells case/display quantities only (Alex, Oct 2, 2026).
 * Order Time item codes carry the pack count, e.g. V-1-10 = 1g vape 10ct, PR-M-5 = mini 5-pack,
 * G-20-50 = 50ct gummy display. Single units (count 1) are DTC-only.
 */
export function isWholesaleItem(code: string, description: string, category: string, brand: 'HAZE' | 'TOTALLY_BAKED'): boolean {
  if (/\*\*\*/.test(code) || /^(S-|TB-S-|TB-P-S-|TB-CBD-S-)/.test(code) || /SAMPLE/i.test(description)) return false;
  if (brand === 'HAZE') {
    if (category === 'Vapes') return packCount(code, /^V-\d+-(\d+)-/) >= 10;
    if (category === 'Pre-Rolls') return packCount(code, /^PR-(?:[A-Z]+-)?(\d+)(?:-|$)/) > 1;
    // Gummy displays and cases: 40ct, 50ct and 100ct (G-10-40-, G-20-40-, G-xx-50-, G-10-100-) and all G-DD- items.
    // Single 2ct packs (G-xx-2-) stay off the portal.
    if (category === 'Edibles') return /^G-DD-/i.test(code) || packCount(code, /^G-\d+-(\d+)(?:-|$)/) >= 40;
  }
  return true; // flower jars sell per jar; concentrates and Totally Baked items are already case SKUs
}

function packCount(code: string, re: RegExp): number {
  const m = code.match(re);
  return m ? Number(m[1]) : 0;
}

/** Bulk flower sizes, as Order Time units of measure, and their weight in pounds. */
export const BULK_SIZES = [
  { uom: '1/4LB', label: '1/4 lb', lbs: 0.25 },
  { uom: '1/2LB', label: '1/2 lb', lbs: 0.5 },
  { uom: 'LB', label: '1 lb', lbs: 1 },
] as const;

/** States we can't ship hemp products to (wholesale applies the same block until told otherwise). */
export const BLOCKED_STATES = ['ID', 'AR', 'NH', 'TN', 'NJ'];

const STATE_NAMES: Record<string, string> = {
  ALABAMA: 'AL', ALASKA: 'AK', ARIZONA: 'AZ', ARKANSAS: 'AR', CALIFORNIA: 'CA', COLORADO: 'CO', CONNECTICUT: 'CT',
  DELAWARE: 'DE', FLORIDA: 'FL', GEORGIA: 'GA', HAWAII: 'HI', IDAHO: 'ID', ILLINOIS: 'IL', INDIANA: 'IN', IOWA: 'IA',
  KANSAS: 'KS', KENTUCKY: 'KY', LOUISIANA: 'LA', MAINE: 'ME', MARYLAND: 'MD', MASSACHUSETTS: 'MA', MICHIGAN: 'MI',
  MINNESOTA: 'MN', MISSISSIPPI: 'MS', MISSOURI: 'MO', MONTANA: 'MT', NEBRASKA: 'NE', NEVADA: 'NV',
  'NEW HAMPSHIRE': 'NH', 'NEW JERSEY': 'NJ', 'NEW MEXICO': 'NM', 'NEW YORK': 'NY', 'NORTH CAROLINA': 'NC',
  'NORTH DAKOTA': 'ND', OHIO: 'OH', OKLAHOMA: 'OK', OREGON: 'OR', PENNSYLVANIA: 'PA', 'RHODE ISLAND': 'RI',
  'SOUTH CAROLINA': 'SC', 'SOUTH DAKOTA': 'SD', TENNESSEE: 'TN', TEXAS: 'TX', UTAH: 'UT', VERMONT: 'VT',
  VIRGINIA: 'VA', WASHINGTON: 'WA', 'WEST VIRGINIA': 'WV', WISCONSIN: 'WI', WYOMING: 'WY', 'DISTRICT OF COLUMBIA': 'DC',
};
const CODES = new Set(Object.values(STATE_NAMES));

/** "Texas", "Tx", " tx " -> "TX". Unknown -> null so the account gets flagged for cleanup. */
export function normalizeState(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const s = raw.trim().toUpperCase().replace(/\./g, '');
  if (CODES.has(s)) return s;
  return STATE_NAMES[s] ?? null;
}
