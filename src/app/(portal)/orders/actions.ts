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
