// Permission checks for reply-to-claim shift texts.
import { broadcastOpenShift, claimBoard } from "./claims.server";
import { loadActor, requireManager, type Actor } from "./staffing.server";

function label(actor: Actor) {
  return `${actor.profile?.full_name ?? actor.profile?.email ?? "user"} (${actor.role})`;
}

export async function claimBoardQuery(userId: string) {
  const actor = await loadActor(userId);
  requireManager(actor);
  return claimBoard();
}

export async function broadcastShiftAction(
  userId: string,
  input: {
    assignmentId: string;
    limit?: number | undefined;
    hoursToRespond?: number | undefined;
    includeOvertime?: boolean | undefined;
  },
) {
  const actor = await loadActor(userId);
  requireManager(actor);
  return broadcastOpenShift(input.assignmentId, label(actor), {
    ...(input.limit === undefined ? {} : { limit: input.limit }),
    ...(input.hoursToRespond === undefined ? {} : { hoursToRespond: input.hoursToRespond }),
    ...(input.includeOvertime === undefined ? {} : { includeOvertime: input.includeOvertime }),
  });
}
