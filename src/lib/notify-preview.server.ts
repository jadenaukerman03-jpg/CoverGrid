// Dry-run a notification: show the exact wording and exactly who would get it,
// before anything actually goes out. Server-only.
import { db, loadActor, requireManager } from "./staffing.server";
import { CATEGORY_LABEL, resolveRule, roleOfEmployee, type Category } from "./notify-rules.server";

export type PreviewRecipient = {
  name: string;
  who: string;
  role: string;
  inApp: boolean;
  sms: boolean;
  phone: string;
  smsNote: string;
  source: "person" | "role" | "default";
};

function tidyPhone(raw: string | null | undefined) {
  const digits = (raw ?? "").replace(/[^\d]/g, "");
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  return digits ? `+${digits}` : "";
}

async function employeeRecipient(
  employeeId: string,
  who: string,
  category: Category,
  smsEnabled: boolean,
): Promise<PreviewRecipient | null> {
  const { data: emp } = await db
    .from("employees")
    .select("id, full_name, phone, sms_optin")
    .eq("id", employeeId)
    .maybeSingle();
  if (!emp) return null;
  const rule = await resolveRule(employeeId, category);
  const role = await roleOfEmployee(employeeId);
  const phone = tidyPhone(emp.phone as string | null);
  let smsNote = "";
  if (!rule.sms) smsNote = "text turned off in their rules";
  else if (!smsEnabled) smsNote = "texting is switched off for the whole facility";
  else if (emp["sms_optin"] === false) smsNote = "they opted out of texts";
  else if (!phone) smsNote = "no phone number on file";
  return {
    name: emp.full_name as string,
    who,
    role,
    inApp: rule.inApp,
    sms: rule.sms && smsEnabled && emp["sms_optin"] !== false && Boolean(phone),
    phone,
    smsNote,
    source: rule.source,
  };
}

/**
 * Build the exact onboarding-handoff message for one new hire and work out who
 * would receive it, without sending anything. Optionally send a copy to the
 * manager running the test so they can see it land on their own phone.
 */
export async function previewNotificationAction(
  userId: string,
  input: { category: Category; newHireId?: string | null; sendTest?: boolean },
) {
  const actor = await loadActor(userId);
  requireManager(actor);
  const category = input.category;

  const { getMessagingSettings, getNotifyPrefs, queueText } = await import("./messaging.server");
  const [settings, prefs] = await Promise.all([getMessagingSettings(), getNotifyPrefs()]);
  const facilityOn =
    category === "onboarding"
      ? prefs.onboarding
      : category === "schedule"
        ? prefs.scheduleUpdates
        : true;

  // Pick the hire this preview is built around.
  let hire: Record<string, unknown> | null = null;
  if (input.newHireId) {
    const { data } = await db.from("new_hires").select("*").eq("id", input.newHireId).maybeSingle();
    hire = data ?? null;
  } else {
    const { data } = await db
      .from("new_hires")
      .select("*")
      .is("employee_id", null)
      .order("created_at", { ascending: false })
      .limit(1);
    hire = data?.[0] ?? null;
  }

  const hireName = (hire?.["full_name"] as string) ?? "Jordan Sample";
  const startDate = (hire?.["start_date"] as string | null) ?? null;
  const position = (hire?.["position"] as string) ?? "cna";

  let unitName = "the unit";
  if (hire?.["unit_id"]) {
    const { data: unit } = await db
      .from("units")
      .select("name")
      .eq("id", hire["unit_id"] as string)
      .maybeSingle();
    unitName = (unit?.name as string) ?? unitName;
  }

  const title =
    category === "onboarding"
      ? `${hireName} is ready to hand off to the floor`
      : `Schedule update for ${hireName}`;
  const body =
    category === "onboarding"
      ? `${hireName} (${position.toUpperCase()}) is cleared to start${startDate ? ` on ${startDate}` : ""} on ${unitName}. Paperwork, screening and orientation are handled — they go on the schedule in orientation mode with their preceptor.`
      : `${hireName}'s shift on ${unitName} has changed. Check the schedule for the new details.`;
  const text =
    category === "onboarding"
      ? `${hireName} starts${startDate ? ` ${startDate}` : " soon"} on ${unitName} in orientation. Everything is cleared — no action needed unless something changes.`
      : `Schedule change for ${hireName} on ${unitName}. Open the app for details.`;

  // Who would hear about it.
  const recipients: PreviewRecipient[] = [];
  const seen = new Set<string>();

  if (hire?.["phone"]) {
    const phone = tidyPhone(hire["phone"] as string);
    recipients.push({
      name: hireName,
      who: "the new hire",
      role: "new hire",
      inApp: false,
      sms: Boolean(phone) && settings.smsEnabled,
      phone,
      smsNote: !settings.smsEnabled
        ? "texting is switched off for the whole facility"
        : phone
          ? ""
          : "no phone number on file",
      source: "default",
    });
  }

  if (hire?.["preceptor_id"]) {
    const r = await employeeRecipient(
      hire["preceptor_id"] as string,
      "preceptor",
      category,
      settings.smsEnabled,
    );
    if (r) {
      recipients.push(r);
      seen.add(hire["preceptor_id"] as string);
    }
  }

  // Every manager and admin on the roster.
  const { data: roleRows } = await db
    .from("user_roles")
    .select("user_id, role")
    .in("role", ["manager", "admin"]);
  const managerUserIds = [...new Set((roleRows ?? []).map((r) => String(r["user_id"])))];
  if (managerUserIds.length) {
    const { data: mgrs } = await db.from("employees").select("id").in("user_id", managerUserIds);
    for (const m of mgrs ?? []) {
      const id = m.id as string;
      if (seen.has(id)) continue;
      seen.add(id);
      const r = await employeeRecipient(id, "manager on duty", category, settings.smsEnabled);
      if (r) recipients.push(r);
    }
  }

  const now = new Date();
  const { inQuietHours } = await import("./messaging.server");
  const quiet = inQuietHours(now.getHours(), settings.quietStart, settings.quietEnd);

  let testResult: string | null = null;
  if (input.sendTest) {
    const me = actor.employee?.id ?? null;
    if (!me) {
      testResult =
        "Your login is not linked to a roster record, so there is nowhere to send the test.";
    } else {
      await db.from("notifications").insert({
        employee_id: me,
        audience: "employee",
        title: `TEST — ${title}`,
        body: `${body}\n\n(This was a test. Nobody else received it.)`,
      });
      const res = await queueText({
        employeeId: me,
        body: `TEST — ${text}`,
        kind: "test",
        urgent: true,
      }).catch(() => ({ queued: false, reason: "error" as const }));
      testResult = res.queued
        ? "Test sent to you — in the app and by text. Nobody else got it."
        : `Test posted to your notifications. Text not sent (${String((res as { reason?: string }).reason ?? "unavailable").replace(/_/g, " ")}).`;
    }
  }

  return {
    category,
    categoryLabel: CATEGORY_LABEL[category],
    hire: hire ? { id: hire["id"] as string, name: hireName, startDate } : null,
    sample: !hire,
    title,
    body,
    text,
    facilityOn,
    facilityNote: facilityOn
      ? ""
      : `${CATEGORY_LABEL[category]} messages are switched off for the whole facility in Settings — nothing would go out.`,
    smsEnabled: settings.smsEnabled,
    quiet,
    quietNote: quiet
      ? `It is quiet hours (${settings.quietStart}:00–${settings.quietEnd}:00), so non-urgent texts would wait until ${settings.quietEnd}:00.`
      : "",
    recipients,
    counts: {
      inApp: recipients.filter((r) => r.inApp).length,
      sms: recipients.filter((r) => r.sms).length,
      total: recipients.length,
    },
    testResult,
  };
}
