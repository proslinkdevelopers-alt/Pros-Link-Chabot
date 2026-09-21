/**
 * Shared hosting gives the build very little memory. Next parallelises page
 * generation across one worker per CPU, and each worker holds its own copy of
 * the compiler — which is what gets a build OOM-killed on a small shared-hosting
 * plan. A killed worker is not reported as "out of memory": Next falls back to
 * the pages-router error document and fails with "<Html> should not be imported
 * outside of pages/_document" while prerendering /404, which sends you looking
 * for an import that does not exist.
 *
 * Set LOW_MEMORY_BUILD=1 on such a host to serialise the build instead. It is
 * slower and it is not the default, because CI and VPS builds should stay fast.
 */
const lowMemory = /^(1|true|yes)$/i.test(process.env.LOW_MEMORY_BUILD ?? "");

/**
 * Standalone output exists for Docker: it emits `.next/standalone/server.js`
 * with its own trimmed node_modules, which the Dockerfile copies into a lean
 * runtime image alongside `.next/static` and `public`.
 *
 * It must NOT be produced for a platform that starts the app with `next start`
 * — Next refuses the combination outright:
 *
 *   ⚠ "next start" does not work with "output: standalone" configuration.
 *     Use "node .next/standalone/server.js" instead.
 *
 * A managed host running the default start command therefore gets a build it
 * cannot serve, and the app never comes up. So standalone is opt-in, set by the
 * Dockerfile, and every other build is a plain Next build that `next start`
 * serves normally.
 */
const standalone = /^(1|true|yes)$/i.test(process.env.DOCKER_BUILD ?? "");

/**
 * Content-Security-Policy, production only (the dev server needs eval). Scripts
 * and styles come from this origin only — Next's hydration needs inline — and
 * nothing may frame the site. Images may come from any https host because
 * product photos and logos are entered as URLs in the console.
 */
const isProd = process.env.NODE_ENV === "production";
const csp = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https:",
  "font-src 'self' data:",
  "connect-src 'self'",
  "media-src 'self' blob:",
  "frame-ancestors 'self'",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
].join("; ");

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  ...(standalone ? { output: "standalone" } : {}),
  poweredByHeader: false,
  ...(lowMemory
    ? {
        experimental: {
          // One page-generation worker, in-process, instead of one per core.
          cpus: 1,
          workerThreads: false,
        },
      }
    : {}),
  // Keep server-only packages out of the client/edge bundle (Next 15 top-level key).
  serverExternalPackages: ["@prisma/client", "@anthropic-ai/sdk", "ioredis"],
  async rewrites() {
    return [
      // The WhatsApp callback URL registered with Meta is the short, public
      // `/webhook` — but the handler lives with the other route handlers under
      // `/api/whatsapp/webhook`. A rewrite serves both without duplicating it,
      // and without a redirect: Meta does not follow 3xx on webhook delivery,
      // so the callback path has to answer 200 itself.
      { source: "/webhook", destination: "/api/whatsapp/webhook" },
    ];
  },
  async headers() {
    // Baseline security headers. Nginx may add/override in production.
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          // Browsers ignore HSTS on plain-http responses, so local dev is unaffected.
          { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(self), geolocation=(self)" },
          ...(isProd ? [{ key: "Content-Security-Policy", value: csp }] : []),
        ],
      },
    ];
  },
};

export default nextConfig;
