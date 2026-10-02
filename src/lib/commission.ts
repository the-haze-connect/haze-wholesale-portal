import { COMMISSION, COMMISSIONED_REPS, levelRule } from './rules';
import { round2 } from './pricing';

export interface CommissionLine {
  /** Product subtotal for the line after discounts (no shipping, tax or card fee). */
  amount: number;
  isBulk: boolean;
  /** Pounds on the line, bulk flower only (1/4 lb bag x 3 = 0.75). */
  pounds?: number;
}

export interface CommissionInput {
  repName: string | null | undefined;
  priceLevelName: string | null | undefined;
  lines: CommissionLine[];
}

export interface CommissionPart {
  rule: string;
  basis: number;
  amount: number;
}

export interface CommissionResult {
  house: boolean;
  total: number;
  parts: CommissionPart[];
}

/**
 * Commission rules confirmed Oct 2, 2026:
 * - Only Brian Warden, Clay & Max Sales and Vinny Sales earn commission.
 * - Non-bulk products: 10% of subtotal on retail/base accounts, 8% on Distro accounts.
 * - Bulk flower (any account): $75/lb prorated; if the order has 10+ lbs of bulk, $50/lb on every lb.
 */
export function calculateCommission(input: CommissionInput): CommissionResult {
  if (!input.repName || !COMMISSIONED_REPS.includes(input.repName)) {
    return { house: true, total: 0, parts: [] };
  }
  const parts: CommissionPart[] = [];
  const rule = levelRule(input.priceLevelName);
  const rate = rule.tierGroup === 'DISTRO' ? COMMISSION.distroRate : COMMISSION.retailRate;

  const productSubtotal = round2(input.lines.filter(l => !l.isBulk).reduce((s, l) => s + l.amount, 0));
  if (productSubtotal > 0) {
    parts.push({
      rule: `${Math.round(rate * 100)}% of product subtotal (${rule.tierGroup === 'DISTRO' ? 'Distro' : 'Retail'} account)`,
      basis: productSubtotal,
      amount: round2(productSubtotal * rate),
    });
  }

  const lbs = Math.round(input.lines.filter(l => l.isBulk).reduce((s, l) => s + (l.pounds ?? 0), 0) * 1000) / 1000;
  if (lbs > 0) {
    const perLb = lbs >= COMMISSION.bulkVolumeLbs ? COMMISSION.bulkPerLbAtVolume : COMMISSION.bulkPerLb;
    parts.push({ rule: `Bulk flower $${perLb}/lb`, basis: lbs, amount: round2(lbs * perLb) });
  }

  return { house: false, total: round2(parts.reduce((s, p) => s + p.amount, 0)), parts };
}
