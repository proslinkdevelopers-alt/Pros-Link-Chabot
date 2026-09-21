import type { NextRequest } from "next/server";
import { prisma } from "./db";
import { rateLimit } from "./redis";
import type { SubmissionResult } from "@/types";

/**
 * Small helpers shared by the public submission endpoints (leads, meetings,
 * tickets) so rate limiting, client identification, conversation
 * linking and response shape stay identical across all of them.
 */

/** Best-effort client IP, used for rate limiting and audit logs. */
export function clientIp(req: NextRequest): string {
  return (
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    req.headers.get("x-real-ip") ??
    "anonymous"
  );
}

/**
 * Apply a fixed-window rate limit. Returns a ready-to-send 429 response when
 * the caller is over the limit, or `null` when the request may proceed.
 *
 * Submission limits are tighter than chat: a person filling in a form legitimately
 * submits it once, not eight times a minute.
 */
export async function throttle(
  req: NextRequest,
  bucket: string,
  limit = 5,
  windowSeconds = 300
): Promise<Response | null> {
  const { allowed } = await rateLimit(`${bucket}:${clientIp(req)}`, limit, windowSeconds);
  if (allowed) return null;
  return Response.json(
    {
      ok: false,
      message:
        "We've received several submissions from you already. Please wait a few minutes and try again.",
    } satisfies SubmissionResult,
    { status: 429 }
  );
}

/**
 * Resolve a conversation reference to its database id so a submission can be
 * linked back to the chat that produced it. Returns `undefined` when the
 * reference is unknown or the database is unavailable — the submission is still
 * worth saving without the link.
 */
export async function conversationIdFor(
  reference?: string | null
): Promise<string | undefined> {
  if (!reference) return undefined;
  try {
    const conversation = await prisma.conversation.findUnique({
      where: { reference },
      select: { id: true },
    });
    return conversation?.id;
  } catch {
    return undefined;
  }
}

/** Uniform 400 for a failed Zod parse. */
export function invalid(message = "Please check the form and try again."): Response {
  return Response.json({ ok: false, message } satisfies SubmissionResult, {
    status: 400,
  });
}

/** Uniform 500 used when persistence fails. */
export function failed(
  message = "We couldn't save that right now. Please try again in a moment."
): Response {
  return Response.json({ ok: false, message } satisfies SubmissionResult, {
    status: 500,
  });
}

/** Uniform 201 with the customer-facing reference number. */
export function created(reference: string, message: string): Response {
  return Response.json(
    { ok: true, reference, message } satisfies SubmissionResult,
    { status: 201 }
  );
}
