// Manager-facing audit of everything the facility has sent, with filters.
// Server-only.
import { diagnoseDelivery } from "./notification-diagnostics";
import { db, loadActor } from "./staffing.server";

export type AuditFilters = {
  role?: "any" | "employee" | "manager" | "admin" | undefined;
  category?:
    "any" | "onboarding" | "schedule" | "reminders" | "delivery_failures" | "other" | undefined;
  channel?: "any" | "in_app" | "text" | undefined;
  status?: "any" | "sent" | "failed" | "queued" | "unread" | "read" | undefined;
  employeeId?: string | null | undefined;
  search?: string | undefined;
  from?: string | null | undefined;
  to?: string | null | undefined;
  limit?: number | undefined;
};

export type AuditRow = {
  id: string;
  rawId: string;
  channel: "in_app" | "text";
  category: string;
  person: string;
  personRole: string;
  to: string;
  title: string;
  body: string;
  status: string;
  statusNote: string;
  code: string;
  reason: string;
  hint: string;
  attemptsUsed: number;
  lastAttemptAt: string | null;
  nextRetryAt: string | null;
  retryState: string;
  retryNote: string;
  at: string;
};

function categorize(kindOrTitle: string): AuditRow["category"] {
  const t = kindOrTitle.toLowerCase();
  if (/onboard|hire|orientation|paperwork|screen|badge/.test(t)) return "onboarding";
  if (/shift|schedul|call.?off|sent home|cover|float|swap/.test(t)) return "schedule";
  if (/remind|due|expir|licen/.test(t)) return "reminders";
  if (/deliver|failed|undeliver/.test(t)) return "delivery_failures";
  return "other";
}

const STATUS_NOTE: Record<string, string> = {
  queued: "Waiting to send",
  sent: "Delivered",
  failed: "Could not be delivered",
  cancelled: "Cancelled",
};

export async function notificationAuditQuery(userId: string, filters: AuditFilters = {}) {
  const actor = await loadActor(userId);
  if (actor.role !== "manager" && actor.role !== "admin")
    throw new Error("Only managers can audit notifications.");

  const limit = Math.min(Math.max(filters.limit ?? 300, 1), 2000);
  const from = filters.from
    ? new Date(`${filters.from}T00:00:00`).toISOString()
    : new Date(Date.now() - 90 * 24 * 3600_000).toISOString();
  const to = filters.to
    ? new Date(`${filters.to}T23:59:59`).toISOString()
    : new Date().toISOString();

  let textQ = db
    .from("message_outbox")
    .select(
      "id, employee_id, to_address, body, kind, status, error, attempts, scheduled_for, sent_at, created_at",
    )
    .gte("created_at", from)
    .lte("created_at", to)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (filters.employeeId) textQ = textQ.eq("employee_id", filters.employeeId);

  let inAppQ = db
    .from("notifications")
    .select("id, employee_id, audience, title, body, read, created_at")
    .gte("created_at", from)
    .lte("created_at", to)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (filters.employeeId) inAppQ = inAppQ.eq("employee_id", filters.employeeId);

  const wantText = (filters.channel ?? "any") !== "in_app";
  const wantInApp = (filters.channel ?? "any") !== "text";

  const [{ data: texts }, { data: inApp }] = await Promise.all([
    wantText ? textQ : Promise.resolve({ data: [] as Array<Record<string, unknown>> }),
    wantInApp ? inAppQ : Promise.resolve({ data: [] as Array<Record<string, unknown>> }),
  ]);

  const ids = [
    ...new Set(
      [...(texts ?? []), ...(inApp ?? [])]
        .map((r) => (r as Record<string, unknown>)["employee_id"] as string | null)
        .filter(Boolean) as string[],
    ),
  ];
  const { data: emps } = ids.length
    ? await db.from("employees").select("id, full_name, user_id, phone").in("id", ids)
    : {
        data: [] as Array<{
          id: string;
          full_name: string;
          user_id: string | null;
          phone: string | null;
        }>,
      };
  const empById = new Map((emps ?? []).map((e) => [e.id as string, e]));
  const userIds = (emps ?? []).map((e) => e.user_id).filter(Boolean) as string[];
  const { data: roleRows } = userIds.length
    ? await db.from("user_roles").select("user_id, role").in("user_id", userIds)
    : { data: [] as Array<{ user_id: string; role: string }> };
  const roleByUser = new Map<string, string>();
  for (const r of roleRows ?? []) {
    const cur = roleByUser.get(r.user_id as string);
    const next = String(r.role);
    const rank = (v: string) => (v === "admin" ? 3 : v === "manager" ? 2 : 1);
    if (!cur || rank(next) > rank(cur)) roleByUser.set(r.user_id as string, next);
  }

  const { attemptsForMessages } = await import("./notify-rules.server");
  const attemptMap = await attemptsForMessages(
    ((texts ?? []) as Array<Record<string, unknown>>).map((t) => String(t["id"])),
  );

  const personOf = (employeeId: string | null) => {
    if (!employeeId) return { name: "Everyone", role: "any", phone: "" };
    const e = empById.get(employeeId);
    if (!e) return { name: "Not on the roster", role: "employee", phone: "" };
    return {
      name: e.full_name as string,
      role: (e.user_id ? roleByUser.get(e.user_id as string) : null) ?? "employee",
      phone: (e.phone as string) ?? "",
    };
  };

  const rows: AuditRow[] = [];

  for (const t of (texts ?? []) as Array<Record<string, unknown>>) {
    const employeeId = (t["employee_id"] as string | null) ?? null;
    const who = personOf(employeeId);
    const attempts = attemptMap.get(String(t["id"])) ?? [];
    const lastAttempt = attempts.length ? attempts[attempts.length - 1]!.at : null;
    const status = String(t["status"] ?? "queued");
    const d = diagnoseDelivery({
      status,
      error: (t["error"] as string) ?? "",
      attempts: Number(t["attempts"] ?? attempts.length),
      scheduledFor: (t["scheduled_for"] as string) ?? null,
      sentAt: (t["sent_at"] as string) ?? null,
      lastAttemptAt: lastAttempt,
    });
    rows.push({
      id: `t-${String(t["id"])}`,
      rawId: String(t["id"]),
      channel: "text",
      category: categorize(String(t["kind"] ?? "")),
      person: who.name,
      personRole: who.role,
      to: String(t["to_address"] ?? who.phone),
      title: `Text · ${String(t["kind"] ?? "notice")}`,
      body: String(t["body"] ?? ""),
      status,
      statusNote: STATUS_NOTE[status] ?? status,
      code: d.code,
      reason: d.reason,
      hint: d.hint,
      attemptsUsed: d.attemptsUsed,
      lastAttemptAt: d.lastAttemptAt,
      nextRetryAt: d.nextRetryAt,
      retryState: d.retryState,
      retryNote: d.retryNote,
      at: String(t["sent_at"] ?? t["created_at"]),
    });
  }

  for (const n of (inApp ?? []) as Array<Record<string, unknown>>) {
    const employeeId = (n["employee_id"] as string | null) ?? null;
    const who = personOf(employeeId);
    const read = Boolean(n["read"]);
    rows.push({
      id: `n-${String(n["id"])}`,
      rawId: String(n["id"]),
      channel: "in_app",
      category: categorize(`${String(n["title"] ?? "")} ${String(n["body"] ?? "")}`),
      person: employeeId ? who.name : `Everyone (${String(n["audience"] ?? "all")})`,
      personRole: employeeId ? who.role : "any",
      to: "in app",
      title: String(n["title"] ?? ""),
      body: String(n["body"] ?? ""),
      status: read ? "read" : "unread",
      statusNote: read ? "Read" : "New",
      code: "",
      reason: "",
      hint: "",
      attemptsUsed: 0,
      lastAttemptAt: null,
      nextRetryAt: null,
      retryState: "delivered",
      retryNote: "Shown in the app.",
      at: String(n["created_at"]),
    });
  }

  const search = (filters.search ?? "").trim().toLowerCase();
  const filtered = rows
    .filter((r) => (filters.role && filters.role !== "any" ? r.personRole === filters.role : true))
    .filter((r) =>
      filters.category && filters.category !== "any" ? r.category === filters.category : true,
    )
    .filter((r) =>
      filters.status && filters.status !== "any" ? r.status === filters.status : true,
    )
    .filter((r) =>
      search ? `${r.person} ${r.title} ${r.body} ${r.to}`.toLowerCase().includes(search) : true,
    )
    .sort((a, b) => (a.at < b.at ? 1 : -1))
    .slice(0, limit);

  const people = [...empById.values()]
    .map((e) => ({ id: e.id as string, name: e.full_name as string }))
    .sort((a, b) => a.name.localeCompare(b.name));

  return {
    rows: filtered,
    people,
    range: { from, to },
    counts: {
      total: filtered.length,
      failed: filtered.filter((r) => r.status === "failed").length,
      pending: filtered.filter((r) => r.retryState === "scheduled" || r.retryState === "waiting")
        .length,
      texts: filtered.filter((r) => r.channel === "text").length,
    },
  };
}
