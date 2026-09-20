import { loadActor, requireManager, today } from "./staffing.server";
import { activityFeed, handoffReport, undoActivity } from "./oversight.server";

async function manager(userId: string) {
  const actor = await loadActor(userId);
  requireManager(actor);
  return actor;
}

export async function handoffQuery(userId: string, date?: string) {
  await manager(userId);
  return handoffReport(date ?? today());
}

export async function activityQuery(userId: string, limit?: number, onlyUndoable?: boolean) {
  await manager(userId);
  return { entries: await activityFeed(limit ?? 60, { onlyUndoable: onlyUndoable ?? false }) };
}

export async function undoActivityAction(userId: string, auditId: string) {
  const actor = await manager(userId);
  return undoActivity(auditId, actor.profile?.full_name ?? actor.profile?.email ?? "manager");
}
