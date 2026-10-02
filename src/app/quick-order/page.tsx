import { CartBar } from '@/components/cart-bar';
import { levelParam } from '@/components/format';
import { QuickOrder } from '@/components/quick-order';
import { getCatalog } from '@/lib/catalog';

export const dynamic = 'force-dynamic';

export default async function QuickOrderPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const level = levelParam((await searchParams).level);
  const items = await getCatalog(level);
  return (
    <main className="wrap">
      <div className="page-head">
        <div>
          <h1 className="display">Quick order</h1>
          <p>Every in-stock case and display in one list. Type quantities and review your order when you’re done.</p>
        </div>
      </div>
      <QuickOrder items={items} />
      <CartBar level={level} />
    </main>
  );
}
