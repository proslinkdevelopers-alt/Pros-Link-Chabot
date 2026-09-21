"use client";

/**
 * Root error boundary.
 *
 * Catches failures in the root layout itself, which the per-route `error.tsx`
 * cannot. Because it replaces the whole document, it must render its own
 * <html> and <body> — that is a hard App Router requirement.
 *
 * Like `not-found.tsx`, defining this keeps `next build` from falling back to
 * the pages-router error document when prerendering /_error.
 *
 * Styling is inline: if the root layout failed, the stylesheet may not have
 * loaded either, and an error page that itself renders broken helps nobody.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: "100dvh",
          display: "grid",
          placeItems: "center",
          padding: "1.5rem",
          backgroundColor: "#0A1628",
          backgroundImage:
            "radial-gradient(900px 480px at 95% -10%, rgba(29,95,224,0.28), transparent 60%)",
          color: "white",
          fontFamily:
            'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
        }}
      >
        <div style={{ maxWidth: "28rem", textAlign: "center" }}>
          <h1 style={{ fontSize: "1.25rem", fontWeight: 600, margin: 0 }}>
            Something went wrong
          </h1>
          <p
            style={{
              marginTop: "0.75rem",
              fontSize: "0.875rem",
              lineHeight: 1.6,
              color: "rgba(255,255,255,0.75)",
            }}
          >
            Pros-Link hit an unexpected error. Please try again — if it keeps happening,
            contact our team and we&apos;ll look into it.
          </p>

          {error.digest && (
            <p
              style={{
                marginTop: "1rem",
                fontFamily: "ui-monospace, monospace",
                fontSize: "0.6875rem",
                color: "rgba(255,255,255,0.45)",
              }}
            >
              Reference: {error.digest}
            </p>
          )}

          <button
            type="button"
            onClick={reset}
            style={{
              marginTop: "1.75rem",
              padding: "0.625rem 1.5rem",
              borderRadius: "0.625rem",
              border: "none",
              background: "#1D5FE0",
              color: "white",
              fontSize: "0.875rem",
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            Try again
          </button>
        </div>
      </body>
    </html>
  );
}
