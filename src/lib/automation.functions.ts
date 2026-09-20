import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  automationOverview,
  generateScheduleAction,
  runAutomationNow,
  saveAutopilotAction,
  updateRotationAction,
} from "./automation.impl.server";

export const getAutomation = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => automationOverview(context.userId));

export const runAutomation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => runAutomationNow(context.userId));

export const generateSchedule = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ weeks: z.number().min(1).max(12), from: z.string().optional() }).parse(d),
  )
  .handler(async ({ context, data }) =>
    generateScheduleAction(context.userId, data.weeks, data.from),
  );

export const saveRotation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        employeeId: z.string(),
        weekA: z.array(z.number().min(0).max(6)),
        weekB: z.array(z.number().min(0).max(6)),
        daysPerWeek: z.number().min(1).max(7),
      })
      .parse(d),
  )
  .handler(async ({ context, data }) => updateRotationAction(context.userId, data));

export const saveAutopilot = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        autopilotEnabled: z.boolean().optional(),
        watchOnly: z.boolean().optional(),
        coverageBuffer: z.number().min(0).max(5).optional(),
        autoFillDays: z.number().min(1).max(30).optional(),
        horizonWeeks: z.number().min(1).max(16).optional(),
        seniorityWeight: z.number().min(0).max(3).optional(),
        recencyWeight: z.number().min(0).max(3).optional(),
        pausedReason: z.string().nullable().optional(),
        buybackEnabled: z.boolean().optional(),
        buybackShiftsRequired: z.number().min(1).max(20).optional(),
        buybackPointsRemoved: z.number().min(0.5).max(5).optional(),
        buybackMaxPointsPerYear: z.number().min(0).max(20).optional(),
        notifyOnboarding: z.boolean().optional(),
        notifyScheduleUpdates: z.boolean().optional(),
        notifyDeliveryFailures: z.boolean().optional(),
        undoWindowMinutes: z.number().min(1).max(120).optional(),
      })
      .parse(d),
  )
  .handler(async ({ context, data }) => saveAutopilotAction(context.userId, data));
