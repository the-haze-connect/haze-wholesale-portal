import 'server-only';
import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { db } from './db';

const COOKIE = 'hw_session';
const SESSION_DAYS = 30;

function secret() {
  const s = process.env.SESSION_SECRET;
  if (!s || s.length < 32) throw new Error('SESSION_SECRET must be set to at least 32 random characters');
  return s;
}

const sign = (payload: string) => createHmac('sha256', secret()).update(payload).digest('base64url');

export function encodeSession(userId: number, now = Date.now()) {
  const payload = Buffer.from(JSON.stringify({ uid: userId, exp: now + SESSION_DAYS * 864e5 })).toString('base64url');
  return `${payload}.${sign(payload)}`;
}

export function decodeSession(value: string | undefined, now = Date.now()): number | null {
  if (!value) return null;
  const [payload, sig] = value.split('.');
  if (!payload || !sig) return null;
  const expected = Buffer.from(sign(payload));
  const given = Buffer.from(sig);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;
  try {
    const { uid, exp } = JSON.parse(Buffer.from(payload, 'base64url').toString());
    return typeof uid === 'number' && exp > now ? uid : null;
  } catch { return null; }
}

export async function startSession(userId: number) {
  (await cookies()).set(COOKIE, encodeSession(userId), {
    httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', path: '/', maxAge: SESSION_DAYS * 86400,
  });
}

export async function endSession() {
  (await cookies()).delete(COOKIE);
}

export async function currentUser() {
  const uid = decodeSession((await cookies()).get(COOKIE)?.value);
  if (!uid) return null;
  return db.buyerUser.findUnique({
    where: { id: uid },
    include: { account: { include: { priceLevel: true, rep: true } } },
  });
}

export type SessionUser = NonNullable<Awaited<ReturnType<typeof currentUser>>>;

/** For pages inside the portal: signed-in users only. */
export async function requireUser(roles?: SessionUser['role'][]) {
  const user = await currentUser();
  if (!user) redirect('/login');
  if (roles && !roles.includes(user.role)) redirect('/');
  return user;
}

/* ---------- One-time sign-in links ---------- */

const LINK_MINUTES = 15;
export const hashToken = (t: string) => createHash('sha256').update(t).digest('hex');

export async function createLoginToken(email: string, minutes = LINK_MINUTES) {
  const token = randomBytes(32).toString('base64url');
  await db.magicLink.create({ data: { email: email.toLowerCase(), tokenHash: hashToken(token), expiresAt: new Date(Date.now() + minutes * 60_000) } });
  return token;
}

/** Marks the link used and returns the email it was for, or null if invalid, used or expired. */
export async function consumeLoginToken(token: string) {
  const row = await db.magicLink.findUnique({ where: { tokenHash: hashToken(token) } });
  if (!row || row.usedAt || row.expiresAt < new Date()) return null;
  const { count } = await db.magicLink.updateMany({ where: { id: row.id, usedAt: null }, data: { usedAt: new Date() } });
  return count === 1 ? row.email : null;
}

export function adminEmails(): string[] {
  return (process.env.ADMIN_EMAILS ?? '').split(',').map(e => e.trim().toLowerCase()).filter(Boolean);
}

export function appUrl() {
  return (process.env.APP_URL ?? 'http://localhost:3000').replace(/\/$/, '');
}
