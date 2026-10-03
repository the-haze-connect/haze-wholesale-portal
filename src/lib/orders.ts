import 'server-only';
import { chargeCard } from './authnet';
import { calculateCommission } from './commission';
import { priceCart, type PricedLine, type RequestedLine } from './checkout';
import { db } from './db';
import { linkEmail, sendMail } from './mail';
import { OrderTime, configFromEnv, type OtSalesOrderInput } from './ordertime/client';
import { orderTotals } from './pricing';
import { BLOCKED_STATES, CARD_FEE_PERCENT } from './rules';
import { appUrl, type SessionUser } from './session';

export const ACH_SETTING = 'ach_instructions';
export const SAMPLE_LIMIT_SETTING = 'sample_limit';

/** Most free sample units one order can include (admin setting, default 5). */
export async function sampleLimit() {
  const raw = await getSetting(SAMPLE_LIMIT_SETTING);
  const v = raw === null || raw.trim() === '' ? NaN : Number(raw);
  return Number.isInteger(v) && v >= 0 ? v : 5;
}

export interface PlaceOrderInput {
  user: SessionUser;
  accountId: number;
  lines: RequestedLine[];
  payment: 'CARD' | 'ACH_WIRE';
  expectedTotal: number;
  customerPO?: string | null;
  notes?: string | null;
  opaqueData?: { dataDescriptor: string; dataValue: string } | null;
}

export type PlaceOrderResult = { ok: true; orderId: number } | { ok: false; message: string; problems?: string[] };

async function loadProducts(otItemIds: number[]) {
  const rows = await db.product.findMany({
    where: { otItemId: { in: otItemIds }, active: true, OR: [{ visible: true, wholesale: true }, { sampleOffered: true }] },
    include: { prices: { include: { priceLevel: true } } },
  });
  return new Map(rows.map(r => [r.otItemId, {
    dbId: r.id, otItemId: r.otItemId, code: r.code, name: r.name, isBulk: r.isBulk,
    basePrice: Number(r.basePrice), available: Number(r.available), wholesale: r.wholesale, sampleOffered: r.sampleOffered,
    levelPrices: Object.fromEntries(r.prices.map(p => [p.priceLevel.name, Number(p.price)])),
  }]));
}

/** Prices the cart for an account, the same way checkout will. */
export async function quoteCart(accountId: number, requested: RequestedLine[]) {
  const account = await db.account.findUnique({ where: { id: accountId }, include: { priceLevel: true, rep: true } });
  if (!account) return null;
  const products = await loadProducts(requested.map(l => Number(l.productId)).filter(Number.isFinite));
  return { account, ...priceCart(requested, products, account.priceLevel?.name ?? null, await sampleLimit()) };
}

export async function placeOrder(input: PlaceOrderInput): Promise<PlaceOrderResult> {
  const quote = await quoteCart(input.accountId, input.lines);
  if (!quote) return { ok: false, message: 'Choose which shop this order is for.' };
  const { account, lines, problems } = quote;
  if (account.status !== 'ACTIVE') return { ok: false, message: 'This account is not active for ordering. Contact your rep.' };
  if (account.shipState && BLOCKED_STATES.includes(account.shipState)) {
    return { ok: false, message: `We can’t ship to ${account.shipState}. Contact your rep if this account’s address is wrong.` };
  }
  if (problems.length) return { ok: false, message: 'Some items need attention.', problems };

  const totals = orderTotals(lines, input.payment, CARD_FEE_PERCENT);
  if (Math.abs(totals.total - input.expectedTotal) > 0.009) {
    return { ok: false, message: `Prices were updated since you loaded this page. The new total is $${totals.total.toFixed(2)}. Review your cart and submit again.` };
  }
  if (input.payment === 'CARD' && !input.opaqueData) return { ok: false, message: 'Enter your card details.' };

  const commission = calculateCommission({
    repName: account.rep?.name,
    priceLevelName: account.priceLevel?.name,
    lines: lines.map(l => ({ amount: l.lineTotal, isBulk: l.isBulk, pounds: l.pounds ?? undefined })),
  });

  // 1. Record the order (and reserve stock) before charging, so nothing is charged without a record.
  const order = await db.$transaction(async tx => {
    const o = await tx.order.create({
      data: {
        accountId: account.id, placedByUserId: input.user.id, repId: account.repId, paymentMethod: input.payment,
        customerPO: input.customerPO?.trim().slice(0, 25) || null, notes: input.notes?.trim().slice(0, 1000) || null,
        subtotal: totals.subtotal, cardFee: totals.cardFee, total: totals.total,
        lines: { create: lines.map(l => ({ productId: l.productDbId, quantity: l.quantity, uom: l.uom, pounds: l.pounds, unitPrice: l.unitPrice, lineTotal: l.lineTotal })) },
      },
    });
    if (!commission.house && account.repId) {
      await tx.commissionEntry.createMany({
        data: commission.parts.map(p => ({ orderId: o.id, repId: account.repId!, rule: p.rule, basis: p.basis, amount: p.amount, state: 'PENDING' as const })),
      });
    }
    await reserveStock(tx, lines, -1);
    return o;
  });

  // 2. Card: charge now. A failed charge removes the order and releases the stock.
  if (input.payment === 'CARD') {
    const charge = await chargeCard({
      opaqueData: input.opaqueData!, amount: totals.total, invoiceNumber: `WP${order.id}`,
      description: `Haze Wholesale order #${order.id} for ${account.name}`,
      poNumber: order.customerPO, customerEmail: input.user.email, billToCompany: account.name,
    });
    if (!charge.ok) {
      await db.$transaction(async tx => {
        await tx.commissionEntry.deleteMany({ where: { orderId: order.id } });
        await tx.order.delete({ where: { id: order.id } });
        await reserveStock(tx, lines, +1);
      });
      await audit(input.user.email, 'order.card_failed', { accountId: account.id, total: totals.total, reason: charge.message });
      return { ok: false, message: charge.message };
    }
    await db.order.update({
      where: { id: order.id },
      data: { paymentRef: charge.transId, cardLast4: charge.last4, ...(charge.heldForReview ? {} : { paidAt: new Date(), status: 'APPROVED', approvedBy: 'card' }) },
    });
    if (!charge.heldForReview) {
      await db.commissionEntry.updateMany({ where: { orderId: order.id, state: 'PENDING' }, data: { state: 'EARNED' } });
      await postOrderToOrderTime(order.id);
    }
  }

  await audit(input.user.email, 'order.placed', { orderId: order.id, accountId: account.id, payment: input.payment, total: totals.total });
  await notifyOrderPlaced(order.id, input.user.email).catch(err => console.error('[mail] order email failed:', err instanceof Error ? err.message : err));
  return { ok: true, orderId: order.id };
}

type Tx = Parameters<Parameters<typeof db.$transaction>[0]>[0];

/** Moves HQ availability in the portal so two buyers can't order the same last case before the next sync. */
async function reserveStock(tx: Tx, lines: PricedLine[], sign: 1 | -1) {
  for (const l of lines) {
    const used = l.isBulk ? (l.pounds ?? 0) : l.quantity;
    await tx.product.update({ where: { id: l.productDbId }, data: { available: { increment: sign * used } } });
  }
}

/** Admin: ACH / wire payment received. Approves the order, earns commission and sends it to Order Time. */
export async function markOrderPaid(orderId: number, actor: string) {
  const order = await db.order.findUnique({ where: { id: orderId } });
  if (!order || order.status !== 'SUBMITTED') return { ok: false, message: 'Only orders waiting on payment can be approved.' };
  await db.$transaction([
    db.order.update({ where: { id: orderId }, data: { status: 'APPROVED', paidAt: new Date(), approvedBy: actor } }),
    db.commissionEntry.updateMany({ where: { orderId, state: 'PENDING' }, data: { state: 'EARNED' } }),
  ]);
  await audit(actor, 'order.approved', { orderId });
  await postOrderToOrderTime(orderId);
  return { ok: true, message: `Order #${orderId} approved.` };
}

/** Admin: cancel an order that hasn't been paid. Releases reserved stock and removes pending commission. */
export async function cancelOrder(orderId: number, actor: string) {
  const order = await db.order.findUnique({ where: { id: orderId }, include: { lines: { include: { product: true } } } });
  if (!order || order.status !== 'SUBMITTED' || order.paidAt) return { ok: false, message: 'Only unpaid orders waiting on payment can be cancelled here.' };
  await db.$transaction(async tx => {
    await tx.order.update({ where: { id: orderId }, data: { status: 'CANCELLED' } });
    await tx.commissionEntry.updateMany({ where: { orderId, state: 'PENDING' }, data: { state: 'REVERSED' } });
    for (const l of order.lines) {
      await tx.product.update({ where: { id: l.productId }, data: { available: { increment: Number(l.pounds ?? l.quantity) } } });
    }
  });
  await audit(actor, 'order.cancelled', { orderId });
  return { ok: true, message: `Order #${orderId} cancelled.` };
}

/** Creates the sales order in Order Time. Safe to retry: does nothing once a sales order number is saved. */
export async function postOrderToOrderTime(orderId: number) {
  const order = await db.order.findUnique({
    where: { id: orderId },
    include: { account: true, rep: true, lines: { include: { product: true } } },
  });
  if (!order || order.otSalesOrderNo || order.status !== 'APPROVED') return;
  if (!order.account.otCustomerId) {
    await db.order.update({ where: { id: orderId }, data: { otError: 'This account has no Order Time customer record.' } });
    return;
  }

  const paidNote = order.paymentMethod === 'CARD'
    ? `Paid by card via Authorize.net (transaction ${order.paymentRef}${order.cardLast4 ? `, card ending ${order.cardLast4}` : ''}). Total charged $${Number(order.total).toFixed(2)} incl. ${CARD_FEE_PERCENT}% card fee $${Number(order.cardFee).toFixed(2)}.`
    : `Paid by ACH/wire, confirmed by ${order.approvedBy ?? 'admin'}.`;

  const LINE = 'AOLib7.SalesOrderLineItem, AOLib7' as const;
  const lineItems: OtSalesOrderInput['LineItems'] = order.lines.map(l => ({
    $type: LINE,
    ItemRef: { Id: l.product.otItemId },
    Quantity: Number(l.quantity),
    Price: Number(l.unitPrice),
    ...(l.uom !== 'EA' && l.uom !== 'SAMPLE' ? { UomRef: { Name: l.uom } } : {}),
    ...(l.uom === 'SAMPLE' ? { Description: `FREE SAMPLE - ${l.product.name}`.slice(0, 200) } : {}),
  }));
  const feeItemId = Number(process.env.ORDERTIME_CARD_FEE_ITEM_ID);
  if (Number(order.cardFee) > 0 && feeItemId) {
    lineItems.push({ $type: LINE, ItemRef: { Id: feeItemId }, Quantity: 1, Price: Number(order.cardFee), Description: `Card processing fee (${CARD_FEE_PERCENT}%)` });
  }

  try {
    const ot = new OrderTime(configFromEnv());
    const shipTo = await ot.customerShipTo(order.account.otCustomerId);
    if (!shipTo) throw new Error(`Customer ${order.account.otCustomerId} has no active ship-to address in Order Time. Add one, then retry.`);
    const today = `${new Date().toLocaleDateString('en-CA', { timeZone: 'America/Chicago' })}T00:00:00`;
    const so: OtSalesOrderInput = {
      CustomerRef: { Id: order.account.otCustomerId },
      ShipToRef: shipTo,
      Date: today,
      PromiseDate: today,
      ...(order.rep ? { SalesRepRef: { Id: order.rep.otId } } : {}),
      ...(order.customerPO ? { CustomerPO: order.customerPO.slice(0, 25) } : {}),
      Memo: `Wholesale portal order #${order.id}. ${paidNote}${order.notes ? ` Buyer note: ${order.notes}` : ''}`.slice(0, 4000),
      LineItems: lineItems,
    };
    const created = await ot.createSalesOrder(so);
    await db.order.update({ where: { id: orderId }, data: { otSalesOrderNo: created.DocNo ?? null, otPostedAt: new Date(), otError: null } });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[ordertime] order #${orderId} not posted:`, message);
    await db.order.update({ where: { id: orderId }, data: { otError: message.slice(0, 500) } });
  }
}

export async function getSetting(key: string) {
  return (await db.setting.findUnique({ where: { key } }))?.value ?? null;
}

async function audit(actor: string, action: string, detail: Record<string, unknown>) {
  await db.auditLog.create({ data: { actor, action, detail: detail as object } }).catch(() => {});
}

async function notifyOrderPlaced(orderId: number, placedBy: string) {
  const order = await db.order.findUnique({ where: { id: orderId }, include: { account: true } });
  if (!order) return;
  const total = `$${Number(order.total).toFixed(2)}`;
  const url = `${appUrl()}/orders/${order.id}`;
  const waiting = order.status === 'SUBMITTED';

  const buyer = linkEmail({
    heading: `Order #${order.id} received`,
    intro: waiting
      ? (order.paymentMethod === 'ACH_WIRE'
        ? `Thanks! Your order for ${order.account.name} (${total}) is in. Send payment by ACH or wire using the details on your order page; we’ll approve and ship once it arrives.`
        : `Thanks! Your card payment of ${total} is under review. We’ll confirm your order for ${order.account.name} shortly.`)
      : `Thanks! Your order for ${order.account.name} is approved and your card was charged ${total}. We’ll email tracking when it ships.`,
    button: 'View order',
    url,
    note: 'Questions? Reply to this email or contact your rep.',
  });
  await sendMail(placedBy, `Haze Wholesale order #${order.id}`, buyer.text, buyer.html);

  const team = process.env.ORDER_ALERT_EMAIL || process.env.MAIL_SENDER;
  if (team) {
    const alert = linkEmail({
      heading: `New portal order #${order.id}`,
      intro: `${order.account.name} placed a ${total} order paid by ${order.paymentMethod === 'CARD' ? 'card' : 'ACH/wire'}. ${waiting ? 'It is waiting on payment approval.' : 'It is approved.'}`,
      button: 'Open order',
      url,
      note: 'Sent by the Haze Wholesale portal.',
    });
    await sendMail(team, `Portal order #${order.id}: ${order.account.name} ${total}${waiting ? ' (needs approval)' : ''}`, alert.text, alert.html);
  }
}
