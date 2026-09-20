import Anthropic from "@anthropic-ai/sdk";

import { parseStaffingInputResultSchema, type ParseStaffingInputResult } from "./schema";

function requiredEnvironment(name: "ANTHROPIC_API_KEY") {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not configured on the server.`);
  return value;
}

let client: Anthropic | undefined;
function getClient() {
  client ??= new Anthropic({ apiKey: requiredEnvironment("ANTHROPIC_API_KEY") });
  return client;
}

const RECORD_OPERATIONS_TOOL: Anthropic.Tool = {
  name: "record_staffing_operations",
  description:
    "Record the structured staffing/scheduling operations extracted from a scheduler's free-text input. " +
    "Every field that isn't given in the text should simply be omitted rather than guessed.",
  input_schema: {
    type: "object",
    properties: {
      operations: {
        type: "array",
        items: {
          type: "object",
          properties: {
            op: {
              type: "string",
              enum: [
                "create_unit",
                "create_role",
                "set_staffing_ratio",
                "create_employee",
                "update_employee",
                "add_conflict_pair",
                "report_call_off",
              ],
              description: "Which kind of operation this entry represents.",
            },
            name: {
              type: "string",
              description: "Unit or role name, for create_unit / create_role.",
            },
            unitName: { type: "string" },
            roleName: { type: "string" },
            shiftLabel: {
              type: "string",
              description: 'Free-form shift window label, e.g. "day", "evening", "night".',
            },
            requiredCount: { type: "integer", minimum: 0 },
            fullName: { type: "string" },
            homeUnitName: { type: "string" },
            floatEligible: { type: "boolean" },
            phoneNumber: { type: "string" },
            certifications: { type: "array", items: { type: "string" } },
            addCertifications: { type: "array", items: { type: "string" } },
            employeeNameA: { type: "string" },
            employeeNameB: { type: "string" },
            employeeName: { type: "string" },
            shiftDate: { type: "string", description: "Resolved to an explicit YYYY-MM-DD date." },
            reason: { type: "string" },
          },
          required: ["op"],
        },
      },
      unresolved: {
        type: "array",
        items: { type: "string" },
        description:
          "Plain-language notes for anything in the input that couldn't be confidently mapped.",
      },
    },
    required: ["operations"],
  },
};

/**
 * Turns a scheduler's free-text input ("Unit 3 needs 2 CNAs and 1 QMA on
 * nights", "Sarah Miller is a CNA, home unit 2, float eligible, BLS cert")
 * into structured operations. Employees/units are referenced by the names
 * the scheduler typed, not database ids — resolving those names against
 * existing facility records happens as a separate step after this returns.
 */
export async function parseStaffingInput(
  freeText: string,
  context: { today: string },
): Promise<ParseStaffingInputResult> {
  const response = await getClient().messages.create({
    model: process.env["ANTHROPIC_MODEL"] || "claude-sonnet-5",
    max_tokens: 4096,
    system:
      "You extract structured staffing-setup and scheduling operations from a nursing home " +
      'scheduler\'s free-text notes. Resolve relative dates ("tonight", "tomorrow", "next Friday") ' +
      `against today's date, ${context.today}, into explicit YYYY-MM-DD values. If a sentence doesn't ` +
      "clearly map to one of the available operations, add a short note to `unresolved` instead of " +
      "guessing at an operation.",
    tools: [RECORD_OPERATIONS_TOOL],
    tool_choice: { type: "tool", name: "record_staffing_operations" },
    messages: [{ role: "user", content: freeText }],
  });

  const toolUse = response.content.find(
    (block): block is Anthropic.ToolUseBlock => block.type === "tool_use",
  );
  if (!toolUse) {
    throw new Error("The model did not return a structured response.");
  }

  const parsed = parseStaffingInputResultSchema.safeParse(toolUse.input);
  if (!parsed.success) {
    throw new Error(`Model output did not match the expected schema: ${parsed.error.message}`);
  }

  return parsed.data;
}
