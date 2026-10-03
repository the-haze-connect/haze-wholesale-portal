/**
 * Runs once when the server starts:
 * - Order Time sync (catalog, HQ stock, prices, reps, customers, store photos): at startup, then every 5 minutes.
 * - ShipStation tracking for shipped portal orders: every 15 minutes, when ShipStation keys are set.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;
  if (!process.env.DATABASE_URL) return;

  const every = (name: string, minutes: number, firstDelayMs: number, job: () => Promise<string | null>) => {
    let running = false;
    const tick = async () => {
      if (running) return;
      running = true;
      const started = Date.now();
      try {
        const msg = await job();
        if (msg) console.log(`[${name}] ${msg} in ${Math.round((Date.now() - started) / 1000)}s`);
      } catch (err) {
        console.error(`[${name}] failed:`, err instanceof Error ? err.message : err);
      } finally {
        running = false;
      }
    };
    setTimeout(tick, firstDelayMs);
    setInterval(tick, minutes * 60_000);
  };

  if (process.env.ORDERTIME_API_KEY && process.env.DISABLE_ORDERTIME_SYNC !== '1') {
    const { runSync } = await import('./lib/sync/run');
    every('sync', Number(process.env.ORDERTIME_SYNC_MINUTES ?? 5), 5_000, async () => {
      const r = await runSync();
      return `${r.products} products (${r.inStock} in stock), ${r.accounts} accounts${r.photos ? `, ${r.photos.matched}/${r.photos.total} with store photos` : ''}`;
    });
  }

  if (process.env.ORDERTIME_API_KEY && process.env.DISABLE_ORDER_HISTORY !== '1') {
    const [{ syncOtOrders, backfillOtLines }, { db }] = await Promise.all([import('./lib/sync/ot-orders'), import('./lib/db')]);
    every('orders', Number(process.env.ORDER_HISTORY_MINUTES ?? 30), 90_000, async () => {
      // Full history on first run and once a day; newest orders otherwise
      const last = await db.setting.findUnique({ where: { key: 'ot_orders_full_at' } });
      const full = !last || Date.now() - new Date(last.value).getTime() > 24 * 3600_000;
      const r = await syncOtOrders(db, full ? 'full' : 'recent');
      if (full) await db.setting.upsert({ where: { key: 'ot_orders_full_at' }, create: { key: 'ot_orders_full_at', value: new Date().toISOString() }, update: { value: new Date().toISOString() } });
      const lines = await backfillOtLines(db);
      return `${r.mode} sync: ${r.saved} Order Time sales orders${lines ? `, loaded items for ${lines}` : ''}`;
    });
  }

  if (process.env.SHIPSTATION_API_KEY && process.env.DISABLE_SHIPPING_SYNC !== '1') {
    const [{ syncShipping }, { db }] = await Promise.all([import('./lib/sync/shipping'), import('./lib/db')]);
    every('shipping', Number(process.env.SHIPPING_SYNC_MINUTES ?? 15), 60_000, async () => {
      const r = await syncShipping(db);
      return r && r.checked ? `checked ${r.checked} open orders, ${r.shipped} newly shipped` : null;
    });
  }
}
