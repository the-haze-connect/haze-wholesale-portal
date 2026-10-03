import { BULK_SIZES } from './rules';
import { round2, unitPrice } from './pricing';

/** A cart line as the browser sends it. productId is the Order Time item ID. */
export interface RequestedLine {
  productId: number;
  uom: string;
  quantity: number;
}

export interface ProductForPricing {
  dbId: number;
  otItemId: number;
  code: string;
  name: string;
  isBulk: boolean;
  basePrice: number;
  available: number; // HQ, base unit (lbs for bulk)
  levelPrices: Record<string, number>;
  wholesale?: boolean;
  sampleOffered?: boolean;
}

export const SAMPLE_UOM = 'SAMPLE';

export interface PricedLine {
  productDbId: number;
  otItemId: number;
  code: string;
  name: string;
  isBulk: boolean;
  uom: string;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
  pounds: number | null;
}

export interface PricedCart {
  lines: PricedLine[];
  problems: string[];
}

const MAX_QTY = 9999;

/**
 * Re-prices a cart on the server from current catalog data. Browser prices are never trusted.
 * Returns the priced lines plus any problems (unavailable items, not enough stock).
 */
export function priceCart(requested: RequestedLine[], products: Map<number, ProductForPricing>, levelName: string | null, sampleLimit = 5): PricedCart {
  const problems: string[] = [];

  // Merge duplicate lines
  const merged = new Map<string, RequestedLine>();
  for (const r of requested) {
    const qty = Number(r.quantity);
    if (!Number.isInteger(qty) || qty <= 0 || qty > MAX_QTY) { problems.push('A quantity in your cart is not valid.'); continue; }
    const key = `${r.productId}|${r.uom}`;
    const prev = merged.get(key);
    merged.set(key, { productId: Number(r.productId), uom: String(r.uom), quantity: (prev?.quantity ?? 0) + qty });
  }

  const lines: PricedLine[] = [];
  const usedByProduct = new Map<number, number>();
  for (const r of merged.values()) {
    const p = products.get(r.productId);
    if (!p) { problems.push('An item in your cart is no longer available. Remove it and try again.'); continue; }

    // Free samples: only items an admin offers, priced at $0
    if (r.uom === SAMPLE_UOM) {
      if (!p.sampleOffered) { problems.push(`${p.name} is no longer offered as a sample. Remove it and try again.`); continue; }
      usedByProduct.set(p.otItemId, (usedByProduct.get(p.otItemId) ?? 0) + r.quantity);
      lines.push({ productDbId: p.dbId, otItemId: p.otItemId, code: p.code, name: p.name, isBulk: false, uom: SAMPLE_UOM, quantity: r.quantity, unitPrice: 0, lineTotal: 0, pounds: null });
      continue;
    }
    if (p.wholesale === false) { problems.push(`${p.name} isn’t sold by the case. Remove it and try again.`); continue; }
    const { price } = unitPrice({ basePrice: p.basePrice, levelPrices: p.levelPrices }, levelName);
    if (!(price > 0)) { problems.push(`${p.name} has no price set yet. Remove it or contact your rep.`); continue; }

    let unit = price;
    let lbsPerUnit = 1;
    if (p.isBulk) {
      const size = BULK_SIZES.find(s => s.uom === r.uom);
      if (!size) { problems.push(`Choose a bag size for ${p.name}.`); continue; }
      lbsPerUnit = size.lbs;
      unit = round2(price * size.lbs);
    } else if (r.uom !== 'EA') {
      problems.push(`${p.name} has an unknown unit.`); continue;
    }

    usedByProduct.set(p.otItemId, (usedByProduct.get(p.otItemId) ?? 0) + r.quantity * lbsPerUnit);
    lines.push({
      productDbId: p.dbId, otItemId: p.otItemId, code: p.code, name: p.name, isBulk: p.isBulk, uom: r.uom,
      quantity: r.quantity, unitPrice: unit, lineTotal: round2(unit * r.quantity),
      pounds: p.isBulk ? Math.round(r.quantity * lbsPerUnit * 1000) / 1000 : null,
    });
  }

  for (const [otItemId, used] of usedByProduct) {
    const p = products.get(otItemId)!;
    if (used > p.available + 1e-9) {
      const have = p.isBulk ? `${Math.max(0, Math.floor(p.available * 4) / 4)} lb` : `${Math.max(0, Math.floor(p.available))}`;
      problems.push(p.available < (p.isBulk ? 0.25 : 1)
        ? `${p.name} is out of stock.`
        : `Only ${have} of ${p.name} available. Lower the quantity and try again.`);
    }
  }

  const sampleUnits = lines.filter(l => l.uom === SAMPLE_UOM).reduce((n, l) => n + l.quantity, 0);
  if (sampleUnits > sampleLimit) problems.push(`Samples are limited to ${sampleLimit} per order. Remove ${sampleUnits - sampleLimit}.`);
  if (sampleUnits && !lines.some(l => l.uom !== SAMPLE_UOM)) problems.push('Samples ship with a case order. Add at least one case to your cart.');

  if (!lines.length && !problems.length) problems.push('Your cart is empty.');
  return { lines, problems };
}
