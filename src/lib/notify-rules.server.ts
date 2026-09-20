// Who hears about what, and how. Role-wide rules with per-person overrides.
// Server-only.
import { db, loadActor } from "./staffing.server";

export const CATEGORIES = ["onboarding", "schedule", "reminders", "delivery_failures"] as const;
export type Category = (typeof CATEGORIES)[number];

export const CATEGORY_LABEL: Record<Category, string> = {
  onboarding: "Onboarding handoff",
  schedule: "Schedule updates",
  reminders: "Reminders and due dates",
  delivery_failures: "Text messages that did not go through",
};

export const CATEGORY_BLURB: Record<Category, string> = {
  onboarding: "Paperwork sent, screening back, orientation set, added to the schedule.",
  schedule: "Shifts added, changed, cancelled, or sent home.",
  reminders: "Nudges when something is coming due or already past due.",
  delivery_failures: "A heads up when a text to someone did not reach their phone.",
};

/** Starting point for anyone brand new, per role. */
export const ROLE_DEFAULTS: Record<string, Record<Category, { inApp: boolean; sms: boolean }>> = {
  employee: {
    onboarding: { inApp: true, sms: true },
    schedule: { inApp: true, sms: true },
    reminders: { inApp: true, sms: true },
    delivery_failures: { inApp: false, sms: false },
  },
  manager: {
    onboarding: { inApp: true, sms: true },
    schedule: { inApp: true, sms: false },
    reminders: { inApp: true, sms: true },
    delivery_failures: { inApp: true, sms: false },
  },
  admin: {
    onboarding: { inApp: true, sms: false },
    schedule: { inApp: true, sms: false },
    reminders: { inApp: true, sms: false },
    delivery_failures: { inApp: true, sms: false },
  },
};

export type Rule = { inApp: boolean; sms: boolean; source: "person" | "role" | "default" };

type RuleRow = {
  id: string;
  scope: string;
  role: string | null;
  employee_id: string | null;
  category: string;
  in_app: boolean;
  sms: boolean;
  updated_by: string;
  updated_at: string;
};

async function allRules() {
  const { data } = await db
    .from("notification_rules")
    .select("id, scope, role, employee_id, category, in_app, sms, updated_by, updated_at");
  return (data ?? []) as unknown as RuleRow[];
}

/** The role we treat someone as for notification purposes. */
export async function roleOfEmployee(employeeId: string): Promise<string> {
  const { data: emp } = await db
    .from("employees")
    .select("user_id")
    .eq("id", employeeId)
    .maybeSingle();
  const userId = (emp?.["user_id"] as string | null) ?? null;
  if (!userId) return "employee";
  const { data: roles } = await db.from("user_roles").select("role").eq("user_id", userId);
  const list = (roles ?? []).map((r) => String(r.role));
  if (list.includes("admin")) return "admin";
  if (list.includes("manager")) return "manager";
  return "employee";
}

/** What this person should get for one category, person rule beating role rule. */
export async function resolveRule(employeeId: string, category: Category): Promise<Rule> {
  const rows = await allRules();
  const mine = rows.find(
    (r) => r.scope === "employee" && r.employee_id === employeeId && r.category === category,
  );
  if (mine) return { inApp: mine.in_app, sms: mine.sms, source: "person" };
  const role = await roleOfEmployee(employeeId);
  const roleRule = rows.find(
    (r) => r.scope === "role" && r.role === role && r.category === category,
  );
  if (roleRule) return { inApp: roleRule.in_app, sms: roleRule.sms, source: "role" };
  const fallback = ROLE_DEFAULTS[role]?.[category] ?? { inApp: true, sms: false };
  return { ...fallback, source: "default" };
}

/** Note down one delivery attempt so the history shows every try. */
export async function logAttempt(input: {
  messageId?: string | null;
  employeeId?: string | null;
  attemptNo: number;
  status: string;
  error?: string;
  toAddress?: string;
  actor?: string;
  channel?: string;
}) {
  await db
    .from("notification_attempts")
    .insert({
      message_id: input.messageId ?? null,
      employee_id: input.employeeId ?? null,
      attempt_no: input.attemptNo,
      status: input.status,
      error: input.error ?? "",
      to_address: input.toAddress ?? "",
      actor: input.actor ?? "system",
      channel: input.channel ?? "sms",
    })
    .then(
      () => undefined,
      () => undefined,
    );
}

export async function attemptsForMessages(messageIds: string[]) {
  if (!messageIds.length)
    return new Map<
      string,
      Array<{ attemptNo: number; status: string; error: string; actor: string; at: string }>
    >();
  const { data } = await db
    .from("notification_attempts")
    .select("message_id, attempt_no, status, error, actor, created_at")
    .in("message_id", messageIds)
    .order("created_at", { ascending: true });
  const map = new Map<
    string,
    Array<{ attemptNo: number; status: string; error: string; actor: string; at: string }>
  >();
  for (const row of data ?? []) {
    const key = String(row["message_id"]);
    const list = map.get(key) ?? [];
    list.push({
      attemptNo: Number(row["attempt_no"] ?? 1),
      status: String(row["status"] ?? ""),
      error: String(row["error"] ?? ""),
      actor: String(row["actor"] ?? "system"),
      at: String(row["created_at"] ?? ""),
    });
    map.set(key, list);
  }
  return map;
}

export type RuleView = {
  category: Category;
  label: string;
  blurb: string;
  inApp: boolean;
  sms: boolean;
  source: "person" | "role" | "default";
};

/** Everything the rules screen needs: my rules, and for managers, the role-wide ones. */
export async function notificationRulesQuery(userId: string) {
  const actor = await loadActor(userId);
  const isManager = actor.role === "manager" || actor.role === "admin";
  const employeeId = actor.employee?.id ?? null;
  const rows = await allRules();

  const roleRules: Array<{ role: string; rules: RuleView[] }> = [
    "employee",
    "manager",
    "admin",
  ].map((role) => ({
    role,
    rules: CATEGORIES.map((category) => {
      const row = rows.find(
        (r) => r.scope === "role" && r.role === role && r.category === category,
      );
      const fallback = ROLE_DEFAULTS[role]?.[category] ?? { inApp: true, sms: false };
      return {
        category,
        label: CATEGORY_LABEL[category],
        blurb: CATEGORY_BLURB[category],
        inApp: row ? row.in_app : fallback.inApp,
        sms: row ? row.sms : fallback.sms,
        source: (row ? "role" : "default") as RuleView["source"],
      };
    }),
  }));

  let myRules: RuleView[] = [];
  let myRole = "employee";
  if (employeeId) {
    myRole = await roleOfEmployee(employeeId);
    myRules = await Promise.all(
      CATEGORIES.map(async (category) => {
        const r = await resolveRule(employeeId, category);
        return {
          category,
          label: CATEGORY_LABEL[category],
          blurb: CATEGORY_BLURB[category],
          inApp: r.inApp,
          sms: r.sms,
          source: r.source,
        };
      }),
    );
  }

  // Managers can also see who has stepped away from the role-wide rules.
  let overrides: Array<{
    employeeId: string;
    name: string;
    category: string;
    label: string;
    inApp: boolean;
    sms: boolean;
  }> = [];
  if (isManager) {
    const personal = rows.filter((r) => r.scope === "employee" && r.employee_id);
    const ids = [...new Set(personal.map((r) => r.employee_id as string))];
    const { data: emps } = ids.length
      ? await db.from("employees").select("id, full_name").in("id", ids)
      : { data: [] as Array<{ id: string; full_name: string }> };
    const nameOf = new Map((emps ?? []).map((e) => [e.id, e.full_name]));
    overrides = personal.map((r) => ({
      employeeId: r.employee_id as string,
      name: nameOf.get(r.employee_id as string) ?? "Someone",
      category: r.category,
      label: CATEGORY_LABEL[r.category as Category] ?? r.category,
      inApp: r.in_app,
      sms: r.sms,
    }));
  }

  return { isManager, linked: Boolean(employeeId), myRole, myRules, roleRules, overrides };
}

export async function saveMyRuleAction(
  userId: string,
  input: { category: Category; inApp: boolean; sms: boolean },
) {
  const actor = await loadActor(userId);
  const employeeId = actor.employee?.id;
  if (!employeeId) throw new Error("Your login is not linked to a roster record yet.");
  const who = actor.employee?.full_name ?? actor.profile?.full_name ?? "Someone";
  const { data: existing } = await db
    .from("notification_rules")
    .select("id")
    .eq("scope", "employee")
    .eq("employee_id", employeeId)
    .eq("category", input.category)
    .maybeSingle();
  if (existing) {
    await db
      .from("notification_rules")
      .update({ in_app: input.inApp, sms: input.sms, updated_by: who })
      .eq("id", existing.id as string);
  } else {
    await db.from("notification_rules").insert({
      scope: "employee",
      employee_id: employeeId,
      category: input.category,
      in_app: input.inApp,
      sms: input.sms,
      updated_by: who,
    });
  }
  return { ok: true, summary: `${CATEGORY_LABEL[input.category]} updated for you.` };
}

export async function resetMyRuleAction(userId: string, category: Category) {
  const actor = await loadActor(userId);
  const employeeId = actor.employee?.id;
  if (!employeeId) throw new Error("Your login is not linked to a roster record yet.");
  await db
    .from("notification_rules")
    .delete()
    .eq("scope", "employee")
    .eq("employee_id", employeeId)
    .eq("category", category);
  return { ok: true, summary: `${CATEGORY_LABEL[category]} follows the standard rule again.` };
}

export async function saveRoleRuleAction(
  userId: string,
  input: { role: string; category: Category; inApp: boolean; sms: boolean },
) {
  const actor = await loadActor(userId);
  if (actor.role !== "manager" && actor.role !== "admin")
    throw new Error("Only managers can change the standard rules.");
  const who = actor.employee?.full_name ?? actor.profile?.full_name ?? "A manager";
  const { data: existing } = await db
    .from("notification_rules")
    .select("id")
    .eq("scope", "role")
    .eq("role", input.role as "employee" | "manager" | "admin")
    .eq("category", input.category)
    .maybeSingle();
  if (existing) {
    await db
      .from("notification_rules")
      .update({ in_app: input.inApp, sms: input.sms, updated_by: who })
      .eq("id", existing.id as string);
  } else {
    await db.from("notification_rules").insert({
      scope: "role",
      role: input.role as "employee" | "manager" | "admin",
      category: input.category,
      in_app: input.inApp,
      sms: input.sms,
      updated_by: who,
    });
  }
  const { logAudit } = await import("./staffing.server");
  await logAudit("notification_rule_updated", who, "notification_rules", null, {
    role: input.role,
    category: input.category,
    in_app: input.inApp,
    sms: input.sms,
  });
  return { ok: true, summary: `Standard rule updated for ${input.role}s.` };
}
