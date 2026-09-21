"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, CheckCircle2, Loader2, Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/ui/field";
import { Logo } from "@/components/branding/Logo";
import { Credit } from "@/components/branding/Credit";
import { BRAND } from "@/config/brand";

const CONSOLE_POINTS = [
  "Leads, quote requests and the sales pipeline",
  "Service tickets from request to resolution",
  "Web and WhatsApp conversations in one inbox",
  "Customers, products and reports",
];

/** Only same-site console paths are honoured, so `?next=` cannot send anyone off-site. */
function safeNext(value: string | null): string {
  return value && value.startsWith("/admin") && !value.startsWith("//") ? value : "/admin";
}

/**
 * Staff sign-in. There is no registration: accounts are created by an
 * administrator in Admin → Team.
 */
export default function LoginPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const form = new FormData(e.currentTarget);

    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: form.get("email"), password: form.get("password") }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error ?? "Sign-in failed. Please try again.");

      router.push(safeNext(new URLSearchParams(window.location.search).get("next")));
      router.refresh();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Sign-in failed. Please try again.");
      setLoading(false);
    }
  }

  return (
    <div className="grid min-h-dvh bg-background lg:grid-cols-[1.05fr_1fr]">
      {/* Brand panel */}
      <aside className="dark brand-gradient relative hidden overflow-hidden text-foreground lg:flex lg:flex-col lg:justify-between lg:p-12">
        <div className="bg-grid pointer-events-none absolute inset-0" aria-hidden />
        <div className="relative">
          <Logo descriptor="Admin" size="lg" />
        </div>

        <div className="relative max-w-md">
          <p className="eyebrow text-white/60">{BRAND.console.name}</p>
          <h1 className="mt-4 text-balance text-4xl font-extrabold leading-tight tracking-tightest text-white">
            Customer service, sales and support in one place.
          </h1>
          <ul className="mt-8 space-y-3">
            {CONSOLE_POINTS.map((point) => (
              <li key={point} className="flex items-center gap-3 text-[15px] text-white/75">
                <CheckCircle2 className="size-5 shrink-0 text-brand-sky" aria-hidden />
                {point}
              </li>
            ))}
          </ul>
        </div>

        <Credit className="relative text-white/40" />
      </aside>

      {/* Form */}
      <main className="flex items-center justify-center px-5 py-12 sm:px-10">
        <div className="w-full max-w-sm">
          <div className="mb-10 lg:hidden">
            <Logo tone="dark" descriptor="Admin" />
          </div>

          <h2 className="text-2xl font-bold tracking-tight">Sign in to {BRAND.console.name}</h2>
          <p className="mt-2 text-sm text-muted-foreground">Use the staff account your administrator created for you.</p>

          <form onSubmit={onSubmit} className="mt-8 space-y-4" noValidate={false}>
            <Field label="Email address" htmlFor="email" required>
              <Input id="email" name="email" type="email" autoComplete="email" required autoFocus />
            </Field>
            <Field label="Password" htmlFor="password" required>
              <Input id="password" name="password" type="password" autoComplete="current-password" required />
            </Field>

            {error && (
              <p role="alert" className="rounded-lg border border-destructive/20 bg-destructive/[0.06] px-3 py-2 text-sm text-destructive">
                {error}
              </p>
            )}

            <Button type="submit" variant="brand" size="lg" className="w-full" disabled={loading}>
              {loading ? <Loader2 className="animate-spin" /> : <Lock />}
              Sign in
              {!loading && <ArrowRight />}
            </Button>
          </form>

          <p className="mt-8 text-center text-sm text-muted-foreground">
            Looking for help as a customer?{" "}
            <Link href="/chat" className="font-semibold text-primary hover:underline">
              Open the {BRAND.assistant.name}
            </Link>
          </p>
        </div>
      </main>
    </div>
  );
}
