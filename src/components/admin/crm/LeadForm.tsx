"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field, Select, Textarea } from "@/components/ui/field";
import { useMutation } from "../client/api";
import { useCloseDialog } from "../client/EditDialog";
import { LEAD_SOURCES, SOURCE_LABEL } from "@/lib/admin/labels";

export interface LeadValues {
  name: string;
  company: string;
  phone: string;
  whatsapp: string;
  email: string;
  city: string;
  productCategoryId: string;
  productId: string;
  quantity: string;
  budget: string;
  timeline: string;
  preferredContact: string;
  requirements: string;
  source: string;
}

export const EMPTY_LEAD: LeadValues = {
  name: "", company: "", phone: "", whatsapp: "", email: "", city: "", productCategoryId: "", productId: "",
  quantity: "", budget: "", timeline: "", preferredContact: "", requirements: "", source: "PHONE",
};

type Choice = { id: string; name: string };

/** New lead, or edit an existing lead's details (`leadId`). */
export function LeadForm({
  leadId,
  initial,
  categories,
  products,
  people,
}: {
  leadId?: string;
  initial: LeadValues;
  categories: Choice[];
  products: Choice[];
  /** Owners, for a new lead. */
  people?: Array<{ value: string; label: string }>;
}) {
  const router = useRouter();
  const onDone = useCloseDialog();
  const [values, setValues] = useState(initial);
  const [ownerId, setOwnerId] = useState("");
  const { run, pending, fields } = useMutation();
  const set = (key: keyof LeadValues) => (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
    setValues((current) => ({ ...current, [key]: event.target.value }));

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    const body = { ...values, productCategoryId: values.productCategoryId || null, productId: values.productId || null };
    if (leadId) {
      const result = await run("PATCH", `/api/admin/leads/${leadId}`, body, { success: "Lead saved." });
      if (result.ok) onDone?.();
    } else {
      const result = await run<{ id: string }>("POST", "/api/admin/leads", { ...body, ownerId: ownerId || null }, { success: "Lead added.", refresh: false });
      if (result.ok) router.push(`/admin/leads/${result.data.id}`);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Contact name" htmlFor="l-name" required error={fields.name}>
          <Input id="l-name" value={values.name} onChange={set("name")} required maxLength={120} autoComplete="off" />
        </Field>
        <Field label="Company" htmlFor="l-company" error={fields.company}>
          <Input id="l-company" value={values.company} onChange={set("company")} maxLength={160} />
        </Field>
        <Field label="Phone" htmlFor="l-phone" required error={fields.phone}>
          <Input id="l-phone" type="tel" value={values.phone} onChange={set("phone")} required maxLength={32} />
        </Field>
        <Field label="WhatsApp" htmlFor="l-wa" hint="If different from the phone number." error={fields.whatsapp}>
          <Input id="l-wa" type="tel" value={values.whatsapp} onChange={set("whatsapp")} maxLength={32} />
        </Field>
        <Field label="Email" htmlFor="l-email" error={fields.email}>
          <Input id="l-email" type="email" value={values.email} onChange={set("email")} maxLength={160} />
        </Field>
        <Field label="City" htmlFor="l-city" error={fields.city}>
          <Input id="l-city" value={values.city} onChange={set("city")} maxLength={80} />
        </Field>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Product category" htmlFor="l-cat" error={fields.productCategoryId}>
          <Select id="l-cat" value={values.productCategoryId} onChange={set("productCategoryId")}>
            <option value="">Not specified</option>
            {categories.map((category) => (
              <option key={category.id} value={category.id}>
                {category.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Product" htmlFor="l-product" error={fields.productId}>
          <Select id="l-product" value={values.productId} onChange={set("productId")}>
            <option value="">Not specified</option>
            {products.map((product) => (
              <option key={product.id} value={product.id}>
                {product.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Quantity" htmlFor="l-qty" error={fields.quantity}>
          <Input id="l-qty" value={values.quantity} onChange={set("quantity")} maxLength={60} placeholder="e.g. 3 units" />
        </Field>
        <Field label="Budget" htmlFor="l-budget" error={fields.budget}>
          <Input id="l-budget" value={values.budget} onChange={set("budget")} maxLength={80} />
        </Field>
        <Field label="Timeline" htmlFor="l-timeline" error={fields.timeline}>
          <Input id="l-timeline" value={values.timeline} onChange={set("timeline")} maxLength={80} placeholder="e.g. Within a month" />
        </Field>
        <Field label="Preferred contact" htmlFor="l-pref" error={fields.preferredContact}>
          <Select id="l-pref" value={values.preferredContact} onChange={set("preferredContact")}>
            <option value="">Not specified</option>
            <option value="Phone call">Phone call</option>
            <option value="WhatsApp">WhatsApp</option>
            <option value="Email">Email</option>
          </Select>
        </Field>
      </div>

      <Field label="Requirements" htmlFor="l-req" required error={fields.requirements}>
        <Textarea id="l-req" value={values.requirements} onChange={set("requirements")} required maxLength={4000} />
      </Field>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Source" htmlFor="l-source" error={fields.source}>
          <Select id="l-source" value={values.source} onChange={set("source")}>
            {LEAD_SOURCES.map((source) => (
              <option key={source} value={source}>
                {SOURCE_LABEL[source]}
              </option>
            ))}
          </Select>
        </Field>
        {!leadId && people && (
          <Field label="Owner" htmlFor="l-owner" hint="You, if left empty." error={fields.ownerId}>
            <Select id="l-owner" value={ownerId} onChange={(event) => setOwnerId(event.target.value)}>
              <option value="">Me</option>
              {people.map((person) => (
                <option key={person.value} value={person.value}>
                  {person.label}
                </option>
              ))}
            </Select>
          </Field>
        )}
      </div>

      <div className="flex justify-end gap-2 border-t pt-4">
        {onDone && (
          <Button type="button" variant="ghost" size="sm" onClick={onDone} disabled={pending}>
            Cancel
          </Button>
        )}
        <Button type="submit" variant="brand" size="sm" disabled={pending}>
          {pending ? "Saving…" : leadId ? "Save details" : "Add lead"}
        </Button>
      </div>
    </form>
  );
}
