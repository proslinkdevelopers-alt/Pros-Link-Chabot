"use client";

import { useState } from "react";
import { Plus, Save, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field, Select, Textarea } from "@/components/ui/field";
import { useMutation } from "../client/api";

export interface QuoteItem {
  description: string;
  quantity: number;
  unitPrice: number;
}

/**
 * Line items, adjustments and terms of a quotation. The team enters every
 * price; totals are calculated here for display and again on the server.
 */
export function QuoteEditor({
  quoteId,
  initial,
  canEdit,
}: {
  quoteId: string;
  initial: { title: string; items: QuoteItem[]; discount: number; tax: number; currency: "PKR" | "USD"; validUntil: string; notes: string };
  canEdit: boolean;
}) {
  const [values, setValues] = useState(initial);
  const { run, pending, fields } = useMutation();
  const subtotal = values.items.reduce((sum, item) => sum + (Number(item.quantity) || 0) * (Number(item.unitPrice) || 0), 0);
  const total = Math.max(0, subtotal - (Number(values.discount) || 0) + (Number(values.tax) || 0));
  const money = (amount: number) => `${values.currency} ${amount.toLocaleString("en-PK", { maximumFractionDigits: 2 })}`;
  const setItem = (index: number, patch: Partial<QuoteItem>) =>
    setValues({ ...values, items: values.items.map((item, i) => (i === index ? { ...item, ...patch } : item)) });

  async function save(event: React.FormEvent) {
    event.preventDefault();
    await run(
      "PATCH",
      `/api/admin/quotes/${quoteId}`,
      {
        title: values.title,
        items: values.items.filter((item) => item.description.trim()).map((item) => ({ ...item, quantity: Number(item.quantity), unitPrice: Number(item.unitPrice) })),
        discount: Number(values.discount) || 0,
        tax: Number(values.tax) || 0,
        currency: values.currency,
        validUntil: values.validUntil,
        notes: values.notes,
      },
      { success: "Quotation saved." }
    );
  }

  return (
    <form onSubmit={save}>
      <fieldset disabled={!canEdit || pending} className="space-y-5">
        <Field label="Title" htmlFor="q-title" required error={fields.title}>
          <Input id="q-title" value={values.title} onChange={(e) => setValues({ ...values, title: e.target.value })} required maxLength={180} />
        </Field>

        <div>
          <p className="mb-2 text-xs font-medium">Items</p>
          <div className="scroll-slim overflow-x-auto">
            <table className="w-full min-w-[560px] text-sm">
              <thead>
                <tr className="text-left text-[11px] uppercase tracking-wide text-muted-foreground">
                  <th className="pb-2 font-semibold">Description</th>
                  <th className="w-20 pb-2 font-semibold">Qty</th>
                  <th className="w-36 pb-2 font-semibold">Unit price</th>
                  <th className="w-32 pb-2 text-right font-semibold">Amount</th>
                  <th className="w-10" />
                </tr>
              </thead>
              <tbody>
                {values.items.map((item, index) => (
                  <tr key={index} className="align-top">
                    <td className="pb-2 pr-2">
                      <Input value={item.description} onChange={(e) => setItem(index, { description: e.target.value })} placeholder="Model, part or service" aria-label={`Item ${index + 1} description`} maxLength={300} />
                    </td>
                    <td className="pb-2 pr-2">
                      <Input type="number" min={1} step="any" value={item.quantity} onChange={(e) => setItem(index, { quantity: Number(e.target.value) })} aria-label={`Item ${index + 1} quantity`} />
                    </td>
                    <td className="pb-2 pr-2">
                      <Input type="number" min={0} step="any" value={item.unitPrice} onChange={(e) => setItem(index, { unitPrice: Number(e.target.value) })} aria-label={`Item ${index + 1} unit price`} />
                    </td>
                    <td className="pb-2 pt-2.5 text-right tabular-nums">{money((Number(item.quantity) || 0) * (Number(item.unitPrice) || 0))}</td>
                    <td className="pb-2 pl-1">
                      <Button type="button" variant="ghost" size="icon" onClick={() => setValues({ ...values, items: values.items.filter((_, i) => i !== index) })} aria-label="Remove item">
                        <Trash2 className="text-muted-foreground" />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {canEdit && (
            <Button type="button" variant="outline" size="sm" onClick={() => setValues({ ...values, items: [...values.items, { description: "", quantity: 1, unitPrice: 0 }] })}>
              <Plus /> Add item
            </Button>
          )}
          {fields.items && <p className="mt-1 text-[11px] text-destructive">{fields.items}</p>}
        </div>

        <div className="grid gap-4 sm:grid-cols-4">
          <Field label="Currency" htmlFor="q-cur">
            <Select id="q-cur" value={values.currency} onChange={(e) => setValues({ ...values, currency: e.target.value as "PKR" | "USD" })}>
              <option value="PKR">PKR</option>
              <option value="USD">USD</option>
            </Select>
          </Field>
          <Field label="Discount" htmlFor="q-disc" error={fields.discount}>
            <Input id="q-disc" type="number" min={0} step="any" value={values.discount} onChange={(e) => setValues({ ...values, discount: Number(e.target.value) })} />
          </Field>
          <Field label="Tax" htmlFor="q-tax" error={fields.tax}>
            <Input id="q-tax" type="number" min={0} step="any" value={values.tax} onChange={(e) => setValues({ ...values, tax: Number(e.target.value) })} />
          </Field>
          <Field label="Valid until" htmlFor="q-valid" error={fields.validUntil}>
            <Input id="q-valid" type="date" value={values.validUntil} onChange={(e) => setValues({ ...values, validUntil: e.target.value })} />
          </Field>
        </div>

        <dl className="ml-auto w-full max-w-xs space-y-1 text-sm">
          <div className="flex justify-between">
            <dt className="text-muted-foreground">Subtotal</dt>
            <dd className="tabular-nums">{money(subtotal)}</dd>
          </div>
          <div className="flex justify-between border-t pt-1 font-semibold">
            <dt>Total</dt>
            <dd className="tabular-nums">{money(total)}</dd>
          </div>
        </dl>

        <Field label="Terms and notes" htmlFor="q-notes" hint="Delivery, installation, warranty and payment terms for this quotation." error={fields.notes}>
          <Textarea id="q-notes" value={values.notes} onChange={(e) => setValues({ ...values, notes: e.target.value })} maxLength={4000} />
        </Field>

        {canEdit && (
          <div className="flex justify-end">
            <Button type="submit" variant="brand" size="sm" disabled={pending}>
              <Save /> {pending ? "Saving…" : "Save quotation"}
            </Button>
          </div>
        )}
      </fieldset>
    </form>
  );
}
