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
