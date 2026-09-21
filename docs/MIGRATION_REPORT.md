# Migration report — from the inherited platform to Pros-Link

Branch `proslink-migration`, from the audit (`d576ef6`) to the WhatsApp work
(`6730251`) plus the final documentation and cleanup commit. Nothing has been
pushed: the repository's `origin` points at the previous owner's GitHub
repository, so the branch stays local until Pros-Link chooses where it lives.

The previous implementation is intact in the git history (every commit before
`d576ef6`, and `main`). Its data is intact in the database (section 4).

---

## 1. Architecture

Unchanged in shape: one Next.js 15 app (public site, web assistant, WhatsApp
webhook, admin console) on PostgreSQL via Prisma, optional Redis. What changed
inside it:

- **Brand configuration in one place** (`src/config/brand.ts`) — name,
  tagline, business areas, colours, assistant and console names, reference
  prefix `PL-`, tenant key `PROSLINK`.
- **Strict tenancy.** Every write stamps `department = PROSLINK`; every read
  filters on it by equality. Rows of the previous business (another department
  or none) are invisible and unreachable, including by id.
- **One conversation engine for website and WhatsApp**, driven by
  configuration editable in Chatbot Studio, with a shared CRM runtime.
- **Company profile, catalogue and knowledge base in the database**, editable
  in the console, read by the site and the assistant.
- **Server-side RBAC** with six roles, checked on every page and API call.

Details: [ARCHITECTURE.md](ARCHITECTURE.md).

## 2. Removed

- The previous business's identity everywhere: names, logo, palette
  (`#050816`, `#00D9FF`, `#7C3AED`), Montserrat, phone numbers, email
  addresses, domain, Google Search Console verification file, demo accounts,
  Docker names, environment defaults, package name, comments and docs. A
  repository-wide search for the old names, numbers and colours finds nothing
  outside `docs/MIGRATION_PLAN.md` (the audit) and one test that asserts they
  stay gone.
- The previous assistant's content: marketing-agency services, pricing,
  menus, flows, knowledge base, sales copy, course and admissions references.
- Public self-registration (`/api/auth/register`).
- Console pages built for the previous business (portfolio, projects, events,
  services catalogue, AI-training, media, the old CRM, follow-ups, logs,
  integrations and user pages) — replaced by the new console. Old console
  URLs redirect to their replacements.
- Broadcast opt-in for contacts from before the platform.

## 3. Added

- **Public site** in the Pros-Link identity (navy, white, professional blue;
  Plus Jakarta Sans), with categories from the catalogue, services, contact
  from the company profile, SEO metadata, Open Graph image, `llms.txt`.
- **Pros-Link Assistant** on the website and WhatsApp (section 6).
- **Admin console** rebuilt (section 7): dashboard, unified inbox, leads,
  pipeline, quote requests, customers with machines, appointments, service
  tickets, support, catalogue CMS, knowledge base, Chatbot Studio, WhatsApp hub,
  templates, broadcasts, reports with CSV export, assistant analytics, audit
  log, team with role matrix, settings, notifications, Ctrl+K search.
- **Data model** for catalogue, customer assets, richer tickets, quotes and
  conversations (section 4).
- Seed for roles, the first Super Admin, 7 categories, 3 unverified brands and
  30 starting knowledge entries.

## 4. Database

Two **additive** migrations; nothing dropped, renamed or rewritten:

- `20260921090000_proslink_enum_values` — `PROSLINK` department; roles
  `SALES`, `SUPPORT`, `TECHNICIAN`, `VIEWER`; lead stages `QUOTE_REQUESTED`,
  `QUOTED`; ticket statuses `ASSIGNED`, `TECHNICIAN_DISPATCHED`; ticket
  categories `INSTALLATION`, `MAINTENANCE`, `REPAIR`, `SERVICE`, `PARTS`,
  `CALLBACK`; quote status `REQUESTED`; appointment modes `SITE_VISIT`,
  `PHONE_CALL`; activity types `ASSIGNMENT`, `STATUS_CHANGE`. (Separate
  because PostgreSQL cannot use an enum value in the transaction that adds it.)
- `20260921090100_proslink_platform` — tables `product_categories`, `brands`,
  `products`, `customer_assets`; new columns on leads, customers, quotes,
  tickets, conversations, messages, knowledge and events (department, catalogue
  links, machine details, attachments, assignment, tags, read state, media).

Verified on a fresh database and on a copy of the previous schema holding the
previous business's rows: migrations apply, `prisma migrate diff` reports no
drift, the old rows are unchanged, and the seed runs alongside them.

Data strategy: back up, migrate, seed; the previous business's data stays in
place, hidden; any later removal is its owner's decision, after export and a
fresh backup ([DEPLOYMENT.md](DEPLOYMENT.md), section 3).

## 5. API

Public: `/api/chat` (web assistant turns), `/api/chat/messages` (staff replies
for a web thread), `/api/catalog`, `/api/search`, `/api/leads` and
`/api/tickets` (website forms), `/api/health`, `/webhook`,
`/api/cron/follow-ups`, `/api/auth/login|logout`. Console: record updates,
creates, catalogue, knowledge, team, settings, conversations
(reply/assign/tag/close/convert), activities, notifications, search, reports
export, WhatsApp media, templates, broadcasts, Chatbot Studio, simulator.
Every console route checks its permission on the server, validates with Zod,
stays inside the tenant and writes the audit log. Reference:
[API.md](API.md).

## 6. Chatbot

- Main menu: Products · Request a Quote · Installation & Support · Repair /
  Maintenance · Office Supplies · Talk to Sales · Customer Support · Track My
  Request · About Pros-Link · Contact Pros-Link. Free text works everywhere.
- Flows: quote (the brief's fields; confirms "Thank you. Your request has been
  submitted to Pros-Link."), installation, service/repair/maintenance/technical
  (machine, brand, model, serial, urgency, visit, photo on WhatsApp), parts,
  support/complaint/callback, callback lead, demonstration, corporate brief,
  request tracking (reference + the phone that raised it).
- Catalogue browsing from the database; published products only; brands only
  when verified; empty categories offer a quote instead of invented products.
- English, Roman Urdu and Urdu detection and wording; plural and fault-phrase
  aware keyword routing; handover to six teams; corporate mode; lead scoring.
- **Never invents:** contact details only from the company profile, prices only
  if published (none by default), specifications only from the catalogue; a
  request is confirmed only once saved.

## 7. Admin

Navigation per the brief. Highlights: unified inbox with the brief's filters
(all/unread/assigned to me/waiting for the team/new leads/sales/support/closed),
reply, assign, tag, note, close, create lead/quote/ticket; pipeline
NEW → CONTACTED → QUALIFIED → QUOTE REQUESTED → QUOTED → NEGOTIATION → WON/LOST
with drag and drop and a keyboard fallback; customer profiles with timeline and
machines; ticket statuses New/Assigned/In Progress/Waiting for
Customer/Technician Dispatched/Resolved/Closed; dashboard and reports with
validated chart colours, table views and CSV export; audit log with before and
after values; team management (Super Admin only) with self-lockout and
last-Super-Admin protection.

## 8. WhatsApp

Cloud API integration preserved and extended: signed-webhook verification,
idempotent processing, same engine as the website, 24-hour window handling,
STOP/START opt-out, attribution, follow-ups, templates (synced templates now
belong to Pros-Link), broadcasts limited to Pros-Link contacts, server-side media
relay for staff, Meta's variable names accepted
(`WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_ACCESS_TOKEN`,
`WHATSAPP_BUSINESS_ACCOUNT_ID`) alongside the old ones, WhatsApp hub page.

## 9. Security

Fixed from the audit: public registration removed; roles enforced on the server
for every page and API (previously largely UI-level); session re-validated
against the database on every request (deactivation is immediate); sign-in
throttled per IP and per account with generic errors; production refuses a
weak `JWT_SECRET`; same-origin check on console writes; CSP and security
headers; tenant isolation on every query; strict Zod schemas; https-only
catalogue media; CSV exports neutralise spreadsheet formulas; media relay
permission-checked; audit trail for sign-ins, refusals and every change.

## 10. Testing

What was run, and passed, on the final code:

| Suite | Result |
| --- | --- |
| `npm test` — conversation engine and units (menus, catalogue, every flow, tracking, handover, corporate, pricing, opt-out, languages, save failures, detection, scoring, rendering) | 102 / 102 |
| `npx tsc --noEmit` | clean |
| `npm run build` | passes |
| Live, web assistant against a local database: welcome, catalogue, full quote flow with DB checks (lead, quote, customer, transcript, events, notifications), repair ticket, tracking with correct and wrong phone, staff reply reaching the visitor | 26 / 26 |
| Live, console: catalogue CRUD and publishing rules, audit before/after, leads, pipeline, quotes and totals, customers and duplicates, machines, tickets and technician limits, conversations and convert, knowledge, team (create, deactivate, self-demotion, weak password), settings, notifications, search scoping, CSV export, 39 pages render for Super Admin, technician pages, redirects | 57 / 57 |
| Live, WhatsApp webhook with HMAC-signed payloads: verification, unsigned and forged refusals, inbound text, contact and conversation records, welcome in transcript, failed outbound logged, retry idempotency, list reply starts a flow, photo media id, STOP/START, status update | 15 / 15 |
| Live, security: sign-in, throttling, inactive and foreign accounts, removed registration, role checks by URL and API, cross-site refusal, headers | 24 / 24 |
| Upgrade of a database holding the previous business's rows | no drift; rows preserved |
| Visual checks (desktop and phone width) of dashboard, leads, pipeline, conversation, product editor, reports | reviewed; issues found were fixed |

The live suites are scratch scripts run against a throwaway local PostgreSQL;
they are not part of the repository.

## 11. Remaining issues

Things that are not done or could not be verified — none is hidden behind a
"works" claim:

1. **AI answers were not tested live** — no provider key was available. The
   engine's model path is covered by tests with a fake model, and the
   no-model fallback was tested live. Set a key and walk the simulator.
2. **WhatsApp sending was not tested with a real number** — Meta rejected the
   placeholder token as expected; everything up to that call, and its failure
   logging, was tested. Connect Pros-Link's number and send a test message.
3. **Email notifications are queued but not sent** — the app writes email rows
   to `notifications`; no mail sender is included. In-app notifications work.
   A small SMTP worker is needed if email is wanted.
4. **Business content is intentionally empty** until Pros-Link enters it:
   company contact details, products and specifications, brand verification
   (Rongda, Sindoh and Janibis are seeded unverified and hidden), prices,
   references and reviews. The starting knowledge entries should be reviewed
   before relying on them.
5. **Per-instance caches** (30–60 s) for catalogue, knowledge, company profile
   and assistant settings; with several instances, edits reach the others
   within that time. Rate limits are per-instance without Redis.
6. `/api/health` reports the AI provider and model name publicly — harmless but
   could be trimmed.
7. The Edge build prints a warning from the `jose` library's unused JWE
   compression path; it does not affect behaviour.
8. The previous business's data remains in the shared database by design; its
   export or removal is for its owner to decide.
9. The admin console is light-theme only.
10. Branch not pushed (see top).

## 12. Environment variables

Required: `DATABASE_URL`, `DIRECT_DATABASE_URL`, `JWT_SECRET` (32+ chars in
production), `APP_URL`, `NEXT_PUBLIC_APP_URL` (both `https://ai.pros-link.com`,
set before building). First run: `SEED_ADMIN_EMAIL`, `SEED_ADMIN_PASSWORD`.
WhatsApp: `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_ACCESS_TOKEN`,
`WHATSAPP_VERIFY_TOKEN`, `WHATSAPP_APP_SECRET`,
`WHATSAPP_BUSINESS_ACCOUNT_ID`. Optional: `AI_PROVIDER` + key, `REDIS_URL`,
`CRON_SECRET`, `SMTP_*` / `SALES_NOTIFY_EMAIL` (for a mail worker),
`NEXT_PUBLIC_BRAND_LOGO_URL`, `NEXT_PUBLIC_CREDIT_*`, `LOW_MEMORY_BUILD`.
Every variable is documented in `.env.example`. Contact details are not
environment variables — they live in Admin ▸ Settings.

## 13. Deployment

1. Back up the database (`pg_dump`), and test the restore.
2. Set the environment (section 12) on the host.
3. `npm ci && npm run build`.
4. `npx prisma migrate deploy` then `npm run db:seed`.
5. Start (`npm start`, PM2 or Docker Compose), put it behind TLS at
   `https://ai.pros-link.com`.
6. Register `https://ai.pros-link.com/webhook` in Meta with the verify token;
   subscribe to `messages`.
7. Sign in as the seeded Super Admin, change the password, then fill the
   company profile, catalogue, brands, knowledge and team, and run the go-live
   checklist.

Full guide, including Hostinger Business and Docker: [DEPLOYMENT.md](DEPLOYMENT.md).
