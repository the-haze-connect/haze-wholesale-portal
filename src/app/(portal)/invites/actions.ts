'use server';

import { revalidatePath } from 'next/cache';
import { db } from '@/lib/db';
import { linkEmail, sendMail } from '@/lib/mail';
import { appUrl, createLoginToken, requireUser } from '@/lib/session';

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const INVITE_DAYS = 7;

export interface InviteResult { ok: boolean; message: string }

async function sendInvite(email: string, heading: string, intro: string) {
  const token = await createLoginToken(email, INVITE_DAYS * 24 * 60);
  const { text, html } = linkEmail({
    heading, intro, button: 'Open Haze Wholesale', url: `${appUrl()}/auth/verify?token=${token}`,
    note: `This link works once and expires in ${INVITE_DAYS} days. After that, sign in any time with your email at ${appUrl()}/login.`,
  });
  try {
    await sendMail(email, heading, text, html);
    return true;
  } catch (err) {
    console.error('[mail] invite failed:', err instanceof Error ? err.message : err);
    return false;
  }
}

/** Reps invite buyers for their own shops; admins for any shop. */
export async function inviteBuyer(_: InviteResult | null, form: FormData): Promise<InviteResult> {
  const me = await requireUser(['REP', 'ADMIN']);
  const email = String(form.get('email') ?? '').trim().toLowerCase();
  const name = String(form.get('name') ?? '').trim() || null;
  const accountId = Number(form.get('accountId'));
  const role = form.get('access') === 'VIEW_ONLY' ? 'VIEW_ONLY' : 'BUYER';
  if (!EMAIL.test(email)) return { ok: false, message: 'Enter a valid email address.' };

  const account = await db.account.findUnique({ where: { id: accountId } });
  if (!account) return { ok: false, message: 'Choose a shop.' };
  if (me.role === 'REP' && account.repId !== me.repId) return { ok: false, message: 'You can only invite buyers for your own shops.' };

  const existing = await db.buyerUser.findUnique({ where: { email } });
  if (existing && existing.accountId !== account.id) {
    return { ok: false, message: 'That email already has a login for a different account. Ask an admin to move it.' };
  }
  if (existing && (existing.role === 'ADMIN' || existing.role === 'REP')) {
    return { ok: false, message: 'That email belongs to a staff login.' };
  }

  await db.buyerUser.upsert({
    where: { email },
    create: { email, name, role, accountId: account.id, invitedBy: me.id },
    update: { name: name ?? undefined, role },
  });
  const sent = await sendInvite(email, `You're invited to order from The Haze Connect`, `${me.name ?? 'Your rep'} set up wholesale ordering for ${account.name}. Browse live inventory at your price and order cases in a few taps.`);
  await db.auditLog.create({ data: { actor: me.email, action: 'invite.buyer', detail: { email, accountId: account.id, role } } });
  revalidatePath('/invites');
  if (!sent) return { ok: false, message: `Login created for ${email}, but the email didn't send. Use Resend in a few minutes.` };
  return { ok: true, message: `Invite sent to ${email}.` };
}

/** Admin only: give a rep a login tied to their Order Time rep record. */
export async function inviteRep(_: InviteResult | null, form: FormData): Promise<InviteResult> {
  const me = await requireUser(['ADMIN']);
  const email = String(form.get('email') ?? '').trim().toLowerCase();
  const name = String(form.get('name') ?? '').trim() || null;
  const repId = Number(form.get('repId'));
  if (!EMAIL.test(email)) return { ok: false, message: 'Enter a valid email address.' };
  const rep = await db.rep.findUnique({ where: { id: repId } });
  if (!rep) return { ok: false, message: 'Choose a rep.' };
  const existing = await db.buyerUser.findUnique({ where: { email } });
  if (existing && existing.role !== 'REP') return { ok: false, message: 'That email already has a different kind of login.' };

  await db.buyerUser.upsert({ where: { email }, create: { email, name: name ?? rep.name, role: 'REP', repId: rep.id, invitedBy: me.id }, update: { repId: rep.id, name: name ?? undefined } });
  const sent = await sendInvite(email, 'Your Haze Wholesale rep login', `You can now see your accounts, place orders for your shops, and invite their buyers.`);
  await db.auditLog.create({ data: { actor: me.email, action: 'invite.rep', detail: { email, repId: rep.id } } });
  revalidatePath('/invites');
  if (!sent) return { ok: false, message: `Rep login created for ${email}, but the email didn't send. Try again in a few minutes.` };
  return { ok: true, message: `Rep login sent to ${email}.` };
}

export async function resendInvite(form: FormData) {
  const me = await requireUser(['REP', 'ADMIN']);
  const user = await db.buyerUser.findUnique({ where: { id: Number(form.get('userId')) }, include: { account: true } });
  if (!user || !user.account) return;
  if (me.role === 'REP' && user.account.repId !== me.repId) return;
  await sendInvite(user.email, `You're invited to order from The Haze Connect`, `Here's a fresh link to Haze Wholesale for ${user.account.name}.`);
  revalidatePath('/invites');
}
