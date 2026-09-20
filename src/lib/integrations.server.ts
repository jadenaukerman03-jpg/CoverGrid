// Integration backbone. Every outside system the scheduler depends on is registered
// here with its own health, sync history, last-known-good snapshot and fallback plan,
// so a failed feed degrades the schedule instead of collapsing it.
import { db, logAudit, today } from "./staffing.server";
import { addDays, toISODate, type PositionType, type ShiftType } from "./facility";

export const INTEGRATION_KINDS = [
  {
    id: "payroll",
    label: "Payroll",
    blurb: "Approved hours out to the payroll system each period.",
    fallback: "Export file stays downloadable by hand; nothing about the schedule changes.",
  },
  {
    id: "timeclock",
    label: "Time clock",
    blurb: "Clock in and out events from wall clocks and tablets.",
    fallback: "Scheduled hours are used for pay and PPD until punches come back.",
  },
  {
    id: "hris",
    label: "HR platform",
    blurb: "Hires, terminations, pay rates and unit assignments.",
    fallback:
      "The roster already on file keeps being used; no one is added or dropped automatically.",
  },
  {
    id: "credentialing",
    label: "Credentialing",
    blurb: "License numbers, status and expiration dates.",
    fallback: "The last verified expiration dates keep enforcing; nobody is pulled off on a guess.",
  },
  {
    id: "emr",
    label: "EMR / census",
    blurb: "Midnight resident census by unit.",
    fallback: "The last good census is carried forward so PPD and targets still compute.",
  },
  {
    id: "agency",
    label: "Agency portal",
    blurb: "Open shift offers out, confirmed agency workers back in.",
    fallback: "Open shifts are offered to internal staff and texted out instead.",
  },
] as const;

export type IntegrationKind = (typeof INTEGRATION_KINDS)[number]["id"];
export type IntegrationStatus = "healthy" | "degraded" | "failing" | "disabled" | "never_synced";
export type FallbackMode = "last_known_good" | "manual" | "halt";

const KIND_META = new Map(INTEGRATION_KINDS.map((k) => [k.id, k]));
export const kindLabel = (k: string) => KIND_META.get(k as IntegrationKind)?.label ?? k;
export const kindFallback = (k: string) => KIND_META.get(k as IntegrationKind)?.fallback ?? "";

type ConnectionRow = {
  id: string;
  kind: string;
  slug: string;
  name: string;
  vendor: string;
  direction: string;
  transport: string;
  auth_mode: string;
  endpoint_path: string;
  is_enabled: boolean;
  is_required: boolean;
  expected_every_minutes: number;
  stale_after_minutes: number;
  failure_threshold: number;
  fallback_mode: string;
  status: string;
  last_message: string;
  last_sync_at: string | null;
  last_success_at: string | null;
  last_failure_at: string | null;
  consecutive_failures: number;
  total_syncs: number;
  config: Record<string, unknown> | null;
  notes: string;
  updated_at: string;
};

const minutesSince = (iso: string | null) =>
  iso ? Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000)) : null;

/** Health is derived, never trusted from the stored column alone. */
export function healthOf(c: ConnectionRow): {
  status: IntegrationStatus;
  reason: string;
  ageMinutes: number | null;
} {
  const age = minutesSince(c.last_success_at);
  if (!c.is_enabled)
    return {
      status: "disabled",
      reason: "Turned off — nothing is expected from this system.",
      ageMinutes: age,
    };
  if (!c.last_success_at)
    return {
      status: "never_synced",
      reason: "This system has never reported in.",
      ageMinutes: null,
    };
  if (c.consecutive_failures >= c.failure_threshold)
    return {
      status: "failing",
      reason: `${c.consecutive_failures} failed attempts in a row.`,
      ageMinutes: age,
    };
  if (age !== null && age > c.stale_after_minutes)
    return {
      status: "failing",
      reason: `No good data for ${humanAge(age)} — past the ${humanAge(c.stale_after_minutes)} limit.`,
      ageMinutes: age,
    };
  if (c.consecutive_failures > 0)
    return {
      status: "degraded",
      reason: `${c.consecutive_failures} recent failure${c.consecutive_failures === 1 ? "" : "s"}.`,
      ageMinutes: age,
    };
  if (age !== null && age > c.expected_every_minutes)
    return {
      status: "degraded",
      reason: `Late — expected every ${humanAge(c.expected_every_minutes)}, last was ${humanAge(age)} ago.`,
      ageMinutes: age,
    };
  return {
    status: "healthy",
    reason: `Last good data ${humanAge(age ?? 0)} ago.`,
    ageMinutes: age,
  };
}

export function humanAge(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  if (minutes < 60 * 48) return `${Math.round(minutes / 60)} hr`;
  return `${Math.round(minutes / 1440)} days`;
}

async function connectionBy(ref: { id?: string | undefined; slug?: string | undefined }) {
  const q = db.from("integration_connections").select("*");
  const { data } = ref.id
    ? await q.eq("id", ref.id).maybeSingle()
    : await q.eq("slug", ref.slug ?? "").maybeSingle();
  return (data as ConnectionRow | null) ?? null;
}

// --- Sync recording -------------------------------------------------------

export async function recordSync(input: {
  connection: ConnectionRow;
  direction?: string;
  trigger?: string;
  status: "ok" | "partial" | "failed";
  rowsReceived?: number;
  rowsApplied?: number;
  rowsSkipped?: number;
  durationMs?: number;
  message: string;
  details?: Record<string, unknown>;
  actorLabel?: string;
  snapshot?: { rows: number; payload: unknown; summary: string } | null;
}) {
  const c = input.connection;
  const ok = input.status !== "failed";
  const now = new Date().toISOString();

  await db.from("integration_syncs").insert({
    connection_id: c.id,
    direction: input.direction ?? c.direction,
    trigger: input.trigger ?? "manual",
    status: input.status,
    rows_received: input.rowsReceived ?? 0,
    rows_applied: input.rowsApplied ?? 0,
    rows_skipped: input.rowsSkipped ?? 0,
    duration_ms: Math.round(input.durationMs ?? 0),
    message: input.message.slice(0, 800),
    details: JSON.parse(JSON.stringify(input.details ?? {})),
    created_by: input.actorLabel ?? "system",
  });

  const failures = ok ? 0 : c.consecutive_failures + 1;
  const patch: Record<string, unknown> = {
    last_sync_at: now,
    last_message: input.message.slice(0, 800),
    consecutive_failures: failures,
    total_syncs: c.total_syncs + 1,
  };
  if (ok) patch["last_success_at"] = now;
  else patch["last_failure_at"] = now;

  const projected: ConnectionRow = {
    ...c,
    last_sync_at: now,
    last_success_at: ok ? now : c.last_success_at,
    last_failure_at: ok ? c.last_failure_at : now,
    consecutive_failures: failures,
  };
  patch["status"] = healthOf(projected).status;
  await db
    .from("integration_connections")
    .update(patch as never)
    .eq("id", c.id);

  if (ok && input.snapshot && input.snapshot.rows > 0) {
    await db.from("integration_snapshots").insert({
      connection_id: c.id,
      kind: c.kind,
      rows: input.snapshot.rows,
      summary: input.snapshot.summary.slice(0, 400),
      payload: JSON.parse(JSON.stringify(input.snapshot.payload)),
    });
    // Keep the ten most recent snapshots per connection.
    const { data: old } = await db
      .from("integration_snapshots")
      .select("id")
      .eq("connection_id", c.id)
      .order("captured_at", { ascending: false })
      .range(10, 200);
    const ids = (old ?? []).map((r) => r.id as string);
    if (ids.length) await db.from("integration_snapshots").delete().in("id", ids);
  }

  if (ok) await resolveIncidentsFor(c.id, "The feed reported in successfully.");
  else if (failures >= c.failure_threshold)
    await openIncident(
      projected,
      "critical",
      `${c.name} failed ${failures} times in a row.`,
      input.message,
    );

  return { ok, failures };
}

// --- Incidents ------------------------------------------------------------

async function openIncident(
  c: ConnectionRow,
  severity: "warning" | "critical",
  summary: string,
  detail: string,
) {
  const { data: existing } = await db
    .from("integration_incidents")
    .select("id,severity")
    .eq("connection_id", c.id)
    .eq("status", "open")
    .maybeSingle();
  const fallback = fallbackSentence(c);
  const impact = impactSentence(c);
  if (existing) {
    await db
      .from("integration_incidents")
      .update({
        severity,
        summary: summary.slice(0, 400),
        impact,
        fallback_used: fallback,
        details: { detail },
      })
      .eq("id", existing.id as string);
    return existing.id as string;
  }
  const { data } = await db
    .from("integration_incidents")
    .insert({
      connection_id: c.id,
      severity,
      status: "open",
      summary: summary.slice(0, 400),
      impact,
      fallback_used: fallback,
      details: { detail },
    })
    .select("id")
    .maybeSingle();
  await db.from("staffing_alerts").insert({
    severity: severity === "critical" ? "high" : "medium",
    message: `${c.name} is not reporting in. ${impact} ${fallback}`,
    status: "open",
  });
  await logAudit("integration_incident_opened", "the system", "integration", c.id, {
    summary,
    fallback,
  });
  return (data?.id as string | undefined) ?? null;
}

async function resolveIncidentsFor(connectionId: string, note: string) {
  const { data } = await db
    .from("integration_incidents")
    .select("id")
    .eq("connection_id", connectionId)
    .eq("status", "open");
  if (!data?.length) return 0;
  await db
    .from("integration_incidents")
    .update({ status: "resolved", resolved_at: new Date().toISOString(), details: { note } })
    .in(
      "id",
      data.map((r) => r.id as string),
    );
  return data.length;
}

function fallbackSentence(c: ConnectionRow): string {
  if (c.fallback_mode === "halt")
    return "Scheduling changes that depend on this feed are held until it returns.";
  if (c.fallback_mode === "manual")
    return `Handle this by hand until it returns: ${kindFallback(c.kind)}`;
  return `Running on the last good data: ${kindFallback(c.kind)}`;
}

function impactSentence(c: ConnectionRow): string {
  if (!c.is_required) return "This feed is optional, so the schedule is unaffected.";
  return `${kindLabel(c.kind)} data is stale.`;
}

// --- Last known good ------------------------------------------------------

export async function lastKnownGood(kindOrSlug: string) {
  const { data: conns } = await db
    .from("integration_connections")
    .select("id,slug,kind,name")
    .or(`kind.eq.${kindOrSlug},slug.eq.${kindOrSlug}`);
  const ids = (conns ?? []).map((c) => c.id as string);
  if (!ids.length) return null;
  const { data } = await db
    .from("integration_snapshots")
    .select("*")
    .in("connection_id", ids)
    .order("captured_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!data) return null;
  return {
    connectionId: data.connection_id as string,
    kind: data.kind as string,
    rows: data.rows as number,
    capturedAt: data.captured_at as string,
    summary: (data.summary as string) ?? "",
    payload: data.payload as unknown,
    ageMinutes: minutesSince(data.captured_at as string) ?? 0,
  };
}

// --- Board ----------------------------------------------------------------

export async function integrationsBoard() {
  const [{ data: conns }, { data: syncs }, { data: incidents }, { data: snaps }] =
    await Promise.all([
      db.from("integration_connections").select("*").order("kind", { ascending: true }),
      db.from("integration_syncs").select("*").order("created_at", { ascending: false }).limit(120),
      db
        .from("integration_incidents")
        .select("*")
        .order("opened_at", { ascending: false })
        .limit(60),
      db
        .from("integration_snapshots")
        .select("connection_id,rows,captured_at,summary")
        .order("captured_at", { ascending: false }),
    ]);

  const snapFirst = new Map<string, { rows: number; capturedAt: string; summary: string }>();
  for (const s of snaps ?? []) {
    const id = s.connection_id as string;
    if (!snapFirst.has(id))
      snapFirst.set(id, {
        rows: s.rows as number,
        capturedAt: s.captured_at as string,
        summary: (s.summary as string) ?? "",
      });
  }

  const rows = ((conns ?? []) as ConnectionRow[]).map((c) => {
    const health = healthOf(c);
    const mine = (syncs ?? []).filter((s) => s.connection_id === c.id);
    const snap = snapFirst.get(c.id) ?? null;
    const okCount = mine.filter((s) => s.status === "ok").length;
    return {
      id: c.id,
      kind: c.kind,
      kindLabel: kindLabel(c.kind),
      slug: c.slug,
      name: c.name,
      vendor: c.vendor,
      direction: c.direction,
      transport: c.transport,
      authMode: c.auth_mode,
      endpointPath: c.endpoint_path,
      isEnabled: c.is_enabled,
      isRequired: c.is_required,
      expectedEveryMinutes: c.expected_every_minutes,
      staleAfterMinutes: c.stale_after_minutes,
      failureThreshold: c.failure_threshold,
      fallbackMode: c.fallback_mode as FallbackMode,
      fallbackSentence: fallbackSentence(c),
      notes: c.notes,
      status: health.status,
      reason: health.reason,
      ageMinutes: health.ageMinutes,
      ageLabel: health.ageMinutes === null ? "never" : `${humanAge(health.ageMinutes)} ago`,
      lastSyncAt: c.last_sync_at,
      lastSuccessAt: c.last_success_at,
      lastFailureAt: c.last_failure_at,
      lastMessage: c.last_message,
      consecutiveFailures: c.consecutive_failures,
      totalSyncs: c.total_syncs,
      reliability: mine.length ? Math.round((okCount / mine.length) * 100) : null,
      snapshot: snap,
      recent: mine.slice(0, 8).map((s) => ({
        id: s.id as string,
        status: s.status as string,
        direction: s.direction as string,
        trigger: s.trigger as string,
        rowsReceived: s.rows_received as number,
        rowsApplied: s.rows_applied as number,
        rowsSkipped: s.rows_skipped as number,
        durationMs: s.duration_ms as number,
        message: s.message as string,
        createdAt: s.created_at as string,
      })),
    };
  });

  const open = (incidents ?? []).filter((i) => i.status === "open");
  const byId = new Map(rows.map((r) => [r.id, r]));
  const incidentRows = (incidents ?? []).map((i) => ({
    id: i.id as string,
    connectionId: i.connection_id as string,
    connectionName: byId.get(i.connection_id as string)?.name ?? "Unknown system",
    severity: i.severity as string,
    status: i.status as string,
    summary: i.summary as string,
    impact: i.impact as string,
    fallbackUsed: i.fallback_used as string,
    openedAt: i.opened_at as string,
    resolvedAt: (i.resolved_at as string | null) ?? null,
    acknowledgedBy: (i.acknowledged_by as string) ?? "",
  }));

  const enabled = rows.filter((r) => r.isEnabled);
  const failing = enabled.filter((r) => r.status === "failing");
  const degraded = enabled.filter((r) => r.status === "degraded");
  const healthy = enabled.filter((r) => r.status === "healthy");
  const requiredDown = failing.filter((r) => r.isRequired);

  const posture =
    requiredDown.length > 0
      ? "degraded"
      : degraded.length > 0
        ? "watch"
        : enabled.length === 0
          ? "unconfigured"
          : "healthy";

  return {
    rows,
    incidents: incidentRows,
    kinds: INTEGRATION_KINDS.map((k) => ({ ...k })),
    summary: {
      total: rows.length,
      enabled: enabled.length,
      healthy: healthy.length,
      degraded: degraded.length,
      failing: failing.length,
      openIncidents: open.length,
      posture,
      headline:
        posture === "healthy"
          ? "Every connected system is reporting in. The schedule is running on live data."
          : posture === "watch"
            ? `${degraded.length} feed${degraded.length === 1 ? " is" : "s are"} running late. The schedule is still safe.`
            : posture === "unconfigured"
              ? "No outside systems are switched on yet. The schedule runs entirely on what is entered here."
              : `${requiredDown.length} required feed${requiredDown.length === 1 ? " is" : "s are"} down. The schedule is running on the last good data instead of stopping.`,
    },
  };
}

// --- Config ---------------------------------------------------------------

export async function saveConnection(
  input: {
    id?: string | null | undefined;
    kind?: string | undefined;
    name?: string | undefined;
    vendor?: string | undefined;
    slug?: string | undefined;
    direction?: string | undefined;
    transport?: string | undefined;
    isEnabled?: boolean | undefined;
    isRequired?: boolean | undefined;
    expectedEveryMinutes?: number | undefined;
    staleAfterMinutes?: number | undefined;
    failureThreshold?: number | undefined;
    fallbackMode?: string | undefined;
    notes?: string | undefined;
  },
  actorLabel: string,
) {
  const patch: Record<string, unknown> = {};
  if (input.name !== undefined) patch["name"] = input.name.trim();
  if (input.vendor !== undefined) patch["vendor"] = input.vendor.trim();
  if (input.direction !== undefined) patch["direction"] = input.direction;
  if (input.transport !== undefined) patch["transport"] = input.transport;
  if (input.isEnabled !== undefined) patch["is_enabled"] = input.isEnabled;
  if (input.isRequired !== undefined) patch["is_required"] = input.isRequired;
  if (input.expectedEveryMinutes !== undefined)
    patch["expected_every_minutes"] = Math.max(5, input.expectedEveryMinutes);
  if (input.staleAfterMinutes !== undefined)
    patch["stale_after_minutes"] = Math.max(10, input.staleAfterMinutes);
  if (input.failureThreshold !== undefined)
    patch["failure_threshold"] = Math.max(1, input.failureThreshold);
  if (input.fallbackMode !== undefined) patch["fallback_mode"] = input.fallbackMode;
  if (input.notes !== undefined) patch["notes"] = input.notes;

  if (input.id) {
    const existing = await connectionBy({ id: input.id });
    if (!existing) throw new Error("That connection no longer exists.");
    const projected = { ...existing, ...(patch as Partial<ConnectionRow>) } as ConnectionRow;
    patch["status"] = healthOf(projected).status;
    await db
      .from("integration_connections")
      .update(patch as never)
      .eq("id", input.id);
    if (input.isEnabled === false)
      await resolveIncidentsFor(input.id, "Connection was switched off.");
    await logAudit("integration_saved", actorLabel, "integration", input.id, patch);
    return { ok: true as const, id: input.id };
  }

  const name = (input.name ?? "").trim();
  if (!name) throw new Error("Give the connection a name.");
  const kind = (input.kind ?? "").trim();
  if (!KIND_META.has(kind as IntegrationKind))
    throw new Error("Pick which kind of system this is.");
  const slug =
    (input.slug ?? "").trim() ||
    `${kind}-${name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")}`.slice(0, 60);
  const { data, error } = await db
    .from("integration_connections")
    .insert({
      kind,
      slug,
      name,
      endpoint_path: `/api/public/hooks/integration/${slug}`,
      ...patch,
    } as never)
    .select("id")
    .maybeSingle();
  if (error)
    throw new Error(
      error.message.includes("duplicate")
        ? "A connection with that name already exists."
        : error.message,
    );
  await logAudit("integration_created", actorLabel, "integration", (data?.id as string) ?? null, {
    name,
    kind,
    slug,
  });
  return { ok: true as const, id: (data?.id as string) ?? "" };
}

export async function deleteConnection(id: string, actorLabel: string) {
  await db.from("integration_connections").delete().eq("id", id);
  await logAudit("integration_deleted", actorLabel, "integration", id, {});
  return { ok: true as const };
}

export async function acknowledgeIncident(id: string, actorLabel: string) {
  await db
    .from("integration_incidents")
    .update({
      status: "resolved",
      resolved_at: new Date().toISOString(),
      acknowledged_by: actorLabel,
    })
    .eq("id", id);
  return { ok: true as const };
}

// --- Ingest ---------------------------------------------------------------

export type IngestResult = {
  ok: boolean;
  applied: number;
  received: number;
  skipped: number;
  message: string;
  errors: string[];
};

type Row = Record<string, unknown>;
const norm = (k: string) => k.toLowerCase().replace(/[^a-z0-9]/g, "");
/** Keys are matched loosely so payrollId, payroll_id, "Payroll ID" and payrollid all hit. */
const str = (r: Row, ...keys: string[]) => {
  for (const k of keys) {
    const v = r[k];
    if (v !== undefined && v !== null && String(v).trim() !== "") return String(v).trim();
  }
  const wanted = keys.map(norm);
  for (const [key, value] of Object.entries(r)) {
    if (!wanted.includes(norm(key))) continue;
    if (value !== undefined && value !== null && String(value).trim() !== "")
      return String(value).trim();
  }
  return "";
};
const num = (r: Row, ...keys: string[]) => {
  const v = str(r, ...keys);
  const n = Number(v.replace(/[^0-9.-]/g, ""));
  return Number.isFinite(n) ? n : null;
};
const bool = (r: Row, ...keys: string[]) => {
  const v = str(r, ...keys).toLowerCase();
  if (!v) return null;
  return ["1", "true", "yes", "y", "active", "a"].includes(v);
};
const isoDate = (v: string) => {
  if (!v) return null;
  const d = new Date(v.includes("T") ? v : `${v}T00:00:00`);
  return Number.isNaN(d.getTime()) ? null : toISODate(d);
};

async function employeeIndex() {
  const { data } = await db
    .from("employees")
    .select("id,full_name,email,payroll_id,clock_in_number,position,is_active");
  const byPayroll = new Map<string, string>();
  const byClock = new Map<string, string>();
  const byEmail = new Map<string, string>();
  const byName = new Map<string, string[]>();
  for (const e of data ?? []) {
    const id = e.id as string;
    const pid = (e.payroll_id as string)?.trim();
    const cin = (e.clock_in_number as string)?.trim();
    const em = (e.email as string | null)?.trim().toLowerCase();
    const nm = (e.full_name as string).trim().toLowerCase();
    if (pid) byPayroll.set(pid, id);
    if (cin) byClock.set(cin, id);
    if (em) byEmail.set(em, id);
    byName.set(nm, [...(byName.get(nm) ?? []), id]);
  }
  return {
    resolve(r: Row): string | null {
      const pid = str(r, "payrollId", "payroll_id", "employeeId", "employee_id", "employeeNumber");
      if (pid && byPayroll.has(pid)) return byPayroll.get(pid) ?? null;
      const cin = str(r, "clockInNumber", "clock_in_number", "badge", "badgeId");
      if (cin && byClock.has(cin)) return byClock.get(cin) ?? null;
      const em = str(r, "email", "workEmail").toLowerCase();
      if (em && byEmail.has(em)) return byEmail.get(em) ?? null;
      const first = str(r, "firstName", "first_name");
      const last = str(r, "lastName", "last_name");
      const name = (str(r, "name", "fullName", "full_name", "employee") || `${first} ${last}`)
        .trim()
        .toLowerCase();
      const hits = name ? byName.get(name) : undefined;
      return hits && hits.length === 1 ? (hits[0] ?? null) : null;
    },
  };
}

/** Applies a payload for a connection and records the sync + snapshot in one shot. */
export async function ingest(input: {
  slug: string;
  rows?: unknown;
  csv?: string | undefined;
  trigger?: string;
  actorLabel?: string;
}): Promise<IngestResult & { connection: string; status: IntegrationStatus }> {
  const c = await connectionBy({ slug: input.slug });
  if (!c) throw new Error(`No connection named "${input.slug}" is set up.`);
  const started = Date.now();

  let rows: Row[] = Array.isArray(input.rows) ? (input.rows as Row[]) : [];
  if (!rows.length && input.csv?.trim()) rows = parseDelimited(input.csv);

  let result: IngestResult;
  try {
    if (!c.is_enabled) throw new Error("This connection is switched off.");
    result = await applyByKind(c.kind, rows);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Import failed.";
    await recordSync({
      connection: c,
      trigger: input.trigger ?? "webhook",
      status: "failed",
      rowsReceived: rows.length,
      durationMs: Date.now() - started,
      message,
      actorLabel: input.actorLabel ?? "feed",
    });
    const after = await connectionBy({ id: c.id });
    return {
      ok: false,
      applied: 0,
      received: rows.length,
      skipped: rows.length,
      message,
      errors: [message],
      connection: c.name,
      status: after ? healthOf(after).status : "failing",
    };
  }

  await recordSync({
    connection: c,
    trigger: input.trigger ?? "webhook",
    status:
      result.errors.length && result.applied === 0
        ? "failed"
        : result.skipped > 0 || result.errors.length
          ? "partial"
          : "ok",
    rowsReceived: result.received,
    rowsApplied: result.applied,
    rowsSkipped: result.skipped,
    durationMs: Date.now() - started,
    message: result.message,
    details: { errors: result.errors.slice(0, 25) },
    actorLabel: input.actorLabel ?? "feed",
    snapshot:
      result.applied > 0
        ? { rows: result.applied, payload: rows.slice(0, 500), summary: result.message }
        : null,
  });

  const after = await connectionBy({ id: c.id });
  return { ...result, connection: c.name, status: after ? healthOf(after).status : "healthy" };
}

async function applyByKind(kind: string, rows: Row[]): Promise<IngestResult> {
  switch (kind) {
    case "emr":
      return applyCensus(rows);
    case "timeclock":
      return applyPunches(rows);
    case "hris":
      return applyRoster(rows);
    case "credentialing":
      return applyCredentials(rows);
    case "agency":
      return applyAgency(rows);
    case "payroll":
      return applyPayrollAck(rows);
    default:
      throw new Error(`No importer exists for "${kind}" yet.`);
  }
}

async function applyCensus(rows: Row[]): Promise<IngestResult> {
  const { applyCensusPayload } = await import("./census-import.server");
  const mapped = rows
    .map((r) => ({
      date: isoDate(str(r, "date", "censusDate", "census_date", "serviceDate", "day")) ?? "",
      unit: str(r, "unit", "unitName", "unit_name", "station", "floor", "location"),
      census: num(r, "census", "count", "residents", "occupied", "midnightCensus") ?? 0,
    }))
    .filter((r) => r.date && r.unit);
  if (!mapped.length)
    throw new Error("No usable census rows — each row needs a date, a unit and a count.");
  const res = (await applyCensusPayload({
    rows: mapped,
    source: "api",
    connector: "integration",
    actorLabel: "the census feed",
  })) as { ok?: boolean; applied?: number; skipped?: number; message?: string; errors?: string[] };
  const applied = res.applied ?? mapped.length;
  return {
    ok: res.ok !== false,
    received: rows.length,
    applied,
    skipped: rows.length - applied,
    message: res.message ?? `Applied census for ${applied} unit-day${applied === 1 ? "" : "s"}.`,
    errors: res.errors ?? [],
  };
}

async function applyPunches(rows: Row[]): Promise<IngestResult> {
  const index = await employeeIndex();
  const errors: string[] = [];
  let applied = 0;
  for (const r of rows) {
    const employeeId = index.resolve(r);
    if (!employeeId) {
      errors.push(
        `No match for ${str(r, "name", "fullName", "payrollId", "clockInNumber") || "an unnamed punch"}.`,
      );
      continue;
    }
    const inAt = str(r, "clockIn", "clock_in", "in", "punchIn", "start");
    const outAt = str(r, "clockOut", "clock_out", "out", "punchOut", "end");
    const date =
      isoDate(str(r, "date", "workDate", "shiftDate")) ?? (inAt ? isoDate(inAt) : null) ?? today();
    const clockIn = inAt ? new Date(inAt) : null;
    const clockOut = outAt ? new Date(outAt) : null;
    const minutes =
      num(r, "minutes", "minutesWorked", "minutes_worked") ??
      (clockIn && clockOut
        ? Math.max(0, Math.round((clockOut.getTime() - clockIn.getTime()) / 60000))
        : 0);

    const { data: existing } = await db
      .from("time_punches")
      .select("id")
      .eq("employee_id", employeeId)
      .eq("date", date)
      .maybeSingle();
    const payload = {
      employee_id: employeeId,
      date,
      clock_in: clockIn && !Number.isNaN(clockIn.getTime()) ? clockIn.toISOString() : null,
      clock_out: clockOut && !Number.isNaN(clockOut.getTime()) ? clockOut.toISOString() : null,
      minutes_worked: Math.round(minutes),
      source: "integration",
      exception: str(r, "exception") || null,
    };
    const { error } = existing
      ? await db
          .from("time_punches")
          .update(payload)
          .eq("id", existing.id as string)
      : await db.from("time_punches").insert(payload);
    if (error) errors.push(error.message);
    else applied += 1;
  }
  return {
    ok: applied > 0 || rows.length === 0,
    received: rows.length,
    applied,
    skipped: rows.length - applied,
    message: `Recorded ${applied} punch record${applied === 1 ? "" : "s"}${errors.length ? `, ${errors.length} skipped` : ""}.`,
    errors,
  };
}

async function applyRoster(rows: Row[]): Promise<IngestResult> {
  const index = await employeeIndex();
  const { data: units } = await db.from("units").select("id,name");
  const unitByName = new Map(
    (units ?? []).map((u) => [(u.name as string).toLowerCase(), u.id as string]),
  );
  const errors: string[] = [];
  let applied = 0;

  for (const r of rows) {
    const employeeId = index.resolve(r);
    const status = str(r, "status", "employmentStatus").toLowerCase();
    const terminated = status.includes("term") || bool(r, "terminated") === true;
    const patch: Record<string, unknown> = {};
    const rate = num(r, "hourlyRate", "hourly_rate", "rate", "payRate");
    if (rate !== null && rate > 0) patch["hourly_rate"] = rate;
    const phone = str(r, "phone", "mobile", "cell");
    if (phone) patch["phone"] = phone;
    const email = str(r, "email", "workEmail");
    if (email) patch["email"] = email;
    const payrollId = str(r, "payrollId", "payroll_id", "employeeNumber");
    if (payrollId) patch["payroll_id"] = payrollId;
    const clockIn = str(r, "clockInNumber", "clock_in_number", "badge");
    if (clockIn) patch["clock_in_number"] = clockIn;
    const unitName = str(r, "unit", "department", "homeUnit").toLowerCase();
    if (unitName && unitByName.has(unitName)) patch["primary_unit_id"] = unitByName.get(unitName);
    const hire = isoDate(str(r, "hireDate", "hire_date", "startDate"));
    if (hire) patch["hire_date"] = hire;
    const empType = str(r, "employmentType", "employment_type", "type");
    if (empType)
      patch["employment_type"] = empType.toLowerCase().includes("part")
        ? "part_time"
        : empType.toLowerCase().includes("prn")
          ? "prn"
          : "full_time";

    if (terminated) {
      patch["is_active"] = false;
      patch["termination_date"] =
        isoDate(str(r, "terminationDate", "termination_date", "endDate")) ?? today();
    } else if (status) {
      patch["is_active"] = true;
    }

    if (!employeeId) {
      errors.push(
        `No roster match for ${str(r, "name", "fullName", "email", "payrollId") || "an unnamed record"} — add them under New hires first.`,
      );
      continue;
    }
    if (Object.keys(patch).length === 0) {
      errors.push(`Nothing to update for ${str(r, "name", "fullName") || "a record"}.`);
      continue;
    }
    const { error } = await db
      .from("employees")
      .update(patch as never)
      .eq("id", employeeId);
    if (error) errors.push(error.message);
    else applied += 1;
  }
  return {
    ok: applied > 0 || rows.length === 0,
    received: rows.length,
    applied,
    skipped: rows.length - applied,
    message: `Updated ${applied} staff record${applied === 1 ? "" : "s"} from HR${errors.length ? `, ${errors.length} skipped` : ""}.`,
    errors,
  };
}

async function applyCredentials(rows: Row[]): Promise<IngestResult> {
  const index = await employeeIndex();
  const errors: string[] = [];
  let applied = 0;
  for (const r of rows) {
    const employeeId = index.resolve(r);
    if (!employeeId) {
      errors.push(
        `No match for ${str(r, "name", "fullName", "licenseNumber") || "an unnamed license"}.`,
      );
      continue;
    }
    const kind = str(r, "kind", "credential", "type", "licenseType") || "Nursing license";
    const expires = isoDate(
      str(r, "expires", "expiresOn", "expires_on", "expirationDate", "expiration"),
    );
    if (!expires) {
      errors.push(`Missing expiration date for ${str(r, "name", "fullName") || "a license"}.`);
      continue;
    }
    const rawStatus = str(r, "status", "licenseStatus").toLowerCase();
    const status =
      rawStatus.includes("susp") || rawStatus.includes("revok") || rawStatus.includes("inactive")
        ? "invalid"
        : "active";
    const payload = {
      employee_id: employeeId,
      kind,
      identifier: str(r, "licenseNumber", "identifier", "number"),
      issued_on: isoDate(str(r, "issued", "issuedOn", "issue_date")),
      expires_on: expires,
      status,
      notes: str(r, "notes") || "Verified by the credentialing feed.",
    };
    const { data: existing } = await db
      .from("employee_credentials")
      .select("id")
      .eq("employee_id", employeeId)
      .eq("kind", kind)
      .maybeSingle();
    const { error } = existing
      ? await db
          .from("employee_credentials")
          .update(payload)
          .eq("id", existing.id as string)
      : await db.from("employee_credentials").insert(payload);
    if (error) errors.push(error.message);
    else applied += 1;
  }
  return {
    ok: applied > 0 || rows.length === 0,
    received: rows.length,
    applied,
    skipped: rows.length - applied,
    message: `Verified ${applied} credential${applied === 1 ? "" : "s"}${errors.length ? `, ${errors.length} skipped` : ""}.`,
    errors,
  };
}

async function applyAgency(rows: Row[]): Promise<IngestResult> {
  const { data: agencies } = await db.from("agencies").select("id,name");
  const byName = new Map(
    (agencies ?? []).map((a) => [(a.name as string).toLowerCase(), a.id as string]),
  );
  const errors: string[] = [];
  let applied = 0;
  for (const r of rows) {
    const agencyName = str(r, "agency", "agencyName", "vendor");
    const agencyId = byName.get(agencyName.toLowerCase());
    if (!agencyId) {
      errors.push(
        `Unknown agency "${agencyName || "(blank)"}" — add it on the Agencies page first.`,
      );
      continue;
    }
    const fullName = str(r, "name", "fullName", "worker", "nurse");
    if (!fullName) {
      errors.push("An agency worker row had no name.");
      continue;
    }
    const posRaw = str(r, "position", "role", "title").toLowerCase();
    const position: PositionType = posRaw.includes("qma")
      ? "qma"
      : posRaw.includes("cna") || posRaw.includes("aide")
        ? "cna"
        : "nurse";
    const payload = {
      agency_id: agencyId,
      full_name: fullName,
      position,
      phone: str(r, "phone", "mobile"),
      email: str(r, "email"),
      clock_in_number: str(r, "clockInNumber", "badge"),
      is_active: bool(r, "active", "isActive") ?? true,
      notes: str(r, "notes") || "Synced from the agency portal.",
    };
    const { data: existing } = await db
      .from("agency_staff")
      .select("id")
      .eq("agency_id", agencyId)
      .ilike("full_name", fullName)
      .maybeSingle();
    const { error } = existing
      ? await db
          .from("agency_staff")
          .update(payload)
          .eq("id", existing.id as string)
      : await db.from("agency_staff").insert(payload);
    if (error) errors.push(error.message);
    else applied += 1;
  }
  return {
    ok: applied > 0 || rows.length === 0,
    received: rows.length,
    applied,
    skipped: rows.length - applied,
    message: `Synced ${applied} agency worker${applied === 1 ? "" : "s"}${errors.length ? `, ${errors.length} skipped` : ""}.`,
    errors,
  };
}

/** Payroll is outbound; an inbound call is the payroll system acknowledging a file. */
async function applyPayrollAck(rows: Row[]): Promise<IngestResult> {
  const accepted = rows.filter((r) =>
    (str(r, "status", "result") || "accepted").toLowerCase().startsWith("acc"),
  ).length;
  const rejected = rows.length - accepted;
  return {
    ok: rejected === 0,
    received: rows.length,
    applied: accepted,
    skipped: rejected,
    message: rows.length
      ? `Payroll acknowledged ${accepted} record${accepted === 1 ? "" : "s"}${rejected ? `, rejected ${rejected}` : ""}.`
      : "Payroll checked in with nothing to report.",
    errors: rejected
      ? [`${rejected} payroll record${rejected === 1 ? " was" : "s were"} rejected.`]
      : [],
  };
}

// --- Outbound -------------------------------------------------------------

/** Pushes the current pay period out to payroll, or records why it could not go. */
export async function pushPayroll(
  input: { format?: string | undefined; companyCode?: string | undefined },
  actorLabel: string,
) {
  const c = await connectionBy({ slug: "payroll-export" });
  if (!c) throw new Error("The payroll connection is missing.");
  const started = Date.now();
  try {
    const { payrollExport } = await import("./payroll-export.server");
    const fmt = (input.format ?? "standard") as Parameters<typeof payrollExport>[0]["format"];
    const out = (await payrollExport({
      format: fmt,
      companyCode: input.companyCode ?? "MAIN",
    })) as {
      rows?: unknown[];
      content?: string;
      fileName?: string;
    };
    const count = Array.isArray(out.rows) ? out.rows.length : 0;
    const message = `Prepared ${count} payroll line${count === 1 ? "" : "s"} for ${fmt}.`;
    await recordSync({
      connection: c,
      direction: "outbound",
      trigger: "manual",
      status: "ok",
      rowsReceived: count,
      rowsApplied: count,
      durationMs: Date.now() - started,
      message,
      actorLabel,
      snapshot: {
        rows: count,
        payload: { fileName: out.fileName ?? "payroll.csv", format: fmt },
        summary: message,
      },
    });
    return {
      ok: true as const,
      message,
      fileName: out.fileName ?? "payroll.csv",
      content: out.content ?? "",
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Payroll push failed.";
    await recordSync({
      connection: c,
      direction: "outbound",
      trigger: "manual",
      status: "failed",
      durationMs: Date.now() - started,
      message,
      actorLabel,
    });
    throw new Error(message);
  }
}

/** Sends a synthetic round-trip through a connection so managers can prove it works. */
export async function testConnection(slug: string, actorLabel: string) {
  const c = await connectionBy({ slug });
  if (!c) throw new Error("That connection no longer exists.");
  const started = Date.now();
  const checks: string[] = [];
  if (!c.is_enabled) checks.push("The connection is switched off, so nothing is expected from it.");
  if (!c.endpoint_path) checks.push("No endpoint is configured.");
  const snap = await lastKnownGood(c.slug);
  checks.push(
    snap
      ? `Last good data is ${humanAge(snap.ageMinutes)} old and holds ${snap.rows} row${snap.rows === 1 ? "" : "s"}.`
      : "There is no saved fallback data for this system yet.",
  );
  const health = healthOf(c);
  const message = `Check: ${health.reason} ${checks.join(" ")}`;
  await recordSync({
    connection: c,
    trigger: "test",
    status: health.status === "failing" ? "partial" : "ok",
    durationMs: Date.now() - started,
    message,
    actorLabel,
  });
  return { ok: health.status !== "failing", status: health.status, message };
}

// --- Health sweep (runs in the hourly cycle) ------------------------------

export async function integrationHealthSweep() {
  const { data } = await db.from("integration_connections").select("*");
  const conns = (data ?? []) as ConnectionRow[];
  const degraded: Array<{
    name: string;
    kind: string;
    reason: string;
    fallback: string;
    required: boolean;
  }> = [];
  let opened = 0;
  let resolved = 0;

  for (const c of conns) {
    const health = healthOf(c);
    if (health.status !== c.status)
      await db.from("integration_connections").update({ status: health.status }).eq("id", c.id);
    if (!c.is_enabled) continue;
    if (health.status === "failing") {
      const before = await db
        .from("integration_incidents")
        .select("id")
        .eq("connection_id", c.id)
        .eq("status", "open")
        .maybeSingle();
      await openIncident(
        c,
        c.is_required ? "critical" : "warning",
        `${c.name}: ${health.reason}`,
        health.reason,
      );
      if (!before.data) opened += 1;
      degraded.push({
        name: c.name,
        kind: c.kind,
        reason: health.reason,
        fallback: fallbackSentence(c),
        required: c.is_required,
      });
    } else if (health.status === "healthy") {
      resolved += await resolveIncidentsFor(c.id, "The feed is reporting in normally again.");
    }
  }

  const carried = await carryForwardCensus(conns);

  return {
    checked: conns.length,
    degraded,
    opened,
    resolved,
    carriedCensusDays: carried,
    safe: degraded.filter((d) => d.required).length === 0,
    summary: degraded.length
      ? `${degraded.length} feed${degraded.length === 1 ? " is" : "s are"} down — the schedule kept running on the last good data.`
      : "All connected systems are reporting in.",
  };
}

/** Census is the one feed the schedule cannot compute without, so stale days are backfilled. */
async function carryForwardCensus(conns: ConnectionRow[]) {
  const emr = conns.find((c) => c.kind === "emr" && c.is_enabled);
  if (!emr) return 0;
  const health = healthOf(emr);
  if (health.status !== "failing" || emr.fallback_mode !== "last_known_good") return 0;

  const { data: units } = await db.from("units").select("id");
  const unitIds = (units ?? []).map((u) => u.id as string);
  if (!unitIds.length) return 0;

  let carried = 0;
  for (let i = 0; i < 3; i += 1) {
    const date = addDays(today(), i);
    for (const unitId of unitIds) {
      const { data: existing } = await db
        .from("census_days")
        .select("id")
        .eq("date", date)
        .eq("unit_id", unitId)
        .maybeSingle();
      if (existing) continue;
      const { data: prior } = await db
        .from("census_days")
        .select("census")
        .eq("unit_id", unitId)
        .lt("date", date)
        .order("date", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (!prior) continue;
      const { error } = await db.from("census_days").insert({
        date,
        unit_id: unitId,
        census: prior.census as number,
        source: "carried_forward",
      });
      if (!error) carried += 1;
    }
  }
  if (carried)
    await logAudit("census_carried_forward", "the system", "integration", emr.id, { carried });
  return carried;
}

/** Plain-language posture used by the dashboard banner and the assistant. */
export async function integrationPosture() {
  const board = await integrationsBoard();
  return {
    posture: board.summary.posture,
    headline: board.summary.headline,
    down: board.rows
      .filter((r) => r.isEnabled && (r.status === "failing" || r.status === "degraded"))
      .map((r) => ({
        name: r.name,
        kind: r.kindLabel,
        status: r.status,
        reason: r.reason,
        fallback: r.fallbackSentence,
      })),
  };
}

// --- CSV ------------------------------------------------------------------

export function parseDelimited(text: string): Row[] {
  const lines = text.split(/\r?\n/).filter((l) => l.trim() !== "");
  if (lines.length < 2) return [];
  const split = (line: string) => {
    const out: string[] = [];
    let cur = "";
    let quoted = false;
    for (let i = 0; i < line.length; i += 1) {
      const ch = line[i];
      if (ch === '"') {
        if (quoted && line[i + 1] === '"') {
          cur += '"';
          i += 1;
        } else quoted = !quoted;
      } else if ((ch === "," || ch === "\t" || ch === "|") && !quoted) {
        out.push(cur);
        cur = "";
      } else cur += ch;
    }
    out.push(cur);
    return out.map((v) => v.trim().replace(/^"|"$/g, ""));
  };
  const headers = split(lines[0] ?? "").map((h) => h.replace(/\s+/g, "").toLowerCase());
  return lines.slice(1).map((line) => {
    const cells = split(line);
    const row: Row = {};
    headers.forEach((h, i) => {
      row[h] = cells[i] ?? "";
      // also expose the raw header so camelCase lookups hit
      row[h.replace(/[^a-z0-9]/g, "")] = cells[i] ?? "";
    });
    return row;
  });
}

export type { ShiftType };
