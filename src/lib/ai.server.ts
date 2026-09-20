// Scheduling coordinator: tool-calling over the live scheduling data.
import {
  addDays,
  CALL_OFF_POINTS,
  LATE_POINTS,
  POSITION_LABEL,
  PTO_MIN_NOTICE_DAYS,
  SHIFT_LABEL,
  SHIFT_WINDOW,
  startOfWeek,
  type PositionType,
  type ShiftType,
} from "./facility";
import {
  attendanceTotal,
  db,
  describeCoverageRow,
  findCandidates,
  getCoverage,
  loadActor,
  logAudit,
  openShiftsFor,
  overtimeReport,
  scheduleFor,
  summarizeCoverage,
  today,
  unitMap,
  type Actor,
} from "./staffing.server";
import {
  assignReplacementAction,
  approveSwitchAction,
  autoFillGapsAction,
  callOffAction,
  createSwitchAction,
  decidePtoAction,
  markLateAction,
  submitPtoAction,
  floatAssignmentAction,
  floatHistoryQuery,
  floatTrackerQuery,
} from "./staffing.impl.server";
import {
  createPostingAction,
  giveRecognitionAction,
  sendMessageAction,
  setCensusAction,
} from "./workforce.impl.server";
import {
  generateScheduleAction,
  runAutomationNow,
  saveAutopilotAction,
} from "./automation.impl.server";
import { getAutopilotSettings } from "./settings.server";

const ANTHROPIC_API = "https://api.anthropic.com/v1/messages";
const MODEL = "claude-sonnet-5";

type Tool = {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
  managerOnly?: boolean;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  run: (actor: Actor, args: any) => Promise<unknown>;
};

const obj = (props: Record<string, unknown>, required: string[] = []) => ({
  type: "object",
  properties: props,
  required,
  additionalProperties: false,
});
const str = (description: string) => ({ type: "string", description });

const TOOLS: Tool[] = [
  {
    name: "get_my_schedule",
    description:
      "The signed-in employee's own upcoming shifts, including unit, shift times and hours.",
    parameters: obj({
      days: { type: "number", description: "How many days ahead to look. Default 14." },
    }),
    run: async (actor, args) => {
      if (!actor.employee) return { error: "No employee record is linked to this account." };
      const days = Number(args.days ?? 14);
      const rows = await scheduleFor({
        from: today(),
        to: addDays(today(), days),
        employeeId: actor.employee.id,
      });
      return rows.map((r) => ({
        date: r.date,
        shift: r.shiftLabel,
        times: r.window,
        unit: r.unit,
        position: POSITION_LABEL[r.position],
        hours: r.hours,
        status: r.status,
      }));
    },
  },
  {
    name: "get_my_hours",
    description: "Total hours the signed-in employee is scheduled for in a given week.",
    parameters: obj({
      weekOf: str("Any date inside the week, YYYY-MM-DD. Defaults to this week."),
    }),
    run: async (actor, args) => {
      if (!actor.employee) return { error: "No employee record linked." };
      const ws = startOfWeek(String(args.weekOf ?? today()));
      const rows = await scheduleFor({
        from: ws,
        to: addDays(ws, 6),
        employeeId: actor.employee.id,
      });
      const hours = rows.filter((r) => r.status !== "cancelled").reduce((s, r) => s + r.hours, 0);
      return {
        weekStart: ws,
        scheduledHours: Number(hours.toFixed(1)),
        shifts: rows.length,
        overtime: hours > 40,
      };
    },
  },
  {
    name: "get_my_attendance_points",
    description:
      "The signed-in employee's own attendance point total and history. Never returns another employee's points.",
    parameters: obj({}),
    run: async (actor) => {
      if (!actor.employee) return { error: "No employee record linked." };
      const res = await attendanceTotal(actor.employee.id);
      return { total: res.total, events: res.events.slice(0, 10) };
    },
  },
  {
    name: "get_coworkers_on_shift",
    description: "Who else is working the signed-in employee's unit and shift on a given date.",
    parameters: obj({ date: str("Date YYYY-MM-DD") }, ["date"]),
    run: async (actor, args) => {
      if (!actor.employee) return { error: "No employee record linked." };
      const date = String(args.date);
      const mine = (await scheduleFor({ from: date, to: date, employeeId: actor.employee.id }))[0];
      if (!mine) return { message: "You are not scheduled on that date." };
      const rows = await scheduleFor({
        from: date,
        to: date,
        unitId: mine.unitId,
        shift: mine.shift,
      });
      return {
        unit: mine.unit,
        shift: mine.shiftLabel,
        times: mine.window,
        team: rows
          .filter((r) => r.employee && r.status !== "cancelled")
          .map((r) => `${r.employee} (${POSITION_LABEL[r.position]})`),
      };
    },
  },
  {
    name: "list_available_shifts",
    description:
      "Open/unfilled shifts the signed-in employee is qualified and eligible to pick up.",
    parameters: obj({}),
    run: async (actor) => {
      if (!actor.employee) return { error: "No employee record linked." };
      const rows = await openShiftsFor(actor.employee);
      return rows.map(
        (r) =>
          `${r.date} · ${r.unitName} · ${SHIFT_LABEL[r.shift]} (${SHIFT_WINDOW[r.shift][r.position].join("–")}) · ${POSITION_LABEL[r.position]} · ${r.gap} open`,
      );
    },
  },
  {
    name: "low_census_recommendations",
    description:
      "Manager only. When units are running over the PPD (care hours per resident day) goal, list who should be offered low census first, ranked by overtime hours, agency cost and seniority, without dropping any shift below required staffing. This only recommends — it never sends anyone home.",
    parameters: obj({
      from: str("Start date YYYY-MM-DD, defaults to today"),
      to: str("End date YYYY-MM-DD, defaults to a week out"),
    }),
    managerOnly: true,
    run: async (_actor, args) => {
      const { lowCensusRecommendations, lowCensusDigest } = await import("./lowcensus.server");
      const report = await lowCensusRecommendations(
        args.from ? String(args.from) : undefined,
        args.to ? String(args.to) : undefined,
      );
      return {
        summary: lowCensusDigest(report),
        totals: report.totals,
        goalPpd: report.goalPpd,
        days: report.days,
      };
    },
  },
  {
    name: "integration_status",
    description:
      "Manager only. Report the health of the outside systems the schedule depends on — payroll, time clocks, HR, credentialing, the EMR census feed and agency portals — including which ones are down, what that affects and what the system fell back to.",
    parameters: obj({}),
    managerOnly: true,
    run: async () => {
      const { integrationPosture } = await import("./integrations.server");
      return integrationPosture();
    },
  },
  {
    name: "find_shift_coverage",
    description:
      "Find qualified, rested, available employees who could cover a specific shift. Employees may only use this for their own shifts.",
    parameters: obj(
      {
        date: str("Date of the shift, YYYY-MM-DD"),
        employeeName: str("Manager only: whose shift to cover"),
      },
      ["date"],
    ),
    run: async (actor, args) => {
      const date = String(args.date);
      let assignmentId: string | null = null;
      if (actor.isManager && args.employeeName) {
        const { data } = await db
          .from("employees")
          .select("id")
          .ilike("full_name", `%${args.employeeName}%`)
          .limit(1);
        const empId = data?.[0]?.id;
        if (!empId) return { error: "No employee matched that name." };
        const rows = await scheduleFor({ from: date, to: date, employeeId: empId });
        assignmentId = rows[0]?.id ?? null;
      } else {
        if (!actor.employee) return { error: "No employee record linked." };
        const rows = await scheduleFor({ from: date, to: date, employeeId: actor.employee.id });
        assignmentId = rows[0]?.id ?? null;
      }
      if (!assignmentId) return { error: "No shift found on that date." };
      const res = await findCandidates(assignmentId, 5);
      return {
        assignmentId,
        shift: res.assignment,
        candidates: res.candidates.map((c) => ({
          employeeId: c.employeeId,
          name: c.name,
          projectedWeeklyHours: c.projectedHours,
          overtime: c.wouldBeOvertime,
          why: c.reasons,
        })),
        notEligible: res.rejected,
      };
    },
  },
  {
    name: "request_shift_switch",
    description:
      "Create a validated shift-switch request between the signed-in employee's shift and a covering employee. An approved switch means no attendance point for either employee.",
    parameters: obj(
      {
        date: str("Date of the shift"),
        coveringEmployeeName: str("Who will take the shift"),
        reason: str("Optional reason"),
      },
      ["date", "coveringEmployeeName"],
    ),
    run: async (actor, args) => {
      if (!actor.employee) return { error: "No employee record linked." };
      const date = String(args.date);
      const rows = await scheduleFor({ from: date, to: date, employeeId: actor.employee.id });
      const assignment = rows[0];
      if (!assignment) return { error: "You are not scheduled on that date." };
      const { data } = await db
        .from("employees")
        .select("id")
        .ilike("full_name", `%${args.coveringEmployeeName}%`)
        .limit(1);
      const coveringId = data?.[0]?.id;
      if (!coveringId) return { error: "That employee was not found." };
      return createSwitchAction(actor.userId, assignment.id, coveringId, String(args.reason ?? ""));
    },
  },
  {
    name: "submit_pto_request",
    description: `Submit a vacation/PTO request for the signed-in employee. Requests must be more than one month (${PTO_MIN_NOTICE_DAYS} days) in advance or the policy rejects them.`,
    parameters: obj(
      { startDate: str("YYYY-MM-DD"), endDate: str("YYYY-MM-DD"), reason: str("Optional reason") },
      ["startDate", "endDate"],
    ),
    run: async (actor, args) =>
      submitPtoAction(
        actor.userId,
        String(args.startDate),
        String(args.endDate),
        String(args.reason ?? ""),
      ),
  },
  {
    name: "call_off_shift",
    description:
      "Record a call-off for the signed-in employee's shift. Results in 1 attendance point and immediately starts a replacement search.",
    parameters: obj(
      { date: str("Date of the shift being called off"), note: str("Optional note") },
      ["date"],
    ),
    run: async (actor, args) => {
      if (!actor.employee) return { error: "No employee record linked." };
      const date = String(args.date);
      const rows = await scheduleFor({ from: date, to: date, employeeId: actor.employee.id });
      if (!rows[0]) return { error: "You are not scheduled on that date." };
      const res = await callOffAction(actor.userId, rows[0].id, String(args.note ?? ""));
      return {
        points: res.points,
        message:
          "You have been recorded as calling off for this shift. This will result in 1 attendance point according to the attendance policy.",
        topCandidates: res.candidates.map((c) => c.name),
      };
    },
  },
  // ---------- Manager tools ----------
  {
    name: "get_coverage",
    description:
      "Staffing coverage by unit, shift and position for a date range. Shows required vs filled and any gaps.",
    managerOnly: true,
    parameters: obj(
      { from: str("YYYY-MM-DD"), to: str("YYYY-MM-DD"), onlyGaps: { type: "boolean" } },
      ["from"],
    ),
    run: async (_a, args) => {
      const from = String(args.from);
      const to = String(args.to ?? from);
      const rows = await getCoverage(from, to);
      const filtered = args.onlyGaps ? rows.filter((r) => r.gap > 0) : rows;
      return {
        summary: summarizeCoverage(rows),
        rows: filtered.slice(0, 120).map(describeCoverageRow),
      };
    },
  },
  {
    name: "list_uncovered_shifts",
    description:
      "Every unit/shift/position that is below its required staffing level in the next N days.",
    managerOnly: true,
    parameters: obj({ days: { type: "number" } }),
    run: async (_a, args) => {
      const days = Number(args.days ?? 7);
      const rows = await getCoverage(today(), addDays(today(), days));
      return rows.filter((r) => r.gap > 0).map(describeCoverageRow);
    },
  },
  {
    name: "list_call_offs",
    description: "Recent and upcoming call-offs with the affected unit and shift.",
    managerOnly: true,
    parameters: obj({ days: { type: "number" } }),
    run: async (_a, args) => {
      const days = Number(args.days ?? 7);
      const rows = await scheduleFor({ from: addDays(today(), -days), to: addDays(today(), days) });
      return rows
        .filter((r) => r.status === "called_off")
        .map(
          (r) =>
            `${r.date} · ${r.employee} · ${r.unit} · ${r.shiftLabel} · ${POSITION_LABEL[r.position]} (assignment ${r.id})`,
        );
    },
  },
  {
    name: "get_overtime_report",
    description: "Weekly hours per employee, who is in overtime and who is approaching it.",
    managerOnly: true,
    parameters: obj({ weekOf: str("Any date in the week") }),
    run: async (_a, args) => {
      const rep = await overtimeReport(startOfWeek(String(args.weekOf ?? today())));
      return {
        weekStart: rep.weekStart,
        totalScheduledHours: rep.totalScheduledHours,
        overtimeHours: rep.overtimeHours,
        inOvertime: rep.inOvertime.map((r) => `${r.name} (${r.unit}, ${r.hours}h)`),
        approaching: rep.approachingOvertime.map((r) => `${r.name} (${r.hours}h)`),
      };
    },
  },
  {
    name: "get_employee_attendance",
    description: "Attendance point total for a named employee. Managers and administrators only.",
    managerOnly: true,
    parameters: obj({ employeeName: str("Employee name") }, ["employeeName"]),
    run: async (_a, args) => {
      const { data } = await db
        .from("employees")
        .select("id,full_name")
        .ilike("full_name", `%${args.employeeName}%`)
        .limit(1);
      const emp = data?.[0];
      if (!emp) return { error: "No employee matched that name." };
      const res = await attendanceTotal(emp.id);
      return { employee: emp.full_name, points: res.total, recent: res.events.slice(0, 5) };
    },
  },
  {
    name: "who_is_scheduled",
    description: "Full roster for a date, optionally filtered by unit or shift.",
    managerOnly: true,
    parameters: obj(
      {
        date: str("YYYY-MM-DD"),
        unit: str("Birch, Cedar or Dogwood"),
        shift: str("first, second or third"),
      },
      ["date"],
    ),
    run: async (_a, args) => {
      const { units } = await unitMap();
      const unitId = args.unit
        ? units.find((u) => u.name.toLowerCase() === String(args.unit).toLowerCase())?.id
        : null;
      const rows = await scheduleFor({
        from: String(args.date),
        to: String(args.date),
        unitId: unitId ?? null,
        shift: (args.shift as ShiftType) ?? null,
      });
      return rows
        .filter((r) => r.employee)
        .map(
          (r) =>
            `${r.unit} · ${r.shiftLabel} · ${POSITION_LABEL[r.position]} · ${r.employee} (${r.status})`,
        );
    },
  },
  {
    name: "assign_replacement",
    description:
      "Assign a specific employee to cover an open or called-off shift. High impact: confirm with the manager first.",
    managerOnly: true,
    parameters: obj(
      {
        assignmentId: str("Assignment id from find_shift_coverage or list_call_offs"),
        employeeId: str("Employee id"),
      },
      ["assignmentId", "employeeId"],
    ),
    run: async (actor, args) =>
      assignReplacementAction(actor.userId, String(args.assignmentId), String(args.employeeId)),
  },
  {
    name: "auto_fill_coverage_gaps",
    description:
      "Optimize the schedule: open every understaffed slot in the range and assign the best-ranked qualified employee, minimizing unnecessary overtime. High impact — confirm before running.",
    managerOnly: true,
    parameters: obj({ from: str("YYYY-MM-DD"), to: str("YYYY-MM-DD") }, ["from", "to"]),
    run: async (actor, args) =>
      autoFillGapsAction(actor.userId, String(args.from), String(args.to)),
  },
  {
    name: "list_pto_requests",
    description: "Pending and recent vacation requests, with their request ids.",
    managerOnly: true,
    parameters: obj({}),
    run: async () => {
      const { data } = await db
        .from("pto_requests")
        .select("*")
        .order("submitted_at", { ascending: false })
        .limit(20);
      const ids = (data ?? []).map((p) => p.employee_id);
      const names = new Map<string, string>();
      if (ids.length) {
        const { data: emps } = await db.from("employees").select("id,full_name").in("id", ids);
        (emps ?? []).forEach((e) => names.set(e.id, e.full_name));
      }
      return (data ?? []).map((p) => ({
        id: p.id,
        employee: names.get(p.employee_id) ?? "",
        start: p.start_date,
        end: p.end_date,
        status: p.status,
        autoRejected: p.auto_rejected,
      }));
    },
  },
  // ---------- Manager "do it for me" action tools ----------
  {
    name: "record_call_off_for_employee",
    description:
      "Record a call-off on behalf of an employee who called in by phone. Removes them from that shift, applies 1 attendance point, opens the shift and starts a replacement search. Use this when a scheduler says someone called off.",
    managerOnly: true,
    parameters: obj(
      {
        employeeName: str("Employee who called off"),
        employeeId: str(
          "Exact employee id — use this instead of the name once you have confirmed which person.",
        ),
        date: str("Date of the shift, YYYY-MM-DD"),
        note: str("Reason they gave, optional"),
      },
      ["employeeName", "date"],
    ),
    run: async (actor, args) => {
      const found = await resolveEmployee(args);
      if (!("employee" in found)) return found;
      const emp = found.employee;
      const rows = await scheduleFor({
        from: String(args.date),
        to: String(args.date),
        employeeId: emp.id,
      });
      const shift = rows.find((r) => r.status === "scheduled") ?? rows[0];
      if (!shift) return { error: `${emp.full_name} is not scheduled on ${args.date}.` };
      const res = await callOffAction(
        actor.userId,
        shift.id,
        String(args.note ?? "Called off by phone"),
      );
      return {
        employee: emp.full_name,
        removedFrom: `${shift.date} · ${shift.unit} · ${shift.shiftLabel} · ${POSITION_LABEL[shift.position]}`,
        attendancePointsNow: res.points,
        replacementCandidates: res.candidates.map((c) => ({
          employeeId: c.employeeId,
          name: c.name,
          overtime: c.wouldBeOvertime,
        })),
        assignmentId: shift.id,
      };
    },
  },
  {
    name: "mark_employee_late",
    description:
      "Record that an employee arrived late for a shift. More than 7 minutes late is 0.5 attendance points; more than 2 hours becomes a call-off.",
    managerOnly: true,
    parameters: obj(
      {
        employeeName: str("Employee name"),
        employeeId: str(
          "Exact employee id — use this instead of the name once you have confirmed which person.",
        ),
        date: str("Shift date, YYYY-MM-DD"),
        minutesLate: { type: "number", description: "Minutes past shift start" },
      },
      ["employeeName", "date", "minutesLate"],
    ),
    run: async (actor, args) => {
      const found = await resolveEmployee(args);
      if (!("employee" in found)) return found;
      const emp = found.employee;
      const rows = await scheduleFor({
        from: String(args.date),
        to: String(args.date),
        employeeId: emp.id,
      });
      if (!rows[0]) return { error: `${emp.full_name} is not scheduled on ${args.date}.` };
      const res = await markLateAction(actor.userId, rows[0].id, Number(args.minutesLate));
      return { employee: emp.full_name, ...res };
    },
  },
  {
    name: "decide_pto_request",
    description:
      "Approve or decline a vacation request. Use list_pto_requests first to get the request id.",
    managerOnly: true,
    parameters: obj(
      {
        requestId: str("PTO request id"),
        approve: { type: "boolean" },
        note: str("Note for the employee, optional"),
      },
      ["requestId", "approve"],
    ),
    run: async (actor, args) =>
      decidePtoAction(
        actor.userId,
        String(args.requestId),
        Boolean(args.approve),
        String(args.note ?? ""),
      ),
  },
  {
    name: "list_shift_switches",
    description: "Shift switch requests with their ids, participants and validation status.",
    managerOnly: true,
    parameters: obj({}),
    run: async () => {
      const { data } = await db
        .from("shift_switches")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(20);
      const ids = Array.from(new Set((data ?? []).flatMap((s) => [s.requester_id, s.covering_id])));
      const names = new Map<string, string>();
      if (ids.length) {
        const { data: emps } = await db.from("employees").select("id,full_name").in("id", ids);
        (emps ?? []).forEach((e) => names.set(e.id, e.full_name));
      }
      return (data ?? []).map((s) => ({
        id: s.id,
        requester: names.get(s.requester_id) ?? "",
        covering: names.get(s.covering_id) ?? "",
        status: s.status,
        coveringConfirmed: s.covering_confirmed,
        notes: s.validation_notes,
      }));
    },
  },
  {
    name: "decide_shift_switch",
    description:
      "Approve or decline a shift switch request. Approving reassigns the shift with no attendance point for either employee.",
    managerOnly: true,
    parameters: obj({ switchId: str("Switch request id"), approve: { type: "boolean" } }, [
      "switchId",
      "approve",
    ]),
    run: async (actor, args) =>
      approveSwitchAction(actor.userId, String(args.switchId), Boolean(args.approve)),
  },
  {
    name: "assign_employee_to_shift",
    description:
      "Put a named employee onto an open or uncovered shift by date, unit, shift and position — the plain-language way to fill a hole in the schedule.",
    managerOnly: true,
    parameters: obj(
      {
        employeeName: str("Who to schedule"),
        employeeId: str(
          "Exact employee id — use this instead of the name once you have confirmed which person.",
        ),
        date: str("YYYY-MM-DD"),
        unit: str("Birch, Cedar or Dogwood"),
        shift: str("first, second or third"),
        position: str("nurse or cna — defaults to the employee's position"),
      },
      ["employeeName", "date", "unit", "shift"],
    ),
    run: async (actor, args) => {
      const found = await resolveEmployee(args);
      if (!("employee" in found)) return found;
      const emp = found.employee;
      const { units } = await unitMap();
      const unit = units.find((u) => u.name.toLowerCase() === String(args.unit).toLowerCase());
      if (!unit) return { error: "Unit must be Birch, Cedar or Dogwood." };
      const shift = String(args.shift) as ShiftType;
      const position =
        (String(args.position ?? emp.position) as PositionType) ?? (emp.position as PositionType);
      const date = String(args.date);
      const { data: open } = await db
        .from("shift_assignments")
        .select("id")
        .eq("shift_date", date)
        .eq("unit_id", unit.id)
        .eq("shift", shift)
        .eq("position", position)
        .in("status", ["open", "called_off"])
        .limit(1);
      let assignmentId = open?.[0]?.id ?? null;
      if (!assignmentId) {
        const { data: created, error } = await db
          .from("shift_assignments")
          .insert({
            shift_date: date,
            unit_id: unit.id,
            shift,
            position,
            status: "open",
            hours: position === "nurse" ? 8.5 : 8,
            note: "Added by the AI coordinator at a manager's request",
          })
          .select("id")
          .maybeSingle();
        if (error) return { error: error.message };
        assignmentId = created?.id ?? null;
      }
      if (!assignmentId) return { error: "Could not create the shift." };
      const res = await assignReplacementAction(actor.userId, assignmentId, emp.id);
      return {
        ...res,
        employee: emp.full_name,
        date,
        unit: unit.name,
        shift: SHIFT_LABEL[shift],
        position: POSITION_LABEL[position],
      };
    },
  },
  {
    name: "remove_employee_from_shift",
    description:
      "Take an employee off a shift without an attendance point (schedule correction, approved change, cancelled shift). Use record_call_off_for_employee instead when they actually called off.",
    managerOnly: true,
    parameters: obj(
      {
        employeeName: str("Employee name"),
        employeeId: str(
          "Exact employee id — use this instead of the name once you have confirmed which person.",
        ),
        date: str("YYYY-MM-DD"),
        reason: str("Why, optional"),
      },
      ["employeeName", "date"],
    ),
    run: async (actor, args) => {
      const found = await resolveEmployee(args);
      if (!("employee" in found)) return found;
      const emp = found.employee;
      const rows = await scheduleFor({
        from: String(args.date),
        to: String(args.date),
        employeeId: emp.id,
      });
      const shift = rows[0];
      if (!shift) return { error: `${emp.full_name} is not scheduled on ${args.date}.` };
      await db
        .from("shift_assignments")
        .update({
          employee_id: null,
          status: "open",
          note: String(args.reason ?? "Removed by manager via AI coordinator"),
        })
        .eq("id", shift.id);
      await db.from("notifications").insert({
        employee_id: emp.id,
        audience: "employee",
        title: "Shift removed",
        body: `You were removed from the ${shift.shiftLabel.toLowerCase()} on ${shift.date} (${shift.unit}). No attendance point was applied.`,
      });
      await logAudit(
        "shift_removed",
        `${actor.profile?.full_name ?? actor.profile?.email ?? "user"} (${actor.role})`,
        "shift_assignment",
        shift.id,
        { employee: emp.full_name },
      );
      return {
        removed: `${emp.full_name} from ${shift.date} · ${shift.unit} · ${shift.shiftLabel}`,
        shiftIsNowOpen: true,
        assignmentId: shift.id,
      };
    },
  },
  {
    name: "send_message_to_staff",
    description:
      "Send a message or announcement to one employee or broadcast to everyone / all managers.",
    managerOnly: true,
    parameters: obj(
      {
        employeeName: str("Recipient name, or leave blank to broadcast"),
        employeeId: str(
          "Exact employee id — use this instead of the name once you have confirmed which person.",
        ),
        audience: str("all, employee or manager — used when broadcasting"),
        subject: str("Subject line"),
        body: str("Message body"),
      },
      ["subject", "body"],
    ),
    run: async (actor, args) => {
      let recipientId: string | null = null;
      if (args.employeeName) {
        const found = await resolveEmployee(args);
        if (!("employee" in found)) return found;
        recipientId = found.employee.id;
      }
      await sendMessageAction(actor.userId, {
        recipientId,
        audience: recipientId ? "employee" : String(args.audience ?? "all"),
        subject: String(args.subject),
        body: String(args.body),
      });
      return {
        sent: true,
        to: recipientId ? String(args.employeeName) : `broadcast (${args.audience ?? "all"})`,
      };
    },
  },
  {
    name: "give_recognition",
    description: "Send a recognition/kudos badge with reward points to an employee.",
    parameters: obj(
      {
        employeeName: str("Who to recognize"),
        employeeId: str(
          "Exact employee id — use this instead of the name once you have confirmed which person.",
        ),
        badge: str("Badge, e.g. Reliability, Teamwork, Above and Beyond"),
        message: str("Why"),
      },
      ["employeeName", "message"],
    ),
    run: async (actor, args) => {
      const found = await resolveEmployee(args);
      if (!("employee" in found)) return found;
      const emp = found.employee;
      await giveRecognitionAction(
        actor.userId,
        emp.id,
        String(args.badge ?? "Teamwork"),
        String(args.message),
      );
      return { recognized: emp.full_name };
    },
  },
  {
    name: "set_census",
    description:
      "Record the resident census for a unit on a date, which drives HPPD and labor budget tracking.",
    managerOnly: true,
    parameters: obj(
      { date: str("YYYY-MM-DD"), unit: str("Birch, Cedar or Dogwood"), census: { type: "number" } },
      ["date", "unit", "census"],
    ),
    run: async (actor, args) => {
      const { units } = await unitMap();
      const unit = units.find((u) => u.name.toLowerCase() === String(args.unit).toLowerCase());
      if (!unit) return { error: "Unit must be Birch, Cedar or Dogwood." };
      await setCensusAction(actor.userId, String(args.date), unit.id, Number(args.census));
      return { ok: true, unit: unit.name, date: String(args.date), census: Number(args.census) };
    },
  },
  {
    name: "open_job_posting",
    description: "Create a job requisition when the facility is short staffed in a position.",
    managerOnly: true,
    parameters: obj(
      {
        title: str("Job title"),
        position: str("nurse or cna"),
        shift: str("first, second or third — optional"),
        unit: str("Birch, Cedar or Dogwood — optional"),
        payRange: str("e.g. $18–$23/hr"),
        description: str("Short description"),
        openings: { type: "number" },
      },
      ["title", "position"],
    ),
    run: async (actor, args) => {
      const { units } = await unitMap();
      const unit = args.unit
        ? units.find((u) => u.name.toLowerCase() === String(args.unit).toLowerCase())
        : null;
      const posting = await createPostingAction(actor.userId, {
        title: String(args.title),
        position: String(args.position) as PositionType,
        shift: (args.shift as ShiftType) ?? null,
        unitId: unit?.id ?? null,
        payRange: String(args.payRange ?? "Competitive"),
        description: String(args.description ?? ""),
        openings: Number(args.openings ?? 1),
      });
      return posting;
    },
  },
  {
    name: "run_automation_cycle",
    description:
      "Run the autonomous cycle now: extend the schedule, fill coverage gaps, refresh alerts, invite staff to open shifts, close out past shifts and award reliability bonuses.",
    managerOnly: true,
    parameters: obj({}),
    run: async (actor) => runAutomationNow(actor.userId),
  },
  {
    name: "generate_future_schedule",
    description:
      "Generate the rotation schedule for the next N weeks (4 days/week, every other weekend).",
    managerOnly: true,
    parameters: obj({
      weeks: { type: "number", description: "How many weeks ahead, default 4" },
      fromDate: str("Start date, optional"),
    }),
    run: async (actor, args) =>
      generateScheduleAction(
        actor.userId,
        Number(args.weeks ?? 4),
        args.fromDate ? String(args.fromDate) : undefined,
      ),
  },
  {
    name: "who_floats_next",
    description:
      "Show the float rotation order — who is up next to float. Scored by fewest floats, longest time since their last float, and seniority (senior staff are protected).",
    managerOnly: true,
    parameters: obj({ unitId: str("Optional unit id"), position: str("nurse or cna, optional") }),
    run: async (actor, args) =>
      floatTrackerQuery(actor.userId, {
        unitId: args.unitId ? String(args.unitId) : null,
        position: args.position ? (String(args.position) as "nurse" | "cna") : null,
      }),
  },
  {
    name: "float_employee",
    description:
      "Float a scheduled person to another unit for that shift. Always give a reason; it is recorded and shown to the employee.",
    managerOnly: true,
    parameters: obj({
      assignmentId: str("The shift assignment id to move"),
      toUnitId: str("Unit id to move them to"),
      reason: str("coverage, call_off, census, rotation, request or manual"),
      note: str("Optional extra detail for the float log"),
    }),
    run: async (actor, args) =>
      floatAssignmentAction(
        actor.userId,
        String(args.assignmentId),
        String(args.toUnitId),
        args.reason ? String(args.reason) : "coverage",
        args.note ? String(args.note) : undefined,
      ),
  },
  {
    name: "float_history",
    description: "Recent floats with the reason each person was moved.",
    managerOnly: false,
    parameters: obj({ limit: { type: "number", description: "How many entries, default 20" } }),
    run: async (actor, args) =>
      floatHistoryQuery(actor.userId, undefined, Number(args.limit ?? 20)),
  },
  {
    name: "autopilot_status",
    description:
      "Report whether the background scheduling autopilot is running, its call-off cushion and last run time.",
    managerOnly: true,
    parameters: obj({}),
    run: async () => getAutopilotSettings(),
  },
  {
    name: "set_autopilot",
    description:
      "Turn the background autopilot on or off, or change the call-off cushion (extra staff kept above the minimum ratio) and float rotation weights.",
    managerOnly: true,
    parameters: obj({
      enabled: { type: "boolean", description: "Turn autopilot on or off" },
      coverageBuffer: {
        type: "number",
        description: "Extra staff per unit/shift above minimum, 0-5",
      },
      reason: str("Why it was paused, optional"),
    }),
    run: async (actor, args) =>
      saveAutopilotAction(actor.userId, {
        ...(args.enabled === undefined ? {} : { autopilotEnabled: Boolean(args.enabled) }),
        ...(args.coverageBuffer === undefined
          ? {}
          : { coverageBuffer: Number(args.coverageBuffer) }),
        ...(args.reason === undefined ? {} : { pausedReason: String(args.reason) }),
      }),
  },
  {
    name: "find_people",
    description:
      "Look up staff by full or partial name (or first name only). Use this FIRST whenever a name could match more than one person, so you can ask the user which one they mean. Returns employee ids to use in other tools.",
    managerOnly: true,
    parameters: obj({ name: str("Full or partial name, e.g. 'Sarah'") }, ["name"]),
    run: async (_actor, args) => {
      const rows = await employeeMatches(String(args.name));
      const { units } = await unitMap();
      return rows.slice(0, 15).map((r) => ({
        employeeId: r.id,
        name: r.full_name,
        position: POSITION_LABEL[r.position as PositionType] ?? r.position,
        unit: units.find((u) => u.id === r.primary_unit_id)?.name ?? "—",
        shift: SHIFT_LABEL[r.scheduled_shift as ShiftType] ?? "",
      }));
    },
  },
];

type EmployeeHit = { id: string; full_name: string; position: string };
type Resolved =
  { employee: EmployeeHit } | { error: string; needsClarification?: boolean; matches?: unknown[] };

async function employeeMatches(term: string) {
  const parts = term.trim().split(/\s+/).filter(Boolean);
  const { data } = await db
    .from("employees")
    .select("id,full_name,position,scheduled_shift,primary_unit_id")
    .eq("is_active", true)
    .ilike("full_name", `%${parts[0] ?? term}%`)
    .limit(25);
  let rows = data ?? [];
  if (parts.length > 1) {
    const all = term.trim().toLowerCase();
    const tight = rows.filter((r) => String(r.full_name).toLowerCase().includes(all));
    if (tight.length) rows = tight;
  }
  return rows;
}

// Resolve a person by id or name. Never guesses between two people with the same
// first name — it hands the options back so the assistant can ask which one.
async function resolveEmployee(args: {
  employeeName?: unknown;
  employeeId?: unknown;
}): Promise<Resolved> {
  if (args.employeeId) {
    const { data } = await db
      .from("employees")
      .select("id,full_name,position")
      .eq("id", String(args.employeeId))
      .maybeSingle();
    if (!data) return { error: "No employee with that id." };
    return { employee: data as EmployeeHit };
  }
  const term = String(args.employeeName ?? "").trim();
  if (!term) return { error: "Give me the person's name." };
  const rows = await employeeMatches(term);
  if (!rows.length)
    return {
      error: `No active employee matched "${term}". Ask the user to double-check the spelling.`,
    };

  const exact = rows.filter((r) => String(r.full_name).toLowerCase() === term.toLowerCase());
  if (exact.length === 1) return { employee: exact[0] as EmployeeHit };

  if (rows.length > 1) {
    const { units } = await unitMap();
    const unitName = (id: string | null) => units.find((u) => u.id === id)?.name ?? "—";
    return {
      error: `More than one active employee matches "${term}". Ask the user which one before doing anything — give them this list (last names, position, unit and shift) and wait for their answer. Then call the tool again with employeeId.`,
      needsClarification: true,
      matches: rows.slice(0, 10).map((r) => ({
        employeeId: r.id,
        name: r.full_name,
        position: POSITION_LABEL[r.position as PositionType] ?? r.position,
        unit: unitName((r as { primary_unit_id: string | null }).primary_unit_id ?? null),
        shift: SHIFT_LABEL[(r as { scheduled_shift: ShiftType }).scheduled_shift] ?? "",
      })),
    };
  }
  return { employee: rows[0] as EmployeeHit };
}

function systemPrompt(actor: Actor) {
  const base = `You are the CoverGrid staffing coordinator for Birchwood Care Center, a healthcare facility with three units: Birch, Cedar and Dogwood.

Shift structure:
- CNA shifts: first 6:00 AM–2:00 PM, second 2:00 PM–10:00 PM, third 10:00 PM–6:00 AM (one continuous 8-hour shift across midnight).
- Nurse shifts run 30 minutes longer: first 6:00 AM–2:30 PM, second 2:00 PM–10:30 PM, third 10:00 PM–6:30 AM.

Required staffing per shift:
- CNAs first: Birch 4, Cedar 4, Dogwood 2 (10 total). Second: 3/3/3 (9 total). Third: 2/2/2 (6 total).
- Nurses first: Birch 2, Cedar 3, Dogwood 2 (7 total). Second: 2/3/2 (7 total). Third: Birch 1, Cedar 2, Dogwood 1 (4 total).

Attendance policy: arriving more than 7 minutes after shift start = late = ${LATE_POINTS} points. Arriving more than 2 hours after shift start = call-off = ${CALL_OFF_POINTS} point. An approved shift switch is NOT a call-off and carries no point for either employee.
Vacation/PTO must be requested more than one month in advance or it is rejected.

Priorities, in order: required staffing levels are never sacrificed to reduce overtime; qualifications and availability are respected; rest periods and overlapping shifts are avoided; overtime is minimized but allowed when needed to stay staffed, and distributed fairly.

HOW YOU WORK — read this carefully:
1. Understand intent first. People type fast, in shorthand, with typos and phone-call slang ("sarah called in", "put deb on cedar 2nd tmrw", "who's short tonight"). Work out what they mean, restate it in one short line only when it is genuinely unclear, and then do it.
2. ASK BACK when anything is ambiguous. Never guess between two real people, two dates, two units or two shifts. If a name could be more than one person, call find_people (or read the "matches" list a tool hands back), then ask a short, specific question: "Two Sarahs are active — Sarah Bennett (CNA, Cedar, 2nd) or Sarah Poole (Nurse, Birch, 1st)?" Wait for the answer, then act using the employeeId. The same goes for a missing date ("today or tomorrow?"), missing shift, or an unclear instruction.
3. Ask ONE clear question at a time, in plain language, with the options listed. Never dump a form or a wall of choices.
4. Resolve what you safely can on your own: "today", "tonight", "tomorrow", "this weekend", "next Tuesday" are dates you can work out — don't ask about those. Only ask when getting it wrong would change who works or who gets a point.
5. Chain tools. A single request may need several steps (find the person, check the schedule, remove them, find a replacement, message the unit). Do the whole job, then report what you did in one short paragraph or a few bullets.
6. Never invent data. Every fact about people, shifts, points or coverage comes from a tool call. If a tool returns an error, say plainly what failed and what you need.
7. Answer general questions too — policy, math, "how do I…", drafting a message, explaining a decision. You are a full assistant, not just a form filler.
8. Confirm before anything destructive or point-bearing (call-offs, attendance points, removals, mass messages) unless the user clearly already told you to do it.
9. Be brief and human. No jargon, no talk of "AI", "tools" or "databases" — say "I checked the schedule".

Always use your tools to look up live data instead of guessing. Today is ${today()}.`;

  if (actor.isManager) {
    return `${base}

You are speaking with ${actor.profile?.full_name ?? "a manager"} (${actor.role}). They may see facility-wide staffing, attendance, overtime and requests. For high-impact actions (assigning replacements, auto-filling gaps) explain the recommendation and ask for confirmation before running the tool, unless the manager clearly already asked you to execute it.`;
  }
  return `${base}

You are speaking with ${actor.employee?.full_name ?? actor.profile?.full_name ?? "an employee"}, an employee (${actor.employee ? POSITION_LABEL[actor.employee.position as PositionType] : "unlinked account"}).
STRICT PRIVACY: you may only reveal information about this employee. Never disclose another employee's attendance points, personal information or records, and never reveal manager-only staffing analytics. If asked, politely explain you can only share their own information and suggest they contact a manager.`;
}

type AnthropicBlock =
  | { type: "text"; text: string }
  | { type: "tool_use"; id: string; name: string; input: unknown }
  | { type: "tool_result"; tool_use_id: string; content: string };

type AnthropicMsg = { role: "user" | "assistant"; content: string | AnthropicBlock[] };

export async function runAssistant(userId: string, message: string) {
  const actor = await loadActor(userId);
  const apiKey = process.env["ANTHROPIC_API_KEY"];
  if (!apiKey) throw new Error("The AI coordinator is not configured yet.");

  const available = TOOLS.filter((t) => (t.managerOnly ? actor.isManager : true));
  const toolSpec = available.map((t) => ({
    name: t.name,
    description: t.description,
    input_schema: t.parameters,
  }));

  const { data: history } = await db
    .from("chat_messages")
    .select("role,content")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(12);
  const prior: AnthropicMsg[] = (history ?? [])
    .reverse()
    .map((m) => ({ role: m.role as "user" | "assistant", content: m.content ?? "" }));

  const messages: AnthropicMsg[] = [...prior, { role: "user", content: message }];

  await db.from("chat_messages").insert({ user_id: userId, role: "user", content: message });

  const usedTools: string[] = [];
  let final = "";

  const callAnthropic = async (body: Record<string, unknown>) => {
    const res = await fetch(ANTHROPIC_API, {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const text = await res.text();
      console.error(`Anthropic API error [${res.status}]: ${text}`);
      if (res.status === 429)
        throw new Error("The assistant is busy right now. Please try again in a moment.");
      if (res.status === 402 || res.status === 403)
        throw new Error("AI credits are exhausted. Add credits to keep using the assistant.");
      throw new Error(`Assistant request failed [${res.status}]: ${text}`);
    }
    return (await res.json()) as { content: AnthropicBlock[]; stop_reason: string };
  };

  for (let turn = 0; turn < 16; turn++) {
    const response = await callAnthropic({
      model: MODEL,
      max_tokens: 2048,
      system: systemPrompt(actor),
      messages,
      tools: toolSpec,
    });
    if (!response.content?.length) throw new Error("The assistant returned an empty response.");
    messages.push({ role: "assistant", content: response.content });

    const calls = response.content.filter(
      (block): block is Extract<AnthropicBlock, { type: "tool_use" }> => block.type === "tool_use",
    );
    if (calls.length === 0) {
      final = response.content
        .filter(
          (block): block is Extract<AnthropicBlock, { type: "text" }> => block.type === "text",
        )
        .map((block) => block.text)
        .join("\n")
        .trim();
      break;
    }

    const results: AnthropicBlock[] = [];
    for (const call of calls) {
      const tool = available.find((t) => t.name === call.name);
      let result: unknown;
      if (!tool) {
        result = { error: "You are not authorized to use that capability." };
      } else {
        try {
          result = await tool.run(actor, call.input);
          usedTools.push(tool.name);
        } catch (err) {
          result = { error: err instanceof Error ? err.message : "Tool failed." };
        }
      }
      results.push({ type: "tool_result", tool_use_id: call.id, content: JSON.stringify(result) });
    }
    messages.push({ role: "user", content: results });
  }

  if (!final) {
    // Ran out of tool turns (or the model answered with tool calls only).
    // Force a plain-language answer using everything gathered so far.
    messages.push({
      role: "user",
      content:
        "Stop using tools now. Reply in plain language with what you found and did, and state clearly anything you could not complete.",
    });
    const wrap = await callAnthropic({
      model: MODEL,
      max_tokens: 2048,
      system: systemPrompt(actor),
      messages,
    });
    final = (wrap.content ?? [])
      .filter((block): block is Extract<AnthropicBlock, { type: "text" }> => block.type === "text")
      .map((block) => block.text)
      .join("\n")
      .trim();
  }
  if (!final) final = "I wasn't able to finish that request. Could you rephrase it?";

  await db.from("chat_messages").insert({ user_id: userId, role: "assistant", content: final });
  if (usedTools.length)
    await logAudit(
      "ai_chat_tools",
      `${actor.profile?.full_name ?? "user"} (${actor.role})`,
      "chat",
      null,
      { usedTools },
    );
  return { reply: final, usedTools };
}

export async function chatHistory(userId: string) {
  const { data } = await db
    .from("chat_messages")
    .select("id,role,content,created_at")
    .eq("user_id", userId)
    .order("created_at")
    .limit(60);
  return data ?? [];
}

export async function clearChat(userId: string) {
  await db.from("chat_messages").delete().eq("user_id", userId);
  return { ok: true };
}
