# Pros-Link migration — audit and plan

Internal working document. It records what the inherited codebase is, what is
reusable, what is specific to the business it was built for (BITSOL Marketing),
and the order in which the platform is converted into the Pros-Link Customer
Service, Sales & CRM platform. This is one of the two documents in the
repository that are allowed to name the previous business; the other is
`MIGRATION_REPORT.md`.

---

## 1. Audit

### Architecture

| Layer | What exists | Verdict |
| --- | --- | --- |
| Frontend | Next.js 15 App Router, React 19, Tailwind 3, shadcn-style primitives, lucide icons, framer-motion (menu drawer only) | Reuse |
| Backend | Route handlers on the Node runtime in the same app | Reuse |
| Database | PostgreSQL via Prisma 6.19; 4 hand-written, additive migrations | Reuse; add migrations only |
| Cache | Optional Redis (ioredis) for fixed-window rate limits, fails open | Reuse |
| Auth | JWT (jose, HS256) in an httpOnly cookie, bcrypt; edge middleware + `requireAdmin()` | Reuse, harden |
| Chatbot engine | `lib/bot/engine.ts` — config-driven menus, flows, intents, scoring, handover, follow-ups; a `BotRuntime` abstracts I/O; 76 unit tests | Reuse; replace content, extend actions |
| AI | Provider-agnostic `AIProvider` (Claude, OpenAI-compatible, Ollama, Gemini), knowledge retrieval, JSON detail extraction with anti-hallucination validation | Reuse; replace knowledge and prompt |
| Web chat | `/api/chat` SSE stream of free-form AI answers, no menus or flows | Rebuild on the shared engine |
| WhatsApp | Cloud API client, signed webhook, idempotent inbound handling, templates, broadcasts, delivery receipts | Reuse; rebrand, add media capture |
| CRM | Leads, customers, quotes, tickets, meetings, activities, follow-ups board | Reuse and extend |
| Admin | ~35 server-component pages, read-mostly; Users/Roles/Settings are read-only | Extend |
| Notifications | `notifications` queue rows (email) + `system_logs` audit | Extend with in-app notifications |

### Database

* **Reusable:** users, roles, permissions, conversations, messages, marketing_leads,
  customers, quotes, tickets, meetings, crm_activities, notifications, settings,
  system_logs, whatsapp_contacts, whatsapp_templates, broadcasts,
  broadcast_recipients, bot_events, knowledge_base_marketing, media_assets.
* **Specific to the previous business, unused by Pros-Link:** marketing_services,
  projects, portfolio_items, reviews, events, announcements, and the retired
  education tables (courses, admissions, students, faculty, batches, enrollments,
  attendance, assignments, submissions, certificates, knowledge_base_institute).
* **Tenant separation already exists:** most shared tables carry a `department`
  column and every console query filters on it. Several tables Pros-Link needs
  (leads, customers, quotes, knowledge, bot events) have no such column.
* **Seed data:** business-specific services, knowledge, company settings,
  template drafts, an announcement and an event.

### API routes

| Route | Purpose | Auth today | Decision |
| --- | --- | --- | --- |
| `POST /api/chat` | Web assistant (SSE) | Public, rate-limited | Rebuild on the engine (menus, flows, CRM effects) |
| `GET/POST /api/whatsapp/webhook` | Meta webhook | Verify token + HMAC signature | Keep; add media capture |
| `GET /api/cron/follow-ups` | Follow-up scheduler | Bearer secret, timing-safe | Keep |
| `POST /api/auth/login` | Staff sign-in | Public | Keep; add throttling, audit, DB-verified tenancy |
| `POST /api/auth/logout` | Sign-out | — | Keep |
| `POST /api/auth/register` | Open public sign-up issuing a session | **Public** | **Remove** — a staff console has no self-registration |
| `POST /api/leads`, `POST /api/tickets` | Website form submissions | Public, rate-limited | Keep; Pros-Link fields |
| `POST /api/meetings` | Consultation form | Public | Remove (consultation booking was the previous business's model) |
| `GET /api/catalog` | Service catalogue | Public | Replace with published products and categories |
| `GET /api/search` | Knowledge search | Public | Keep; read published entries from the database |
| `GET /api/health` | Health | Public | Keep |
| `PATCH /api/admin/[entity]/[id]` | Inline status edits | **Staff only, no permission check** | Keep; per-entity permissions, row scoping, before/after audit |
| `POST/PATCH /api/admin/activities` | Notes and follow-ups | **Staff only** | Add permission checks |
| `/api/admin/broadcasts*`, `/api/admin/templates*` | Messaging | **Staff only** | Add permission checks |
| `/api/admin/bot-config/*`, `/api/admin/bot/simulate` | Chatbot Studio | `settings.manage` | Keep |
| `/api/admin/conversations/*` | Take-over, reply | `conversations.view` | Split into view / reply / assign |

### Security findings

1. Admin **pages** check only "is staff"; permissions merely hide nav items, so any
   agent can open Users, Settings or System Logs by URL.
2. Several admin **APIs** check only "is staff".
3. `POST /api/auth/register` is an open public sign-up.
4. Sign-in has no brute-force throttling and is not audited.
5. `JWT_SECRET` silently falls back to a published default, in production too.
6. Role and active status are read from the 7-day JWT, so deactivating or
   demoting someone takes effect only when their token expires.
7. Accounts with a null `department` pass the tenancy check.
8. Knowledge edited in the console never reaches the assistant (it reads a static file).

### Business-specific content to remove

Brand profile, product branding and developer attribution; logo and palette;
service catalogue, knowledge base and chat menus; WhatsApp menu tree, 30 intents,
9 flows, teams, pricing, proof sections, broadcast categories; system prompt scope
rules; seed data; SEO metadata, OG images, manifest, llms.txt, redirects; env
defaults, Docker names, package metadata, docs; test fixtures.

---

## 2. Decisions

1. **Dedicated database, strict tenancy as defence in depth.** Pros-Link is deployed
   on its own PostgreSQL database. In addition, `PROSLINK` becomes a `department`
   value; every record the app writes is stamped with it and every query filters
   on strict equality. If the app is ever pointed at a database holding the
   previous business's data, none of it is shown, and none of its accounts can
   sign in. Nothing is dropped, renamed or updated in place.
2. **Additive migrations only.** New enum values in one migration, new columns and
   tables in the next (PostgreSQL cannot use an enum value in the transaction that
   adds it). New `department` columns are nullable with no default, so rows
   written by any other application stay invisible. Historical migrations are
   left byte-for-byte unchanged.
3. **Prisma model names become neutral** (`Lead`, `KnowledgeArticle`) with `@@map`
   to the existing tables — a client-side rename with no database change.
4. **One brand configuration layer** (`src/config/brand.ts`) for identity, colours,
   assistant and console names, reference prefix. Contact details are **not
   invented**: they are empty until entered in Admin → Settings → Company profile,
   stored in the database and read by the site, the web assistant and WhatsApp.
5. **One conversation engine for both channels.** The web assistant runs the same
   engine as WhatsApp (menus, flows, catalogue, tracking, handover), so a quote
   request creates the same lead, quote request and notifications on either.
6. **Catalogue from the database.** Categories (supplied in the brief), brands and
   products are CMS records. No product, specification, price or availability is
   seeded. The three brands named in the brief are seeded **unverified and
   inactive**; the assistant never mentions a brand until staff verify it.
7. **Permissions are code-defined and enforced on the server.** Six roles (Super
   Admin, Admin, Sales, Support, Technician, Viewer) map to permission sets in one
   isomorphic module; pages, APIs and row-level scoping (technicians see only
   their assigned tickets) all read it. The user record is re-read from the
   database on every console request.

---

## 3. Phases

| # | Commit | Scope |
| --- | --- | --- |
| 1 | audit | This plan |
| 2 | database migration | Enums, tenant columns, catalogue, customer assets, conversation inbox fields, ticket service fields, quote requests |
| 3 | brand migration | Brand layer, company profile, design system, logo, public pages, metadata |
| 4 | security | Auth hardening, roles and permissions, page and API guards, audit log |
| 5 | chatbot migration | Pros-Link intents, teams, flows, menus, catalogue/track actions, knowledge, prompt, shared runtime, web assistant |
| 6 | product/service migration | Product, category and brand CMS; public catalogue API |
| 7 | CRM migration | Dashboard, inbox, leads, pipeline, customers, quote requests, tickets, team, reports, notifications, search |
| 8 | WhatsApp migration | Config, media capture, templates and broadcast rebrand |
| 9 | testing | Unit tests, build, end-to-end run against PostgreSQL |
| 10 | final cleanup | Contamination sweep, docs, `.env.example`, deployment guide, report |
