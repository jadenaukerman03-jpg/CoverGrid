import { defineTool, ToolError } from "@lovable.dev/mcp-js";
import { z } from "zod";

import { supabaseForUser } from "../supabase";

export default defineTool({
  name: "record_call_off",
  title: "Record a call-off",
  description:
    "Mark a scheduled shift as a call-off so the system starts looking for a replacement. Needs the person's name, the date (YYYY-MM-DD) and the shift. Only schedulers and managers can do this.",
  inputSchema: {
    employee_name: z.string().describe("Full or partial name of the person calling off."),
    date: z.string().describe("Shift date, YYYY-MM-DD."),
    shift: z.string().describe("Shift name, for example days, evenings or nights."),
    reason: z.string().optional().describe("Short reason given on the call."),
  },
  annotations: {
    readOnlyHint: false,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: false,
  },
  handler: async ({ employee_name, date, shift, reason }, ctx) => {
    if (!ctx.isAuthenticated()) {
      return { content: [{ type: "text", text: "Not signed in." }], isError: true };
    }
    const supabase = supabaseForUser(ctx);
    const { data: matches, error: matchError } = await supabase
      .from("employees")
      .select("id, full_name, position")
      .ilike("full_name", `%${employee_name.trim()}%`)
      .eq("is_active", true)
      .limit(6);
    if (matchError) throw new ToolError(matchError.message);
    if (!matches || matches.length === 0)
      throw new ToolError(`No active staff member matches "${employee_name}".`);
    if (matches.length > 1) {
      return {
        content: [
          {
            type: "text",
            text: `More than one person matches "${employee_name}": ${matches
              .map((m) => `${m.full_name} (${m.position})`)
              .join(", ")}. Ask which one, then call again with the full name.`,
          },
        ],
        isError: true,
      };
    }
    const person = matches[0]!;
    const { data: assignment, error: findError } = await supabase
      .from("shift_assignments")
      .select("id, status")
      .eq("employee_id", person.id)
      .eq("shift_date", date)
      .eq("shift", shift)
      .maybeSingle();
    if (findError) throw new ToolError(findError.message);
    if (!assignment)
      throw new ToolError(`${person.full_name} is not scheduled on ${date} (${shift}).`);

    const note = reason?.trim() ? `Called off: ${reason.trim()}` : "Called off";
    const { error: updateError } = await supabase
      .from("shift_assignments")
      .update({ status: "called_off", note })
      .eq("id", assignment.id);
    if (updateError) throw new ToolError(updateError.message);

    const { error: intakeError } = await supabase.from("call_off_intakes").insert({
      employee_id: person.id,
      caller_name: person.full_name,
      channel: "phone",
      parsed_kind: "call_off",
      parsed_date: date,
      parsed_shift: shift,
      transcript: reason?.trim() ?? "Recorded through an assistant.",
      status: "recorded",
    });

    const result = {
      employee: person.full_name,
      date,
      shift,
      recorded: true,
      intakeLogged: !intakeError,
    };
    return { content: [{ type: "text", text: JSON.stringify(result) }], structuredContent: result };
  },
});
