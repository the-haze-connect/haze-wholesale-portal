import Link from 'next/link';
import { redirect } from 'next/navigation';
import { db } from '@/lib/db';
import { currentUser } from '@/lib/session';
import { ApplyForm } from './form';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Request wholesale access · The Haze Connect' };

export default async function ApplyPage() {
  if (await currentUser()) redirect('/');
  const reps = (await db.rep.findMany({ where: { active: true, commissioned: true }, orderBy: { name: 'asc' } })).map(r => r.name);
  return (
    <>
      <header className="top"><div className="wrap"><span className="brand"><b>The Haze Connect</b><span className="chip-w">Wholesale</span></span></div></header>
      <main className="wrap">
        <div className="auth">
          <div className="auth-side">
            <span className="chip-w" style={{ alignSelf: 'flex-start', position: 'relative', zIndex: 1 }}>Wholesale</span>
            <h1 className="display">Carry The Haze Connect and Totally Baked</h1>
            <ul>
              <li>Order cases and displays from live warehouse inventory</li>
              <li>Tier pricing for retailers and distributors</li>
              <li>Pay by card or ACH / wire, free shipping</li>
              <li>A rep who knows your shop</li>
            </ul>
          </div>
          <div className="auth-main">
            <h2 className="display">Request wholesale access</h2>
            <p style={{ margin: 0, color: 'var(--ink-2)' }}>Tell us about your business. We review every request and reply within 1–2 business days.</p>
            <ApplyForm reps={reps} />
            <p style={{ margin: '8px 0 0', paddingTop: 16, borderTop: '1px solid var(--line)', color: 'var(--ink-2)' }}>
              Already have an account? <Link href="/login">Sign in</Link>
            </p>
          </div>
        </div>
      </main>
    </>
  );
}
