import { CartView } from '@/components/cart-view';
import { levelParam } from '@/components/format';
import { getCatalog } from '@/lib/catalog';
import { CARD_FEE_PERCENT } from '@/lib/rules';

export const dynamic = 'force-dynamic';

export default async function CartPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const level = levelParam((await searchParams).level);
  const items = await getCatalog(level);
  return (
    <main className="wrap">
      <div className="page-head">
        <div>
          <h1 className="display">Review order</h1>
          <p>Prices and stock are rechecked against Order Time when you submit.</p>
        </div>
      </div>
      <CartView items={items} feePercent={CARD_FEE_PERCENT} />
    </main>
  );
}
