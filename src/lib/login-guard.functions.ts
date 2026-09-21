import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { z } from "zod";

const emailInput = z.object({ email: z.string().trim().email().max(255) });
const signInInput = emailInput.extend({ password: z.string().min(1).max(200) });

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

/**
 * The only way the app signs a user in. Checks the lockout gate and verifies
 * the password server-side as one step, so the lockout can't be bypassed by
 * calling Supabase Auth directly from the browser.
 */
export const signInGuarded = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => signInInput.parse(d))
  .handler(async ({ data }) => {
    const { attemptSignIn, purgeOldAttempts } = await import("./login-guard.server");
    if (Math.random() < 0.05) await purgeOldAttempts();
    return attemptSignIn(data.email, data.password, callerIp());
  });
