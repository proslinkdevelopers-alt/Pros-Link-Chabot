import {
  Box,
  Briefcase,
  Building2,
  Cog,
  Copy,
  Droplets,
  Headset,
  Layers,
  Package,
  PackageCheck,
  Paperclip,
  Printer,
  ScanLine,
  ShieldCheck,
  Wrench,
  type LucideIcon,
} from "lucide-react";

/**
 * Icon names staff can give a category in the console, mapped to Lucide
 * icons. Kept to a curated set so every icon reads as office equipment.
 */
export const CATEGORY_ICONS: Record<string, LucideIcon> = {
  layers: Layers,
  copy: Copy,
  printer: Printer,
  scan: ScanLine,
  briefcase: Briefcase,
  paperclip: Paperclip,
  droplets: Droplets,
  cog: Cog,
  wrench: Wrench,
  package: Package,
  "package-check": PackageCheck,
  "shield-check": ShieldCheck,
  headset: Headset,
  building: Building2,
  box: Box,
};

export const CATEGORY_ICON_NAMES = Object.keys(CATEGORY_ICONS);

export function CategoryIcon({ name, className }: { name?: string | null; className?: string }) {
  const Icon = (name && CATEGORY_ICONS[name]) || Box;
  return <Icon className={className} aria-hidden />;
}
