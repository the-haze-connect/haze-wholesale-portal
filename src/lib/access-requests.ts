import 'server-only';
import { db } from './db';
import { linkEmail, sendMail } from './mail';
import { OrderTime, configFromEnv, type OtAddressInput } from './ordertime/client';
import { BLOCKED_STATES } from './rules';
import { appUrl, createLoginToken } from './session';

type Req = NonNullable<Awaited<ReturnType<typeof db.accessRequest.findUnique>>>;

const INVITE_DAYS = 7;
const trim = (s: string | null | undefined, n: number) => (s ?? '').trim().slice(0, n);

function address(r: Req): OtAddressInput {
  return {
    Name: trim(r.businessName, 40),
    Addr1: trim(r.addr1, 100), ...(r.addr2 ? { Addr2: trim(r.addr2, 100) } : {}),
    City: trim(r.city, 50), State: r.state, Zip: trim(r.zip, 15),
    Email: r.email, ...(r.phone ? { Phone: trim(r.phone, 30) } : {}),
  };
}

function leadNote(r: Req) {
  return [
    `Wholesale portal access request #${r.id}`,
    `Contact: ${r.contactName} <${r.email}>${r.phone ? `, ${r.phone}` : ''}`,
    r.storeType && `Store type: ${r.storeType}`,
    r.licenseNumber && `Hemp/business license: ${r.licenseNumber}`,
    r.resaleNumber && `Resale/sales tax permit: ${r.resaleNumber}`,
    r.website && `Website/social: ${r.website}`,
    r.repName && `Rep named by applicant: ${r.repName}`,
    r.documentId && `License/resale document uploaded in the portal`,
    r.notes && `Notes: ${r.notes}`,
  ].filter(Boolean).join('\n').slice(0, 4000);
}

/** Creates the Order Time lead for a request. Safe to retry; records the error if Order Time refuses. */
export async function createLeadFor(requestId: number) {
  const r = await db.accessRequest.findUnique({ where: { id: requestId } });
  if (!r || r.leadId || r.status !== 'PENDING') return r;
  const rep = r.repName ? await db.rep.findFirst({ where: { name: r.repName, active: true } }) : null;
  try {
    const lead = await new OrderTime(configFromEnv()).createLead({
      Name: trim(r.businessName, 50),
      CompanyName: trim(r.businessName, 100),
      BillAddress: address(r),
      PrimaryShipAddress: address(r),
      ...(rep ? { SalesRepRef: { Id: rep.otId } } : {}),
      Note: leadNote(r),
    });
    return db.accessRequest.update({ where: { id: r.id }, data: { leadId: lead.Id, leadError: null } });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[requests] lead for request #${r.id} not created:`, msg);
    return db.accessRequest.update({ where: { id: r.id }, data: { leadError: msg.slice(0, 500) } });
  }
}

export interface ApproveInput {
  requestId: number;
  actor: string;
  /** Link to an existing portal account instead of converting the lead. */
  existingAccountId?: number | null;
  repId?: number | null;
  priceLevelId?: number | null;
}

export type ApproveResult = { ok: true; message: string; warning?: string } | { ok: false; message: string };

/**
 * Approves a request: converts its Order Time lead to a customer (or links an existing account),
 * sets rep and price level, creates the portal account and buyer login, and emails the invite.
 */
export async function approveRequest(input: ApproveInput): Promise<ApproveResult> {
  const r = await db.accessRequest.findUnique({ where: { id: input.requestId } });
  if (!r || r.status !== 'PENDING') return { ok: false, message: 'This request was already handled.' };
  if (BLOCKED_STATES.includes(r.state)) return { ok: false, message: `We don’t ship to ${r.state}.` };

  const existingLogin = await db.buyerUser.findUnique({ where: { email: r.email } });
  if (existingLogin && existingLogin.role !== 'BUYER' && existingLogin.role !== 'VIEW_ONLY') {
    return { ok: false, message: 'That email belongs to a staff login.' };
  }

  const rep = input.repId ? await db.rep.findUnique({ where: { id: input.repId } }) : null;
  const level = input.priceLevelId ? await db.priceLevel.findUnique({ where: { id: input.priceLevelId } }) : null;
  let accountId: number;
  let customerId: number | null = null;
  let warning: string | undefined;

  if (input.existingAccountId) {
    const acct = await db.account.findUnique({ where: { id: input.existingAccountId } });
    if (!acct) return { ok: false, message: 'Choose an existing account.' };
    accountId = acct.id;
    customerId = acct.otCustomerId;
  } else {
    if (!r.leadId) {
      const again = await createLeadFor(r.id);
      if (!again?.leadId) return { ok: false, message: `The Order Time lead couldn’t be created: ${again?.leadError ?? 'unknown error'}` };
      r.leadId = again.leadId;
    }
    const ot = new OrderTime(configFromEnv());
    let customer: { Id: number } & Record<string, unknown>;
    try {
      customer = await ot.convertLeadToCustomer(r.leadId);
    } catch (err) {
      return { ok: false, message: `Order Time didn’t convert the lead: ${err instanceof Error ? err.message : err}` };
    }
    customerId = customer.Id;

    // Set the rep and price level you picked (Order Time takes the whole record back)
    if (rep || level) {
      try {
        const full = await ot.getCustomer(customer.Id);
        await ot.updateCustomer({
          ...full,
          ...(rep ? { SalesRepRef: { Id: rep.otId, Name: rep.name } } : {}),
          ...(level ? { PriceLevelRef: { Id: level.otId, Name: level.name } } : {}),
        });
      } catch (err) {
        warning = `Customer created, but set the ${[rep && 'rep', level && 'price level'].filter(Boolean).join(' and ')} in Order Time yourself (${err instanceof Error ? err.message.slice(0, 120) : err}).`;
      }
    }

    // Create the portal account now so the buyer can order right away; the sync keeps it current
    const acct = await db.account.upsert({
      where: { otCustomerId: customer.Id },
      create: {
        otCustomerId: customer.Id, name: r.businessName, status: 'ACTIVE',
        shipState: r.state, rawShipState: r.state, repId: rep?.id ?? null,
        priceLevelId: level?.id ?? null, otPriceLevel: level?.name ?? null, licenseNumber: r.licenseNumber,
      },
      update: { status: 'ACTIVE' },
    });
    accountId = acct.id;
  }

  // Buyer login + invite
  await db.buyerUser.upsert({
    where: { email: r.email },
    create: { email: r.email, name: r.contactName, role: 'BUYER', accountId },
    update: { accountId, role: 'BUYER', name: r.contactName },
  });
  await db.accessRequest.update({
    where: { id: r.id },
    data: { status: 'APPROVED', reviewedBy: input.actor, reviewedAt: new Date(), accountId, customerId },
  });
  await db.auditLog.create({ data: { actor: input.actor, action: 'request.approve', detail: { requestId: r.id, accountId, customerId, leadId: r.leadId } } });

  try {
    const token = await createLoginToken(r.email, INVITE_DAYS * 24 * 60);
    const { text, html } = linkEmail({
      heading: 'Your wholesale account is approved',
      intro: `Welcome to The Haze Connect wholesale, ${r.contactName.split(' ')[0]}! ${r.businessName} can now order from our live inventory at your account’s pricing.`,
      button: 'Open Haze Wholesale',
      url: `${appUrl()}/auth/verify?token=${token}`,
      note: `This link works once and expires in ${INVITE_DAYS} days. After that, sign in any time with your email at ${appUrl()}/login.`,
    });
    await sendMail(r.email, 'Your Haze Wholesale account is approved', text, html);
  } catch (err) {
    warning = [warning, `The welcome email didn’t send (${err instanceof Error ? err.message : err}). Use Resend on the Invites page.`].filter(Boolean).join(' ');
  }
  return { ok: true, message: `Approved ${r.businessName}${customerId ? ` (Order Time customer ${customerId})` : ''}. Invite sent to ${r.email}.`, warning };
}

export async function declineRequest(requestId: number, actor: string, reason: string, notify: boolean) {
  const r = await db.accessRequest.findUnique({ where: { id: requestId } });
  if (!r || r.status !== 'PENDING') return { ok: false, message: 'This request was already handled.' };
  await db.accessRequest.update({ where: { id: r.id }, data: { status: 'DECLINED', reviewedBy: actor, reviewedAt: new Date(), declineReason: reason || null } });
  await db.auditLog.create({ data: { actor, action: 'request.decline', detail: { requestId: r.id, reason } } });
  if (notify) {
    const { text, html } = linkEmail({
      heading: 'About your wholesale request',
      intro: `Thanks for your interest in The Haze Connect wholesale. We’re not able to open an account for ${r.businessName} right now.${reason ? ` ${reason}` : ''}`,
      button: 'Visit The Haze Connect',
      url: 'https://thehazeconnect.com',
      note: 'Questions? Reply to this email.',
    });
    await sendMail(r.email, 'Your Haze Wholesale request', text, html).catch(err => console.error('[mail] decline email failed:', err instanceof Error ? err.message : err));
  }
  return { ok: true, message: `Declined ${r.businessName}${notify ? ' and emailed them' : ''}.${r.leadId ? ' The lead stays in Order Time.' : ''}` };
}
