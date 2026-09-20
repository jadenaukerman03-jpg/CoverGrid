// Low-census recommendations: who to send home when a unit is running over the PPD goal.
// The system never sends anyone home by itself — a human always makes the call.
import {
  OVERTIME_THRESHOLD_HOURS,
  POSITION_LABEL,
  SHIFT_LABEL,
  addDays,
  dateRange,
  shiftHours,
  startOfWeek,
  type PositionType,
  type ShiftType,
} from "./facility";
import { getAutopilotSettings } from "./settings.server";
import { db, today, unitMap, weeklyHoursMap } from "./staffing.server";

export type LowCensusPick = {
  assignmentId: string;
  name: string;
  employeeId: string | null;
  isAgency: boolean;
  position: PositionType;
  shift: ShiftType;
  hours: number;
  weeklyHours: number;
  overtimeHours: number;
  hourlyRate: number;
  savings: number;
  score: number;
  reasons: string[];
  remainingAfter: string;
};

export type LowCensusUnitDay = {
  date: string;
  unitId: string;
  unitName: string;
  census: number;
  goalPpd: number;
  scheduledHours: number;
  actualPpd: number;
  targetHours: number;
  excessHours: number;
  recommendedHours: number;
  estimatedSavings: number;
  picks: LowCensusPick[];
  note: string;
};

const HALF_SHIFT = 4;

/**
 * Ranks who should be offered low census on every unit/day that is over the PPD goal.
 * Priority: agency first, then whoever is deepest into overtime, then over their own
 * weekly max, then least senior — never below required staffing for the shift.
 */
export async function lowCensusRecommendations(from?: string, to?: string) {
  const start = from ?? today();
  const end = to ?? addDays(start, 6);
  const settings = await getAutopilotSettings();
  const goalPpd = Number(settings.ppdGoal ?? 3.6);
  const { units, byId } = await unitMap();

  const [{ data: census }, { data: asg }, { data: reqs }, { data: emps }, { data: agency }] =
    await Promise.all([
      db.from("census_days").select("date,unit_id,census").gte("date", start).lte("date", end),
      db
        .from("shift_assignments")
        .select(
          "id,shift_date,shift,unit_id,position,hours,status,employee_id,agency_staff_id,is_training,is_float",
        )
        .gte("shift_date", start)
        .lte("shift_date", end)
        .eq("status", "scheduled"),
      db.from("staffing_requirements").select("unit_id,position,shift,required_count"),
      db
        .from("employees")
        .select("id,full_name,hire_date,hourly_rate,max_hours_per_week,employment_type"),
      db.from("agency_staff").select("id,full_name"),
    ]);

  const censusOf = new Map((census ?? []).map((c) => [`${c.date}|${c.unit_id}`, Number(c.census)]));
  const requiredOf = new Map(
    (reqs ?? []).map((r) => [`${r.unit_id}|${r.shift}|${r.position}`, Number(r.required_count)]),
  );
  const empById = new Map((emps ?? []).map((e) => [e.id, e]));
  const agencyById = new Map((agency ?? []).map((a) => [a.id, a.full_name]));

  // Weekly hours per employee for every week touched by the range.
  const weeks = new Set<string>();
  for (const date of dateRange(start, end)) weeks.add(startOfWeek(date));
  const weekHours = new Map<string, Map<string, number>>();
  for (const wk of weeks) weekHours.set(wk, await weeklyHoursMap(wk));

  const results: LowCensusUnitDay[] = [];

  for (const date of dateRange(start, end)) {
    for (const unit of units) {
      const rows = (asg ?? []).filter((a) => a.shift_date === date && a.unit_id === unit.id);
      if (rows.length === 0) continue;
      const unitCensus = censusOf.get(`${date}|${unit.id}`) ?? 0;
      const scheduledHours = rows.reduce((s, a) => s + Number(a.hours), 0);
      if (unitCensus <= 0) continue;
      const targetHours = unitCensus * goalPpd;
      const excessHours = scheduledHours - targetHours;
      const actualPpd = Number((scheduledHours / unitCensus).toFixed(2));
      if (excessHours < HALF_SHIFT) continue;

      // Live count per shift+position so we never cut below the required floor.
      const counts = new Map<string, number>();
      for (const a of rows) {
        const key = `${a.shift}|${a.position}`;
        counts.set(key, (counts.get(key) ?? 0) + 1);
      }

      const wk = startOfWeek(date);
      const hoursMap = weekHours.get(wk) ?? new Map<string, number>();

      const candidates: LowCensusPick[] = [];
      for (const a of rows) {
        if (a.is_training) continue; // orientees stay with their preceptor
        const position = a.position as PositionType;
        const shift = a.shift as ShiftType;
        const hours = Number(a.hours) || shiftHours(position);
        const emp = a.employee_id ? empById.get(a.employee_id) : null;
        const isAgency = Boolean(a.agency_staff_id);
        const name = isAgency
          ? `${agencyById.get(a.agency_staff_id as string) ?? "Agency staff"} (agency)`
          : (emp?.full_name ?? "Open shift");
        if (!emp && !isAgency) continue;

        const weekly = emp ? (hoursMap.get(emp.id) ?? 0) : hours;
        const overtimeHours = Math.max(0, Math.min(hours, weekly - OVERTIME_THRESHOLD_HOURS));
        const baseRate = isAgency ? 55 : Number(emp?.hourly_rate ?? 22);
        const savings = (hours - overtimeHours) * baseRate + overtimeHours * baseRate * 1.5;

        const reasons: string[] = [];
        let score = 0;
        if (isAgency) {
          score += 1000;
          reasons.push("Agency shift — costs the most, cut this before staff");
        }
        if (overtimeHours > 0) {
          score += 100 + overtimeHours * 25;
          reasons.push(
            `${overtimeHours.toFixed(1)} of these hours are overtime (${weekly.toFixed(1)} h this week)`,
          );
        }
        if (emp && weekly > Number(emp.max_hours_per_week ?? 40)) {
          score += 40;
          reasons.push(
            `Already over their ${Number(emp.max_hours_per_week).toFixed(0)} h weekly max`,
          );
        }
        if (a.is_float) {
          score += 20;
          reasons.push("Floated here from another unit today");
        }
        if (emp) {
          // Weekly hours drive most of the ordering, so the person deepest into the week goes first.
          score += weekly;
          const years =
            (Date.now() - new Date(emp.hire_date).getTime()) / (365.25 * 24 * 3600 * 1000);
          score += Math.max(0, 6 - years); // least senior first as the tiebreaker
          reasons.push(
            `${weekly.toFixed(1)} h scheduled this week · ${years.toFixed(1)} yrs of service`,
          );
        }
        candidates.push({
          assignmentId: a.id,
          name,
          employeeId: a.employee_id,
          isAgency,
          position,
          shift,
          hours,
          weeklyHours: Number(weekly.toFixed(1)),
          overtimeHours: Number(overtimeHours.toFixed(1)),
          hourlyRate: Number(baseRate.toFixed(2)),
          savings: Number(savings.toFixed(0)),
          score: Number(score.toFixed(1)),
          reasons,
          remainingAfter: "",
        });
      }

      candidates.sort((a, b) => b.score - a.score);

      const picks: LowCensusPick[] = [];
      let removed = 0;
      for (const c of candidates) {
        if (removed >= excessHours) break;
        const key = `${c.shift}|${c.position}`;
        const required = requiredOf.get(`${unit.id}|${c.shift}|${c.position}`) ?? 0;
        const have = counts.get(key) ?? 0;
        if (have - 1 < required) continue; // would leave the shift short
        counts.set(key, have - 1);
        removed += c.hours;
        picks.push({
          ...c,
          remainingAfter: `${have - 1} of ${required} required ${POSITION_LABEL[c.position]}s left on ${SHIFT_LABEL[c.shift].toLowerCase()}`,
        });
      }

      results.push({
        date,
        unitId: unit.id,
        unitName: byId.get(unit.id) ?? unit.name,
        census: unitCensus,
        goalPpd,
        scheduledHours: Number(scheduledHours.toFixed(1)),
        actualPpd,
        targetHours: Number(targetHours.toFixed(1)),
        excessHours: Number(excessHours.toFixed(1)),
        recommendedHours: Number(removed.toFixed(1)),
        estimatedSavings: Math.round(picks.reduce((s, p) => s + p.savings, 0)),
        picks,
        note:
          picks.length === 0
            ? "Over the goal, but every extra person is holding a required spot — no one can be sent home without going short."
            : removed < excessHours
              ? "Sending these people home gets you closer to the goal; the rest of the extra hours are locked in by required staffing."
              : "Sending these people home brings this unit back to the PPD goal.",
      });
    }
  }

  results.sort((a, b) => a.date.localeCompare(b.date) || b.excessHours - a.excessHours);

  return {
    from: start,
    to: end,
    goalPpd,
    totals: {
      daysOver: results.length,
      excessHours: Number(results.reduce((s, r) => s + r.excessHours, 0).toFixed(1)),
      recommendedHours: Number(results.reduce((s, r) => s + r.recommendedHours, 0).toFixed(1)),
      estimatedSavings: results.reduce((s, r) => s + r.estimatedSavings, 0),
    },
    days: results,
  };
}

/** Plain-language digest used by the assistant and the handoff report. */
export function lowCensusDigest(report: Awaited<ReturnType<typeof lowCensusRecommendations>>) {
  if (report.days.length === 0)
    return "No unit is over the PPD goal in this window — nobody needs to be low censused.";
  return report.days
    .map((d) => {
      const who = d.picks.length
        ? d.picks
            .map(
              (p) =>
                `${p.name} (${POSITION_LABEL[p.position]}, ${SHIFT_LABEL[p.shift].toLowerCase()})`,
            )
            .join("; ")
        : "no one can be cut without going short";
      return `${d.date} · ${d.unitName}: PPD ${d.actualPpd} vs goal ${d.goalPpd} (${d.excessHours} extra hours). Suggest: ${who}.`;
    })
    .join("\n");
}
