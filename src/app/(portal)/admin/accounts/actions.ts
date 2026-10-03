'use server';

import { revalidatePath } from 'next/cache';
import { db } from '@/lib/db';
import { requireUser } from '@/lib/session';

const STATUSES = ['ACTIVE', 'ON_HOLD', 'CLOSED'] as const;

/** Portal-only account status. Order Time sync never overwrites it. */
export async function setAccountStatus(form: FormData) {
  const me = await requireUser(['ADMIN']);
  const id = Number(form.get('id'));
  const status = STATUSES.find(s => s === form.get('status'));
  if (!id || !status) return;
  const before = await db.account.findUnique({ where: { id }, select: { status: true, name: true } });
  if (!before || before.status === status) return;
  await db.account.update({ where: { id }, data: { status } });
  await db.auditLog.create({ data: { actor: me.email, action: 'account.status', detail: { id, name: before.name, from: before.status, to: status } } });
  revalidatePath('/admin/accounts');
  revalidatePath(`/admin/accounts/${id}`);
}

/** Remove a buyer's login (they can be invited again later). */
export async function removeLogin(form: FormData) {
  const me = await requireUser(['ADMIN']);
  const userId = Number(form.get('userId'));
  const u = await db.buyerUser.findUnique({ where: { id: userId } });
  if (!u || u.role === 'ADMIN' || u.role === 'REP') return;
  await db.buyerUser.delete({ where: { id: userId } });
  await db.auditLog.create({ data: { actor: me.email, action: 'login.remove', detail: { email: u.email, accountId: u.accountId } } });
  if (u.accountId) revalidatePath(`/admin/accounts/${u.accountId}`);
}

/** Switch a buyer between "can order" and "view only". */
export async function setLoginAccess(form: FormData) {
  const me = await requireUser(['ADMIN']);
  const userId = Number(form.get('userId'));
  const role = form.get('role') === 'VIEW_ONLY' ? 'VIEW_ONLY' : 'BUYER';
  const u = await db.buyerUser.findUnique({ where: { id: userId } });
  if (!u || (u.role !== 'BUYER' && u.role !== 'VIEW_ONLY')) return;
  await db.buyerUser.update({ where: { id: userId }, data: { role } });
  await db.auditLog.create({ data: { actor: me.email, action: 'login.access', detail: { email: u.email, role } } });
  if (u.accountId) revalidatePath(`/admin/accounts/${u.accountId}`);
}
