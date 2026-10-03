import { NextResponse, type NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { currentUser } from '@/lib/session';

export const dynamic = 'force-dynamic';

const day = (d: Date) => d.toLocaleDateString('en-CA', { timeZone: 'America/Chicago' });
const cell = (v: unknown) => {
  const s = v === null || v === undefined ? '' : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

/** CSV of commission entries. Admins: all or one rep. Reps: their own. */
export async function GET(req: NextRequest) {
  const user = await currentUser();
  if (!user || (user.role !== 'ADMIN' && user.role !== 'REP')) return new NextResponse('Not allowed', { status: 403 });
  const repId = user.role === 'REP' ? user.repId ?? -1 : Number(req.nextUrl.searchParams.get('rep')) || undefined;

  const rows = await db.commissionEntry.findMany({
    where: repId ? { repId } : {},
    include: { rep: true, order: { include: { account: { select: { name: true } } } } },
    orderBy: { createdAt: 'asc' },
  });
  const header = ['Date', 'Rep', 'Order', 'Shop', 'Rule', 'Basis', 'Amount', 'Status', 'Payout', 'Paid on', 'Note'];
  const lines = rows.map(r => [
    day(r.createdAt), r.rep.name, r.orderId ?? '', r.order?.account.name ?? '', r.rule, Number(r.basis),
    Number(r.amount).toFixed(2), r.state, r.payoutId ?? '', r.paidAt ? day(r.paidAt) : '', r.note ?? '',
  ].map(cell).join(','));
  const name = `commissions-${day(new Date())}.csv`;
  return new NextResponse([header.join(','), ...lines].join('\n'), {
    headers: { 'content-type': 'text/csv; charset=utf-8', 'content-disposition': `attachment; filename="${name}"` },
  });
}
