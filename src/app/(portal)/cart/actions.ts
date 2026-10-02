'use server';

import type { RequestedLine } from '@/lib/checkout';
import { shopContext } from '@/lib/context';
import { placeOrder, type PlaceOrderResult } from '@/lib/orders';
import { requireUser } from '@/lib/session';

export interface SubmitOrderPayload {
  forAccountId: number | null;
  lines: RequestedLine[];
  payment: 'CARD' | 'ACH_WIRE';
  expectedTotal: number;
  customerPO: string;
  notes: string;
  opaqueData: { dataDescriptor: string; dataValue: string } | null;
}

export async function submitOrder(payload: SubmitOrderPayload): Promise<PlaceOrderResult> {
  const user = await requireUser(['BUYER', 'REP', 'ADMIN']);
  const ctx = await shopContext(user, payload.forAccountId ? { for: String(payload.forAccountId) } : {});
  if (!ctx.account || !ctx.canOrder) {
    return { ok: false, message: user.role === 'BUYER' ? 'Your account isn’t set up for ordering yet. Contact your rep.' : 'Choose which shop this order is for.' };
  }
  if (!Array.isArray(payload.lines) || payload.lines.length > 200) return { ok: false, message: 'Your cart could not be read. Refresh and try again.' };
  const payment = payload.payment === 'CARD' ? 'CARD' : 'ACH_WIRE';

  try {
    return await placeOrder({
      user,
      accountId: ctx.account.id,
      lines: payload.lines.map(l => ({ productId: Number(l.productId), uom: String(l.uom), quantity: Number(l.quantity) })),
      payment,
      expectedTotal: Number(payload.expectedTotal),
      customerPO: String(payload.customerPO ?? ''),
      notes: String(payload.notes ?? ''),
      opaqueData: payment === 'CARD' && payload.opaqueData
        ? { dataDescriptor: String(payload.opaqueData.dataDescriptor), dataValue: String(payload.opaqueData.dataValue) }
        : null,
    });
  } catch (err) {
    console.error('[checkout] failed:', err instanceof Error ? err.stack : err);
    return { ok: false, message: 'Something went wrong placing your order. Check your Orders page before trying again, so you aren’t charged twice, or contact your rep.' };
  }
}
