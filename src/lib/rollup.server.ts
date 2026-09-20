// Corporate rollup: one week, every building, side by side.
// Regional directors need to see which building is short, which is leaning on
// agency, and which is running over its hours — without opening each one.
import { addDays, dateRange, startOfWeek, OVERTIME_THRESHOLD_HOURS } from "./facility";
import { db, getCoverage, today } from "./staffing.server";

export type FacilityRollup = {
  id: string;
  name: string;
  address: string;
  units: string[];
  headcount: number;
  floatPool: number;
  required: number;
  filled: number;
  openSlots: number;
  coveragePct: number;
  openPosted: number;
  claimedOpen: number;
  agencyShifts: number;
  agencyPct: number;
  callOffs: number;
  scheduledHours: number;
  overtimeHours: number;
  laborCost: number;
  weeklyLaborBudget: number;
  budgetPct: number;
  ppd: number;
  targetPpd: number;
  avgCensus: number;
  utilizationPct: number;
  worstDay: { date: string; openSlots: number } | null;
};

export async function corporateRollup(weekStartInput?: string) {
  const weekStart = startOfWeek(weekStartInput || today());
  const weekEnd = addDays(weekStart, 6);
  const days = dateRange(weekStart, weekEnd);

  const [
    { data: facilities },
    { data: units },
    { data: emps },
    { data: asg },
    { data: census },
    coverage,
  ] = await Promise.all([
    db.from("facilities").select("*").order("sort_order"),
    db.from("units").select("id,name,facility_id,target_hppd").order("sort_order"),
    db
      .from("employees")
      .select("id,primary_unit_id,home_facility_id,float_pool_optin,hourly_rate,is_active")
      .eq("is_active", true),
    db
      .from("shift_assignments")
      .select("id,shift_date,unit_id,position,status,employee_id,agency_staff_id,hours,is_training")
      .gte("shift_date", weekStart)
      .lte("shift_date", weekEnd),
    db
      .from("census_days")
      .select("date,unit_id,census")
      .gte("date", weekStart)
      .lte("date", weekEnd),
    getCoverage(weekStart, weekEnd),
  ]);

  const unitRows = units ?? [];
  const unitFacility = new Map(
    unitRows.map((u) => [u.id as string, (u.facility_id as string | null) ?? null]),
  );
  const rate = new Map((emps ?? []).map((e) => [e.id as string, Number(e.hourly_rate ?? 0)]));
  const facilityRows = facilities ?? [];
  const facilityOf = (unitId: string | null) =>
    unitId ? (unitFacility.get(unitId) ?? null) : null;

  const blank = () => ({
    required: 0,
    filled: 0,
    openSlots: 0,
    openPosted: 0,
    claimedOpen: 0,
    agencyShifts: 0,
    workedShifts: 0,
    callOffs: 0,
    scheduledHours: 0,
    laborCost: 0,
    censusTotal: 0,
    censusDays: 0,
    byDay: new Map<string, number>(),
    empHours: new Map<string, number>(),
    targetSum: 0,
    targetCount: 0,
  });
  const acc = new Map<string, ReturnType<typeof blank>>();
  const bucket = (fid: string | null) => {
    const key = fid ?? "unassigned";
    if (!acc.has(key)) acc.set(key, blank());
    return acc.get(key)!;
  };

  for (const u of unitRows) {
    const b = bucket((u.facility_id as string | null) ?? null);
    b.targetSum += Number(u.target_hppd ?? 0);
    b.targetCount += 1;
  }

  for (const r of coverage) {
    const b = bucket(facilityOf(r.unitId));
    b.required += r.required;
    b.filled += Math.min(r.filled, r.required);
    b.openSlots += r.gap;
    b.byDay.set(r.date, (b.byDay.get(r.date) ?? 0) + r.gap);
  }

  for (const a of asg ?? []) {
    const b = bucket(facilityOf((a.unit_id as string | null) ?? null));
    const status = a.status as string;
    const hours = Number(a.hours ?? 0);
    if (status === "open") {
      b.openPosted += 1;
      if (a.employee_id) b.claimedOpen += 1;
    }
    if (status === "called_off") b.callOffs += 1;
    if (!["scheduled", "completed"].includes(status)) continue;
    if (a.agency_staff_id) {
      b.agencyShifts += 1;
      b.workedShifts += 1;
      b.scheduledHours += hours;
      b.laborCost += hours * 55; // blended agency bill rate
      continue;
    }
    if (!a.employee_id) continue;
    b.workedShifts += 1;
    b.scheduledHours += hours;
    b.laborCost += hours * (rate.get(a.employee_id as string) ?? 0);
    b.empHours.set(a.employee_id as string, (b.empHours.get(a.employee_id as string) ?? 0) + hours);
  }

  for (const c of census ?? []) {
    const b = bucket(facilityOf((c.unit_id as string | null) ?? null));
    b.censusTotal += Number(c.census ?? 0);
    b.censusDays += 1;
  }

  const round = (n: number, d = 1) => Number(n.toFixed(d));

  const rows: FacilityRollup[] = facilityRows.map((f) => {
    const id = f.id as string;
    const b = acc.get(id) ?? blank();
    const facUnits = unitRows.filter((u) => u.facility_id === id);
    const unitIds = new Set(facUnits.map((u) => u.id as string));
    const staff = (emps ?? []).filter(
      (e) =>
        (e.home_facility_id as string | null) === id ||
        unitIds.has((e.primary_unit_id as string) ?? ""),
    );
    const overtimeHours = [...b.empHours.values()].reduce(
      (s, h) => s + Math.max(0, h - OVERTIME_THRESHOLD_HOURS),
      0,
    );
    // Census rows are per unit per day, so the weekly total divided by the days
    // in the week is the building's average daily census.
    const avgCensus = b.censusTotal / days.length;
    const ppd = avgCensus > 0 ? b.scheduledHours / (avgCensus * days.length) : 0;
    const budget = Number(f.weekly_labor_budget ?? 0);
    const worst = [...b.byDay.entries()].sort((x, y) => y[1] - x[1])[0];

    return {
      id,
      name: f.name as string,
      address: (f.address as string) ?? "",
      units: facUnits.map((u) => u.name as string),
      headcount: staff.length,
      floatPool: staff.filter((e) => e.float_pool_optin).length,
      required: b.required,
      filled: b.filled,
      openSlots: b.openSlots,
      coveragePct: b.required === 0 ? 100 : Math.round((b.filled / b.required) * 100),
      openPosted: b.openPosted,
      claimedOpen: b.claimedOpen,
      agencyShifts: b.agencyShifts,
      agencyPct: b.workedShifts === 0 ? 0 : Math.round((b.agencyShifts / b.workedShifts) * 100),
      callOffs: b.callOffs,
      scheduledHours: round(b.scheduledHours),
      overtimeHours: round(overtimeHours),
      laborCost: Math.round(b.laborCost),
      weeklyLaborBudget: budget,
      budgetPct: budget > 0 ? Math.round((b.laborCost / budget) * 100) : 0,
      ppd: round(ppd, 2),
      targetPpd: b.targetCount ? round(b.targetSum / b.targetCount, 2) : 0,
      avgCensus: round(avgCensus),
      utilizationPct:
        staff.length === 0 ? 0 : Math.round((b.scheduledHours / (staff.length * 40)) * 100),
      worstDay: worst ? { date: worst[0], openSlots: worst[1] } : null,
    };
  });

  const sum = (pick: (r: FacilityRollup) => number) => rows.reduce((s, r) => s + pick(r), 0);
  const totals = {
    buildings: rows.length,
    headcount: sum((r) => r.headcount),
    required: sum((r) => r.required),
    filled: sum((r) => r.filled),
    openSlots: sum((r) => r.openSlots),
    openPosted: sum((r) => r.openPosted),
    agencyShifts: sum((r) => r.agencyShifts),
    callOffs: sum((r) => r.callOffs),
    overtimeHours: round(sum((r) => r.overtimeHours)),
    scheduledHours: round(sum((r) => r.scheduledHours)),
    laborCost: Math.round(sum((r) => r.laborCost)),
    weeklyLaborBudget: Math.round(sum((r) => r.weeklyLaborBudget)),
    coveragePct:
      sum((r) => r.required) === 0
        ? 100
        : Math.round((sum((r) => r.filled) / sum((r) => r.required)) * 100),
  };

  // Plain-language flags a regional director can act on today.
  const attention: { facility: string; issue: string }[] = [];
  for (const r of rows) {
    if (r.openSlots > 0)
      attention.push({
        facility: r.name,
        issue: `${r.openSlots} open slot${r.openSlots === 1 ? "" : "s"} this week.`,
      });
    if (r.agencyPct >= 15)
      attention.push({
        facility: r.name,
        issue: `Agency is covering ${r.agencyPct}% of worked shifts.`,
      });
    if (r.budgetPct > 100)
      attention.push({ facility: r.name, issue: `Labor is ${r.budgetPct}% of the weekly budget.` });
    if (r.targetPpd > 0 && r.ppd > r.targetPpd)
      attention.push({ facility: r.name, issue: `PPD ${r.ppd} is above the ${r.targetPpd} goal.` });
    if (r.overtimeHours >= 24)
      attention.push({ facility: r.name, issue: `${r.overtimeHours} overtime hours scheduled.` });
  }

  return { weekStart, weekEnd, rows, totals, attention };
}
