import type { PrismaClient } from '@prisma/client';
import { PRICE_LEVELS } from '../rules';
import type { Snapshot } from './snapshot';

/**
 * Write a snapshot into Postgres. Order Time-owned fields are overwritten;
 * portal-owned fields (visibility, account status, blocked states) are left alone.
 */
export async function applySnapshot(db: PrismaClient, snap: Snapshot) {
  const syncedAt = new Date(snap.builtAt);

  // Price levels the portal honors
  const levelIds = new Map<string, number>();
  for (const l of snap.priceLevels.filter(l => l.honored)) {
    const rule = PRICE_LEVELS[l.name];
    const row = await db.priceLevel.upsert({
      where: { otId: l.otId },
      create: { otId: l.otId, name: l.name, kind: rule.kind, percentOff: rule.percentOff ?? null, tierGroup: rule.tierGroup },
      update: { name: l.name, kind: rule.kind, percentOff: rule.percentOff ?? null, tierGroup: rule.tierGroup, active: true },
    });
    levelIds.set(l.name, row.id);
  }

  // Reps
  const repIds = new Map<string, number>();
  for (const r of snap.reps) {
    const row = await db.rep.upsert({
      where: { otId: r.otId },
      create: { otId: r.otId, name: r.name, active: r.active, commissioned: r.commissioned },
      update: { name: r.name, active: r.active, commissioned: r.commissioned },
    });
    repIds.set(r.name, row.id);
  }

  // Products, stock and per-level prices
  const seen: number[] = [];
  for (const p of snap.products) {
    const data = {
      code: p.code, sku: p.sku, name: p.name, category: p.category, brand: p.brand, isBulk: p.isBulk,
      basePrice: p.basePrice, msrp: p.msrp, available: p.available, reorderPoint: p.reorderPoint,
      active: true, wholesale: p.wholesale !== false, stockSyncedAt: syncedAt,
    };
    const row = await db.product.upsert({ where: { otItemId: p.otItemId }, create: { otItemId: p.otItemId, ...data }, update: data });
    seen.push(p.otItemId);
    await db.levelPrice.deleteMany({ where: { productId: row.id } });
    const prices = Object.entries(p.levelPrices).filter(([name]) => levelIds.has(name));
    if (prices.length) {
      await db.levelPrice.createMany({ data: prices.map(([name, price]) => ({ productId: row.id, priceLevelId: levelIds.get(name)!, price })) });
    }
  }
  await db.product.updateMany({ where: { otItemId: { notIn: seen } }, data: { active: false } });

  // Accounts: Order Time fields only; status and logins are managed in the portal
  for (const a of snap.accounts) {
    const data = {
      name: a.name, customerType: a.customerType, terms: a.terms, shipState: a.shipState, licenseNumber: a.licenseNumber,
      priceLevelId: a.priceLevelHonored && a.priceLevel ? levelIds.get(a.priceLevel) ?? null : null,
      repId: a.rep ? repIds.get(a.rep) ?? null : null,
    };
    await db.account.upsert({
      where: { otCustomerId: a.otCustomerId },
      create: { otCustomerId: a.otCustomerId, status: 'ACTIVE', ...data },
      update: data,
    });
  }

  await db.auditLog.create({ data: { actor: 'sync', action: 'ordertime.sync', detail: { products: snap.products.length, accounts: snap.accounts.length } } });
}
