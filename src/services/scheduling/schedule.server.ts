import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { rankCandidates } from "@/services/scheduling/rank-candidates";
import type {
  AssignedShift,
  Employee,
  OpenShift,
  RankCandidatesResult,
} from "@/services/scheduling/types";

import { getDemoFacilityId } from "./facility.server";

function mondayOf(dateIso: string): Date {
  const date = new Date(`${dateIso}T00:00:00`);
  const day = date.getDay(); // 0 = Sunday
  const diffToMonday = day === 0 ? -6 : 1 - day;
  date.setDate(date.getDate() + diffToMonday);
  return date;
}

function isoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function weekRange(weekStartIso: string) {
  const start = mondayOf(weekStartIso);
  const end = new Date(start);
  end.setDate(end.getDate() + 6);
  return { start: isoDate(start), end: isoDate(end) };
}

/**
 * Without generated DB types, Supabase's client types an embedded to-one
 * relation the same as a to-many one. Normalize both possible runtime shapes
 * rather than trusting a cast.
 */
function embeddedName(value: unknown): string | null {
  const record = Array.isArray(value) ? value[0] : value;
  if (record && typeof record === "object" && "full_name" in record) {
    const name = (record as { full_name: unknown }).full_name;
    return typeof name === "string" ? name : null;
  }
  return null;
}

export interface ScheduleGridUnit {
  id: string;
  name: string;
}

export interface ScheduleGridRole {
  id: string;
  name: string;
}

export interface ScheduleGridShift {
  id: string;
  unitId: string;
  roleId: string;
  shiftDate: string;
  startTime: string;
  endTime: string;
  status: string;
  assignedEmployeeId: string | null;
  assignedEmployeeName: string | null;
}

export interface ScheduleGridData {
  weekStart: string;
  weekEnd: string;
  units: ScheduleGridUnit[];
  roles: ScheduleGridRole[];
  shifts: ScheduleGridShift[];
}

export async function loadScheduleWeek(weekStartIso: string): Promise<ScheduleGridData> {
  const facilityId = await getDemoFacilityId();
  const { start, end } = weekRange(weekStartIso);
  const client = createSupabaseAdminClient();

  const [{ data: units, error: unitsError }, { data: roles, error: rolesError }] =
    await Promise.all([
      client.from("units").select("id, name").eq("facility_id", facilityId).order("name"),
      client.from("roles").select("id, name").eq("facility_id", facilityId).order("name"),
    ]);
  if (unitsError || !units) throw new Error("Unable to load units.");
  if (rolesError || !roles) throw new Error("Unable to load roles.");

  const { data: shifts, error: shiftsError } = await client
    .from("shift_instances")
    .select(
      "id, unit_id, role_id, shift_date, start_time, end_time, status, assigned_employee_id, employees(full_name)",
    )
    .eq("facility_id", facilityId)
    .gte("shift_date", start)
    .lte("shift_date", end)
    .order("shift_date");
  if (shiftsError || !shifts) throw new Error("Unable to load shifts.");

  return {
    weekStart: start,
    weekEnd: end,
    units,
    roles,
    shifts: shifts.map((row) => ({
      id: row.id,
      unitId: row.unit_id,
      roleId: row.role_id,
      shiftDate: row.shift_date,
      startTime: row.start_time,
      endTime: row.end_time,
      status: row.status,
      assignedEmployeeId: row.assigned_employee_id,
      assignedEmployeeName: embeddedName(row.employees),
    })),
  };
}

interface EngineContext {
  shift: OpenShift;
  employees: Employee[];
  existingAssignments: AssignedShift[];
  coAssignedEmployeeIds: string[];
  calledOffEmployeeIds: string[];
}

/** Assembles the plain-object inputs `rankCandidates` needs from live DB rows. */
async function buildEngineContext(shiftInstanceId: string): Promise<EngineContext> {
  const client = createSupabaseAdminClient();
  const facilityId = await getDemoFacilityId();

  const { data: shiftRow, error: shiftError } = await client
    .from("shift_instances")
    .select("id, unit_id, role_id, shift_date, start_time, end_time, required_certifications")
    .eq("id", shiftInstanceId)
    .single();
  if (shiftError || !shiftRow) throw new Error("This shift no longer exists.");

  const shift: OpenShift = {
    id: shiftRow.id,
    unitId: shiftRow.unit_id,
    roleId: shiftRow.role_id,
    shiftDate: shiftRow.shift_date,
    startTime: shiftRow.start_time,
    endTime: shiftRow.end_time,
    requiredCertifications: shiftRow.required_certifications ?? [],
  };

  const { data: employeeRows, error: employeesError } = await client
    .from("employees")
    .select(
      "id, full_name, home_unit_id, primary_role_id, float_eligible, active, max_weekly_hours, preferred_unit_ids",
    )
    .eq("facility_id", facilityId)
    .eq("active", true);
  if (employeesError || !employeeRows) throw new Error("Unable to load employees.");
  const employeeIds = employeeRows.map((row) => row.id);

  const { start: weekStart, end: weekEnd } = weekRange(shift.shiftDate);

  const [
    { data: certRows, error: certError },
    { data: conflictRows, error: conflictError },
    { data: assignmentRows, error: assignmentError },
    { data: coAssignedRows, error: coAssignedError },
    { data: outreachRows, error: outreachError },
  ] = await Promise.all([
    client
      .from("employee_certifications")
      .select("employee_id, certification")
      .in("employee_id", employeeIds),
    client
      .from("conflict_pairs")
      .select("employee_id_a, employee_id_b")
      .or(
        `employee_id_a.in.(${employeeIds.join(",")}),employee_id_b.in.(${employeeIds.join(",")})`,
      ),
    client
      .from("shift_instances")
      .select("assigned_employee_id, shift_date, start_time, end_time")
      .in("assigned_employee_id", employeeIds)
      .eq("status", "filled")
      .gte("shift_date", weekStart)
      .lte("shift_date", weekEnd),
    client
      .from("shift_instances")
      .select("assigned_employee_id")
      .eq("unit_id", shift.unitId)
      .eq("shift_date", shift.shiftDate)
      .eq("status", "filled")
      .neq("id", shiftInstanceId),
    client
      .from("outreach_log")
      .select("employee_id, sent_at")
      .in("employee_id", employeeIds)
      .order("sent_at", { ascending: false }),
  ]);
  if (certError || !certRows) throw new Error("Unable to load certifications.");
  if (conflictError || !conflictRows) throw new Error("Unable to load conflict pairs.");
  if (assignmentError || !assignmentRows) throw new Error("Unable to load existing assignments.");
  if (coAssignedError || !coAssignedRows) throw new Error("Unable to load co-assigned staff.");
  if (outreachError || !outreachRows) throw new Error("Unable to load outreach history.");

  const { data: callOffRows, error: callOffError } = await client
    .from("call_offs")
    .select("employee_id")
    .eq("shift_instance_id", shiftInstanceId);
  if (callOffError || !callOffRows)
    throw new Error("Unable to load call-off history for this shift.");

  const certsByEmployee = new Map<string, string[]>();
  for (const row of certRows) {
    const list = certsByEmployee.get(row.employee_id) ?? [];
    list.push(row.certification);
    certsByEmployee.set(row.employee_id, list);
  }

  const conflictsByEmployee = new Map<string, string[]>();
  for (const row of conflictRows) {
    const a = conflictsByEmployee.get(row.employee_id_a) ?? [];
    a.push(row.employee_id_b);
    conflictsByEmployee.set(row.employee_id_a, a);
    const b = conflictsByEmployee.get(row.employee_id_b) ?? [];
    b.push(row.employee_id_a);
    conflictsByEmployee.set(row.employee_id_b, b);
  }

  const hoursByEmployee = new Map<string, number>();
  for (const row of assignmentRows) {
    if (!row.assigned_employee_id) continue;
    const [startH, startM] = row.start_time.split(":").map(Number);
    const [endH, endM] = row.end_time.split(":").map(Number);
    let minutes = endH! * 60 + endM! - (startH! * 60 + startM!);
    if (minutes <= 0) minutes += 24 * 60;
    const hours = minutes / 60;
    hoursByEmployee.set(
      row.assigned_employee_id,
      (hoursByEmployee.get(row.assigned_employee_id) ?? 0) + hours,
    );
  }

  const lastOfferedByEmployee = new Map<string, string>();
  for (const row of outreachRows) {
    if (!lastOfferedByEmployee.has(row.employee_id)) {
      lastOfferedByEmployee.set(row.employee_id, row.sent_at);
    }
  }

  const employees: Employee[] = employeeRows.map((row) => ({
    id: row.id,
    fullName: row.full_name,
    homeUnitId: row.home_unit_id ?? "",
    primaryRoleId: row.primary_role_id ?? "",
    floatEligible: row.float_eligible,
    active: row.active,
    certifications: certsByEmployee.get(row.id) ?? [],
    attendancePoints: 0,
    maxWeeklyHours: Number(row.max_weekly_hours),
    hoursScheduledThisWeek: hoursByEmployee.get(row.id) ?? 0,
    lastOfferedAt: lastOfferedByEmployee.get(row.id) ?? null,
    conflictsWith: conflictsByEmployee.get(row.id) ?? [],
    preferredUnitIds: row.preferred_unit_ids ?? [],
  }));

  const existingAssignments: AssignedShift[] = assignmentRows
    .filter((row): row is typeof row & { assigned_employee_id: string } =>
      Boolean(row.assigned_employee_id),
    )
    .map((row) => ({
      employeeId: row.assigned_employee_id,
      shiftDate: row.shift_date,
      startTime: row.start_time,
      endTime: row.end_time,
    }));

  const coAssignedEmployeeIds = coAssignedRows
    .map((row) => row.assigned_employee_id)
    .filter((id): id is string => Boolean(id));

  const calledOffEmployeeIds = callOffRows.map((row) => row.employee_id);

  return { shift, employees, existingAssignments, coAssignedEmployeeIds, calledOffEmployeeIds };
}

export async function rankCandidatesForShift(
  shiftInstanceId: string,
): Promise<RankCandidatesResult> {
  const context = await buildEngineContext(shiftInstanceId);
  return rankCandidates(context);
}

export interface ReassignResult {
  success: boolean;
  reason?: string;
}

/** Reassigns a shift, but only to someone the ranking engine itself says is eligible. */
export async function reassignShift(
  shiftInstanceId: string,
  employeeId: string,
): Promise<ReassignResult> {
  const result = await rankCandidatesForShift(shiftInstanceId);
  const excluded = result.excluded.find((candidate) => candidate.employee.id === employeeId);
  if (excluded) return { success: false, reason: excluded.detail };
  const candidate = result.ranked.find((entry) => entry.employee.id === employeeId);
  if (!candidate)
    return { success: false, reason: "This employee is not eligible for this shift." };

  const client = createSupabaseAdminClient();
  const { error: updateError } = await client
    .from("shift_instances")
    .update({ assigned_employee_id: employeeId, status: "filled" })
    .eq("id", shiftInstanceId);
  if (updateError) throw new Error("Unable to reassign this shift.");

  const { error: logError } = await client.from("outreach_log").insert({
    shift_instance_id: shiftInstanceId,
    employee_id: employeeId,
    channel: "manual_assignment",
    message: `Assigned ${candidate.employee.fullName} to this shift via the schedule board.`,
    sent_at: new Date().toISOString(),
    response: "assigned",
    responded_at: new Date().toISOString(),
  });
  if (logError)
    throw new Error("Reassigned the shift, but failed to record it in the activity log.");

  return { success: true };
}

/** Flips a filled shift to open and logs the call-off. */
export async function reportCallOff(shiftInstanceId: string): Promise<void> {
  const client = createSupabaseAdminClient();
  const { data: shift, error: shiftError } = await client
    .from("shift_instances")
    .select("assigned_employee_id")
    .eq("id", shiftInstanceId)
    .single();
  if (shiftError || !shift) throw new Error("This shift no longer exists.");
  if (!shift.assigned_employee_id) throw new Error("This shift has no one assigned to call off.");

  const { error: callOffError } = await client.from("call_offs").insert({
    shift_instance_id: shiftInstanceId,
    employee_id: shift.assigned_employee_id,
    reason: "Reported via schedule board.",
  });
  if (callOffError) throw new Error("Unable to record the call-off.");

  const { error: updateError } = await client
    .from("shift_instances")
    .update({ status: "open", assigned_employee_id: null })
    .eq("id", shiftInstanceId);
  if (updateError) throw new Error("Unable to open the shift after recording the call-off.");
}

export interface ActivityLogEntry {
  id: string;
  timestamp: string;
  kind: "call_off" | "outreach";
  description: string;
}

export async function loadActivityLog(weekStartIso: string): Promise<ActivityLogEntry[]> {
  const facilityId = await getDemoFacilityId();
  const { start, end } = weekRange(weekStartIso);
  const client = createSupabaseAdminClient();

  const { data: shiftIdsRows, error: shiftIdsError } = await client
    .from("shift_instances")
    .select("id")
    .eq("facility_id", facilityId)
    .gte("shift_date", start)
    .lte("shift_date", end);
  if (shiftIdsError || !shiftIdsRows) throw new Error("Unable to load this week's shifts.");
  const shiftIds = shiftIdsRows.map((row) => row.id);
  if (shiftIds.length === 0) return [];

  const [{ data: callOffs, error: callOffsError }, { data: outreach, error: outreachError }] =
    await Promise.all([
      client
        .from("call_offs")
        .select(
          "id, reported_at, reason, employees(full_name), shift_instances(shift_date, start_time)",
        )
        .in("shift_instance_id", shiftIds),
      client
        .from("outreach_log")
        .select(
          "id, sent_at, message, response, employees(full_name), shift_instances(shift_date, start_time)",
        )
        .in("shift_instance_id", shiftIds),
    ]);
  if (callOffsError || !callOffs) throw new Error("Unable to load call-offs.");
  if (outreachError || !outreach) throw new Error("Unable to load outreach activity.");

  const entries: ActivityLogEntry[] = [
    ...callOffs.map((row) => ({
      id: row.id,
      timestamp: row.reported_at,
      kind: "call_off" as const,
      description: `${embeddedName(row.employees) ?? "Someone"} called off (${row.reason ?? "no reason given"}).`,
    })),
    ...outreach.map((row) => ({
      id: row.id,
      timestamp: row.sent_at,
      kind: "outreach" as const,
      description: row.response
        ? `${embeddedName(row.employees) ?? "Someone"}: ${row.response}`
        : `Texted ${embeddedName(row.employees) ?? "someone"}: "${row.message}"`,
    })),
  ];

  return entries.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
}
