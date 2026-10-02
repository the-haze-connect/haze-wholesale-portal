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
- Email goes through Google Workspace SMTP; without SMTP settings, emails print to the server log.

## Next steps

1. Checkout: Authorize.net card payments (instant approval) and ACH/wire (manual approval), posting sales orders to Order Time.
2. Admin console: announcements, accounts, order queue, commission ledger and payouts.
3. Rep commissions view.

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
4. Run `npx prisma db push` once (Railway shell), then `npm run sync`.
5. Add a **cron service** from the same repo running `npm run sync` every 5 minutes.

## Order Time notes

- API: `https://services.ordertime.com/api`, headers `apiKey`, `email`, `password`. List queries are `POST /api/list` with `{ Type, PageNumber, NumberOfRecords }`, max 1,000 per page.
- The portal user needs view access to items, inventory, price levels, reps, terms, customers, customer types, item groups and units of measure. It needs create access to sales orders and customers before checkout goes live.
- Bulk flower stock is in pounds; Order Time already has `1/4LB`, `1/2LB` and `LB` units.
