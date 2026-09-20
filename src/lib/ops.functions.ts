import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  agencyBoardQuery,
  agencyStaffQuery,
  bookAgencyShiftAction,
  claimShiftAction,
  confirmIntakeAction,
  costQuery,
  credentialSweepAction,
  credentialsQuery,
  dismissIntakeAction,
  dropShiftAction,
  fairnessQuery,
  floatOptinAction,
  floatPoolQuery,
  intakeQuery,
  pickupQuery,
  recordIntakeAction,
  removeAgencyShiftAction,
  riskQuery,
  riskRefreshAction,
  saveAgencyAction,
  saveAgencyStaffAction,
  saveCredentialAction,
  saveFacilityAction,
  setPreceptorAction,
  setTrainingAction,
  trainingQuery,
} from "./ops.impl.server";

const position = z.enum(["nurse", "qma", "cna"]);
const shift = z.enum(["first", "second", "third"]);

export const getAgencyBoard = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ weekStart: z.string().optional() }).parse(d ?? {}))
  .handler(async ({ context, data }) => agencyBoardQuery(context.userId, data.weekStart));

export const getAgencyStaff = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ agencyStaffId: z.string() }).parse(d))
  .handler(async ({ context, data }) => agencyStaffQuery(context.userId, data.agencyStaffId));

export const saveAgencyFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        id: z.string().nullable().optional(),
        name: z.string().min(1),
        contactName: z.string().optional(),
        contactEmail: z.string().optional(),
        contactPhone: z.string().optional(),
        weeklyBudget: z.number().optional(),
        maxShiftsPerWeek: z.number().optional(),
        rateNurse: z.number().optional(),
        rateQma: z.number().optional(),
        rateCna: z.number().optional(),
        notes: z.string().optional(),
        isActive: z.boolean().optional(),
      })
      .parse(d),
  )
  .handler(async ({ context, data }) => saveAgencyAction(context.userId, data));

export const saveAgencyStaffFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        id: z.string().nullable().optional(),
        agencyId: z.string(),
        fullName: z.string().min(1),
        position,
        phone: z.string().optional(),
        email: z.string().optional(),
        chartingUsername: z.string().optional(),
        chartingPassword: z.string().optional(),
        clockInNumber: z.string().optional(),
        notes: z.string().optional(),
        isActive: z.boolean().optional(),
      })
      .parse(d),
  )
  .handler(async ({ context, data }) => saveAgencyStaffAction(context.userId, data));

export const bookAgencyShiftFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        agencyStaffId: z.string(),
        date: z.string(),
        shift,
        unitId: z.string(),
        position,
        assignmentId: z.string().nullable().optional(),
        force: z.boolean().optional(),
      })
      .parse(d),
  )
  .handler(async ({ context, data }) => bookAgencyShiftAction(context.userId, data));

export const removeAgencyShiftFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ assignmentId: z.string() }).parse(d))
  .handler(async ({ context, data }) => removeAgencyShiftAction(context.userId, data.assignmentId));

export const getCredentials = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => credentialsQuery(context.userId));

export const saveCredentialFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        id: z.string().nullable().optional(),
        employeeId: z.string(),
        kind: z.string(),
        identifier: z.string().optional(),
        issuedOn: z.string().nullable().optional(),
        expiresOn: z.string(),
        notes: z.string().optional(),
      })
      .parse(d),
  )
  .handler(async ({ context, data }) => saveCredentialAction(context.userId, data));

export const runCredentialSweepFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => credentialSweepAction(context.userId));

export const getRiskBoard = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => riskQuery(context.userId));

export const refreshRiskFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => riskRefreshAction(context.userId));

export const getIntakeInbox = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => intakeQuery(context.userId));

export const recordIntakeFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        transcript: z.string().min(3),
        callerName: z.string().optional(),
        callerPhone: z.string().optional(),
        channel: z.string().optional(),
      })
      .parse(d),
  )
  .handler(async ({ context, data }) => recordIntakeAction(context.userId, data));

export const confirmIntakeFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        intakeId: z.string(),
        employeeId: z.string(),
        kind: z.enum(["call_off", "late"]),
        date: z.string(),
        shift: shift.nullable().optional(),
        minutesLate: z.number().nullable().optional(),
      })
      .parse(d),
  )
  .handler(async ({ context, data }) => confirmIntakeAction(context.userId, data));

export const dismissIntakeFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ intakeId: z.string(), reason: z.string().optional() }).parse(d),
  )
  .handler(async ({ context, data }) =>
    dismissIntakeAction(context.userId, data.intakeId, data.reason ?? ""),
  );

export const getFairness = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ from: z.string().optional(), to: z.string().optional() }).parse(d ?? {}),
  )
  .handler(async ({ context, data }) => fairnessQuery(context.userId, data.from, data.to));

export const getCostProjection = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ weekStart: z.string().optional() }).parse(d ?? {}))
  .handler(async ({ context, data }) => costQuery(context.userId, data.weekStart));

export const getFloatPool = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => floatPoolQuery(context.userId));

export const saveFacilityFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        id: z.string().nullable().optional(),
        name: z.string().min(1),
        address: z.string().optional(),
        weeklyLaborBudget: z.number().optional(),
      })
      .parse(d),
  )
  .handler(async ({ context, data }) => saveFacilityAction(context.userId, data));

export const setFloatOptinFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ employeeId: z.string().optional(), optin: z.boolean() }).parse(d),
  )
  .handler(async ({ context, data }) => floatOptinAction(context.userId, data));

export const getTrainingBoard = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => trainingQuery(context.userId));

export const setTrainingFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        employeeId: z.string(),
        inTraining: z.boolean(),
        endsOn: z.string().nullable().optional(),
      })
      .parse(d),
  )
  .handler(async ({ context, data }) => setTrainingAction(context.userId, data));

export const setPreceptorFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ assignmentId: z.string(), preceptorId: z.string().nullable() }).parse(d),
  )
  .handler(async ({ context, data }) => setPreceptorAction(context.userId, data));

export const getPickupBoard = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ employeeId: z.string().optional() }).parse(d ?? {}))
  .handler(async ({ context, data }) => pickupQuery(context.userId, data.employeeId));

export const claimShiftFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        assignmentId: z.string().nullable().optional(),
        key: z.string().nullable().optional(),
      })
      .parse(d),
  )
  .handler(async ({ context, data }) => claimShiftAction(context.userId, data));

export const dropShiftFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ assignmentId: z.string() }).parse(d))
  .handler(async ({ context, data }) => dropShiftAction(context.userId, data.assignmentId));
