# Online verification to-do

Items that were built or checked without direct internet access (only `web_search` summaries were available;
`web_fetch` and `curl` could not resolve zoho.com or irs.gov). Re-verify each against the primary source when
network access is available, then update the code, tests and README. Last reviewed: 2026-11-24.

## Zoho Books plugin (`lib/zoho.js`, `assets/admin/admin.js`, `test/zoho.test.js`)

Never tested against a live Zoho organization. Verify with a sandbox or test org at https://www.zoho.com/books/api/v3/ :

- [ ] OAuth: token endpoint, `access_type=offline`, `prompt=consent`, Self Client vs Server-based flow, revoke endpoint, scope `ZohoBooks.fullaccess.all` (consider narrower per-module scopes).
- [ ] Token limits (1 hour access token, max 10 tokens per 10 minutes per refresh token) and whether to use `api_domain` from the token response instead of the data-center setting.
- [ ] Data-center list (com, eu, in, com.au, jp, ca, sa, com.cn) and any new ones (accounts and API hosts).
- [ ] Rate limits: 100 calls/min per org, daily caps by plan (1,000 Free to 10,000 Premium+), concurrency (5 Free, 10 paid), 429 codes (44 per-minute, 45 daily). Re-tune `RUN_LIMIT` (90) and the retry backoff.
- [ ] Contacts: `contact_persons`, `billing_address` shape, duplicate-name error code (3062 assumed) and lookup by `contact_name`.
- [ ] Invoices: `line_items` fields, `discount` / `discount_type` / `is_discount_before_tax`, tax handling (tax as a line item is a workaround; map to Zoho `taxes` / `tax_id`), `reference_number`, `/invoices/{id}/status/sent`, whether auto-number generation needs a flag.
- [ ] Customer payments: fields, `payment_mode` values (check, cash, creditcard, banktransfer, bankremittance, autotransaction, others), `account_id` (deposit to), applying to invoices.
- [ ] Expenses: required fields (`account_id`, `paid_through_account_id`, `date`, `amount`), `vendor_id`, reference number.
- [ ] Chart of accounts filter `AccountType.Expenses`, bank accounts endpoint.
- [ ] Reports: `/reports/profitandloss`, `balancesheet`, `trialbalance` parameters (`from_date`, `to_date`, `date`) and real response shapes (the `rowsOf` parser is a guess).
- [ ] Add real features if worthwhile: two-way pull (payments made in Zoho), bills and vendor payments for contractors, items, tax mapping, bank transaction import, webhooks, and credit notes for refunds.
- [ ] Update mocks in `test/zoho.test.js` to real response samples.

## IRS and tax data (`lib/accounting.js`)

- [ ] Standard mileage rate (72.5 cents for 2026 confirmed via search of IRS Notice 2026-10; check each January). Find where the rate is set in the accounting defaults.
- [ ] Deadlines in `deadlines(y)`: confirm against the IRS "Tax calendar" and Pub 509 each year (W-2 and 1099-NEC, 940/941, 1065 and 1120-S, estimated tax dates, Form 7004 and 4868 extensions). Weekend and holiday rolling is simplified: Washington DC Emancipation Day (Apr 15-ish) and other federal holidays are not handled.
- [ ] 1099-NEC / W-9 threshold ($2,000 from 2026) and 1099-K rules.
- [ ] Default rates in `DEFAULTS`: income tax %, payroll tax 7.65%, self-employment tax, Social Security wage base, Section 179 and bonus depreciation, meals deduction percent.
- [ ] State requirements per state of operation (sales tax on remodeling, contractor licensing, state payroll and unemployment filings, workers' comp). The system only prepares records; a CPA should review.
- [ ] Legal document templates in `lib/estimating.js` (`documentTemplates`): have an attorney review; check state lien-waiver and home-improvement-contract rules (3-day right of cancel, written-contract thresholds, lead-safe renovation (EPA RRP) disclosures for pre-1978 homes).

## Estimator data (`lib/labor.js`, `lib/bathroom.js`, `lib/seed.js`, `lib/estimating.js`)

- [ ] Re-check labor-time sources (RSMeans, NAHB, Craftsman National Estimator, manufacturer install guides) and refresh the times; the 8 percent cushion is applied on top.
- [ ] Refresh material and fixture prices in `lib/seed.js` (they are dated; check current retail) and any regional labor-rate defaults.
- [ ] Tolls and travel: current toll rates for the service area (I-PASS / Illinois Tollway), IRS mileage, truck-rental and dumpster pricing (U-Haul, Home Depot, local haulers), disposal and landfill fees.
- [ ] Code requirements used in the playbooks (IRC / local plumbing and electrical, GFCI, ventilation CFM, waterproofing standards such as TCNA and ANSI A118) and permit requirements for the service area.

## Holidays and email (`lib/company.js`, `lib/emails.js`)

- [ ] Holiday dates (Easter, Hanukkah, Thanksgiving and so on) computed by formula; spot-check each year against an official calendar. Lunar and Jewish holiday dates are the riskiest.
- [ ] CAN-SPAM and state marketing-email rules (physical address, unsubscribe within 10 business days, state laws), plus provider rules (Gmail and Yahoo bulk-sender requirements: SPF, DKIM, DMARC, one-click unsubscribe `List-Unsubscribe-Post`).

## Platform and dependencies

- [ ] Check for newer versions of Bootstrap (currently 5.3.9), Node LTS (`node:sqlite` is still experimental in some versions), and other dependencies; run `npm audit`.
- [ ] Re-check browser and web best practices used in the site: CSP, Core Web Vitals, PWA / service-worker caching, structured data and OG images, accessibility (WCAG 2.2 AA).
- [ ] Mobile geolocation, background-tracking limits and permission rules for iOS and Android browsers (the GPS clock-in system) and privacy law on employee location tracking per state.
- [ ] Browser checks that were never run visually: new estimator logistics card, employee job plan, mobile hamburger menu, dark mode, and the Zoho admin page.

## Whole-repository scan (added 2026-11-24): where each item lives

Full scan of every source file for hardcoded, time-sensitive or externally sourced data.

### Cited statistics in public content (verify the figures, years and wording; fix or add current links)
- [ ] `content.js` (about lines 91-114), `lib/seed.js` (about lines 21-113) and `lib/seed-extra.js` (about lines 65-216): Angi 2026 averages (about $12,200, 28,000+ projects, per-room and per-fixture tables), Remodeling Magazine Cost vs. Value (midrange about $26,000, 74-80% recouped), NKBA 2025 and 2026 Bath Trends figures (96% neutrals, 55% and 57% claims, cabinetry 18% and fixtures 17% budget split), Illinois Realtors Chicago-area median (about $400,000, spring 2026) and DuPage County numbers. Each should link to its primary source and carry an "as of" date.
- [ ] `build.js` line 77: Wikipedia link for Chicago; check the service-area facts on city pages.
- [ ] `site.json` and `content.js` business details (domain, phone, address, service areas, license, insurance, reviews, years in business): confirm they are accurate and current.

### Estimator pricing and rates (replace estimates with current local quotes)
- [ ] `lib/logistics.js` lines 26-36: truck rental ($135 per day), street permit ($75), dumpsters 10/15/20/30 yard ($425-$695), overage ($85 per ton), haul labor ($65 per hour), transfer-station fee ($75). Get current Chicago-area hauler and rental quotes.
- [ ] `lib/seed.js`, `lib/seed-extra.js`, `lib/bathroom.js`, `lib/handyman.js`, `lib/tools.js`: price book, fixture and material prices, handyman task prices and hours, tool rental or purchase costs.
- [ ] `lib/labor-times.js` `SOURCES` (14 third-party URLs: BuildMetricLab, Profound Estimates, TileProCalculator, ClampPro, Zack of All Trades, HomeRenoCalc, One and Done Prep, SimplyWise (PHCC), HQ Plumbing, NECA, FieldBidTools, PILARS, Ketterly, yours-tim): check that each link works and says what we use. Replace blog sources with primary sources where possible (RSMeans, NECA MLU, PHCC, NAHB). Revisit the `SMALL_JOB` 1.67 factor and the 8% `CUSHION`.
- [ ] `lib/install-details.js`, `lib/crew-roles.js`, `lib/playbook.js`: step, crew and duration assumptions; check against manufacturer install guides (Schluter, Kerdi, Delta, Moen, Kohler, American Standard, Toto).
- [ ] `lib/estimating.js` `DEFAULT_SETTINGS`: markup, tax %, deposit %, contingency %, and the tax rate for Illinois and local sales tax on materials (remodeling is often taxed differently from retail; confirm with the Illinois Department of Revenue).
- [ ] Default hourly rates and worker-pay rules (`lib/staff.js`, `lib/accounting.js`): Illinois and Chicago minimum wage, overtime, break, paid leave (Paid Leave for All Workers, Chicago Paid Leave and Paid Sick Leave), and worker classification (employee vs. 1099) tests.

### Permits, codes and compliance
- [ ] `lib/codes.js`: statewide Illinois rules (77 Ill. Adm. Code 890, Energy Conservation Code, EPA RRP, asbestos NESHAP) and every city entry marked `verified: false` (Chicago, Aurora, Naperville, Joliet and others). Only Chicago has a URL; find official department pages, permit fees and adopted code editions for all of them, then set `verified: true`.
- [ ] `lib/accounting.js`: `DEFAULTS` (`mileage_rate` 0.725 confirmed for 2026, `income_tax_pct`, `payroll_tax_pct` 7.65, state `IL`), the `deadlines(y)` list, the `REQUIRED_DOCS` checklist (licenses, insurance, bonds, registrations), and `DOC_KINDS`. Add Illinois-specific items: IDOR, IDES unemployment, Illinois workers' compensation, and the Chicago business license.
- [ ] `lib/emails.js`, `lib/company.js`: holiday list and dates, unsubscribe handling, required footer address, send hour (9) and `BUSINESS_TZ`.
- [ ] `documentTemplates` in `lib/estimating.js`: contract, change order, lien waiver, completion and warranty text. Needs Illinois attorney review (Home Repair and Remodeling Act: written contract and disclosure rules, 3-day cancellation, Illinois Mechanics Lien Act waiver forms).
- [ ] Privacy and location: `lib/tracking.js` (retention 400 days by `LOCATION_RETENTION_DAYS`, geofence radius, off-site auto-clock-out grace period). Check Illinois law on employee location tracking (disclosure and consent) and wage-and-hour rules on auto clock-out, and re-check the site privacy policy and terms text in `content.js`.

### Third-party integrations (check current API versions, models, limits and auth)
- [ ] `lib/vision.js` line 58: default AI model `gpt-4.1` and the OpenAI-compatible chat API shape (`response_format`, image input); choose the current best vision model and re-check pricing and limits.
- [ ] `lib/mailer.js`: Resend send and receive endpoints, inbound email API and webhook signature; check current docs and rate limits.
- [ ] `lib/estimates.js` line 709: Stripe Checkout Sessions API (`/v1/checkout/sessions`) request fields and API version pinning; check webhook handling and current Checkout best practices.
- [ ] `lib/gcal.js`: Google Calendar API v3 and the service-account OAuth flow; `lib/ical.js`: Google "add to calendar" URL parameters.
- [ ] `lib/zoho.js`: see the Zoho section above.

### Dependencies, platform and front-end
- [ ] `package.json`: `bootstrap` ^5.3.9, `@fontsource-variable/inter` ^5.3.0, `engines.node >=20` (the code uses `node:sqlite`, which needs a recent Node; confirm the minimum version and its stability status). Run `npm outdated` and `npm audit`.
- [ ] `build.js`, `assets/sw.js`, `server.js`: CSP, security headers, caching and service-worker strategy, sitemap and structured-data (JSON-LD) types, Open Graph tags, and Core Web Vitals, against current guidance.
- [ ] Accessibility: run an automated and manual WCAG 2.2 AA pass on the public site, the admin portal and the employee portal.
- [ ] Browser and device testing that was not possible here: Safari and iOS geolocation and background behavior, Android Chrome, dark mode, the mobile menu, printing and PDF output.

## Public SEO pages (seo-content.js, build.js)
- [ ] Verify the cost planning ranges in `seo-content.js` against current Illinois pricing before relying on them.
- [ ] Add real local detail to each town page (housing age, local permit office, nearby landmarks); they currently reuse the county text plus town-specific FAQs.
- [ ] Add a real phone number and email in `site.json`; call buttons and the contact schema appear only when set.
- [ ] Add real photos and reviews (the before/after images are illustrations); submit the sitemap in Google Search Console and Bing Webmaster Tools.
- [ ] Add `sameAs` links (Google Business Profile, Facebook, Yelp) to the business schema once those profiles exist.

- Skills test question banks (`lib/skill-tests.js`): have a lead tradesperson in each trade review the questions and answers.
- Onboarding and training (`lib/training.js`, `lib/onboarding.js`): the lesson text, quiz answers and the starter employment agreement are general templates. Have the owner, a lead tradesperson and an attorney review them (the agreement, at-will terms, location consent and state wage rules). The W-4 and I-9 screens only collect answers to prepare the official forms; an accountant or attorney should confirm the process, I-9 document inspection within 3 business days, and record retention.

