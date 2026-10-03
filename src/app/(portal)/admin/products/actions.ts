'use server';

import { revalidatePath } from 'next/cache';
import { db } from '@/lib/db';
import { requireUser } from '@/lib/session';

export interface PhotoResult { ok: boolean; message: string }

const MAX_BYTES = 4 * 1024 * 1024;
const TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];

function refresh() {
  revalidatePath('/admin/products');
  revalidatePath('/');
  revalidatePath('/quick-order');
}

/** Upload a photo file, or set a photo URL, for one product. */
export async function setProductPhoto(_: PhotoResult | null, form: FormData): Promise<PhotoResult> {
  const me = await requireUser(['ADMIN']);
  const productId = Number(form.get('productId'));
  const product = await db.product.findUnique({ where: { id: productId } });
  if (!product) return { ok: false, message: 'Product not found.' };

  const file = form.get('file');
  const url = String(form.get('url') ?? '').trim();
  let override: string;

  if (file instanceof File && file.size > 0) {
    if (!TYPES.includes(file.type)) return { ok: false, message: 'Use a JPG, PNG, WebP or GIF image.' };
    if (file.size > MAX_BYTES) return { ok: false, message: 'That image is over 4 MB. Export a smaller copy (1200 px wide is plenty).' };
    const data = Buffer.from(await file.arrayBuffer());
    const photo = await db.productPhoto.create({ data: { mime: file.type, data, bytes: file.size, createdBy: me.email } });
    override = `/photos/${photo.id}`;
  } else if (url) {
    if (!/^https:\/\/\S+$/i.test(url)) return { ok: false, message: 'Paste an image link that starts with https://' };
    override = url.slice(0, 1000);
  } else {
    return { ok: false, message: 'Choose an image file or paste an image link.' };
  }

  await db.product.update({ where: { id: productId }, data: { photoOverride: override } });
  await db.auditLog.create({ data: { actor: me.email, action: 'product.photo', detail: { productId, code: product.code, photo: override } } });
  refresh();
  return { ok: true, message: `Photo saved for ${product.code}.` };
}

/** "auto" goes back to the store match; "none" shows no photo. */
export async function resetProductPhoto(form: FormData) {
  const me = await requireUser(['ADMIN']);
  const productId = Number(form.get('productId'));
  const mode = form.get('mode') === 'none' ? 'none' : null;
  await db.product.update({ where: { id: productId }, data: { photoOverride: mode } });
  await db.auditLog.create({ data: { actor: me.email, action: 'product.photo', detail: { productId, photo: mode ?? 'auto' } } });
  refresh();
}

/** Hide or show a product on the portal. */
export async function toggleProductVisible(form: FormData) {
  const me = await requireUser(['ADMIN']);
  const productId = Number(form.get('productId'));
  const p = await db.product.findUnique({ where: { id: productId } });
  if (!p) return;
  await db.product.update({ where: { id: productId }, data: { visible: !p.visible } });
  await db.auditLog.create({ data: { actor: me.email, action: p.visible ? 'product.hide' : 'product.show', detail: { productId, code: p.code } } });
  refresh();
}

/** Offer or stop offering an item as a free sample. */
export async function toggleSample(form: FormData) {
  const me = await requireUser(['ADMIN']);
  const productId = Number(form.get('productId'));
  const p = await db.product.findUnique({ where: { id: productId } });
  if (!p) return;
  await db.product.update({ where: { id: productId }, data: { sampleOffered: !p.sampleOffered } });
  await db.auditLog.create({ data: { actor: me.email, action: p.sampleOffered ? 'sample.remove' : 'sample.offer', detail: { productId, code: p.code } } });
  refresh();
  revalidatePath('/cart');
}

export async function saveSampleLimit(_: PhotoResult | null, form: FormData): Promise<PhotoResult> {
  const me = await requireUser(['ADMIN']);
  const n = Number(form.get('limit'));
  if (!Number.isInteger(n) || n < 0 || n > 100) return { ok: false, message: 'Enter a whole number from 0 to 100.' };
  await db.setting.upsert({ where: { key: 'sample_limit' }, create: { key: 'sample_limit', value: String(n), updatedBy: me.email }, update: { value: String(n), updatedBy: me.email } });
  await db.auditLog.create({ data: { actor: me.email, action: 'settings.sample_limit', detail: { limit: n } } });
  refresh();
  return { ok: true, message: n ? `Up to ${n} free sample${n === 1 ? '' : 's'} per order.` : 'Samples are switched off.' };
}
