import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { z } from "zod";

const emailInput = z.object({ email: z.string().trim().email().max(255) });

function callerIp(): string {
  try {
    const req = getRequest();
    const header =
      req.headers.get("cf-connecting-ip") ??
      req.headers.get("x-forwarded-for") ??
      req.headers.get("x-real-ip") ??
      "";
    const first = header.split(",")[0]?.trim();
    return first && first.length > 0 ? first.slice(0, 64) : "unknown";
  } catch {
    return "unknown";
  }
}

/** Called before a sign-in try. Says whether this email is currently on hold. */
export const checkLoginAllowed = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => emailInput.parse(d))
  .handler(async ({ data }) => {
    const { checkLoginGate, purgeOldAttempts } = await import("./login-guard.server");
    if (Math.random() < 0.05) await purgeOldAttempts();
    return checkLoginGate(data.email, callerIp());
  });

/** Called after a sign-in try, with how it went. */
export const reportLoginResult = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    emailInput.extend({ succeeded: z.boolean(), reason: z.string().max(200).optional() }).parse(d),
  )
  .handler(async ({ data }) => {
    const { checkLoginGate, recordLoginAttempt } = await import("./login-guard.server");
    const ip = callerIp();
    await recordLoginAttempt(data.email, ip, data.succeeded, data.reason);
    if (data.succeeded)
      return { allowed: true, minutesLeft: 0, triesLeft: 5, lockedUntil: null, message: null };
    return checkLoginGate(data.email, ip);
  });
