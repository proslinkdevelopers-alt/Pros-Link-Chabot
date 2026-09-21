# =============================================================================
#  Pros-Link platform — production Dockerfile
#  Multi-stage build producing a lean Next.js standalone server.
# =============================================================================

# ---- 1. Dependencies -------------------------------------------------------
FROM node:22-alpine AS deps
RUN apk add --no-cache libc6-compat openssl
WORKDIR /app
COPY package.json package-lock.json* ./
COPY prisma ./prisma
# Install with a lockfile if present, otherwise a plain install.
RUN npm ci || npm install

# ---- 2. Build --------------------------------------------------------------
FROM node:22-alpine AS builder
RUN apk add --no-cache libc6-compat openssl
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
# Opts this build into `output: "standalone"` (see next.config.mjs). Only Docker
# wants it: the runner stage below copies .next/standalone/server.js. A managed
# host that runs `next start` must NOT get a standalone build, because Next
# refuses to serve one that way.
ENV DOCKER_BUILD=1
RUN npx prisma generate && npm run build

# ---- 3. Runner -------------------------------------------------------------
FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
RUN apk add --no-cache openssl \
  && addgroup --system --gid 1001 nodejs \
  && adduser --system --uid 1001 nextjs

# Copy the standalone server, static assets and prisma runtime.
COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /app/node_modules/@prisma/client ./node_modules/@prisma/client

USER nextjs
EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

CMD ["node", "server.js"]
