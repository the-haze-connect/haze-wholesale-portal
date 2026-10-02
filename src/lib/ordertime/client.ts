/**
 * Minimal Order Time REST client.
 * Docs: https://help.ordertime.com/help/order-time-rest-api
 *
 * Auth is three headers on every request (apiKey, email, password).
 * List queries are POST /api/list with { Type, PageNumber, NumberOfRecords }
 * and return at most 1,000 records per page.
 */

export const RecordType = {
  SalesOrder: 7,
  ShipDoc: 4,
  PartItem: 101,
  AssemblyItem: 107,
  ItemAll: 115,
  Customer: 120,
  Location: 150,
  Uom: 160,
  UomSet: 162,
  ItemGroup: 180,
  Term: 190,
  ShipMethod: 250,
  PriceLevel: 280,
  PriceLevelItemPrice: 282,
  CustomerType: 300,
  SalesRep: 370,
  Payment: 660,
  InventoryByLocation: 1112,
} as const;

export type Ref = { Id: number; Name: string } | null;

export interface OtConfig {
  apiKey: string;
  email: string;
  password: string;
  baseUrl?: string;
}

const PAGE_SIZE = 1000;

export class OrderTimeError extends Error {
  constructor(public status: number, public body: string, public path: string) {
    super(`Order Time ${status} on ${path}: ${body.slice(0, 200)}`);
  }
}

export function configFromEnv(env = process.env): OtConfig {
  const apiKey = env.ORDERTIME_API_KEY;
  const email = env.ORDERTIME_EMAIL;
  const password = env.ORDERTIME_PASSWORD;
  if (!apiKey || !email || !password) {
    throw new Error('Set ORDERTIME_API_KEY, ORDERTIME_EMAIL and ORDERTIME_PASSWORD');
  }
  return { apiKey, email, password };
}

export class OrderTime {
  private base: string;
  constructor(private cfg: OtConfig) {
    this.base = cfg.baseUrl ?? 'https://services.ordertime.com/api';
  }

  private async request<T>(method: 'GET' | 'POST', path: string, body?: unknown): Promise<T> {
    const res = await fetch(`${this.base}/${path}`, {
      method,
      headers: {
        apiKey: this.cfg.apiKey,
        email: this.cfg.email,
        password: this.cfg.password,
        'Content-Type': 'application/json',
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      cache: 'no-store',
    });
    const text = await res.text();
    if (!res.ok) throw new OrderTimeError(res.status, text, path);
    return JSON.parse(text) as T;
  }

  /** One page of a list query. Read-only, even though it is a POST. */
  listPage<T>(type: number, page = 1, size = PAGE_SIZE, extra: Record<string, unknown> = {}): Promise<T[]> {
    return this.request<T[]>('POST', 'list', { Type: type, PageNumber: page, NumberOfRecords: size, ...extra });
  }

  /** Every record of a type, paging 1,000 at a time. */
  async listAll<T>(type: number, extra: Record<string, unknown> = {}, maxPages = 50): Promise<T[]> {
    const all: T[] = [];
    for (let page = 1; page <= maxPages; page++) {
      const rows = await this.listPage<T>(type, page, PAGE_SIZE, extra);
      all.push(...rows);
      if (rows.length < PAGE_SIZE) break;
    }
    return all;
  }

  /**
   * Create a sales order. Not called anywhere yet: order posting is wired up
   * in the checkout phase, after the portal user is given create rights.
   */
  createSalesOrder(order: OtSalesOrderInput): Promise<{ DocNo: number }> {
    return this.request('POST', 'salesorder', order);
  }
}

export interface OtSalesOrderInput {
  CustomerRef: { Id: number };
  SalesRepRef?: { Id: number } | null;
  LocationRef?: { Name: string };
  CustomerPO?: string;
  Memo?: string;
  ShippingInstructions?: string;
  LineItems: Array<{
    ItemRef: { Id: number };
    Quantity: number;
    Price: number;
    UomRef?: { Name: string };
    Description?: string;
  }>;
}
