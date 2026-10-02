import 'server-only';
import { levelParam } from '@/components/format';
import { db } from './db';
import type { SessionUser } from './session';

export interface ShopContext {
  /** Price level used for every price on the page; null = base price. */
  level: string | null;
  /** The account being ordered for. */
  account: { id: number; name: string; tier: string } | null;
  /** Reps: the shops they can order for. */
  repAccounts: { id: number; name: string }[];
  canOrder: boolean;
  /** Query string to carry between pages (?level= for admins, ?for= for reps). */
  carry: string;
}

type Params = Record<string, string | string[] | undefined>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

export async function shopContext(user: SessionUser, params: Params): Promise<ShopContext> {
  if (user.role === 'ADMIN') {
    // Admins can order for any active account with ?for=<account id>
    const forId = Number(one(params.for));
    if (forId) {
      const acct = await db.account.findUnique({ where: { id: forId }, include: { priceLevel: true } });
      if (acct && acct.status === 'ACTIVE') {
        const level = acct.priceLevel?.name ?? null;
        return { level, account: { id: acct.id, name: acct.name, tier: level ?? 'Base price' }, repAccounts: [], canOrder: true, carry: `?for=${acct.id}` };
      }
    }
    const level = levelParam(params.level);
    return { level, account: null, repAccounts: [], canOrder: true, carry: level ? `?level=${encodeURIComponent(level)}` : '' };
  }

  if (user.role === 'REP') {
    const repAccounts = user.repId
      ? await db.account.findMany({ where: { repId: user.repId, status: 'ACTIVE' }, select: { id: true, name: true }, orderBy: { name: 'asc' } })
      : [];
    const forId = Number(one(params.for));
    const chosen = repAccounts.find(a => a.id === forId);
    if (!chosen) return { level: null, account: null, repAccounts, canOrder: false, carry: '' };
    const acct = await db.account.findUnique({ where: { id: chosen.id }, include: { priceLevel: true } });
    const level = acct?.priceLevel?.name ?? null;
    return { level, account: { id: chosen.id, name: chosen.name, tier: level ?? 'Base price' }, repAccounts, canOrder: true, carry: `?for=${chosen.id}` };
  }

  const a = user.account;
  const level = a?.priceLevel?.name ?? null;
  return {
    level,
    account: a ? { id: a.id, name: a.name, tier: level ?? 'Base price' } : null,
    repAccounts: [],
    canOrder: user.role === 'BUYER' && a?.status === 'ACTIVE',
    carry: '',
  };
}
