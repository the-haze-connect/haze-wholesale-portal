'use server';

import { headers } from 'next/headers';
import { createLeadFor } from '@/lib/access-requests';
import { db } from '@/lib/db';
import { linkEmail, sendMail } from '@/lib/mail';
import { BLOCKED_STATES, normalizeState } from '@/lib/rules';
import { appUrl } from '@/lib/session';

export interface ApplyResult { ok: boolean; message: string; fields?: Record<string, string> }

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const DOC_TYPES = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'];
const MAX_DOC = 5 * 1024 * 1024;

export async function submitRequest(_: ApplyResult | null, form: FormData): Promise<ApplyResult> {
  const v = (k: string, n = 200) => String(form.get(k) ?? '').trim().slice(0, n);
  const fields = Object.fromEntries(['businessName', 'contactName', 'email', 'phone', 'addr1', 'addr2', 'city', 'state', 'zip', 'storeType', 'licenseNumber', 'resaleNumber', 'website', 'repName', 'notes'].map(k => [k, v(k, k === 'notes' ? 1500 : 200)]));
  const fail = (message: string) => ({ ok: false, message, fields });

  // Bots fill the hidden field; pretend it worked
  if (v('company_site')) return { ok: true, message: 'sent' };

  if (!fields.businessName || !fields.contactName) return fail('Enter your business name and your name.');
  const email = fields.email.toLowerCase();
  if (!EMAIL.test(email)) return fail('Enter a valid email address.');
  if (!fields.addr1 || !fields.city || !fields.zip) return fail('Enter your full ship-to address.');
  const state = normalizeState(fields.state);
  if (!state) return fail('Enter your state, like TX or Texas.');
  if (BLOCKED_STATES.includes(state)) return fail(`Sorry, we can’t ship hemp products to ${state}, so we can’t open wholesale accounts there.`);
  if (!fields.licenseNumber && !fields.resaleNumber && !(form.get('document') instanceof File && (form.get('document') as File).size)) {
    return fail('Add your hemp/business license number, resale permit number, or upload a copy.');
  }

  const ip = (await headers()).get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown';
  const dayAgo = new Date(Date.now() - 864e5);
  if (await db.accessRequest.count({ where: { email, createdAt: { gt: dayAgo } } }) >= 3) return fail('We already have your request. We’ll be in touch soon.');
  if (await db.auditLog.count({ where: { action: 'request.submit', actor: `ip:${ip}`, createdAt: { gt: dayAgo } } }) >= 10) return fail('Too many requests from your network today. Try again tomorrow.');

  if (await db.buyerUser.findUnique({ where: { email } })) return fail('That email already has a wholesale login. Sign in instead.');

  let documentId: number | null = null;
  const doc = form.get('document');
  if (doc instanceof File && doc.size > 0) {
    if (!DOC_TYPES.includes(doc.type)) return fail('Upload your document as a PDF, JPG or PNG.');
    if (doc.size > MAX_DOC) return fail('That file is over 5 MB. Upload a smaller copy or photo.');
    const saved = await db.document.create({ data: { name: doc.name.slice(0, 120), mime: doc.type, data: Buffer.from(await doc.arrayBuffer()), bytes: doc.size } });
    documentId = saved.id;
  }

  const req = await db.accessRequest.create({
    data: {
      businessName: fields.businessName, contactName: fields.contactName, email, phone: fields.phone || null,
      addr1: fields.addr1, addr2: fields.addr2 || null, city: fields.city, state, zip: fields.zip,
      storeType: fields.storeType || null, licenseNumber: fields.licenseNumber || null, resaleNumber: fields.resaleNumber || null,
      website: fields.website || null, repName: fields.repName || null, notes: fields.notes || null, documentId,
    },
  });
  await db.auditLog.create({ data: { actor: `ip:${ip}`, action: 'request.submit', detail: { requestId: req.id, email } } });

  // Lead in Order Time (retried from the admin page if it fails)
  await createLeadFor(req.id).catch(() => null);

  // Emails: confirmation to the shop, alert to the team (and the named rep, if they have a login)
  const mail = async (to: string, subject: string, opts: Parameters<typeof linkEmail>[0]) => {
    const { text, html } = linkEmail(opts);
    await sendMail(to, subject, text, html).catch(err => console.error('[mail] request email failed:', err instanceof Error ? err.message : err));
  };
  await mail(email, 'We got your wholesale request', {
    heading: 'Thanks, we got your request',
    intro: `We’ll review ${fields.businessName}’s application and email you within 1–2 business days. Once you’re approved, you’ll get a link to sign in and order.`,
    button: 'Visit The Haze Connect', url: 'https://thehazeconnect.com',
    note: 'Questions? Reply to this email.',
  });
  const team = process.env.ORDER_ALERT_EMAIL || process.env.MAIL_SENDER;
  const alert = {
    heading: `New wholesale request: ${fields.businessName}`,
    intro: `${fields.contactName} (${email}) in ${fields.city}, ${state}${fields.repName ? `, rep: ${fields.repName}` : ''}. ${req.documentId ? 'A license document was uploaded. ' : ''}Review and approve it in the admin.`,
    button: 'Review request', url: `${appUrl()}/admin/requests/${req.id}`,
    note: 'Sent by the Haze Wholesale portal.',
  };
  if (team) await mail(team, `Wholesale request: ${fields.businessName} (${state})`, alert);
  if (fields.repName) {
    const rep = await db.rep.findFirst({ where: { name: fields.repName } });
    const repUser = rep ? await db.buyerUser.findFirst({ where: { role: 'REP', repId: rep.id } }) : null;
    if (repUser) await mail(repUser.email, `Wholesale request: ${fields.businessName} named you`, { ...alert, intro: `${fields.businessName} (${fields.city}, ${state}) applied for wholesale and named you as their rep. Our team will review it; you’ll be able to order for them once approved.`, button: 'Open Haze Wholesale', url: `${appUrl()}/` });
  }
  return { ok: true, message: 'sent' };
}
