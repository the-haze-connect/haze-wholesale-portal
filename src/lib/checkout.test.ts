import { describe, expect, it } from 'vitest';
import { parseChargeResponse } from './authnet';
import { priceCart, type ProductForPricing } from './checkout';
import { orderTotals } from './pricing';

const products = new Map<number, ProductForPricing>([
  [10, { dbId: 1, otItemId: 10, code: 'V-X-10', name: 'Vape 10ct', isBulk: false, basePrice: 100, available: 5, levelPrices: { 'Distro 1': 70 } }],
  [20, { dbId: 2, otItemId: 20, code: 'BULK-OG', name: 'Bulk OG', isBulk: true, basePrice: 400, available: 2, levelPrices: {} }],
  [30, { dbId: 3, otItemId: 30, code: 'NOPRICE', name: 'No price', isBulk: false, basePrice: 0, available: 9, levelPrices: {} }],
]);

describe('priceCart', () => {
  it('prices from the account tier, never the browser', () => {
    const r = priceCart([{ productId: 10, uom: 'EA', quantity: 2 }], products, 'Tier 2');
    expect(r.problems).toEqual([]);
    expect(r.lines[0]).toMatchObject({ unitPrice: 95, lineTotal: 190, productDbId: 1 });
    expect(priceCart([{ productId: 10, uom: 'EA', quantity: 1 }], products, 'Distro 1').lines[0]!.unitPrice).toBe(70);
  });

  it('prices bulk bags by size and tracks pounds', () => {
    const r = priceCart([{ productId: 20, uom: '1/4LB', quantity: 3 }, { productId: 20, uom: 'LB', quantity: 1 }], products, null);
    expect(r.problems).toEqual([]);
    expect(r.lines.map(l => [l.unitPrice, l.pounds])).toEqual([[100, 0.75], [400, 1]]);
  });

  it('merges duplicate lines and checks stock across bag sizes', () => {
    expect(priceCart([{ productId: 10, uom: 'EA', quantity: 3 }, { productId: 10, uom: 'EA', quantity: 3 }], products, null).problems[0]).toMatch(/Only 5 of Vape 10ct/);
    expect(priceCart([{ productId: 20, uom: 'LB', quantity: 2 }, { productId: 20, uom: '1/4LB', quantity: 1 }], products, null).problems[0]).toMatch(/Only 2 lb/);
  });

  it('rejects unknown items, missing prices, bad units and bad quantities', () => {
    expect(priceCart([{ productId: 99, uom: 'EA', quantity: 1 }], products, null).problems[0]).toMatch(/no longer available/);
    expect(priceCart([{ productId: 30, uom: 'EA', quantity: 1 }], products, null).problems[0]).toMatch(/no price/);
    expect(priceCart([{ productId: 20, uom: 'EA', quantity: 1 }], products, null).problems[0]).toMatch(/bag size/);
    expect(priceCart([{ productId: 10, uom: 'EA', quantity: 1.5 }], products, null).problems[0]).toMatch(/quantity/);
  });

  it('adds the 3% card fee only for card payments', () => {
    const lines = priceCart([{ productId: 10, uom: 'EA', quantity: 3 }], products, null).lines;
    expect(orderTotals(lines, 'CARD', 3)).toEqual({ subtotal: 300, cardFee: 9, total: 309 });
    expect(orderTotals(lines, 'ACH_WIRE', 3)).toEqual({ subtotal: 300, cardFee: 0, total: 300 });
  });
});

describe('parseChargeResponse', () => {
  it('approves, holds for review, and declines', () => {
    expect(parseChargeResponse({ transactionResponse: { responseCode: '1', transId: '6000', accountNumber: 'XXXX1111' } }))
      .toEqual({ ok: true, transId: '6000', last4: '1111', heldForReview: false });
    expect(parseChargeResponse({ transactionResponse: { responseCode: '4', transId: '6001', accountNumber: 'XXXX0002' } }))
      .toMatchObject({ ok: true, heldForReview: true });
    const declined = parseChargeResponse({ transactionResponse: { responseCode: '2', transId: '0', errors: [{ errorCode: '2', errorText: 'This transaction has been declined.' }] } });
    expect(declined).toEqual({ ok: false, message: 'Card declined: This transaction has been declined.' });
    expect(parseChargeResponse({ messages: { resultCode: 'Error', message: [{ code: 'E00007', text: 'User authentication failed.' }] } }))
      .toEqual({ ok: false, message: 'Card not charged: User authentication failed.' });
  });
});
