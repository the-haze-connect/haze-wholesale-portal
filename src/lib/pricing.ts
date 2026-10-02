import { CARD_FEE_PERCENT, levelRule } from './rules';

export const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

export interface PriceInput {
  basePrice: number;
  /** Per-item prices this product has, keyed by Order Time price level name. */
  levelPrices?: Record<string, number>;
}

export interface PriceResult {
  price: number;
  source: 'base' | 'percent' | 'level' | 'base-fallback';
}

/**
 * Unit price an account pays.
 * - Tier 2 / Tier 3: percent off the base price.
 * - Distro levels: that level's per-item price; base price if the item has none (flagged).
 * - No level, or an outdated one: base price.
 */
export function unitPrice(product: PriceInput, levelName: string | null | undefined): PriceResult {
  const rule = levelRule(levelName);
  if (rule.kind === 'PERCENT_OFF') {
    return { price: round2(product.basePrice * (1 - (rule.percentOff ?? 0) / 100)), source: 'percent' };
  }
  if (rule.kind === 'ITEM_PRICE' && levelName) {
    const p = product.levelPrices?.[levelName];
    if (typeof p === 'number' && p > 0) return { price: round2(p), source: 'level' };
    return { price: round2(product.basePrice), source: 'base-fallback' };
  }
  return { price: round2(product.basePrice), source: 'base' };
}

export interface CartLine {
  unitPrice: number;
  quantity: number;
}

export function orderTotals(lines: CartLine[], payment: 'CARD' | 'ACH_WIRE', feePercent = CARD_FEE_PERCENT) {
  const subtotal = round2(lines.reduce((s, l) => s + l.unitPrice * l.quantity, 0));
  const cardFee = payment === 'CARD' ? round2(subtotal * feePercent / 100) : 0;
  return { subtotal, cardFee, total: round2(subtotal + cardFee) };
}
