import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  addApplicantAction,
  complianceData,
  createPostingAction,
  engagementData,
  giveRecognitionAction,
  hiringData,
  laborData,
  lowCensusData,
  messagesData,
  moveApplicantAction,
  payrollData,
  punchAction,
  punchReportData,
  requestAdvanceAction,
  sendMessageAction,
  setCensusAction,
  timeClockData,
  wageAccessData,
} from "./workforce.impl.server";

const range = z.object({ from: z.string().optional(), to: z.string().optional() });

export const getLabor = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => range.parse(d ?? {}))
  .handler(async ({ context, data }) => laborData(context.userId, data.from, data.to));

export const setCensusFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ date: z.string(), unitId: z.string(), census: z.number().min(0).max(400) }).parse(d),
  )
  .handler(async ({ context, data }) =>
    setCensusAction(context.userId, data.date, data.unitId, data.census),
  );

export const getTimeClock = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => timeClockData(context.userId));

const punchLocation = z
  .object({
    lat: z.number().min(-90).max(90),
    lng: z.number().min(-180).max(180),
    accuracyM: z.number().min(0).optional(),
  })
  .nullable()
  .optional();

export const punchFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        assignmentId: z.string().nullable(),
        kind: z.enum(["in", "out"]),
        location: punchLocation,
        locationAttempted: z.boolean().optional(),
      })
      .parse(d),
  )
  .handler(async ({ context, data }) =>
    punchAction(context.userId, data.assignmentId, data.kind, {
      location: data.location,
      locationAttempted: data.locationAttempted,
    }),
  );

export const getPunchReport = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => range.parse(d ?? {}))
  .handler(async ({ context, data }) => punchReportData(context.userId, data.from, data.to));

export const getPayroll = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ start: z.string().optional(), end: z.string().optional() }).parse(d ?? {}),
  )
  .handler(async ({ context, data }) => payrollData(context.userId, data.start, data.end));

export const getWageAccess = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => wageAccessData(context.userId));

export const requestAdvanceFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ amount: z.number().positive(), note: z.string().max(200).optional() }).parse(d),
  )
  .handler(async ({ context, data }) =>
    requestAdvanceAction(context.userId, data.amount, data.note ?? ""),
  );

export const getHiring = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => hiringData(context.userId));

export const createPostingFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        title: z.string().min(2).max(120),
        position: z.enum(["nurse", "qma", "cna"]),
        shift: z.enum(["first", "second", "third"]).nullable(),
        unitId: z.string().nullable(),
        payRange: z.string().max(60).default(""),
        description: z.string().max(2000).default(""),
        openings: z.number().min(1).max(20).default(1),
      })
      .parse(d),
  )
  .handler(async ({ context, data }) => createPostingAction(context.userId, data));

export const addApplicantFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        postingId: z.string().nullable(),
        fullName: z.string().min(2).max(120),
        email: z.string().max(160).optional(),
        phone: z.string().max(40).optional(),
        source: z.string().max(40).optional(),
        notes: z.string().max(1000).optional(),
      })
      .parse(d),
  )
  .handler(async ({ context, data }) => addApplicantAction(context.userId, data));

export const moveApplicantFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        id: z.string(),
        stage: z.enum(["applied", "screened", "interview", "offer", "hired", "rejected"]),
      })
      .parse(d),
  )
  .handler(async ({ context, data }) => moveApplicantAction(context.userId, data.id, data.stage));

export const getEngagement = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => engagementData(context.userId));

export const giveRecognitionFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({ employeeId: z.string(), badge: z.string().max(40), message: z.string().max(400) })
      .parse(d),
  )
  .handler(async ({ context, data }) =>
    giveRecognitionAction(context.userId, data.employeeId, data.badge, data.message),
  );

export const getMessages = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => messagesData(context.userId));

export const sendMessageFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        recipientId: z.string().nullable(),
        audience: z.string().max(40).default("all"),
        subject: z.string().max(140).default(""),
        body: z.string().min(1).max(4000),
      })
      .parse(d),
  )
  .handler(async ({ context, data }) => sendMessageAction(context.userId, data));

export const getCompliance = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => range.parse(d ?? {}))
  .handler(async ({ context, data }) => complianceData(context.userId, data.from, data.to));

export const getLowCensus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => range.parse(d ?? {}))
  .handler(async ({ context, data }) => lowCensusData(context.userId, data.from, data.to));

export const sendHomeLowCensusFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ assignmentId: z.string(), note: z.string().max(400).optional() }).parse(d),
  )
  .handler(async ({ context, data }) => {
    const { sendHomeLowCensusAction } = await import("./workforce.impl.server");
    return sendHomeLowCensusAction(context.userId, data.assignmentId, data.note);
  });

export const undoSendHomeFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ assignmentId: z.string() }).parse(d))
  .handler(async ({ context, data }) => {
    const { undoSendHomeAction } = await import("./workforce.impl.server");
    return undoSendHomeAction(context.userId, data.assignmentId);
  });
