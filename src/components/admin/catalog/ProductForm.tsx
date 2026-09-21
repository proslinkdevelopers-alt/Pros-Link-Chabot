"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Archive, ArchiveRestore, ImageOff, Save, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Field, Select, Textarea } from "@/components/ui/field";
import { ListEditor, PairsEditor } from "../client/editors";
import { ConfirmButton } from "../client/Modal";
import { useMutation } from "../client/api";
import { AVAILABILITY_LABEL } from "@/lib/catalog-types";
import { AVAILABILITY } from "@/lib/admin/catalog-schemas";

export interface ProductFormValues {
  name: string;
  slug: string;
  sku: string;
  model: string;
  categoryId: string;
  brandId: string;
  summary: string;
  description: string;
  images: string[];
  features: string[];
  specifications: Array<{ label: string; value: string }>;
  documents: Array<{ title: string; url: string }>;
  availability: (typeof AVAILABILITY)[number];
  status: "DRAFT" | "PUBLISHED" | "ARCHIVED";
  isFeatured: boolean;
  sortOrder: number;
  keywords: string[];
  relatedIds: string[];
}

export const EMPTY_PRODUCT: ProductFormValues = {
  name: "",
  slug: "",
  sku: "",
  model: "",
  categoryId: "",
  brandId: "",
  summary: "",
  description: "",
  images: [],
  features: [],
  specifications: [],
  documents: [],
  availability: "ON_REQUEST",
  status: "DRAFT",
  isFeatured: false,
  sortOrder: 0,
  keywords: [],
  relatedIds: [],
};

interface Option {
  id: string;
  name: string;
  note?: string;
}

/** Create or edit a product. Read-only for roles that can view the catalogue but not change it. */
export function ProductForm({
  productId,
  initial,
  categories,
  brands,
  products,
  canEdit,
}: {
  productId?: string;
  initial: ProductFormValues;
  categories: Option[];
  brands: Option[];
  products: Option[];
  canEdit: boolean;
}) {
  const router = useRouter();
  const [values, setValues] = useState<ProductFormValues>(initial);
  const { run, pending, fields } = useMutation();
  const set = <K extends keyof ProductFormValues>(key: K, value: ProductFormValues[K]) => setValues((current) => ({ ...current, [key]: value }));

  function payload() {
    const clean = (list: string[]) => list.map((entry) => entry.trim()).filter(Boolean);
    return {
      ...values,
      slug: values.slug.trim(),
      categoryId: values.categoryId || null,
      brandId: values.brandId || null,
      images: clean(values.images),
      features: clean(values.features),
      keywords: clean(values.keywords),
      specifications: values.specifications.filter((row) => row.label.trim() || row.value.trim()),
      documents: values.documents.filter((row) => row.title.trim() || row.url.trim()),
    };
  }

  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (productId) {
      await run("PATCH", `/api/admin/products/${productId}`, payload(), { success: "Product saved." });
    } else {
      const result = await run<{ id: string }>("POST", "/api/admin/products", payload(), { success: "Product added.", refresh: false });
      if (result.ok) router.push(`/admin/products/${result.data.id}`);
    }
  }

  async function setStatus(status: ProductFormValues["status"]) {
    const result = await run("PATCH", `/api/admin/products/${productId}`, { status }, { success: status === "ARCHIVED" ? "Product archived." : "Product restored as a draft." });
    if (result.ok) set("status", status);
  }

  async function remove() {
    const result = await run("DELETE", `/api/admin/products/${productId}`, undefined, { success: "Product deleted.", refresh: false });
    if (result.ok) router.push("/admin/products");
  }

  const disabled = !canEdit || pending;
  const related = products.filter((product) => product.id !== productId);

  return (
    <form onSubmit={save} className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
      <fieldset disabled={disabled} className="min-w-0 space-y-6">
        <Card className="space-y-4 p-5">
          <h2 className="text-sm font-semibold">Product</h2>
          <Field label="Name" htmlFor="name" required error={fields.name}>
            <Input id="name" value={values.name} onChange={(event) => set("name", event.target.value)} maxLength={160} required />
          </Field>
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Model" htmlFor="model" error={fields.model}>
              <Input id="model" value={values.model} onChange={(event) => set("model", event.target.value)} maxLength={80} />
            </Field>
            <Field label="SKU" htmlFor="sku" error={fields.sku}>
              <Input id="sku" value={values.sku} onChange={(event) => set("sku", event.target.value)} maxLength={60} />
            </Field>
            <Field label="URL name" htmlFor="slug" hint={productId ? undefined : "Made from the name if left empty."} error={fields.slug}>
              <Input id="slug" value={values.slug} onChange={(event) => set("slug", event.target.value.toLowerCase())} maxLength={80} placeholder="e.g. a3-mono-copier" />
            </Field>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Category" htmlFor="categoryId" error={fields.categoryId}>
              <Select id="categoryId" value={values.categoryId} onChange={(event) => set("categoryId", event.target.value)}>
                <option value="">No category</option>
                {categories.map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.name}
                    {category.note ? ` (${category.note})` : ""}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Brand" htmlFor="brandId" hint="A brand is named to customers only once it is verified and active." error={fields.brandId}>
              <Select id="brandId" value={values.brandId} onChange={(event) => set("brandId", event.target.value)}>
                <option value="">No brand</option>
                {brands.map((brand) => (
                  <option key={brand.id} value={brand.id}>
                    {brand.name}
                    {brand.note ? ` (${brand.note})` : ""}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
          <Field label="Summary" htmlFor="summary" hint="One or two sentences shown in the catalogue and by the assistant." error={fields.summary}>
            <Textarea id="summary" value={values.summary} onChange={(event) => set("summary", event.target.value)} maxLength={300} className="min-h-[70px]" />
          </Field>
          <Field label="Description" htmlFor="description" error={fields.description}>
            <Textarea id="description" value={values.description} onChange={(event) => set("description", event.target.value)} maxLength={8000} className="min-h-[140px]" />
          </Field>
        </Card>

        <Card className="space-y-3 p-5">
          <div>
            <h2 className="text-sm font-semibold">Specifications</h2>
            <p className="text-xs text-muted-foreground">Enter only specifications confirmed by the manufacturer or the team. The assistant quotes exactly what is here.</p>
          </div>
          <PairsEditor
            rows={values.specifications}
            onChange={(rows) => set("specifications", rows as ProductFormValues["specifications"])}
            keys={["label", "value"]}
            placeholders={["Specification (e.g. Print speed)", "Value"]}
            addLabel="Add specification"
          />
          {fields.specifications && <p className="text-[11px] text-destructive">{fields.specifications}</p>}
        </Card>

        <Card className="space-y-3 p-5">
          <h2 className="text-sm font-semibold">Features</h2>
          <ListEditor values={values.features} onChange={(list) => set("features", list)} placeholder="Feature" addLabel="Add feature" />
        </Card>

        <Card className="space-y-3 p-5">
          <div>
            <h2 className="text-sm font-semibold">Images</h2>
            <p className="text-xs text-muted-foreground">Image addresses (https://). The first image is the main one.</p>
          </div>
          <ListEditor values={values.images} onChange={(list) => set("images", list)} placeholder="https://…" addLabel="Add image" type="url" max={12} />
          {Object.entries(fields)
            .filter(([key]) => key.startsWith("images"))
            .slice(0, 1)
            .map(([key, message]) => (
              <p key={key} className="text-[11px] text-destructive">
                {message}
              </p>
            ))}
          {values.images.some((url) => url.startsWith("https://")) && (
            <div className="flex flex-wrap gap-2 pt-1">
              {values.images
                .filter((url) => url.startsWith("https://"))
                .map((url) => (
                  <Thumb key={url} url={url} />
                ))}
            </div>
          )}
        </Card>

        <Card className="space-y-3 p-5">
          <div>
            <h2 className="text-sm font-semibold">Brochures and documents</h2>
            <p className="text-xs text-muted-foreground">Links to datasheets or brochures customers may download.</p>
          </div>
          <PairsEditor
            rows={values.documents}
            onChange={(rows) => set("documents", rows as ProductFormValues["documents"])}
            keys={["title", "url"]}
            placeholders={["Title (e.g. Brochure)", "https://…"]}
            addLabel="Add document"
            max={10}
          />
          {Object.entries(fields)
            .filter(([key]) => key.startsWith("documents"))
            .slice(0, 1)
            .map(([key, message]) => (
              <p key={key} className="text-[11px] text-destructive">
                {message}
              </p>
            ))}
        </Card>
      </fieldset>

      <div className="space-y-6">
        <fieldset disabled={disabled}>
          <Card className="space-y-4 p-5">
            <h2 className="text-sm font-semibold">Visibility</h2>
            <Field label="Status" htmlFor="status" hint="Only published products reach customers and the assistant.">
              <Select id="status" value={values.status} onChange={(event) => set("status", event.target.value as ProductFormValues["status"])}>
                <option value="DRAFT">Draft</option>
                <option value="PUBLISHED">Published</option>
                <option value="ARCHIVED">Archived</option>
              </Select>
            </Field>
            <Field label="Availability" htmlFor="availability" hint="Leave on “confirmed on request” unless stock is known.">
              <Select id="availability" value={values.availability} onChange={(event) => set("availability", event.target.value as ProductFormValues["availability"])}>
                {AVAILABILITY.map((value) => (
                  <option key={value} value={value}>
                    {AVAILABILITY_LABEL[value]}
                  </option>
                ))}
              </Select>
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Sort order" htmlFor="sortOrder">
                <Input id="sortOrder" type="number" min={0} max={9999} value={values.sortOrder} onChange={(event) => set("sortOrder", Number(event.target.value) || 0)} />
              </Field>
              <label className="mt-6 flex items-center gap-2 text-sm">
                <input type="checkbox" checked={values.isFeatured} onChange={(event) => set("isFeatured", event.target.checked)} className="size-4 accent-[hsl(var(--primary))]" />
                Featured
              </label>
            </div>
          </Card>
        </fieldset>

        <fieldset disabled={disabled}>
          <Card className="space-y-3 p-5">
            <div>
              <h2 className="text-sm font-semibold">Search words</h2>
              <p className="text-xs text-muted-foreground">Other words customers use for this product, so the assistant finds it.</p>
            </div>
            <ListEditor values={values.keywords} onChange={(list) => set("keywords", list)} placeholder="e.g. photostat" addLabel="Add word" />
          </Card>
        </fieldset>

        {related.length > 0 && (
          <fieldset disabled={disabled}>
            <Card className="space-y-3 p-5">
              <h2 className="text-sm font-semibold">Related products</h2>
              <div className="scroll-slim max-h-56 space-y-1.5 overflow-y-auto">
                {related.map((product) => (
                  <label key={product.id} className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      className="size-4 accent-[hsl(var(--primary))]"
                      checked={values.relatedIds.includes(product.id)}
                      onChange={(event) =>
                        set("relatedIds", event.target.checked ? [...values.relatedIds, product.id] : values.relatedIds.filter((id) => id !== product.id))
                      }
                    />
                    <span className="truncate">{product.name}</span>
                  </label>
                ))}
              </div>
              {fields.relatedIds && <p className="text-[11px] text-destructive">{fields.relatedIds}</p>}
            </Card>
          </fieldset>
        )}

        {canEdit && (
          <Card className="space-y-2 p-5">
            <Button type="submit" variant="brand" className="w-full" disabled={pending}>
              <Save /> {pending ? "Saving…" : productId ? "Save changes" : "Add product"}
            </Button>
            {productId && (
              <div className="flex gap-2">
                {values.status === "ARCHIVED" ? (
                  <Button type="button" variant="outline" size="sm" className="flex-1" onClick={() => setStatus("DRAFT")} disabled={pending}>
                    <ArchiveRestore /> Restore
                  </Button>
                ) : (
                  <Button type="button" variant="outline" size="sm" className="flex-1" onClick={() => setStatus("ARCHIVED")} disabled={pending}>
                    <Archive /> Archive
                  </Button>
                )}
                <ConfirmButton
                  title="Delete this product?"
                  message="This permanently removes the product. A product named on leads, quotes, tickets or customer records cannot be deleted — archive it instead."
                  confirmLabel="Delete product"
                  onConfirm={remove}
                  className="flex-1"
                >
                  <Trash2 /> Delete
                </ConfirmButton>
              </div>
            )}
          </Card>
        )}
      </div>
    </form>
  );
}

function Thumb({ url }: { url: string }) {
  const [broken, setBroken] = useState(false);
  const image = useRef<HTMLImageElement>(null);
  // An image that failed before hydration never fires onError for React.
  useEffect(() => {
    const element = image.current;
    if (element?.complete && element.naturalWidth === 0) setBroken(true);
  }, [url]);
  return (
    <span className="grid size-20 place-items-center overflow-hidden rounded-lg border bg-secondary">
      {broken ? (
        <ImageOff className="size-5 text-muted-foreground" aria-label="Image could not be loaded" />
      ) : (
        // eslint-disable-next-line @next/next/no-img-element -- staff-entered URLs on any host
        <img ref={image} src={url} alt="" className="size-full object-cover" onError={() => setBroken(true)} />
      )}
    </span>
  );
}
