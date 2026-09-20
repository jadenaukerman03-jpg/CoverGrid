import { auth, defineMcp } from "@lovable.dev/mcp-js";

import myScheduleTool from "./tools/my-schedule";
import openShiftsTool from "./tools/open-shifts";
import recordCallOffTool from "./tools/record-call-off";
import unitCoverageTool from "./tools/unit-coverage";

const projectRef = import.meta.env["VITE_SUPABASE_PROJECT_ID"] ?? "project-ref-unset";

export default defineMcp({
  name: "facility-automation-guide",
  title: "Facility Automation Guide",
  version: "0.1.0",
  instructions:
    "Staffing and scheduling tools for this nursing facility. Use `my_schedule` for the signed-in person's shifts, `open_shifts` for shifts still needing coverage, `unit_coverage` for a day's hours, census and hours per patient day by unit, and `record_call_off` to mark a scheduled shift as a call-off (schedulers and managers only). Weeks run Sunday through Saturday. Dates are YYYY-MM-DD.",
  auth: auth.oauth.issuer({
    issuer: `https://${projectRef}.supabase.co/auth/v1`,
    acceptedAudiences: "authenticated",
  }),
  tools: [myScheduleTool, openShiftsTool, unitCoverageTool, recordCallOffTool] as never,
});
