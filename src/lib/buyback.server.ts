// Attendance point buy-back: staff who pick up extra open shifts earn attendance
// points back off their record. The whole thing can be switched off by a manager.
import { db, logAudit, today } from "./staffing.server";
import { getAutopilotSettings } from "./settings.server";

export const PICKUP_MARKER = "picked this shift up from the open shift board";

export type BuybackConfig = {
  enabled: boolean;
  shiftsRequired: number;
  pointsRemoved: number;
  maxPointsPerYear: number;
};

export async function getBuybackConfig(): Promise<BuybackConfig> {
  const s = await getAutopilotSettings();
  return {
    enabled: s.buybackEnabled,
    shiftsRequired: s.buybackShiftsRequired,
    pointsRemoved: s.buybackPointsRemoved,
    maxPointsPerYear: s.buybackMaxPointsPerYear,
  };
}

/** Total points already bought back for an employee (all time). */
export async function buybackTotal(employeeId: string) {
  const { data } = await db
    .from("point_buybacks")
    .select("points_removed")
    .eq("employee_id", employeeId);
  return Number((data ?? []).reduce((s, r) => s + Number(r.points_removed), 0).toFixed(1));
}

export async function buybackTotals(employeeIds: string[]) {
  const map = new Map<string, number>();
  if (employeeIds.length === 0) return map;
  const { data } = await db
    .from("point_buybacks")
    .select("employee_id,points_removed")
    .in("employee_id", employeeIds);
  for (const r of data ?? []) {
    map.set(
      r.employee_id as string,
      (map.get(r.employee_id as string) ?? 0) + Number(r.points_removed),
    );
  }
  return map;
}

/** Where an employee stands on earning their next point back. */
export async function buybackStatus(employeeId: string) {
  const cfg = await getBuybackConfig();
  const yearStart = `${new Date().getUTCFullYear()}-01-01`;

  const [{ data: picked }, { data: rows }] = await Promise.all([
    db
      .from("shift_assignments")
      .select("id,shift_date,status,fill_reason")
      .eq("employee_id", employeeId)
      .lte("shift_date", today())
      .gte("shift_date", yearStart)
      .ilike("fill_reason", `%${PICKUP_MARKER}%`),
    db
      .from("point_buybacks")
      .select("id,points_removed,shifts_used,reason,created_at")
      .eq("employee_id", employeeId)
      .order("created_at", { ascending: false }),
  ]);

  const qualifying = (picked ?? []).filter(
    (a) => a.status !== "called_off" && a.status !== "cancelled",
  ).length;
  const history = rows ?? [];
  const shiftsUsed = history.reduce((s, r) => s + Number(r.shifts_used), 0);
  const removedThisYear = history
    .filter((r) => String(r.created_at) >= yearStart)
    .reduce((s, r) => s + Number(r.points_removed), 0);

  const unused = Math.max(0, qualifying - shiftsUsed);
  const creditsEarned = cfg.shiftsRequired > 0 ? Math.floor(unused / cfg.shiftsRequired) : 0;
  const remainingCap = Math.max(0, cfg.maxPointsPerYear - removedThisYear);

  return {
    ...cfg,
    pickupsThisYear: qualifying,
    pickupsTowardNext: cfg.shiftsRequired > 0 ? unused % cfg.shiftsRequired : 0,
    shiftsToNext:
      cfg.shiftsRequired > 0 ? Math.max(0, cfg.shiftsRequired - (unused % cfg.shiftsRequired)) : 0,
    creditsEarned,
    pointsRemovedThisYear: Number(removedThisYear.toFixed(1)),
    remainingCap: Number(remainingCap.toFixed(1)),
    totalBoughtBack: Number(history.reduce((s, r) => s + Number(r.points_removed), 0).toFixed(1)),
    history: history.map((r) => ({
      id: r.id as string,
      points: Number(r.points_removed),
      shiftsUsed: Number(r.shifts_used),
      reason: (r.reason as string) ?? "",
      createdAt: r.created_at as string,
    })),
  };
}

/**
 * Apply any earned buy-back for an employee. Safe to call after every pickup —
 * it does nothing when the system is off, no credit is earned, the yearly cap is
 * reached, or the person has no points left to remove.
 */
export async function applyEarnedBuyback(employeeId: string, actorLabel = "the system") {
  const status = await buybackStatus(employeeId);
  if (!status.enabled) return { applied: false, reason: "Point buy-back is turned off." as const };
  if (status.creditsEarned < 1)
    return { applied: false, reason: "Not enough picked-up shifts yet." as const };
  if (status.remainingCap <= 0)
    return { applied: false, reason: "Yearly buy-back limit reached." as const };

  const { data: events } = await db
    .from("attendance_events")
    .select("points")
    .eq("employee_id", employeeId);
  const earned = (events ?? []).reduce((s, e) => s + Number(e.points), 0);
  const currentTotal = Number((earned - status.totalBoughtBack).toFixed(1));
  if (currentTotal <= 0)
    return { applied: false, reason: "No attendance points on record to remove." as const };

  const wanted = status.creditsEarned * status.pointsRemoved;
  const points = Number(Math.min(wanted, status.remainingCap, currentTotal).toFixed(1));
  if (points <= 0) return { applied: false, reason: "Nothing to remove." as const };

  const creditsUsed = Math.max(1, Math.ceil(points / Math.max(status.pointsRemoved, 0.1)));
  const shiftsUsed = creditsUsed * status.shiftsRequired;
  const reason = `Picked up ${shiftsUsed} extra shift${shiftsUsed === 1 ? "" : "s"} — ${points} attendance point${points === 1 ? "" : "s"} removed.`;

  const { error } = await db
    .from("point_buybacks")
    .insert({ employee_id: employeeId, points_removed: points, shifts_used: shiftsUsed, reason });
  if (error) throw new Error(error.message);

  await db.from("notifications").insert({
    employee_id: employeeId,
    audience: "employee",
    title: "Attendance points removed",
    body: `${reason} Your new attendance total is ${Number((currentTotal - points).toFixed(1))}.`,
  });
  await logAudit("attendance_buyback", actorLabel, "employee", employeeId, { points, shiftsUsed });

  return {
    applied: true as const,
    points,
    shiftsUsed,
    newTotal: Number((currentTotal - points).toFixed(1)),
  };
}

/** Facility-wide view for managers. */
export async function buybackOverview() {
  const cfg = await getBuybackConfig();
  const { data } = await db
    .from("point_buybacks")
    .select("id,employee_id,points_removed,shifts_used,reason,created_at")
    .order("created_at", { ascending: false })
    .limit(50);
  const rows = data ?? [];
  const ids = Array.from(new Set(rows.map((r) => r.employee_id as string)));
  const names = new Map<string, string>();
  if (ids.length) {
    const { data: emps } = await db.from("employees").select("id,full_name").in("id", ids);
    (emps ?? []).forEach((e) => names.set(e.id as string, e.full_name as string));
  }
  return {
    config: cfg,
    totalPointsRemoved: Number(rows.reduce((s, r) => s + Number(r.points_removed), 0).toFixed(1)),
    recent: rows.map((r) => ({
      id: r.id as string,
      employee: names.get(r.employee_id as string) ?? "Employee",
      points: Number(r.points_removed),
      shiftsUsed: Number(r.shifts_used),
      reason: (r.reason as string) ?? "",
      createdAt: r.created_at as string,
    })),
  };
}
