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
- `NOTIFY_EMAIL` – where new leads, customer requests and employee location alerts are sent
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

## Employee time clock and GPS tracking

Employees clock in from the Employee portal (**Clock** tab). Tracking starts only after they accept the location notice for that shift and the phone returns a precise fix (within 250 m); it stops when they clock out. The site must be served over HTTPS (or localhost) for browsers to allow location.

- **Job sites:** set the GPS point and radius on each job (Admin > Jobs > Job site). Employees must be inside the radius to clock in. Time continuously away for more than 3 minutes is unpaid and alerts the office; after 20 minutes away they are clocked out automatically.
- **Location loss:** a background monitor (every minute) clocks employees out, alerts `NOTIFY_EMAIL` and emails the employee if no location arrives for 5 minutes or location permission stays denied for 2 minutes. Pay stops at the last good location.
- **Pay:** every shift becomes a pending hours entry containing only on-site time, so it goes through the normal approval flow.
- **Review:** Admin > Location (live view, alerts, charts, history, route map) and the Location section of each employee file. Estimator outcomes record which employees worked a job and on which days (AI learning page).
- Browsers cannot read hardware IDs. Each phone gets a persistent device ID plus its model/OS details when the browser exposes them. Browsers also pause location for backgrounded pages, so employees must keep the portal open (the app keeps the screen awake where supported); gaps are logged and trigger the auto clock-out rules above.
- `LOCATION_RETENTION_DAYS` (default 400) – GPS points older than this are deleted when someone clocks in.
