// Permission wrappers for the integration layer.
import { loadActor, requireManager } from "./staffing.server";
import {
  acknowledgeIncident,
  deleteConnection,
  ingest,
  integrationHealthSweep,
  integrationPosture,
  integrationsBoard,
  pushPayroll,
  saveConnection,
  testConnection,
} from "./integrations.server";

async function manager(userId: string) {
  const actor = await loadActor(userId);
  requireManager(actor);
  return actor;
}
const label = (a: Awaited<ReturnType<typeof loadActor>>) =>
  a.employee?.full_name ?? a.profile?.full_name ?? a.profile?.email ?? "a manager";

export async function integrationsBoardQuery(userId: string) {
  await manager(userId);
  return integrationsBoard();
}

export async function integrationPostureQuery(userId: string) {
  await loadActor(userId);
  return integrationPosture();
}

export async function saveConnectionAction(
  userId: string,
  input: Parameters<typeof saveConnection>[0],
) {
  const actor = await manager(userId);
  return saveConnection(input, label(actor));
}

export async function deleteConnectionAction(userId: string, id: string) {
  const actor = await manager(userId);
  return deleteConnection(id, label(actor));
}

export async function testConnectionAction(userId: string, slug: string) {
  const actor = await manager(userId);
  return testConnection(slug, label(actor));
}

export async function ingestAction(
  userId: string,
  input: { slug: string; rows?: unknown; csv?: string | undefined },
) {
  const actor = await manager(userId);
  return ingest({ ...input, trigger: "manual", actorLabel: label(actor) });
}

export async function acknowledgeIncidentAction(userId: string, id: string) {
  const actor = await manager(userId);
  return acknowledgeIncident(id, label(actor));
}

export async function pushPayrollAction(
  userId: string,
  input: { format?: string | undefined; companyCode?: string | undefined },
) {
  const actor = await manager(userId);
  return pushPayroll(input, label(actor));
}

export async function healthSweepAction(userId: string) {
  await manager(userId);
  return integrationHealthSweep();
}
