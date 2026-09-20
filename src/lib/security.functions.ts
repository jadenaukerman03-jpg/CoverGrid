import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  auditTrailExport,
  changeAccountRole,
  completeAccessReview,
  postureQuery,
  runRetention,
  saveSecuritySettings,
  sessionTimeoutForUser,
} from "./security.impl.server";

export const getSecurityPosture = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => postureQuery(context.userId));

export const saveSecuritySettingsFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        sessionTimeoutMinutes: z.number().min(5).max(480).optional(),
        auditRetentionDays: z.number().min(365).max(3650).optional(),
        messageRetentionDays: z.number().min(30).max(3650).optional(),
        accessReviewDays: z.number().min(30).max(365).optional(),
      })
      .parse(d ?? {}),
  )
  .handler(async ({ context, data }) => saveSecuritySettings(context.userId, data));

export const changeAccountRoleFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({ targetUserId: z.string().uuid(), role: z.enum(["employee", "manager", "admin"]) })
      .parse(d),
  )
  .handler(async ({ context, data }) =>
    changeAccountRole(context.userId, data.targetUserId, data.role),
  );

export const completeAccessReviewFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        accountsReviewed: z.number().min(0).max(100000),
        changesMade: z.number().min(0).max(100000),
        notes: z.string().trim().max(1000).optional(),
      })
      .parse(d),
  )
  .handler(async ({ context, data }) => completeAccessReview(context.userId, data));

export const exportAuditTrailFn = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ days: z.number().min(1).max(3650).default(90) }).parse(d ?? {}),
  )
  .handler(async ({ context, data }) => auditTrailExport(context.userId, data.days));

export const runRetentionFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => runRetention(context.userId));

export const getSessionTimeout = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => sessionTimeoutForUser(context.userId));

import { incidentCreate, incidentList, incidentUpdate } from "./security.impl.server";

export const listIncidentsFn = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => incidentList(context.userId));

export const createIncidentFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        title: z.string().trim().min(3).max(200),
        severity: z.enum(["low", "medium", "high", "critical"]),
        summary: z.string().trim().min(3).max(4000),
        impact: z.string().trim().max(4000).optional(),
      })
      .parse(d),
  )
  .handler(async ({ context, data }) => incidentCreate(context.userId, data));

export const updateIncidentFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        id: z.string().uuid(),
        status: z.enum(["open", "investigating", "resolved"]).optional(),
        remediation: z.string().trim().max(4000).optional(),
        followUp: z.string().trim().max(4000).optional(),
      })
      .parse(d),
  )
  .handler(async ({ context, data }) => {
    const { id, ...rest } = data;
    return incidentUpdate(context.userId, id, rest);
  });
