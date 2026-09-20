import {
  applyRetention,
  auditTrail,
  recordAccessReview,
  securityPosture,
  setAccountRole,
  updateSecuritySettings,
  getSecuritySettings,
} from "./security.server";
import { loadActor, requireAdmin } from "./staffing.server";

async function admin(userId: string) {
  const actor = await loadActor(userId);
  requireAdmin(actor);
  return actor.profile?.full_name ?? actor.profile?.email ?? "administrator";
}

export async function postureQuery(userId: string) {
  await admin(userId);
  return securityPosture();
}

export async function saveSecuritySettings(
  userId: string,
  input: {
    sessionTimeoutMinutes?: number | undefined;
    auditRetentionDays?: number | undefined;
    messageRetentionDays?: number | undefined;
    accessReviewDays?: number | undefined;
  },
) {
  const label = await admin(userId);
  return updateSecuritySettings(input, label);
}

export async function changeAccountRole(
  userId: string,
  targetUserId: string,
  role: "employee" | "manager" | "admin",
) {
  const label = await admin(userId);
  if (targetUserId === userId && role !== "admin")
    throw new Error(
      "You cannot remove your own administrator access. Ask another administrator to do it.",
    );
  return setAccountRole(targetUserId, role, label);
}

export async function completeAccessReview(
  userId: string,
  input: { accountsReviewed: number; changesMade: number; notes?: string | undefined },
) {
  const label = await admin(userId);
  return recordAccessReview(input, label);
}

export async function auditTrailExport(userId: string, days: number) {
  await admin(userId);
  return { rows: await auditTrail(days) };
}

export async function runRetention(userId: string) {
  const label = await admin(userId);
  return applyRetention(label);
}

/** How long a person can sit idle before they are signed out. Any signed-in user may read this. */
export async function sessionTimeoutForUser(userId: string) {
  await loadActor(userId);
  const s = await getSecuritySettings();
  return { minutes: s.sessionTimeoutMinutes };
}

import {
  createIncident,
  listIncidents,
  updateIncident,
  type IncidentSeverity,
  type IncidentStatus,
} from "./incidents.server";

export async function incidentList(userId: string) {
  await admin(userId);
  return { incidents: await listIncidents() };
}

export async function incidentCreate(
  userId: string,
  input: {
    title: string;
    severity: IncidentSeverity;
    summary: string;
    impact?: string | undefined;
  },
) {
  const label = await admin(userId);
  return createIncident(input, label);
}

export async function incidentUpdate(
  userId: string,
  id: string,
  input: {
    status?: IncidentStatus | undefined;
    remediation?: string | undefined;
    followUp?: string | undefined;
  },
) {
  const label = await admin(userId);
  return updateIncident(id, input, label);
}
