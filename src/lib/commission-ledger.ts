import 'server-only';
import type { Prisma } from '@prisma/client';
import { db } from './db';

export interface RepTotals {
  repId: number;
  name: string;
  pending: number;
  earned: number; // earned and not yet paid out
  paid: number;
  reversed: number;
}

const n = (v: unknown) => Number(v ?? 0);

/** Totals by rep and state. */
export async function repTotals(where: Prisma.CommissionEntryWhereInput = {}): Promise<RepTotals[]> {
  const [groups, reps] = await Promise.all([
    db.commissionEntry.groupBy({ by: ['repId', 'state'], where, _sum: { amount: true } }),
    db.rep.findMany({ where: { commissioned: true }, orderBy: { name: 'asc' } }),
  ]);
  const byRep = new Map<number, RepTotals>(reps.map(r => [r.id, { repId: r.id, name: r.name, pending: 0, earned: 0, paid: 0, reversed: 0 }]));
  for (const g of groups) {
    let t = byRep.get(g.repId);
    if (!t) {
      const rep = await db.rep.findUnique({ where: { id: g.repId } });
      t = { repId: g.repId, name: rep?.name ?? `Rep ${g.repId}`, pending: 0, earned: 0, paid: 0, reversed: 0 };
      byRep.set(g.repId, t);
    }
    const amt = n(g._sum.amount);
    if (g.state === 'PENDING') t.pending += amt;
    else if (g.state === 'EARNED') t.earned += amt;
    else if (g.state === 'PAID') t.paid += amt;
    else t.reversed += amt;
  }
  return [...byRep.values()].map(t => ({ ...t, pending: round(t.pending), earned: round(t.earned), paid: round(t.paid), reversed: round(t.reversed) }));
}

export async function ledgerEntries(where: Prisma.CommissionEntryWhereInput, take = 300) {
  return db.commissionEntry.findMany({
    where,
    include: { rep: true, order: { include: { account: { select: { id: true, name: true } } } } },
    orderBy: { createdAt: 'desc' },
    take,
  });
}

export interface PayoutSummary { payoutId: string; repName: string; amount: number; entries: number; paidAt: Date }

/** Payouts are stored as a shared payoutId on the entries they cover: "P-YYYYMMDD-<repId>-<n>". */
export async function payouts(where: Prisma.CommissionEntryWhereInput = {}): Promise<PayoutSummary[]> {
  const groups = await db.commissionEntry.groupBy({
    by: ['payoutId', 'repId'], where: { ...where, state: 'PAID', payoutId: { not: null } },
    _sum: { amount: true }, _count: { _all: true }, _max: { paidAt: true },
  });
  const reps = new Map((await db.rep.findMany()).map(r => [r.id, r.name]));
  return groups
    .map(g => ({ payoutId: g.payoutId!, repName: reps.get(g.repId) ?? '', amount: round(n(g._sum.amount)), entries: g._count._all, paidAt: g._max.paidAt ?? new Date(0) }))
    .sort((a, b) => b.paidAt.getTime() - a.paidAt.getTime());
}

const round = (x: number) => Math.round(x * 100) / 100;

export const STATE_LABEL = {
  PENDING: { text: 'Earned when paid', pill: 'pill-low' },
  EARNED: { text: 'Earned', pill: 'pill-in' },
  PAID: { text: 'Paid out', pill: 'pill-in' },
  REVERSED: { text: 'Reversed', pill: 'pill-out' },
} as const;
