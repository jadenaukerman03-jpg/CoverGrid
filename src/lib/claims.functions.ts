import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { broadcastShiftAction, claimBoardQuery } from "./claims.impl.server";

export const getClaimBoard = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => claimBoardQuery(context.userId));

export const broadcastShiftFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        assignmentId: z.string(),
        limit: z.number().optional(),
        hoursToRespond: z.number().optional(),
        includeOvertime: z.boolean().optional(),
      })
      .parse(d),
  )
  .handler(async ({ context, data }) => broadcastShiftAction(context.userId, data));
