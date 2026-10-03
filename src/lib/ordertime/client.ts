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
  CustomerAddress: 121,
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

  private async request<T>(method: 'GET' | 'POST' | 'PUT', path: string, body?: unknown): Promise<T> {
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
    return (text ? JSON.parse(text) : {}) as T;
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

  /** Create a sales order. Docs: https://help.ordertime.com/help/sales-order */
  createSalesOrder(order: OtSalesOrderInput): Promise<{ DocNo: number; Id?: number }> {
    return this.request('POST', 'salesorder', order);
  }

  /** Create a lead. Docs: https://help.ordertime.com/help/lead */
  createLead(l: OtLeadInput): Promise<{ Id: number; Name: string }> {
    return this.request('POST', 'lead', l);
  }

  /** Convert a lead to a customer; returns the new customer record. */
  convertLeadToCustomer(leadId: number): Promise<{ Id: number; Name: string } & Record<string, unknown>> {
    return this.request('PUT', `lead/ConvertToCustomer?id=${leadId}`);
  }

  getCustomer(id: number): Promise<{ Id: number; Name: string } & Record<string, unknown>> {
    return this.request('GET', `customer?id=${id}`);
  }

  /** Order Time updates take the whole record: read it, change fields, send it back. */
  updateCustomer(c: Record<string, unknown>): Promise<{ Id: number }> {
    return this.request('PUT', 'customer', c);
  }

  /**
   * A customer's ship-to address to use on a sales order: the active primary one,
   * else the first active one. Null if the customer has none.
   */
  async customerShipTo(customerId: number): Promise<{ Id: number; Name: string } | null> {
    const filters = [{ PropertyName: 'CustomerRef.Id', Operator: 1, FilterValueArray: String(customerId) }];
    let rows: OtCustomerAddress[];
    try {
      rows = await this.listPage<OtCustomerAddress>(RecordType.CustomerAddress, 1, 200, { Filters: filters });
    } catch {
      rows = await this.listAll<OtCustomerAddress>(RecordType.CustomerAddress);
    }
    const mine = rows.filter(r => r.CustomerRef?.Id === customerId && r.IsActive !== false);
    const pick = mine.find(r => r.IsPrimary) ?? mine[0];
    return pick ? { Id: pick.Id, Name: pick.Name } : null;
  }
}

export interface OtCustomerAddress {
  Id: number;
  Name: string;
  CustomerRef: { Id: number; Name?: string } | null;
  IsPrimary?: boolean;
  IsActive?: boolean;
}

export interface OtSalesOrderInput {
  CustomerRef: { Id: number };
  ShipToRef: { Id: number; Name: string };
  Date: string;        // "2026-10-03T00:00:00"
  PromiseDate: string;
  SalesRepRef?: { Id: number } | null;
  CustomerPO?: string; // max 25 characters
  Memo?: string;       // max 4000 characters
  LineItems: Array<{
    $type: 'AOLib7.SalesOrderLineItem, AOLib7';
    ItemRef: { Id: number };
    Quantity: number;
    Price: number;
    UomRef?: { Name: string };
    Description?: string;
  }>;
}

export interface OtAddressInput {
  Name?: string;
  Addr1: string;
  Addr2?: string;
  City: string;
  State: string;
  Zip: string;
  Email?: string;
  Phone?: string;
}

export interface OtLeadInput {
  Name: string;          // 50 characters max
  CompanyName?: string;
  BillAddress?: OtAddressInput;
  PrimaryShipAddress?: OtAddressInput;
  SalesRepRef?: { Id: number } | null;
  Note?: string;
}
