import {
  loadActor,
  requireManager,
  db,
  logAudit,
  recordCallOff,
  recordLate,
  today,
} from "./staffing.server";
import {
  agencyBoard,
  agencyStaffDetail,
  bookAgencyShift,
  claimShift,
  costProjection,
  credentialBoard,
  credentialSweep,
  dropClaimedShift,
  fairnessScorecard,
  findIntakeAssignment,
  floatPoolBoard,
  intakeInbox,
  pickupBoard,
  recordIntake,
  riskBoard,
  riskSweep,
  saveAgency,
  saveAgencyStaff,
  saveCredential,
  saveFacility,
  setFloatPoolOptin,
  setPreceptor,
  setTraining,
  trainingBoard,
  type PickupShift,
} from "./ops.server";
import type { PositionType, ShiftType } from "./facility";

async function manager(userId: string) {
  const actor = await loadActor(userId);
  requireManager(actor);
  return actor;
}
const label = (a: Awaited<ReturnType<typeof loadActor>>) =>
  a.employee?.full_name ?? a.profile?.full_name ?? a.profile?.email ?? "a manager";

// --- Agencies -------------------------------------------------------------
export async function agencyBoardQuery(userId: string, weekStart?: string) {
  await manager(userId);
  return agencyBoard(weekStart);
}

export async function agencyStaffQuery(userId: string, agencyStaffId: string) {
  const actor = await loadActor(userId);
  // Agency workers can look up their own card; managers can look up anyone's.
  if (!actor.isManager) {
    const { data } = await db
      .from("agency_staff")
      .select("id")
      .eq("id", agencyStaffId)
      .eq("user_id", userId)
      .maybeSingle();
    if (!data) throw new Error("You can only view your own agency information.");
  }
  return agencyStaffDetail(agencyStaffId);
}

export async function saveAgencyAction(userId: string, input: Parameters<typeof saveAgency>[0]) {
  const actor = await manager(userId);
  return saveAgency(input, label(actor));
}

export async function saveAgencyStaffAction(
  userId: string,
  input: Parameters<typeof saveAgencyStaff>[0],
) {
  const actor = await manager(userId);
  return saveAgencyStaff(input, label(actor));
}

export async function bookAgencyShiftAction(
  userId: string,
  input: {
    agencyStaffId: string;
    date: string;
    shift: ShiftType;
    unitId: string;
    position: PositionType;
    assignmentId?: string | null | undefined;
    force?: boolean | undefined;
  },
) {
  const actor = await manager(userId);
  return bookAgencyShift({ ...input, actorLabel: label(actor) });
}

export async function removeAgencyShiftAction(userId: string, assignmentId: string) {
  const actor = await manager(userId);
  await db
    .from("shift_assignments")
    .update({ agency_staff_id: null, agency_id: null, status: "open" })
    .eq("id", assignmentId);
  await logAudit("agency_shift_removed", label(actor), "shift_assignment", assignmentId, {});
  return { ok: true };
}

// --- Credentials ----------------------------------------------------------
export async function credentialsQuery(userId: string) {
  const actor = await loadActor(userId);
  if (actor.isManager) return { ...(await credentialBoard()), mine: false };
  const all = await credentialBoard();
  const mineId = actor.employee?.id;
  return {
    ...all,
    rows: all.rows.filter((r) => r.employeeId === mineId),
    expired: [],
    expiring: [],
    soon: [],
    mine: true,
  };
}

export async function saveCredentialAction(
  userId: string,
  input: Parameters<typeof saveCredential>[0],
) {
  const actor = await manager(userId);
  return saveCredential(input, label(actor));
}

export async function credentialSweepAction(userId: string) {
  const actor = await manager(userId);
  return credentialSweep(label(actor));
}

// --- Risk -----------------------------------------------------------------
export async function riskQuery(userId: string) {
  await manager(userId);
  return riskBoard();
}

export async function riskRefreshAction(userId: string) {
  await manager(userId);
  return riskSweep();
}

// --- Phone / voice intake -------------------------------------------------
export async function intakeQuery(userId: string) {
  await manager(userId);
  return { items: await intakeInbox() };
}

export async function recordIntakeAction(
  userId: string,
  input: {
    transcript: string;
    callerName?: string | undefined;
    callerPhone?: string | undefined;
    channel?: string | undefined;
  },
) {
  await manager(userId);
  return recordIntake(input);
}

export async function confirmIntakeAction(
  userId: string,
  input: {
    intakeId: string;
    employeeId: string;
    kind: "call_off" | "late";
    date: string;
    shift?: ShiftType | null | undefined;
    minutesLate?: number | null | undefined;
  },
) {
  const actor = await manager(userId);
  const assignment = await findIntakeAssignment(input.employeeId, input.date, input.shift ?? null);
  if (!assignment)
    throw new Error(
      "That person is not on the schedule for that day, so there is nothing to record.",
    );
  let outcome: string;
  if (input.kind === "late") {
    await recordLate(assignment.id as string, input.minutesLate ?? 30, label(actor));
    outcome = `Recorded as ${input.minutesLate ?? 30} minutes late (half a point).`;
  } else {
    const res = await recordCallOff(assignment.id as string, label(actor), "Called off by phone");
    outcome = `Call-off recorded (1 point). ${res.candidates.length} replacement option(s) found.`;
  }
  await db
    .from("call_off_intakes")
    .update({ status: "handled", employee_id: input.employeeId, outcome })
    .eq("id", input.intakeId);
  return { ok: true, message: outcome };
}

export async function dismissIntakeAction(userId: string, intakeId: string, reason: string) {
  await manager(userId);
  await db
    .from("call_off_intakes")
    .update({ status: "dismissed", outcome: reason || "Dismissed." })
    .eq("id", intakeId);
  return { ok: true };
}

// --- Fairness & cost ------------------------------------------------------
export async function fairnessQuery(userId: string, from?: string | undefined, to?: string) {
  await manager(userId);
  return fairnessScorecard(from, to);
}

export async function costQuery(userId: string, weekStart?: string) {
  await manager(userId);
  return costProjection(weekStart);
}

// --- Buildings & float pool ----------------------------------------------
export async function floatPoolQuery(userId: string) {
  await manager(userId);
  return floatPoolBoard();
}

export async function saveFacilityAction(
  userId: string,
  input: Parameters<typeof saveFacility>[0],
) {
  const actor = await manager(userId);
  return saveFacility(input, label(actor));
}

export async function floatOptinAction(
  userId: string,
  input: { employeeId?: string | undefined; optin: boolean },
) {
  const actor = await loadActor(userId);
  const target = input.employeeId ?? actor.employee?.id;
  if (!target) throw new Error("We could not find that employee.");
  if (!actor.isManager && target !== actor.employee?.id)
    throw new Error("You can only change your own float pool setting.");
  return setFloatPoolOptin(target, input.optin, label(actor));
}

// --- Orientation ----------------------------------------------------------
export async function trainingQuery(userId: string) {
  await manager(userId);
  return trainingBoard();
}

export async function setTrainingAction(
  userId: string,
  input: { employeeId: string; inTraining: boolean; endsOn?: string | null | undefined },
) {
  const actor = await manager(userId);
  return setTraining(input, label(actor));
}

export async function setPreceptorAction(
  userId: string,
  input: { assignmentId: string; preceptorId: string | null },
) {
  const actor = await manager(userId);
  return setPreceptor(input.assignmentId, input.preceptorId, label(actor));
}

// --- Pickup board ---------------------------------------------------------
export async function pickupQuery(
  userId: string,
  employeeId?: string,
): Promise<{
  employeeName: string;
  positionLabel: string;
  shifts: PickupShift[];
  openForMe: number;
}> {
  const actor = await loadActor(userId);
  const target = actor.isManager && employeeId ? employeeId : actor.employee?.id;
  if (!target) throw new Error("Your account is not linked to an employee record yet.");
  return pickupBoard(target);
}

export async function claimShiftAction(
  userId: string,
  input: { assignmentId?: string | null | undefined; key?: string | null | undefined },
) {
  const actor = await loadActor(userId);
  if (!actor.employee?.id) throw new Error("Your account is not linked to an employee record yet.");
  return claimShift(actor.employee.id, input);
}

export async function dropShiftAction(userId: string, assignmentId: string) {
  const actor = await loadActor(userId);
  if (!actor.employee?.id) throw new Error("Your account is not linked to an employee record yet.");
  return dropClaimedShift(actor.employee.id, assignmentId, label(actor));
}

export const opsToday = today;
