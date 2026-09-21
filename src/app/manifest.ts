import type { MetadataRoute } from "next";
import { BRAND } from "@/config/brand";
import { SEO } from "@/lib/site";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: BRAND.name,
    short_name: BRAND.name,
    description: SEO.homeDescription,
    start_url: "/",
    display: "standalone",
    background_color: BRAND.colors.ink,
    theme_color: BRAND.colors.ink,
    icons: [{ src: "/icon.svg", sizes: "any", type: "image/svg+xml" }],
  };
}
