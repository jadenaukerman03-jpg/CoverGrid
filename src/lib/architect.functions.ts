import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { architectHistory, clearArchitect, runArchitect } from "./architect.server";

export const askControlRoom = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ message: z.string().min(1).max(4000) }).parse(d))
  .handler(async ({ context, data }) => runArchitect(context.userId, data.message));

export const getControlRoomHistory = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => architectHistory(context.userId));

export const clearControlRoom = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => clearArchitect(context.userId));
