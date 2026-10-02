import 'server-only';

/**
 * Authorize.net card charges.
 *
 * Card numbers never reach this server: the browser turns them into a one-time
 * payment nonce with Accept.js (using the public client key), and we charge the nonce.
 * Docs: https://developer.authorize.net/api/reference/index.html#payment-transactions-charge-a-credit-card
 */

export interface AuthnetPublicConfig {
  apiLoginId: string;
  clientKey: string;
  acceptJsUrl: string;
}

const isSandbox = () => (process.env.AUTHNET_ENV ?? 'sandbox') !== 'production';

/** What the browser needs to load Accept.js. Null when card payments aren't set up. */
export function authnetPublicConfig(): AuthnetPublicConfig | null {
  const apiLoginId = process.env.AUTHNET_API_LOGIN_ID;
  const clientKey = process.env.AUTHNET_CLIENT_KEY;
  if (!apiLoginId || !clientKey || !process.env.AUTHNET_TRANSACTION_KEY) return null;
  return {
    apiLoginId,
    clientKey,
    acceptJsUrl: isSandbox() ? 'https://jstest.authorize.net/v1/Accept.js' : 'https://js.authorize.net/v1/Accept.js',
  };
}

export interface ChargeInput {
  opaqueData: { dataDescriptor: string; dataValue: string };
  amount: number;
  invoiceNumber: string;
  description: string;
  poNumber?: string | null;
  customerEmail?: string | null;
  billToCompany?: string | null;
}

export type ChargeResult =
  | { ok: true; transId: string; last4: string | null; heldForReview: boolean }
  | { ok: false; message: string };

export async function chargeCard(input: ChargeInput): Promise<ChargeResult> {
  const name = process.env.AUTHNET_API_LOGIN_ID;
  const transactionKey = process.env.AUTHNET_TRANSACTION_KEY;
  if (!name || !transactionKey) return { ok: false, message: 'Card payments are not set up yet. Choose ACH / wire.' };

  // Authorize.net checks field order against its schema, so keep these in documented order.
  const body = {
    createTransactionRequest: {
      merchantAuthentication: { name, transactionKey },
      refId: input.invoiceNumber.slice(0, 20),
      transactionRequest: {
        transactionType: 'authCaptureTransaction',
        amount: input.amount.toFixed(2),
        payment: { opaqueData: input.opaqueData },
        order: { invoiceNumber: input.invoiceNumber.slice(0, 20), description: input.description.slice(0, 255) },
        ...(input.poNumber ? { poNumber: input.poNumber.slice(0, 25) } : {}),
        ...(input.customerEmail ? { customer: { email: input.customerEmail.slice(0, 255) } } : {}),
        ...(input.billToCompany ? { billTo: { company: input.billToCompany.slice(0, 50) } } : {}),
      },
    },
  };

  const url = isSandbox() ? 'https://apitest.authorize.net/xml/v1/request.api' : 'https://api.authorize.net/xml/v1/request.api';
  let json: AuthnetResponse;
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(45_000),
      cache: 'no-store',
    });
    // Responses start with a byte-order mark
    json = JSON.parse((await res.text()).replace(/^﻿/, '')) as AuthnetResponse;
  } catch (err) {
    console.error('[authnet] request failed:', err instanceof Error ? err.message : err);
    return { ok: false, message: 'We couldn’t reach the card processor. Your card was not charged. Try again in a minute.' };
  }
  return parseChargeResponse(json);
}

interface AuthnetResponse {
  transactionResponse?: {
    responseCode?: string; // 1 approved, 2 declined, 3 error, 4 held for review
    transId?: string;
    accountNumber?: string; // "XXXX1111"
    errors?: { errorCode: string; errorText: string }[];
    messages?: { code: string; description: string }[];
  };
  messages?: { resultCode: 'Ok' | 'Error'; message: { code: string; text: string }[] };
}

export function parseChargeResponse(json: AuthnetResponse): ChargeResult {
  const tr = json.transactionResponse;
  const code = tr?.responseCode;
  if ((code === '1' || code === '4') && tr?.transId && tr.transId !== '0') {
    const last4 = tr.accountNumber?.replace(/\D/g, '').slice(-4) || null;
    return { ok: true, transId: tr.transId, last4, heldForReview: code === '4' };
  }
  const reason = tr?.errors?.[0]?.errorText ?? json.messages?.message?.[0]?.text ?? 'The card was declined.';
  console.warn('[authnet] charge not approved:', code, reason);
  return { ok: false, message: code === '2' ? `Card declined: ${reason}` : `Card not charged: ${reason}` };
}
