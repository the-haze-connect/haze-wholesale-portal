import { NextResponse, type NextRequest } from 'next/server';
import { healthReport } from '@/lib/health';
import { currentUser } from '@/lib/session';

export const dynamic = 'force-dynamic';

const cell = (v: unknown) => {
  const s = v === null || v === undefined ? '' : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

/** CSV of one data-health list (?list=key), or all lists stacked with a section column. */
export async function GET(req: NextRequest) {
  const user = await currentUser();
  if (user?.role !== 'ADMIN') return new NextResponse('Not allowed', { status: 403 });
  const key = req.nextUrl.searchParams.get('list');
  const { lists } = await healthReport();
  const day = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Chicago' });
  let csv: string;
  let name: string;
  if (key) {
    const l = lists.find(x => x.key === key);
    if (!l) return new NextResponse('Unknown list', { status: 404 });
    csv = [l.columns, ...l.rows].map(r => r.map(cell).join(',')).join('\n');
    name = `data-health-${key}-${day}.csv`;
  } else {
    const rows: unknown[][] = [['Issue', 'Fix', 'Detail 1', 'Detail 2', 'Detail 3', 'Detail 4', 'Detail 5']];
    for (const l of lists) for (const r of l.rows) rows.push([l.title, l.fix, ...r]);
    csv = rows.map(r => r.map(cell).join(',')).join('\n');
    name = `data-health-${day}.csv`;
  }
  return new NextResponse(csv, { headers: { 'content-type': 'text/csv; charset=utf-8', 'content-disposition': `attachment; filename="${name}"` } });
}
