import { CartBar } from '@/components/cart-bar';
import { QuickOrder } from '@/components/quick-order';
import { RepAccountPicker } from '@/components/rep-picker';
import { getCatalog } from '@/lib/catalog';
import { shopContext } from '@/lib/context';
import { requireUser } from '@/lib/session';

export const dynamic = 'force-dynamic';

export default async function QuickOrderPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const user = await requireUser();
  const ctx = await shopContext(user, await searchParams);
  const items = await getCatalog(ctx.level);
  return (
    <main className="wrap">
      {user.role === 'REP' && <RepAccountPicker accounts={ctx.repAccounts} selected={ctx.account?.id ?? null} />}
      <div className="page-head">
        <div>
          <h1 className="display">{ctx.canOrder ? 'Quick order' : 'Inventory list'}</h1>
          <p>Every in-stock case and display in one list{ctx.canOrder ? '. Type quantities and review your order when you’re done.' : '.'}</p>
        </div>
      </div>
      <QuickOrder items={items} canOrder={ctx.canOrder} />
      <CartBar carry={ctx.carry} />
    </main>
  );
}
