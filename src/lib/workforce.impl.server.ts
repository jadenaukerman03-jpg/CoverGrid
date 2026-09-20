// Permission-aware implementation layer for the workforce server functions.
import { addDays, startOfWeek } from "./facility";
import { loadActor, requireManager, today, unitMap, db, type Actor } from "./staffing.server";
import {
  addApplicant,
  createPosting,
  engagementBoard,
  giveRecognition,
  hiringBoard,
  laborReport,
  listMessages,
  moveApplicant,
  payrollCsv,
  payrollPeriod,
  pbjCsv,
  pbjReport,
  punch,
  punchReport,
  requestAdvance,
  sendMessage,
  setCensus,
  wageAccess,
  type ApplicantStage,
} from "./workforce.server";
import type { PositionType, ShiftType } from "./facility";

function label(actor: Actor) {
  return `${actor.profile?.full_name ?? actor.profile?.email ?? "user"} (${actor.role})`;
}

function requireEmployee(actor: Actor) {
  if (!actor.employee)
    throw new Error(
      "This login isn't connected to anyone on the roster yet. A manager can open Team, find the person and set their email to " +
        `${actor.profile?.email ?? "this sign-in email"} — the link happens automatically at the next sign-in.`,
    );
  return actor.employee;
}

export async function laborData(userId: string, from?: string, to?: string) {
  const actor = await loadActor(userId);
  requireManager(actor);
  const start = from ?? addDays(today(), -6);
  const end = to ?? today();
  const report = await laborReport(start, end);
  return { ...report, units: (await unitMap()).units };
}

export async function setCensusAction(
  userId: string,
  date: string,
  unitId: string,
  census: number,
) {
  const actor = await loadActor(userId);
  requireManager(actor);
  return setCensus(date, unitId, census);
}

export async function timeClockData(userId: string) {
  const actor = await loadActor(userId);
  const emp = requireEmployee(actor);
  const [{ data: openPunch }, { data: todays }, { data: recent }] = await Promise.all([
    db
      .from("time_punches")
      .select("*")
      .eq("employee_id", emp.id)
      .is("clock_out", null)
      .maybeSingle(),
    db
      .from("shift_assignments")
      .select("id,shift,unit_id,position,hours,status")
      .eq("employee_id", emp.id)
      .eq("shift_date", today()),
    db
      .from("time_punches")
      .select("*")
      .eq("employee_id", emp.id)
      .order("date", { ascending: false })
      .limit(12),
  ]);
  const { byId } = await unitMap();
  const weekStart = startOfWeek(today());
  const { data: weekPunches } = await db
    .from("time_punches")
    .select("minutes_worked")
    .eq("employee_id", emp.id)
    .gte("date", weekStart);
  return {
    employeeId: emp.id,
    openPunch,
    todaysShifts: (todays ?? []).map((a) => ({
      id: a.id,
      shift: a.shift,
      unit: byId.get(a.unit_id) ?? "—",
      position: a.position,
      hours: Number(a.hours),
      status: a.status,
    })),
    recent: recent ?? [],
    workedHoursThisWeek: Number(
      ((weekPunches ?? []).reduce((s, p) => s + p.minutes_worked, 0) / 60).toFixed(2),
    ),
  };
}

export async function punchAction(userId: string, assignmentId: string | null, kind: "in" | "out") {
  const actor = await loadActor(userId);
  const emp = requireEmployee(actor);
  return punch(emp.id, assignmentId, kind);
}

export async function punchReportData(userId: string, from?: string, to?: string) {
  const actor = await loadActor(userId);
  requireManager(actor);
  return punchReport(from ?? addDays(today(), -13), to ?? today());
}

export async function payrollData(userId: string, start?: string, end?: string) {
  const actor = await loadActor(userId);
  requireManager(actor);
  const period = await payrollPeriod(start, end);
  const { data: periods } = await db
    .from("payroll_periods")
    .select("*")
    .order("start_date", { ascending: false })
    .limit(8);
  return { ...period, csv: payrollCsv(period), periods: periods ?? [] };
}

export async function wageAccessData(userId: string) {
  const actor = await loadActor(userId);
  const emp = requireEmployee(actor);
  return wageAccess(emp.id);
}

export async function requestAdvanceAction(userId: string, amount: number, note: string) {
  const actor = await loadActor(userId);
  const emp = requireEmployee(actor);
  return requestAdvance(emp.id, amount, note);
}

export async function hiringData(userId: string) {
  const actor = await loadActor(userId);
  requireManager(actor);
  const board = await hiringBoard();
  return { ...board, units: (await unitMap()).units };
}

export async function createPostingAction(
  userId: string,
  input: {
    title: string;
    position: PositionType;
    shift: ShiftType | null;
    unitId: string | null;
    payRange: string;
    description: string;
    openings: number;
  },
) {
  const actor = await loadActor(userId);
  requireManager(actor);
  return createPosting(input);
}

export async function addApplicantAction(
  userId: string,
  input: {
    postingId: string | null;
    fullName: string;
    email?: string | undefined;
    phone?: string | undefined;
    source?: string | undefined;
    notes?: string | undefined;
  },
) {
  const actor = await loadActor(userId);
  requireManager(actor);
  return addApplicant(input);
}

export async function moveApplicantAction(userId: string, id: string, stage: ApplicantStage) {
  const actor = await loadActor(userId);
  requireManager(actor);
  return moveApplicant(id, stage, label(actor));
}

export async function engagementData(userId: string) {
  const actor = await loadActor(userId);
  const board = await engagementBoard(actor.employee?.id ?? null);
  return { ...board, isManager: actor.isManager, myEmployeeId: actor.employee?.id ?? null };
}

export async function giveRecognitionAction(
  userId: string,
  employeeId: string,
  badge: string,
  message: string,
) {
  const actor = await loadActor(userId);
  if (!actor.isManager && !actor.employee) throw new Error("You can't send recognition yet.");
  return giveRecognition({
    employeeId,
    fromEmployeeId: actor.employee?.id ?? null,
    badge,
    message,
    points: actor.isManager ? 25 : 10,
  });
}

export async function messagesData(userId: string) {
  const actor = await loadActor(userId);
  const messages = await listMessages(actor.employee?.id ?? null, actor.isManager);
  const { data: emps } = await db
    .from("employees")
    .select("id,full_name")
    .eq("is_active", true)
    .order("full_name");
  return {
    messages,
    isManager: actor.isManager,
    employees: emps ?? [],
    myEmployeeId: actor.employee?.id ?? null,
  };
}

export async function sendMessageAction(
  userId: string,
  input: { recipientId: string | null; audience: string; subject: string; body: string },
) {
  const actor = await loadActor(userId);
  if (!actor.isManager && input.recipientId === null)
    throw new Error("Only managers can broadcast to everyone.");
  return sendMessage({
    senderId: actor.employee?.id ?? null,
    senderName: actor.profile?.full_name ?? actor.employee?.full_name ?? "Management",
    recipientId: input.recipientId,
    audience: input.audience,
    subject: input.subject,
    body: input.body,
  });
}

export async function complianceData(userId: string, from?: string, to?: string) {
  const actor = await loadActor(userId);
  requireManager(actor);
  const start = from ?? addDays(today(), -29);
  const end = to ?? today();
  const [pbj, punches, labor] = await Promise.all([
    pbjReport(start, end),
    punchReport(start, end),
    laborReport(start, end),
  ]);
  return {
    pbj,
    pbjCsv: pbjCsv(pbj),
    exceptions: punches.exceptions.slice(0, 40),
    exceptionCount: punches.exceptions.length,
    hppd: labor.totals.hppd,
    byUnit: labor.byUnit,
  };
}

export async function lowCensusData(userId: string, from?: string, to?: string) {
  const actor = await loadActor(userId);
  requireManager(actor);
  const { lowCensusRecommendations } = await import("./lowcensus.server");
  return lowCensusRecommendations(from, to);
}

/**
 * Act on a low-census recommendation: cancels the shift, tells the person, and
 * writes it to the activity log so payroll and the schedule stay in step.
 */
export async function sendHomeLowCensusAction(userId: string, assignmentId: string, note?: string) {
  const actor = await loadActor(userId);
  requireManager(actor);
  const { data: asg } = await db
    .from("shift_assignments")
    .select("id, shift_date, shift, unit_id, position, employee_id, agency_staff_id, status, hours")
    .eq("id", assignmentId)
    .maybeSingle();
  if (!asg) throw new Error("That shift is no longer on the schedule.");
  if (asg.status !== "scheduled") throw new Error("That shift has already been changed.");

  const { byId } = await unitMap();
  const unitName = byId.get(asg.unit_id) ?? "the unit";
  const reason = note?.trim()
    ? note.trim()
    : "Low census — census is below the level that shift is staffed for.";

  const { getNotifyPrefs, notifyEmployee } = await import("./messaging.server");
  const prefs = await getNotifyPrefs();

  const { data: before } = await db
    .from("shift_assignments")
    .select("note")
    .eq("id", assignmentId)
    .maybeSingle();

  await db
    .from("shift_assignments")
    .update({
      status: "cancelled",
      prev_note: (before?.note as string | null) ?? null,
      note: `Low census (${label(actor)}). ${reason}`,
    })
    .eq("id", assignmentId);

  if (asg.employee_id) {
    await notifyEmployee({
      employeeId: asg.employee_id,
      category: "schedule",
      title: "You have been offered low census",
      body: `Your ${asg.shift_date} shift on ${unitName} has been cancelled for low census. ${reason} Your hours are not counted as a call-off and no attendance points apply.`,
      text: `Low census: your ${asg.shift_date} shift on ${unitName} is cancelled. No attendance points. Contact the scheduler with questions.`,
      kind: "notice",
    });
  }

  await db.from("staffing_alerts").insert({
    severity: "info",
    shift_date: asg.shift_date,
    shift: asg.shift,
    unit_id: asg.unit_id,
    position: asg.position,
    message: `Low census: one ${asg.position} cut from ${unitName} on ${asg.shift_date} by ${label(actor)}.`,
    status: "resolved",
  });

  const { logAudit } = await import("./staffing.server");
  await logAudit("low_census_sent_home", label(actor), "shift_assignment", assignmentId, {
    date: asg.shift_date,
    unit: unitName,
    hours: asg.hours,
  });
  return {
    ok: true,
    hours: Number(asg.hours ?? 0),
    undoWindowMinutes: prefs.undoWindowMinutes,
    undoUntil: new Date(Date.now() + prefs.undoWindowMinutes * 60_000).toISOString(),
  };
}

/**
 * Put a low-census cut back exactly the way it was, inside the manager's undo window.
 * Restores the shift, cancels the text if it has not gone out, tells the person the
 * shift is back on, and marks the original entry in the activity log as undone.
 */
export async function undoSendHomeAction(userId: string, assignmentId: string) {
  const actor = await loadActor(userId);
  requireManager(actor);
  const { logAudit } = await import("./staffing.server");
  const { getNotifyPrefs, notifyEmployee } = await import("./messaging.server");
  const prefs = await getNotifyPrefs();

  const { data: entry } = await db
    .from("audit_log")
    .select("id, created_at, undone_at")
    .eq("action", "low_census_sent_home")
    .eq("entity_id", assignmentId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!entry) throw new Error("There is no low-census cut on that shift to undo.");
  if (entry.undone_at) throw new Error("That low-census cut has already been undone.");

  const ageMinutes = (Date.now() - Date.parse(entry.created_at as string)) / 60_000;
  if (ageMinutes > prefs.undoWindowMinutes) {
    throw new Error(
      `The ${prefs.undoWindowMinutes}-minute undo window has passed. Put the person back on the schedule from the schedule board instead.`,
    );
  }

  const { data: asg } = await db
    .from("shift_assignments")
    .select("id, shift_date, shift, unit_id, employee_id, status, prev_note")
    .eq("id", assignmentId)
    .maybeSingle();
  if (!asg) throw new Error("That shift is no longer on the schedule.");
  if (asg.status !== "cancelled")
    throw new Error("That shift has already been changed by someone else.");

  await db
    .from("shift_assignments")
    .update({
      status: "scheduled",
      note: (asg.prev_note as string | null) ?? null,
      prev_note: null,
    })
    .eq("id", assignmentId);

  const { byId } = await unitMap();
  const unitName = byId.get(asg.unit_id) ?? "the unit";

  // Pull back the text if it is still sitting in the queue.
  if (asg.employee_id) {
    await db
      .from("message_outbox")
      .update({ status: "cancelled", error: "Cancelled — the manager undid the low census." })
      .eq("employee_id", asg.employee_id)
      .eq("status", "queued")
      .ilike("body", `Low census: your ${asg.shift_date}%`);

    await notifyEmployee({
      employeeId: asg.employee_id,
      category: "schedule",
      title: "Your shift is back on",
      body: `The low census on your ${asg.shift_date} shift on ${unitName} was undone by ${label(actor)}. Please work your shift as scheduled.`,
      text: `Correction: your ${asg.shift_date} shift on ${unitName} is back on. Please work as scheduled.`,
      kind: "notice",
      urgent: true,
    });
  }

  await db
    .from("audit_log")
    .update({ undone_at: new Date().toISOString(), undone_by: label(actor) })
    .eq("id", entry.id);
  await logAudit("low_census_undone", label(actor), "shift_assignment", assignmentId, {
    date: asg.shift_date,
    unit: unitName,
  });

  return { ok: true, restored: true as const, date: asg.shift_date, unit: unitName };
}
