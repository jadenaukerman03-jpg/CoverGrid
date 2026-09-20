import { loadActor, requireManager } from "./staffing.server";
import { corporateRollup } from "./rollup.server";
import { payrollHandoff } from "./payroll-handoff.server";
import {
  evaluateRollupAlerts,
  getRollupAlertRules,
  saveRollupAlertRules,
  type RollupAlertRulesInput,
} from "./rollup-alerts.server";

async function manager(userId: string) {
  const actor = await loadActor(userId);
  requireManager(actor);
  return actor;
}
const label = (a: Awaited<ReturnType<typeof loadActor>>) =>
  a.employee?.full_name ?? a.profile?.full_name ?? a.profile?.email ?? "a manager";

export async function rollupQuery(userId: string, weekStart?: string) {
  await manager(userId);
  return corporateRollup(weekStart);
}

export async function payrollHandoffAction(userId: string, employeeId: string) {
  const actor = await manager(userId);
  return payrollHandoff(employeeId, label(actor));
}

export async function rollupAlertRulesQuery(userId: string, weekStart?: string) {
  await manager(userId);
  const [rules, evaluation] = await Promise.all([
    getRollupAlertRules(),
    evaluateRollupAlerts(weekStart),
  ]);
  return {
    rules,
    breaches: evaluation.breaches,
    weekStart: evaluation.weekStart,
    weekEnd: evaluation.weekEnd,
  };
}

export async function saveRollupAlertRulesAction(userId: string, input: RollupAlertRulesInput) {
  const actor = await manager(userId);
  return saveRollupAlertRules(input, label(actor));
}
