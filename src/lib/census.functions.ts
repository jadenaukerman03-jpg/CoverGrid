import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  censusIntakeData,
  importCensusFileAction,
  previewCensusFileAction,
} from "./census.impl.server";

const sourceEnum = z.enum(["pointclickcare", "matrixcare", "csv", "manual", "api"]);

export const getCensusIntake = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => censusIntakeData(context.userId));

export const previewCensusFile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ text: z.string().min(1).max(2_000_000) }).parse(d))
  .handler(async ({ context, data }) => previewCensusFileAction(context.userId, data.text));

export const importCensusFile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        text: z.string().min(1).max(2_000_000),
        fileName: z.string().max(200).default(""),
        source: sourceEnum.default("pointclickcare"),
      })
      .parse(d),
  )
  .handler(async ({ context, data }) =>
    importCensusFileAction(context.userId, data.text, data.fileName, data.source),
  );
