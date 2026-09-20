// Permission-aware implementation layer for the staffing server functions.
import {
  ATTENDANCE_LEVELS,
  CALL_OFF_POINTS,
  LATE_POINTS,
  TERMINATION_POINTS,
  addDays,
  attendanceStatus,
  OVERTIME_THRESHOLD_HOURS,
  POSITION_LABEL,
  SHIFT_LABEL,
  startOfWeek,
  type PositionType,
  type ShiftType,
} from "./facility";
import {
  assignReplacement,
  attendanceTotal,
  autoFillGaps,
  approveSwitch,
  db,
  findCandidates,
  getCoverage,
  loadActor,
  logAudit,
  openShiftsFor,
  overtimeReport,
  recordCallOff,
  recordLate,
  requireAdmin,
  requireManager,
  scheduleFor,
  submitPto,
  summarizeCoverage,
  today,
  unitMap,
  validateSwitch,
  type Actor,
} from "./staffing.server";
import {
  addEmployeeNote,
  deleteEmployeeNote,
  employeeProfile,
  floatAssignment,
  floatHistory,
  floatTracker,
  setAssignmentNote,
} from "./floats.server";
import { getAutopilotSettings, updatePpdGoal } from "./settings.server";
import { buybackStatus } from "./buyback.server";

function label(actor: Actor) {
  return `${actor.profile?.full_name ?? actor.profile?.email ?? "user"} (${actor.role})`;
}

export async function facilityConfig(userId: string) {
  const actor = await loadActor(userId);
  const { units } = await unitMap();
  const { data: reqs } = await db
    .from("staffing_requirements")
    .select("unit_id,position,shift,required_count");
  const settings = await getAutopilotSettings();
  return {
    role: actor.role,
    isManager: actor.isManager,
    isAdmin: actor.role === "admin",
    ppdGoal: settings.ppdGoal,
    employee: actor.employee,
    profile: actor.profile,
    units,
    requirements: reqs ?? [],
  };
}

export async function meOverview(userId: string) {
  const actor = await loadActor(userId);
  const from = today();
  const to = addDays(from, 13);
  if (!actor.employee) {
    return {
      actor: { role: actor.role, isManager: actor.isManager, name: actor.profile?.full_name ?? "" },
      employee: null,
    };
  }
  const emp = actor.employee;
  const weekStart = startOfWeek(from);
  const [shifts, points, notifications, pto, switches, open, weekShifts] = await Promise.all([
    scheduleFor({ from, to, employeeId: emp.id }),
    attendanceTotal(emp.id),
    db
      .from("notifications")
      .select("*")
      .eq("employee_id", emp.id)
      .order("created_at", { ascending: false })
      .limit(15),
    db
      .from("pto_requests")
      .select("*")
      .eq("employee_id", emp.id)
      .order("submitted_at", { ascending: false }),
    db
      .from("shift_switches")
      .select("*")
      .or(`requester_id.eq.${emp.id},covering_id.eq.${emp.id}`)
      .order("created_at", { ascending: false }),
    openShiftsFor(emp),
    scheduleFor({ from: weekStart, to: addDays(weekStart, 6), employeeId: emp.id }),
  ]);
  const { byId } = await unitMap();
  const nextShift = shifts.find((s) => s.status === "scheduled");
  const coworkers = nextShift
    ? (
        await scheduleFor({
          from: nextShift.date,
          to: nextShift.date,
          shift: nextShift.shift,
          unitId: nextShift.unitId,
        })
      )
        .filter((s) => s.employeeId && s.employeeId !== emp.id && s.status !== "called_off")
        .map((s) => ({ name: s.employee, position: POSITION_LABEL[s.position] }))
    : [];
  return {
    actor: {
      role: actor.role,
      isManager: actor.isManager,
      name: actor.profile?.full_name ?? emp.full_name,
    },
    employee: {
      id: emp.id,
      name: emp.full_name,
      position: emp.position,
      positionLabel: POSITION_LABEL[emp.position],
      homeUnit: byId.get(emp.primary_unit_id ?? "") ?? "—",
      qualifiedUnits: (emp.qualified_unit_ids ?? [])
        .map((id) => byId.get(id))
        .filter(Boolean) as string[],
      scheduledShift: emp.scheduled_shift,
      scheduledShiftLabel: SHIFT_LABEL[emp.scheduled_shift],
      weekendGroup: emp.weekend_group,
      hireDate: emp.hire_date,
    },
    points: points.total,
    pointEvents: points.events,
    weekHours: Number(
      weekShifts.reduce((s, x) => s + (x.status === "cancelled" ? 0 : x.hours), 0).toFixed(1),
    ),
    shifts,
    nextShift,
    coworkers,
    notifications: notifications.data ?? [],
    pto: pto.data ?? [],
    switches: switches.data ?? [],
    openShifts: open,
  };
}

export async function dashboardData(userId: string, dateInput?: string) {
  const actor = await loadActor(userId);
  requireManager(actor);
  const date = dateInput ?? today();
  const weekEnd = addDays(date, 6);
  const [coverage, weekCoverage, ot, alerts, callOffs, switches, pto, notifications] =
    await Promise.all([
      getCoverage(date, date),
      getCoverage(date, weekEnd),
      overtimeReport(startOfWeek(date)),
      db
        .from("staffing_alerts")
        .select("*")
        .eq("status", "open")
        .order("created_at", { ascending: false })
        .limit(30),
      scheduleFor({ from: date, to: addDays(date, 6) }),
      db.from("shift_switches").select("*").order("created_at", { ascending: false }).limit(20),
      db.from("pto_requests").select("*").order("submitted_at", { ascending: false }).limit(20),
      db
        .from("notifications")
        .select("*")
        .eq("audience", "manager")
        .order("created_at", { ascending: false })
        .limit(10),
    ]);
  const { byId } = await unitMap();
  const empIds = Array.from(
    new Set([
      ...(switches.data ?? []).flatMap((s) => [s.requester_id, s.covering_id]),
      ...(pto.data ?? []).map((p) => p.employee_id),
    ]),
  );
  const names = new Map<string, string>();
  if (empIds.length) {
    const { data } = await db.from("employees").select("id,full_name").in("id", empIds);
    (data ?? []).forEach((e) => names.set(e.id, e.full_name));
  }
  const callOffList = callOffs.filter((c) => c.status === "called_off");
  const openShifts = callOffs.filter((c) => c.status === "open");
  return {
    date,
    todayCoverage: coverage,
    todaySummary: summarizeCoverage(coverage),
    weekSummary: summarizeCoverage(weekCoverage),
    weekCoverage,
    overtime: {
      totalScheduledHours: ot.totalScheduledHours,
      overtimeHours: ot.overtimeHours,
      inOvertime: ot.inOvertime.slice(0, 10),
      approaching: ot.approachingOvertime.slice(0, 10),
    },
    alerts: (alerts.data ?? []).map((a) => ({ ...a, unitName: byId.get(a.unit_id ?? "") ?? "" })),
    callOffs: callOffList,
    openShifts,
    switches: (switches.data ?? []).map((s) => ({
      ...s,
      requester: names.get(s.requester_id) ?? "",
      covering: names.get(s.covering_id) ?? "",
    })),
    pto: (pto.data ?? []).map((p) => ({ ...p, employee: names.get(p.employee_id) ?? "" })),
    managerNotifications: notifications.data ?? [],
  };
}

export async function scheduleQuery(
  userId: string,
  params: {
    from: string;
    to: string;
    unitId?: string | null | undefined;
    position?: PositionType | null | undefined;
    shift?: ShiftType | null | undefined;
    employeeId?: string | null | undefined;
  },
) {
  const actor = await loadActor(userId);
  const scoped = actor.isManager ? params : { ...params, employeeId: actor.employee?.id ?? "none" };
  const { weeklyHoursMap } = await import("./staffing.server");
  const [entries, coverage, hours] = await Promise.all([
    scheduleFor(scoped),
    actor.isManager ? getCoverage(params.from, params.to) : Promise.resolve([]),
    weeklyHoursMap(startOfWeek(params.from)),
  ]);
  // Hours already booked this week per person, so the board can warn before a
  // move or a pick-up tips somebody into overtime.
  const weeklyHours = [...hours.entries()].map(([employeeId, h]) => ({
    employeeId,
    hours: Number(h.toFixed(1)),
  }));
  return {
    entries,
    coverage,
    isManager: actor.isManager,
    weeklyHours,
    overtimeThreshold: OVERTIME_THRESHOLD_HOURS,
  };
}

export async function employeeDirectory(userId: string) {
  const actor = await loadActor(userId);
  const { byId } = await unitMap();
  const { data } = await db.from("employees").select("*").eq("is_active", true).order("full_name");
  const hours = await import("./staffing.server").then((m) =>
    m.weeklyHoursMap(startOfWeek(today())),
  );
  const points = new Map<string, number>();
  if (actor.isManager) {
    const { data: events } = await db.from("attendance_events").select("employee_id,points");
    (events ?? []).forEach((e) =>
      points.set(e.employee_id, (points.get(e.employee_id) ?? 0) + Number(e.points)),
    );
  }
  return {
    isManager: actor.isManager,
    employees: (data ?? []).map((e) => ({
      id: e.id,
      name: e.full_name,
      email: actor.isManager ? e.email : null,
      position: e.position as PositionType,
      positionLabel: POSITION_LABEL[e.position as PositionType],
      homeUnit: byId.get(e.primary_unit_id ?? "") ?? "—",
      shift: e.scheduled_shift as ShiftType,
      shiftLabel: SHIFT_LABEL[e.scheduled_shift as ShiftType],
      weekendGroup: e.weekend_group,
      weeklyHours: Number((hours.get(e.id) ?? 0).toFixed(1)),
      overtime: (hours.get(e.id) ?? 0) > OVERTIME_THRESHOLD_HOURS,
      points: actor.isManager ? Number((points.get(e.id) ?? 0).toFixed(1)) : null,
      linked: Boolean(e.user_id),
    })),
  };
}

export async function replacementSearch(userId: string, assignmentId: string) {
  const actor = await loadActor(userId);
  if (!actor.isManager) {
    const { data } = await db
      .from("shift_assignments")
      .select("employee_id")
      .eq("id", assignmentId)
      .maybeSingle();
    if (!data || data.employee_id !== actor.employee?.id)
      throw new Error("You can only search for coverage for your own shifts.");
  }
  return findCandidates(assignmentId, 8);
}

export async function assignReplacementAction(
  userId: string,
  assignmentId: string,
  employeeId: string,
) {
  const actor = await loadActor(userId);
  requireManager(actor);
  return assignReplacement(assignmentId, employeeId, label(actor));
}

export async function callOffAction(userId: string, assignmentId: string, note?: string) {
  const actor = await loadActor(userId);
  if (!actor.isManager) {
    const { data } = await db
      .from("shift_assignments")
      .select("employee_id")
      .eq("id", assignmentId)
      .maybeSingle();
    if (!data || data.employee_id !== actor.employee?.id)
      throw new Error("You can only call off your own shift.");
  }
  return recordCallOff(assignmentId, label(actor), note);
}

export async function markLateAction(userId: string, assignmentId: string, minutesLate: number) {
  const actor = await loadActor(userId);
  requireManager(actor);
  return recordLate(assignmentId, minutesLate, label(actor));
}

export async function autoFillGapsAction(userId: string, from: string, to: string) {
  const actor = await loadActor(userId);
  requireManager(actor);
  return autoFillGaps(from, to, label(actor));
}

export async function submitPtoAction(userId: string, start: string, end: string, reason: string) {
  const actor = await loadActor(userId);
  if (!actor.employee) throw new Error("Your login is not linked to an employee record yet.");
  return submitPto(actor.employee.id, start, end, reason, label(actor));
}

export async function decidePtoAction(userId: string, id: string, approve: boolean, note?: string) {
  const actor = await loadActor(userId);
  requireManager(actor);
  const { data } = await db
    .from("pto_requests")
    .update({ status: approve ? "approved" : "rejected", decision_note: note ?? null })
    .eq("id", id)
    .select("employee_id,start_date,end_date")
    .maybeSingle();
  if (data)
    await db.from("notifications").insert({
      employee_id: data.employee_id,
      audience: "employee",
      title: approve ? "Vacation approved" : "Vacation request declined",
      body: `Your request for ${data.start_date} – ${data.end_date} was ${approve ? "approved" : "declined"}.${note ? ` Note: ${note}` : ""}`,
    });
  await logAudit(approve ? "pto_approved" : "pto_rejected", label(actor), "pto_request", id, {});
  return { ok: true };
}

export async function validateSwitchQuery(
  userId: string,
  assignmentId: string,
  coveringId: string,
) {
  await loadActor(userId);
  const res = await validateSwitch(assignmentId, coveringId);
  return { valid: res.valid, problems: res.problems, checks: res.checks };
}

export async function createSwitchAction(
  userId: string,
  assignmentId: string,
  coveringId: string,
  reason: string,
) {
  const actor = await loadActor(userId);
  const { data: a } = await db
    .from("shift_assignments")
    .select("employee_id,shift_date,shift")
    .eq("id", assignmentId)
    .maybeSingle();
  if (!a) throw new Error("Shift not found.");
  if (!actor.isManager && a.employee_id !== actor.employee?.id)
    throw new Error("You can only request a switch for your own shift.");
  const validation = await validateSwitch(assignmentId, coveringId);
  const { data: created } = await db
    .from("shift_switches")
    .insert({
      assignment_id: assignmentId,
      requester_id: a.employee_id as string,
      covering_id: coveringId,
      reason,
      requester_confirmed: true,
      covering_confirmed: false,
      status: validation.valid ? "pending" : "rejected",
      validation_notes: validation.valid
        ? validation.checks.join(" · ")
        : validation.problems.join(" "),
    })
    .select("id")
    .maybeSingle();
  if (validation.valid) {
    await db.from("notifications").insert([
      {
        employee_id: coveringId,
        audience: "employee",
        title: "Shift switch requested",
        body: `A coworker asked you to cover the ${SHIFT_LABEL[a.shift as ShiftType].toLowerCase()} on ${a.shift_date}. Confirm it on the shift switch page.`,
      },
      {
        audience: "manager",
        title: "Shift switch pending",
        body: `A shift switch for ${a.shift_date} passed all validation checks and is awaiting confirmation.`,
      },
    ]);
  }
  await logAudit("switch_requested", label(actor), "shift_switch", created?.id ?? null, {
    valid: validation.valid,
  });
  return {
    id: created?.id,
    valid: validation.valid,
    problems: validation.problems,
    checks: validation.checks,
  };
}

export async function respondSwitchAction(userId: string, id: string, accept: boolean) {
  const actor = await loadActor(userId);
  const { data: sw } = await db.from("shift_switches").select("*").eq("id", id).maybeSingle();
  if (!sw) throw new Error("Request not found.");
  if (sw.covering_id !== actor.employee?.id && !actor.isManager)
    throw new Error("Only the covering employee can respond to this request.");
  if (!accept) {
    await db
      .from("shift_switches")
      .update({ status: "rejected", validation_notes: "Declined by covering employee" })
      .eq("id", id);
    return { ok: true, approved: false };
  }
  await db.from("shift_switches").update({ covering_confirmed: true }).eq("id", id);
  const result = await approveSwitch(id, label(actor));
  return { ok: true, ...result };
}

export async function approveSwitchAction(userId: string, id: string, approve: boolean) {
  const actor = await loadActor(userId);
  requireManager(actor);
  if (!approve) {
    await db
      .from("shift_switches")
      .update({ status: "rejected", validation_notes: "Declined by management" })
      .eq("id", id);
    return { approved: false };
  }
  return approveSwitch(id, label(actor));
}

export async function myAttendance(userId: string) {
  const actor = await loadActor(userId);
  if (!actor.employee) return { linked: false as const };
  const emp = actor.employee;
  const { data: events } = await db
    .from("attendance_events")
    .select("*")
    .eq("employee_id", emp.id)
    .order("occurred_at", { ascending: false })
    .limit(100);
  const rows = events ?? [];
  const buyback = await buybackStatus(emp.id);

  // Points fall off after a rolling twelve months.
  const rollOffOf = (iso: string) => {
    const d = new Date(iso);
    d.setMonth(d.getMonth() + 12);
    return d.toISOString();
  };
  const nowIso = new Date().toISOString();
  const live = rows.filter((e) => rollOffOf(e.occurred_at as string) > nowIso);
  const total = Math.max(
    0,
    live.reduce((s, e) => s + Number(e.points), 0) - buyback.totalBoughtBack,
  );
  const cutoff = new Date(Date.now() - 90 * 864e5).toISOString();
  const last90 = rows
    .filter((e) => e.occurred_at >= cutoff)
    .reduce((s, e) => s + Number(e.points), 0);

  // A running statement: every occurrence, every point bought back, and what the
  // total was after each one — so nobody has to guess how they got to their number.
  type LedgerEntry = {
    id: string;
    at: string;
    kind: "late" | "call_off" | "buyback" | "rolled_off";
    label: string;
    detail: string;
    delta: number;
    balance: number;
  };
  const raw: Omit<LedgerEntry, "balance">[] = [];
  for (const e of rows) {
    const occurred = e.occurred_at as string;
    raw.push({
      id: String(e.id),
      at: occurred,
      kind: e.kind as "late" | "call_off",
      label:
        e.kind === "late"
          ? `Late${e.minutes_late ? ` by ${e.minutes_late} minutes` : ""}`
          : "Call-off",
      detail: (e.note as string | null) ?? "",
      delta: Number(e.points),
    });
    const off = rollOffOf(occurred);
    if (off <= nowIso)
      raw.push({
        id: `${e.id}-off`,
        at: off,
        kind: "rolled_off",
        label: "Point fell off",
        detail: `Twelve months after the ${new Date(occurred).toLocaleDateString()} occurrence.`,
        delta: -Number(e.points),
      });
  }
  for (const h of buyback.history ?? []) {
    raw.push({
      id: String(h.id),
      at: h.createdAt as string,
      kind: "buyback",
      label: "Points earned back",
      detail: h.reason as string,
      delta: -Number(h.points),
    });
  }
  raw.sort((a, b) => (a.at < b.at ? -1 : a.at > b.at ? 1 : 0));
  let balance = 0;
  const ledger: LedgerEntry[] = raw.map((r) => {
    balance = Math.max(0, Number((balance + r.delta).toFixed(1)));
    return { ...r, balance };
  });
  ledger.reverse();

  const upcomingRollOffs = rows
    .filter((e) => rollOffOf(e.occurred_at as string) > nowIso)
    .map((e) => ({
      id: String(e.id),
      points: Number(e.points),
      label: e.kind === "late" ? "Late" : "Call-off",
      fallsOffOn: rollOffOf(e.occurred_at as string),
    }))
    .sort((a, b) => (a.fallsOffOn < b.fallsOffOn ? -1 : 1))
    .slice(0, 6);

  const { data: notes } = await db
    .from("notifications")
    .select("id,title,body,created_at,read")
    .eq("employee_id", emp.id)
    .ilike("title", "%attendance%")
    .order("created_at", { ascending: false })
    .limit(10);
  return {
    linked: true as const,
    name: emp.full_name,
    status: attendanceStatus(total),
    levels: ATTENDANCE_LEVELS,
    terminationPoints: TERMINATION_POINTS,
    last90Days: Number(last90.toFixed(1)),
    latePoints: LATE_POINTS,
    callOffPoints: CALL_OFF_POINTS,
    events: rows.map((e) => ({
      id: e.id,
      kind: e.kind as "late" | "call_off",
      points: Number(e.points),
      minutesLate: e.minutes_late,
      occurredAt: e.occurred_at,
      note: e.note,
    })),
    notices: notes ?? [],
    buyback,
    ledger,
    upcomingRollOffs,
  };
}

// ---- Profiles, notes, floating ----
export async function employeeProfileQuery(userId: string, employeeId: string) {
  const actor = await loadActor(userId);
  const includePrivate = actor.isManager || actor.employee?.id === employeeId;
  const profile = await employeeProfile(employeeId, { includePrivate });
  return { ...profile, canEdit: actor.isManager, isSelf: actor.employee?.id === employeeId };
}

export async function addEmployeeNoteAction(
  userId: string,
  employeeId: string,
  body: string,
  category?: string,
  pinned?: boolean,
) {
  const actor = await loadActor(userId);
  requireManager(actor);
  return addEmployeeNote({
    employeeId,
    authorId: actor.employee?.id ?? null,
    authorName: actor.profile?.full_name ?? actor.profile?.email ?? "Management",
    body,
    ...(category ? { category } : {}),
    ...(pinned === undefined ? {} : { pinned }),
  });
}

export async function deleteEmployeeNoteAction(userId: string, noteId: string) {
  const actor = await loadActor(userId);
  requireManager(actor);
  return deleteEmployeeNote(noteId, label(actor));
}

export async function setAssignmentNoteAction(userId: string, assignmentId: string, note: string) {
  const actor = await loadActor(userId);
  requireManager(actor);
  return setAssignmentNote(assignmentId, note, label(actor));
}

export async function floatAssignmentAction(
  userId: string,
  assignmentId: string,
  toUnitId: string,
  reason?: string,
  note?: string,
) {
  const actor = await loadActor(userId);
  requireManager(actor);
  return floatAssignment(assignmentId, toUnitId, label(actor), {
    ...(reason ? { reason: reason as never } : {}),
    ...(note ? { note } : {}),
    automatic: false,
  });
}

export async function floatHistoryQuery(userId: string, employeeId?: string, limit?: number) {
  const actor = await loadActor(userId);
  const scoped = actor.isManager ? employeeId : (actor.employee?.id ?? "none");
  return floatHistory(limit ?? 25, scoped);
}

export async function floatTrackerQuery(
  userId: string,
  params?: {
    unitId?: string | null | undefined;
    shift?: ShiftType | null | undefined;
    position?: PositionType | null | undefined;
  },
) {
  await loadActor(userId);
  const settings = await getAutopilotSettings();
  return floatTracker({
    ...(params ?? {}),
    seniorityWeight: settings.seniorityWeight,
    recencyWeight: settings.recencyWeight,
  });
}

export async function setPpdGoalAction(userId: string, goal: number) {
  const actor = await loadActor(userId);
  requireAdmin(actor);
  return updatePpdGoal(goal, label(actor));
}
