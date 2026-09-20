import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  deviceBoardQuery,
  flushOutboxAction,
  messagingSettingsUpdate,
  outboxQuery,
  paperworkQuery,
  paperworkStatusAction,
  payrollExportQuery,
  rotateDeviceKeyAction,
  savePaperworkAction,
  saveDeviceAction,
  setBadgeAction,
  smsOptinAction,
  testTextAction,
} from "./platform.impl.server";

const formats = z.enum(["standard", "adp", "paycom", "ukg", "paylocity", "pbj"]);
const statuses = z.enum(["not_started", "in_progress", "complete"]);

export const getOutbox = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => outboxQuery(context.userId));

export const updateMessagingSettingsFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        smsEnabled: z.boolean().optional(),
        quietStart: z.number().optional(),
        quietEnd: z.number().optional(),
        retentionDays: z.number().optional(),
      })
      .parse(d ?? {}),
  )
  .handler(async ({ context, data }) => messagingSettingsUpdate(context.userId, data));

export const sendTestTextFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ phone: z.string().min(7) }).parse(d))
  .handler(async ({ context, data }) => testTextAction(context.userId, data.phone));

export const flushOutboxFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => flushOutboxAction(context.userId));

export const setSmsOptinFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ employeeId: z.string().optional(), optin: z.boolean() }).parse(d),
  )
  .handler(async ({ context, data }) => smsOptinAction(context.userId, data));

export const getClocks = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => deviceBoardQuery(context.userId));

export const saveClockFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        id: z.string().nullable().optional(),
        name: z.string().min(1),
        unitId: z.string().nullable().optional(),
        isActive: z.boolean().optional(),
      })
      .parse(d),
  )
  .handler(async ({ context, data }) => saveDeviceAction(context.userId, data));

export const rotateClockKeyFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string() }).parse(d))
  .handler(async ({ context, data }) => rotateDeviceKeyAction(context.userId, data.id));

export const setBadgeFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        employeeId: z.string(),
        clockInNumber: z.string().optional(),
        pin: z.string().optional(),
        payrollId: z.string().optional(),
      })
      .parse(d),
  )
  .handler(async ({ context, data }) => setBadgeAction(context.userId, data));

export const getPayrollExport = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        start: z.string().optional(),
        end: z.string().optional(),
        format: formats,
        companyCode: z.string().optional(),
      })
      .parse(d),
  )
  .handler(async ({ context, data }) => payrollExportQuery(context.userId, data));

export const getPaperwork = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => paperworkQuery(context.userId));

export const savePaperworkFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        id: z.string().nullable().optional(),
        category: z.string().optional(),
        title: z.string().min(1),
        detail: z.string().optional(),
        status: statuses.optional(),
        owner: z.string().optional(),
        evidenceUrl: z.string().optional(),
        reviewedOn: z.string().nullable().optional(),
        nextReviewOn: z.string().nullable().optional(),
      })
      .parse(d),
  )
  .handler(async ({ context, data }) => savePaperworkAction(context.userId, data));

export const setPaperworkStatusFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string(), status: statuses }).parse(d))
  .handler(async ({ context, data }) => paperworkStatusAction(context.userId, data));
