import 'server-only';
import type { Prisma } from '@prisma/client';
import type { SessionUser } from './session';

/** Which orders a user may see: admins all, reps their accounts', buyers their own shop's. */
export function orderScope(user: SessionUser): Prisma.OrderWhereInput {
  if (user.role === 'ADMIN') return {};
  if (user.role === 'REP') return { account: { repId: user.repId ?? -1 } };
  return { accountId: user.accountId ?? -1 };
}

export const STATUS_LABEL: Record<string, { text: string; pill: string }> = {
  SUBMITTED: { text: 'Waiting on payment', pill: 'pill-low' },
  APPROVED: { text: 'Approved', pill: 'pill-in' },
  REJECTED: { text: 'Rejected', pill: 'pill-out' },
  CANCELLED: { text: 'Cancelled', pill: 'pill-out' },
};

/** Status shown to people: approved orders become "Shipped" once ShipStation has tracking. */
export const statusOf = (o: { status: string; shippedAt?: Date | null }) =>
  o.status === 'APPROVED' && o.shippedAt ? { text: 'Shipped', pill: 'pill-in' } : STATUS_LABEL[o.status]!;

export const fmtDate = (d: Date) => d.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: 'America/Chicago' });

/** Which Order Time sales orders a user may see. Reps also see orders they were the rep on. */
export async function otOrderScope(user: SessionUser): Promise<Prisma.OtOrderWhereInput> {
  if (user.role === 'ADMIN') return {};
  if (user.role === 'REP') {
    const { db } = await import('./db');
    const rep = user.repId ? await db.rep.findUnique({ where: { id: user.repId }, select: { otId: true } }) : null;
    return { OR: [{ account: { repId: user.repId ?? -1 } }, ...(rep ? [{ repOtId: rep.otId }] : [])] };
  }
  return { accountId: user.accountId ?? -1 };
}

/** Order Time status names vary ("Open", "Shipped", "Invoiced", "Closed", "Void"...); color them by meaning. */
export function otStatus(status: string | null, shipped: boolean): { text: string; pill: string } {
  const s = (status ?? '').trim();
  if (/void|cancel/i.test(s)) return { text: s, pill: 'pill-out' };
  if (shipped && !/ship|invoic|clos|complet|paid/i.test(s)) return { text: 'Shipped', pill: 'pill-in' };
  if (/ship|invoic|clos|complet|paid|fulfil/i.test(s)) return { text: s, pill: 'pill-in' };
  return s ? { text: s, pill: 'pill-low' } : { text: 'Placed', pill: 'pill-in' };
}

export const fmtDay = (d: Date) => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
