import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  payrollHandoffAction,
  rollupAlertRulesQuery,
  rollupQuery,
  saveRollupAlertRulesAction,
} from "./rollup.impl.server";

export const getCorporateRollup = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ weekStart: z.string().optional() }).parse(d ?? {}))
  .handler(async ({ context, data }) => rollupQuery(context.userId, data.weekStart));

export const runPayrollHandoffFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ employeeId: z.string() }).parse(d))
  .handler(async ({ context, data }) => payrollHandoffAction(context.userId, data.employeeId));

export const getRollupAlerts = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ weekStart: z.string().optional() }).parse(d ?? {}))
  .handler(async ({ context, data }) => rollupAlertRulesQuery(context.userId, data.weekStart));

export const saveRollupAlerts = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        enabled: z.boolean().optional(),
        ppdOverGoal: z.boolean().optional(),
        coverageBelowPct: z.number().optional(),
        utilizationAbovePct: z.number().optional(),
        agencyAbovePct: z.number().optional(),
        overtimeAboveHours: z.number().optional(),
        budgetAbovePct: z.number().optional(),
        openSlotsAbove: z.number().optional(),
      })
      .parse(d ?? {}),
  )
  .handler(async ({ context, data }) => saveRollupAlertRulesAction(context.userId, data));
