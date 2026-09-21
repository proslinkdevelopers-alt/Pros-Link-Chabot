"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field, Select, Textarea } from "@/components/ui/field";
import { useMutation } from "../client/api";
import { useCloseDialog } from "../client/EditDialog";
import { CUSTOMER_STATUSES, CUSTOMER_STATUS_LABEL, LEAD_SOURCES, SOURCE_LABEL } from "@/lib/admin/labels";

export interface CustomerValues {
  name: string;
  company: string;
  phone: string;
  whatsapp: string;
  email: string;
  address: string;
  city: string;
  industry: string;
  notes: string;
  status: string;
  source: string;
}

export const EMPTY_CUSTOMER: CustomerValues = {
  name: "", company: "", phone: "", whatsapp: "", email: "", address: "", city: "", industry: "", notes: "", status: "PROSPECT", source: "",
};

/** New customer, or edit one (`customerId`). */
export function CustomerForm({ customerId, initial }: { customerId?: string; initial: CustomerValues }) {
  const router = useRouter();
  const close = useCloseDialog();
  const [values, setValues] = useState(initial);
  const [existing, setExisting] = useState<string | null>(null);
  const { run, pending, fields } = useMutation();
  const set = (key: keyof CustomerValues) => (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
    setValues((current) => ({ ...current, [key]: event.target.value }));

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    const body = { ...values, source: values.source || null };
    if (customerId) {
      const result = await run("PATCH", `/api/admin/customers/${customerId}`, body, { success: "Customer saved." });
      if (result.ok) close?.();
      return;
    }
    const result = await run<{ id: string; existingId?: string }>("POST", "/api/admin/customers", body, { success: "Customer added.", refresh: false });
    if (result.ok) router.push(`/admin/customers/${result.data.id}`);
    else if (result.data.existingId) setExisting(result.data.existingId);
  }

  return (
    <form onSubmit={submit} className="space-y-5">
      {existing && (
        <p className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 text-sm">
          This contact is already a customer.{" "}
          <Link href={`/admin/customers/${existing}`} className="font-semibold text-primary hover:underline">
            Open their profile
          </Link>
        </p>
      )}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Name" htmlFor="c-name" required error={fields.name}>
          <Input id="c-name" value={values.name} onChange={set("name")} required maxLength={120} autoComplete="off" />
        </Field>
        <Field label="Company" htmlFor="c-company" error={fields.company}>
          <Input id="c-company" value={values.company} onChange={set("company")} maxLength={160} />
        </Field>
        <Field label="Phone" htmlFor="c-phone" required error={fields.phone}>
          <Input id="c-phone" type="tel" value={values.phone} onChange={set("phone")} required maxLength={32} />
        </Field>
        <Field label="WhatsApp" htmlFor="c-wa" error={fields.whatsapp}>
          <Input id="c-wa" type="tel" value={values.whatsapp} onChange={set("whatsapp")} maxLength={32} />
        </Field>
        <Field label="Email" htmlFor="c-email" error={fields.email}>
          <Input id="c-email" type="email" value={values.email} onChange={set("email")} maxLength={160} />
        </Field>
        <Field label="City" htmlFor="c-city" error={fields.city}>
          <Input id="c-city" value={values.city} onChange={set("city")} maxLength={80} />
        </Field>
      </div>
      <Field label="Address" htmlFor="c-address" error={fields.address}>
        <Input id="c-address" value={values.address} onChange={set("address")} maxLength={300} />
      </Field>
      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Industry" htmlFor="c-industry" error={fields.industry}>
          <Input id="c-industry" value={values.industry} onChange={set("industry")} maxLength={80} placeholder="e.g. Education" />
        </Field>
        <Field label="Status" htmlFor="c-status" error={fields.status}>
          <Select id="c-status" value={values.status} onChange={set("status")}>
            {CUSTOMER_STATUSES.map((status) => (
              <option key={status} value={status}>
                {CUSTOMER_STATUS_LABEL[status]}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Source" htmlFor="c-source" error={fields.source}>
          <Select id="c-source" value={values.source} onChange={set("source")}>
            <option value="">Not recorded</option>
            {LEAD_SOURCES.map((source) => (
              <option key={source} value={source}>
                {SOURCE_LABEL[source]}
              </option>
            ))}
          </Select>
        </Field>
      </div>
      <Field label="Notes" htmlFor="c-notes" error={fields.notes}>
        <Textarea id="c-notes" value={values.notes} onChange={set("notes")} maxLength={4000} />
      </Field>
      <div className="flex justify-end gap-2 border-t pt-4">
        {close && (
          <Button type="button" variant="ghost" size="sm" onClick={close} disabled={pending}>
            Cancel
          </Button>
        )}
        <Button type="submit" variant="brand" size="sm" disabled={pending}>
          {pending ? "Saving…" : customerId ? "Save customer" : "Add customer"}
        </Button>
      </div>
    </form>
  );
}
