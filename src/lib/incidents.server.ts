// Security incident register. Server-only.
import { db, logAudit } from "./staffing.server";

export type IncidentSeverity = "low" | "medium" | "high" | "critical";
export type IncidentStatus = "open" | "investigating" | "resolved";

export type IncidentRow = {
  id: string;
  title: string;
  severity: IncidentSeverity;
  status: IncidentStatus;
  detectedAt: string;
  detectedBy: string;
  summary: string;
  impact: string | null;
  remediation: string | null;
  resolvedAt: string | null;
  followUp: string | null;
};

function map(r: Record<string, unknown>): IncidentRow {
  return {
    id: r["id"] as string,
    title: r["title"] as string,
    severity: (r["severity"] as IncidentSeverity) ?? "low",
    status: (r["status"] as IncidentStatus) ?? "open",
    detectedAt: r["detected_at"] as string,
    detectedBy: r["detected_by"] as string,
    summary: r["summary"] as string,
    impact: (r["impact"] as string | null) ?? null,
    remediation: (r["remediation"] as string | null) ?? null,
    resolvedAt: (r["resolved_at"] as string | null) ?? null,
    followUp: (r["follow_up"] as string | null) ?? null,
  };
}

export async function listIncidents(limit = 50): Promise<IncidentRow[]> {
  const { data } = await db
    .from("security_incidents")
    .select("*")
    .order("detected_at", { ascending: false })
    .limit(limit);
  return (data ?? []).map((r) => map(r as Record<string, unknown>));
}

export async function createIncident(
  input: {
    title: string;
    severity: IncidentSeverity;
    summary: string;
    impact?: string | undefined;
    detectedAt?: string | undefined;
  },
  actorLabel: string,
): Promise<IncidentRow> {
  const { data, error } = await db
    .from("security_incidents")
    .insert({
      title: input.title,
      severity: input.severity,
      status: "open",
      summary: input.summary,
      impact: input.impact ?? null,
      detected_by: actorLabel,
      ...(input.detectedAt ? { detected_at: input.detectedAt } : {}),
    })
    .select("*")
    .maybeSingle();
  if (error) throw new Error(error.message);
  const row = map((data ?? {}) as Record<string, unknown>);
  await logAudit("security_incident_opened", actorLabel, "security_incidents", row.id, {
    title: input.title,
    severity: input.severity,
  });
  return row;
}

export async function updateIncident(
  id: string,
  input: {
    status?: IncidentStatus | undefined;
    remediation?: string | undefined;
    followUp?: string | undefined;
  },
  actorLabel: string,
): Promise<IncidentRow> {
  const patch: {
    status?: IncidentStatus;
    resolved_at?: string | null;
    remediation?: string;
    follow_up?: string;
  } = {};
  if (input.status !== undefined) {
    patch.status = input.status;
    patch.resolved_at = input.status === "resolved" ? new Date().toISOString() : null;
  }
  if (input.remediation !== undefined) patch.remediation = input.remediation;
  if (input.followUp !== undefined) patch.follow_up = input.followUp;

  const { data, error } = await db
    .from("security_incidents")
    .update(patch)
    .eq("id", id)
    .select("*")
    .maybeSingle();
  if (error) throw new Error(error.message);
  await logAudit("security_incident_updated", actorLabel, "security_incidents", id, patch);
  return map((data ?? {}) as Record<string, unknown>);
}
