// Employee profiles, schedule notes, unit floating and the float rotation tracker.
import {
  ATTENDANCE_LEVELS,
  POSITION_LABEL,
  SHIFT_LABEL,
  addDays,
  attendanceStatus,
  type PositionType,
  type ShiftType,
} from "./facility";
import {
  attendanceTotal,
  db,
  logAudit,
  scheduleFor,
  today,
  unitMap,
  weeklyHoursMap,
} from "./staffing.server";
import { startOfWeek } from "./facility";

export async function employeeProfile(employeeId: string, opts: { includePrivate: boolean }) {
  const { data: emp } = await db.from("employees").select("*").eq("id", employeeId).maybeSingle();
  if (!emp) throw new Error("Employee not found.");
  const { byId } = await unitMap();
  const from = addDays(today(), -14);
  const to = addDays(today(), 28);
  const [shifts, hours, points, notesRes] = await Promise.all([
    scheduleFor({ from, to, employeeId }),
    weeklyHoursMap(startOfWeek(today())),
    opts.includePrivate
      ? attendanceTotal(employeeId)
      : Promise.resolve({ total: 0, events: [] as unknown[] }),
    db
      .from("employee_notes")
      .select("*")
      .eq("employee_id", employeeId)
      .order("pinned", { ascending: false })
      .order("created_at", { ascending: false }),
  ]);
  const upcoming = shifts.filter((s) => s.date >= today());
  const past = shifts.filter((s) => s.date < today()).reverse();
  return {
    id: emp.id as string,
    name: emp.full_name as string,
    email: opts.includePrivate ? (emp.email as string | null) : null,
    phone: opts.includePrivate ? (emp.phone as string | null) : null,
    position: emp.position as PositionType,
    positionLabel: POSITION_LABEL[emp.position as PositionType],
    homeUnit: byId.get((emp.primary_unit_id as string) ?? "") ?? "—",
    homeUnitId: emp.primary_unit_id as string | null,
    shift: emp.scheduled_shift as ShiftType,
    shiftLabel: SHIFT_LABEL[emp.scheduled_shift as ShiftType],
    qualifiedUnits: ((emp.qualified_unit_ids as string[]) ?? [])
      .map((id) => byId.get(id))
      .filter(Boolean) as string[],
    weekendGroup: emp.weekend_group as string | null,
    hireDate: emp.hire_date as string,
    employmentType: emp.employment_type as string,
    daysPerWeek: emp.days_per_week as number,
    weeklyHours: Number((hours.get(employeeId) ?? 0).toFixed(1)),
    floatCount: (emp.float_count as number) ?? 0,
    lastFloatedOn: (emp.last_floated_on as string | null) ?? null,
    rewardPoints: (emp.reward_points as number) ?? 0,
    attendance: opts.includePrivate
      ? { ...attendanceStatus(points.total), levels: ATTENDANCE_LEVELS }
      : null,
    upcoming,
    recent: past.slice(0, 10),
    notes: (notesRes.data ?? []).map((n) => ({
      id: n.id as string,
      body: n.body as string,
      category: n.category as string,
      author: n.author_name as string,
      pinned: n.pinned as boolean,
      createdAt: n.created_at as string,
    })),
  };
}

export async function addEmployeeNote(input: {
  employeeId: string;
  authorId: string | null;
  authorName: string;
  body: string;
  category?: string;
  pinned?: boolean;
}) {
  const { data, error } = await db
    .from("employee_notes")
    .insert({
      employee_id: input.employeeId,
      author_id: input.authorId,
      author_name: input.authorName,
      body: input.body,
      category: input.category ?? "general",
      pinned: input.pinned ?? false,
    })
    .select("id")
    .maybeSingle();
  if (error) throw new Error(error.message);
  await logAudit("employee_note_added", input.authorName, "employee", input.employeeId, {
    noteId: data?.id,
  });
  return { id: data?.id };
}

export async function deleteEmployeeNote(noteId: string, actorLabel: string) {
  const { error } = await db.from("employee_notes").delete().eq("id", noteId);
  if (error) throw new Error(error.message);
  await logAudit("employee_note_deleted", actorLabel, "employee_note", noteId, {});
  return { ok: true };
}

export async function setAssignmentNote(assignmentId: string, note: string, actorLabel: string) {
  const { error } = await db
    .from("shift_assignments")
    .update({ note: note.trim() ? note.trim() : null })
    .eq("id", assignmentId);
  if (error) throw new Error(error.message);
  await logAudit("shift_note_set", actorLabel, "shift_assignment", assignmentId, { note });
  return { ok: true };
}

export type FloatReason =
  "coverage" | "call_off" | "census" | "rotation" | "request" | "return_home" | "manual";

export const FLOAT_REASON_LABEL: Record<FloatReason, string> = {
  coverage: "Coverage gap on the receiving unit",
  call_off: "Backfilling a call-off",
  census: "Resident census / acuity balance",
  rotation: "Their turn in the float rotation",
  request: "Employee asked to move",
  return_home: "Returned to their home unit",
  manual: "Manager decision",
};

/** Years of service, used to protect senior staff from floating. */
export function seniorityYears(hireDate: string | null | undefined, on = today()): number {
  if (!hireDate) return 0;
  const ms = new Date(`${on}T12:00:00`).getTime() - new Date(`${hireDate}T12:00:00`).getTime();
  return Math.max(0, ms / (365.25 * 86400000));
}

function daysSince(date: string | null | undefined, on = today()): number | null {
  if (!date) return null;
  return Math.round(
    (new Date(`${on}T12:00:00`).getTime() - new Date(`${date}T12:00:00`).getTime()) / 86400000,
  );
}

/**
 * Float priority score. Lower = should float sooner.
 * Floats already taken and seniority both push a person down the list;
 * a long time since the last float pulls them back up.
 */
export function floatScore(input: {
  floatCount: number;
  lastFloatedOn: string | null;
  hireDate: string | null;
  seniorityWeight?: number;
  recencyWeight?: number;
}) {
  const sw = input.seniorityWeight ?? 1;
  const rw = input.recencyWeight ?? 1;
  const years = seniorityYears(input.hireDate);
  const since = daysSince(input.lastFloatedOn);
  const months = since === null ? 12 : Math.min(since, 365) / 30;
  const score = input.floatCount * 3 + years * 1.5 * sw - months * rw;
  return {
    score: Number(score.toFixed(2)),
    years: Number(years.toFixed(1)),
    daysSinceLastFloat: since,
  };
}

export function floatRationale(p: {
  name: string;
  floatCount: number;
  years: number;
  daysSinceLastFloat: number | null;
  rank?: number;
  groupSize?: number;
}) {
  const last =
    p.daysSinceLastFloat === null
      ? "has never floated"
      : `last floated ${p.daysSinceLastFloat} day${p.daysSinceLastFloat === 1 ? "" : "s"} ago`;
  const place =
    p.rank != null && p.groupSize ? ` — #${p.rank} of ${p.groupSize} in their rotation group` : "";
  return `${p.name} ${last}, has floated ${p.floatCount} time${p.floatCount === 1 ? "" : "s"} and has ${p.years} year${p.years === 1 ? "" : "s"} of service${place}.`;
}

/** Move an assignment to another unit — the drag-and-drop float action. */
export async function floatAssignment(
  assignmentId: string,
  toUnitId: string,
  actorLabel: string,
  opts?: { reason?: FloatReason; note?: string; automatic?: boolean },
) {
  const { data: a } = await db
    .from("shift_assignments")
    .select("id,unit_id,home_unit_id,employee_id,shift,shift_date,position,is_float")
    .eq("id", assignmentId)
    .maybeSingle();
  if (!a) throw new Error("Shift not found.");
  if (a.unit_id === toUnitId && !a.is_float)
    return {
      ok: true,
      unchanged: true as const,
      to: "",
      isFloat: false,
      returnedHome: false,
      rationale: "",
    };
  const { byId } = await unitMap();

  let homeUnitId = (a.home_unit_id as string | null) ?? null;
  let employeeHome: string | null = null;
  type EmpRow = {
    full_name?: string;
    float_count?: number;
    hire_date?: string;
    primary_unit_id?: string | null;
  };
  let empRow: EmpRow | null = null;
  if (a.employee_id) {
    const { data: emp } = await db
      .from("employees")
      .select("primary_unit_id,qualified_unit_ids,full_name,float_count,hire_date")
      .eq("id", a.employee_id)
      .maybeSingle();
    empRow = (emp ?? null) as EmpRow | null;
    employeeHome = (emp?.primary_unit_id as string | null) ?? null;
    homeUnitId = homeUnitId ?? employeeHome;
    const qualified = (emp?.qualified_unit_ids as string[] | null) ?? [];
    if (qualified.length && !qualified.includes(toUnitId) && employeeHome !== toUnitId) {
      // Not a hard block — floating happens — but it is recorded for managers.
      await db.from("staffing_alerts").insert({
        severity: "warning",
        shift_date: a.shift_date,
        shift: a.shift,
        unit_id: toUnitId,
        position: a.position,
        message: `${emp?.full_name ?? "An employee"} floated to ${byId.get(toUnitId)} without a recorded qualification for that unit.`,
        status: "open",
      });
    }
  }

  const returningHome = homeUnitId != null && toUnitId === homeUnitId;
  const reason: FloatReason = returningHome ? "return_home" : (opts?.reason ?? "manual");
  const scored = floatScore({
    floatCount: (empRow?.float_count as number) ?? 0,
    lastFloatedOn: null,
    hireDate: (empRow?.hire_date as string) ?? null,
  });
  const rationale = returningHome
    ? `Returned to their home unit ${byId.get(homeUnitId ?? "") ?? ""}.`
    : [
        `${FLOAT_REASON_LABEL[reason]}: ${byId.get(toUnitId) ?? "the receiving unit"} needed a ${POSITION_LABEL[a.position as PositionType]} on ${a.shift_date} (${SHIFT_LABEL[a.shift as ShiftType].toLowerCase()}).`,
        empRow
          ? floatRationale({
              name: empRow.full_name ?? "This employee",
              floatCount: (empRow.float_count as number) ?? 0,
              years: scored.years,
              daysSinceLastFloat: scored.daysSinceLastFloat,
            })
          : "",
        opts?.note ?? "",
      ]
        .filter(Boolean)
        .join(" ");

  const { error } = await db
    .from("shift_assignments")
    .update({
      unit_id: toUnitId,
      home_unit_id: homeUnitId,
      is_float: !returningHome && homeUnitId != null,
      float_reason: returningHome ? null : rationale,
    })
    .eq("id", assignmentId);
  if (error) throw new Error(error.message);

  if (a.employee_id) {
    await db.from("float_events").insert({
      assignment_id: assignmentId,
      employee_id: a.employee_id,
      from_unit_id: a.unit_id,
      to_unit_id: toUnitId,
      shift_date: a.shift_date,
      shift: a.shift,
      position: a.position,
      reason,
      rationale,
      decided_by: actorLabel,
      automatic: opts?.automatic ?? false,
      float_count_before: (empRow?.float_count as number) ?? 0,
      returned_home: returningHome,
    });
  }

  if (a.employee_id && !returningHome) {
    await db
      .from("employees")
      .update({
        float_count: ((empRow?.float_count as number) ?? 0) + 1,
        last_floated_on: a.shift_date,
      })
      .eq("id", a.employee_id);
    await db.from("notifications").insert({
      employee_id: a.employee_id,
      audience: "employee",
      title: "You are floating units",
      body: `On ${a.shift_date} (${SHIFT_LABEL[a.shift as ShiftType].toLowerCase()}) you are assigned to ${byId.get(toUnitId)} instead of ${byId.get(homeUnitId ?? "") ?? "your usual unit"}. Why: ${rationale}`,
    });
  }
  await logAudit("shift_floated", actorLabel, "shift_assignment", assignmentId, {
    from: byId.get(a.unit_id as string),
    to: byId.get(toUnitId),
    reason,
    rationale,
  });
  return {
    ok: true,
    unchanged: false as const,
    to: byId.get(toUnitId) ?? "",
    isFloat: !returningHome && homeUnitId != null,
    returnedHome: returningHome,
    rationale,
  };
}

/** Recent float history with the reason each move was made. */
export async function floatHistory(limit = 25, employeeId?: string) {
  const { byId } = await unitMap();
  let q = db
    .from("float_events")
    .select(
      "id,employee_id,from_unit_id,to_unit_id,shift_date,shift,position,reason,rationale,decided_by,automatic,returned_home,created_at",
    )
    .order("created_at", { ascending: false })
    .limit(limit);
  if (employeeId) q = q.eq("employee_id", employeeId);
  const { data } = await q;
  const ids = Array.from(new Set((data ?? []).map((r) => r.employee_id)));
  const names = new Map<string, string>();
  if (ids.length) {
    const { data: emps } = await db.from("employees").select("id,full_name").in("id", ids);
    (emps ?? []).forEach((e) => names.set(e.id as string, e.full_name as string));
  }
  return (data ?? []).map((r) => ({
    id: r.id as string,
    employeeId: r.employee_id as string,
    name: names.get(r.employee_id as string) ?? "Employee",
    from: byId.get((r.from_unit_id as string) ?? "") ?? "—",
    to: byId.get((r.to_unit_id as string) ?? "") ?? "—",
    date: r.shift_date as string,
    shiftLabel: r.shift ? SHIFT_LABEL[r.shift as ShiftType] : "",
    positionLabel: r.position ? POSITION_LABEL[r.position as PositionType] : "",
    reason: r.reason as FloatReason,
    reasonLabel: FLOAT_REASON_LABEL[(r.reason as FloatReason) ?? "manual"] ?? "Float",
    rationale: r.rationale as string,
    decidedBy: r.decided_by as string,
    automatic: r.automatic as boolean,
    returnedHome: r.returned_home as boolean,
    createdAt: r.created_at as string,
  }));
}

/** Whose turn it is to float next — fewest floats, longest since last float, least seniority. */
export async function floatTracker(params?: {
  unitId?: string | null | undefined;
  shift?: ShiftType | null | undefined;
  position?: PositionType | null | undefined;
  seniorityWeight?: number;
  recencyWeight?: number;
}) {
  const { units, byId } = await unitMap();
  let q = db
    .from("employees")
    .select(
      "id,full_name,position,scheduled_shift,primary_unit_id,float_count,last_floated_on,hire_date",
    )
    .eq("is_active", true);
  if (params?.unitId) q = q.eq("primary_unit_id", params.unitId);
  if (params?.shift) q = q.eq("scheduled_shift", params.shift);
  if (params?.position) q = q.eq("position", params.position);
  const { data } = await q;
  const rows = (data ?? [])
    .map((e) => {
      const scored = floatScore({
        floatCount: (e.float_count as number) ?? 0,
        lastFloatedOn: (e.last_floated_on as string | null) ?? null,
        hireDate: (e.hire_date as string | null) ?? null,
        ...(params?.seniorityWeight === undefined
          ? {}
          : { seniorityWeight: params.seniorityWeight }),
        ...(params?.recencyWeight === undefined ? {} : { recencyWeight: params.recencyWeight }),
      });
      return {
        id: e.id as string,
        name: e.full_name as string,
        position: e.position as PositionType,
        positionLabel: POSITION_LABEL[e.position as PositionType],
        shift: e.scheduled_shift as ShiftType,
        shiftLabel: SHIFT_LABEL[e.scheduled_shift as ShiftType],
        homeUnit: byId.get((e.primary_unit_id as string) ?? "") ?? "—",
        homeUnitId: e.primary_unit_id as string | null,
        floatCount: (e.float_count as number) ?? 0,
        lastFloatedOn: (e.last_floated_on as string | null) ?? null,
        hireDate: (e.hire_date as string | null) ?? null,
        seniorityYears: scored.years,
        daysSinceLastFloat: scored.daysSinceLastFloat,
        score: scored.score,
        why: "",
      };
    })
    .sort(
      (a, b) => a.score - b.score || a.floatCount - b.floatCount || a.name.localeCompare(b.name),
    );

  // Next up per unit + shift + position group.
  const groups = new Map<string, typeof rows>();
  for (const r of rows) {
    const key = `${r.homeUnitId ?? "none"}|${r.shift}|${r.position}`;
    groups.set(key, [...(groups.get(key) ?? []), r]);
  }
  for (const g of groups.values()) {
    g.forEach((r, i) => {
      r.why = floatRationale({
        name: r.name,
        floatCount: r.floatCount,
        years: r.seniorityYears,
        daysSinceLastFloat: r.daysSinceLastFloat,
        rank: i + 1,
        groupSize: g.length,
      });
    });
  }
  const nextUp = Array.from(groups.values())
    .map((g) => g[0]!)
    .sort(
      (a, b) =>
        a.homeUnit.localeCompare(b.homeUnit) ||
        a.shift.localeCompare(b.shift) ||
        a.positionLabel.localeCompare(b.positionLabel),
    );

  return { units, rows, nextUp };
}
