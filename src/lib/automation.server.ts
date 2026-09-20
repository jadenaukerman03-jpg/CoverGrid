// Autonomous monitoring: coverage watch (minute-by-minute), attendance sweep, schedule horizon.
import { credentialSweep, riskSweep, trainingSweep } from "./ops.server";
import {
  POSITION_LABEL,
  SHIFT_LABEL,
  TERMINATION_POINTS,
  addDays,
  attendanceStatus,
  shiftHours,
  type PositionType,
  type ShiftType,
} from "./facility";
import {
  autoFillGaps,
  db,
  findCandidates,
  describeCoverageRow,
  getCoverage,
  logAudit,
  today,
} from "./staffing.server";
import { applyEarnedBuyback, getBuybackConfig } from "./buyback.server";
import { extendScheduleHorizon } from "./rotation.server";
import { flushOutbox, queueText } from "./messaging.server";
import { paperworkSweep } from "./paperwork.server";
import { getAutopilotSettings, markAutopilotRun } from "./settings.server";
import {
  autoRequisition,
  ensureCensus,
  ensurePayrollPeriods,
  punchSweep,
  retentionSweep,
} from "./workforce.server";

const ACTOR = "automation";
export const POINT_THRESHOLDS = [3, 5, 7];

async function notifyOnce(input: {
  employeeId?: string | null;
  audience?: "employee" | "manager";
  title: string;
  body: string;
  withinHours?: number;
}) {
  const since = new Date(Date.now() - (input.withinHours ?? 24) * 3600_000).toISOString();
  let q = db
    .from("notifications")
    .select("id")
    .eq("title", input.title)
    .eq("body", input.body)
    .gte("created_at", since)
    .limit(1);
  q = input.employeeId ? q.eq("employee_id", input.employeeId) : q.is("employee_id", null);
  const { data } = await q;
  if (data && data.length) return false;
  await db.from("notifications").insert({
    employee_id: input.employeeId ?? null,
    audience: input.audience ?? (input.employeeId ? "employee" : "manager"),
    title: input.title,
    body: input.body,
  });
  if (input.employeeId) {
    // The phone is where staff actually see it.
    await queueText({
      employeeId: input.employeeId,
      body: `${input.title}. ${input.body}`,
      kind: input.title.toLowerCase().includes("open shift") ? "open_shift" : "notice",
    }).catch(() => undefined);
  }
  return true;
}

/** Watch the next N days for understaffing: raise alerts and invite qualified staff to pick shifts up. */
export async function monitorCoverage(days = 14, buffer = 0) {
  const from = today();
  const to = addDays(from, days);
  const coverage = await getCoverage(from, to, buffer);
  const gaps = coverage.filter((c) => c.gap > 0);

  const { data: openAlerts } = await db
    .from("staffing_alerts")
    .select("id,shift_date,shift,unit_id,position,status")
    .eq("status", "open");
  const openKeys = new Set(
    (openAlerts ?? []).map((a) => `${a.shift_date}|${a.shift}|${a.unit_id}|${a.position}`),
  );
  const gapKeys = new Set(gaps.map((g) => `${g.date}|${g.shift}|${g.unitId}|${g.position}`));

  // Close alerts whose gap has been resolved.
  const resolved = (openAlerts ?? []).filter(
    (a) => a.shift_date && !gapKeys.has(`${a.shift_date}|${a.shift}|${a.unit_id}|${a.position}`),
  );
  if (resolved.length) {
    await db
      .from("staffing_alerts")
      .update({ status: "resolved" })
      .in(
        "id",
        resolved.map((a) => a.id),
      );
  }

  const newAlerts = gaps.filter(
    (g) => !openKeys.has(`${g.date}|${g.shift}|${g.unitId}|${g.position}`),
  );
  if (newAlerts.length) {
    await db.from("staffing_alerts").insert(
      newAlerts.map((g) => ({
        severity: g.date <= addDays(from, 1) ? "critical" : "warning",
        shift_date: g.date,
        shift: g.shift as ShiftType,
        unit_id: g.unitId,
        position: g.position as PositionType,
        message: `${describeCoverageRow(g)} (Verified minute-by-minute)`,
        status: "open",
      })),
    );
  }

  // Invite qualified, active employees to pick up the nearest open shifts.
  let invited = 0;
  const cushionShort = coverage.filter((c) => (c.bufferGap ?? c.gap) > 0);
  const soon = cushionShort.filter((g) => g.date <= addDays(from, 7)).slice(0, 20);
  if (soon.length) {
    const { data: emps } = await db
      .from("employees")
      .select("id,full_name,position,primary_unit_id,qualified_unit_ids,is_active")
      .eq("is_active", true);
    for (const g of soon) {
      const eligible = (emps ?? []).filter(
        (e) =>
          e.position === g.position &&
          (e.primary_unit_id === g.unitId || (e.qualified_unit_ids ?? []).includes(g.unitId)),
      );
      for (const e of eligible.slice(0, 12)) {
        const created = await notifyOnce({
          employeeId: e.id,
          title: "Open shift available to pick up",
          body: `${g.unitName} · ${SHIFT_LABEL[g.shift].toLowerCase()} · ${POSITION_LABEL[g.position]} on ${g.date} needs ${g.gap} more staff.`,
          withinHours: 48,
        });
        if (created) invited++;
      }
    }
  }

  const critical = gaps.filter((g) => g.date <= addDays(from, 1));
  for (const g of critical.slice(0, 10)) {
    await notifyOnce({
      audience: "manager",
      title: "Critical staffing gap",
      body: describeCoverageRow(g),
      withinHours: 12,
    });
  }

  return {
    scanned: coverage.length,
    gaps: gaps.length,
    alertsOpened: newAlerts.length,
    alertsResolved: resolved.length,
    invitations: invited,
    critical: critical.length,
  };
}

/** Close out past shifts and warn on attendance point thresholds. */
export async function attendanceSweep() {
  const cutoff = today();
  const { data: past } = await db
    .from("shift_assignments")
    .select("id,shift_date,employee_id,status")
    .lt("shift_date", cutoff)
    .eq("status", "scheduled")
    .not("employee_id", "is", null)
    .limit(500);
  if (past && past.length) {
    await db
      .from("shift_assignments")
      .update({ status: "completed" })
      .in(
        "id",
        past.map((a) => a.id),
      );
  }

  const { data: events } = await db.from("attendance_events").select("employee_id,points");
  const totals = new Map<string, number>();
  for (const e of events ?? [])
    totals.set(e.employee_id, (totals.get(e.employee_id) ?? 0) + Number(e.points));
  // Points bought back by picking up extra shifts come off the running total.
  const { data: backs } = await db.from("point_buybacks").select("employee_id,points_removed");
  for (const b of backs ?? []) {
    const id = b.employee_id as string;
    totals.set(id, Math.max(0, (totals.get(id) ?? 0) - Number(b.points_removed)));
  }

  // Award any earned buy-backs (no-op when the buy-back system is switched off).
  let buybacksApplied = 0;
  const cfg = await getBuybackConfig();
  if (cfg.enabled) {
    for (const [empId, total] of totals) {
      if (total <= 0) continue;
      const res = await applyEarnedBuyback(empId, "the system").catch(() => ({
        applied: false as const,
      }));
      if (res.applied) {
        buybacksApplied++;
        totals.set(empId, Math.max(0, total - (res as { points: number }).points));
      }
    }
  }

  const flagged = Array.from(totals.entries()).filter(([, t]) => t >= POINT_THRESHOLDS[0]!);
  let warned = 0;
  if (flagged.length) {
    const { data: emps } = await db
      .from("employees")
      .select("id,full_name")
      .in(
        "id",
        flagged.map(([id]) => id),
      );
    const names = new Map((emps ?? []).map((e) => [e.id, e.full_name]));
    for (const [empId, total] of flagged) {
      const status = attendanceStatus(total);
      const reached = status.reached!;
      const created = await notifyOnce({
        employeeId: empId,
        title:
          total >= TERMINATION_POINTS
            ? "Attendance: determination point reached"
            : `Attendance notice — ${status.total} points (${reached.label})`,
        body:
          total >= TERMINATION_POINTS
            ? `Your attendance total is ${status.total} points, at the ${TERMINATION_POINTS}-point determination level. ${reached.detail} Open the Attendance points page to see every occurrence.`
            : `Your attendance total is ${status.total} points — ${reached.label.toLowerCase()}. ${reached.detail} You are ${status.remainingToTermination} point${status.remainingToTermination === 1 ? "" : "s"} from the ${TERMINATION_POINTS}-point determination level. Late arrivals are 0.5 points, call-offs are 1 point, and points fall off after 12 months. Open the Attendance points page for your full history.`,
        withinHours: 24 * 7,
      });
      const mgr = await notifyOnce({
        audience: "manager",
        title: `Attendance threshold — ${reached.label}`,
        body: `${names.get(empId) ?? "An employee"} is at ${status.total} attendance points (${reached.label}), ${status.remainingToTermination} from the determination point.`,
        withinHours: 24 * 7,
      });
      if (created || mgr) warned++;
    }
  }

  return {
    shiftsClosed: past?.length ?? 0,
    thresholdWarnings: warned,
    monitored: totals.size,
    buybacksApplied,
  };
}

/**
 * Watch-only preview: work out exactly what the system would do, and why,
 * without moving anybody. Used when leadership wants to see before it acts.
 */
export async function previewCycle(buffer: number, days: number) {
  const from = today();
  const to = addDays(from, days);
  const coverage = await getCoverage(from, to, buffer);
  const gaps = coverage.filter((c) => (c.bufferGap ?? c.gap) > 0);
  const recommendations: {
    date: string;
    unit: string;
    shift: string;
    position: string;
    cushion: boolean;
    wouldPick: string | null;
    why: string;
  }[] = [];

  for (const gap of gaps.slice(0, 40)) {
    const cushion = gap.gap === 0;
    // A throwaway open slot so the same ranking engine answers "who would you pick?".
    const { data: probe } = await db
      .from("shift_assignments")
      .insert({
        shift_date: gap.date,
        shift: gap.shift,
        unit_id: gap.unitId,
        position: gap.position,
        status: "open",
        hours: shiftHours(gap.position),
        note: "Watch-only preview probe",
      })
      .select("id")
      .maybeSingle();
    if (!probe) continue;
    try {
      const search = await findCandidates(probe.id, 2);
      const best = search.candidates[0];
      recommendations.push({
        date: gap.date,
        unit: gap.unitName,
        shift: SHIFT_LABEL[gap.shift],
        position: POSITION_LABEL[gap.position],
        cushion,
        wouldPick: best?.name ?? null,
        why: best
          ? `${best.name}: ${best.reasons.join("; ")}.${search.candidates[1] ? ` Next best ${search.candidates[1].name}.` : ""}`
          : `No qualified, rested employee is available — a manager would need to decide. ${search.rejected
              .slice(0, 3)
              .map((r) => `${r.name} — ${r.reason}`)
              .join("; ")}`,
      });
    } finally {
      await db.from("shift_assignments").delete().eq("id", probe.id);
    }
  }
  return { scanned: coverage.length, gaps: gaps.length, recommendations };
}

/** One full autonomous cycle. Safe to run repeatedly. */
export async function runAutomationCycle(options?: {
  horizonWeeks?: number;
  autoFillDays?: number;
  buffer?: number;
  source?: "manual" | "autopilot" | "apply";
}) {
  const settings = await getAutopilotSettings();
  if (options?.source === "autopilot" && !settings.autopilotEnabled) {
    return {
      ok: true as const,
      skipped: true as const,
      summary: `Automatic scheduling is switched off${settings.pausedReason ? ` — ${settings.pausedReason}` : ""}.`,
      details: {},
    };
  }
  if (settings.watchOnly && options?.source !== "apply") {
    const preview = await previewCycle(
      options?.buffer ?? settings.coverageBuffer,
      options?.autoFillDays ?? settings.autoFillDays,
    );
    const summary = `Watch-only: the system would fill ${preview.recommendations.length} shift${preview.recommendations.length === 1 ? "" : "s"} over the next ${options?.autoFillDays ?? settings.autoFillDays} days. No changes were made.`;
    await db.from("automation_runs").insert({
      kind: "preview",
      status: "ok",
      summary,
      details: JSON.parse(JSON.stringify(preview)),
    });
    return {
      ok: true as const,
      skipped: true as const,
      watchOnly: true as const,
      summary,
      details: preview,
    };
  }
  const horizonWeeks = options?.horizonWeeks ?? settings.horizonWeeks;
  const autoFillDays = options?.autoFillDays ?? settings.autoFillDays;
  const buffer = options?.buffer ?? settings.coverageBuffer;
  const started = Date.now();

  try {
    const horizon = await extendScheduleHorizon(today(), horizonWeeks, ACTOR);
    const fill = await autoFillGaps(today(), addDays(today(), autoFillDays), ACTOR, buffer);
    const monitor = await monitorCoverage(14, buffer);
    const attendance = await attendanceSweep();
    const census = await ensureCensus(addDays(today(), -14), addDays(today(), 14));
    const punches = await punchSweep();
    const payroll = await ensurePayrollPeriods();
    const requisitions = await autoRequisition();
    const retention = await retentionSweep();
    const credentials = await credentialSweep(ACTOR);
    const risk = await riskSweep();
    const training = await trainingSweep(ACTOR);
    const paperwork = await paperworkSweep();
    const feeds = await (await import("./integrations.server")).integrationHealthSweep();
    const perDiem = await (await import("./marketplace.impl.server")).marketplaceSweep();
    const inservice = await (await import("./hr.impl.server")).trainingComplianceSweep();
    const onboarding = await (await import("./onboarding-phases.server")).onboardingReminderSweep();
    const rollupAlerts = await (await import("./rollup-alerts.server")).rollupAlertSweep();
    const texts = await flushOutbox();

    const summary = `Generated ${horizon.created} rotation shifts, filled ${fill.filled.length} gaps, opened ${monitor.alertsOpened} alerts, closed ${attendance.shiftsClosed} past shifts, resolved ${punches.closed + punches.missing} punch exceptions, opened ${requisitions.created} requisitions, awarded ${retention.awarded} reward bonuses, sent ${credentials.warned.length} license reminders, pulled ${credentials.removed.length} lapsed staff off the schedule, scored ${risk.scored} people for call-off risk (${risk.high} likely), paired ${training.paired} orientation shifts, checked ${feeds.checked} outside system${feeds.checked === 1 ? "" : "s"} (${feeds.degraded.length} down, ${feeds.carriedCensusDays} census day${feeds.carriedCensusDays === 1 ? "" : "s"} carried forward) offered ${perDiem.offered} per-diem offer${perDiem.offered === 1 ? "" : "s"} on ${perDiem.shifts} open shift${perDiem.shifts === 1 ? "" : "s"}, sent ${inservice.notices} in-service reminder${inservice.notices === 1 ? "" : "s"} (${inservice.overdue} overdue) sent ${onboarding.reminders} onboarding reminder${onboarding.reminders === 1 ? "" : "s"} (${onboarding.overdue} past due) sent ${rollupAlerts.notified} rollup alert${rollupAlerts.notified === 1 ? "" : "s"} and sent ${texts.sent} text message${texts.sent === 1 ? "" : "s"}${texts.configured ? "" : " (texting is not connected yet)"}.`;
    const details = {
      horizon,
      fill: { filled: fill.filled.length, unresolved: fill.unresolved },
      monitor,
      attendance,
      census,
      punches,
      payroll,
      requisitions,
      retention,
      credentials,
      risk,
      training,
      paperwork,
      feeds,
      perDiem,
      inservice,
      onboarding,
      rollupAlerts,
      texts,
      ms: Date.now() - started,
    };
    await db.from("automation_runs").insert({
      kind: "cycle",
      status: "ok",
      summary,
      details: JSON.parse(JSON.stringify(details)),
    });
    await logAudit("automation_cycle", ACTOR, "system", null, { summary });
    await markAutopilotRun();
    return { ok: true as const, skipped: false as const, summary, details };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Automation failed";
    await db
      .from("automation_runs")
      .insert({ kind: "cycle", status: "error", summary: message, details: {} });
    throw err;
  }
}

export async function automationHistory(limit = 20) {
  const { data } = await db
    .from("automation_runs")
    .select("id,kind,status,summary,details,created_at")
    .order("created_at", { ascending: false })
    .limit(limit);
  return data ?? [];
}

export function projectedShiftHours(position: PositionType) {
  return shiftHours(position);
}
