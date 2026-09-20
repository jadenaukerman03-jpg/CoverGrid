// Control room: an administrator-only assistant that can reconfigure the app itself.
import { POSITION_LABEL, SHIFT_LABEL, type PositionType, type ShiftType } from "./facility";
import { writeBrandTheme } from "./branding.server";
import {
  db,
  loadActor,
  logAudit,
  requireAdmin,
  today,
  unitMap,
  type Actor,
} from "./staffing.server";
import { getAutopilotSettings, updateAutopilotSettings, updatePpdGoal } from "./settings.server";
import { generateScheduleAction, runAutomationNow } from "./automation.impl.server";
import { sendMessageAction } from "./workforce.impl.server";

const GATEWAY = "https://ai.gateway.lovable.dev/v1/chat/completions";
const MODEL = "google/gemini-3.1-pro-preview";

const obj = (props: Record<string, unknown>, required: string[] = []) => ({
  type: "object",
  properties: props,
  required,
  additionalProperties: false,
});
const str = (description: string) => ({ type: "string", description });
const num = (description: string) => ({ type: "number", description });
const bool = (description: string) => ({ type: "boolean", description });

type Tool = {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  run: (actor: Actor, args: any) => Promise<unknown>;
};

const label = (actor: Actor) =>
  `${actor.profile?.full_name ?? actor.profile?.email ?? "administrator"} (admin)`;

async function findUnit(name: string) {
  const { units } = await unitMap();
  const term = name.trim().toLowerCase();
  return (
    units.find((u) => u.name.toLowerCase() === term) ??
    units.find((u) => u.name.toLowerCase().includes(term)) ??
    null
  );
}

async function readConfig(key: string) {
  const { data } = await db
    .from("app_config")
    .select("key,value,label,updated_by,updated_at")
    .eq("key", key)
    .maybeSingle();
  return data ?? null;
}

const TOOLS: Tool[] = [
  {
    name: "set_company_colors",
    description:
      "Change the two company colors used across the whole app (buttons, menus, charts, highlights). Give plain hex colors like #5c96c6.",
    parameters: obj(
      {
        primary: str("Main color as hex, e.g. #5c96c6"),
        accent: str("Second color as hex, e.g. #5c96c6"),
      },
      ["primary", "accent"],
    ),
    run: async (actor: Actor, args: { primary: string; accent: string }) =>
      writeBrandTheme(actor.userId, { primary: args.primary, accent: args.accent }),
  },
  {
    name: "describe_app",
    description:
      "A full picture of how the app is currently set up: buildings, units, required staffing per unit/shift/position, the background system's settings, PPD goal, headcount and app settings. Call this first for anything you are not certain about.",
    parameters: obj({}),
    run: async () => {
      const { units } = await unitMap();
      const [reqs, settings, cfg, emp, fac] = await Promise.all([
        db.from("staffing_requirements").select("unit_id,position,shift,required_count"),
        getAutopilotSettings(),
        db.from("app_config").select("key,value,label"),
        db
          .from("employees")
          .select("position", { count: "exact", head: false })
          .eq("is_active", true),
        db.from("facilities").select("id,name,address,weekly_labor_budget,is_active"),
      ]);
      const byPos: Record<string, number> = {};
      for (const e of emp.data ?? [])
        byPos[String(e.position)] = (byPos[String(e.position)] ?? 0) + 1;
      return {
        today: today(),
        facilities: fac.data ?? [],
        units: units.map((u) => ({
          id: u.id,
          name: u.name,
          targetHppd: (u as { target_hppd?: number }).target_hppd,
        })),
        staffingRequirements: (reqs.data ?? []).map((r) => ({
          unit: units.find((u) => u.id === r.unit_id)?.name ?? r.unit_id,
          position: POSITION_LABEL[r.position as PositionType] ?? r.position,
          shift: SHIFT_LABEL[r.shift as ShiftType] ?? r.shift,
          required: r.required_count,
        })),
        backgroundSystem: settings,
        activeStaffByPosition: byPos,
        appSettings: cfg.data ?? [],
      };
    },
  },
  {
    name: "set_staffing_requirement",
    description:
      "Change how many people are required on a unit for a shift and position. This instantly changes coverage math, gap alerts, auto-fill and the dashboard everywhere in the app.",
    parameters: obj(
      {
        unit: str("Unit name"),
        position: str("nurse, cna or qma"),
        shift: str("first, second or third"),
        required: num("How many people are required"),
      },
      ["unit", "position", "shift", "required"],
    ),
    run: async (actor, args) => {
      const unit = await findUnit(String(args.unit));
      if (!unit) return { error: `No unit named "${args.unit}".` };
      const position = String(args.position).toLowerCase() as PositionType;
      const shift = String(args.shift).toLowerCase() as ShiftType;
      const required = Math.max(0, Math.min(30, Math.round(Number(args.required))));
      const { data: existing } = await db
        .from("staffing_requirements")
        .select("id,required_count")
        .eq("unit_id", unit.id)
        .eq("position", position)
        .eq("shift", shift)
        .maybeSingle();
      if (existing) {
        const { error } = await db
          .from("staffing_requirements")
          .update({ required_count: required })
          .eq("id", existing.id);
        if (error) return { error: error.message };
      } else {
        const { error } = await db
          .from("staffing_requirements")
          .insert({ unit_id: unit.id, position, shift, required_count: required });
        if (error) return { error: error.message };
      }
      await logAudit("requirement_changed", label(actor), "staffing_requirement", unit.id, {
        unit: unit.name,
        position,
        shift,
        from: existing?.required_count ?? null,
        to: required,
      });
      return {
        changed: `${unit.name} · ${SHIFT_LABEL[shift]} · ${POSITION_LABEL[position]}`,
        from: existing?.required_count ?? 0,
        to: required,
      };
    },
  },
  {
    name: "create_unit",
    description:
      "Add a new unit (hall/wing) to a building. It appears on the schedule, dashboard and coverage math right away.",
    parameters: obj(
      {
        name: str("Unit name"),
        facility: str("Building name, optional"),
        targetHppd: num("Target care hours per resident day, optional"),
      },
      ["name"],
    ),
    run: async (actor, args) => {
      const name = String(args.name).trim();
      const { units } = await unitMap();
      if (units.some((u) => u.name.toLowerCase() === name.toLowerCase()))
        return { error: `${name} already exists.` };
      let facilityId: string | null = null;
      if (args.facility) {
        const { data } = await db
          .from("facilities")
          .select("id")
          .ilike("name", `%${String(args.facility)}%`)
          .limit(1);
        facilityId = data?.[0]?.id ?? null;
      }
      const { data, error } = await db
        .from("units")
        .insert({
          name,
          sort_order: units.length + 1,
          target_hppd: Number(args.targetHppd ?? 3.6),
          facility_id: facilityId,
        })
        .select("id,name")
        .maybeSingle();
      if (error) return { error: error.message };
      await logAudit("unit_created", label(actor), "unit", data?.id ?? null, { name });
      return {
        created: data,
        note: "No staffing requirements are set for it yet — set them next.",
      };
    },
  },
  {
    name: "update_unit",
    description:
      "Rename a unit, move it to another building, or change its target care hours per resident day (HPPD).",
    parameters: obj(
      {
        unit: str("Current unit name"),
        newName: str("New name, optional"),
        targetHppd: num("New target HPPD, optional"),
        facility: str("Move to this building, optional"),
      },
      ["unit"],
    ),
    run: async (actor, args) => {
      const unit = await findUnit(String(args.unit));
      if (!unit) return { error: `No unit named "${args.unit}".` };
      const patch: { name?: string; target_hppd?: number; facility_id?: string } = {};
      if (args.newName) patch.name = String(args.newName).trim();
      if (args.targetHppd !== undefined) patch.target_hppd = Number(args.targetHppd);
      if (args.facility) {
        const { data } = await db
          .from("facilities")
          .select("id")
          .ilike("name", `%${String(args.facility)}%`)
          .limit(1);
        if (data?.[0]) patch.facility_id = data[0].id as string;
      }
      if (!Object.keys(patch).length) return { error: "Nothing to change." };
      const { error } = await db.from("units").update(patch).eq("id", unit.id);
      if (error) return { error: error.message };
      await logAudit("unit_updated", label(actor), "unit", unit.id, patch);
      return { updated: unit.name, changes: patch };
    },
  },
  {
    name: "create_facility",
    description: "Add another building/facility with its own weekly labor budget.",
    parameters: obj(
      {
        name: str("Building name"),
        address: str("Address, optional"),
        weeklyLaborBudget: num("Weekly labor budget in dollars, optional"),
      },
      ["name"],
    ),
    run: async (actor, args) => {
      const { data, error } = await db
        .from("facilities")
        .insert({
          name: String(args.name).trim(),
          address: String(args.address ?? ""),
          weekly_labor_budget: Number(args.weeklyLaborBudget ?? 0),
          sort_order: 99,
        })
        .select("id,name")
        .maybeSingle();
      if (error) return { error: error.message };
      await logAudit("facility_created", label(actor), "facility", data?.id ?? null, {
        name: args.name,
      });
      return { created: data };
    },
  },
  {
    name: "configure_background_system",
    description:
      "Change how the always-on background system behaves: turn it on or off, watch-only mode, the call-off cushion, how many days ahead it auto-fills, how many weeks of schedule it keeps built, and how heavily seniority vs. time-since-last-float count in the float rotation.",
    parameters: obj({
      enabled: bool("Run itself, or stop"),
      watchOnly: bool("Watch and recommend only — make no changes on its own"),
      coverageBuffer: num("Extra people per unit/shift above the minimum, 0-5"),
      autoFillDays: num("How many days ahead it fills gaps, 1-30"),
      horizonWeeks: num("How many weeks of schedule to keep built, 1-16"),
      seniorityWeight: num("How much seniority protects someone from floating, 0-3"),
      recencyWeight: num("How much time since the last float counts, 0-3"),
      pausedReason: str("Why it was paused, optional"),
    }),
    run: async (actor, args) =>
      updateAutopilotSettings(
        {
          ...(args.enabled === undefined ? {} : { autopilotEnabled: Boolean(args.enabled) }),
          ...(args.watchOnly === undefined ? {} : { watchOnly: Boolean(args.watchOnly) }),
          ...(args.coverageBuffer === undefined
            ? {}
            : { coverageBuffer: Number(args.coverageBuffer) }),
          ...(args.autoFillDays === undefined ? {} : { autoFillDays: Number(args.autoFillDays) }),
          ...(args.horizonWeeks === undefined ? {} : { horizonWeeks: Number(args.horizonWeeks) }),
          ...(args.seniorityWeight === undefined
            ? {}
            : { seniorityWeight: Number(args.seniorityWeight) }),
          ...(args.recencyWeight === undefined
            ? {}
            : { recencyWeight: Number(args.recencyWeight) }),
          ...(args.pausedReason === undefined ? {} : { pausedReason: String(args.pausedReason) }),
        },
        label(actor),
      ),
  },
  {
    name: "set_ppd_goal",
    description:
      "Set the facility-wide PPD goal (care hours per resident day) that the dashboard graph is measured against.",
    parameters: obj({ goal: num("Goal PPD, e.g. 3.6") }, ["goal"]),
    run: async (actor, args) => updatePpdGoal(Number(args.goal), label(actor)),
  },
  {
    name: "read_app_setting",
    description: "Read one app setting by key (for example 'brand').",
    parameters: obj({ key: str("Setting key") }, ["key"]),
    run: async (_actor, args) =>
      (await readConfig(String(args.key))) ?? { error: "No setting with that key yet." },
  },
  {
    name: "set_app_setting",
    description:
      'Create or change an app-wide setting. Use key \'brand\' with value {"appName":"…","tagline":"…"} to rename the product everywhere. Any other key stores facility-wide settings other parts of the app can read.',
    parameters: obj(
      {
        key: str("Setting key, e.g. brand"),
        value: str('JSON object as text, e.g. {"appName":"Cedar Staffing"}'),
        label: str("Plain-language description of what this setting controls"),
      },
      ["key", "value"],
    ),
    run: async (actor, args) => {
      let parsed: unknown;
      try {
        parsed = JSON.parse(String(args.value));
      } catch {
        return { error: 'value must be a JSON object, e.g. {"appName":"Cedar Staffing"}' };
      }
      const key = String(args.key).trim();
      const existing = await readConfig(key);
      const merged =
        existing &&
        typeof existing.value === "object" &&
        existing.value &&
        typeof parsed === "object" &&
        parsed
          ? {
              ...(existing.value as Record<string, unknown>),
              ...(parsed as Record<string, unknown>),
            }
          : parsed;
      const { error } = await db.from("app_config").upsert(
        {
          key,
          value: merged as never,
          label: String(args.label ?? existing?.label ?? ""),
          updated_by: label(actor),
          updated_at: new Date().toISOString(),
        },
        { onConflict: "key" },
      );
      if (error) return { error: error.message };
      await logAudit("app_setting_changed", label(actor), "app_config", null, {
        key,
        value: merged,
      });
      return { key, value: merged, appliesTo: "everyone, immediately" };
    },
  },
  {
    name: "create_agency",
    description: "Add a staffing agency with its weekly budget, shift cap and hourly rates.",
    parameters: obj(
      {
        name: str("Agency name"),
        contactName: str("Contact person"),
        contactPhone: str("Phone, optional"),
        contactEmail: str("Email, optional"),
        weeklyBudget: num("Weekly dollar cap"),
        maxShiftsPerWeek: num("Weekly shift cap"),
        rateNurse: num("Nurse hourly rate"),
        rateQma: num("QMA hourly rate"),
        rateCna: num("CNA hourly rate"),
      },
      ["name"],
    ),
    run: async (actor, args) => {
      const { data, error } = await db
        .from("agencies")
        .insert({
          name: String(args.name).trim(),
          contact_name: String(args.contactName ?? ""),
          contact_phone: args.contactPhone ? String(args.contactPhone) : null,
          contact_email: args.contactEmail ? String(args.contactEmail) : null,
          weekly_budget: Number(args.weeklyBudget ?? 0),
          max_shifts_per_week: Math.round(Number(args.maxShiftsPerWeek ?? 0)),
          rate_nurse: Number(args.rateNurse ?? 0),
          rate_qma: Number(args.rateQma ?? 0),
          rate_cna: Number(args.rateCna ?? 0),
        })
        .select("id,name")
        .maybeSingle();
      if (error) return { error: error.message };
      await logAudit("agency_created", label(actor), "agency", data?.id ?? null, {
        name: args.name,
      });
      return { created: data };
    },
  },
  {
    name: "write_policy",
    description:
      "Write or update a house policy / compliance item that staff and managers can read on the Policy page and that the assistant follows when answering questions.",
    parameters: obj(
      {
        title: str("Policy title"),
        detail: str("The policy, in plain language"),
        category: str("Category, e.g. Attendance, Scheduling, Safety"),
        owner: str("Who owns it, optional"),
      },
      ["title", "detail"],
    ),
    run: async (actor, args) => {
      const { data: existing } = await db
        .from("compliance_items")
        .select("id")
        .eq("title", String(args.title))
        .maybeSingle();
      const row = {
        title: String(args.title),
        detail: String(args.detail),
        category: String(args.category ?? "Policy"),
        owner: String(args.owner ?? label(actor)),
        status: "current",
        reviewed_on: today(),
      };
      if (existing) {
        const { error } = await db.from("compliance_items").update(row).eq("id", existing.id);
        if (error) return { error: error.message };
      } else {
        const { error } = await db.from("compliance_items").insert(row);
        if (error) return { error: error.message };
      }
      await logAudit("policy_written", label(actor), "compliance_item", existing?.id ?? null, {
        title: row.title,
      });
      return { saved: row.title, updated: Boolean(existing) };
    },
  },
  {
    name: "rebuild_schedule",
    description:
      "Rebuild/extend the rotation schedule for the next N weeks after a structural change (new unit, new requirements).",
    parameters: obj({ weeks: num("How many weeks, default 4") }),
    run: async (actor, args) => generateScheduleAction(actor.userId, Number(args.weeks ?? 4)),
  },
  {
    name: "run_cycle_now",
    description:
      "Run the background cycle immediately so every change takes effect across coverage, alerts and auto-fill right now.",
    parameters: obj({}),
    run: async (actor) => runAutomationNow(actor.userId),
  },
  {
    name: "announce_change",
    description: "Tell everyone (or just managers) about a change that was made.",
    parameters: obj(
      { audience: str("all or manager"), subject: str("Subject"), body: str("Message") },
      ["subject", "body"],
    ),
    run: async (actor, args) => {
      await sendMessageAction(actor.userId, {
        recipientId: null,
        audience: String(args.audience ?? "all"),
        subject: String(args.subject),
        body: String(args.body),
      });
      return { announced: true };
    },
  },
  {
    name: "recent_changes",
    description:
      "The most recent configuration and staffing changes made to the app, newest first.",
    parameters: obj({ limit: num("How many, default 20") }),
    run: async (_actor, args) => {
      const { data } = await db
        .from("audit_log")
        .select("action,actor,details,created_at")
        .order("created_at", { ascending: false })
        .limit(Math.min(50, Number(args.limit ?? 20)));
      return data ?? [];
    },
  },
];

function systemPrompt(actor: Actor) {
  return `You are the Control Room — the administrator-level brain of CoverGrid, a staffing platform for care facilities. You are talking to ${actor.profile?.full_name ?? "an administrator"}, who has full authority over the whole system.

WHAT YOU CAN DO
You can reshape how the app works with your tools: change required staffing on any unit/shift/position, add or rename units and buildings, set the PPD goal, rewire how the always-on background system behaves, store app-wide settings (including renaming the product itself), add agencies, write house policy, rebuild the schedule and announce changes. These changes take effect for every user immediately.

WHAT YOU CANNOT DO
You cannot write source code or add brand-new screens on your own. If someone asks for something that needs new code, say so plainly in one line, then offer the closest thing you CAN do right now with your tools — and do it if they say yes.

HOW YOU WORK
1. Understand intent first, even from shorthand ("cedar nights need 3 nurses", "bump the ppd goal to 3.8", "we bought a second building").
2. If anything is ambiguous — which unit, which shift, which position, how many — ask ONE short, specific question with the options listed, and wait. Never guess on something that changes who works.
3. Call describe_app whenever you are unsure of the current setup. Never state a number you did not read from a tool.
4. Think in consequences. Before a structural change, say in one line what it will do (for example: "Cedar third shift goes 2 → 3 nurses, which opens 7 shifts this week and raises PPD about 0.1"). For anything big, confirm first.
5. Chain tools to finish the whole job: make the change, rebuild the schedule if it matters, run the cycle so it takes effect, and offer to announce it.
6. After acting, report in a short plain-language summary: what changed, what it affects, and what you would do next.
7. No jargon. Never mention tools, tables, databases or "AI". Today is ${today()}.`;
}

type ChatMsg = {
  role: string;
  content: string | null;
  tool_calls?: unknown;
  tool_call_id?: string;
  name?: string;
};

export async function runArchitect(userId: string, message: string) {
  const actor = await loadActor(userId);
  requireAdmin(actor);
  const apiKey = process.env["LOVABLE_API_KEY"];
  if (!apiKey) throw new Error("The control room is not configured yet.");

  const toolSpec = TOOLS.map((t) => ({
    type: "function",
    function: { name: t.name, description: t.description, parameters: t.parameters },
  }));

  const { data: history } = await db
    .from("chat_messages")
    .select("role,content")
    .eq("user_id", userId)
    .like("role", "cr_%")
    .order("created_at", { ascending: false })
    .limit(12);
  const prior = (history ?? []).reverse().map((m) => ({
    role: String(m.role).replace("cr_", ""),
    content: m.content,
  }));

  const messages: ChatMsg[] = [
    { role: "system", content: systemPrompt(actor) },
    ...prior,
    { role: "user", content: message },
  ];
  await db.from("chat_messages").insert({ user_id: userId, role: "cr_user", content: message });

  const call = async (body: Record<string, unknown>) => {
    const res = await fetch(GATEWAY, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const text = await res.text();
      console.error(`Control room gateway error [${res.status}]: ${text}`);
      if (res.status === 429)
        throw new Error("The control room is busy right now. Try again in a moment.");
      if (res.status === 402)
        throw new Error("AI credits are exhausted. Add credits to keep using the control room.");
      throw new Error(`Control room request failed [${res.status}].`);
    }
    const json = (await res.json()) as {
      choices: {
        message: {
          content: string | null;
          tool_calls?: { id: string; function: { name: string; arguments: string } }[];
        };
      }[];
    };
    return json.choices?.[0]?.message;
  };

  const changes: string[] = [];
  let final = "";
  for (let turn = 0; turn < 16; turn++) {
    const msg = await call({ model: MODEL, messages, tools: toolSpec, tool_choice: "auto" });
    if (!msg) throw new Error("The control room returned an empty response.");
    messages.push(msg as ChatMsg);
    const calls = msg.tool_calls ?? [];
    if (!calls.length) {
      final = (msg.content ?? "").trim();
      break;
    }
    for (const c of calls) {
      const tool = TOOLS.find((t) => t.name === c.function.name);
      let result: unknown;
      if (!tool) result = { error: "Unknown capability." };
      else {
        try {
          result = await tool.run(
            actor,
            c.function.arguments ? JSON.parse(c.function.arguments) : {},
          );
          changes.push(tool.name);
        } catch (err) {
          result = { error: err instanceof Error ? err.message : "That step failed." };
        }
      }
      messages.push({
        role: "tool",
        tool_call_id: c.id,
        name: c.function.name,
        content: JSON.stringify(result),
      });
    }
  }

  if (!final) {
    const wrap = await call({ model: MODEL, messages, tool_choice: "none" });
    final =
      (wrap?.content ?? "").trim() ||
      "I made progress but could not finish that. Tell me the part that matters most and I'll take it from there.";
  }

  await db.from("chat_messages").insert({ user_id: userId, role: "cr_assistant", content: final });
  return { reply: final, changes };
}

export async function architectHistory(userId: string) {
  const actor = await loadActor(userId);
  requireAdmin(actor);
  const { data } = await db
    .from("chat_messages")
    .select("id,role,content,created_at")
    .eq("user_id", userId)
    .like("role", "cr_%")
    .order("created_at", { ascending: true })
    .limit(60);
  return (data ?? []).map((m) => ({ ...m, role: String(m.role).replace("cr_", "") }));
}

export async function clearArchitect(userId: string) {
  const actor = await loadActor(userId);
  requireAdmin(actor);
  await db.from("chat_messages").delete().eq("user_id", userId).like("role", "cr_%");
  return { cleared: true };
}
