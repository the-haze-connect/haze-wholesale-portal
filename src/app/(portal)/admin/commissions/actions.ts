'use server';

import { revalidatePath } from 'next/cache';
import { db } from '@/lib/db';
import { requireUser } from '@/lib/session';

export interface FormResult { ok: boolean; message: string }

const money = (n: number) => `$${n.toFixed(2)}`;
function refresh() {
  revalidatePath('/admin/commissions');
  revalidatePath('/commissions');
}

/** Mark everything a rep has earned (optionally through a date) as paid, as one payout. */
export async function payOutRep(_: FormResult | null, form: FormData): Promise<FormResult> {
  const me = await requireUser(['ADMIN']);
  const repId = Number(form.get('repId'));
  const through = String(form.get('through') ?? '');
  const cutoff = /^\d{4}-\d{2}-\d{2}$/.test(through) ? new Date(`${through}T23:59:59-05:00`) : null;
  const rep = await db.rep.findUnique({ where: { id: repId } });
  if (!rep) return { ok: false, message: 'Choose a rep.' };

  const where = { repId, state: 'EARNED' as const, ...(cutoff ? { createdAt: { lte: cutoff } } : {}) };
  const sum = await db.commissionEntry.aggregate({ where, _sum: { amount: true }, _count: { _all: true } });
  const total = Number(sum._sum.amount ?? 0);
  if (!sum._count._all) return { ok: false, message: `${rep.name} has nothing earned to pay out${cutoff ? ' through that date' : ''}.` };
  if (total <= 0) return { ok: false, message: `${rep.name}’s earned balance is ${money(total)} after adjustments, so there’s nothing to pay.` };

  const day = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Chicago' }).replace(/-/g, '');
  const prior = await db.commissionEntry.findFirst({ where: { payoutId: { startsWith: `P-${day}-${repId}-` } }, orderBy: { payoutId: 'desc' } });
  const seq = prior ? Number(prior.payoutId!.split('-').pop()) + 1 : 1;
  const payoutId = `P-${day}-${repId}-${seq}`;

  const { count } = await db.commissionEntry.updateMany({ where, data: { state: 'PAID', payoutId, paidAt: new Date() } });
  await db.auditLog.create({ data: { actor: me.email, action: 'commission.payout', detail: { repId, rep: rep.name, payoutId, entries: count, total } } });
  refresh();
  return { ok: true, message: `Recorded payout ${payoutId}: ${money(total)} to ${rep.name} (${count} entr${count === 1 ? 'y' : 'ies'}).` };
}

/**
 * Reverse an entry (e.g. a cancelled order or a return).
 * Unpaid entries are marked reversed; paid ones get an offsetting entry taken out of the next payout.
 */
export async function reverseEntry(form: FormData) {
  const me = await requireUser(['ADMIN']);
  const id = Number(form.get('id'));
  const note = String(form.get('note') ?? '').trim().slice(0, 200) || 'Reversed';
  const e = await db.commissionEntry.findUnique({ where: { id } });
  if (!e || e.state === 'REVERSED') return;
  if (e.state === 'PAID') {
    await db.commissionEntry.create({
      data: { orderId: e.orderId, repId: e.repId, rule: `Clawback of entry #${e.id}`, basis: e.basis, amount: -Number(e.amount), state: 'EARNED', note, createdBy: me.email },
    });
  } else {
    await db.commissionEntry.update({ where: { id }, data: { state: 'REVERSED', note } });
  }
  await db.auditLog.create({ data: { actor: me.email, action: 'commission.reverse', detail: { id, state: e.state, amount: Number(e.amount), note } } });
  refresh();
}

/** Manual adjustment (partial return, bonus, correction). Negative amounts reduce the next payout. */
export async function addAdjustment(_: FormResult | null, form: FormData): Promise<FormResult> {
  const me = await requireUser(['ADMIN']);
  const repId = Number(form.get('repId'));
  const amount = Math.round(Number(form.get('amount')) * 100) / 100;
  const note = String(form.get('note') ?? '').trim().slice(0, 200);
  const orderId = Number(form.get('orderId')) || null;
  const rep = await db.rep.findUnique({ where: { id: repId } });
  if (!rep) return { ok: false, message: 'Choose a rep.' };
  if (!Number.isFinite(amount) || amount === 0 || Math.abs(amount) > 100000) return { ok: false, message: 'Enter an amount, like 25 or -40.' };
  if (!note) return { ok: false, message: 'Add a short reason so the rep knows what it’s for.' };
  if (orderId && !(await db.order.findUnique({ where: { id: orderId } }))) return { ok: false, message: `There’s no portal order #${orderId}.` };

  await db.commissionEntry.create({ data: { repId, orderId, rule: 'Adjustment', basis: 0, amount, state: 'EARNED', note, createdBy: me.email } });
  await db.auditLog.create({ data: { actor: me.email, action: 'commission.adjust', detail: { repId, amount, note, orderId } } });
  refresh();
  return { ok: true, message: `Added ${amount < 0 ? '−' : ''}${money(Math.abs(amount))} for ${rep.name}.` };
}
