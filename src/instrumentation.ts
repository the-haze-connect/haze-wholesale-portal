/**
 * Runs once when the server starts. Keeps the catalog, HQ stock, prices, reps and
 * customers in step with Order Time: one sync at startup, then every 5 minutes.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;
  if (!process.env.DATABASE_URL || !process.env.ORDERTIME_API_KEY) return;
  if (process.env.DISABLE_ORDERTIME_SYNC === '1') return;

  const minutes = Number(process.env.ORDERTIME_SYNC_MINUTES ?? 5);
  const { runSync } = await import('./lib/sync/run');
  let running = false;

  const tick = async () => {
    if (running) return;
    running = true;
    const started = Date.now();
    try {
      const r = await runSync();
      console.log(`[sync] ${r.products} products (${r.inStock} in stock), ${r.accounts} accounts${r.photos ? `, ${r.photos.matched}/${r.photos.total} with store photos` : ''} in ${Math.round((Date.now() - started) / 1000)}s`);
    } catch (err) {
      console.error('[sync] failed:', err instanceof Error ? err.message : err);
    } finally {
      running = false;
    }
  };

  setTimeout(tick, 5_000);
  setInterval(tick, minutes * 60_000);
}
