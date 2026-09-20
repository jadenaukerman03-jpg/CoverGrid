import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { activityQuery, handoffQuery, undoActivityAction } from "./oversight.impl.server";

export const getHandoff = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ date: z.string().optional() }).parse(d ?? {}))
  .handler(async ({ context, data }) => handoffQuery(context.userId, data.date));

export const getActivity = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        limit: z.number().min(1).max(200).optional(),
        onlyUndoable: z.boolean().optional(),
      })
      .parse(d ?? {}),
  )
  .handler(async ({ context, data }) =>
    activityQuery(context.userId, data.limit, data.onlyUndoable),
  );

export const undoActivityFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ auditId: z.string() }).parse(d))
  .handler(async ({ context, data }) => undoActivityAction(context.userId, data.auditId));
