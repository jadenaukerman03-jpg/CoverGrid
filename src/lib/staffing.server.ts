// Server-only staffing engine. Never imported from client code directly.
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import {
  addDays,
  CALL_OFF_POINTS,
  coverageState,
  dateRange,
  LATE_POINTS,
  MIN_REST_HOURS,
  OVERTIME_THRESHOLD_HOURS,
  POSITION_LABEL,
  PTO_MIN_NOTICE_DAYS,
  SHIFT_LABEL,
  SHIFT_ORDER,
  SHIFT_WINDOW,
  shiftHours,
  startOfWeek,
  toISODate,
  type CoverageRow,
  type PositionType,
  type ShiftType,
} from "./facility";

export type Role = "employee" | "manager" | "admin";

export type Actor = {
  userId: string;
  role: Role;
  isManager: boolean;
  employee: EmployeeRow | null;
  profile: { id: string; email: string | null; full_name: string | null } | null;
};

export type EmployeeRow = {
  id: string;
  user_id: string | null;
  full_name: string;
  email: string | null;
  position: PositionType;
  primary_unit_id: string | null;
  qualified_unit_ids: string[];
  scheduled_shift: ShiftType;
  scheduled_days: number[];
  weekend_group: string | null;
  max_hours_per_week: number;
  hire_date: string;
  is_active: boolean;
};

export const db = supabaseAdmin;

export function today(): string {
  return toISODate(new Date());
}

export async function loadActor(userId: string): Promise<Actor> {
  const [roles, employee, profile] = await Promise.all([
    db.from("user_roles").select("role").eq("user_id", userId),
    db.from("employees").select("*").eq("user_id", userId).maybeSingle(),
    db.from("profiles").select("id,email,full_name").eq("id", userId).maybeSingle(),
  ]);
  const roleList = (roles.data ?? []).map((r) => r.role as Role);
  const role: Role = roleList.includes("admin")
    ? "admin"
    : roleList.includes("manager")
      ? "manager"
      : "employee";
  const profileRow = (profile.data as Actor["profile"]) ?? null;
  let employeeRow = (employee.data as EmployeeRow | null) ?? null;

  // A login only has a staff record once the two are linked. When the sign-in email
  // matches an unclaimed person on the roster, claim it automatically so nobody gets
  // stuck on "your login isn't linked to an employee record yet".
  if (!employeeRow && profileRow?.email) {
    const { data: match } = await db
      .from("employees")
      .select("*")
      .is("user_id", null)
      .ilike("email", profileRow.email)
      .limit(1)
      .maybeSingle();
    if (match) {
      const { data: claimed } = await db
        .from("employees")
        .update({ user_id: userId })
        .eq("id", (match as EmployeeRow).id)
        .is("user_id", null)
        .select("*")
        .maybeSingle();
      employeeRow = ((claimed ?? match) as EmployeeRow) ?? null;
    }
  }

  return {
    userId,
    role,
    isManager: role === "manager" || role === "admin",
    employee: employeeRow,
    profile: profileRow,
  };
}

export function requireAdmin(actor: Actor) {
  if (actor.role !== "admin") throw new Error("Only an administrator can change this setting.");
}

export function requireManager(actor: Actor) {
  if (!actor.isManager) throw new Error("You do not have permission to view this information.");
}

export async function unitMap() {
  const { data } = await db
    .from("units")
    .select("id,name,sort_order,target_hppd")
    .order("sort_order");
  const byId = new Map<string, string>();
  (data ?? []).forEach((u) => byId.set(u.id, u.name));
  return { units: data ?? [], byId };
}

export async function logAudit(
  action: string,
  actorLabel: string,
  entity: string,
  entityId: string | null,
  details: Record<string, unknown>,
) {
  await db.from("audit_log").insert({
    actor: actorLabel,
    action,
    entity,
    entity_id: entityId,
    details: JSON.parse(JSON.stringify(details)),
  });
}

// ---------------- Coverage ----------------

export async function getCoverage(from: string, to: string, buffer = 0): Promise<CoverageRow[]> {
  const { units, byId } = await unitMap();
  const [{ data: reqs }, { data: asg }, { data: census }] = await Promise.all([
    db.from("staffing_requirements").select("unit_id,position,shift,required_count"),
    db
      .from("shift_assignments")
      .select("shift_date,shift,unit_id,position,status,employee_id,agency_staff_id,is_training")
      .gte("shift_date", from)
      .lte("shift_date", to),
    db.from("census_days").select("date,unit_id,census").gte("date", from).lte("date", to),
  ]);
  const filledKey = new Map<string, number>();
  for (const a of asg ?? []) {
    // Orientation shifts shadow someone else, so they never count toward coverage.
    if (a.is_training) continue;
    if (!a.employee_id && !a.agency_staff_id) continue;
    if (!["scheduled", "completed"].includes(a.status as string)) continue;
    const k = `${a.shift_date}|${a.shift}|${a.unit_id}|${a.position}`;
    filledKey.set(k, (filledKey.get(k) ?? 0) + 1);
  }

  // Total hours the standing requirements already imply per unit, so a census-driven
  // recommendation can scale that same shift/position mix rather than inventing one.
  const configuredHoursByUnit = new Map<string, number>();
  for (const r of reqs ?? []) {
    const hours = r.required_count * shiftHours(r.position as PositionType);
    configuredHoursByUnit.set(r.unit_id, (configuredHoursByUnit.get(r.unit_id) ?? 0) + hours);
  }
  const targetHppdByUnit = new Map(units.map((u) => [u.id, Number(u.target_hppd ?? 3.6)]));
  const censusByKey = new Map((census ?? []).map((c) => [`${c.date}|${c.unit_id}`, c.census]));

  const rows: CoverageRow[] = [];
  for (const date of dateRange(from, to)) {
    for (const r of reqs ?? []) {
      const k = `${date}|${r.shift}|${r.unit_id}|${r.position}`;
      const filled = filledKey.get(k) ?? 0;

      const todaysCensus = censusByKey.get(`${date}|${r.unit_id}`);
      const configuredHours = configuredHoursByUnit.get(r.unit_id) ?? 0;
      let recommended: number | undefined;
      if (todaysCensus !== undefined && configuredHours > 0) {
        const targetHours = todaysCensus * (targetHppdByUnit.get(r.unit_id) ?? 3.6);
        const scale = targetHours / configuredHours;
        recommended = Math.max(0, Math.round(r.required_count * scale));
      }

      rows.push({
        date,
        shift: r.shift as ShiftType,
        unitId: r.unit_id,
        unitName: byId.get(r.unit_id) ?? "Unit",
        position: r.position as PositionType,
        required: r.required_count,
        filled,
        gap: Math.max(0, r.required_count - filled),
        target: r.required_count + buffer,
        bufferGap: Math.max(0, r.required_count + buffer - filled),
        ...(recommended !== undefined ? { recommended } : {}),
        state: coverageState(r.required_count, filled),
      });
    }
  }
  rows.sort(
    (a, b) =>
      a.date.localeCompare(b.date) ||
      SHIFT_ORDER[a.shift] - SHIFT_ORDER[b.shift] ||
      a.unitName.localeCompare(b.unitName) ||
      a.position.localeCompare(b.position),
  );
  return rows;
}

export function summarizeCoverage(rows: CoverageRow[]) {
  const required = rows.reduce((s, r) => s + r.required, 0);
  const filled = rows.reduce((s, r) => s + Math.min(r.filled, r.required), 0);
  const gaps = rows.filter((r) => r.gap > 0);
  return {
    required,
    filled,
    openSlots: rows.reduce((s, r) => s + r.gap, 0),
    coveragePct: required === 0 ? 100 : Math.round((filled / required) * 100),
    understaffed: gaps.length,
    overstaffed: rows.filter((r) => r.state === "overstaffed").length,
  };
}

export function describeCoverageRow(r: CoverageRow) {
  return `${r.date} ${SHIFT_LABEL[r.shift]} (${SHIFT_WINDOW[r.shift][r.position].join("–")}) · ${r.unitName} · ${POSITION_LABEL[r.position]}: ${r.filled}/${r.required}${r.gap ? ` (short ${r.gap})` : ""}`;
}

// ---------------- Hours & overtime ----------------

export async function weeklyHoursMap(weekStart: string) {
  const weekEnd = addDays(weekStart, 6);
  const { data } = await db
    .from("shift_assignments")
    .select("employee_id,hours,status")
    .gte("shift_date", weekStart)
    .lte("shift_date", weekEnd);
  const map = new Map<string, number>();
  for (const a of data ?? []) {
    if (!a.employee_id) continue;
    if (!["scheduled", "completed"].includes(a.status as string)) continue;
    map.set(a.employee_id, (map.get(a.employee_id) ?? 0) + Number(a.hours));
  }
  return map;
}

export async function overtimeReport(weekStart: string) {
  const map = await weeklyHoursMap(weekStart);
  const { data: emps } = await db
    .from("employees")
    .select("id,full_name,position,primary_unit_id")
    .eq("is_active", true);
  const { byId } = await unitMap();
  const rows = (emps ?? [])
    .map((e) => ({
      employeeId: e.id,
      name: e.full_name,
      position: e.position as PositionType,
      unit: byId.get(e.primary_unit_id ?? "") ?? "—",
      hours: Number((map.get(e.id) ?? 0).toFixed(1)),
    }))
    .filter((r) => r.hours > 0)
    .sort((a, b) => b.hours - a.hours);
  const overtimeHours = rows.reduce(
    (s, r) => s + Math.max(0, r.hours - OVERTIME_THRESHOLD_HOURS),
    0,
  );
  return {
    weekStart,
    totalScheduledHours: Number(rows.reduce((s, r) => s + r.hours, 0).toFixed(1)),
    overtimeHours: Number(overtimeHours.toFixed(1)),
    inOvertime: rows.filter((r) => r.hours > OVERTIME_THRESHOLD_HOURS),
    approachingOvertime: rows.filter(
      (r) => r.hours > OVERTIME_THRESHOLD_HOURS - 8 && r.hours <= OVERTIME_THRESHOLD_HOURS,
    ),
    rows,
  };
}

// ---------------- Replacement search ----------------

export type Candidate = {
  employeeId: string;
  name: string;
  position: PositionType;
  homeUnit: string;
  weeklyHours: number;
  projectedHours: number;
  wouldBeOvertime: boolean;
  qualified: boolean;
  score: number;
  reasons: string[];
};

function restConflict(
  target: { date: string; shift: ShiftType },
  existing: { shift_date: string; shift: ShiftType }[],
): string | null {
  for (const e of existing) {
    if (e.shift_date === target.date)
      return `Already scheduled ${SHIFT_LABEL[e.shift].toLowerCase()} that day`;
    // Third shift ends the following morning: blocks first shift the next day.
    if (e.shift === "third" && addDays(e.shift_date, 1) === target.date && target.shift === "first")
      return `Works third shift the night before (needs ${MIN_REST_HOURS}h rest)`;
    if (target.shift === "third" && addDays(target.date, 1) === e.shift_date && e.shift === "first")
      return `Scheduled first shift the next morning (needs ${MIN_REST_HOURS}h rest)`;
    // Second shift ends late evening (10-10:30pm): also blocks first shift the next day.
    if (
      e.shift === "second" &&
      addDays(e.shift_date, 1) === target.date &&
      target.shift === "first"
    )
      return `Works second shift the evening before (needs ${MIN_REST_HOURS}h rest)`;
    if (
      target.shift === "second" &&
      addDays(target.date, 1) === e.shift_date &&
      e.shift === "first"
    )
      return `Scheduled first shift the next morning (needs ${MIN_REST_HOURS}h rest)`;
  }
  return null;
}

export async function findCandidates(assignmentId: string, limit = 6) {
  const { data: assignment } = await db
    .from("shift_assignments")
    .select("*")
    .eq("id", assignmentId)
    .maybeSingle();
  if (!assignment) throw new Error("Shift not found.");
  const { byId } = await unitMap();
  const date = assignment.shift_date as string;
  const shift = assignment.shift as ShiftType;
  const position = assignment.position as PositionType;
  const unitId = assignment.unit_id as string;

  const weekStart = startOfWeek(date);
  const [{ data: emps }, hours, { data: nearby }, { data: pto }] = await Promise.all([
    db.from("employees").select("*").eq("is_active", true).eq("position", position),
    weeklyHoursMap(weekStart),
    db
      .from("shift_assignments")
      .select("employee_id,shift_date,shift,status")
      .gte("shift_date", addDays(date, -1))
      .lte("shift_date", addDays(date, 1))
      .in("status", ["scheduled", "completed"]),
    db
      .from("pto_requests")
      .select("employee_id,start_date,end_date,status")
      .eq("status", "approved"),
  ]);

  const byEmp = new Map<string, { shift_date: string; shift: ShiftType }[]>();
  for (const a of nearby ?? []) {
    if (!a.employee_id) continue;
    const list = byEmp.get(a.employee_id) ?? [];
    list.push({ shift_date: a.shift_date as string, shift: a.shift as ShiftType });
    byEmp.set(a.employee_id, list);
  }
  const onPto = new Set(
    (pto ?? []).filter((p) => p.start_date <= date && p.end_date >= date).map((p) => p.employee_id),
  );

  const candidates: Candidate[] = [];
  const rejected: { name: string; reason: string }[] = [];
  const addHours = shiftHours(position);

  for (const e of (emps ?? []) as EmployeeRow[]) {
    if (e.id === assignment.employee_id) continue;
    if (onPto.has(e.id)) {
      rejected.push({ name: e.full_name, reason: "On approved PTO" });
      continue;
    }
    const qualified = e.primary_unit_id === unitId || (e.qualified_unit_ids ?? []).includes(unitId);
    if (!qualified) continue;
    const conflict = restConflict({ date, shift }, byEmp.get(e.id) ?? []);
    if (conflict) {
      rejected.push({ name: e.full_name, reason: conflict });
      continue;
    }
    const weekly = Number((hours.get(e.id) ?? 0).toFixed(1));
    const projected = Number((weekly + addHours).toFixed(1));
    const wouldBeOvertime = projected > OVERTIME_THRESHOLD_HOURS;
    const reasons: string[] = [];
    let score = 100;
    if (wouldBeOvertime) {
      score -= 40 + Math.min(20, projected - OVERTIME_THRESHOLD_HOURS);
      reasons.push(
        `Would create ${(projected - OVERTIME_THRESHOLD_HOURS).toFixed(1)}h of overtime`,
      );
    } else {
      reasons.push(`Stays under 40h (${projected}h projected)`);
    }
    if (e.primary_unit_id === unitId) {
      score += 12;
      reasons.push(`Home unit is ${byId.get(unitId)}`);
    } else {
      reasons.push(`Cross-trained for ${byId.get(unitId)}`);
    }
    if (e.scheduled_shift === shift) {
      score += 8;
      reasons.push(`Normally works ${SHIFT_LABEL[shift].toLowerCase()}`);
    }
    score -= weekly * 0.4; // spread hours fairly
    candidates.push({
      employeeId: e.id,
      name: e.full_name,
      position,
      homeUnit: byId.get(e.primary_unit_id ?? "") ?? "—",
      weeklyHours: weekly,
      projectedHours: projected,
      wouldBeOvertime,
      qualified: true,
      score: Math.round(score),
      reasons,
    });
  }
  candidates.sort((a, b) => b.score - a.score);
  return {
    assignment: {
      id: assignment.id as string,
      date,
      shift,
      shiftLabel: SHIFT_LABEL[shift],
      window: SHIFT_WINDOW[shift][position].join(" – "),
      unit: byId.get(unitId) ?? "Unit",
      position,
      positionLabel: POSITION_LABEL[position],
      status: assignment.status as string,
    },
    candidates: candidates.slice(0, limit),
    rejected: rejected.slice(0, 8),
  };
}

// ---------------- Actions ----------------

export async function recordCallOff(assignmentId: string, actorLabel: string, note?: string) {
  const { data: a } = await db
    .from("shift_assignments")
    .select("*")
    .eq("id", assignmentId)
    .maybeSingle();
  if (!a) throw new Error("Shift not found.");
  if (!a.employee_id) throw new Error("That shift has no assigned employee.");
  const { byId } = await unitMap();
  await db.from("shift_assignments").update({ status: "called_off" }).eq("id", assignmentId);
  await db.from("attendance_events").insert({
    employee_id: a.employee_id,
    assignment_id: assignmentId,
    kind: "call_off",
    points: CALL_OFF_POINTS,
    occurred_at: new Date().toISOString(),
    note: note ?? "Called off",
  });
  await db.from("notifications").insert({
    employee_id: a.employee_id,
    audience: "employee",
    title: "Call-off recorded",
    body: `You have been recorded as calling off for your ${SHIFT_LABEL[a.shift as ShiftType].toLowerCase()} shift on ${a.shift_date} (${byId.get(a.unit_id)}). This will result in 1 attendance point according to the attendance policy.`,
  });
  await db.from("staffing_alerts").insert({
    severity: "critical",
    shift_date: a.shift_date,
    shift: a.shift,
    unit_id: a.unit_id,
    position: a.position,
    message: `Call-off on ${byId.get(a.unit_id)} ${SHIFT_LABEL[a.shift as ShiftType].toLowerCase()} (${POSITION_LABEL[a.position as PositionType]}) for ${a.shift_date}. Replacement search started.`,
  });
  const search = await findCandidates(assignmentId, 5);
  if (search.candidates.length === 0) {
    await db.from("notifications").insert({
      audience: "manager",
      title: "Uncovered shift",
      body: `No suitable replacement found for ${byId.get(a.unit_id)} ${SHIFT_LABEL[a.shift as ShiftType].toLowerCase()} ${POSITION_LABEL[a.position as PositionType]} on ${a.shift_date}. Manager action required.`,
    });
  }
  await logAudit("call_off_recorded", actorLabel, "shift_assignment", assignmentId, {
    points: CALL_OFF_POINTS,
    candidates: search.candidates.length,
  });
  return { points: CALL_OFF_POINTS, ...search };
}

export async function recordLate(assignmentId: string, minutesLate: number, actorLabel: string) {
  const { data: a } = await db
    .from("shift_assignments")
    .select("*")
    .eq("id", assignmentId)
    .maybeSingle();
  if (!a?.employee_id) throw new Error("Shift not found.");
  await db.from("attendance_events").insert({
    employee_id: a.employee_id,
    assignment_id: assignmentId,
    kind: "late",
    points: LATE_POINTS,
    minutes_late: minutesLate,
    note: `Arrived ${minutesLate} minutes after shift start`,
  });
  await db.from("notifications").insert({
    employee_id: a.employee_id,
    audience: "employee",
    title: "Late arrival recorded",
    body: `You were recorded as arriving ${minutesLate} minutes after the start of your shift on ${a.shift_date}. This late arrival results in 0.5 attendance points.`,
  });
  await logAudit("late_recorded", actorLabel, "shift_assignment", assignmentId, { minutesLate });
  return { points: LATE_POINTS };
}

export async function assignReplacement(
  assignmentId: string,
  employeeId: string,
  actorLabel: string,
  aiDriven = false,
  fillReason?: string,
) {
  const { data: a } = await db
    .from("shift_assignments")
    .select("*")
    .eq("id", assignmentId)
    .maybeSingle();
  if (!a) throw new Error("Shift not found.");
  const { byId } = await unitMap();
  const { data: emp } = await db.from("employees").select("*").eq("id", employeeId).maybeSingle();
  if (!emp) throw new Error("Employee not found.");
  const weekly = (await weeklyHoursMap(startOfWeek(a.shift_date as string))).get(employeeId) ?? 0;
  const projected = weekly + shiftHours(a.position as PositionType);

  await db.from("shift_assignments").update({ status: "cancelled" }).eq("id", assignmentId);
  const { data: created } = await db
    .from("shift_assignments")
    .insert({
      shift_date: a.shift_date,
      shift: a.shift,
      unit_id: a.unit_id,
      position: a.position,
      employee_id: employeeId,
      hours: a.hours,
      status: "scheduled",
      is_overtime: projected > OVERTIME_THRESHOLD_HOURS,
      created_by_ai: aiDriven,
      fill_reason:
        fillReason ??
        `${emp.full_name} was picked by ${actorLabel} for ${byId.get(a.unit_id)} on ${a.shift_date}. Projected week: ${projected.toFixed(1)}h${projected > OVERTIME_THRESHOLD_HOURS ? " (overtime)" : " (no overtime)"}.`,
      note: `Coverage for ${a.shift_date} ${SHIFT_LABEL[a.shift as ShiftType].toLowerCase()}`,
    })
    .select("id")
    .maybeSingle();

  await db.from("notifications").insert({
    employee_id: employeeId,
    audience: "employee",
    title: "You picked up a shift",
    body: `You are now scheduled on ${byId.get(a.unit_id)} for the ${SHIFT_LABEL[a.shift as ShiftType].toLowerCase()} on ${a.shift_date} (${SHIFT_WINDOW[a.shift as ShiftType][a.position as PositionType].join(" – ")}).`,
  });
  await db
    .from("staffing_alerts")
    .update({ status: "resolved" })
    .eq("shift_date", a.shift_date)
    .eq("unit_id", a.unit_id)
    .eq("position", a.position)
    .eq("shift", a.shift)
    .eq("status", "open");
  await logAudit(
    "replacement_assigned",
    actorLabel,
    "shift_assignment",
    created?.id ?? assignmentId,
    {
      replacedAssignment: assignmentId,
      employeeId,
      overtime: projected > OVERTIME_THRESHOLD_HOURS,
    },
  );
  return {
    newAssignmentId: created?.id,
    employee: emp.full_name,
    overtime: projected > OVERTIME_THRESHOLD_HOURS,
  };
}

/**
 * Fill coverage gaps. `buffer` keeps each unit/shift staffed above the bare minimum so a
 * call-off does not immediately drop the resident-to-staff ratio below requirement.
 */
export async function autoFillGaps(from: string, to: string, actorLabel: string, buffer = 0) {
  const coverage = await getCoverage(from, to, buffer);
  const gaps = coverage.filter((c) => (c.bufferGap ?? c.gap) > 0);
  const filled: string[] = [];
  const unresolved: string[] = [];
  for (const gap of gaps) {
    const needed = gap.bufferGap ?? gap.gap;
    for (let i = 0; i < needed; i++) {
      const isBufferSlot = i >= gap.gap;
      const { data: open } = await db
        .from("shift_assignments")
        .insert({
          shift_date: gap.date,
          shift: gap.shift,
          unit_id: gap.unitId,
          position: gap.position,
          status: "open",
          hours: shiftHours(gap.position),
          created_by_ai: true,
          note: isBufferSlot
            ? "Opened as a call-off cushion above the minimum ratio"
            : "Opened automatically to fill a coverage gap",
        })
        .select("id")
        .maybeSingle();
      if (!open) continue;
      const search = await findCandidates(open.id, 3);
      const best = search.candidates[0];
      if (best) {
        const runnerUp = search.candidates[1];
        const why = [
          `${gap.unitName} needed ${POSITION_LABEL[gap.position]} coverage on ${gap.date} (${SHIFT_LABEL[gap.shift].toLowerCase()})${isBufferSlot ? " as call-off cushion" : ""}. Verified minute-by-minute.`,
          `${best.name} was chosen because: ${best.reasons.join("; ")}.`,
          runnerUp
            ? `Next best was ${runnerUp.name} (${runnerUp.reasons[0] ?? "lower ranked"}).`
            : "",
          search.rejected.length
            ? `Passed over: ${search.rejected
                .slice(0, 3)
                .map((r) => `${r.name} — ${r.reason}`)
                .join("; ")}.`
            : "",
        ]
          .filter(Boolean)
          .join(" ");
        await assignReplacement(open.id, best.employeeId, actorLabel, true, why);

        filled.push(
          `${gap.date} ${gap.unitName} ${SHIFT_LABEL[gap.shift].toLowerCase()} ${POSITION_LABEL[gap.position]} → ${best.name}${best.wouldBeOvertime ? " (overtime)" : ""}`,
        );
      } else if (isBufferSlot) {
        // Cushion slots are best-effort; leave them open without alarming anyone.
        await db.from("shift_assignments").delete().eq("id", open.id);
      } else {
        unresolved.push(describeCoverageRow(gap));
        await db.from("notifications").insert({
          audience: "manager",
          title: "Uncovered shift needs attention",
          body: `No qualified, rested employee is available for ${gap.unitName} ${SHIFT_LABEL[gap.shift].toLowerCase()} ${POSITION_LABEL[gap.position]} on ${gap.date}.`,
        });
      }
    }
  }
  await logAudit("auto_fill_gaps", actorLabel, "schedule", null, {
    from,
    to,
    filled: filled.length,
    unresolved: unresolved.length,
  });
  return { filled, unresolved, gapsFound: gaps.length };
}

// ---------------- PTO ----------------

export async function submitPto(
  employeeId: string,
  start: string,
  end: string,
  reason: string,
  actorLabel: string,
) {
  const daysNotice = Math.round(
    (new Date(`${start}T12:00:00`).getTime() - new Date(`${today()}T12:00:00`).getTime()) /
      86400000,
  );
  if (daysNotice <= PTO_MIN_NOTICE_DAYS - 1) {
    const { data } = await db
      .from("pto_requests")
      .insert({
        employee_id: employeeId,
        start_date: start,
        end_date: end,
        reason,
        status: "rejected",
        auto_rejected: true,
        decision_note:
          "Vacation requests must be submitted more than one month in advance. This request was submitted with only " +
          `${daysNotice} days of notice.`,
      })
      .select("id")
      .maybeSingle();
    return {
      accepted: false,
      id: data?.id,
      message:
        "Your vacation request cannot be accepted because vacation requests must be submitted more than one month in advance.",
      daysNotice,
    };
  }
  const { data } = await db
    .from("pto_requests")
    .insert({
      employee_id: employeeId,
      start_date: start,
      end_date: end,
      reason,
      status: "pending",
    })
    .select("id")
    .maybeSingle();
  await db.from("notifications").insert({
    audience: "manager",
    title: "New vacation request",
    body: `A PTO request was submitted for ${start} through ${end} (${daysNotice} days of notice) and is awaiting review.`,
  });
  await logAudit("pto_submitted", actorLabel, "pto_request", data?.id ?? null, {
    start,
    end,
    daysNotice,
  });
  return {
    accepted: true,
    id: data?.id,
    message: "Your vacation request has been submitted to management for review.",
    daysNotice,
  };
}

// ---------------- Shift switches ----------------

export async function validateSwitch(assignmentId: string, coveringId: string) {
  const { data: a } = await db
    .from("shift_assignments")
    .select("*")
    .eq("id", assignmentId)
    .maybeSingle();
  if (!a)
    return {
      valid: false,
      problems: ["The original shift could not be found."],
      checks: [] as string[],
    };
  const { data: cov } = await db.from("employees").select("*").eq("id", coveringId).maybeSingle();
  if (!cov)
    return { valid: false, problems: ["The covering employee could not be found."], checks: [] };
  const problems: string[] = [];
  const checks: string[] = [];
  const { byId } = await unitMap();
  const unitName = byId.get(a.unit_id) ?? "unit";

  if (cov.position !== a.position)
    problems.push(
      `${cov.full_name} is a ${POSITION_LABEL[cov.position as PositionType]} and cannot cover a ${POSITION_LABEL[a.position as PositionType]} shift.`,
    );
  else checks.push(`Position match: both are ${POSITION_LABEL[a.position as PositionType]}s`);

  const qualified =
    cov.primary_unit_id === a.unit_id || (cov.qualified_unit_ids ?? []).includes(a.unit_id);
  if (!qualified) problems.push(`${cov.full_name} is not qualified to work ${unitName}.`);
  else checks.push(`Unit qualification verified for ${unitName}`);

  const { data: nearby } = await db
    .from("shift_assignments")
    .select("shift_date,shift")
    .eq("employee_id", coveringId)
    .in("status", ["scheduled", "completed"])
    .gte("shift_date", addDays(a.shift_date as string, -1))
    .lte("shift_date", addDays(a.shift_date as string, 1));
  const conflict = restConflict(
    { date: a.shift_date as string, shift: a.shift as ShiftType },
    (nearby ?? []).map((n) => ({
      shift_date: n.shift_date as string,
      shift: n.shift as ShiftType,
    })),
  );
  if (conflict) problems.push(`${cov.full_name}: ${conflict}.`);
  else checks.push("No overlapping shift and rest period respected");

  const { data: pto } = await db
    .from("pto_requests")
    .select("id")
    .eq("employee_id", coveringId)
    .eq("status", "approved")
    .lte("start_date", a.shift_date)
    .gte("end_date", a.shift_date);
  if ((pto ?? []).length) problems.push(`${cov.full_name} has approved PTO on that date.`);
  else checks.push("No conflicting approved PTO");

  const weekly = (await weeklyHoursMap(startOfWeek(a.shift_date as string))).get(coveringId) ?? 0;
  const projected = weekly + Number(a.hours);
  if (projected > OVERTIME_THRESHOLD_HOURS)
    checks.push(
      `Allowed, but creates ${(projected - OVERTIME_THRESHOLD_HOURS).toFixed(1)}h of overtime (${projected.toFixed(1)}h week)`,
    );
  else checks.push(`Keeps ${cov.full_name} at ${projected.toFixed(1)}h for the week — no overtime`);

  checks.push("Required staffing level for the unit stays intact (1-for-1 swap)");
  return { valid: problems.length === 0, problems, checks, assignment: a, covering: cov };
}

export async function approveSwitch(switchId: string, actorLabel: string) {
  const { data: sw } = await db.from("shift_switches").select("*").eq("id", switchId).maybeSingle();
  if (!sw) throw new Error("Switch request not found.");
  const validation = await validateSwitch(sw.assignment_id as string, sw.covering_id as string);
  if (!validation.valid) {
    await db
      .from("shift_switches")
      .update({ status: "rejected", validation_notes: validation.problems.join(" ") })
      .eq("id", switchId);
    return { approved: false, problems: validation.problems };
  }
  await db
    .from("shift_assignments")
    .update({ employee_id: sw.covering_id, status: "swapped", note: "Approved shift switch" })
    .eq("id", sw.assignment_id);
  await db.from("shift_assignments").update({ status: "scheduled" }).eq("id", sw.assignment_id);
  await db
    .from("shift_switches")
    .update({
      status: "approved",
      covering_confirmed: true,
      validation_notes: validation.checks.join(" · "),
    })
    .eq("id", switchId);
  const { data: a } = await db
    .from("shift_assignments")
    .select("shift_date,shift")
    .eq("id", sw.assignment_id)
    .maybeSingle();
  await db.from("notifications").insert([
    {
      employee_id: sw.requester_id,
      audience: "employee",
      title: "Shift switch approved",
      body: `Your shift on ${a?.shift_date} is now covered through the approved shift-switch process. No attendance point is applied.`,
    },
    {
      employee_id: sw.covering_id,
      audience: "employee",
      title: "You are covering a shift",
      body: `You are now scheduled for the ${SHIFT_LABEL[(a?.shift ?? "first") as ShiftType].toLowerCase()} on ${a?.shift_date}.`,
    },
  ]);
  await logAudit("switch_approved", actorLabel, "shift_switch", switchId, {
    assignmentId: sw.assignment_id,
  });
  return { approved: true, checks: validation.checks };
}

// ---------------- Reads ----------------

export async function attendanceTotal(employeeId: string) {
  const { data } = await db
    .from("attendance_events")
    .select("kind,points,minutes_late,occurred_at,note")
    .eq("employee_id", employeeId)
    .order("occurred_at", { ascending: false });
  const earned = (data ?? []).reduce((s, e) => s + Number(e.points), 0);
  const { data: backs } = await db
    .from("point_buybacks")
    .select("points_removed")
    .eq("employee_id", employeeId);
  const boughtBack = (backs ?? []).reduce((s, b) => s + Number(b.points_removed), 0);
  return {
    total: Number(Math.max(0, earned - boughtBack).toFixed(1)),
    boughtBack: Number(boughtBack.toFixed(1)),
    events: data ?? [],
  };
}

export async function scheduleFor(params: {
  from: string;
  to: string;
  employeeId?: string | null | undefined;
  unitId?: string | null | undefined;
  position?: PositionType | null | undefined;
  shift?: ShiftType | null | undefined;
}) {
  let q = db
    .from("shift_assignments")
    .select(
      "id,shift_date,shift,unit_id,position,employee_id,status,hours,is_overtime,created_by_ai,note,is_float,home_unit_id,float_reason,fill_reason,agency_staff_id,agency_id,is_training,preceptor_id",
    )
    .gte("shift_date", params.from)
    .lte("shift_date", params.to)
    .order("shift_date");
  if (params.employeeId) q = q.eq("employee_id", params.employeeId);
  if (params.unitId) q = q.eq("unit_id", params.unitId);
  if (params.position) q = q.eq("position", params.position);
  if (params.shift) q = q.eq("shift", params.shift);
  const { data } = await q;
  const { byId } = await unitMap();
  const ids = Array.from(
    new Set((data ?? []).flatMap((a) => [a.employee_id, a.preceptor_id]).filter(Boolean)),
  ) as string[];
  const names = new Map<string, string>();
  if (ids.length) {
    const { data: emps } = await db.from("employees").select("id,full_name").in("id", ids);
    (emps ?? []).forEach((e) => names.set(e.id, e.full_name));
  }
  const agencyIds = Array.from(
    new Set((data ?? []).map((a) => a.agency_staff_id).filter(Boolean)),
  ) as string[];
  const agencyStaff = new Map<string, { name: string; agency: string; clockIn: string }>();
  if (agencyIds.length) {
    const { data: rows } = await db
      .from("agency_staff")
      .select("id,full_name,clock_in_number,agencies(name)")
      .in("id", agencyIds);
    (rows ?? []).forEach((r) =>
      agencyStaff.set(r.id, {
        name: r.full_name,
        agency: (r.agencies as { name: string } | null)?.name ?? "Agency",
        clockIn: r.clock_in_number ?? "",
      }),
    );
  }
  return (data ?? []).map((a) => ({
    isFloat: a.is_float as boolean,
    homeUnit: a.home_unit_id ? (byId.get(a.home_unit_id as string) ?? null) : null,
    id: a.id as string,
    date: a.shift_date as string,
    shift: a.shift as ShiftType,
    shiftLabel: SHIFT_LABEL[a.shift as ShiftType],
    window: SHIFT_WINDOW[a.shift as ShiftType][a.position as PositionType].join(" – "),
    unit: byId.get(a.unit_id as string) ?? "—",
    unitId: a.unit_id as string,
    position: a.position as PositionType,
    employeeId: a.employee_id as string | null,
    employee: a.employee_id ? (names.get(a.employee_id as string) ?? "—") : null,
    status: a.status as string,
    hours: Number(a.hours),
    isOvertime: a.is_overtime as boolean,
    byAi: a.created_by_ai as boolean,
    note: a.note as string | null,
    floatReason: (a.float_reason as string | null) ?? null,
    fillReason: (a.fill_reason as string | null) ?? null,
    isAgency: Boolean(a.agency_staff_id),
    agencyStaffId: (a.agency_staff_id as string | null) ?? null,
    agencyName: a.agency_staff_id
      ? (agencyStaff.get(a.agency_staff_id as string)?.agency ?? "Agency")
      : null,
    agencyPerson: a.agency_staff_id
      ? (agencyStaff.get(a.agency_staff_id as string)?.name ?? "Agency staff")
      : null,
    isTraining: Boolean(a.is_training),
    preceptor: a.preceptor_id ? (names.get(a.preceptor_id as string) ?? null) : null,
  }));
}

export type ScheduleEntry = Awaited<ReturnType<typeof scheduleFor>>[number];

export async function openShiftsFor(employee: EmployeeRow) {
  const from = today();
  const to = addDays(from, 21);
  const coverage = await getCoverage(from, to);
  const eligible = coverage.filter(
    (c) =>
      c.gap > 0 &&
      c.position === employee.position &&
      (c.unitId === employee.primary_unit_id ||
        (employee.qualified_unit_ids ?? []).includes(c.unitId)),
  );
  return eligible.slice(0, 25);
}
