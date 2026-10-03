import { NextResponse, type NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { currentUser } from '@/lib/session';

/** An applicant's uploaded license or resale certificate. Admins only. */
export async function GET(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await currentUser();
  if (user?.role !== 'ADMIN') return new NextResponse('Not allowed', { status: 403 });
  const r = await db.accessRequest.findUnique({ where: { id: Number((await params).id) } });
  const doc = r?.documentId ? await db.document.findUnique({ where: { id: r.documentId } }) : null;
  if (!doc) return new NextResponse('Not found', { status: 404 });
  return new NextResponse(new Uint8Array(doc.data), {
    headers: {
      'content-type': doc.mime, 'cache-control': 'private, no-store', 'x-content-type-options': 'nosniff',
      'content-disposition': `inline; filename="${doc.name.replace(/[^\w.\- ]/g, '_')}"`,
    },
  });
}
