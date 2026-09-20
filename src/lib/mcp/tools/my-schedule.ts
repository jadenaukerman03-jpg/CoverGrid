import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";

import { supabaseForUser } from "../supabase";

export default defineTool({
  name: "my_schedule",
  title: "My schedule",
  description:
    "List the signed-in person's scheduled shifts between two dates (YYYY-MM-DD), with unit, shift and hours.",
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
    const { data: employee } = await supabase
      .from("employees")
      .select("id, full_name")
      .eq("user_id", ctx.getUserId())
      .maybeSingle();
    if (!employee) {
      return {
        content: [{ type: "text", text: "No staff record is linked to this account." }],
        isError: true,
      };
    }
    const { data, error } = await supabase
      .from("shift_assignments")
      .select("shift_date, shift, position, hours, status, is_float, note, units:unit_id(name)")
      .eq("employee_id", employee.id)
      .gte("shift_date", from)
      .lte("shift_date", to)
      .order("shift_date", { ascending: true });
    if (error) return { content: [{ type: "text", text: error.message }], isError: true };
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({ employee: employee.full_name, shifts: data ?? [] }),
        },
      ],
      structuredContent: { employee: employee.full_name, shifts: data ?? [] },
    };
  },
});
