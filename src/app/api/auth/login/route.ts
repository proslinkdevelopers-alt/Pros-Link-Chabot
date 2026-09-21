import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { canAccessAdmin, sessionCookie, signSession, verifyPassword } from "@/lib/auth";
import { config } from "@/lib/config";
import { rateLimit, resetRateLimit } from "@/lib/redis";
import { clientIpOf, logEvent } from "@/lib/notify";

export const runtime = "nodejs";

const schema = z.object({
  email: z.string().trim().toLowerCase().email().max(160),
  password: z.string().min(1).max(128),
});

/** Attempts allowed per window, per IP address and per account. */
const PER_IP = 20;
const PER_ACCOUNT = 6;
const WINDOW_SECONDS = 15 * 60;

/**
 * A bcrypt hash of a random string nobody knows. Compared against when the email
 * has no account, so a missing account costs the same time as a wrong password
 * and response times do not reveal which emails exist.
 */
const DUMMY_HASH = "$2b$12$E88Bl22caerIuaJV9PSlOeBCfzN60EkKnbsQoMJ/MCAXBiwd/02.6";

/**
 * Staff sign-in.
 *
 * Every failure answers with the same message, so the response never says
 * whether an email belongs to an account — or to another tenant's account.
 * Attempts are throttled per IP and per email, and every outcome is audited.
 */
export async function POST(req: NextRequest) {
  const ip = clientIpOf(req) ?? "unknown";
  const userAgent = req.headers.get("user-agent") ?? undefined;

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return Response.json({ error: "Enter a valid email and password." }, { status: 400 });
  }
  const { email, password } = parsed.data;

  const [byIp, byAccount] = await Promise.all([
    rateLimit(`login:ip:${ip}`, PER_IP, WINDOW_SECONDS),
    rateLimit(`login:account:${email}`, PER_ACCOUNT, WINDOW_SECONDS),
  ]);
  if (!byIp.allowed || !byAccount.allowed) {
    await logEvent({
      level: "WARN",
      action: "auth.login.throttled",
      entity: "User",
      message: `Sign-in throttled for ${email}.`,
      ipAddress: ip,
      userAgent,
    });
    return Response.json(
      { error: "Too many sign-in attempts. Please wait 15 minutes and try again." },
      { status: 429 }
    );
  }

  const invalid = () => Response.json({ error: "Invalid email or password." }, { status: 401 });

  try {
    const user = await prisma.user.findUnique({ where: { email } });
    const passwordOk = await verifyPassword(password, user?.passwordHash ?? DUMMY_HASH);

    if (!user || !user.passwordHash || !passwordOk || !user.isActive || !canAccessAdmin(user)) {
      await logEvent({
        level: "WARN",
        action: "auth.login.failed",
        entity: "User",
        // Only a reason category is recorded, never the password.
        message: `Failed sign-in for ${email}: ${!user || !passwordOk ? "wrong email or password" : !user.isActive ? "account deactivated" : "not a console account"}.`,
        ipAddress: ip,
        userAgent,
      });
      return invalid();
    }

    await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
    await resetRateLimit(`login:account:${email}`);
    await logEvent({
      action: "auth.login",
      entity: "User",
      entityId: user.id,
      userId: user.id,
      message: `${user.name} signed in.`,
      ipAddress: ip,
      userAgent,
    });

    const token = await signSession({ sub: user.id, role: user.role, name: user.name, department: user.department });
    const res = Response.json({ user: { id: user.id, name: user.name, role: user.role } });
    res.headers.append("Set-Cookie", sessionCookie(token, config.jwt.maxAgeSeconds));
    return res;
  } catch (e) {
    console.error("[login] error:", e);
    return Response.json({ error: "Sign-in is unavailable right now. Please try again later." }, { status: 500 });
  }
}
