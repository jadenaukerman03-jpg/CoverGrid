import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  convertNewHireAction,
  deleteNewHireAction,
  newHireBoardQuery,
  saveNewHireAction,
  toggleChecklistAction,
} from "./onboarding.impl.server";

const position = z.enum(["nurse", "qma", "cna"]);
const shift = z.enum(["first", "second", "third"]);

const hireSchema = z.object({
  id: z.string().nullable().optional(),
  fullName: z.string().min(1),
  email: z.string().optional(),
  phone: z.string().optional(),
  position,
  unitId: z.string().nullable().optional(),
  shift: shift.nullable().optional(),
  daysPerWeek: z.number().optional(),
  hourlyRate: z.number().optional(),
  employmentType: z.string().optional(),
  source: z.string().optional(),
  recruiter: z.string().optional(),
  offerDate: z.string().nullable().optional(),
  startDate: z.string().nullable().optional(),
  orientationStart: z.string().nullable().optional(),
  orientationEnd: z.string().nullable().optional(),
  preceptorId: z.string().nullable().optional(),
  clockInNumber: z.string().optional(),
  chartingUsername: z.string().optional(),
  payrollId: z.string().optional(),
  emergencyContactName: z.string().optional(),
  emergencyContactPhone: z.string().optional(),
  licenseNumber: z.string().optional(),
  licenseExpiresOn: z.string().nullable().optional(),
  notes: z.string().optional(),
  status: z.string().optional(),
});

export const getNewHires = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => newHireBoardQuery(context.userId));

export const saveNewHireFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => hireSchema.parse(d))
  .handler(async ({ context, data }) => saveNewHireAction(context.userId, data));

export const toggleNewHireStepFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ id: z.string(), key: z.string(), value: z.boolean() }).parse(d),
  )
  .handler(async ({ context, data }) =>
    toggleChecklistAction(context.userId, data.id, data.key, data.value),
  );

export const deleteNewHireFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string() }).parse(d))
  .handler(async ({ context, data }) => deleteNewHireAction(context.userId, data.id));

export const convertNewHireFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string() }).parse(d))
  .handler(async ({ context, data }) => convertNewHireAction(context.userId, data.id));

export const hireApplicantFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        applicantId: z.string(),
        startDate: z.string().nullable().optional(),
        hourlyRate: z.number().optional(),
      })
      .parse(d),
  )
  .handler(async ({ context, data }) => {
    const { hireApplicantAction } = await import("./onboarding.impl.server");
    return hireApplicantAction(context.userId, data.applicantId, {
      startDate: data.startDate ?? null,
      hourlyRate: data.hourlyRate ?? undefined,
    });
  });

export const getOnboardingTimeline = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string() }).parse(d))
  .handler(async ({ context, data }) => {
    const { onboardingTimelineQuery } = await import("./timeline.impl.server");
    return onboardingTimelineQuery(context.userId, data.id);
  });

export const updateOnboardingPhaseFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        newHireId: z.string(),
        phase: z.enum(["paperwork", "screening", "training", "start"]),
        status: z.enum(["not_started", "in_progress", "blocked", "complete"]).nullable().optional(),
        startedAt: z.string().nullable().optional(),
        completedAt: z.string().nullable().optional(),
        dueOn: z.string().nullable().optional(),
        note: z.string().max(1000).optional(),
      })
      .parse(d),
  )
  .handler(async ({ context, data }) => {
    const { updateOnboardingPhaseAction } = await import("./onboarding-phases.server");
    return updateOnboardingPhaseAction(context.userId, data);
  });

export const clearOnboardingPhaseFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        newHireId: z.string(),
        phase: z.enum(["paperwork", "screening", "training", "start"]),
      })
      .parse(d),
  )
  .handler(async ({ context, data }) => {
    const { clearOnboardingPhaseAction } = await import("./onboarding-phases.server");
    return clearOnboardingPhaseAction(context.userId, data.newHireId, data.phase);
  });
