// Alert rules for the corporate rollup.
// A regional director sets the lines they care about — coverage below X,
// utilization above Y — and the background cycle checks every building each
// hour and drops a notification the moment a building crosses one.
import { db, logAudit } from "./staffing.server";
import { corporateRollup } from "./rollup.server";

export type RollupAlertRules = {
  enabled: boolean;
  coverageBelowPct: number;
  utilizationAbovePct: number;
  agencyAbovePct: number;
  overtimeAboveHours: number;
  budgetAbovePct: number;
  ppdOverGoal: boolean;
  openSlotsAbove: number;
  updatedBy: string | null;
  updatedAt: string | null;
};

const KEY = "rollup_alert_rules";

const DEFAULTS: RollupAlertRules = {
  enabled: true,
  coverageBelowPct: 95,
  utilizationAbovePct: 100,
  agencyAbovePct: 15,
  overtimeAboveHours: 24,
  budgetAbovePct: 100,
  ppdOverGoal: true,
  openSlotsAbove: 0,
  updatedBy: null,
  updatedAt: null,
};

type Sent = Record<string, string>; // `${weekStart}|${facilityId}|${metric}` -> iso

async function readConfig() {
  const { data } = await db
    .from("app_config")
    .select("value,updated_by,updated_at")
    .eq("key", KEY)
    .maybeSingle();
  const value = (data?.value as Record<string, unknown> | null) ?? {};
  const num = (k: keyof RollupAlertRules, fallback: number) => {
    const v = value[k];
    return typeof v === "number" && Number.isFinite(v) ? v : fallback;
  };
  const rules: RollupAlertRules = {
    enabled:
      typeof value["enabled"] === "boolean" ? (value["enabled"] as boolean) : DEFAULTS.enabled,
    coverageBelowPct: num("coverageBelowPct", DEFAULTS.coverageBelowPct),
    utilizationAbovePct: num("utilizationAbovePct", DEFAULTS.utilizationAbovePct),
    agencyAbovePct: num("agencyAbovePct", DEFAULTS.agencyAbovePct),
    overtimeAboveHours: num("overtimeAboveHours", DEFAULTS.overtimeAboveHours),
    budgetAbovePct: num("budgetAbovePct", DEFAULTS.budgetAbovePct),
    ppdOverGoal:
      typeof value["ppdOverGoal"] === "boolean"
        ? (value["ppdOverGoal"] as boolean)
        : DEFAULTS.ppdOverGoal,
    openSlotsAbove: num("openSlotsAbove", DEFAULTS.openSlotsAbove),
    updatedBy: (data?.updated_by as string | null) ?? null,
    updatedAt: (data?.updated_at as string | null) ?? null,
  };
  const sent = (value["sent"] as Sent | undefined) ?? {};
  return { rules, sent };
}

export async function getRollupAlertRules(): Promise<RollupAlertRules> {
  return (await readConfig()).rules;
}

async function write(rules: RollupAlertRules, sent: Sent, actorLabel: string | null) {
  const { updatedBy: _u, updatedAt: _a, ...body } = rules;
  await db.from("app_config").upsert(
    {
      key: KEY,
      label: "Corporate rollup alert rules",
      value: { ...body, sent },
      updated_by: actorLabel ?? "the system",
    },
    { onConflict: "key" },
  );
}

export type RollupAlertRulesInput = {
  [K in keyof RollupAlertRules]?: RollupAlertRules[K] | undefined;
};

export async function saveRollupAlertRules(input: RollupAlertRulesInput, actorLabel: string) {
  const { rules, sent } = await readConfig();
  const clamp = (v: number | undefined, fallback: number, min: number, max: number) =>
    typeof v === "number" && Number.isFinite(v)
      ? Math.min(max, Math.max(min, Math.round(v)))
      : fallback;
  const next: RollupAlertRules = {
    ...rules,
    enabled: input.enabled ?? rules.enabled,
    ppdOverGoal: input.ppdOverGoal ?? rules.ppdOverGoal,
    coverageBelowPct: clamp(input.coverageBelowPct, rules.coverageBelowPct, 0, 100),
    utilizationAbovePct: clamp(input.utilizationAbovePct, rules.utilizationAbovePct, 0, 300),
    agencyAbovePct: clamp(input.agencyAbovePct, rules.agencyAbovePct, 0, 100),
    overtimeAboveHours: clamp(input.overtimeAboveHours, rules.overtimeAboveHours, 0, 500),
    budgetAbovePct: clamp(input.budgetAbovePct, rules.budgetAbovePct, 0, 300),
    openSlotsAbove: clamp(input.openSlotsAbove, rules.openSlotsAbove, 0, 500),
    updatedBy: actorLabel,
  };
  await write(next, sent, actorLabel);
  await logAudit("rollup_alert_rules_updated", actorLabel, "app_config", null, { ...next });
  return next;
}

const METRIC_LABEL: Record<string, string> = {
  coverage: "Coverage",
  utilization: "Utilization",
  agency: "Agency use",
  overtime: "Overtime",
  budget: "Labor budget",
  ppd: "PPD",
  open: "Open shifts",
};

type Breach = {
  facility: string;
  facilityId: string;
  metric: string;
  message: string;
  severity: "warning" | "critical";
};

/** Every building measured against the rules, whether or not anyone was told yet. */
export async function evaluateRollupAlerts(weekStart?: string) {
  const { rules } = await readConfig();
  const rollup = await corporateRollup(weekStart);
  const breaches: Breach[] = [];

  for (const r of rollup.rows) {
    const add = (metric: string, message: string, severity: Breach["severity"] = "warning") =>
      breaches.push({ facility: r.name, facilityId: r.id, metric, message, severity });

    if (r.required > 0 && r.coveragePct < rules.coverageBelowPct)
      add(
        "coverage",
        `Coverage is ${r.coveragePct}%, under the ${rules.coverageBelowPct}% line (${r.filled}/${r.required} slots).`,
        "critical",
      );
    if (r.utilizationPct > rules.utilizationAbovePct)
      add(
        "utilization",
        `Utilization is ${r.utilizationPct}%, over the ${rules.utilizationAbovePct}% line (${r.scheduledHours} hrs across ${r.headcount} staff).`,
      );
    if (r.agencyPct > rules.agencyAbovePct)
      add(
        "agency",
        `Agency is covering ${r.agencyPct}% of worked shifts, over the ${rules.agencyAbovePct}% line.`,
      );
    if (r.overtimeHours > rules.overtimeAboveHours)
      add(
        "overtime",
        `${r.overtimeHours} overtime hours scheduled, over the ${rules.overtimeAboveHours} hour line.`,
      );
    if (r.weeklyLaborBudget > 0 && r.budgetPct > rules.budgetAbovePct)
      add(
        "budget",
        `Labor is ${r.budgetPct}% of the weekly budget, over the ${rules.budgetAbovePct}% line.`,
      );
    if (rules.ppdOverGoal && r.targetPpd > 0 && r.ppd > r.targetPpd)
      add("ppd", `PPD ${r.ppd} is above the ${r.targetPpd} goal.`);
    if (r.openSlots > rules.openSlotsAbove)
      add(
        "open",
        `${r.openSlots} open slot${r.openSlots === 1 ? "" : "s"} this week, over the ${rules.openSlotsAbove} line.`,
        "critical",
      );
  }

  return { rules, weekStart: rollup.weekStart, weekEnd: rollup.weekEnd, breaches };
}

/** Runs inside the hourly cycle. Notifies once per building per rule per week. */
export async function rollupAlertSweep() {
  const { rules, sent } = await readConfig();
  if (!rules.enabled) return { checked: 0, notified: 0, skipped: true as const };

  const { weekStart, weekEnd, breaches } = await evaluateRollupAlerts();
  const nextSent: Sent = {};
  // Keep only this week's markers so the map cannot grow forever.
  for (const [k, v] of Object.entries(sent)) if (k.startsWith(`${weekStart}|`)) nextSent[k] = v;

  let notified = 0;
  for (const b of breaches) {
    const key = `${weekStart}|${b.facilityId}|${b.metric}`;
    if (nextSent[key]) continue;
    await db.from("notifications").insert({
      audience: "manager",
      title: `${b.facility} — ${METRIC_LABEL[b.metric] ?? b.metric} alert`,
      body: `${b.facility}, week of ${weekStart} through ${weekEnd}: ${b.message}`,
    });
    await db.from("staffing_alerts").insert({
      severity: b.severity,
      shift_date: weekStart,
      message: `${b.facility}: ${b.message}`,
      status: "open",
    });
    nextSent[key] = new Date().toISOString();
    notified += 1;
  }

  await write(rules, nextSent, null);
  return { checked: breaches.length, notified, skipped: false as const };
}
