import Link from "next/link";
import { BRAND } from "@/config/brand";
import { cn } from "@/lib/utils";

/**
 * The Pros-Link mark and wordmark.
 *
 * The built-in mark is a "P" followed by the blue hyphen of the wordmark —
 * Pros-Link, reduced to its first letter and its link. When an official logo
 * file is supplied (`NEXT_PUBLIC_BRAND_LOGO_URL`, or Admin → Settings →
 * Company profile), pass it as `logoUrl` and it replaces the built-in mark.
 */
export function LogoMark({
  className,
  logoUrl = BRAND.logoUrl,
  title = BRAND.name,
}: {
  className?: string;
  logoUrl?: string | null;
  title?: string;
}) {
  if (logoUrl) {
    // eslint-disable-next-line @next/next/no-img-element -- any host, any size; next/image needs both configured
    return <img src={logoUrl} alt={title} className={cn("object-contain", className)} />;
  }

  return (
    <svg viewBox="0 0 48 48" className={className} xmlns="http://www.w3.org/2000/svg" role="img" aria-label={title}>
      <defs>
        <linearGradient id="pl-tile" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#1B3563" />
          <stop offset="1" stopColor="#0A1628" />
        </linearGradient>
      </defs>
      <rect width="48" height="48" rx="11" fill="url(#pl-tile)" />
      <rect x="0.5" y="0.5" width="47" height="47" rx="10.5" fill="none" stroke="#FFFFFF" strokeOpacity="0.12" />
      <path
        d="M14 35V13h8.5a7.5 7.5 0 0 1 0 15H14"
        fill="none"
        stroke="#FFFFFF"
        strokeWidth="4.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="M33 20.5h5" stroke="#5AA2FF" strokeWidth="4.4" strokeLinecap="round" />
    </svg>
  );
}

/** Mark + "Pros-Link" wordmark, optionally with a descriptor underneath. */
export function Logo({
  href = "/",
  tone = "light",
  descriptor,
  size = "md",
  logoUrl,
  className,
}: {
  href?: string | null;
  /** `light` for navy surfaces, `dark` for white ones. */
  tone?: "light" | "dark";
  descriptor?: string;
  size?: "sm" | "md" | "lg";
  logoUrl?: string | null;
  className?: string;
}) {
  const body = (
    <span className={cn("inline-flex items-center gap-2.5", className)}>
      <LogoMark
        logoUrl={logoUrl ?? BRAND.logoUrl}
        className={cn("shrink-0", size === "sm" && "size-8", size === "md" && "size-9", size === "lg" && "size-12")}
      />
      <span className="flex flex-col leading-none">
        <span
          className={cn(
            "font-extrabold tracking-tight",
            tone === "light" ? "text-white" : "text-brand-ink",
            size === "sm" && "text-[15px]",
            size === "md" && "text-lg",
            size === "lg" && "text-2xl"
          )}
        >
          Pros<span className={tone === "light" ? "text-brand-sky" : "text-brand-blue"}>-</span>Link
        </span>
        {descriptor && (
          <span
            className={cn(
              "mt-1 text-[10px] font-semibold uppercase tracking-[0.2em]",
              tone === "light" ? "text-white/55" : "text-muted-foreground"
            )}
          >
            {descriptor}
          </span>
        )}
      </span>
    </span>
  );

  return href ? (
    <Link href={href} aria-label={`${BRAND.name} — home`} className="rounded-md">
      {body}
    </Link>
  ) : (
    body
  );
}
