import { NextResponse, type NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { appUrl, consumeLoginToken, startSession } from '@/lib/session';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get('token') ?? '';
  const email = token ? await consumeLoginToken(token) : null;
  const user = email ? await db.buyerUser.findUnique({ where: { email } }) : null;
  if (!user) return NextResponse.redirect(new URL('/login?error=expired', appUrl()));

  await db.buyerUser.update({ where: { id: user.id }, data: { lastLogin: new Date() } });
  await startSession(user.id);
  const home = user.role === 'REP' ? '/invites' : '/';
  return NextResponse.redirect(new URL(home, appUrl()));
}
