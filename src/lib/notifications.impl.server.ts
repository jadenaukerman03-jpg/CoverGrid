import { diagnoseDelivery, type Diagnosis } from "./notification-diagnostics";
import { db, loadActor } from "./staffing.server";

export type HistoryItem = {
  id: string;
  channel: "in_app" | "text";
  title: string;
  body: string;
  status: string;
  statusNote: string;
  at: string;
  attempts?: Array<{ attemptNo: number; status: string; error: string; actor: string; at: string }>;
  diagnosis?: Diagnosis;
};

const DELIVERY_LABEL: Record<string, string> = {
  queued: "Waiting to send",
  sent: "Delivered",
  failed: "Could not be delivered",
  cancelled: "Cancelled",
};

/** Everything this person has been told, in the app and by text, newest first. */
export async function notificationHistoryQuery(userId: string) {
  const actor = await loadActor(userId);
  const employeeId = actor.employee?.id ?? null;
  const isManager = actor.role === "manager" || actor.role === "admin";

  const since = new Date(Date.now() - 60 * 24 * 3600_000).toISOString();

  const notifQuery = db
    .from("notifications")
    .select("id, title, body, read, created_at, employee_id, audience")
    .gte("created_at", since)
    .order("created_at", { ascending: false })
    .limit(150);

  const { data: notifs } = employeeId
    ? await notifQuery.or(
        isManager
          ? `employee_id.eq.${employeeId},audience.eq.manager,audience.eq.all`
          : `employee_id.eq.${employeeId},audience.eq.all`,
      )
    : await notifQuery.in("audience", isManager ? ["manager", "all"] : ["all"]);

  const { data: texts } = employeeId
    ? await db
        .from("message_outbox")
        .select(
          "id, body, kind, status, error, attempts, to_address, scheduled_for, sent_at, created_at",
        )
        .eq("employee_id", employeeId)
        .gte("created_at", since)
        .order("created_at", { ascending: false })
        .limit(100)
    : { data: [] as Array<Record<string, unknown>> };

  const items: HistoryItem[] = [
    ...(notifs ?? []).map((n) => ({
      id: `n-${n.id}`,
      channel: "in_app" as const,
      title: n.title as string,
      body: n.body as string,
      status: n.read ? "read" : "unread",
      statusNote: n.read ? "Read" : "New",
      at: n.created_at as string,
    })),
    ...((texts ?? []) as Array<Record<string, unknown>>).map((t) => ({
      id: `t-${String(t["id"])}`,
      channel: "text" as const,
      title: `Text message · ${String(t["kind"] ?? "notice")}`,
      body: String(t["body"] ?? ""),
      status: String(t["status"] ?? "queued"),
      statusNote:
        String(t["status"]) === "failed"
          ? `Could not be delivered to ${String(t["to_address"] ?? "the number on file")} — ${String(t["error"] ?? "delivery failed")}`
          : (DELIVERY_LABEL[String(t["status"])] ?? String(t["status"])),
      at: String(t["sent_at"] ?? t["created_at"]),
      diagnosis: diagnoseDelivery({
        status: String(t["status"] ?? "queued"),
        error: (t["error"] as string) ?? "",
        attempts: Number(t["attempts"] ?? 0),
        scheduledFor: (t["scheduled_for"] as string) ?? null,
        sentAt: (t["sent_at"] as string) ?? null,
      }),
    })),
  ].sort((a, b) => (a.at < b.at ? 1 : -1));

  const failed = items.filter((i) => i.status === "failed");

  // Attach the try-by-try history so people can see how many times we went at it.
  const { attemptsForMessages } = await import("./notify-rules.server");
  const textIds = ((texts ?? []) as Array<Record<string, unknown>>).map((t) => String(t["id"]));
  const myAttempts = await attemptsForMessages(textIds);
  for (const item of items) {
    if (item.channel === "text") item.attempts = myAttempts.get(item.id.slice(2)) ?? [];
  }

  // Managers also get a facility-wide view of anything that did not reach a phone.
  let facilityFailures: Array<{
    id: string;
    name: string;
    to: string;
    body: string;
    error: string;
    at: string;
    attempts: Array<{
      attemptNo: number;
      status: string;
      error: string;
      actor: string;
      at: string;
    }>;
    diagnosis: Diagnosis;
  }> = [];
  if (isManager) {
    const { data: bad } = await db
      .from("message_outbox")
      .select(
        "id, employee_id, to_address, body, error, attempts, scheduled_for, sent_at, created_at",
      )
      .eq("status", "failed")
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .limit(40);
    const ids = [...new Set((bad ?? []).map((b) => b.employee_id).filter(Boolean))] as string[];
    const { data: emps } = ids.length
      ? await db.from("employees").select("id, full_name").in("id", ids)
      : { data: [] as Array<{ id: string; full_name: string }> };
    const nameById = new Map((emps ?? []).map((e) => [e.id, e.full_name]));
    const failAttempts = await attemptsForMessages((bad ?? []).map((b) => String(b.id)));
    facilityFailures = (bad ?? []).map((b) => ({
      id: b.id as string,
      name:
        (b.employee_id ? nameById.get(b.employee_id as string) : null) ??
        "Someone not on the roster",
      to: (b.to_address as string) ?? "",
      body: (b.body as string) ?? "",
      error: (b.error as string) || "Delivery failed",
      at: b.created_at as string,
      attempts: failAttempts.get(String(b.id)) ?? [],
      diagnosis: diagnoseDelivery({
        status: "failed",
        error: (b.error as string) ?? "",
        attempts: Number((b as Record<string, unknown>)["attempts"] ?? 0),
        scheduledFor: ((b as Record<string, unknown>)["scheduled_for"] as string) ?? null,
        sentAt: ((b as Record<string, unknown>)["sent_at"] as string) ?? null,
        lastAttemptAt: (failAttempts.get(String(b.id)) ?? []).slice(-1)[0]?.at ?? null,
      }),
    }));
  }

  return {
    isManager,
    linked: Boolean(employeeId),
    items: items.slice(0, 200),
    counts: {
      total: items.length,
      unread: items.filter((i) => i.status === "unread").length,
      failed: failed.length,
    },
    facilityFailures,
  };
}

export async function markNotificationsReadAction(userId: string) {
  const actor = await loadActor(userId);
  if (!actor.employee?.id) return { ok: true, updated: 0 };
  const { data } = await db
    .from("notifications")
    .update({ read: true })
    .eq("employee_id", actor.employee.id)
    .eq("read", false)
    .select("id");
  return { ok: true, updated: (data ?? []).length };
}

/** Retry a text that failed, using the number currently on the person's record. */
export async function resendFailedTextAction(userId: string, id: string) {
  const actor = await loadActor(userId);
  if (actor.role !== "manager" && actor.role !== "admin")
    throw new Error("Only managers can resend messages.");
  const who = actor.employee?.full_name ?? actor.profile?.full_name ?? "A manager";
  const { data: row } = await db.from("message_outbox").select("*").eq("id", id).maybeSingle();
  if (!row) throw new Error("That message is no longer here.");

  const { logAttempt } = await import("./notify-rules.server");
  const priorAttempts = Number(row["attempts"] ?? 0);
  await logAttempt({
    messageId: id,
    employeeId: (row["employee_id"] as string | null) ?? null,
    attemptNo: priorAttempts + 1,
    status: "retry_requested",
    toAddress: String(row["to_address"] ?? ""),
    actor: who,
  });

  // Fresh phone number in case the record was corrected since the failure.
  let to = String(row["to_address"] ?? "");
  if (row["employee_id"]) {
    const { data: emp } = await db
      .from("employees")
      .select("phone")
      .eq("id", row["employee_id"] as string)
      .maybeSingle();
    const digits = String(emp?.phone ?? "").replace(/[^\d]/g, "");
    if (digits.length === 10) to = `+1${digits}`;
    else if (digits.length === 11 && digits.startsWith("1")) to = `+${digits}`;
  }

  await db
    .from("message_outbox")
    .update({
      status: "queued",
      error: "",
      to_address: to,
      scheduled_for: new Date().toISOString(),
    })
    .eq("id", id);
  const { flushOutbox } = await import("./messaging.server");
  const result = await flushOutbox(5).catch(() => ({ sent: 0, failed: 0 }));
  const { data: after } = await db
    .from("message_outbox")
    .select("status,error")
    .eq("id", id)
    .maybeSingle();
  const status = String(after?.["status"] ?? "queued");
  return {
    ok: true,
    sent: result.sent,
    status,
    summary:
      status === "sent"
        ? `Resent to ${to}.`
        : status === "failed"
          ? `Still would not go through — ${String(after?.["error"] ?? "delivery failed")}.`
          : "Queued to go back out.",
  };
}
