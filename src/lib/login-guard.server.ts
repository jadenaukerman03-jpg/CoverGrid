// Slows down and temporarily locks out repeated wrong-password tries. Server-only.
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const WINDOW_MINUTES = 15;
/** Wrong tries allowed in the window before the account is held. */
const EMAIL_LIMIT = 5;
/** Wrong tries allowed from one network address before it is held. */
const IP_LIMIT = 12;

/** Escalating hold, in minutes, by how many times the limit has already been blown through. */
const HOLDS = [15, 30, 60, 120, 240];

export type LoginGate = {
  allowed: boolean;
  lockedUntil: string | null;
  minutesLeft: number;
  triesLeft: number;
  message: string | null;
};

function holdMinutes(failures: number, limit: number) {
  const step = Math.max(0, Math.floor((failures - limit) / limit));
  return HOLDS[Math.min(step, HOLDS.length - 1)]!;
}

async function recentFailures(column: "email" | "ip", value: string, sinceIso: string) {
  const query = supabaseAdmin
    .from("login_attempts")
    .select("created_at")
    .eq("succeeded", false)
    .gte("created_at", sinceIso)
    .order("created_at", { ascending: false })
    .limit(200);
  const { data } =
    column === "email" ? await query.ilike("email", value) : await query.eq("ip", value);
  return (data ?? []).map((r) => new Date(r.created_at as string).getTime());
}

/** Ask, before touching the sign-in service, whether this person is allowed another try. */
export async function checkLoginGate(email: string, ip: string): Promise<LoginGate> {
  const cleanEmail = email.trim().toLowerCase();
  if (!cleanEmail)
    return {
      allowed: true,
      lockedUntil: null,
      minutesLeft: 0,
      triesLeft: EMAIL_LIMIT,
      message: null,
    };

  const sinceIso = new Date(Date.now() - WINDOW_MINUTES * 60_000).toISOString();
  const [byEmail, byIp] = await Promise.all([
    recentFailures("email", cleanEmail, sinceIso),
    ip === "unknown" ? Promise.resolve([] as number[]) : recentFailures("ip", ip, sinceIso),
  ]);

  const holds: number[] = [];
  if (byEmail.length >= EMAIL_LIMIT)
    holds.push(byEmail[0]! + holdMinutes(byEmail.length, EMAIL_LIMIT) * 60_000);
  if (byIp.length >= IP_LIMIT) holds.push(byIp[0]! + holdMinutes(byIp.length, IP_LIMIT) * 60_000);

  const until = holds.length > 0 ? Math.max(...holds) : 0;
  if (until > Date.now()) {
    const minutesLeft = Math.max(1, Math.ceil((until - Date.now()) / 60_000));
    return {
      allowed: false,
      lockedUntil: new Date(until).toISOString(),
      minutesLeft,
      triesLeft: 0,
      message: `Too many wrong passwords. Sign-in for this email is on hold for ${minutesLeft} minute${
        minutesLeft === 1 ? "" : "s"
      }. Use "Forgot password" to reset it instead.`,
    };
  }

  return {
    allowed: true,
    lockedUntil: null,
    minutesLeft: 0,
    triesLeft: Math.max(0, EMAIL_LIMIT - byEmail.length),
    message: null,
  };
}

/** Write down how the try went, so the next check knows about it. */
export async function recordLoginAttempt(
  email: string,
  ip: string,
  succeeded: boolean,
  reason?: string,
) {
  const cleanEmail = email.trim().toLowerCase();
  if (!cleanEmail) return;
  await supabaseAdmin.from("login_attempts").insert({
    email: cleanEmail,
    ip,
    succeeded,
    reason: reason ?? null,
  });
  // A good sign-in clears the slate for that email.
  if (succeeded)
    await supabaseAdmin
      .from("login_attempts")
      .delete()
      .ilike("email", cleanEmail)
      .eq("succeeded", false);
}

/** Housekeeping: attempts older than a day are no longer useful. */
export async function purgeOldAttempts() {
  const cutoff = new Date(Date.now() - 86_400_000).toISOString();
  await supabaseAdmin.from("login_attempts").delete().lt("created_at", cutoff);
}
