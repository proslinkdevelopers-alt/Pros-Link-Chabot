import { prisma } from "@/lib/db";
import { requirePagePermission } from "@/lib/staff";
import { OWN, safeQuery } from "@/lib/admin/queries";
import { peopleWith } from "@/lib/admin/people";
import { Card } from "@/components/ui/card";
import { DbNotice, PageHeader } from "@/components/admin/ui";
import { EMPTY_LEAD, LeadForm } from "@/components/admin/crm/LeadForm";

export const metadata = { title: "New lead" };

export default async function NewLeadPage() {
  await requirePagePermission("leads.manage", "/admin/leads/new");
  const { data, error } = await safeQuery(
    async () => {
      const [categories, products, people] = await Promise.all([
        prisma.productCategory.findMany({ where: OWN, orderBy: [{ sortOrder: "asc" }, { name: "asc" }], select: { id: true, name: true } }),
        prisma.product.findMany({ where: { ...OWN, status: { not: "ARCHIVED" } }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
        peopleWith(["leads.manage"]),
      ]);
      return { categories, products, people };
    },
    { categories: [], products: [], people: [] }
  );

  return (
    <>
      <PageHeader back={{ href: "/admin/leads", label: "Leads" }} title="New lead" description="For an enquiry that came in by phone, in person or by referral. It is linked to the customer's profile by phone number or email." />
      <DbNotice error={error} />
      <Card className="max-w-3xl p-6">
        <LeadForm initial={EMPTY_LEAD} categories={data.categories} products={data.products} people={data.people} />
      </Card>
    </>
  );
}
