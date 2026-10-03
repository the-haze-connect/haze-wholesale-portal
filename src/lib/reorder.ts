import 'server-only';
import { db } from './db';
import { BULK_SIZES } from './rules';

export interface ReorderLine {
  productId: number; // Order Time item ID, the cart's key
  uom: string;
  quantity: number;  // what can be added now
  wanted: number;    // what the past order had
  name: string;
}

export interface ReorderPlan {
  orderId: number;
  accountId: number;
  lines: ReorderLine[];
  skipped: { name: string; reason: string }[];
}

/**
 * What a past order would add to the cart today: same cases and bag sizes,
 * capped at current HQ stock, skipping items no longer sold. Free samples aren't repeated.
 */
export async function reorderPlan(orderId: number): Promise<ReorderPlan | null> {
  const order = await db.order.findUnique({ where: { id: orderId }, include: { lines: { include: { product: true } } } });
  if (!order) return null;

  // Combine repeated lines and keep the order's line order
  const wanted = new Map<string, { product: (typeof order.lines)[number]['product']; uom: string; qty: number }>();
  for (const l of order.lines) {
    if (l.uom === 'SAMPLE') continue;
    const key = `${l.productId}|${l.uom}`;
    const prev = wanted.get(key);
    wanted.set(key, { product: l.product, uom: l.uom, qty: (prev?.qty ?? 0) + Number(l.quantity) });
  }

  const lines: ReorderLine[] = [];
  const skipped: ReorderPlan['skipped'] = [];
  const usedLbs = new Map<number, number>();
  for (const { product: p, uom, qty } of wanted.values()) {
    if (!p.active || !p.wholesale || !p.visible) { skipped.push({ name: p.name, reason: 'no longer sold' }); continue; }
    const perUnit = p.isBulk ? BULK_SIZES.find(s => s.uom === uom)?.lbs : 1;
    if (!perUnit) { skipped.push({ name: p.name, reason: 'bag size no longer offered' }); continue; }
    const left = Number(p.available) - (usedLbs.get(p.id) ?? 0);
    const max = Math.floor(left / perUnit + 1e-9);
    if (max < 1) { skipped.push({ name: p.name, reason: 'out of stock' }); continue; }
    const quantity = Math.min(qty, max);
    usedLbs.set(p.id, (usedLbs.get(p.id) ?? 0) + quantity * perUnit);
    lines.push({ productId: p.otItemId, uom, quantity, wanted: qty, name: p.name });
  }
  return { orderId: order.id, accountId: order.accountId, lines, skipped };
}
