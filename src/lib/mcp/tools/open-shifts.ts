import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";

import { supabaseForUser } from "../supabase";

export default defineTool({
  name: "open_shifts",
  title: "Open shifts",
  description:
    "List shifts that still need someone between two dates (YYYY-MM-DD): date, shift, unit, position and any note.",
  inputSchema: {
    from: z.string().describe("Start date, YYYY-MM-DD."),
    to: z.string().describe("End date, YYYY-MM-DD."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ from, to }, ctx) => {
    if (!ctx.isAuthenticated()) {
      return { content: [{ type: "text", text: "Not signed in." }], isError: true };
    }
    const supabase = supabaseForUser(ctx);
    const { data, error } = await supabase
      .from("shift_assignments")
      .select("id, shift_date, shift, position, hours, status, note, units:unit_id(name)")
      .in("status", ["open", "called_off", "unfilled"])
      .gte("shift_date", from)
      .lte("shift_date", to)
      .order("shift_date", { ascending: true });
    if (error) return { content: [{ type: "text", text: error.message }], isError: true };
    return {
      content: [{ type: "text", text: JSON.stringify({ openShifts: data ?? [] }) }],
      structuredContent: { openShifts: data ?? [] },
    };
  },
});
