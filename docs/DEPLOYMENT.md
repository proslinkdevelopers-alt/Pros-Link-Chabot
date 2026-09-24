# Deployment guide — Pros-Link platform

Production URL: **https://ai.pros-link.com**. This guide covers the
environment, upgrading an existing database safely, Docker + Nginx, Hostinger
Business, a PM2 alternative, the go-live checklist and operations.

---

## 1. Prerequisites

- Node.js 20+ (or Docker)
- PostgreSQL 14+ — managed (Neon, Supabase) or containerised
- Redis — optional; recommended when running more than one instance
- A domain with TLS (Let's Encrypt or the host's certificate)
- For WhatsApp: a Meta app with the WhatsApp product and Pros-Link's business
  number

---

## 2. Environment

```bash
cp .env.example .env
```

`.env.example` documents every variable. For production:

- `APP_URL` and `NEXT_PUBLIC_APP_URL` = `https://ai.pros-link.com` — both must
  be present when `npm run build` runs, not only when the server starts. Next
  bakes `NEXT_PUBLIC_APP_URL` into the build, and the canonical URLs, sitemap,
  robots.txt and social previews come from it; a build without it points them
  all at `localhost`. The same goes for a build done in CI.
- `DATABASE_URL` and `DIRECT_DATABASE_URL` (the non-pooled URL `prisma migrate`
  uses — the same value unless your provider gives a separate direct URL).
- `JWT_SECRET` — `openssl rand -base64 48`. The server refuses to start in
  production with a missing, short or development secret.
- WhatsApp: `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_ACCESS_TOKEN`,
  `WHATSAPP_VERIFY_TOKEN`, `WHATSAPP_APP_SECRET`, and
  `WHATSAPP_BUSINESS_ACCOUNT_ID` for templates. (The short names
  `WHATSAPP_PHONE_ID`, `WHATSAPP_TOKEN`, `WHATSAPP_WABA_ID` also work.)
- `CRON_SECRET` to enable WhatsApp follow-ups.
- `SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD` for the first Super Admin.
- `REDIS_URL` if you run several instances (rate limits are otherwise
  per-process).

Contact details are **not** environment variables: enter them in
Admin ▸ Settings ▸ Company profile after the first sign-in.

Keep `.env` out of version control (it is in `.gitignore`).

---

## 3. Upgrading an existing database (the previous platform's)

This platform can run on the same PostgreSQL database as the platform it
replaced. The migrations are **additive only**: they add enum values, columns
and tables, and never drop, rename or rewrite existing data. Rows written by the
previous platform keep their department (or have none) and are invisible to
every Pros-Link page and API.

Do this in order:

1. **Back up first.** Take a full, restorable dump and copy it off the server:
   ```bash
   pg_dump --format=custom --no-owner "$DIRECT_DATABASE_URL" -f pre-proslink-$(date +%F).dump
   ```
   Test that it restores into a scratch database before continuing:
   ```bash
   createdb pre_proslink_check && pg_restore --no-owner -d pre_proslink_check pre-proslink-*.dump
   ```
2. **Apply the migrations:** `npx prisma migrate deploy`. The two Pros-Link
   migrations are `20260921090000_proslink_enum_values` (enum values, kept
   separate because PostgreSQL cannot use a new enum value in the transaction
   that adds it) and `20260921090100_proslink_platform`.
3. **Seed:** `npm run db:seed` — roles, the first Super Admin, categories,
   unverified brands and the starting knowledge base. It never deletes, never
   overwrites what staff have edited, and never touches another tenant's rows.
4. **Sign in and configure** (section 8).

What happens to the previous platform's data:

| Data | After the upgrade |
| --- | --- |
| Leads, customers, tickets, quotes, conversations, templates, contacts with another or no department | Kept, untouched, invisible in Pros-Link |
| Tables used only by the previous business (services, projects, portfolio, courses…) | Kept under `Legacy*` models; no code reads them |
| Staff accounts of the previous platform | Cannot sign in to Pros-Link |
| WhatsApp contacts without a department | Never included in Pros-Link broadcasts |

**Removing that data later** is a separate, deliberate decision for its owner —
nothing in this platform deletes it. If it must go: export it first
(`pg_dump --table=…` or `COPY (SELECT … WHERE department IS DISTINCT FROM 'PROSLINK') TO …`),
confirm the export with its owner, then delete by department in a transaction.
Never run a cleanup without a fresh, verified backup.

For a brand-new Pros-Link database, steps 2 and 3 are all you need.

---

## 4. Docker Compose

```bash
# .env must set POSTGRES_PASSWORD (the compose file refuses to start without it)
docker compose up -d --build
docker compose exec web npx prisma migrate deploy
docker compose exec web npm run db:seed          # first deploy only
docker compose logs -f web
```

This starts `proslink-db` (PostgreSQL), `proslink-redis` and `proslink-web` on
port 3000, with data in the `proslink_pgdata` and `proslink_redisdata` volumes.
Health check: `curl http://localhost:3000/api/health`.

> Moving an existing Docker install whose data lives in another volume? Point
> the `db` service at that volume (declare it `external: true` under
> `volumes:`) instead of starting on an empty one — and take the backup in
> section 3 first.

To update:

```bash
git pull
docker compose up -d --build web
docker compose exec web npx prisma migrate deploy
```

---

## 5. Nginx reverse proxy + TLS

`/etc/nginx/sites-available/proslink`:

```nginx
server {
    listen 80;
    server_name ai.pros-link.com;
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl http2;
    server_name ai.pros-link.com;

    ssl_certificate     /etc/letsencrypt/live/ai.pros-link.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/ai.pros-link.com/privkey.pem;

    client_max_body_size 15m;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

```bash
sudo ln -s /etc/nginx/sites-available/proslink /etc/nginx/sites-enabled/proslink
sudo nginx -t && sudo systemctl reload nginx
sudo certbot --nginx -d ai.pros-link.com
```

`X-Forwarded-For` must be passed through: rate limiting and the audit log
identify clients by it. The app already sets HSTS, X-Frame-Options and a CSP.

### WhatsApp webhook behind the proxy

The `location /` block serves `/webhook`. Two things must not be interfered
with:

- **The body must arrive byte-for-byte.** The `X-Hub-Signature-256` check is an
  HMAC over the raw bytes; anything that rewrites JSON bodies makes every
  delivery fail with `401`.
- **The `X-Hub-Signature-256` header must reach the app.**

Meta needs a public HTTPS endpoint with a valid certificate. Check it before
registering the callback in Meta:

```bash
curl "https://ai.pros-link.com/webhook?hub.mode=subscribe&hub.verify_token=$WHATSAPP_VERIFY_TOKEN&hub.challenge=ping"
# → ping
```

In Meta ▸ WhatsApp ▸ Configuration, set the callback URL
`https://ai.pros-link.com/webhook`, the same verify token, and subscribe to the
**messages** field. Admin ▸ WhatsApp shows the connection status.

---

## 6. Hostinger Business (shared hosting + Node.js)

Hostinger Business runs Node.js apps and deploys from GitHub, but its shared
plans offer MySQL only; PostgreSQL is VPS-only. Do not convert the schema to
MySQL — it relies on PostgreSQL features (scalar lists, enums, JSONB queries).
Use an external managed PostgreSQL instead:

```
ai.pros-link.com
   ├── App    →  Hostinger Business · Node.js app (GitHub deploy)
   ├── DB     →  Neon / Supabase (external PostgreSQL over TLS)
   └── Redis  →  optional; Upstash
```

1. **hPanel → Websites → Subdomain** — create `ai.pros-link.com`.
2. **hPanel → Advanced → Node.js** — create an app: Node **20+**, application
   root the subdomain's directory, startup `npm start`, connected to the
   repository and branch.
3. **Environment variables** in the app panel (section 2).
   > **Do not set `NODE_ENV=production` in the panel.** npm then skips
   > devDependencies during install (Tailwind, TypeScript, the Prisma CLI), and
   > the build fails. `scripts/build.mjs` and `next start` set it themselves;
   > the committed `.npmrc` (`include=dev`) also guards against it.
4. **Build** in the app shell. Shared plans are tight on memory:
   ```bash
   export LOW_MEMORY_BUILD=1
   export NODE_OPTIONS=--max-old-space-size=2048
   npm ci && npm run build
   ```
   `LOW_MEMORY_BUILD=1` generates pages in one in-process worker instead of one
   per CPU. If it still fails, build in CI and deploy the output.
5. **Migrate and seed** once — after the backup in section 3 if the database
   already has data:
   ```bash
   npx prisma migrate deploy
   npm run db:seed
   ```
6. **TLS** — enable the free SSL certificate for the subdomain in hPanel.

**If the build fails:** `Cannot find module 'tailwindcss'` means
devDependencies were skipped (remove `NODE_ENV=production`, or
`npm ci --include=dev`). `<Html> should not be imported outside of
pages/_document` is Next masking another crash in the build worker — on shared
hosting almost always memory; use step 4. The **Build** workflow in GitHub
Actions builds a clean checkout with no environment: green there and red on the
host means the host is the problem.

| Constraint | Impact | Mitigation |
| --- | --- | --- |
| No PostgreSQL | Database must be external | Neon / Supabase |
| Limited build memory | Build killed | `LOW_MEMORY_BUILD=1`, or build in CI |
| No Redis | Rate limits per process | Upstash, or run a single instance |
| Process restarts | Short caches rebuilt | None needed |

If several of these bite, move to a Hostinger VPS and use Docker Compose
(section 4).

---

## 7. Alternative — PM2

```bash
npm ci && npx prisma migrate deploy && npm run build
npm run db:seed        # first deploy only
pm2 start npm --name proslink-web -- start
pm2 save && pm2 startup
```

Running several instances (`-i max`)? Set `REDIS_URL` so rate limits are
shared. Catalogue, knowledge, company profile and assistant settings are cached
per process for 30–60 seconds; an edit is visible at once on the instance that
saved it and within that time on the others.

---

## 8. Go-live checklist

**Content — before announcing the assistant**

- [ ] **Settings ▸ Company profile**: phone, WhatsApp number, email, address,
      offices, hours, website and social links. Nothing is shown until entered.
- [ ] **Catalogue**: products with confirmed specifications and availability,
      published; categories reviewed; brands verified and activated only once
      the partnership is confirmed.
- [ ] **Knowledge Base**: every published entry is accurate; delete or archive
      anything that is not.
- [ ] **Chatbot Studio**: business hours, teams (inboxes and lead owners),
      wording; pricing stays empty unless Pros-Link decides to publish prices.
- [ ] **Team**: real staff accounts with the right roles.
- [ ] **WhatsApp**: callback registered, test message answered, templates
      synced (Admin ▸ WhatsApp ▸ Templates ▸ Sync).
- [ ] `CRON_SECRET` set and `/api/cron/follow-ups` scheduled every 15–30 minutes:
      `*/15 * * * * curl -fsS -H "Authorization: Bearer $CRON_SECRET" https://ai.pros-link.com/api/cron/follow-ups`
- [ ] Walk the simulator (website and WhatsApp): Hi → menus, Products, Request a
      Quote, Repair, Track My Request, "talk to a person", STOP — in English and
      Roman Urdu.

**Security**

- [ ] `JWT_SECRET` is a fresh random value; `.env` is not in the repository.
- [ ] The seeded Super Admin's password has been changed after first sign-in,
      or the account replaced.
- [ ] TLS is live and HTTP redirects to HTTPS.
- [ ] `REDIS_URL` set if more than one instance runs.

**Smoke test**

- [ ] `/chat` shows the Pros-Link welcome and the ten main-menu options.
- [ ] A quote request through the assistant appears in Admin ▸ Quote Requests
      and Leads, with a notification.
- [ ] A repair request creates a ticket in Admin ▸ Service Tickets.
- [ ] Tracking that ticket with its reference and phone number shows its status.
- [ ] `curl https://ai.pros-link.com/api/health` returns `"status":"healthy"`.

---

## 9. Operations

- **Backups:** nightly `pg_dump` with off-site copies; test a restore
  periodically. Always back up before `migrate deploy`.
- **Migrations:** `npx prisma migrate deploy` only — never `migrate dev` in
  production.
- **Health:** poll `/api/health`; alert on `503`.
- **Audit:** Admin ▸ Audit Log (table `system_logs`) — every change with before
  and after values, sign-ins and refused attempts.
- **Email notifications:** new leads, quote requests and tickets queue rows in
  `notifications` with `channel = EMAIL` and `status = QUEUED` for the team
  inbox. **This app does not include a mail sender.** To deliver them, run a
  small worker (or a scheduled job) that reads queued email rows, sends them
  with the `SMTP_*` settings, and marks them `SENT` or `FAILED`. In-app
  notifications (the bell) work without it.
- **Logs:** ship process or container logs to your logging stack; WhatsApp send
  failures are also recorded in the audit log (`whatsapp.send.failed`).
