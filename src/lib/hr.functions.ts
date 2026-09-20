import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  addDocumentAction,
  hrBoardQuery,
  myTrainingQuery,
  recordCompletionAction,
  saveCourseAction,
  setDocumentStatusAction,
  signDocumentAction,
  startOnboardingPacketAction,
  updateScreeningAction,
} from "./hr.impl.server";

export const getHrBoard = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => hrBoardQuery(context.userId));

export const getMyTraining = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => myTrainingQuery(context.userId));

export const startPacketFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ newHireId: z.string() }).parse(d))
  .handler(async ({ context, data }) =>
    startOnboardingPacketAction(context.userId, data.newHireId),
  );

export const signDocumentFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ id: z.string(), signedName: z.string().min(1) }).parse(d),
  )
  .handler(async ({ context, data }) =>
    signDocumentAction(context.userId, data.id, data.signedName),
  );

export const setDocumentStatusFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ id: z.string(), status: z.string(), fileUrl: z.string().optional() }).parse(d),
  )
  .handler(async ({ context, data }) =>
    setDocumentStatusAction(context.userId, data.id, data.status, data.fileUrl),
  );

export const addDocumentFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        newHireId: z.string().nullable().optional(),
        employeeId: z.string().nullable().optional(),
        docType: z.string().min(1),
        title: z.string().min(1),
      })
      .parse(d),
  )
  .handler(async ({ context, data }) => addDocumentAction(context.userId, data));

export const updateScreeningFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        id: z.string(),
        status: z.string(),
        vendor: z.string().optional(),
        reference: z.string().optional(),
        result: z.string().optional(),
        completedOn: z.string().nullable().optional(),
      })
      .parse(d),
  )
  .handler(async ({ context, data }) => updateScreeningAction(context.userId, data));

export const saveCourseFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        id: z.string().nullable().optional(),
        title: z.string().min(1),
        description: z.string().optional(),
        category: z.string().optional(),
        requiredMinutes: z.number().optional(),
        recurrenceMonths: z.number().optional(),
        appliesToPositions: z.array(z.enum(["nurse", "qma", "cna"])).optional(),
        requiredForNewHires: z.boolean().optional(),
        contentUrl: z.string().optional(),
        isActive: z.boolean().optional(),
      })
      .parse(d),
  )
  .handler(async ({ context, data }) => saveCourseAction(context.userId, data));

export const recordCompletionFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        courseId: z.string(),
        employeeId: z.string().nullable().optional(),
        newHireId: z.string().nullable().optional(),
        minutes: z.number().optional(),
        score: z.number().nullable().optional(),
        completedOn: z.string().optional(),
      })
      .parse(d),
  )
  .handler(async ({ context, data }) => recordCompletionAction(context.userId, data));
