import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";

import { supabaseForUser } from "../supabase";

export default defineTool({
  name: "unit_coverage",
  title: "Unit coverage for a day",
  description:
    "Summarize one day's coverage: scheduled hours and headcount per unit and shift, plus that unit's census and hours per patient day when census is on file.",
  inputSchema: { date: z.string().describe("The day to summarize, YYYY-MM-DD.") },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ date }, ctx) => {
    if (!ctx.isAuthenticated()) {
      return { content: [{ type: "text", text: "Not signed in." }], isError: true };
    }
    const supabase = supabaseForUser(ctx);
    const [{ data: units, error: unitError }, { data: rows, error: rowError }, { data: census }] =
      await Promise.all([
        supabase.from("units").select("id, name, target_hppd").order("sort_order"),
        supabase
          .from("shift_assignments")
          .select("unit_id, shift, hours, status, employee_id, agency_staff_id")
          .eq("shift_date", date),
        supabase.from("census_days").select("unit_id, census").eq("date", date),
      ]);
    if (unitError) return { content: [{ type: "text", text: unitError.message }], isError: true };
    if (rowError) return { content: [{ type: "text", text: rowError.message }], isError: true };

    const filled = (rows ?? []).filter(
      (r) =>
        r.status !== "called_off" && r.status !== "open" && (r.employee_id || r.agency_staff_id),
    );
    const summary = (units ?? []).map((unit) => {
      const mine = filled.filter((r) => r.unit_id === unit.id);
      const hours = mine.reduce((sum, r) => sum + Number(r.hours ?? 0), 0);
      const head = (census ?? []).find((c) => c.unit_id === unit.id)?.census ?? null;
      const shifts = ["days", "evenings", "nights"].map((shift) => {
        const s = mine.filter((r) => r.shift === shift);
        return {
          shift,
          people: s.length,
          hours: s.reduce((sum, r) => sum + Number(r.hours ?? 0), 0),
        };
      });
      return {
        unit: unit.name,
        targetHppd: unit.target_hppd,
        census: head,
        scheduledHours: hours,
        people: mine.length,
        hppd: head && head > 0 ? Number((hours / head).toFixed(2)) : null,
        byShift: shifts,
      };
    });
    return {
      content: [{ type: "text", text: JSON.stringify({ date, units: summary }) }],
      structuredContent: { date, units: summary },
    };
  },
});
