"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "./toast";

export interface ApiResult<T = Record<string, unknown>> {
  ok: boolean;
  data: T & { error?: string; fields?: Record<string, string> };
  status: number;
}

/** JSON request to a console API route. Never throws. */
export async function api<T = Record<string, unknown>>(
  method: "GET" | "POST" | "PATCH" | "PUT" | "DELETE",
  url: string,
  body?: unknown
): Promise<ApiResult<T>> {
  try {
    const res = await fetch(url, {
      method,
      headers: body === undefined ? undefined : { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const data = (await res.json().catch(() => ({}))) as ApiResult<T>["data"];
    return { ok: res.ok, data, status: res.status };
  } catch {
    return { ok: false, data: { error: "Network error — check your connection and try again." } as ApiResult<T>["data"], status: 0 };
  }
}

/**
 * A mutation with pending state, field errors, a toast and a refresh of the
 * server-rendered page on success.
 */
export function useMutation() {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [fields, setFields] = useState<Record<string, string>>({});

  async function run<T = Record<string, unknown>>(
    method: "POST" | "PATCH" | "PUT" | "DELETE",
    url: string,
    body?: unknown,
    options: { success?: string; refresh?: boolean } = {}
  ): Promise<ApiResult<T>> {
    setPending(true);
    setFields({});
    const result = await api<T>(method, url, body);
    setPending(false);
    if (!result.ok) {
      setFields(result.data.fields ?? {});
      toast.error(result.data.error ?? "Something went wrong.");
      return result;
    }
    if (options.success) toast.success(options.success);
    if (options.refresh !== false) router.refresh();
    return result;
  }

  return { run, pending, fields, setFields };
}
