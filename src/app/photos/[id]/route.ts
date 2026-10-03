import { NextResponse, type NextRequest } from 'next/server';
import { db } from '@/lib/db';

/** Serves admin-uploaded product photos. Uploads never change, so they cache for a year. */
export async function GET(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const id = Number((await params).id);
  if (!Number.isInteger(id)) return new NextResponse('Not found', { status: 404 });
  const photo = await db.productPhoto.findUnique({ where: { id } });
  if (!photo) return new NextResponse('Not found', { status: 404 });
  return new NextResponse(new Uint8Array(photo.data), {
    headers: { 'content-type': photo.mime, 'cache-control': 'public, max-age=31536000, immutable', 'x-content-type-options': 'nosniff' },
  });
}
