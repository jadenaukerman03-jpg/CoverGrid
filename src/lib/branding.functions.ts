import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { readBrandTheme, writeBrandTheme } from "./branding.server";

export const getBrandTheme = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async () => readBrandTheme());

export const setBrandTheme = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ primary: z.string().min(3).max(9), accent: z.string().min(3).max(9) }).parse(d),
  )
  .handler(async ({ context, data }) => writeBrandTheme(context.userId, data));
