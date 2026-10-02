'use client';

import Link from 'next/link';
import { useCart } from './cart';

export function CartBar({ carry }: { carry: string }) {
  const { count } = useCart();
  if (!count) return null;
  return (
    <div className="cartbar">
      <div>
        <strong>{count} {count === 1 ? 'item' : 'items'} in cart</strong>
        <Link className="btn btn-kush" href={`/cart${carry}`}>Review order</Link>
      </div>
    </div>
  );
}
