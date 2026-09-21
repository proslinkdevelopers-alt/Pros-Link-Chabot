"use client";

import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

/** An editable list of short strings — features, image URLs, keywords. */
export function ListEditor({
  id,
  values,
  onChange,
  placeholder,
  addLabel = "Add",
  max = 30,
  type = "text",
}: {
  id?: string;
  values: string[];
  onChange: (values: string[]) => void;
  placeholder?: string;
  addLabel?: string;
  max?: number;
  type?: "text" | "url";
}) {
  const set = (index: number, value: string) => onChange(values.map((entry, i) => (i === index ? value : entry)));
  return (
    <div className="space-y-2" id={id}>
      {values.map((value, index) => (
        <div key={index} className="flex gap-2">
          <Input type={type} value={value} placeholder={placeholder} onChange={(event) => set(index, event.target.value)} aria-label={`${placeholder ?? "Item"} ${index + 1}`} />
          <Button type="button" variant="ghost" size="icon" onClick={() => onChange(values.filter((_, i) => i !== index))} aria-label="Remove">
            <Trash2 className="text-muted-foreground" />
          </Button>
        </div>
      ))}
      {values.length < max && (
        <Button type="button" variant="outline" size="sm" onClick={() => onChange([...values, ""])}>
          <Plus /> {addLabel}
        </Button>
      )}
    </div>
  );
}

/** Two-column rows — specification label/value, document title/URL. */
export function PairsEditor({
  rows,
  onChange,
  keys,
  placeholders,
  addLabel = "Add row",
  max = 40,
}: {
  rows: Array<Record<string, string>>;
  onChange: (rows: Array<Record<string, string>>) => void;
  keys: [string, string];
  placeholders: [string, string];
  addLabel?: string;
  max?: number;
}) {
  const set = (index: number, key: string, value: string) => onChange(rows.map((row, i) => (i === index ? { ...row, [key]: value } : row)));
  return (
    <div className="space-y-2">
      {rows.map((row, index) => (
        <div key={index} className="grid grid-cols-[minmax(0,2fr)_minmax(0,3fr)_auto] gap-2">
          <Input value={row[keys[0]] ?? ""} placeholder={placeholders[0]} onChange={(event) => set(index, keys[0], event.target.value)} aria-label={`${placeholders[0]} ${index + 1}`} />
          <Input value={row[keys[1]] ?? ""} placeholder={placeholders[1]} onChange={(event) => set(index, keys[1], event.target.value)} aria-label={`${placeholders[1]} ${index + 1}`} />
          <Button type="button" variant="ghost" size="icon" onClick={() => onChange(rows.filter((_, i) => i !== index))} aria-label="Remove row">
            <Trash2 className="text-muted-foreground" />
          </Button>
        </div>
      ))}
      {rows.length < max && (
        <Button type="button" variant="outline" size="sm" onClick={() => onChange([...rows, { [keys[0]]: "", [keys[1]]: "" }])}>
          <Plus /> {addLabel}
        </Button>
      )}
    </div>
  );
}
