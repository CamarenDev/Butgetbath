# Deployment

Requires Node 24+ (uses built-in `node:sqlite`). No database server needed.

```
npm install
npm run build   # generates dist/
npm start       # builds, loads .env, serves on PORT (default 3000)
npm test
```

## Environment (.env, never commit)
- `RESEND_API_KEY` – Resend API key
- `EMAIL_FROM` – e.g. `Budget Bath Solutions <hello@yourdomain.com>`; the domain must be verified in Resend (`onboarding@resend.dev` only delivers to the Resend account owner)
- `NOTIFY_EMAIL` – where new leads and customer requests are sent
- `ADMIN_EMAILS` – comma-separated verified accounts allowed to use the admin portal at `/admin/` (contacts, support, forum, reviews, projects, images, visitors, users, settings) and `/account/admin/`
- `SITE_URL` – public URL (https enables Secure cookies)
- `DATA_DIR` – SQLite DB, uploads and lead log (default `./data`); back this up
- `TRUST_PROXY=1` when behind a reverse proxy
- `REPLY_DOMAIN`, `RESEND_WEBHOOK_SECRET` – email replies (see below)

Without a Resend key, emails are logged to the console.

## Accounts and request tickets
Free customer accounts (email verification, password reset) let customers upload photos (JPG/PNG/WebP, 8 MB, 10 per message) with a comment on each photo, and talk with your team in a threaded conversation per request. Statuses: Open, In progress, Awaiting customer, Resolved, Closed. Staff (`ADMIN_EMAILS`) work from `/account/admin/` (inbox with "Needs reply" filter), can reply, change status and leave internal notes. Customers get reply and status emails (they can switch these off in their account). Account pages are `noindex`.

## Email replies (optional, recommended)
Notification emails carry a signed reply address `ticket-<id>-<signature>@REPLY_DOMAIN`. Replying by email adds the message (and image attachments) to the request, for customers and for staff emails listed in `ADMIN_EMAILS`/`NOTIFY_EMAIL`.
1. In Resend, enable receiving on a domain or subdomain (for example `reply.yourdomain.com`) and add its MX record.
2. Set `REPLY_DOMAIN=reply.yourdomain.com`.
3. Add a webhook in Resend for the `email.received` event pointing to `https://YOURSITE/api/webhooks/resend` and set `RESEND_WEBHOOK_SECRET` to its signing secret (`whsec_...`). Unsigned requests are rejected.
Without these, notifications still work; customers reply through the website.

## Before launch
Set phone/email in `site.json`, add `assets/og-image.png` (1200x630, design in `assets/og-card.html`), claim Google Business Profile, submit `sitemap.xml` to Search Console.

## Estimator payments and signed PDFs
- `STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET`: enable card payments. Add a Stripe webhook to `https://YOURSITE/api/webhooks/stripe` for `checkout.session.completed`. Without them, customers are told to contact you and admins record cash/check payments.
- Signed-copy PDFs are emailed through Resend (needs `RESEND_API_KEY`) to the customer and `NOTIFY_EMAIL`.
- Behind a proxy, set the trusted-proxy option so signature records store the real client IP.

## AI photo estimating (optional)
Set `AI_API_KEY` (and optionally `AI_MODEL`, `AI_BASE_URL`) to enable photo estimating in the estimator. Photos leave the server to that provider for analysis, so mention it in your privacy policy. Leave unset to keep it off.
