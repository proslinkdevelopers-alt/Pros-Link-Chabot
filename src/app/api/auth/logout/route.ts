import { NextRequest } from "next/server";
import { sessionCookie } from "@/lib/auth";
import { getSession } from "@/lib/session";
import { clientIpOf, logEvent } from "@/lib/notify";

export const runtime = "nodejs";

/** Clear the session cookie. */
export async function POST(req: NextRequest) {
  const session = await getSession();
  if (session) {
    await logEvent({
      action: "auth.logout",
      entity: "User",
      entityId: session.sub,
      userId: session.sub,
      message: `${session.name} signed out.`,
      ipAddress: clientIpOf(req),
    });
  }
  const res = Response.json({ ok: true });
  res.headers.append("Set-Cookie", sessionCookie("", 0));
  return res;
}
