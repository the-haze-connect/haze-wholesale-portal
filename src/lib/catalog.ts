import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { BULK_SIZES } from './rules';
import { unitPrice } from './pricing';
import type { Snapshot } from './sync/snapshot';

export type StockState = 'in' | 'low' | 'out';

export interface CatalogOption {
  uom: string;
  label: string;
  quantityPerUnit: number; // lbs for bulk, 1 for everything else
  price: number;
  maxQty: number;
}

export interface CatalogItem {
  id: number;
  code: string;
  sku: string | null;
  name: string;
  category: string;
  brand: 'HAZE' | 'TOTALLY_BAKED';
  isBulk: boolean;
  msrp: number | null;
  stock: StockState;
  available: number;
  priceSource: string;
  options: CatalogOption[];
}

interface ProductRecord {
  otItemId: number;
  code: string;
  sku: string | null;
  name: string;
  category: string;
  brand: 'HAZE' | 'TOTALLY_BAKED';
  isBulk: boolean;
  basePrice: number;
  msrp: number | null;
  available: number;
  reorderPoint: number | null;
  levelPrices: Record<string, number>;
}

function stockState(p: ProductRecord): StockState {
  if (p.isBulk) {
    if (p.available < 0.25) return 'out';
    return p.available < 1 ? 'low' : 'in';
  }
  if (p.available < 1) return 'out';
  const low = p.reorderPoint && p.reorderPoint > 0 ? p.reorderPoint : 5;
  return p.available <= low ? 'low' : 'in';
}

export function toCatalogItem(p: ProductRecord, levelName: string | null): CatalogItem {
  const { price, source } = unitPrice({ basePrice: p.basePrice, levelPrices: p.levelPrices }, levelName);
  const options: CatalogOption[] = p.isBulk
    ? BULK_SIZES.map(s => ({ uom: s.uom, label: s.label, quantityPerUnit: s.lbs, price: Math.round(price * s.lbs * 100) / 100, maxQty: Math.floor(p.available / s.lbs + 1e-9) }))
    : [{ uom: 'EA', label: 'each', quantityPerUnit: 1, price, maxQty: Math.floor(p.available) }];
  return {
    id: p.otItemId, code: p.code, sku: p.sku, name: p.name, category: p.category, brand: p.brand, isBulk: p.isBulk,
    msrp: p.msrp, stock: stockState(p), available: p.available, priceSource: source, options,
  };
}

const ORDER = ['Flower', 'Pre-Rolls', 'Vapes', 'Concentrates', 'Edibles', 'Bulk Flower'];

async function loadProducts(): Promise<ProductRecord[]> {
  if (process.env.DATABASE_URL) {
    const { db } = await import('./db');
    const rows = await db.product.findMany({ where: { active: true, visible: true }, include: { prices: { include: { priceLevel: true } } } });
    return rows.map(r => ({
      otItemId: r.otItemId, code: r.code, sku: r.sku, name: r.name, category: r.category, brand: r.brand, isBulk: r.isBulk,
      basePrice: Number(r.basePrice), msrp: r.msrp === null ? null : Number(r.msrp), available: Number(r.available),
      reorderPoint: r.reorderPoint === null ? null : Number(r.reorderPoint),
      levelPrices: Object.fromEntries(r.prices.map(p => [p.priceLevel.name, Number(p.price)])),
    }));
  }
  // Local development without a database: use the snapshot written by `npm run sync:dry`
  const file = path.join(process.cwd(), 'data', 'snapshot.json');
  if (!existsSync(file)) return [];
  return (JSON.parse(readFileSync(file, 'utf8')) as Snapshot).products;
}

export async function getCatalog(levelName: string | null): Promise<CatalogItem[]> {
  const products = await loadProducts();
  return products
    .map(p => toCatalogItem(p, levelName))
    .sort((a, b) =>
      (a.stock === 'out' ? 1 : 0) - (b.stock === 'out' ? 1 : 0) ||
      ORDER.indexOf(a.category) - ORDER.indexOf(b.category) ||
      a.name.localeCompare(b.name));
}
