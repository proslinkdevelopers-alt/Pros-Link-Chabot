import { requirePagePermission } from "@/lib/staff";
import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/admin/ui";
import { CustomerForm, EMPTY_CUSTOMER } from "@/components/admin/crm/CustomerForm";

export const metadata = { title: "Add customer" };

export default async function NewCustomerPage() {
  await requirePagePermission("customers.manage", "/admin/customers/new");
  return (
    <>
      <PageHeader back={{ href: "/admin/customers", label: "Customers" }} title="Add customer" description="If the phone number or email is already on file, you are pointed to that profile instead of creating a duplicate." />
      <Card className="max-w-3xl p-6">
        <CustomerForm initial={EMPTY_CUSTOMER} />
      </Card>
    </>
  );
}
