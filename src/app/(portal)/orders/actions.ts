'use server';

import { revalidatePath } from 'next/cache';
import { db } from '@/lib/db';
import { ACH_SETTING, cancelOrder, markOrderPaid, postOrderToOrderTime } from '@/lib/orders';
import { requireUser } from '@/lib/session';

export interface ActionResult { ok: boolean; message: string }

export async function approvePaidOrder(_: ActionResult | null, form: FormData): Promise<ActionResult> {
  const me = await requireUser(['ADMIN']);
  const id = Number(form.get('orderId'));
  const res = await markOrderPaid(id, me.email);
  revalidatePath(`/orders/${id}`);
  revalidatePath('/orders');
  return res;
}

export async function cancelUnpaidOrder(_: ActionResult | null, form: FormData): Promise<ActionResult> {
  const me = await requireUser(['ADMIN']);
  const id = Number(form.get('orderId'));
  const res = await cancelOrder(id, me.email);
  revalidatePath(`/orders/${id}`);
  revalidatePath('/orders');
  return res;
}

export async function retryOrderTime(_: ActionResult | null, form: FormData): Promise<ActionResult> {
  await requireUser(['ADMIN']);
  const id = Number(form.get('orderId'));
  await postOrderToOrderTime(id);
  const o = await db.order.findUnique({ where: { id }, select: { otSalesOrderNo: true, otError: true } });
  revalidatePath(`/orders/${id}`);
  return o?.otSalesOrderNo
    ? { ok: true, message: `Sent to Order Time as sales order ${o.otSalesOrderNo}.` }
    : { ok: false, message: `Still not sent: ${o?.otError ?? 'unknown error'}` };
}

export async function saveAchInstructions(_: ActionResult | null, form: FormData): Promise<ActionResult> {
  const me = await requireUser(['ADMIN']);
  const value = String(form.get('value') ?? '').trim().slice(0, 4000);
  await db.setting.upsert({ where: { key: ACH_SETTING }, create: { key: ACH_SETTING, value, updatedBy: me.email }, update: { value, updatedBy: me.email } });
  await db.auditLog.create({ data: { actor: me.email, action: 'settings.ach_instructions' } });
  revalidatePath('/orders');
  return { ok: true, message: 'ACH / wire instructions saved.' };
}

export async function checkShipping(_: ActionResult | null, form: FormData): Promise<ActionResult> {
  await requireUser(['ADMIN']);
  const id = Number(form.get('orderId'));
  const { shipmentsForOrderNumber, shipmentsForSalesOrder, shipstationConfigured, toTracking } = await import('@/lib/shipstation');
  if (!shipstationConfigured()) return { ok: false, message: 'Add SHIPSTATION_API_KEY and SHIPSTATION_API_SECRET in Railway first.' };
  const o = await db.order.findUnique({ where: { id }, select: { otSalesOrderNo: true } });
  if (!o?.otSalesOrderNo) return { ok: false, message: 'This order isn’t in Order Time yet.' };
  try {
    const found = shipmentsForSalesOrder(await shipmentsForOrderNumber(String(o.otSalesOrderNo)), o.otSalesOrderNo).map(toTracking);
    if (!found.length) {
      await db.order.update({ where: { id }, data: { shipCheckedAt: new Date() } });
      return { ok: true, message: `No shipment in ShipStation for sales order ${o.otSalesOrderNo} yet.` };
    }
    const first = found.map(t => t.shipDate).filter(Boolean).sort()[0];
    await db.order.update({ where: { id }, data: { tracking: found as object[], shippedAt: first ? new Date(first) : new Date(), shipCheckedAt: new Date() } });
    revalidatePath(`/orders/${id}`);
    return { ok: true, message: `Shipped: ${found.map(t => `${t.carrier} ${t.number}`).join(', ')}` };
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : 'ShipStation lookup failed.' };
  }
}
