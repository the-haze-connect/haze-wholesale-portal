import { CartView } from '@/components/cart-view';
import { RepAccountPicker } from '@/components/rep-picker';
import { authnetPublicConfig } from '@/lib/authnet';
import { getCatalog } from '@/lib/catalog';
import { sampleLimit } from '@/lib/orders';
import { getSamples } from '@/lib/samples';
import { shopContext } from '@/lib/context';
import { db } from '@/lib/db';
import { BLOCKED_STATES, CARD_FEE_PERCENT } from '@/lib/rules';
import { requireUser } from '@/lib/session';

export const dynamic = 'force-dynamic';

export default async function CartPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const user = await requireUser(['BUYER', 'REP', 'ADMIN']);
  const ctx = await shopContext(user, await searchParams);
  const [items, samples, limit] = await Promise.all([getCatalog(ctx.level), getSamples(), sampleLimit()]);

  const adminAccounts = user.role === 'ADMIN'
    ? await db.account.findMany({ where: { status: 'ACTIVE' }, select: { id: true, name: true }, orderBy: { name: 'asc' } })
    : [];
  const account = ctx.account ? await db.account.findUnique({ where: { id: ctx.account.id } }) : null;

  let blockedReason: string | null = null;
  if (!ctx.account) blockedReason = user.role === 'BUYER' ? 'Your login isn’t linked to a shop yet. Contact your rep.' : 'Choose which shop this order is for (above).';
  else if (!ctx.canOrder) blockedReason = 'This account isn’t active for ordering. Contact your rep.';
  else if (account?.shipState && BLOCKED_STATES.includes(account.shipState)) blockedReason = `We can’t ship to ${account.shipState}. Contact your rep if this address is wrong.`;

  return (
    <main className="wrap">
      {user.role === 'REP' && <RepAccountPicker accounts={ctx.repAccounts} selected={ctx.account?.id ?? null} />}
      {user.role === 'ADMIN' && <RepAccountPicker accounts={adminAccounts} selected={ctx.account?.id ?? null} admin />}
      <div className="page-head">
        <div>
          <h1 className="display">Review order</h1>
          <p>{ctx.account ? `For ${ctx.account.name} · ${ctx.account.tier}. ` : ''}Free shipping. Prices and stock are rechecked when you submit.</p>
        </div>
      </div>
      <CartView items={items} samples={samples} sampleLimit={limit} feePercent={CARD_FEE_PERCENT} card={authnetPublicConfig()}
        forAccountId={user.role === 'BUYER' ? null : ctx.account?.id ?? null}
        canSubmit={!blockedReason} blockedReason={blockedReason} />
    </main>
  );
}
