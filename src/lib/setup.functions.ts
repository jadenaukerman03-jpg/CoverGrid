import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { runImportAction, setStepStatusAction, setupBoardQuery } from "./setup.impl.server";

export const getSetupBoard = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => setupBoardQuery(context.userId));

export const setStepStatusFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ id: z.string(), status: z.string(), notes: z.string().optional() }).parse(d),
  )
  .handler(async ({ context, data }) =>
    setStepStatusAction(context.userId, data.id, data.status, data.notes),
  );

export const runImportFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        kind: z.enum(["roster", "schedule", "attendance"]),
        fileName: z.string().optional(),
        text: z.string().min(1),
        apply: z.boolean(),
      })
      .parse(d),
  )
  .handler(async ({ context, data }) => runImportAction(context.userId, data));
