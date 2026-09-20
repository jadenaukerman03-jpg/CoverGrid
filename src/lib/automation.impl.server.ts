import { addDays, startOfWeek } from "./facility";
import { loadActor, requireManager, today } from "./staffing.server";
import { automationHistory, runAutomationCycle } from "./automation.server";
import { generateRotationSchedule, setEmployeeRotation } from "./rotation.server";
import { getAutopilotSettings, updateAutopilotSettings } from "./settings.server";
import { buybackOverview } from "./buyback.server";

async function manager(userId: string) {
  const actor = await loadActor(userId);
  requireManager(actor);
  return actor;
}

export async function automationOverview(userId: string) {
  await manager(userId);
  const [runs, settings, buyback] = await Promise.all([
    automationHistory(15),
    getAutopilotSettings(),
    buybackOverview(),
  ]);
  return { runs, settings, buyback, today: today() };
}

export async function saveAutopilotAction(
  userId: string,
  input: {
    autopilotEnabled?: boolean | undefined;
    watchOnly?: boolean | undefined;
    coverageBuffer?: number | undefined;
    autoFillDays?: number | undefined;
    horizonWeeks?: number | undefined;
    seniorityWeight?: number | undefined;
    recencyWeight?: number | undefined;
    pausedReason?: string | null | undefined;
    buybackEnabled?: boolean | undefined;
    buybackShiftsRequired?: number | undefined;
    buybackPointsRemoved?: number | undefined;
    buybackMaxPointsPerYear?: number | undefined;
  },
) {
  const actor = await manager(userId);
  return updateAutopilotSettings(
    input,
    actor.profile?.full_name ?? actor.profile?.email ?? "manager",
  );
}

export async function runAutomationNow(userId: string) {
  const actor = await manager(userId);
  const res = await runAutomationCycle({ source: "manual" });
  return { ...res, by: actor.profile?.full_name ?? "manager" };
}

export async function generateScheduleAction(userId: string, weeks: number, fromDate?: string) {
  const actor = await manager(userId);
  const from = startOfWeek(fromDate ?? today());
  const to = addDays(from, Math.max(1, Math.min(weeks, 12)) * 7 - 1);
  return generateRotationSchedule(from, to, actor.profile?.full_name ?? "manager");
}

export async function updateRotationAction(
  userId: string,
  input: { employeeId: string; weekA: number[]; weekB: number[]; daysPerWeek: number },
) {
  const actor = await manager(userId);
  return setEmployeeRotation({ ...input, actorLabel: actor.profile?.full_name ?? "manager" });
}
