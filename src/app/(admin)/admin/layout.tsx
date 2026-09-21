import type { Metadata } from "next";
import { AdminShell } from "@/components/admin/AdminShell";
import { requireStaff } from "@/lib/staff";
import { navCounts } from "@/lib/admin/queries";
import { BRAND } from "@/config/brand";
import { ROLE_INFO } from "@/lib/permissions";

export const metadata: Metadata = {
  title: { default: "Admin", template: `%s · ${BRAND.console.name}` },
  robots: { index: false, follow: false },
};

/** Admin pages read live data on every request. */
export const dynamic = "force-dynamic";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  // Gate the whole console here so no page can be reached without a verified
  // staff account; each page then checks its own permission.
  const staff = await requireStaff();
  const badges = await navCounts(staff);

  return (
    <AdminShell
      user={{ name: staff.name, role: staff.role, roleLabel: ROLE_INFO[staff.role].label }}
      // Only serializable values cross into the client component — the nav
      // tree is built there, since each item carries a Lucide icon function.
      permissions={[...staff.permissions]}
      badges={badges}
    >
      {children}
    </AdminShell>
  );
}
