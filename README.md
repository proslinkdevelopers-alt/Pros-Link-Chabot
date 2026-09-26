# Pros-Link platform

The customer assistant, CRM and admin console for **Pros-Link** — _Your
Trusted Office Solutions Partner_. Pros-Link supplies digital duplicators,
photocopiers and MFPs, printers, office equipment, stationery and papers,
consumables and parts to businesses across Pakistan, with installation,
maintenance, repair and technical support.

- **Pros-Link Assistant** answers customers on the website (`/chat`) and on
  WhatsApp with the same menus, product catalogue and request flows: quotes,
  installation, service and repair tickets, parts, callbacks, demonstrations,
  corporate requirements and request tracking — in English, Roman Urdu and Urdu.
- **Pros-Link Admin** (`/admin`) is where the team works: a unified inbox for
  website and WhatsApp conversations, leads and a drag-and-drop sales pipeline,
  quote requests, customers with their machines, service tickets and support,
  appointments, the product catalogue, the assistant's knowledge base and
  wording, reports, team and roles, settings and a full audit log.

Production runs at **https://ai.pros-link.com**.

> The assistant never invents facts. Contact details come only from
> Admin ▸ Settings ▸ Company profile, products and specifications only from the
> catalogue, prices only from quotations the team prepares (or prices the team
> publishes in Chatbot Studio), and brands only once staff mark them verified.
> Anything not entered is simply not said — the customer is offered a
> quotation, a callback or a person instead.

---

## Quick start (local development)

Requirements: Node.js 20+, PostgreSQL 14+ (Redis optional).

```bash
npm ci
cp .env.example .env          # set DATABASE_URL, DIRECT_DATABASE_URL, JWT_SECRET,
                              # SEED_ADMIN_EMAIL and SEED_ADMIN_PASSWORD
npx prisma migrate deploy     # creates / upgrades the schema (additive only)
npm run db:seed               # roles, first Super Admin, categories, brands, knowledge
npm run dev                   # http://localhost:3000
```

Sign in at `/login` with the seeded Super Admin, then:

1. **Settings ▸ Company profile** — enter the phone, WhatsApp number, email,
   address, offices and hours. Until then the site and the assistant offer a
   callback instead of contact details.
2. **Catalogue ▸ Products** — add products with their confirmed
   specifications and publish them. Until then customers see the categories
   and are offered a quotation.
3. **Catalogue ▸ Brands** — verify and activate the brands Pros-Link carries.
4. **Team** — add staff with the right roles.
5. **Knowledge Base** — review the starting entries and publish only what is
   accurate.

The assistant works from its menus, catalogue views and request forms only.
A typed message it cannot route always gets the main menu, and after repeated
ones the menu also says how to reach a person.

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Development server |
| `npm run build` | `prisma generate` + production build |
| `npm start` | Serve the production build |
| `npm test` | Unit and conversation-engine tests (`node:test`) |
| `npm run typecheck` | TypeScript, no emit |
| `npx prisma migrate deploy` | Apply migrations (never `migrate dev` in production) |
| `npm run db:seed` | Idempotent seed — never deletes or overwrites staff edits |

## Roles

Access is checked on the server for every page and every API call — hiding a
menu item is a convenience, not the protection. The full matrix is in
Admin ▸ Team ▸ Roles and permissions, defined in `src/lib/permissions.ts`.

| Role | Can |
| --- | --- |
| Super Admin | Everything, including team, roles and settings |
| Admin | Everything except team and settings |
| Sales | Conversations, leads, pipeline, quotes, customers, appointments |
| Support | Conversations, service and support tickets, customers |
| Technician | Only the tickets assigned to them: status, resolution, notes |
| Viewer | Read-only across the console |

## Project structure

```
src/
  app/
    page.tsx, about/        Public site (catalogue categories, services, contact)
    (chat)/chat/            Web assistant
    (admin)/admin/          Admin console pages
    api/                    Route handlers (public, admin, WhatsApp webhook, cron)
  components/
    admin/                  Console shell, UI kit, CRM, catalogue, inbox, charts
    chat/                   Web assistant UI
  config/brand.ts           Name, tagline, colours, tenant key — one place
  data/
    bot/                    Default assistant configuration (menus, flows, copy)
    knowledge/              Starting knowledge base, by category
    catalog.ts              Starting categories and (unverified) brands
  lib/
    bot/                    Conversation engine, detection, scoring, runtimes
    ai/                     Customer details, knowledge retrieval
    whatsapp/               Cloud API client, webhook parsing, broadcasts
    admin/                  Console queries, labels, validation, metrics
    permissions.ts, staff.ts  Roles and server-side guards
prisma/
  schema.prisma             Data model
  migrations/               Additive migrations
  seed.ts                   Idempotent seed
docs/                       Architecture, API, deployment, assistant, migration
```

## Documentation

- [Architecture](docs/ARCHITECTURE.md) — how the pieces fit, tenancy, security
- [API](docs/API.md) — public and console endpoints
- [Deployment](docs/DEPLOYMENT.md) — environment, Docker, Hostinger, upgrading, backups
- [Assistant](docs/WHATSAPP_ASSISTANT.md) — menus, flows, languages, WhatsApp specifics
- [Migration report](docs/MIGRATION_REPORT.md) — what changed from the previous platform
- [Migration plan](docs/MIGRATION_PLAN.md) — the audit and plan the migration followed
