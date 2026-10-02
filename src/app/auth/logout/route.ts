import { NextResponse, type NextRequest } from 'next/server';
import { appUrl, endSession } from '@/lib/session';

export async function POST(req: NextRequest) {
  await endSession();
  return NextResponse.redirect(new URL('/login', appUrl()), 303);
}
