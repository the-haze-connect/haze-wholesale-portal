# Haze Wholesale Portal

B2B ordering portal for The Haze Connect and Totally Baked wholesale accounts. Order Time stays the system of record; this app syncs catalog, HQ stock, price levels, reps and customers from Order Time and gives buyers a fast, branded place to order.

## What's built (phase 1, step 1)

- **Order Time client and sync** (`src/lib/ordertime`, `src/lib/sync`, `scripts/sync.ts`): read-only pull of items, HQ inventory, price levels and per-item prices, reps and customers into Postgres, plus a data-quality report.
- **Business rules** (`src/lib/rules.ts`), confirmed Oct 2, 2026:
  - Tier 2 = 5% off base, Tier 3 = 10% off base; Distro 1, Distro 2, Master Distro, Master Distro TB use per-item prices; no or outdated tier = base price.
  - Case/display quantities only: single vapes, single pre-rolls and single gummy packs are excluded; flower jars sell per jar; bulk flower sells in 1/4, 1/2 and 1 lb.
  - Only HQ stock is sellable. Card orders add a 3% fee.
  - Commission: Brian Warden, Clay & Max Sales and Vinny Sales only. 10% of product subtotal on retail/base accounts, 8% on Distro accounts; bulk flower $75/lb prorated, $50/lb on every lb once an order has 10+ lbs. Earned when the customer pays.
- **Pricing and commission engines** with tests built from the confirmed examples (`npm test`).
- **Buyer pages** in the approved design: home (pinned announcement, announcement feed, catalog with category/brand/stock filters, bulk size picker), quick order, cart with card vs ACH/wire totals.
- A **"Preview prices as"** strip lets admins check any tier's prices.

## Sign-in and roles (phase 1, step 2)

- **Email-link sign-in** (`/login`): one-time links that expire in 15 minutes, signed session cookie for 30 days. The form gives the same answer whether or not an email has an account.
- **Admins** are the emails in `ADMIN_EMAILS`; their login is created on first sign-in.
- **Reps** get a login from an admin (Invites → Add a rep login), tied to their Order Time rep record. They pick which of their shops they're ordering for, see that shop's prices, and invite buyers only at their own shops.
- **Buyers** are invited by their rep (or an admin) with "Can place orders" or "View inventory only". Invite links last 7 days. Buyers always see their account's tier; the preview strip and `?level=` are ignored for them.
- Email is sent from the Workspace mailbox in `MAIL_SENDER` through the Gmail API (a service account with domain-wide delegation for `gmail.send`, key in `GMAIL_SERVICE_ACCOUNT_JSON`). Railway Hobby blocks outbound SMTP, so SMTP with an app password is only a fallback for hosts that allow it. With neither set, emails print to the server log.

## Checkout and orders (phase 1, step 3)

- **Server-side pricing**: the cart is re-priced from the account's tier and HQ stock when submitted; browser prices are never trusted. If the total changed, the buyer is asked to review before anything is charged.
- **Card** (Authorize.net Accept.js): card details go from the browser straight to Authorize.net as a one-time token. The order is recorded, the card is charged for the total plus the 3% fee, and the order is approved and sent to Order Time. A declined card removes the order and releases the stock. Payments Authorize.net holds for review wait for an admin.
- **ACH / wire**: the order waits on payment. Buyers see the instructions admins enter on the Orders page. An admin clicks "Payment received: approve" to approve it, earn commission and send it to Order Time; unpaid orders can be cancelled.
- **Order Time**: sales orders are created with the customer, rep, PO, lines (bulk in 1/4LB, 1/2LB, LB units) and a memo with the payment details. Set `ORDERTIME_CARD_FEE_ITEM_ID` to add the card fee as its own line. Failures are saved on the order and admins can retry.
- **Commission** entries are written with every order (pending until paid, earned when paid).
- **Emails**: buyer confirmation and a new-order alert to `ORDER_ALERT_EMAIL` (defaults to `MAIL_SENDER`).
- Free shipping, no minimum, no sales tax (resale). Reps and admins pick the shop they're ordering for.

## Next steps

1. Admin console: announcements, accounts, commission ledger and payouts.
2. Rep commissions view.

## Run locally

```bash
npm install
cp .env.example .env          # fill in Order Time credentials
npm run sync:dry              # writes data/snapshot.json (gitignored) and prints the data report
npm run dev                   # http://localhost:3000, reads the snapshot when no DATABASE_URL is set
npm test
```

## Deploy on Railway

1. New project → Deploy from GitHub → this repo.
2. Add a **Postgres** service; Railway sets `DATABASE_URL`.
3. Set the variables in `.env.example` on the web service (generate `SESSION_SECRET` with `openssl rand -base64 48`). Never commit real credentials.
4. The app creates or updates its database tables each time it starts (`npm start` runs `prisma db push`).
5. The app syncs Order Time at startup and every 5 minutes on its own (`src/instrumentation.ts`). Set `ORDERTIME_SYNC_MINUTES` to change the interval, or `DISABLE_ORDERTIME_SYNC=1` to turn it off.

## Order Time notes

- API: `https://services.ordertime.com/api`, headers `apiKey`, `email`, `password`. List queries are `POST /api/list` with `{ Type, PageNumber, NumberOfRecords }`, max 1,000 per page.
- The portal user needs view access to items, inventory, price levels, reps, terms, customers, customer types, item groups and units of measure. It needs create access to sales orders and customers before checkout goes live.
- Bulk flower stock is in pounds; Order Time already has `1/4LB`, `1/2LB` and `LB` units.
