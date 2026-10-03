import 'server-only';
import { db } from './db';
import { BULK_SIZES } from './rules';
import type { OtLine } from './sync/ot-orders';

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

type Prod = NonNullable<Awaited<ReturnType<typeof db.product.findUnique>>>;
interface Wanted { product: Prod; uom: string; qty: number }

/**
 * What a past order would add to the cart today: same cases and bag sizes,
 * capped at current HQ stock, skipping items no longer sold. Free samples aren't repeated.
 */
export async function reorderPlan(orderId: number): Promise<ReorderPlan | null> {
  const order = await db.order.findUnique({ where: { id: orderId }, include: { lines: { include: { product: true } } } });
  if (!order) return null;
  const wanted: Wanted[] = order.lines.filter(l => l.uom !== 'SAMPLE').map(l => ({ product: l.product, uom: l.uom, qty: Number(l.quantity) }));
  return { orderId: order.id, accountId: order.accountId, ...plan(wanted) };
}

/** The same, for an Order Time sales order (including ones from before the portal). */
export async function reorderPlanForOt(lines: OtLine[], accountId: number): Promise<ReorderPlan> {
  const ids = [...new Set(lines.map(l => l.itemId).filter((x): x is number => x !== null))];
  const products = ids.length ? await db.product.findMany({ where: { otItemId: { in: ids } } }) : [];
  const byItem = new Map(products.map(p => [p.otItemId, p]));
  const wanted: Wanted[] = [];
  const skipped: ReorderPlan['skipped'] = [];
  for (const l of lines) {
    if (l.quantity <= 0) continue;
    const p = l.itemId !== null ? byItem.get(l.itemId) : undefined;
    if (!p) { if (l.price > 0) skipped.push({ name: l.description || l.code, reason: 'not sold on the portal' }); continue; }
    if (!p.wholesale || l.price === 0) continue; // free samples and single units aren't repeated
    if (!p.isBulk) { wanted.push({ product: p, uom: 'EA', qty: Math.round(l.quantity) }); continue; }
    // Bulk flower: keep the bag size if Order Time has one we sell, otherwise reorder the same weight in 1 lb bags
    const uom = (l.uom ?? '').toUpperCase().replace(/\s+/g, '');
    const size = BULK_SIZES.find(s => s.uom === uom);
    if (size) wanted.push({ product: p, uom: size.uom, qty: Math.round(l.quantity) });
    else wanted.push({ product: p, uom: 'LB', qty: Math.max(1, Math.round(l.quantity)) });
  }
  const result = plan(wanted);
  return { orderId: 0, accountId, lines: result.lines, skipped: [...skipped, ...result.skipped] };
}

function plan(items: Wanted[]): Pick<ReorderPlan, 'lines' | 'skipped'> {
  // Combine repeated lines and keep the order's line order
  const wanted = new Map<string, Wanted>();
  for (const w of items) {
    const key = `${w.product.id}|${w.uom}`;
    const prev = wanted.get(key);
    wanted.set(key, { ...w, qty: (prev?.qty ?? 0) + w.qty });
  }

  const lines: ReorderLine[] = [];
  const skipped: ReorderPlan['skipped'] = [];
  const usedLbs = new Map<number, number>();
  for (const { product: p, uom, qty } of wanted.values()) {
    if (qty < 1) continue;
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
  return { lines, skipped };
}
