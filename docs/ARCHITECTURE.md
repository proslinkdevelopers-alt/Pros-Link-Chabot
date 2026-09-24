# Architecture — Pros-Link platform

One Next.js 15 application (App Router, React 19, TypeScript) serves the public
site, the web assistant, the WhatsApp webhook and the admin console, backed by
PostgreSQL through Prisma. Redis is optional (shared rate limits).

```
                ┌────────────── Next.js app ──────────────────────────────┐
 Website ──────▶│ /, /about           public pages (categories, services)  │
 visitor        │ /chat  ──▶ /api/chat ─┐                                   │
                │                       ├─▶ conversation engine ─┐          │
 WhatsApp ─────▶│ /webhook ─────────────┘   (lib/bot/engine.ts)  │          │
 (Meta Cloud)   │                                                ▼          │
                │                          CRM runtime (lib/bot/crm-runtime)│──▶ PostgreSQL
 Staff ────────▶│ /admin/*  ──▶ /api/admin/*  (permission-checked, audited) │
                │ /api/cron/follow-ups  (scheduled WhatsApp follow-ups)     │──▶ Meta Graph API
                └───────────────────────────────────────────────────────────┘
```

## 1. Brand and tenancy

`src/config/brand.ts` holds everything that identifies the business — name,
tagline, business areas, colours, the assistant's and console's names, the
reference prefix (`PL-`) and the tenant key `DEPARTMENT = "PROSLINK"`.

The database is shared with the platform this one replaced, whose rows are
kept, untouched, for their owners. Isolation is by the `department` column:

- every write stamps `department = PROSLINK`;
- every read filters on it with strict equality (`OWN` in
  `src/lib/admin/queries.ts`); a row with a different or NULL department is
  invisible to every page and every API, and loading one by id returns 404;
- settings keys are namespaced `proslink.*`; sessions carry the tenant and
  accounts of another tenant cannot sign in.

Tables that belonged only to the previous business are kept under `Legacy*`
models (same table names) and are not used by any code path.

## 2. The conversation engine

`src/lib/bot/engine.ts` takes one customer message and returns what to send
and which CRM effects to apply. It does no I/O itself; a `BotRuntime` does.
The same engine runs on:

| Surface | Runtime |
| --- | --- |
| WhatsApp webhook | `lib/whatsapp/handler.ts` → `lib/bot/whatsapp-runtime.ts` |
| Web assistant | `app/api/chat/route.ts` → `lib/bot/crm-runtime.ts` (collects replies) |
| Console simulator | `app/api/admin/bot/simulate` (read-only, nothing written) |
| Tests | `lib/bot/__tests__/harness.ts` (no network, no database) |

Order of precedence for a message: opt-out/opt-in (WhatsApp) → staff handling
the thread → photos and documents → button/list taps → "menu" and greetings →
frustration or a request for a person (handover) → corporate signals →
the open flow → typed requests (quote, service, tracking and callback
requests start flows; a product opens its catalogue, a recognised intent gets
its buttons and anything else the main menu).

Everything the assistant says and asks — menus, flows, wording in English /
Roman Urdu / Urdu, intents, teams, scoring, follow-ups — is configuration
(`src/data/bot`), editable per section in Admin ▸ Chatbot Studio and stored in
`settings` as `proslink.bot.<section>`. A stored section that no longer
validates is ignored with a warning, never crashing the assistant.

Deterministic keyword detection (`lib/bot/detect.ts`) decides what a message is
about and whether a ticket or quote is opened. There is no language model: the
assistant only ever sends configured menus, flows and messages.

**Honesty rules enforced in code:** contact details only from the company
profile; products, specifications and availability only from published
catalogue rows; brands only when verified and active; prices only from
published pricing entries (none by default); a request that fails to save is
never confirmed to the customer; tracking a request requires the phone number
that raised it.

## 3. CRM effects

`lib/bot/crm-runtime.ts` applies engine effects: lead create/update (with
score, temperature and stage), quote requests, service tickets (machine type,
brand, model, serial, priority, visit time, attachments), appointments,
handovers, team alerts, opt-in/out and transcript persistence. Every contact is
linked to one customer profile by phone number (last ten digits) or email
(`lib/customers.ts`). New records notify staff in-app (`lib/notify.ts`) —
everyone whose role can work that record, plus the assignee — and queue an
email row for the team inbox.

## 4. Catalogue, knowledge and company profile

| Data | Source | Cache |
| --- | --- | --- |
| Categories, products, verified brands | `product_categories`, `products`, `brands` | 30 s |
| Knowledge base | `knowledge_base_marketing` (published rows, tenant-scoped) | 60 s |
| Company profile | `settings` key `proslink.company` | 30 s |
| Assistant configuration | `settings` keys `proslink.bot.*` | 30 s |

Each cache is per server process and is cleared immediately on the instance
that saves a change. With several instances, others catch up within the cache
lifetime.

## 5. Admin console

Server components query Prisma directly; client components handle
interaction. Pieces:

- `components/admin/AdminShell.tsx` — sidebar from `nav.ts` (filtered by the
  role's permissions), Ctrl+K search (`/api/admin/search`), notifications bell,
  live counts per role.
- `components/admin/ui.tsx` — page header, tables, filters, detail lists,
  timeline, badges; `components/admin/client/*` — dialogs, toasts, inline
  selects, note composer, editors.
- `app/api/admin/[entity]/[id]` — one audited PATCH endpoint for leads,
  customers, tickets, quotes and appointments, with a strict Zod schema per
  entity, permission check before the record is loaded, technician
  restrictions, tenant checks on linked records, timeline entries and
  notifications.
- Dedicated routes for creates, the catalogue, knowledge, team, settings,
  conversations (assign, tag, close, convert to lead/quote/ticket, reply),
  notifications, search, exports and WhatsApp media.

## 6. Security model

- **Authentication:** email + bcrypt password; HttpOnly `pl_session` JWT
  (jose, HS256). Sign-in is throttled per IP and per account, with a generic
  failure message and a constant-time dummy hash for unknown emails.
- **Authorisation:** code-defined roles and permissions
  (`lib/permissions.ts`). `lib/staff.ts` re-reads the account from the
  database on every request, so deactivation and role changes take effect
  immediately. Pages use `requirePagePermission`, APIs
  `requireApiPermission` / `requireApiStaff`.
- **CSRF:** state-changing console requests must come from the same origin.
- **Validation:** Zod on every input; phone, email, URL (https only for
  catalogue media) and length limits; unique constraints reported per field.
- **Audit:** `system_logs` records actor, action, record, IP, and each changed
  field's previous and new value (Admin ▸ Audit Log). Passwords never reach it.
- **WhatsApp:** every webhook POST is verified with `X-Hub-Signature-256`;
  delivery retries are idempotent on Meta's message id; media is relayed
  server-side after a permission check, never exposing the token.
- **Headers:** CSP (production), HSTS, X-Frame-Options, nosniff,
  Referrer-Policy, Permissions-Policy.
- **Secrets** only in the environment; `JWT_SECRET` is required (32+ chars) in
  production.

## 7. Data model (main tables)

| Model | Purpose |
| --- | --- |
| `Lead` (`marketing_leads`) | Enquiries, pipeline stage, score, owner |
| `Customer`, `CustomerAsset` | One profile per contact; machines on site |
| `Quote` | Quote requests and quotations (line items entered by staff) |
| `Ticket` | Service and support requests, technician assignment |
| `Meeting` | Demonstrations, site visits, calls |
| `Conversation`, `Message` | Website and WhatsApp threads, media ids |
| `ProductCategory`, `Product`, `Brand` | Catalogue |
| `KnowledgeArticle` | Knowledge base |
| `CrmActivity` | Notes, calls, follow-ups, stage/status/assignment changes |
| `Notification` | In-app notifications and queued email rows |
| `SystemLog` | Audit log |
| `WhatsappContact`, `WhatsappTemplate`, `Broadcast` | WhatsApp messaging |
| `User`, `Role`, `Permission` | Staff accounts; roles mirrored from code |
| `Setting` | Company profile and assistant configuration |
