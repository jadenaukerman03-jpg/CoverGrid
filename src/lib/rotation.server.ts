// Two-week rotation schedule generator (weeks run Sunday–Saturday).
import {
  DEFAULT_DAYS_PER_WEEK,
  addDays,
  dateRange,
  dayOfWeek,
  defaultRotation,
  rotationDaysFor,
  rotationLabel,
  shiftHours,
  startOfWeek,
  type PositionType,
  type ShiftType,
} from "./facility";
import { db, logAudit, unitMap, type EmployeeRow } from "./staffing.server";

type RotationEmployee = EmployeeRow & {
  rotation_week_a_days: number[];
  rotation_week_b_days: number[];
  days_per_week: number;
};

export type GenerateResult = {
  from: string;
  to: string;
  created: number;
  skippedExisting: number;
  skippedPto: number;
  skippedMaxHours: number;
  perDate: { date: string; rotation: "A" | "B"; created: number }[];
};

/**
 * Fill the schedule from the employees' two-week rotations. Existing assignments
 * are never overwritten, approved PTO is respected, and weekly hour caps are honoured.
 */
export async function generateRotationSchedule(
  from: string,
  to: string,
  actorLabel: string,
): Promise<GenerateResult> {
  const dates = dateRange(from, to);
  const [{ data: emps }, { data: existing }, { data: pto }, { data: reqs }, { byId }] =
    await Promise.all([
      db.from("employees").select("*").eq("is_active", true),
      db
        .from("shift_assignments")
        .select("id,shift_date,shift,unit_id,position,employee_id,status,hours")
        .gte("shift_date", from)
        .lte("shift_date", to),
      db.from("pto_requests").select("employee_id,start_date,end_date").eq("status", "approved"),
      db.from("staffing_requirements").select("unit_id,position,shift,required_count"),
      unitMap(),
    ]);

  const employees = ((emps ?? []) as RotationEmployee[]).filter((e) => e.primary_unit_id);
  const required = new Map<string, number>();
  for (const r of reqs ?? [])
    required.set(`${r.unit_id}|${r.shift}|${r.position}`, r.required_count);

  const takenByEmployee = new Set<string>();
  const filledSlot = new Map<string, number>();
  const weekHours = new Map<string, number>();
  for (const a of existing ?? []) {
    if (a.employee_id) {
      takenByEmployee.add(`${a.employee_id}|${a.shift_date}`);
      if (a.status !== "cancelled") {
        const wk = `${a.employee_id}|${startOfWeek(a.shift_date as string)}`;
        weekHours.set(wk, (weekHours.get(wk) ?? 0) + Number(a.hours));
      }
    }
    if (["scheduled", "completed"].includes(a.status as string) && a.employee_id) {
      const k = `${a.shift_date}|${a.unit_id}|${a.shift}|${a.position}`;
      filledSlot.set(k, (filledSlot.get(k) ?? 0) + 1);
    }
  }

  type NewAssignment = {
    shift_date: string;
    shift: ShiftType;
    unit_id: string;
    position: PositionType;
    employee_id: string;
    status: "scheduled";
    hours: number;
    created_by_ai: boolean;
    note: string;
  };
  const rows: NewAssignment[] = [];
  const result: GenerateResult = {
    from,
    to,
    created: 0,
    skippedExisting: 0,
    skippedPto: 0,
    skippedMaxHours: 0,
    perDate: [],
  };

  for (const date of dates) {
    const dow = dayOfWeek(date);
    let createdToday = 0;
    for (const e of employees) {
      const days = rotationDaysFor(e, date);
      if (!days.includes(dow)) continue;
      if (takenByEmployee.has(`${e.id}|${date}`)) {
        result.skippedExisting++;
        continue;
      }
      const onPto = (pto ?? []).some(
        (p) => p.employee_id === e.id && p.start_date <= date && p.end_date >= date,
      );
      if (onPto) {
        result.skippedPto++;
        continue;
      }
      const hours = shiftHours(e.position as PositionType);
      const wk = `${e.id}|${startOfWeek(date)}`;
      if ((weekHours.get(wk) ?? 0) + hours > Number(e.max_hours_per_week)) {
        result.skippedMaxHours++;
        continue;
      }

      const shift = e.scheduled_shift as ShiftType;
      const unitId = pickUnit(e, date, shift, filledSlot, required);
      if (!unitId) continue;

      const slotKey = `${date}|${unitId}|${shift}|${e.position}`;
      filledSlot.set(slotKey, (filledSlot.get(slotKey) ?? 0) + 1);
      weekHours.set(wk, (weekHours.get(wk) ?? 0) + hours);
      takenByEmployee.add(`${e.id}|${date}`);
      rows.push({
        shift_date: date,
        shift,
        unit_id: unitId,
        position: e.position as PositionType,
        employee_id: e.id,
        status: "scheduled" as const,
        hours,
        created_by_ai: true,
        note: `Rotation week ${rotationLabel(date)}${unitId === e.primary_unit_id ? "" : ` · floated to ${byId.get(unitId)}`}`,
      });
      createdToday++;
    }
    result.perDate.push({ date, rotation: rotationLabel(date), created: createdToday });
  }

  for (let i = 0; i < rows.length; i += 200) {
    const chunk = rows.slice(i, i + 200);
    const { error } = await db.from("shift_assignments").insert(chunk);
    if (error) throw new Error(error.message);
    result.created += chunk.length;
  }

  await logAudit("generate_rotation_schedule", actorLabel, "schedule", null, {
    from,
    to,
    created: result.created,
  });
  return result;
}

function pickUnit(
  e: RotationEmployee,
  date: string,
  shift: ShiftType,
  filledSlot: Map<string, number>,
  required: Map<string, number>,
): string | null {
  const home = e.primary_unit_id as string;
  const candidates = [home, ...(e.qualified_unit_ids ?? []).filter((u) => u !== home)];
  for (const unitId of candidates) {
    const need = required.get(`${unitId}|${shift}|${e.position}`) ?? 0;
    const filled = filledSlot.get(`${date}|${unitId}|${shift}|${e.position}`) ?? 0;
    if (filled < need) return unitId;
  }
  return null;
}

/** Ensure the schedule is generated out to `weeks` full rotation weeks ahead of today. */
export async function extendScheduleHorizon(fromDate: string, weeks: number, actorLabel: string) {
  const start = startOfWeek(fromDate);
  const end = addDays(start, weeks * 7 - 1);
  const { data: last } = await db
    .from("shift_assignments")
    .select("shift_date")
    .order("shift_date", { ascending: false })
    .limit(1);
  const lastDate = last?.[0]?.shift_date as string | undefined;
  const genFrom = lastDate && lastDate >= start ? addDays(lastDate, 1) : start;
  if (genFrom > end) return { from: genFrom, to: end, created: 0, alreadyCurrent: true as const };
  const res = await generateRotationSchedule(genFrom, end, actorLabel);
  return { ...res, alreadyCurrent: false as const };
}

/** Set (or reset) an employee's two-week rotation. */
export async function setEmployeeRotation(input: {
  employeeId: string;
  weekA?: number[];
  weekB?: number[];
  daysPerWeek?: number;
  weekendGroup?: "A" | "B";
  actorLabel: string;
}) {
  const daysPerWeek = input.daysPerWeek ?? DEFAULT_DAYS_PER_WEEK;
  const fallback = defaultRotation(input.weekendGroup ?? "A", daysPerWeek);
  const weekA = input.weekA ?? fallback.weekA;
  const weekB = input.weekB ?? fallback.weekB;
  const { error } = await db
    .from("employees")
    .update({
      rotation_week_a_days: weekA,
      rotation_week_b_days: weekB,
      days_per_week: daysPerWeek,
      scheduled_days: weekA,
      ...(input.weekendGroup ? { weekend_group: input.weekendGroup } : {}),
    })
    .eq("id", input.employeeId);
  if (error) throw new Error(error.message);
  await logAudit("set_rotation", input.actorLabel, "employee", input.employeeId, {
    weekA,
    weekB,
    daysPerWeek,
  });
  return { weekA, weekB, daysPerWeek };
}
