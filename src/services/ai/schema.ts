import { z } from "zod";

// Free-text intake never knows real database ids, only names as the scheduler
// typed them. A separate resolution step (matching names against existing
// facility/unit/role/employee rows) happens after parsing, not here.

const createUnit = z.object({
  op: z.literal("create_unit"),
  name: z.string().min(1),
});

const createRole = z.object({
  op: z.literal("create_role"),
  name: z.string().min(1),
});

const setStaffingRatio = z.object({
  op: z.literal("set_staffing_ratio"),
  unitName: z.string().min(1),
  roleName: z.string().min(1),
  shiftLabel: z.string().min(1),
  requiredCount: z.number().int().min(0),
});

const createEmployee = z.object({
  op: z.literal("create_employee"),
  fullName: z.string().min(1),
  homeUnitName: z.string().min(1),
  roleName: z.string().min(1),
  floatEligible: z.boolean().default(false),
  phoneNumber: z.string().nullable().default(null),
  certifications: z.array(z.string()).default([]),
});

const updateEmployee = z.object({
  op: z.literal("update_employee"),
  fullName: z.string().min(1),
  homeUnitName: z.string().nullable().default(null),
  floatEligible: z.boolean().nullable().default(null),
  addCertifications: z.array(z.string()).default([]),
});

const addConflictPair = z.object({
  op: z.literal("add_conflict_pair"),
  employeeNameA: z.string().min(1),
  employeeNameB: z.string().min(1),
  reason: z.string().nullable().default(null),
});

const reportCallOff = z.object({
  op: z.literal("report_call_off"),
  employeeName: z.string().min(1),
  shiftDate: z.string().min(1), // YYYY-MM-DD; caller resolves relative dates like "tonight" before this.
  unitName: z.string().nullable().default(null),
  reason: z.string().nullable().default(null),
});

export const staffingOperationSchema = z.discriminatedUnion("op", [
  createUnit,
  createRole,
  setStaffingRatio,
  createEmployee,
  updateEmployee,
  addConflictPair,
  reportCallOff,
]);

export type StaffingOperation = z.infer<typeof staffingOperationSchema>;

export const parseStaffingInputResultSchema = z.object({
  operations: z.array(staffingOperationSchema),
  /** Plain-language notes for anything the model couldn't confidently map to an operation. */
  unresolved: z.array(z.string()).default([]),
});

export type ParseStaffingInputResult = z.infer<typeof parseStaffingInputResultSchema>;
