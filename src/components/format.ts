export const money = (n: number) => n.toLocaleString('en-US', { style: 'currency', currency: 'USD' });

export const TILE: Record<string, string> = {
  Flower: '#204B57', 'Pre-Rolls': '#2C5A3E', Vapes: '#34405E', Concentrates: '#5C4522', Edibles: '#4E2F48', 'Bulk Flower': '#3B4A2A',
};

export const STOCK_LABEL = { in: 'In stock', low: 'Low stock', out: 'Out of stock' } as const;

/** Price levels selectable in the preview strip until sign-in assigns a real one. */
export const PREVIEW_LEVELS = ['Base', 'Tier 2', 'Tier 3', 'Distro 1', 'Distro 2', 'Master Distro', 'Master Distro TB'];

export function levelParam(v: string | string[] | undefined): string | null {
  const s = Array.isArray(v) ? v[0] : v;
  return s && PREVIEW_LEVELS.includes(s) && s !== 'Base' ? s : null;
}
