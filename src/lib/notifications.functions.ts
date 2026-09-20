import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const getNotificationHistory = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { notificationHistoryQuery } = await import("./notifications.impl.server");
    return notificationHistoryQuery(context.userId);
  });

export const markNotificationsReadFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { markNotificationsReadAction } = await import("./notifications.impl.server");
    return markNotificationsReadAction(context.userId);
  });

export const resendFailedTextFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string() }).parse(d))
  .handler(async ({ context, data }) => {
    const { resendFailedTextAction } = await import("./notifications.impl.server");
    return resendFailedTextAction(context.userId, data.id);
  });

const CATEGORY = z.enum(["onboarding", "schedule", "reminders", "delivery_failures"]);

export const getNotificationRules = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { notificationRulesQuery } = await import("./notify-rules.server");
    return notificationRulesQuery(context.userId);
  });

export const saveMyNotificationRuleFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ category: CATEGORY, inApp: z.boolean(), sms: z.boolean() }).parse(d),
  )
  .handler(async ({ context, data }) => {
    const { saveMyRuleAction } = await import("./notify-rules.server");
    return saveMyRuleAction(context.userId, data);
  });

export const resetMyNotificationRuleFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ category: CATEGORY }).parse(d))
  .handler(async ({ context, data }) => {
    const { resetMyRuleAction } = await import("./notify-rules.server");
    return resetMyRuleAction(context.userId, data.category);
  });

export const saveRoleNotificationRuleFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        role: z.enum(["employee", "manager", "admin"]),
        category: CATEGORY,
        inApp: z.boolean(),
        sms: z.boolean(),
      })
      .parse(d),
  )
  .handler(async ({ context, data }) => {
    const { saveRoleRuleAction } = await import("./notify-rules.server");
    return saveRoleRuleAction(context.userId, data);
  });

export const previewNotificationFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        category: CATEGORY,
        newHireId: z.string().nullable().optional(),
        sendTest: z.boolean().optional(),
      })
      .parse(d),
  )
  .handler(async ({ context, data }) => {
    const { previewNotificationAction } = await import("./notify-preview.server");
    return previewNotificationAction(context.userId, {
      category: data.category,
      newHireId: data.newHireId ?? null,
      sendTest: data.sendTest ?? false,
    });
  });

export const getNotificationAudit = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        role: z.enum(["any", "employee", "manager", "admin"]).optional(),
        category: z
          .enum(["any", "onboarding", "schedule", "reminders", "delivery_failures", "other"])
          .optional(),
        channel: z.enum(["any", "in_app", "text"]).optional(),
        status: z.enum(["any", "sent", "failed", "queued", "unread", "read"]).optional(),
        employeeId: z.string().nullable().optional(),
        search: z.string().optional(),
        from: z.string().nullable().optional(),
        to: z.string().nullable().optional(),
      })
      .parse(d ?? {}),
  )
  .handler(async ({ context, data }) => {
    const { notificationAuditQuery } = await import("./notification-audit.server");
    return notificationAuditQuery(context.userId, data);
  });
