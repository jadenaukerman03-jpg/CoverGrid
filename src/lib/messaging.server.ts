// Outbound texting: queue, quiet hours, provider delivery.
// Server-only. Never imported from client code directly.
import { logAttempt } from "./notify-rules.server";
import { db, logAudit } from "./staffing.server";

export type MessagingSettings = {
  smsEnabled: boolean;
  quietStart: number;
  quietEnd: number;
  retentionDays: number;
};

export async function getMessagingSettings(): Promise<MessagingSettings> {
  const { data } = await db
    .from("automation_settings")
    .select("id,sms_enabled,quiet_hours_start,quiet_hours_end,data_retention_days")
    .limit(1)
    .maybeSingle();
  return {
    smsEnabled: Boolean(data?.["sms_enabled"] ?? true),
    quietStart: Number(data?.["quiet_hours_start"] ?? 21),
    quietEnd: Number(data?.["quiet_hours_end"] ?? 6),
    retentionDays: Number(data?.["data_retention_days"] ?? 2555),
  };
}

export async function updateMessagingSettings(
  input: {
    smsEnabled?: boolean | undefined;
    quietStart?: number | undefined;
    quietEnd?: number | undefined;
    retentionDays?: number | undefined;
  },
  actorLabel: string,
) {
  const { data: row } = await db.from("automation_settings").select("id").limit(1).maybeSingle();
  if (!row) throw new Error("Settings are not available yet.");
  const patch: {
    sms_enabled?: boolean;
    quiet_hours_start?: number;
    quiet_hours_end?: number;
    data_retention_days?: number;
  } = {};
  if (input.smsEnabled !== undefined) patch["sms_enabled"] = input.smsEnabled;
  if (input.quietStart !== undefined)
    patch["quiet_hours_start"] = Math.max(0, Math.min(23, Math.round(input.quietStart)));
  if (input.quietEnd !== undefined)
    patch["quiet_hours_end"] = Math.max(0, Math.min(23, Math.round(input.quietEnd)));
  if (input.retentionDays !== undefined)
    patch["data_retention_days"] = Math.max(365, Math.min(3650, Math.round(input.retentionDays)));
  const { error } = await db.from("automation_settings").update(patch).eq("id", row.id);
  if (error) throw new Error(error.message);
  await logAudit(
    "messaging_settings_updated",
    actorLabel,
    "automation_settings",
    row.id as string,
    patch,
  );
  return getMessagingSettings();
}

export type NotifyPrefs = {
  onboarding: boolean;
  scheduleUpdates: boolean;
  deliveryFailures: boolean;
  undoWindowMinutes: number;
};

/** Which employee notifications are switched on for this facility. */
export async function getNotifyPrefs(): Promise<NotifyPrefs> {
  const { data } = await db
    .from("automation_settings")
    .select(
      "notify_onboarding,notify_schedule_updates,notify_delivery_failures,undo_window_minutes",
    )
    .limit(1)
    .maybeSingle();
  return {
    onboarding: Boolean(data?.["notify_onboarding"] ?? true),
    scheduleUpdates: Boolean(data?.["notify_schedule_updates"] ?? true),
    deliveryFailures: Boolean(data?.["notify_delivery_failures"] ?? true),
    undoWindowMinutes: Number(data?.["undo_window_minutes"] ?? 10),
  };
}

/**
 * Tell an employee about something, but only when that category of notification
 * is switched on. Always writes the in-app copy first so there is a history even
 * when texting is off or the phone number is missing.
 */
export async function notifyEmployee(input: {
  employeeId: string;
  title: string;
  body: string;
  category: "onboarding" | "schedule" | "reminders";
  text?: string | undefined;
  kind?: string | undefined;
  urgent?: boolean | undefined;
}) {
  const prefs = await getNotifyPrefs();
  const facilityOn =
    input.category === "onboarding"
      ? prefs.onboarding
      : input.category === "schedule"
        ? prefs.scheduleUpdates
        : true;
  if (!facilityOn) return { notified: false as const, reason: "turned_off" as const };

  const { resolveRule } = await import("./notify-rules.server");
  const rule = await resolveRule(input.employeeId, input.category);
  if (!rule.inApp && !rule.sms) return { notified: false as const, reason: "turned_off" as const };

  if (rule.inApp)
    await db.from("notifications").insert({
      employee_id: input.employeeId,
      audience: "employee",
      title: input.title,
      body: input.body,
    });
  if (input.text && rule.sms) {
    await queueText({
      employeeId: input.employeeId,
      body: input.text,
      kind: input.kind ?? input.category,
      urgent: input.urgent ?? false,
    }).catch(() => undefined);
  }
  return { notified: true as const };
}

/** True when the clock hour falls inside the do-not-disturb window. */
export function inQuietHours(hour: number, start: number, end: number) {
  if (start === end) return false;
  return start < end ? hour >= start && hour < end : hour >= start || hour < end;
}

function nextSendTime(now: Date, start: number, end: number) {
  const at = new Date(now);
  at.setMinutes(0, 0, 0);
  if (at.getHours() >= end) at.setDate(at.getDate() + 1);
  at.setHours(end);
  return at;
}

/** Anything that must reach a phone even at 3am. */
const URGENT = new Set(["open_shift", "call_off", "coverage"]);

function tidyPhone(raw: string | null | undefined) {
  const digits = (raw ?? "").replace(/[^\d]/g, "");
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  if (digits.length > 11) return `+${digits}`;
  return "";
}

export async function queueText(input: {
  employeeId?: string | null;
  phone?: string | null;
  body: string;
  kind?: string;
  urgent?: boolean;
}) {
  const settings = await getMessagingSettings();
  if (!settings.smsEnabled) return { queued: false, reason: "texting_off" as const };

  let phone = tidyPhone(input.phone);
  if (!phone && input.employeeId) {
    const { data } = await db
      .from("employees")
      .select("phone,sms_optin")
      .eq("id", input.employeeId)
      .maybeSingle();
    if (data && data["sms_optin"] === false) return { queued: false, reason: "opted_out" as const };
    phone = tidyPhone(data?.phone as string | null);
  }
  if (!phone) return { queued: false, reason: "no_phone" as const };

  const kind = input.kind ?? "general";
  const urgent = input.urgent ?? URGENT.has(kind);
  const now = new Date();
  const quiet = inQuietHours(now.getHours(), settings.quietStart, settings.quietEnd);
  const scheduledFor =
    !urgent && quiet ? nextSendTime(now, settings.quietStart, settings.quietEnd) : now;

  // Never send the same message to the same phone twice in a day.
  const since = new Date(now.getTime() - 24 * 3600_000).toISOString();
  const { data: dupe } = await db
    .from("message_outbox")
    .select("id")
    .eq("to_address", phone)
    .eq("body", input.body)
    .gte("created_at", since)
    .limit(1);
  if (dupe && dupe.length) return { queued: false, reason: "duplicate" as const };

  const { error } = await db.from("message_outbox").insert({
    employee_id: input.employeeId ?? null,
    channel: "sms",
    to_address: phone,
    body: input.body.slice(0, 480),
    kind,
    status: "queued",
    scheduled_for: scheduledFor.toISOString(),
  });
  if (error) throw new Error(error.message);
  return { queued: true, scheduledFor: scheduledFor.toISOString() };
}

/** Notification in the app plus a text on the phone, in one call. */
export async function notifyAndText(input: {
  employeeId: string;
  title: string;
  body: string;
  kind?: string;
  urgent?: boolean;
}) {
  await db.from("notifications").insert({
    employee_id: input.employeeId,
    audience: "employee",
    title: input.title,
    body: input.body,
  });
  return queueText({
    employeeId: input.employeeId,
    body: `${input.title}: ${input.body}`,
    ...(input.kind === undefined ? {} : { kind: input.kind }),
    ...(input.urgent === undefined ? {} : { urgent: input.urgent }),
  });
}

function providerConfig() {
  const sid = process.env["TWILIO_ACCOUNT_SID"];
  const token = process.env["TWILIO_AUTH_TOKEN"];
  const from = process.env["TWILIO_FROM_NUMBER"];
  if (!sid || !token || !from) return null;
  return { sid, token, from };
}

export function textingConfigured() {
  return providerConfig() !== null;
}

async function sendOne(to: string, body: string) {
  const cfg = providerConfig();
  if (!cfg) throw new Error("Texting is not connected yet.");
  const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${cfg.sid}/Messages.json`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${btoa(`${cfg.sid}:${cfg.token}`)}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({ To: to, From: cfg.from, Body: body }).toString(),
  });
  const json = (await res.json().catch(() => ({}))) as { sid?: string; message?: string };
  if (!res.ok) throw new Error(json.message ?? `Delivery failed (${res.status})`);
  return json.sid ?? "";
}

/** Delivers anything due. Runs inside the hourly cycle and on demand. */
export async function flushOutbox(limit = 40) {
  const { data: due } = await db
    .from("message_outbox")
    .select("*")
    .eq("status", "queued")
    .lte("scheduled_for", new Date().toISOString())
    .order("scheduled_for", { ascending: true })
    .limit(limit);

  const rows = due ?? [];
  if (!rows.length) return { sent: 0, failed: 0, waiting: 0, configured: textingConfigured() };
  if (!textingConfigured()) {
    return { sent: 0, failed: 0, waiting: rows.length, configured: false };
  }

  let sent = 0;
  let failed = 0;
  const hardFailures: Array<{ to_address: string; kind: string; error?: string }> = [];
  for (const row of rows) {
    try {
      const providerId = await sendOne(row.to_address as string, row.body as string);
      await db
        .from("message_outbox")
        .update({
          status: "sent",
          provider_id: providerId,
          sent_at: new Date().toISOString(),
          attempts: Number(row.attempts ?? 0) + 1,
          error: "",
        })
        .eq("id", row.id);
      sent += 1;
      await logAttempt({
        messageId: String(row.id),
        employeeId: (row.employee_id as string | null) ?? null,
        attemptNo: Number(row.attempts ?? 0) + 1,
        status: "sent",
        toAddress: String(row.to_address ?? ""),
      });
    } catch (err) {
      const attempts = Number(row.attempts ?? 0) + 1;
      await db
        .from("message_outbox")
        .update({
          status: attempts >= 3 ? "failed" : "queued",
          attempts,
          error: err instanceof Error ? err.message : "Delivery failed",
          scheduled_for: new Date(Date.now() + 15 * 60_000).toISOString(),
        })
        .eq("id", row.id);
      failed += 1;
      await logAttempt({
        messageId: String(row.id),
        employeeId: (row.employee_id as string | null) ?? null,
        attemptNo: attempts,
        status: attempts >= 3 ? "failed" : "retrying",
        error: err instanceof Error ? err.message : "Delivery failed",
        toAddress: String(row.to_address ?? ""),
      });
      if (attempts >= 3)
        hardFailures.push({
          to_address: String(row.to_address ?? ""),
          kind: String(row.kind ?? "message"),
          error: err instanceof Error ? err.message : "Delivery failed",
        });
    }
  }

  if (hardFailures.length) {
    const prefs = await getNotifyPrefs();
    if (prefs.deliveryFailures) {
      await db.from("notifications").insert({
        audience: "manager",
        title: `${hardFailures.length} text message${hardFailures.length === 1 ? "" : "s"} could not be delivered`,
        body: hardFailures
          .slice(0, 5)
          .map((f) => `${f.to_address} (${f.kind}) — ${f.error ?? "delivery failed"}`)
          .join(" · ")
          .concat(". Check the number on the Text alerts page and resend."),
      });
    }
  }
  return { sent, failed, waiting: 0, configured: true };
}

export async function outboxBoard() {
  const since = new Date(Date.now() - 7 * 24 * 3600_000).toISOString();
  const [{ data: recent }, settings] = await Promise.all([
    db
      .from("message_outbox")
      .select("id,employee_id,to_address,body,kind,status,error,scheduled_for,sent_at,created_at")
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .limit(80),
    getMessagingSettings(),
  ]);
  const rows = recent ?? [];
  const ids = [...new Set(rows.map((r) => r.employee_id).filter(Boolean))] as string[];
  const { data: emps } = ids.length
    ? await db.from("employees").select("id,full_name").in("id", ids)
    : { data: [] as { id: string; full_name: string }[] };
  const nameOf = new Map((emps ?? []).map((e) => [e.id, e.full_name]));

  const { count: optedOut } = await db
    .from("employees")
    .select("id", { count: "exact", head: true })
    .eq("is_active", true)
    .eq("sms_optin", false);
  const { count: noPhone } = await db
    .from("employees")
    .select("id", { count: "exact", head: true })
    .eq("is_active", true)
    .or("phone.is.null,phone.eq.");

  return {
    configured: textingConfigured(),
    settings,
    optedOut: optedOut ?? 0,
    noPhone: noPhone ?? 0,
    counts: {
      queued: rows.filter((r) => r.status === "queued").length,
      sent: rows.filter((r) => r.status === "sent").length,
      failed: rows.filter((r) => r.status === "failed").length,
    },
    messages: rows.map((r) => ({
      id: r.id as string,
      name: r.employee_id
        ? (nameOf.get(r.employee_id as string) ?? "Staff member")
        : "Direct number",
      to: r.to_address as string,
      body: r.body as string,
      kind: r.kind as string,
      status: r.status as string,
      error: (r.error as string) ?? "",
      scheduledFor: r.scheduled_for as string,
      sentAt: (r.sent_at as string | null) ?? null,
    })),
  };
}

export async function setSmsOptin(employeeId: string, optin: boolean) {
  const { error } = await db.from("employees").update({ sms_optin: optin }).eq("id", employeeId);
  if (error) throw new Error(error.message);
  return { optin };
}

/** Test text so a manager can prove delivery works before go-live. */
export async function sendTestText(phone: string, actorLabel: string) {
  const to = tidyPhone(phone);
  if (!to) throw new Error("Enter a 10-digit phone number.");
  const body = "CoverGrid test message — texting is working. No action needed.";
  if (!textingConfigured()) {
    await db.from("message_outbox").insert({
      to_address: to,
      body,
      kind: "test",
      status: "queued",
      channel: "sms",
    });
    return { sent: false, message: "Saved. It will go out as soon as texting is connected." };
  }
  const providerId = await sendOne(to, body);
  await db.from("message_outbox").insert({
    to_address: to,
    body,
    kind: "test",
    status: "sent",
    provider_id: providerId,
    channel: "sms",
    sent_at: new Date().toISOString(),
  });
  await logAudit("test_text_sent", actorLabel, "message_outbox", null, { to });
  return { sent: true, message: "Test text sent." };
}
