import type { PrismaClient } from '@prisma/client';
import { OrderTime, RecordType, configFromEnv } from '../ordertime/client';

/**
 * Order history from Order Time sales orders.
 * - Recent run (every 30 min): the newest 2,000 sales orders, newest first.
 * - Full run (first start, then nightly): every sales order.
 * Line items load with the list when Order Time includes them; otherwise on demand (see loadOtOrderLines).
 */

type Obj = Record<string, unknown>;
export interface OtLine { itemId: number | null; code: string; description: string; quantity: number; price: number; uom: string | null }

const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : typeof v === 'string' && v.trim() && Number.isFinite(Number(v)) ? Number(v) : null);
const ref = (v: unknown) => (v && typeof v === 'object' ? v as { Id?: number; Name?: string } : null);
const date = (v: unknown) => { if (typeof v !== 'string') return null; const d = new Date(v); return Number.isNaN(d.getTime()) ? null : d; };
const round2 = (n: number) => Math.round(n * 100) / 100;

export function parseLines(raw: unknown): OtLine[] | null {
  if (!Array.isArray(raw)) return null;
  return (raw as Obj[]).map(l => {
    const item = ref(l.ItemRef);
    return {
      itemId: item?.Id ?? null,
      code: item?.Name ?? '',
      description: typeof l.Description === 'string' ? l.Description : '',
      quantity: num(l.Quantity) ?? 0,
      price: num(l.Price) ?? 0,
      uom: ref(l.UomRef)?.Name ?? null,
    };
  }).filter(l => l.code || l.description);
}

/** Header fields from a list row or a full sales order. */
export function parseSalesOrder(o: Obj) {
  const lines = parseLines(o.LineItems);
  const ship = num(o.ShipAmount) ?? 0;
  const fee = num(o.AdditionalFeeAmount) ?? 0;
  const discount = num(o.DiscountAmount) ?? 0;
  const statedTotal = num(o.Total) ?? num(o.TotalAmount) ?? num(o.DocTotal) ?? num(o.Amount);
  const total = statedTotal ?? (lines ? round2(lines.reduce((s, l) => s + l.quantity * l.price, 0) + ship + fee - discount) : null);
  return {
    docNo: num(o.DocNo)!,
    otCustomerId: ref(o.CustomerRef)?.Id ?? 0,
    repOtId: ref(o.SalesRepRef)?.Id ?? null,
    repName: ref(o.SalesRepRef)?.Name ?? null,
    date: date(o.Date) ?? new Date(0),
    promiseDate: date(o.PromiseDate),
    status: ref(o.StatusRef)?.Name ?? (typeof o.Status === 'string' ? o.Status : null),
    customerPO: typeof o.CustomerPO === 'string' && o.CustomerPO.trim() ? o.CustomerPO.trim() : null,
    shipMethod: ref(o.ShipMethodRef)?.Name ?? null,
    shipAmount: ship || null,
    total,
    lines,
  };
}

let loggedShape = false;

export async function syncOtOrders(db: PrismaClient, mode: 'recent' | 'full') {
  const ot = new OrderTime(configFromEnv());
  const fetchRows = async (extra: Obj) => mode === 'full'
    ? ot.listAll<Obj>(RecordType.SalesOrder, extra, 100)
    : [...await ot.listPage<Obj>(RecordType.SalesOrder, 1, 1000, extra), ...await ot.listPage<Obj>(RecordType.SalesOrder, 2, 1000, extra)];
  let rows: Obj[];
  try {
    rows = await fetchRows({ Sortation: { PropertyName: 'DocNo', Direction: 2 } }); // newest first
  } catch (err) {
    console.warn('[orders] sorted list failed, falling back to a full read:', err instanceof Error ? err.message : err);
    rows = await ot.listAll<Obj>(RecordType.SalesOrder, {}, 100);
  }
  if (!loggedShape && rows[0]) {
    loggedShape = true;
    console.log('[orders] Order Time sales order fields:', Object.keys(rows[0]).join(', '));
  }

  const [accounts, portal] = await Promise.all([
    db.account.findMany({ where: { otCustomerId: { not: null } }, select: { id: true, otCustomerId: true } }),
    db.order.findMany({ where: { otSalesOrderNo: { not: null } }, select: { id: true, otSalesOrderNo: true } }),
  ]);
  const accountBy = new Map(accounts.map(a => [a.otCustomerId!, a.id]));
  const portalBy = new Map(portal.map(o => [o.otSalesOrderNo!, o.id]));

  let saved = 0;
  for (const row of rows) {
    const so = parseSalesOrder(row);
    if (!so.docNo) continue;
    const { lines, ...head } = so;
    const data = {
      ...head,
      accountId: accountBy.get(so.otCustomerId) ?? null,
      portalOrderId: portalBy.get(so.docNo) ?? null,
      syncedAt: new Date(),
      ...(lines ? { lines: lines as object[], lineCount: lines.length, linesAt: new Date() } : {}),
    };
    // Keep a total worked out from loaded lines if the list row doesn't carry one
    if (data.total === null) delete (data as { total?: unknown }).total;
    await db.otOrder.upsert({ where: { docNo: so.docNo }, create: data, update: data });
    saved++;
  }
  return { mode, saved };
}

/** Loads (and caches) one sales order's line items from Order Time. */
export async function loadOtOrderLines(db: PrismaClient, docNo: number) {
  const full = await new OrderTime(configFromEnv()).getSalesOrder(docNo);
  const so = parseSalesOrder(full as Obj);
  return db.otOrder.update({
    where: { docNo },
    data: {
      lines: (so.lines ?? []) as object[], lineCount: so.lines?.length ?? 0, linesAt: new Date(),
      total: so.total, shipAmount: so.shipAmount, status: so.status ?? undefined, shipMethod: so.shipMethod,
    },
  });
}

/** Fill in line items for orders that don't have them yet, newest first, a few per run. */
export async function backfillOtLines(db: PrismaClient, limit = 40) {
  const missing = await db.otOrder.findMany({ where: { linesAt: null, accountId: { not: null } }, orderBy: { date: 'desc' }, take: limit, select: { docNo: true } });
  let done = 0, failures = 0;
  for (const m of missing) {
    try { await loadOtOrderLines(db, m.docNo); done++; failures = 0; } catch (err) {
      console.error(`[orders] lines for SO ${m.docNo}:`, err instanceof Error ? err.message : err);
      if (++failures >= 3) break; // Order Time is having trouble; try again next run
    }
  }
  return done;
}
