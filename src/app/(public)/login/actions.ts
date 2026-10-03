'use server';

import { redirect } from 'next/navigation';
import { db } from '@/lib/db';
import { linkEmail, sendMail } from '@/lib/mail';
import { adminEmails, appUrl, createLoginToken } from '@/lib/session';

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function requestLoginLink(form: FormData) {
  const email = String(form.get('email') ?? '').trim().toLowerCase();
  if (!EMAIL.test(email)) redirect('/login?error=email');

  const recent = await db.magicLink.count({ where: { email, createdAt: { gt: new Date(Date.now() - 15 * 60_000) } } });
  if (recent >= 5) redirect('/login?error=busy');

  let user = await db.buyerUser.findUnique({ where: { email } });
  if (adminEmails().includes(email)) {
    // Everyone in ADMIN_EMAILS signs in as an admin, even if they had another kind of login
    user = user
      ? (user.role === 'ADMIN' ? user : await db.buyerUser.update({ where: { id: user.id }, data: { role: 'ADMIN', accountId: null, repId: null } }))
      : await db.buyerUser.create({ data: { email, role: 'ADMIN' } });
  }

  // Same response either way, so the form can't be used to discover which emails have accounts.
  if (user) {
    const token = await createLoginToken(email);
    const url = `${appUrl()}/auth/verify?token=${token}`;
    const { text, html } = linkEmail({
      heading: 'Your sign-in link',
      intro: 'Tap the button to sign in to Haze Wholesale.',
      button: 'Sign in',
      url,
      note: 'This link works once and expires in 15 minutes. If you didn’t ask for it, you can ignore this email.',
    });
    try {
      await sendMail(email, 'Your Haze Wholesale sign-in link', text, html);
    } catch (err) {
      console.error('[mail] sign-in link failed:', err instanceof Error ? err.message : err);
      redirect('/login?error=mail');
    }
  }
  redirect('/login?sent=1');
}
