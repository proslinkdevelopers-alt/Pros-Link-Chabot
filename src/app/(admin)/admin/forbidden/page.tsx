import Link from "next/link";
import { ShieldAlert } from "lucide-react";
import { Card } from "@/components/ui/card";
import { requireStaff } from "@/lib/staff";
import { ROLE_INFO } from "@/lib/permissions";

export const metadata = { title: "No access" };

/** Where a signed-in member lands when their role does not include a page. */
export default async function ForbiddenPage() {
  const staff = await requireStaff();
  return (
    <Card className="mx-auto mt-10 flex max-w-lg flex-col items-center p-10 text-center">
      <span className="grid size-12 place-items-center rounded-xl bg-amber-500/10 text-amber-600">
        <ShieldAlert className="size-6" aria-hidden />
      </span>
      <h1 className="mt-5 text-xl font-bold tracking-tight">You don&apos;t have access to this page</h1>
      <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
        Your role, {ROLE_INFO[staff.role].label}, does not include it. If you need it for your work, ask a Super
        Admin to change your role.
      </p>
      <Link href="/admin" className="mt-6 text-sm font-semibold text-primary hover:underline">
        Back to the dashboard
      </Link>
    </Card>
  );
}
