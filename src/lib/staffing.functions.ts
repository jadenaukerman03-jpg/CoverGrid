import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  approveSwitchAction,
  assignReplacementAction,
  autoFillGapsAction,
  callOffAction,
  createSwitchAction,
  dashboardData,
  decidePtoAction,
  addEmployeeNoteAction,
  deleteEmployeeNoteAction,
  employeeDirectory,
  employeeProfileQuery,
  floatAssignmentAction,
  floatHistoryQuery,
  floatTrackerQuery,
  setAssignmentNoteAction,
  facilityConfig,
  markLateAction,
  meOverview,
  myAttendance,
  replacementSearch,
  respondSwitchAction,
  scheduleQuery,
  setPpdGoalAction,
  submitPtoAction,
  validateSwitchQuery,
} from "./staffing.impl.server";

export const getFacilityConfig = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => facilityConfig(context.userId));

export const setPpdGoalFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ goal: z.number().min(1).max(12) }).parse(d))
  .handler(async ({ context, data }) => setPpdGoalAction(context.userId, data.goal));

export const getMeOverview = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => meOverview(context.userId));

export const getMyAttendance = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => myAttendance(context.userId));

export const getDashboard = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ date: z.string().optional() }).parse(d ?? {}))
  .handler(async ({ context, data }) => dashboardData(context.userId, data.date));

export const getSchedule = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        from: z.string(),
        to: z.string(),
        unitId: z.string().nullable().optional(),
        position: z.enum(["nurse", "qma", "cna"]).nullable().optional(),
        shift: z.enum(["first", "second", "third"]).nullable().optional(),
        employeeId: z.string().nullable().optional(),
      })
      .parse(d),
  )
  .handler(async ({ context, data }) => scheduleQuery(context.userId, data));

export const getEmployees = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => employeeDirectory(context.userId));

export const findReplacements = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ assignmentId: z.string() }).parse(d))
  .handler(async ({ context, data }) => replacementSearch(context.userId, data.assignmentId));

export const recordCallOffFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ assignmentId: z.string(), note: z.string().optional() }).parse(d),
  )
  .handler(async ({ context, data }) =>
    callOffAction(context.userId, data.assignmentId, data.note),
  );

export const recordLateFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ assignmentId: z.string(), minutesLate: z.number().min(0) }).parse(d),
  )
  .handler(async ({ context, data }) =>
    markLateAction(context.userId, data.assignmentId, data.minutesLate),
  );

export const assignReplacementFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ assignmentId: z.string(), employeeId: z.string() }).parse(d),
  )
  .handler(async ({ context, data }) =>
    assignReplacementAction(context.userId, data.assignmentId, data.employeeId),
  );

export const autoFillGapsFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ from: z.string(), to: z.string() }).parse(d))
  .handler(async ({ context, data }) => autoFillGapsAction(context.userId, data.from, data.to));

export const submitPtoFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        startDate: z.string(),
        endDate: z.string(),
        reason: z.string().max(500).optional(),
      })
      .parse(d),
  )
  .handler(async ({ context, data }) =>
    submitPtoAction(context.userId, data.startDate, data.endDate, data.reason ?? ""),
  );

export const decidePtoFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ id: z.string(), approve: z.boolean(), note: z.string().optional() }).parse(d),
  )
  .handler(async ({ context, data }) =>
    decidePtoAction(context.userId, data.id, data.approve, data.note),
  );

export const validateSwitchFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ assignmentId: z.string(), coveringId: z.string() }).parse(d),
  )
  .handler(async ({ context, data }) =>
    validateSwitchQuery(context.userId, data.assignmentId, data.coveringId),
  );

export const createSwitchFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        assignmentId: z.string(),
        coveringId: z.string(),
        reason: z.string().max(500).optional(),
      })
      .parse(d),
  )
  .handler(async ({ context, data }) =>
    createSwitchAction(context.userId, data.assignmentId, data.coveringId, data.reason ?? ""),
  );

export const respondSwitchFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string(), accept: z.boolean() }).parse(d))
  .handler(async ({ context, data }) => respondSwitchAction(context.userId, data.id, data.accept));

export const approveSwitchFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string(), approve: z.boolean() }).parse(d))
  .handler(async ({ context, data }) => approveSwitchAction(context.userId, data.id, data.approve));

export const getEmployeeProfile = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ employeeId: z.string() }).parse(d))
  .handler(async ({ context, data }) => employeeProfileQuery(context.userId, data.employeeId));

export const addEmployeeNote = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        employeeId: z.string(),
        body: z.string().min(1),
        category: z.string().optional(),
        pinned: z.boolean().optional(),
      })
      .parse(d),
  )
  .handler(async ({ context, data }) =>
    addEmployeeNoteAction(context.userId, data.employeeId, data.body, data.category, data.pinned),
  );

export const deleteEmployeeNote = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ noteId: z.string() }).parse(d))
  .handler(async ({ context, data }) => deleteEmployeeNoteAction(context.userId, data.noteId));

export const setAssignmentNote = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ assignmentId: z.string(), note: z.string() }).parse(d))
  .handler(async ({ context, data }) =>
    setAssignmentNoteAction(context.userId, data.assignmentId, data.note),
  );

export const floatAssignment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        assignmentId: z.string(),
        toUnitId: z.string(),
        reason: z
          .enum(["coverage", "call_off", "census", "rotation", "request", "manual"])
          .optional(),
        note: z.string().max(300).optional(),
      })
      .parse(d),
  )
  .handler(async ({ context, data }) =>
    floatAssignmentAction(context.userId, data.assignmentId, data.toUnitId, data.reason, data.note),
  );

export const getFloatHistory = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({ employeeId: z.string().optional(), limit: z.number().min(1).max(100).optional() })
      .parse(d ?? {}),
  )
  .handler(async ({ context, data }) =>
    floatHistoryQuery(context.userId, data.employeeId, data.limit),
  );

export const getFloatTracker = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        unitId: z.string().nullish(),
        shift: z.enum(["first", "second", "third"]).nullish(),
        position: z.enum(["nurse", "qma", "cna"]).nullish(),
      })
      .parse(d ?? {}),
  )
  .handler(async ({ context, data }) => floatTrackerQuery(context.userId, data));
