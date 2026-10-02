import 'server-only';
import { createSign } from 'node:crypto';
import nodemailer from 'nodemailer';
import MailComposer from 'nodemailer/lib/mail-composer';

/**
 * Sends email from the Google Workspace mailbox in MAIL_SENDER (falls back to SMTP_USER).
 *
 * 1. Gmail API (preferred): set GMAIL_SERVICE_ACCOUNT_JSON to a Google Cloud service-account key
 *    that has domain-wide delegation for https://www.googleapis.com/auth/gmail.send. Works over
 *    HTTPS, so it runs on Railway plans that block outbound SMTP.
 * 2. SMTP with an app password (SMTP_HOST / SMTP_USER / SMTP_PASSWORD), with short timeouts.
 * 3. Neither set (local development): the message is printed to the server log.
 */
export async function sendMail(to: string, subject: string, text: string, html: string) {
  const sender = process.env.MAIL_SENDER || process.env.SMTP_USER || '';
  const from = process.env.MAIL_FROM || `Haze Wholesale <${sender}>`;

  if (process.env.GMAIL_SERVICE_ACCOUNT_JSON) {
    await sendViaGmailApi(sender, { from, to, subject, text, html });
    return;
  }

  const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASSWORD } = process.env;
  if (!SMTP_HOST || !SMTP_USER || !SMTP_PASSWORD) {
    console.log(`\n[mail:dev] to=${to}\nsubject=${subject}\n${text}\n`);
    return;
  }
  const port = Number(SMTP_PORT ?? 465);
  const transport = nodemailer.createTransport({
    host: SMTP_HOST, port, secure: port === 465,
    auth: { user: SMTP_USER, pass: SMTP_PASSWORD },
    connectionTimeout: 10_000, greetingTimeout: 10_000, socketTimeout: 15_000,
  });
  await transport.sendMail({ from, to, subject, text, html });
}

type Message = { from: string; to: string; subject: string; text: string; html: string };
type ServiceAccount = { client_email: string; private_key: string };

let cachedToken: { sender: string; token: string; expires: number } | null = null;

const b64url = (b: Buffer | string) => Buffer.from(b).toString('base64url');

async function gmailAccessToken(sender: string): Promise<string> {
  if (cachedToken && cachedToken.sender === sender && cachedToken.expires > Date.now() + 60_000) return cachedToken.token;

  const sa = JSON.parse(process.env.GMAIL_SERVICE_ACCOUNT_JSON!) as ServiceAccount;
  const now = Math.floor(Date.now() / 1000);
  const header = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claims = b64url(JSON.stringify({
    iss: sa.client_email,
    sub: sender, // the Workspace mailbox the service account sends as
    scope: 'https://www.googleapis.com/auth/gmail.send',
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600,
  }));
  const signer = createSign('RSA-SHA256');
  signer.update(`${header}.${claims}`);
  const assertion = `${header}.${claims}.${signer.sign(sa.private_key.replace(/\\n/g, '\n')).toString('base64url')}`;

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion }),
    signal: AbortSignal.timeout(15_000),
  });
  const body = await res.json() as { access_token?: string; expires_in?: number; error?: string; error_description?: string };
  if (!res.ok || !body.access_token) throw new Error(`Gmail auth failed: ${body.error ?? res.status} ${body.error_description ?? ''}`.trim());
  cachedToken = { sender, token: body.access_token, expires: Date.now() + (body.expires_in ?? 3600) * 1000 };
  return body.access_token;
}

async function sendViaGmailApi(sender: string, msg: Message) {
  if (!sender) throw new Error('Set MAIL_SENDER to the Workspace mailbox that sends portal email');
  const mime = await new MailComposer(msg).compile().build();
  const token = await gmailAccessToken(sender);
  const res = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
    method: 'POST',
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify({ raw: b64url(mime) }),
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new Error(`Gmail send failed: ${res.status} ${(await res.text()).slice(0, 300)}`);
}

const esc = (s: string) => s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));

export function linkEmail(opts: { heading: string; intro: string; button: string; url: string; note: string }) {
  const text = `${opts.heading}\n\n${opts.intro}\n\n${opts.button}: ${opts.url}\n\n${opts.note}`;
  const html = `<!doctype html><html><body style="margin:0;background:#F4F2EC;font-family:Arial,sans-serif;color:#0F1E22">
<table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:32px 16px">
<table width="520" cellpadding="0" cellspacing="0" style="max-width:520px;background:#fff;border-radius:16px;overflow:hidden">
<tr><td style="background:#0B1619;color:#F2EFE8;padding:20px 28px;font-weight:800;letter-spacing:.04em;text-transform:uppercase">The Haze Connect <span style="background:#8FB479;color:#0B1619;font-size:11px;padding:3px 8px;border-radius:4px;letter-spacing:.14em">Wholesale</span></td></tr>
<tr><td style="padding:28px">
<h1 style="margin:0 0 12px;font-size:22px">${esc(opts.heading)}</h1>
<p style="margin:0 0 22px;font-size:15px;line-height:1.5;color:#4A5A5D">${esc(opts.intro)}</p>
<a href="${esc(opts.url)}" style="display:inline-block;background:#8FB479;color:#0B1619;font-weight:700;text-decoration:none;padding:14px 22px;border-radius:12px">${esc(opts.button)}</a>
<p style="margin:22px 0 0;font-size:13px;color:#5E6E71">${esc(opts.note)}</p>
</td></tr></table></td></tr></table></body></html>`;
  return { text, html };
}
