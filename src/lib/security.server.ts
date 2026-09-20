// Access control, record keeping and retention. Server-only.
import { db, logAudit, type Role } from "./staffing.server";

export type SecuritySettings = {
  id: string;
  sessionTimeoutMinutes: number;
  auditRetentionDays: number;
  messageRetentionDays: number;
  accessReviewDays: number;
};

type SettingsRow = {
  id: string;
  session_timeout_minutes?: number;
  audit_retention_days?: number;
  message_retention_days?: number;
  access_review_days?: number;
};

export async function getSecuritySettings(): Promise<SecuritySettings> {
  const { data } = await db.from("automation_settings").select("*").limit(1).maybeSingle();
  const row = (data ?? { id: "" }) as SettingsRow;
  return {
    id: row.id,
    sessionTimeoutMinutes: Number(row.session_timeout_minutes ?? 30),
    auditRetentionDays: Number(row.audit_retention_days ?? 2555),
    messageRetentionDays: Number(row.message_retention_days ?? 730),
    accessReviewDays: Number(row.access_review_days ?? 90),
  };
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, Math.round(value)));
}

export async function updateSecuritySettings(
  input: {
    sessionTimeoutMinutes?: number | undefined;
    auditRetentionDays?: number | undefined;
    messageRetentionDays?: number | undefined;
    accessReviewDays?: number | undefined;
  },
  actorLabel: string,
): Promise<SecuritySettings> {
  const current = await getSecuritySettings();
  const patch: Record<string, number> = {};
  if (input.sessionTimeoutMinutes !== undefined)
    patch["session_timeout_minutes"] = clamp(input.sessionTimeoutMinutes, 5, 480);
  if (input.auditRetentionDays !== undefined)
    patch["audit_retention_days"] = clamp(input.auditRetentionDays, 365, 3650);
  if (input.messageRetentionDays !== undefined)
    patch["message_retention_days"] = clamp(input.messageRetentionDays, 30, 3650);
  if (input.accessReviewDays !== undefined)
    patch["access_review_days"] = clamp(input.accessReviewDays, 30, 365);
  if (Object.keys(patch).length === 0) return current;

  const { error } = await db
    .from("automation_settings")
    .update(
      patch as Partial<
        Record<
          | "session_timeout_minutes"
          | "audit_retention_days"
          | "message_retention_days"
          | "access_review_days",
          number
        >
      >,
    )
    .eq("id", current.id);

  if (error) throw new Error(error.message);
  await logAudit("security_settings_updated", actorLabel, "automation_settings", current.id, patch);
  return getSecuritySettings();
}

export type AccountRow = {
  userId: string;
  name: string;
  email: string;
  role: Role;
  employeeName: string | null;
  active: boolean;
  lastSignInAt: string | null;
  createdAt: string | null;
};

/** Everyone who can sign in, what they can reach, and when they last did. */
export async function listAccounts(): Promise<AccountRow[]> {
  const [{ data: profiles }, { data: roles }, { data: employees }] = await Promise.all([
    db.from("profiles").select("id,email,full_name"),
    db.from("user_roles").select("user_id,role"),
    db.from("employees").select("user_id,full_name,is_active").not("user_id", "is", null),
  ]);

  const roleByUser = new Map<string, Role>();
  for (const r of roles ?? []) {
    const existing = roleByUser.get(r.user_id as string);
    const next = r.role as Role;
    const rank = { employee: 0, manager: 1, admin: 2 } as const;
    if (!existing || rank[next] > rank[existing]) roleByUser.set(r.user_id as string, next);
  }

  const empByUser = new Map<string, { name: string; active: boolean }>();
  for (const e of employees ?? [])
    empByUser.set(e.user_id as string, {
      name: e.full_name as string,
      active: Boolean(e.is_active),
    });

  let authUsers: Array<{ id: string; last_sign_in_at?: string | null; created_at?: string }> = [];
  try {
    const { data } = await db.auth.admin.listUsers({ page: 1, perPage: 1000 });
    authUsers = (data?.users ?? []) as typeof authUsers;
  } catch {
    authUsers = [];
  }
  const authById = new Map(authUsers.map((u) => [u.id, u]));

  return (profiles ?? [])
    .map((p) => {
      const emp = empByUser.get(p.id as string) ?? null;
      const auth = authById.get(p.id as string);
      return {
        userId: p.id as string,
        name: (p.full_name as string | null) ?? emp?.name ?? "Unnamed account",
        email: (p.email as string | null) ?? "",
        role: roleByUser.get(p.id as string) ?? "employee",
        employeeName: emp?.name ?? null,
        active: emp ? emp.active : true,
        lastSignInAt: auth?.last_sign_in_at ?? null,
        createdAt: auth?.created_at ?? null,
      } satisfies AccountRow;
    })
    .sort((a, b) => {
      const rank = { admin: 0, manager: 1, employee: 2 } as const;
      return rank[a.role] - rank[b.role] || a.name.localeCompare(b.name);
    });
}

/** Change what one account can reach. One role per person. */
export async function setAccountRole(userId: string, role: Role, actorLabel: string) {
  await db.from("user_roles").delete().eq("user_id", userId);
  const { error } = await db.from("user_roles").insert({ user_id: userId, role });
  if (error) throw new Error(error.message);
  await logAudit("account_role_changed", actorLabel, "user_roles", userId, { role });
  return { userId, role };
}

export type AccessReviewRow = {
  id: string;
  reviewedBy: string;
  reviewedAt: string;
  accountsReviewed: number;
  changesMade: number;
  notes: string | null;
};

export async function recordAccessReview(
  input: { accountsReviewed: number; changesMade: number; notes?: string | undefined },
  actorLabel: string,
): Promise<AccessReviewRow> {
  const { data, error } = await db
    .from("access_reviews")
    .insert({
      reviewed_by: actorLabel,
      accounts_reviewed: input.accountsReviewed,
      changes_made: input.changesMade,
      notes: input.notes ?? null,
    })
    .select("*")
    .maybeSingle();
  if (error) throw new Error(error.message);
  await logAudit(
    "access_review_completed",
    actorLabel,
    "access_reviews",
    (data?.id as string) ?? null,
    {
      accounts: input.accountsReviewed,
    },
  );
  return mapReview(data as Record<string, unknown>);
}

function mapReview(r: Record<string, unknown>): AccessReviewRow {
  return {
    id: r["id"] as string,
    reviewedBy: r["reviewed_by"] as string,
    reviewedAt: r["reviewed_at"] as string,
    accountsReviewed: Number(r["accounts_reviewed"] ?? 0),
    changesMade: Number(r["changes_made"] ?? 0),
    notes: (r["notes"] as string | null) ?? null,
  };
}

export async function listAccessReviews(limit = 12): Promise<AccessReviewRow[]> {
  const { data } = await db
    .from("access_reviews")
    .select("*")
    .order("reviewed_at", { ascending: false })
    .limit(limit);
  return (data ?? []).map((r) => mapReview(r as Record<string, unknown>));
}

/** Rows of the change record, for download. */
export async function auditTrail(days: number, limit = 5000) {
  const since = new Date(Date.now() - days * 86_400_000).toISOString();
  const { data } = await db
    .from("audit_log")
    .select("created_at,action,actor,entity,entity_id,details,undone_at,undone_by")
    .gte("created_at", since)
    .order("created_at", { ascending: false })
    .limit(limit);
  return (data ?? []).map((r) => ({
    createdAt: r.created_at as string,
    action: r.action as string,
    actor: r.actor as string,
    entity: (r.entity as string | null) ?? "",
    entityId: (r.entity_id as string | null) ?? "",
    details: JSON.stringify(r.details ?? {}),
    undoneAt: (r.undone_at as string | null) ?? "",
    undoneBy: (r.undone_by as string | null) ?? "",
  }));
}

/** Recent failed sign-ins, newest first. Administrators only. */
export type SignInFailure = { at: string; email: string; ip: string; reason: string };

export async function recentSignInFailures(hours = 48, limit = 50): Promise<SignInFailure[]> {
  const since = new Date(Date.now() - hours * 3_600_000).toISOString();
  const { data } = await db
    .from("login_attempts")
    .select("created_at,email,ip,reason,succeeded")
    .eq("succeeded", false)
    .gte("created_at", since)
    .order("created_at", { ascending: false })
    .limit(limit);
  return (data ?? []).map((r) => ({
    at: r.created_at as string,
    email: (r.email as string) ?? "",
    ip: (r.ip as string) ?? "unknown",
    reason: ((r.reason as string | null) ?? "").slice(0, 120),
  }));
}

/** Delete records past the retention window. Safe to run repeatedly. */
export async function applyRetention(actorLabel: string) {
  const settings = await getSecuritySettings();
  const auditCutoff = new Date(Date.now() - settings.auditRetentionDays * 86_400_000).toISOString();
  const msgCutoff = new Date(Date.now() - settings.messageRetentionDays * 86_400_000).toISOString();
  const signInCutoff = new Date(Date.now() - 90 * 86_400_000).toISOString();

  const removed: Record<string, number> = {};
  const purge = async (
    table: "audit_log" | "message_outbox" | "notification_attempts" | "login_attempts",
    cutoff: string,
  ) => {
    const { data } = await db.from(table).delete().lt("created_at", cutoff).select("id");
    removed[table] = (data ?? []).length;
  };
  await purge("audit_log", auditCutoff);
  await purge("message_outbox", msgCutoff);
  await purge("notification_attempts", msgCutoff);
  await purge("login_attempts", signInCutoff);

  const total = Object.values(removed).reduce((a, b) => a + b, 0);
  if (total > 0)
    await logAudit("retention_applied", actorLabel, "automation_settings", settings.id, removed);
  return { removed, total };
}

export type SecurityPosture = {
  settings: SecuritySettings;
  accounts: AccountRow[];
  reviews: AccessReviewRow[];
  counts: {
    admins: number;
    managers: number;
    employees: number;
    neverSignedIn: number;
    staleNinetyDays: number;
  };
  reviewDueOn: string | null;
  reviewOverdue: boolean;
  auditEntries: number;
  oldestAudit: string | null;
  signInFailures: SignInFailure[];
};

export async function securityPosture(): Promise<SecurityPosture> {
  const [settings, accounts, reviews, signInFailures] = await Promise.all([
    getSecuritySettings(),
    listAccounts(),
    listAccessReviews(),
    recentSignInFailures(),
  ]);

  const ninetyDaysAgo = Date.now() - 90 * 86_400_000;
  const counts = {
    admins: accounts.filter((a) => a.role === "admin").length,
    managers: accounts.filter((a) => a.role === "manager").length,
    employees: accounts.filter((a) => a.role === "employee").length,
    neverSignedIn: accounts.filter((a) => !a.lastSignInAt).length,
    staleNinetyDays: accounts.filter(
      (a) => a.lastSignInAt && new Date(a.lastSignInAt).getTime() < ninetyDaysAgo,
    ).length,
  };

  const last = reviews[0] ?? null;
  const reviewDueOn = last
    ? new Date(
        new Date(last.reviewedAt).getTime() + settings.accessReviewDays * 86_400_000,
      ).toISOString()
    : null;

  const { count } = await db.from("audit_log").select("id", { count: "exact", head: true });
  const { data: oldest } = await db
    .from("audit_log")
    .select("created_at")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  return {
    settings,
    accounts,
    reviews,
    counts,
    reviewDueOn,
    reviewOverdue: !last || (reviewDueOn !== null && new Date(reviewDueOn).getTime() < Date.now()),
    auditEntries: count ?? 0,
    oldestAudit: (oldest?.created_at as string | null) ?? null,
    signInFailures,
  };
}
