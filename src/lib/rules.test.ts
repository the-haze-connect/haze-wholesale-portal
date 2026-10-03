import { describe, expect, it } from 'vitest';
import { calculateCommission } from './commission';
import { orderTotals, unitPrice } from './pricing';
import { isWholesaleItem, normalizeState } from './rules';

describe('pricing', () => {
  const item = { basePrice: 40, levelPrices: { 'Distro 1': 30, 'Master Distro': 26 } };

  it('Tier 2 is 5% off base, Tier 3 is 10% off', () => {
    expect(unitPrice(item, 'Tier 2')).toEqual({ price: 38, source: 'percent' });
    expect(unitPrice(item, 'Tier 3')).toEqual({ price: 36, source: 'percent' });
  });
  it('Distro levels use their per-item price', () => {
    expect(unitPrice(item, 'Distro 1')).toEqual({ price: 30, source: 'level' });
    expect(unitPrice(item, 'Master Distro')).toEqual({ price: 26, source: 'level' });
  });
  it('falls back to base when a Distro level has no price for the item', () => {
    expect(unitPrice(item, 'Distro 2')).toEqual({ price: 40, source: 'base-fallback' });
  });
  it('no level or an outdated level pays base price', () => {
    expect(unitPrice(item, null).price).toBe(40);
    expect(unitPrice(item, 'Tier 5').price).toBe(40);
    expect(unitPrice(item, 'Distro 1 OLD').price).toBe(40);
  });
  it('adds a 3% fee to card orders only', () => {
    const lines = [{ unitPrice: 100, quantity: 10 }];
    expect(orderTotals(lines, 'CARD', 3)).toEqual({ subtotal: 1000, cardFee: 30, total: 1030 });
    expect(orderTotals(lines, 'ACH_WIRE', 3)).toEqual({ subtotal: 1000, cardFee: 0, total: 1000 });
  });
});

describe('commission (examples confirmed Oct 2, 2026)', () => {
  it('Tier 2 shop, $2,000 of pre-rolls and gummies = $200', () => {
    const r = calculateCommission({ repName: 'Brian Warden', priceLevelName: 'Tier 2', lines: [{ amount: 2000, isBulk: false }] });
    expect(r.total).toBe(200);
  });
  it('Distro 1, $5,000 product + 12 lbs bulk = $400 + $600 = $1,000', () => {
    const r = calculateCommission({
      repName: 'Clay & Max Sales',
      priceLevelName: 'Distro 1',
      lines: [{ amount: 5000, isBulk: false }, { amount: 16800, isBulk: true, pounds: 12 }],
    });
    expect(r.parts.map(p => p.amount)).toEqual([400, 600]);
    expect(r.total).toBe(1000);
  });
  it('Tier 3 shop, three 1/4 lb bags = 0.75 lb x $75 = $56.25', () => {
    const r = calculateCommission({ repName: 'Vinny Sales', priceLevelName: 'Tier 3', lines: [{ amount: 1050, isBulk: true, pounds: 0.75 }] });
    expect(r.total).toBe(56.25);
  });
  it('exactly 10 lbs switches every pound to $50', () => {
    const r = calculateCommission({ repName: 'Vinny Sales', priceLevelName: null, lines: [{ amount: 1, isBulk: true, pounds: 10 }] });
    expect(r.total).toBe(500);
  });
  it('9.75 lbs stays at $75/lb', () => {
    const r = calculateCommission({ repName: 'Vinny Sales', priceLevelName: null, lines: [{ amount: 1, isBulk: true, pounds: 9.75 }] });
    expect(r.total).toBe(731.25);
  });
  it('Master Distro TB pays the 8% Distro rate', () => {
    const r = calculateCommission({ repName: 'Brian Warden', priceLevelName: 'Master Distro TB', lines: [{ amount: 1000, isBulk: false }] });
    expect(r.total).toBe(80);
  });
  it('base-price accounts (no or outdated tier) pay 10%', () => {
    const r = calculateCommission({ repName: 'Brian Warden', priceLevelName: 'Distro 1 OLD', lines: [{ amount: 1000, isBulk: false }] });
    expect(r.total).toBe(100);
  });
  it('house reps earn nothing', () => {
    for (const rep of ['Alex Hastings', 'Michael Macleod', 'D2C Sales', 'Unclaimed Leads', 'Scott J Pereira', null]) {
      expect(calculateCommission({ repName: rep, priceLevelName: 'Tier 2', lines: [{ amount: 5000, isBulk: false }] })).toEqual({ house: true, total: 0, parts: [] });
    }
  });
});

describe('case quantities only', () => {
  it('keeps case/display SKUs and drops singles and samples', () => {
    expect(isWholesaleItem('V-1-10-Gelato (H)', '1g Live Resin Vape-10ct', 'Vapes', 'HAZE')).toBe(true);
    expect(isWholesaleItem('V-1-1-Gelato (H)', '1g Live Resin Vape', 'Vapes', 'HAZE')).toBe(false);
    expect(isWholesaleItem('PR-M-5-Watermelon Wonder (S)', 'PreRoll-Mini-5pk', 'Pre-Rolls', 'HAZE')).toBe(true);
    expect(isWholesaleItem('PR-S-20', 'PreRoll-SATIVA-20ct box', 'Pre-Rolls', 'HAZE')).toBe(true);
    expect(isWholesaleItem('PR-M-1-Watermelon Wonder (S)', 'PreRoll-Mini', 'Pre-Rolls', 'HAZE')).toBe(false);
    expect(isWholesaleItem('PR-IM-1-Sugar Tarts + Runtz', 'Infused mini', 'Pre-Rolls', 'HAZE')).toBe(false);
    expect(isWholesaleItem('G-20-50-Passion Fruit', 'Display Jar', 'Edibles', 'HAZE')).toBe(true);
    expect(isWholesaleItem('G-20-2-Strawberry Lemonade', '2ct', 'Edibles', 'HAZE')).toBe(false);
    expect(isWholesaleItem('G-10-100-Space Cake', 'Display Box', 'Edibles', 'HAZE')).toBe(true);
    expect(isWholesaleItem('G-10-40-Blue Razz', 'Display', 'Edibles', 'HAZE')).toBe(true);
    expect(isWholesaleItem('G-20-40-Mango', 'Display', 'Edibles', 'HAZE')).toBe(true);
    expect(isWholesaleItem('G-DD-2-Elderberry', 'Gummies', 'Edibles', 'HAZE')).toBe(false);
    expect(isWholesaleItem('G-DD-10-Lemon Lavender', 'Gummies', 'Edibles', 'HAZE')).toBe(false);
    expect(isWholesaleItem('G-DD-100-Elderberry', 'Display', 'Edibles', 'HAZE')).toBe(true);
    expect(isWholesaleItem('F-AAA-3.5-Runtz (H)', 'Flower-Exotic-3.5g', 'Flower', 'HAZE')).toBe(true);
    expect(isWholesaleItem('S-C-B-Lemon Cherry Gelato (I)', 'SAMPLE-Concentrate', 'Concentrates', 'HAZE')).toBe(false);
    expect(isWholesaleItem('C-R-1-***', 'Concentrate-Live Rosin-1g***', 'Concentrates', 'HAZE')).toBe(false);
    expect(isWholesaleItem('TB-PR-30-Papaya (I)', 'TB-PreRoll-30ct', 'Pre-Rolls', 'TOTALLY_BAKED')).toBe(true);
  });
});

describe('state cleanup', () => {
  it('normalizes the variants found in Order Time', () => {
    expect(normalizeState('Texas')).toBe('TX');
    expect(normalizeState('Tx')).toBe('TX');
    expect(normalizeState(' tx ')).toBe('TX');
    expect(normalizeState('New Jersey')).toBe('NJ');
    expect(normalizeState('')).toBeNull();
    expect(normalizeState('Ontario')).toBeNull();
  });
});

import { customerProfile } from './sync/profile';
describe('customerProfile', () => {
  it('pulls contact, phone, addresses and custom fields, and never card data', () => {
    const p = customerProfile({
      Name: 'Shop', PrimaryContact: { FirstName: 'Dana', LastName: 'Ray', Phone: '512-555-0101', Email: 'dana@shop.com' },
      PrimaryShipAddress: { Addr1: 'Shop LLC', Addr2: '1 Main St', City: 'Austin', State: 'TX', Zip: '78701' },
      BillAddress: { Addr1: 'PO Box 9', City: 'Austin', State: 'TX', Zip: '78702', Email: 'ap@shop.com' },
      TermRef: { Id: 1, Name: 'Net 15' }, TypeRef: { Id: 2, Name: 'Smoke Shop' }, CreditLimit: 5000, OnCreditHold: false,
      CreditCardNo: '4111111111111111', ShippingInstructions: 'Back door',
      CustomFields: [{ Caption: 'Hemp License #', Value: 'HL-1' }, { Caption: 'Credit Card Token', Value: 'x' }, { Caption: 'Empty', Value: '' }],
    });
    expect(p).toMatchObject({ contact: 'Dana Ray', phone: '512-555-0101', email: 'dana@shop.com', terms: 'Net 15', customerType: 'Smoke Shop', creditLimit: 5000, shippingInstructions: 'Back door' });
    expect(p.shipTo?.lines).toEqual(['Shop LLC', '1 Main St', 'Austin, TX 78701']);
    expect(p.billTo?.email).toBe('ap@shop.com');
    expect(p.customFields).toEqual([{ label: 'Hemp License #', value: 'HL-1' }]);
    expect(JSON.stringify(p)).not.toContain('4111');
  });
});
