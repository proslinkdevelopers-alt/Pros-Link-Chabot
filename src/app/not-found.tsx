/**
 * App Router 404.
 *
 * Defining this explicitly matters beyond aesthetics: without it, `next build`
 * can fall back to the pages-router error document while prerendering /404,
 * which fails the build with "<Html> should not be imported outside of
 * pages/_document" — an error that names an import this project does not have,
 * and hides whatever actually crashed.
 *
 * It is deliberately **import-free**, for the same reason `global-error.tsx`
 * is. This is one of only two pages Next prerenders before anything else, and
 * it runs in a build worker with no environment and no browser. Anything it
 * pulls in — a component library, an icon set, a module that reads config —
 * becomes a way for the build to die at page 0 of 12 with that misleading
 * message. A 404 page is not worth that risk, so it renders plain markup with
 * inline styles and no dependencies at all.
 *
 * The brand colours are hard-coded rather than read from the design tokens for
 * the same reason. Keep it that way.
 */
export default function NotFound() {
  return (
    <main
      style={{
        minHeight: "100dvh",
        display: "grid",
        placeItems: "center",
        padding: "1.5rem",
        backgroundColor: "#0A1628",
        backgroundImage:
          "radial-gradient(900px 480px at 95% -10%, rgba(29,95,224,0.28), transparent 60%)",
        color: "white",
        fontFamily:
          '"Plus Jakarta Sans Variable", "Plus Jakarta Sans", ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
      }}
    >
      <div style={{ width: "100%", maxWidth: "30rem", textAlign: "center" }}>
        <p
          style={{
            fontSize: "0.6875rem",
            fontWeight: 600,
            letterSpacing: "0.22em",
            textTransform: "uppercase",
            color: "rgba(255,255,255,0.45)",
            margin: 0,
          }}
        >
          Error 404
        </p>
        <p
          style={{
            fontSize: "5rem",
            fontWeight: 800,
            margin: "0.5rem 0 0",
            lineHeight: 1,
            letterSpacing: "-0.04em",
            backgroundImage: "linear-gradient(to right, #FFFFFF, #9CC4FF)",
            WebkitBackgroundClip: "text",
            backgroundClip: "text",
            color: "transparent",
          }}
        >
          404
        </p>
        <h1 style={{ marginTop: "1rem", fontSize: "1.5rem", fontWeight: 700, letterSpacing: "-0.02em" }}>
          This page doesn&apos;t exist
        </h1>
        <p
          style={{
            marginTop: "0.5rem",
            fontSize: "0.9375rem",
            lineHeight: 1.6,
            color: "rgba(255,255,255,0.6)",
          }}
        >
          The link may be out of date. The Pros-Link Assistant can still help you find
          products, request a quote or arrange service.
        </p>

        <div
          style={{
            marginTop: "2rem",
            display: "flex",
            flexWrap: "wrap",
            gap: "0.75rem",
            justifyContent: "center",
          }}
        >
          <a
            href="/chat"
            style={{
              padding: "0.75rem 1.5rem",
              borderRadius: "0.625rem",
              background: "#1D5FE0",
              color: "white",
              fontSize: "0.875rem",
              fontWeight: 600,
              textDecoration: "none",
            }}
          >
            Open the assistant
          </a>
          <a
            href="/"
            style={{
              padding: "0.75rem 1.5rem",
              borderRadius: "0.625rem",
              border: "1px solid rgba(255,255,255,0.18)",
              background: "rgba(255,255,255,0.04)",
              color: "white",
              fontSize: "0.875rem",
              fontWeight: 600,
              textDecoration: "none",
            }}
          >
            Home
          </a>
        </div>

        <p style={{ marginTop: "2.75rem", fontSize: "0.75rem", fontWeight: 800, letterSpacing: "-0.01em" }}>
          Pros<span style={{ color: "#5AA2FF" }}>-</span>Link
        </p>
      </div>
    </main>
  );
}
