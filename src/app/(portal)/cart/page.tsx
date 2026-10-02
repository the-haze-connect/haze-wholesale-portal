import { CartView } from '@/components/cart-view';
import { getCatalog } from '@/lib/catalog';
import { shopContext } from '@/lib/context';
import { CARD_FEE_PERCENT } from '@/lib/rules';
import { requireUser } from '@/lib/session';

export const dynamic = 'force-dynamic';

export default async function CartPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const user = await requireUser();
  const ctx = await shopContext(user, await searchParams);
  const items = await getCatalog(ctx.level);
  return (
    <main className="wrap">
      <div className="page-head">
        <div>
          <h1 className="display">Review order</h1>
          <p>{ctx.account ? `For ${ctx.account.name} · ${ctx.account.tier}. ` : ''}Prices and stock are rechecked against Order Time when you submit.</p>
        </div>
      </div>
      <CartView items={items} feePercent={CARD_FEE_PERCENT} />
    </main>
  );
}
