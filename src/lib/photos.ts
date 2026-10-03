/**
 * Matches wholesale items to product photos from the brands' Shopify storefronts.
 *
 * The Haze Connect store uses the same SKU scheme as Order Time, only for single units:
 *   wholesale V-1-10-Gelato (H)  <->  store V-1-1-Gelato (H)
 *   wholesale G-10-100-Space Cake <-> store G-10-2-Space Cake
 * so we compare the letter "family" (V, PR-HH, F-AAA ...) and the strain/flavor, ignoring pack counts.
 * Bulk flower (B-F-...) borrows the matching flower strain's photo.
 *
 * The Totally Baked store has one display photo per product line and no SKUs, so those
 * items match by line (TB-P-PR-HH, TB-SC ...) to a store product title.
 */

export interface StoreProduct {
  title: string;
  images: { src: string }[];
  variants: { sku: string | null; featured_image?: { src: string } | null }[];
}

export interface PhotoMatch { url: string; source: 'sku' | 'strain' | 'line' }

interface Parsed { family: string[]; name: string; bare: string }

export function parseCode(code: string): Parsed {
  const family: string[] = [];
  const name: string[] = [];
  for (const raw of code.trim().split('-')) {
    const s = raw.trim();
    if (!name.length && /^[A-Z]{1,8}$/.test(s)) family.push(s);
    else if (!name.length && /^[\d.x]*$/.test(s)) continue; // pack counts, grams, potency
    else name.push(s);
  }
  const n = name.join('-').toLowerCase().replace(/\s+/g, ' ').trim();
  return { family, name: n, bare: n.replace(/\s*\([a-z]\)\s*$/, '').trim() };
}

/** Product type letter, treating bulk flower (B-F-...) as flower. */
const kind = (family: string[]) => (family[0] === 'B' ? family[1] : family[0]) ?? '';
/** Family without the bulk prefix: B-F-AAA -> F-AAA. */
const famKey = (family: string[]) => (family[0] === 'B' ? family.slice(1) : family).join('-');

/** Shopify CDN images resize on the fly; 640px is plenty for a product card. */
export const sized = (url: string, width = 640) => {
  try {
    const u = new URL(url.startsWith('//') ? `https:${url}` : url);
    if (u.hostname.endsWith('shopify.com')) u.searchParams.set('width', String(width));
    return u.toString();
  } catch { return url; }
};

export class PhotoIndex {
  private byCode = new Map<string, string>();
  private byFamilyName = new Map<string, string>();
  private byKindName = new Map<string, string>();
  private tbLines = new Map<string, string>();

  addHazeStore(products: StoreProduct[]) {
    for (const p of products) {
      const first = p.images[0]?.src;
      for (const v of p.variants) {
        if (!v.sku) continue;
        const img = v.featured_image?.src ?? first;
        if (!img) continue;
        const { family, name, bare } = parseCode(v.sku);
        setOnce(this.byCode, v.sku.trim().toLowerCase(), img);
        if (name) setOnce(this.byFamilyName, `${famKey(family)}|${name}`, img);
        if (bare) setOnce(this.byKindName, `${kind(family)}|${bare}`, img);
      }
    }
    return this;
  }

  addTotallyBakedStore(products: StoreProduct[]) {
    for (const p of products) {
      const img = p.images[0]?.src;
      if (!img) continue;
      const line = tbLineForTitle(p.title);
      if (line) setOnce(this.tbLines, line, img);
    }
    return this;
  }

  match(code: string): PhotoMatch | null {
    const c = code.trim();
    if (/^TB-/i.test(c)) {
      const line = tbLineForCode(c);
      const url = line ? this.tbLines.get(line) : undefined;
      return url ? { url: sized(url), source: 'line' } : null;
    }
    const exact = this.byCode.get(c.toLowerCase());
    if (exact) return { url: sized(exact), source: 'sku' };
    const { family, name, bare } = parseCode(c);
    const fam = name ? this.byFamilyName.get(`${famKey(family)}|${name}`) : undefined;
    if (fam) return { url: sized(fam), source: 'sku' };
    const strain = bare ? this.byKindName.get(`${kind(family)}|${bare}`) : undefined;
    return strain ? { url: sized(strain), source: 'strain' } : null;
  }

  get size() { return this.byCode.size + this.tbLines.size; }
}

function setOnce(m: Map<string, string>, k: string, v: string) {
  if (!m.has(k)) m.set(k, v);
}

/** Totally Baked product lines, from most to least specific. */
const TB_LINES: { line: string; code: RegExp; title: RegExp }[] = [
  { line: 'thcp-hash-hole', code: /^TB-P-PR-HH-/i, title: /THCP Hash Holes/i },
  { line: 'thcp-pre-roll', code: /^TB-P-PR-/i, title: /THCP Pre-Rolls/i },
  { line: 'thcp-flower', code: /^TB-P-F-/i, title: /THCP Flower/i },
  { line: 'thcp-live-resin', code: /^TB-P-C-LR-/i, title: /THCP Live Resin/i },
  { line: 'thcp-bubble-hash', code: /^TB-P-C-BH-/i, title: /THCP Bubble Hash/i },
  { line: 'thca-hash-hole', code: /^TB-PR-HH-/i, title: /THCA Hash Holes/i },
  { line: 'thca-diamond-pre-roll', code: /^TB-PR-DI-/i, title: /Diamond Infused THCA Pre-Rolls/i },
  { line: 'thca-pre-roll', code: /^TB-PR-\d/i, title: /^2g THCA Pre-Rolls/i },
  { line: 'thca-sno-caps', code: /^TB-SC-/i, title: /Sno Caps/i },
  { line: 'thca-flower', code: /^TB-F-/i, title: /^THCA Flower/i },
];

const tbLineForCode = (code: string) => TB_LINES.find(l => l.code.test(code))?.line ?? null;
const tbLineForTitle = (title: string) => TB_LINES.find(l => l.title.test(title))?.line ?? null;

/** Every product from a Shopify storefront's public products.json (250 per page). */
export async function fetchStoreProducts(baseUrl: string, maxPages = 8): Promise<StoreProduct[]> {
  const all: StoreProduct[] = [];
  for (let page = 1; page <= maxPages; page++) {
    const res = await fetch(`${baseUrl.replace(/\/$/, '')}/products.json?limit=250&page=${page}`, {
      headers: { accept: 'application/json', 'user-agent': 'HazeWholesalePortal/1.0' },
      signal: AbortSignal.timeout(20_000),
      cache: 'no-store',
    });
    if (!res.ok) throw new Error(`${baseUrl} products.json returned ${res.status}`);
    const { products } = await res.json() as { products: StoreProduct[] };
    all.push(...products);
    if (products.length < 250) break;
  }
  return all;
}
