// Oversight: printable shift handoff, plain-English activity log, and one-click reversals.
import {
  POSITION_LABEL,
  SHIFT_LABEL,
  SHIFT_WINDOW,
  type PositionType,
  type ShiftType,
} from "./facility";
import { db, getCoverage, logAudit, unitMap } from "./staffing.server";

// ---------------- Shift handoff report ----------------

export type HandoffShift = {
  shift: ShiftType;
  shiftLabel: string;
  units: {
    unitId: string;
    unitName: string;
    required: {
      position: PositionType;
      label: string;
      required: number;
      filled: number;
      gap: number;
    }[];
    people: {
      id: string;
      name: string;
      position: string;
      status: string;
      window: string;
      note: string | null;
      isFloat: boolean;
      homeUnit: string | null;
      floatReason: string | null;
      fillReason: string | null;
    }[];
    openSlots: { position: string; window: string }[];
    callOffs: { name: string; position: string }[];
  }[];
};

/** A one-page, printable shift-to-shift handoff for a single day. */
export async function handoffReport(date: string) {
  const { byId, units } = await unitMap();
  const [{ data: rows }, coverage] = await Promise.all([
    db
      .from("shift_assignments")
      .select(
        "id,shift,unit_id,position,employee_id,status,note,is_float,home_unit_id,float_reason,fill_reason",
      )
      .eq("shift_date", date),
    getCoverage(date, date),
  ]);
  const empIds = Array.from(
    new Set((rows ?? []).map((r) => r.employee_id).filter(Boolean)),
  ) as string[];
  const names = new Map<string, string>();
  if (empIds.length) {
    const { data: emps } = await db.from("employees").select("id,full_name").in("id", empIds);
    (emps ?? []).forEach((e) => names.set(e.id, e.full_name));
  }

  const shifts: HandoffShift[] = (["first", "second", "third"] as ShiftType[]).map((shift) => ({
    shift,
    shiftLabel: SHIFT_LABEL[shift],
    units: (units ?? []).map((u) => {
      const unitRows = (rows ?? []).filter((r) => r.shift === shift && r.unit_id === u.id);
      const cov = coverage.filter((c) => c.shift === shift && c.unitId === u.id);
      return {
        unitId: u.id as string,
        unitName: u.name as string,
        required: cov.map((c) => ({
          position: c.position,
          label: POSITION_LABEL[c.position],
          required: c.required,
          filled: c.filled,
          gap: c.gap,
        })),
        people: unitRows
          .filter((r) => r.employee_id && r.status !== "cancelled" && r.status !== "called_off")
          .map((r) => ({
            id: r.id as string,
            name: names.get(r.employee_id as string) ?? "—",
            position: POSITION_LABEL[r.position as PositionType],
            status: r.status as string,
            window: SHIFT_WINDOW[shift][r.position as PositionType].join(" – "),
            note: (r.note as string | null) ?? null,
            isFloat: Boolean(r.is_float),
            homeUnit: r.home_unit_id ? (byId.get(r.home_unit_id as string) ?? null) : null,
            floatReason: (r.float_reason as string | null) ?? null,
            fillReason: (r.fill_reason as string | null) ?? null,
          }))
          .sort((a, b) => a.position.localeCompare(b.position) || a.name.localeCompare(b.name)),
        openSlots: unitRows
          .filter((r) => r.status === "open")
          .map((r) => ({
            position: POSITION_LABEL[r.position as PositionType],
            window: SHIFT_WINDOW[shift][r.position as PositionType].join(" – "),
          })),
        callOffs: unitRows
          .filter((r) => r.status === "called_off")
          .map((r) => ({
            name: names.get(r.employee_id as string) ?? "—",
            position: POSITION_LABEL[r.position as PositionType],
          })),
      };
    }),
  }));

  const totalGaps = coverage.reduce((s, c) => s + c.gap, 0);
  return { date, shifts, totalGaps, generatedAt: new Date().toISOString() };
}

// ---------------- Activity log ----------------

const ACTION_LABEL: Record<string, string> = {
  call_off_recorded: "Call-off recorded",
  late_recorded: "Late arrival recorded",
  replacement_assigned: "Someone was put on a shift",
  auto_fill_gaps: "Open shifts filled automatically",
  shift_floated: "Someone was floated to another unit",
  shift_note_set: "Note added to a shift",
  employee_note_added: "Note added to an employee",
  employee_note_deleted: "Employee note removed",
  pto_submitted: "Vacation request submitted",
  pto_decided: "Vacation request decided",
  switch_requested: "Shift switch requested",
  switch_approved: "Shift switch approved",
  generate_rotation_schedule: "Rotation schedule generated",
  set_rotation: "Employee rotation changed",
  autopilot_settings_updated: "System settings changed",
  automation_cycle: "The system ran its hourly check",
  ai_chat_tools: "Scheduling helper carried out a request",
  applicant_stage: "Applicant moved in the hiring pipeline",
};

const UNDOABLE = new Set([
  "call_off_recorded",
  "late_recorded",
  "replacement_assigned",
  "shift_floated",
  "shift_note_set",
  "employee_note_added",
]);

function describeDetails(details: Record<string, unknown>): string {
  const parts: string[] = [];
  for (const [k, v] of Object.entries(details)) {
    if (v === null || v === undefined || v === "") continue;
    const label = k
      .replace(/([A-Z])/g, " $1")
      .replace(/_/g, " ")
      .toLowerCase();
    parts.push(`${label}: ${typeof v === "object" ? JSON.stringify(v) : String(v)}`);
  }
  return parts.join(" · ");
}

export async function activityFeed(limit = 60, opts?: { onlyUndoable?: boolean }) {
  let q = db
    .from("audit_log")
    .select("id,action,actor,entity,entity_id,details,created_at,undone_at,undone_by")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (opts?.onlyUndoable) q = q.in("action", Array.from(UNDOABLE));
  const { data } = await q;
  return (data ?? []).map((r) => ({
    id: r.id as string,
    action: r.action as string,
    label: ACTION_LABEL[r.action as string] ?? (r.action as string).replace(/_/g, " "),
    actor: r.actor as string,
    automatic: r.actor === "automation",
    entity: (r.entity as string | null) ?? null,
    entityId: (r.entity_id as string | null) ?? null,
    details: describeDetails((r.details ?? {}) as Record<string, unknown>),
    createdAt: r.created_at as string,
    undoneAt: (r.undone_at as string | null) ?? null,
    undoneBy: (r.undone_by as string | null) ?? null,
    canUndo: UNDOABLE.has(r.action as string) && !r.undone_at,
  }));
}

/** Reverse a single recorded action. Keeps the original entry, marked as undone. */
export async function undoActivity(auditId: string, actorLabel: string) {
  const { data: entry } = await db.from("audit_log").select("*").eq("id", auditId).maybeSingle();
  if (!entry) throw new Error("That activity entry no longer exists.");
  if (entry.undone_at) throw new Error("That action has already been reversed.");
  const action = entry.action as string;
  const entityId = entry.entity_id as string | null;
  const details = (entry.details ?? {}) as Record<string, unknown>;
  let outcome = "";

  if (action === "replacement_assigned" && entityId) {
    await db.from("shift_assignments").update({ status: "cancelled" }).eq("id", entityId);
    const original = details["replacedAssignment"] as string | undefined;
    if (original) {
      const { data: orig } = await db
        .from("shift_assignments")
        .select("id,employee_id")
        .eq("id", original)
        .maybeSingle();
      if (orig) {
        await db
          .from("shift_assignments")
          .update({ status: orig.employee_id ? "scheduled" : "open" })
          .eq("id", original);
      }
    }
    outcome = "The assignment was taken back off the schedule and the shift was reopened.";
  } else if (action === "call_off_recorded" && entityId) {
    await db.from("shift_assignments").update({ status: "scheduled" }).eq("id", entityId);
    const { data: ev } = await db
      .from("attendance_events")
      .select("id")
      .eq("assignment_id", entityId)
      .eq("kind", "call_off")
      .order("created_at", { ascending: false })
      .limit(1);
    if (ev?.[0]) await db.from("attendance_events").delete().eq("id", ev[0].id);
    outcome = "The call-off and its attendance point were removed and the shift was restored.";
  } else if (action === "late_recorded" && entityId) {
    const { data: ev } = await db
      .from("attendance_events")
      .select("id")
      .eq("assignment_id", entityId)
      .eq("kind", "late")
      .order("created_at", { ascending: false })
      .limit(1);
    if (ev?.[0]) await db.from("attendance_events").delete().eq("id", ev[0].id);
    outcome = "The late arrival and its half point were removed.";
  } else if (action === "shift_floated" && entityId) {
    const { data: a } = await db
      .from("shift_assignments")
      .select("id,home_unit_id,employee_id,is_float")
      .eq("id", entityId)
      .maybeSingle();
    if (!a?.home_unit_id) throw new Error("This float cannot be reversed automatically.");
    await db
      .from("shift_assignments")
      .update({ unit_id: a.home_unit_id, is_float: false, float_reason: null })
      .eq("id", entityId);
    if (a.employee_id) {
      const { data: emp } = await db
        .from("employees")
        .select("float_count")
        .eq("id", a.employee_id)
        .maybeSingle();
      await db
        .from("employees")
        .update({ float_count: Math.max(0, Number(emp?.float_count ?? 1) - 1) })
        .eq("id", a.employee_id);
      await db.from("notifications").insert({
        employee_id: a.employee_id,
        audience: "employee",
        title: "Float cancelled",
        body: `You are back on your home unit for that shift. ${actorLabel} reversed the float.`,
      });
    }
    outcome = "The employee was put back on their home unit and their float turn was given back.";
  } else if (action === "shift_note_set" && entityId) {
    await db.from("shift_assignments").update({ note: null }).eq("id", entityId);
    outcome = "The shift note was cleared.";
  } else if (action === "employee_note_added") {
    const noteId = details["noteId"] as string | undefined;
    if (!noteId) throw new Error("That note can no longer be found.");
    await db.from("employee_notes").delete().eq("id", noteId);
    outcome = "The employee note was deleted.";
  } else {
    throw new Error("That kind of action cannot be reversed automatically.");
  }

  await db
    .from("audit_log")
    .update({ undone_at: new Date().toISOString(), undone_by: actorLabel })
    .eq("id", auditId);
  await logAudit("activity_undone", actorLabel, "audit_log", auditId, {
    original: action,
    outcome,
  });
  return { ok: true, outcome };
}
