import type { PrismaClient } from '@prisma/client';
import { shipmentsForOrderNumber, shipmentsForSalesOrder, shipstationConfigured, toTracking, type Tracking } from '../shipstation';

const BATCH = 25; // stays well under ShipStation's 40 requests a minute
const LOOKBACK_DAYS = 60;

/**
 * Looks up ShipStation shipments for approved portal orders that are in Order Time but not yet shipped.
 * Orders checked least recently go first, so every open order is covered within a few runs.
 */
export async function syncShipping(db: PrismaClient) {
  if (!shipstationConfigured()) return null;
  const since = new Date(Date.now() - LOOKBACK_DAYS * 864e5);
  const open = await db.order.findMany({
    where: { status: 'APPROVED', otSalesOrderNo: { not: null }, shippedAt: null, createdAt: { gte: since } },
    orderBy: [{ shipCheckedAt: { sort: 'asc', nulls: 'first' } }],
    take: BATCH,
    select: { id: true, otSalesOrderNo: true },
  });

  let shipped = 0;
  for (const o of open) {
    let found: Tracking[] = [];
    try {
      const all = await shipmentsForOrderNumber(String(o.otSalesOrderNo));
      found = shipmentsForSalesOrder(all, o.otSalesOrderNo!).map(toTracking);
    } catch (err) {
      console.error(`[shipping] order #${o.id}:`, err instanceof Error ? err.message : err);
      if (err instanceof Error && /rate limit/i.test(err.message)) break;
      continue;
    }
    if (found.length) {
      const first = found.map(t => t.shipDate).filter(Boolean).sort()[0];
      await db.order.update({ where: { id: o.id }, data: { tracking: found as object[], shippedAt: first ? new Date(first) : new Date(), shipCheckedAt: new Date() } });
      shipped++;
      if (process.env.PORTAL_SHIP_EMAILS === '1') await emailShipped(db, o.id).catch(err => console.error('[mail] ship email failed:', err instanceof Error ? err.message : err));
    } else {
      await db.order.update({ where: { id: o.id }, data: { shipCheckedAt: new Date() } });
    }
  }
  return { checked: open.length, shipped };
}

async function emailShipped(db: PrismaClient, orderId: number) {
  const { linkEmail, sendMail } = await import('../mail');
  const { appUrl } = await import('../session');
  const order = await db.order.findUnique({ where: { id: orderId }, include: { account: true } });
  if (!order || order.shipEmailedAt || !order.placedByUserId) return;
  const buyer = await db.buyerUser.findUnique({ where: { id: order.placedByUserId } });
  if (!buyer) return;
  const t = (order.tracking as Tracking[] | null) ?? [];
  const { text, html } = linkEmail({
    heading: `Order #${order.id} shipped`,
    intro: `Your order for ${order.account.name} is on its way${t[0] ? ` via ${t[0].carrier}, tracking ${t.map(x => x.number).join(', ')}` : ''}.`,
    button: 'Track your order',
    url: t[0]?.url ?? `${appUrl()}/orders/${order.id}`,
    note: 'Questions? Reply to this email or contact your rep.',
  });
  await sendMail(buyer.email, `Haze Wholesale order #${order.id} shipped`, text, html);
  await db.order.update({ where: { id: orderId }, data: { shipEmailedAt: new Date() } });
}
