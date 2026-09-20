import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  acknowledgeIncidentAction,
  deleteConnectionAction,
  healthSweepAction,
  ingestAction,
  integrationPostureQuery,
  integrationsBoardQuery,
  pushPayrollAction,
  saveConnectionAction,
  testConnectionAction,
} from "./integrations.impl.server";

export const getIntegrations = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => integrationsBoardQuery(context.userId));

export const getIntegrationPosture = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => integrationPostureQuery(context.userId));

export const saveIntegrationFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        id: z.string().nullable().optional(),
        kind: z.string().optional(),
        name: z.string().optional(),
        vendor: z.string().optional(),
        direction: z.string().optional(),
        transport: z.string().optional(),
        isEnabled: z.boolean().optional(),
        isRequired: z.boolean().optional(),
        expectedEveryMinutes: z.number().optional(),
        staleAfterMinutes: z.number().optional(),
        failureThreshold: z.number().optional(),
        fallbackMode: z.enum(["last_known_good", "manual", "halt"]).optional(),
        notes: z.string().optional(),
      })
      .parse(d),
  )
  .handler(async ({ context, data }) => saveConnectionAction(context.userId, data));

export const deleteIntegrationFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string() }).parse(d))
  .handler(async ({ context, data }) => deleteConnectionAction(context.userId, data.id));

export const testIntegrationFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ slug: z.string() }).parse(d))
  .handler(async ({ context, data }) => testConnectionAction(context.userId, data.slug));

export const ingestIntegrationFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        slug: z.string(),
        csv: z.string().optional(),
        rows: z.array(z.record(z.string(), z.unknown())).optional(),
      })
      .parse(d),
  )
  .handler(async ({ context, data }) => ingestAction(context.userId, data));

export const acknowledgeIncidentFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string() }).parse(d))
  .handler(async ({ context, data }) => acknowledgeIncidentAction(context.userId, data.id));

export const pushPayrollFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ format: z.string().optional(), companyCode: z.string().optional() }).parse(d ?? {}),
  )
  .handler(async ({ context, data }) => pushPayrollAction(context.userId, data));

export const runIntegrationSweepFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => healthSweepAction(context.userId));
