"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field, Select, Textarea } from "@/components/ui/field";
import { useMutation } from "../client/api";
import { useCloseDialog } from "../client/EditDialog";
import { LEAD_SOURCES, PRIORITIES, PRIORITY_LABEL, SERVICE_CATEGORIES, SOURCE_LABEL, SUPPORT_CATEGORIES, TICKET_CATEGORY_LABEL } from "@/lib/admin/labels";

export interface TicketValues {
  category: string;
  priority: string;
  subject: string;
  description: string;
  contactName: string;
  contactPhone: string;
  contactEmail: string;
  company: string;
  city: string;
  address: string;
  machineType: string;
  machineBrand: string;
  machineModel: string;
  serialNumber: string;
  preferredDate: string;
  preferredTime: string;
}

export const EMPTY_TICKET: TicketValues = {
  category: "REPAIR", priority: "NORMAL", subject: "", description: "", contactName: "", contactPhone: "", contactEmail: "", company: "", city: "",
  address: "", machineType: "", machineBrand: "", machineModel: "", serialNumber: "", preferredDate: "", preferredTime: "",
};

/** Raise a ticket for a customer, or edit a ticket's details (`ticketId`). */
export function TicketForm({
  ticketId,
  initial,
  customerId,
  people,
  machines,
}: {
  ticketId?: string;
  initial: TicketValues;
  customerId?: string;
  people?: Array<{ value: string; label: string }>;
  /** The customer's recorded machines, to fill the machine fields from. */
  machines?: Array<{ label: string; brand: string | null; model: string | null; serialNumber: string | null }>;
}) {
  const router = useRouter();
  const close = useCloseDialog();
  const [values, setValues] = useState(initial);
  const [assigneeId, setAssigneeId] = useState("");
  const [source, setSource] = useState("PHONE");
  const { run, pending, fields } = useMutation();
  const set = (key: keyof TicketValues) => (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
    setValues((current) => ({ ...current, [key]: event.target.value }));
  const isService = (SERVICE_CATEGORIES as readonly string[]).includes(values.category);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (ticketId) {
      const result = await run("PATCH", `/api/admin/tickets/${ticketId}`, values, { success: "Ticket saved." });
      if (result.ok) close?.();
      return;
    }
    const result = await run<{ id: string }>("POST", "/api/admin/tickets", { ...values, assigneeId: assigneeId || null, source, customerId: customerId ?? null }, { success: "Ticket raised.", refresh: false });
    if (result.ok) router.push(`/admin/tickets/${result.data.id}`);
  }

  return (
    <form onSubmit={submit} className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Type" htmlFor="t-cat" required error={fields.category}>
          <Select id="t-cat" value={values.category} onChange={set("category")}>
            <optgroup label="Service">
              {SERVICE_CATEGORIES.map((value) => (
                <option key={value} value={value}>
                  {TICKET_CATEGORY_LABEL[value]}
                </option>
              ))}
            </optgroup>
            <optgroup label="Support">
              {SUPPORT_CATEGORIES.map((value) => (
                <option key={value} value={value}>
                  {TICKET_CATEGORY_LABEL[value]}
                </option>
              ))}
            </optgroup>
          </Select>
        </Field>
        <Field label="Priority" htmlFor="t-pri" error={fields.priority}>
          <Select id="t-pri" value={values.priority} onChange={set("priority")}>
            {PRIORITIES.map((value) => (
              <option key={value} value={value}>
                {PRIORITY_LABEL[value]}
              </option>
            ))}
          </Select>
        </Field>
        {!ticketId && (
          <Field label="Received by" htmlFor="t-src">
            <Select id="t-src" value={source} onChange={(event) => setSource(event.target.value)}>
              {LEAD_SOURCES.map((value) => (
                <option key={value} value={value}>
                  {SOURCE_LABEL[value]}
                </option>
              ))}
            </Select>
          </Field>
        )}
      </div>
      <Field label="Subject" htmlFor="t-subject" hint={ticketId ? undefined : "Made from the type and machine if left empty."} error={fields.subject}>
        <Input id="t-subject" value={values.subject} onChange={set("subject")} maxLength={160} required={Boolean(ticketId)} />
      </Field>
      <Field label="What's needed" htmlFor="t-desc" required error={fields.description}>
        <Textarea id="t-desc" value={values.description} onChange={set("description")} required maxLength={4000} />
      </Field>

      <fieldset className="space-y-4">
        <legend className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Customer</legend>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Contact name" htmlFor="t-name" required={!ticketId} error={fields.contactName}>
            <Input id="t-name" value={values.contactName} onChange={set("contactName")} maxLength={120} required={!ticketId} />
          </Field>
          <Field label="Phone" htmlFor="t-phone" required={!ticketId} error={fields.contactPhone}>
            <Input id="t-phone" type="tel" value={values.contactPhone} onChange={set("contactPhone")} maxLength={32} required={!ticketId} />
          </Field>
          <Field label="Email" htmlFor="t-email" error={fields.contactEmail}>
            <Input id="t-email" type="email" value={values.contactEmail} onChange={set("contactEmail")} maxLength={160} />
          </Field>
          <Field label="Company" htmlFor="t-company" error={fields.company}>
            <Input id="t-company" value={values.company} onChange={set("company")} maxLength={160} />
          </Field>
          <Field label="City" htmlFor="t-city" error={fields.city}>
            <Input id="t-city" value={values.city} onChange={set("city")} maxLength={80} />
          </Field>
          <Field label="Address" htmlFor="t-address" error={fields.address}>
            <Input id="t-address" value={values.address} onChange={set("address")} maxLength={300} />
          </Field>
        </div>
      </fieldset>

      {isService && (
        <fieldset className="space-y-4">
          <legend className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Machine</legend>
          {machines && machines.length > 0 && (
            <Select
              aria-label="Fill from the customer's machines"
              defaultValue=""
              onChange={(event) => {
                const machine = machines[Number(event.target.value)];
                if (machine) setValues((current) => ({ ...current, machineType: machine.label, machineBrand: machine.brand ?? "", machineModel: machine.model ?? "", serialNumber: machine.serialNumber ?? "" }));
              }}
            >
              <option value="">Fill from a recorded machine…</option>
              {machines.map((machine, index) => (
                <option key={index} value={index}>
                  {machine.label}
                  {machine.serialNumber ? ` · SN ${machine.serialNumber}` : ""}
                </option>
              ))}
            </Select>
          )}
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Machine type" htmlFor="t-type" error={fields.machineType}>
              <Input id="t-type" value={values.machineType} onChange={set("machineType")} maxLength={80} placeholder="e.g. Photocopier / MFP" />
            </Field>
            <Field label="Brand" htmlFor="t-brand" error={fields.machineBrand}>
              <Input id="t-brand" value={values.machineBrand} onChange={set("machineBrand")} maxLength={60} />
            </Field>
            <Field label="Model" htmlFor="t-model" error={fields.machineModel}>
              <Input id="t-model" value={values.machineModel} onChange={set("machineModel")} maxLength={80} />
            </Field>
            <Field label="Serial number" htmlFor="t-serial" error={fields.serialNumber}>
              <Input id="t-serial" value={values.serialNumber} onChange={set("serialNumber")} maxLength={60} />
            </Field>
            <Field label="Preferred visit date" htmlFor="t-date" error={fields.preferredDate}>
              <Input id="t-date" type="date" value={values.preferredDate} onChange={set("preferredDate")} />
            </Field>
            <Field label="Preferred time" htmlFor="t-time" error={fields.preferredTime}>
              <Input id="t-time" value={values.preferredTime} onChange={set("preferredTime")} maxLength={60} placeholder="e.g. Morning" />
            </Field>
          </div>
        </fieldset>
      )}

      {!ticketId && people && (
        <Field label="Assign to" htmlFor="t-assignee" hint="Leave empty to assign later.">
          <Select id="t-assignee" value={assigneeId} onChange={(event) => setAssigneeId(event.target.value)}>
            <option value="">Unassigned</option>
            {people.map((person) => (
              <option key={person.value} value={person.value}>
                {person.label}
              </option>
            ))}
          </Select>
        </Field>
      )}

      <div className="flex justify-end gap-2 border-t pt-4">
        {close && (
          <Button type="button" variant="ghost" size="sm" onClick={close} disabled={pending}>
            Cancel
          </Button>
        )}
        <Button type="submit" variant="brand" size="sm" disabled={pending}>
          {pending ? "Saving…" : ticketId ? "Save ticket" : "Raise ticket"}
        </Button>
      </div>
    </form>
  );
}
