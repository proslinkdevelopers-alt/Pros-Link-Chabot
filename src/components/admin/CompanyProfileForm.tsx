"use client";

import { useState } from "react";
import { Plus, Save, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/ui/field";
import { useMutation } from "./client/api";
import { SOCIAL_LABELS, type CompanyProfile } from "@/lib/company-schema";

/**
 * The company's contact details — the only place the site and the assistant
 * take them from. Anything left empty is simply not shown to customers.
 */
export function CompanyProfileForm({ initial }: { initial: CompanyProfile }) {
  const [values, setValues] = useState<CompanyProfile>(initial);
  const { run, pending, fields } = useMutation();
  const set = (key: keyof Omit<CompanyProfile, "offices" | "social">) => (event: React.ChangeEvent<HTMLInputElement>) => setValues({ ...values, [key]: event.target.value });

  return (
    <form
      onSubmit={async (event) => {
        event.preventDefault();
        await run("PUT", "/api/admin/settings/company", values, { success: "Company profile saved. The site and the assistant use it from now on." });
      }}
      className="space-y-6"
    >
      <Card className="space-y-4 p-5">
        <div>
          <h2 className="text-sm font-semibold">Contact</h2>
          <p className="text-xs text-muted-foreground">Shown on the website, in the assistant&apos;s “Contact Pros-Link” answer and on the chat&apos;s call and WhatsApp buttons.</p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Phone" htmlFor="cp-phone" error={fields.phone}>
            <Input id="cp-phone" type="tel" value={values.phone} onChange={set("phone")} placeholder="+92 …" />
          </Field>
          <Field label="WhatsApp number" htmlFor="cp-wa" hint="The WhatsApp Business number customers are sent to." error={fields.whatsapp}>
            <Input id="cp-wa" type="tel" value={values.whatsapp} onChange={set("whatsapp")} placeholder="+92 …" />
          </Field>
          <Field label="Email" htmlFor="cp-email" error={fields.email}>
            <Input id="cp-email" type="email" value={values.email} onChange={set("email")} />
          </Field>
          <Field label="Website" htmlFor="cp-web" error={fields.website}>
            <Input id="cp-web" type="url" value={values.website} onChange={set("website")} placeholder="https://" />
          </Field>
        </div>
        <Field label="Head office address" htmlFor="cp-address" error={fields.address}>
          <Input id="cp-address" value={values.address} onChange={set("address")} />
        </Field>
        <Field label="Opening hours" htmlFor="cp-hours" hint="In words, as customers should read them." error={fields.hours}>
          <Input id="cp-hours" value={values.hours} onChange={set("hours")} />
        </Field>
      </Card>

      <Card className="space-y-4 p-5">
        <div>
          <h2 className="text-sm font-semibold">Offices and branches</h2>
          <p className="text-xs text-muted-foreground">Other locations customers can visit or call.</p>
        </div>
        {values.offices.map((office, index) => (
          <div key={index} className="grid gap-2 rounded-lg border p-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,2fr)_minmax(0,1fr)_auto]">
            <Input value={office.city} onChange={(e) => setValues({ ...values, offices: values.offices.map((o, i) => (i === index ? { ...o, city: e.target.value } : o)) })} placeholder="City" aria-label={`Office ${index + 1} city`} required />
            <Input value={office.address} onChange={(e) => setValues({ ...values, offices: values.offices.map((o, i) => (i === index ? { ...o, address: e.target.value } : o)) })} placeholder="Address" aria-label={`Office ${index + 1} address`} />
            <Input value={office.phone} onChange={(e) => setValues({ ...values, offices: values.offices.map((o, i) => (i === index ? { ...o, phone: e.target.value } : o)) })} placeholder="Phone" aria-label={`Office ${index + 1} phone`} />
            <Button type="button" variant="ghost" size="icon" onClick={() => setValues({ ...values, offices: values.offices.filter((_, i) => i !== index) })} aria-label="Remove office">
              <Trash2 className="text-muted-foreground" />
            </Button>
          </div>
        ))}
        {Object.entries(fields)
          .filter(([key]) => key.startsWith("offices"))
          .slice(0, 1)
          .map(([key, message]) => (
            <p key={key} className="text-[11px] text-destructive">
              {key}: {message}
            </p>
          ))}
        <Button type="button" variant="outline" size="sm" onClick={() => setValues({ ...values, offices: [...values.offices, { city: "", address: "", phone: "" }] })}>
          <Plus /> Add office
        </Button>
      </Card>

      <Card className="space-y-4 p-5">
        <h2 className="text-sm font-semibold">Logo and social media</h2>
        <Field label="Logo image" htmlFor="cp-logo" hint="A full https:// address, or a path under /public. Leave empty to use the built-in mark." error={fields.logoUrl}>
          <Input id="cp-logo" value={values.logoUrl} onChange={set("logoUrl")} />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          {(Object.keys(SOCIAL_LABELS) as Array<keyof CompanyProfile["social"]>).map((key) => (
            <Field key={key} label={SOCIAL_LABELS[key]} htmlFor={`cp-${key}`} error={fields[`social.${key}`]}>
              <Input id={`cp-${key}`} type="url" value={values.social[key]} onChange={(e) => setValues({ ...values, social: { ...values.social, [key]: e.target.value } })} placeholder="https://" />
            </Field>
          ))}
        </div>
      </Card>

      <div className="flex justify-end">
        <Button type="submit" variant="brand" disabled={pending}>
          <Save /> {pending ? "Saving…" : "Save company profile"}
        </Button>
      </div>
    </form>
  );
}
