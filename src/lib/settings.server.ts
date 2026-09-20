// Settings for the always-on background scheduling system.
import { db, logAudit } from "./staffing.server";

export type AutopilotSettings = {
  id: string;
  autopilotEnabled: boolean;
  watchOnly: boolean;
  coverageBuffer: number;
  autoFillDays: number;
  horizonWeeks: number;
  seniorityWeight: number;
  recencyWeight: number;
  ppdGoal: number;
  buybackEnabled: boolean;
  buybackShiftsRequired: number;
  buybackPointsRemoved: number;
  buybackMaxPointsPerYear: number;
  notifyOnboarding: boolean;
  notifyScheduleUpdates: boolean;
  notifyDeliveryFailures: boolean;
  undoWindowMinutes: number;
  pausedReason: string | null;
  lastRunAt: string | null;
  updatedBy: string | null;
  updatedAt: string | null;
};

const DEFAULTS: Omit<AutopilotSettings, "id"> = {
  autopilotEnabled: true,
  watchOnly: false,
  coverageBuffer: 1,
  autoFillDays: 7,
  horizonWeeks: 6,
  seniorityWeight: 1,
  recencyWeight: 1,
  ppdGoal: 3.6,
  buybackEnabled: false,
  buybackShiftsRequired: 3,
  buybackPointsRemoved: 1,
  buybackMaxPointsPerYear: 3,
  notifyOnboarding: true,
  notifyScheduleUpdates: true,
  notifyDeliveryFailures: true,
  undoWindowMinutes: 10,
  pausedReason: null,
  lastRunAt: null,
  updatedBy: null,
  updatedAt: null,
};

export async function getAutopilotSettings(): Promise<AutopilotSettings> {
  const { data } = await db.from("automation_settings").select("*").limit(1).maybeSingle();
  if (!data) {
    const { data: created } = await db
      .from("automation_settings")
      .insert({ singleton: true })
      .select("*")
      .maybeSingle();
    return { ...DEFAULTS, id: (created?.id as string) ?? "" };
  }
  return {
    id: data.id as string,
    autopilotEnabled: data.autopilot_enabled as boolean,
    watchOnly: Boolean(data.watch_only ?? false),
    coverageBuffer: Number(data.coverage_buffer ?? 1),
    autoFillDays: Number(data.auto_fill_days ?? 7),
    horizonWeeks: Number(data.horizon_weeks ?? 6),
    seniorityWeight: Number(data.seniority_weight ?? 1),
    recencyWeight: Number(data.recency_weight ?? 1),
    ppdGoal: Number((data as { ppd_goal?: number }).ppd_goal ?? 3.6),
    buybackEnabled: Boolean((data as { buyback_enabled?: boolean }).buyback_enabled ?? false),
    buybackShiftsRequired: Number(
      (data as { buyback_shifts_required?: number }).buyback_shifts_required ?? 3,
    ),
    buybackPointsRemoved: Number(
      (data as { buyback_points_removed?: number }).buyback_points_removed ?? 1,
    ),
    buybackMaxPointsPerYear: Number(
      (data as { buyback_max_points_per_year?: number }).buyback_max_points_per_year ?? 3,
    ),
    notifyOnboarding: Boolean((data as { notify_onboarding?: boolean }).notify_onboarding ?? true),
    notifyScheduleUpdates: Boolean(
      (data as { notify_schedule_updates?: boolean }).notify_schedule_updates ?? true,
    ),
    notifyDeliveryFailures: Boolean(
      (data as { notify_delivery_failures?: boolean }).notify_delivery_failures ?? true,
    ),
    undoWindowMinutes: Number((data as { undo_window_minutes?: number }).undo_window_minutes ?? 10),
    pausedReason: (data.paused_reason as string | null) ?? null,
    lastRunAt: (data.last_run_at as string | null) ?? null,
    updatedBy: (data.updated_by as string | null) ?? null,
    updatedAt: (data.updated_at as string | null) ?? null,
  };
}

export async function updateAutopilotSettings(
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
    notifyOnboarding?: boolean | undefined;
    notifyScheduleUpdates?: boolean | undefined;
    notifyDeliveryFailures?: boolean | undefined;
    undoWindowMinutes?: number | undefined;
  },
  actorLabel: string,
) {
  const current = await getAutopilotSettings();
  const patch: Partial<{
    autopilot_enabled: boolean;
    watch_only: boolean;
    coverage_buffer: number;
    auto_fill_days: number;
    horizon_weeks: number;
    seniority_weight: number;
    recency_weight: number;
    paused_reason: string | null;
    updated_by: string | null;
    buyback_enabled: boolean;
    buyback_shifts_required: number;
    buyback_points_removed: number;
    buyback_max_points_per_year: number;
    notify_onboarding: boolean;
    notify_schedule_updates: boolean;
    notify_delivery_failures: boolean;
    undo_window_minutes: number;
  }> = { updated_by: actorLabel };
  if (input.autopilotEnabled !== undefined) patch["autopilot_enabled"] = input.autopilotEnabled;
  if (input.watchOnly !== undefined) patch["watch_only"] = input.watchOnly;
  if (input.coverageBuffer !== undefined)
    patch["coverage_buffer"] = Math.max(0, Math.min(5, input.coverageBuffer));
  if (input.autoFillDays !== undefined)
    patch["auto_fill_days"] = Math.max(1, Math.min(30, input.autoFillDays));
  if (input.horizonWeeks !== undefined)
    patch["horizon_weeks"] = Math.max(1, Math.min(16, input.horizonWeeks));
  if (input.seniorityWeight !== undefined)
    patch["seniority_weight"] = Math.max(0, Math.min(3, input.seniorityWeight));
  if (input.recencyWeight !== undefined)
    patch["recency_weight"] = Math.max(0, Math.min(3, input.recencyWeight));
  if (input.pausedReason !== undefined) patch["paused_reason"] = input.pausedReason;
  if (input.buybackEnabled !== undefined) patch["buyback_enabled"] = input.buybackEnabled;
  if (input.buybackShiftsRequired !== undefined)
    patch["buyback_shifts_required"] = Math.max(
      1,
      Math.min(20, Math.round(input.buybackShiftsRequired)),
    );
  if (input.buybackPointsRemoved !== undefined)
    patch["buyback_points_removed"] = Math.max(0.5, Math.min(5, input.buybackPointsRemoved));
  if (input.buybackMaxPointsPerYear !== undefined)
    patch["buyback_max_points_per_year"] = Math.max(0, Math.min(20, input.buybackMaxPointsPerYear));

  if (input.notifyOnboarding !== undefined) patch["notify_onboarding"] = input.notifyOnboarding;
  if (input.notifyScheduleUpdates !== undefined)
    patch["notify_schedule_updates"] = input.notifyScheduleUpdates;
  if (input.notifyDeliveryFailures !== undefined)
    patch["notify_delivery_failures"] = input.notifyDeliveryFailures;
  if (input.undoWindowMinutes !== undefined)
    patch["undo_window_minutes"] = Math.max(1, Math.min(60, Math.round(input.undoWindowMinutes)));

  const { error } = await db.from("automation_settings").update(patch).eq("id", current.id);
  if (error) throw new Error(error.message);
  await logAudit("autopilot_settings_updated", actorLabel, "automation_settings", current.id, {
    ...patch,
  });
  return getAutopilotSettings();
}

export async function markAutopilotRun() {
  const current = await getAutopilotSettings();
  await db
    .from("automation_settings")
    .update({ last_run_at: new Date().toISOString() })
    .eq("id", current.id);
}

/** Facility PPD goal (care hours per resident day). Administrators only. */
export async function updatePpdGoal(goal: number, actorLabel: string) {
  const current = await getAutopilotSettings();
  const value = Math.max(1, Math.min(12, Number(goal.toFixed(2))));
  const { error } = await db
    .from("automation_settings")
    .update({ ppd_goal: value })
    .eq("id", current.id);
  if (error) throw new Error(error.message);
  await logAudit("ppd_goal_updated", actorLabel, "automation_settings", current.id, {
    ppdGoal: value,
  });
  return { ppdGoal: value };
}
