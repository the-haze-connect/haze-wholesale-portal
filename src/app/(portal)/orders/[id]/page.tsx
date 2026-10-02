import Link from 'next/link';
import { notFound } from 'next/navigation';
import { money } from '@/components/format';
import { db } from '@/lib/db';
import { STATUS_LABEL, fmtDate, orderScope } from '@/lib/order-access';
import { ACH_SETTING, getSetting } from '@/lib/orders';
import { CARD_FEE_PERCENT } from '@/lib/rules';
import { requireUser } from '@/lib/session';
import { approvePaidOrder, cancelUnpaidOrder, retryOrderTime } from '../actions';
import { OrderActionButton } from '../forms';

export const dynamic = 'force-dynamic';

const UOM_LABEL: Record<string, string> = { EA: 'Case', '1/4LB': '¼ lb bag', '1/2LB': '½ lb bag', LB: '1 lb bag' };

export default async function OrderPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | undefined>> }) {
  const user = await requireUser();
  const id = Number((await params).id);
  const placed = (await searchParams).placed === '1';
  if (!Number.isInteger(id)) notFound();

  const order = await db.order.findFirst({
    where: { id, ...orderScope(user) },
    include: { account: true, rep: true, lines: { include: { product: true }, orderBy: { id: 'asc' } }, commissions: { include: { rep: true } } },
  });
  if (!order) notFound();
  const isAdmin = user.role === 'ADMIN';
  const canSeeCommission = isAdmin || user.role === 'REP';
  const waitingAch = order.status === 'SUBMITTED' && order.paymentMethod === 'ACH_WIRE';
  const ach = waitingAch ? await getSetting(ACH_SETTING) : null;
  const status = STATUS_LABEL[order.status]!;

  return (
    <main className="wrap">
      {placed && (
        <div className="sent" role="status" style={{ marginBottom: 8 }}>
          <b>Order #{order.id} is in. A confirmation email is on its way.</b>
          <span>{order.status === 'APPROVED' ? 'Your card was charged and the order is approved.' : waitingAch ? 'Send payment using the details below. We approve and ship once it arrives.' : 'Your payment is being reviewed. We’ll confirm shortly.'}</span>
        </div>
      )}

      <div className="page-head">
        <div>
          <h1 className="display">Order #{order.id}</h1>
          <p>{order.account.name} · placed {fmtDate(order.createdAt)}{order.customerPO ? ` · PO ${order.customerPO}` : ''}</p>
        </div>
        <span className={`pill ${status.pill}`} style={{ fontSize: 14 }}>{status.text}</span>
      </div>

      <div className="two">
        <section className="panel">
          <div className="panel-head"><h2 className="display">Items</h2></div>
          <div className="table-wrap">
            <table>
              <thead><tr><th>Product</th><th className="num">Price</th><th className="num">Qty</th><th className="num">Total</th></tr></thead>
              <tbody>
                {order.lines.map(l => (
                  <tr key={l.id}>
                    <td><b>{l.product.name}</b><span className="sub">{UOM_LABEL[l.uom] ?? l.uom} · {l.product.code}</span></td>
                    <td className="num">{money(Number(l.unitPrice))}</td>
                    <td className="num">{Number(l.quantity)}</td>
                    <td className="num"><b>{money(Number(l.lineTotal))}</b></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {order.notes && <p style={{ marginTop: 16 }}><span className="label">Notes</span><br />{order.notes}</p>}
        </section>

        <aside className="rail">
          <section className="panel">
            <p className="label">Summary</p>
            <div className="sum-row"><span>Subtotal</span><b>{money(Number(order.subtotal))}</b></div>
            <div className="sum-row"><span>Shipping</span><b>Free</b></div>
            {Number(order.cardFee) > 0 && <div className="sum-row"><span>Card processing ({CARD_FEE_PERCENT}%)</span><b>{money(Number(order.cardFee))}</b></div>}
            <div className="sum-row"><span>Total</span><b>{money(Number(order.total))}</b></div>
            <div className="sum-row"><span>Payment</span><b>{order.paymentMethod === 'CARD' ? `Card${order.cardLast4 ? ` ending ${order.cardLast4}` : ''}` : 'ACH / wire'}</b></div>
            {order.paidAt && <div className="sum-row"><span>Paid</span><b>{fmtDate(order.paidAt)}</b></div>}
          </section>

          {waitingAch && (
            <section className="panel">
              <p className="label">Pay by ACH or wire</p>
              <p style={{ whiteSpace: 'pre-line', margin: '10px 0' }}>{ach || 'We’ll email our ACH and wire details shortly.'}</p>
              <p style={{ fontSize: 13.5, color: 'var(--ink-2)', margin: 0 }}>Amount: <b>{money(Number(order.total))}</b>. Put <b>Order #{order.id}</b> in the memo so we can match your payment.</p>
            </section>
          )}

          {canSeeCommission && order.commissions.length > 0 && (
            <section className="panel">
              <p className="label">Commission · {order.commissions[0]!.rep.name}</p>
              {order.commissions.map(c => (
                <div key={c.id} className="sum-row"><span>{c.rule}<span className="sub">{c.state === 'EARNED' ? 'Earned' : c.state === 'PENDING' ? 'Earned when paid' : c.state === 'PAID' ? 'Paid out' : 'Reversed'}</span></span><b>{money(Number(c.amount))}</b></div>
              ))}
            </section>
          )}

          {isAdmin && (
            <section className="panel" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <p className="label">Admin</p>
              {order.status === 'SUBMITTED' && (
                <>
                  <OrderActionButton action={approvePaidOrder} orderId={order.id}
                    label={order.paymentMethod === 'CARD' ? 'Approve (card review cleared)' : 'Payment received: approve'}
                    confirm={`Approve order #${order.id} and send it to Order Time?`} />
                  {order.paymentMethod === 'ACH_WIRE' && <OrderActionButton action={cancelUnpaidOrder} orderId={order.id} label="Cancel order" kind="ghost" confirm={`Cancel order #${order.id}? This releases the reserved stock.`} />}
                  {order.paymentMethod === 'CARD' && <p style={{ fontSize: 13, color: 'var(--ink-2)', margin: 0 }}>Authorize.net held this card payment for review (transaction {order.paymentRef}). Approve or void it in Authorize.net first.</p>}
                </>
              )}
              {order.status === 'APPROVED' && (order.otSalesOrderNo
                ? <p style={{ margin: 0 }}>Order Time sales order <b>{order.otSalesOrderNo}</b>{order.otPostedAt ? ` · sent ${fmtDate(order.otPostedAt)}` : ''}</p>
                : (
                  <>
                    <p className="note-warn">Not in Order Time yet{order.otError ? `: ${order.otError}` : '.'}</p>
                    <OrderActionButton action={retryOrderTime} orderId={order.id} label="Send to Order Time again" kind="ghost" />
                  </>
                ))}
              {order.paymentRef && <p style={{ fontSize: 13, color: 'var(--ink-3)', margin: 0 }}>Authorize.net transaction {order.paymentRef}</p>}
              {order.approvedBy && order.approvedBy !== 'card' && <p style={{ fontSize: 13, color: 'var(--ink-3)', margin: 0 }}>Approved by {order.approvedBy}</p>}
            </section>
          )}

          <Link className="btn btn-ghost" href="/orders">All orders</Link>
        </aside>
      </div>
    </main>
  );
}
