import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { PhotoIndex, parseCode, sized } from './photos';

const load = (f: string) => JSON.parse(readFileSync(path.join(__dirname, '../../test/fixtures', f), 'utf8')).products;
const index = new PhotoIndex().addHazeStore(load('haze-store.json')).addTotallyBakedStore(load('tb-store.json'));

describe('parseCode', () => {
  it('splits family, counts and strain', () => {
    expect(parseCode('V-1-10-Gelato (H)')).toEqual({ family: ['V'], name: 'gelato (h)', bare: 'gelato' });
    expect(parseCode('F-V-AAA-SMALLS-28-Top Gun (I)').family).toEqual(['F', 'V', 'AAA', 'SMALLS']);
    expect(parseCode('B-F-A-Kush Mintz (H)')).toMatchObject({ family: ['B', 'F', 'A'], bare: 'kush mintz' });
    expect(parseCode('PR-HH-20')).toEqual({ family: ['PR', 'HH'], name: '', bare: '' });
  });
});

describe('PhotoIndex', () => {
  it('matches case SKUs to the single-unit store SKU', () => {
    expect(index.match('V-1-10-Gelato (H)')?.source).toBe('sku');
    expect(index.match('G-10-100-Space Cake')?.source).toBe('sku');
    expect(index.match('PR-HH-20')?.source).toBe('sku');
    expect(index.match('G-DD-10-Elderberry')).not.toBeNull();
  });
  it('gives bulk flower the flower strain photo', () => {
    expect(index.match('B-F-AAA-Blue Lobster (I)')).not.toBeNull();
  });
  it('does not borrow a pre-roll photo for flower', () => {
    const flower = index.match('F-AAA-3.5-Melon Haze (S)');
    const preroll = index.match('PR-S-20-Melon Haze');
    expect(flower === null || flower.url !== preroll?.url).toBe(true);
  });
  it('matches Totally Baked items by product line', () => {
    const hh = index.match('TB-P-PR-HH-30-Gumbo (I)');
    expect(hh?.source).toBe('line');
    expect(index.match('TB-SC-3.5-10-Papaya (I)')?.source).toBe('line');
    expect(index.match('TB-PR-DI-30-Papaya (I)')?.url).not.toBe(index.match('TB-PR-HH-30-Gumbo (I)')?.url);
    expect(index.match('TB-CBD-PR-30-Papaya (I)')).toBeNull();
  });
  it('requests a resized image from the Shopify CDN', () => {
    expect(sized('https://cdn.shopify.com/s/files/x.jpg?v=1')).toBe('https://cdn.shopify.com/s/files/x.jpg?v=1&width=640');
  });
});
