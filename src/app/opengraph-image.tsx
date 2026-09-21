import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ImageResponse } from "next/og";
import { BRAND } from "@/config/brand";
import { SEO, SITE_URL } from "@/lib/site";

export const alt = SEO.ogAlt;
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

/** Static .woff weights: the renderer cannot read the woff2 variable font the site uses. */
const font = (file: string) => readFile(join(process.cwd(), "src/assets/fonts", file));

/** The share card used by every public page: WhatsApp, LinkedIn, Facebook, X. */
export default async function OpengraphImage() {
  const [extraBold, medium] = await Promise.all([
    font("PlusJakartaSans-ExtraBold.woff"),
    font("PlusJakartaSans-Medium.woff"),
  ]);
  // A build without NEXT_PUBLIC_APP_URL has only localhost to show; show nothing instead.
  const host = /localhost|127\.0\.0\.1/.test(SITE_URL) ? "" : SITE_URL.replace(/^https?:\/\//, "");

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: "72px 80px",
          fontFamily: "Plus Jakarta Sans",
          color: "white",
          backgroundColor: BRAND.colors.ink,
          backgroundImage:
            "radial-gradient(900px 480px at 95% -10%, rgba(29,95,224,0.42), transparent 60%), radial-gradient(700px 420px at -10% 110%, rgba(18,38,74,0.95), transparent 70%)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
          <svg width="64" height="64" viewBox="0 0 48 48">
            <rect width="48" height="48" rx="11" fill="#1B3563" />
            <path d="M14 35V13h8.5a7.5 7.5 0 0 1 0 15H14" fill="none" stroke="#FFFFFF" strokeWidth="4.4" strokeLinecap="round" strokeLinejoin="round" />
            <path d="M33 20.5h5" stroke="#5AA2FF" strokeWidth="4.4" strokeLinecap="round" />
          </svg>
          <div style={{ display: "flex", fontSize: 44, fontWeight: 800, letterSpacing: -1 }}>
            Pros<span style={{ color: BRAND.colors.sky }}>-</span>Link
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column" }}>
          <div style={{ fontSize: 24, letterSpacing: 5, textTransform: "uppercase", color: BRAND.colors.sky }}>
            Office equipment · Supplies · Service
          </div>
          <div style={{ marginTop: 20, fontSize: 72, fontWeight: 800, lineHeight: 1.05, letterSpacing: -2 }}>
            {BRAND.tagline}
          </div>
          <div style={{ marginTop: 26, fontSize: 28, color: "rgba(255,255,255,0.7)" }}>
            Digital duplicators · Photocopiers & MFPs · Printers · Consumables · Installation & repair
          </div>
        </div>

        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 22, color: "rgba(255,255,255,0.55)" }}>
          <span>{host}</span>
          <span>Serving businesses across {BRAND.serviceArea}</span>
        </div>
      </div>
    ),
    {
      ...size,
      fonts: [
        { name: "Plus Jakarta Sans", data: extraBold, weight: 800, style: "normal" },
        { name: "Plus Jakarta Sans", data: medium, weight: 500, style: "normal" },
      ],
    },
  );
}
