/**
 * ShipStation (API v1) shipment lookups. Read-only.
 * Docs: https://www.shipstation.com/docs/api/shipments/list/
 * Auth: Basic with the API key and secret from ShipStation > Settings > Account > API Settings.
 * Rate limit: 40 requests a minute, so callers keep batches small.
 */

export interface SsShipment {
  orderNumber: string;
  trackingNumber: string | null;
  carrierCode: string | null;
  serviceCode: string | null;
  shipDate: string | null;
  voided: boolean;
}

export interface Tracking {
  carrier: string;
  service: string | null;
  number: string;
  url: string | null;
  shipDate: string | null;
}

export function shipstationConfigured() {
  return !!(process.env.SHIPSTATION_API_KEY && process.env.SHIPSTATION_API_SECRET);
}

export async function shipmentsForOrderNumber(orderNumber: string): Promise<SsShipment[]> {
  const auth = Buffer.from(`${process.env.SHIPSTATION_API_KEY}:${process.env.SHIPSTATION_API_SECRET}`).toString('base64');
  const url = `https://ssapi.shipstation.com/shipments?orderNumber=${encodeURIComponent(orderNumber)}&pageSize=50`;
  const res = await fetch(url, { headers: { authorization: `Basic ${auth}` }, signal: AbortSignal.timeout(20_000), cache: 'no-store' });
  if (res.status === 429) throw new Error('ShipStation rate limit reached');
  if (!res.ok) throw new Error(`ShipStation ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const body = await res.json() as { shipments?: SsShipment[] };
  return body.shipments ?? [];
}

/**
 * ShipStation's order number for an Order Time sales order is the sales order number,
 * sometimes with a prefix (e.g. "SO-1234"). The orderNumber filter can also return
 * near matches, so keep only shipments whose number ends in exactly this SO number.
 */
export function shipmentsForSalesOrder(all: SsShipment[], soNumber: number): SsShipment[] {
  const re = new RegExp(`(^|\\D)${soNumber}$`);
  return all.filter(s => !s.voided && s.trackingNumber && re.test(String(s.orderNumber).trim()));
}

const CARRIER: Record<string, string> = {
  ups: 'UPS', ups_walleted: 'UPS', fedex: 'FedEx', fedex_walleted: 'FedEx', stamps_com: 'USPS', usps: 'USPS', endicia: 'USPS',
  dhl_express: 'DHL Express', dhl_express_worldwide: 'DHL Express', ontrac: 'OnTrac', globegistics: 'Globegistics',
};

export function toTracking(s: SsShipment): Tracking {
  const code = (s.carrierCode ?? '').toLowerCase();
  const n = encodeURIComponent(s.trackingNumber ?? '');
  const carrier = CARRIER[code] ?? (code ? code.replace(/_/g, ' ').toUpperCase() : 'Carrier');
  const url =
    carrier === 'UPS' ? `https://www.ups.com/track?tracknum=${n}` :
    carrier === 'FedEx' ? `https://www.fedex.com/fedextrack/?trknbr=${n}` :
    carrier === 'USPS' ? `https://tools.usps.com/go/TrackConfirmAction?tLabels=${n}` :
    carrier === 'DHL Express' ? `https://www.dhl.com/us-en/home/tracking/tracking-express.html?tracking-id=${n}` :
    carrier === 'OnTrac' ? `https://www.ontrac.com/tracking/?number=${n}` : null;
  return { carrier, service: s.serviceCode?.replace(/_/g, ' ') ?? null, number: s.trackingNumber ?? '', url, shipDate: s.shipDate };
}
