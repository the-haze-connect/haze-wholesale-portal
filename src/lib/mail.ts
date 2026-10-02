import 'server-only';
import nodemailer from 'nodemailer';

/**
 * Sends through Google Workspace SMTP (smtp.gmail.com) with an app password
 * for the sending mailbox. Without SMTP settings (local development) the
 * message is printed to the server log instead.
 */
export async function sendMail(to: string, subject: string, text: string, html: string) {
  const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASSWORD, MAIL_FROM } = process.env;
  if (!SMTP_HOST || !SMTP_USER || !SMTP_PASSWORD) {
    console.log(`\n[mail:dev] to=${to}\nsubject=${subject}\n${text}\n`);
    return;
  }
  const transport = nodemailer.createTransport({
    host: SMTP_HOST, port: Number(SMTP_PORT ?? 465), secure: Number(SMTP_PORT ?? 465) === 465,
    auth: { user: SMTP_USER, pass: SMTP_PASSWORD },
  });
  await transport.sendMail({ from: MAIL_FROM ?? `Haze Wholesale <${SMTP_USER}>`, to, subject, text, html });
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
