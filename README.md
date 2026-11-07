# Ask Badger CRM

Scheduling, appointment confirmation, materials and inventory, estimates, invoices, and payments for Ask Badger Electric.

## What works today

**Customers** (no login needed)
- `/book` lists services. Customers pick a day and an open time, then enter their details.
- They get an email with a link to their appointment page (`/a/<secret>`), where they can **confirm**, **reschedule**, or **cancel**.
- A reminder goes out the evening before the job.

**Owner** (`/admin`, password protected)
- Week calendar with status of every job, plus a count of jobs still waiting for the customer to confirm.
- Create appointments yourself (phone bookings), even outside normal hours, and email the customer a confirm link.
- Move, cancel, complete, or reopen jobs. Private notes and job address per job.
- Customer list with search and job history.
- Settings: business details, working hours, gap between jobs, minimum notice, booking window, services offered, time off, sales tax rate, and Zelle details (used by invoices later).

**Materials and inventory** (`/admin/materials`)
- Parts list with store, SKU, barcode, your cost, markup, what you charge, stock on hand, where it's kept, and a low-stock warning.
- Stock history for every change: bought, used on a job, counted, or adjusted.
- **Barcode scanner** on your phone camera (needs the site on https), or type the number / use a handheld scanner. Known items show stock with quick "+ Bought" / "− Used" buttons. New items are looked up on UPCitemdb for the product name and any listed Home Depot or Lowe's price.
- **Receipt import**: upload a Home Depot Pro or Lowe's Pro purchase-history CSV. Matching items get their cost updated, new ones are created, and quantities are added to stock.
- On each appointment, record materials used. It shows the total at your markup and takes them out of stock.

**Estimates, invoices, and payments**
- Build an estimate from labor (your hourly rate) and materials (your cost plus markup), plus any other lines and discounts. Tax applies per line: materials are taxable by default and labor is not. Confirm the right treatment for Georgia with your accountant.
- "Create estimate" or "Create invoice" on an appointment fills in the labor for the booked time and the materials logged on the job.
- Customers open the estimate link, type their name, and approve it, or decline with a reason. You get an email either way.
- One click turns an approved estimate into an invoice, due after your default number of days.
- The customer's invoice page takes **Square** payments: card, Apple Pay, Google Pay, Cash App Pay, and bank transfer (ACH). It also shows your **Zelle** details with the invoice number to use as the memo.
- Card and wallet payments mark the invoice paid right away. Bank transfers show as processing until Square's webhook reports them cleared.
- Record Zelle, cash, or check payments yourself, including partial payments, and email a receipt.
- The invoice list shows the outstanding and overdue totals.

Customers can only book times that fit your hours, your existing jobs (plus the travel gap), and your time off. A database lock stops two people grabbing the same slot.

## Run it locally

You need Node 20+ and Postgres.

```bash
cp .env.example .env      # then fill in DATABASE_URL, DATABASE_URL_UNPOOLED, ADMIN_PASSWORD, SESSION_SECRET
npm install
npm run db:migrate        # creates the tables
npm run db:seed           # weekday 8-5 hours and starter services (or use "Load starter setup" in Settings)
npm run dev
```

Open http://localhost:3000 for the booking page and http://localhost:3000/admin for the owner side.

Without `RESEND_API_KEY`, emails are printed in the terminal instead of sent.

## Setting up Square

1. Go to https://developer.squareup.com/apps, sign in with your Square account, and create an application.
2. Start with the **Sandbox** tab. Copy the Application ID, Access token, and a Location ID into `.env` with `SQUARE_ENVIRONMENT="sandbox"`. Pay a test invoice with Square's test card `4111 1111 1111 1111`.
3. Under **Webhooks**, add a subscription for `payment.created` and `payment.updated` pointing to `https://<your domain>/api/square/webhook`. Put that exact URL in `SQUARE_WEBHOOK_URL` and the signature key in `SQUARE_WEBHOOK_SIGNATURE_KEY`.
4. **Apple Pay** only shows after you register your domain in the Square Developer Dashboard (Apple Pay section). **Google Pay** and **Cash App Pay** need no extra setup.
5. When it all works, switch to the **Production** values and set `SQUARE_ENVIRONMENT="production"`.

## Checks

```bash
npm test          # unit tests: open slots, pricing, barcode cleanup, receipt CSV, UPC lookup, invoice totals and tax, Square webhook signatures
npm run typecheck
npm run lint
```

## Deploying (Vercel)

1. In the Vercel project, open **Storage → Create Database → Neon** and connect it. This sets `DATABASE_URL` and `DATABASE_URL_UNPOOLED` for you. If you use another Postgres host, set both yourself, with the direct (non-pooled) string in `DATABASE_URL_UNPOOLED`.
2. Import this repo in Vercel and set the variables from `.env.example`. Set `APP_URL` to your real address.
3. `npm run build` runs database migrations before building.
4. `vercel.json` runs `/api/cron/reminders` once a day at 22:00 UTC (5 or 6 pm Eastern), which works on Vercel's free plan. It reminds customers about appointments today and tomorrow. Vercel sends `CRON_SECRET` with it automatically.
5. For email, create a Resend account, verify your domain, and set `RESEND_API_KEY` and `EMAIL_FROM`.
