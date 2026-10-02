import { redirect } from 'next/navigation';
import { currentUser } from '@/lib/session';
import { requestLoginLink } from './actions';

export const dynamic = 'force-dynamic';

export default async function LoginPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  if (await currentUser()) redirect('/');
  const sp = await searchParams;
  const sent = sp.sent === '1';
  const error = sp.error;

  return (
    <>
      <header className="top"><div className="wrap"><span className="brand"><b>The Haze Connect</b><span className="chip-w">Wholesale</span></span></div></header>
      <main className="wrap">
        <div className="auth">
          <div className="auth-side">
            <span className="chip-w" style={{ alignSelf: 'flex-start', position: 'relative', zIndex: 1 }}>Wholesale</span>
            <h1 className="display">Order from live inventory, at your price</h1>
            <ul>
              <li>Stock straight from our warehouse, so what you order ships</li>
              <li>Your tier pricing on every product, every time</li>
              <li>Reorder your regular restock in one list</li>
              <li>Deals, restock dates and shipping news in one place</li>
            </ul>
          </div>
          <div className="auth-main">
            {sent ? (
              <>
                <h2 className="display">Check your email</h2>
                <div className="sent">
                  <b>If that email is on a wholesale account, a sign-in link is on its way.</b>
                  <span>It works once and expires in 15 minutes. No password needed.</span>
                </div>
                <a className="btn btn-ghost" href="/login">Use a different email</a>
              </>
            ) : (
              <>
                <h2 className="display">Sign in</h2>
                <p style={{ margin: 0, color: 'var(--ink-2)' }}>Enter the email on your wholesale account and we’ll send you a one-time sign-in link.</p>
                {error === 'expired' && <p className="note-warn">That link expired or was already used. Request a new one.</p>}
                {error === 'email' && <p className="note-warn">Enter a valid email address.</p>}
                {error === 'busy' && <p className="note-warn">Too many requests for this email. Wait a few minutes and try again.</p>}
                <form action={requestLoginLink} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  <div className="field">
                    <label htmlFor="email">Work email</label>
                    <input id="email" name="email" type="email" autoComplete="email" required placeholder="you@yourshop.com" />
                  </div>
                  <button className="btn btn-dark" type="submit" style={{ minHeight: 48 }}>Email me a sign-in link</button>
                </form>
                <p style={{ margin: '8px 0 0', paddingTop: 16, borderTop: '1px solid var(--line)', color: 'var(--ink-2)' }}>
                  New to Haze wholesale? Ask your rep for an invite.
                </p>
              </>
            )}
          </div>
        </div>
      </main>
    </>
  );
}
