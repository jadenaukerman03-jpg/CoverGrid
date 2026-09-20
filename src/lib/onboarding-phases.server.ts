import { db, loadActor, logAudit, requireManager, today } from "./staffing.server";

export const PHASE_KEYS = ["paperwork", "screening", "training", "start"] as const;
export type PhaseKey = (typeof PHASE_KEYS)[number];

export const PHASE_TITLE: Record<PhaseKey, string> = {
  paperwork: "Paperwork",
  screening: "Background screening",
  training: "Training & orientation",
  start: "Start date",
};

/** How many days before the start date each phase should be finished. */
const LEAD_DAYS: Record<PhaseKey, number> = { paperwork: 7, screening: 5, training: 1, start: 0 };

/** How often we nudge on the same phase, in days. */
const REMINDER_GAP_DAYS = 2;

export type PhaseOverride = {
  phase: PhaseKey;
  status: string | null;
  startedAt: string | null;
  completedAt: string | null;
  dueOn: string | null;
  note: string;
  updatedBy: string;
  updatedAt: string;
};

function shiftDate(date: string, days: number) {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function daysBetween(a: string, b: string) {
  return Math.round((Date.parse(`${a}T00:00:00Z`) - Date.parse(`${b}T00:00:00Z`)) / 86_400_000);
}

export function defaultDueOn(startDate: string | null, phase: PhaseKey) {
  if (!startDate) return null;
  return shiftDate(startDate, -LEAD_DAYS[phase]);
}

export async function loadPhaseOverrides(
  newHireId: string,
): Promise<Record<string, PhaseOverride>> {
  const { data } = await db
    .from("onboarding_phase_status")
    .select("phase, status, started_at, completed_at, due_on, note, updated_by, updated_at")
    .eq("new_hire_id", newHireId);
  const out: Record<string, PhaseOverride> = {};
  for (const row of data ?? []) {
    out[row.phase as string] = {
      phase: row.phase as PhaseKey,
      status: (row.status as string | null) ?? null,
      startedAt: (row.started_at as string | null) ?? null,
      completedAt: (row.completed_at as string | null) ?? null,
      dueOn: (row.due_on as string | null) ?? null,
      note: (row.note as string) ?? "",
      updatedBy: (row.updated_by as string) ?? "",
      updatedAt: row.updated_at as string,
    };
  }
  return out;
}

/** Every hand correction ever made to this person's onboarding, newest first. */
export async function loadPhaseCorrections(newHireId: string) {
  const { data } = await db
    .from("audit_log")
    .select("id, actor, details, created_at")
    .eq("entity", "onboarding_phase")
    .eq("entity_id", newHireId)
    .order("created_at", { ascending: false })
    .limit(50);
  return (data ?? []).map((row) => {
    const d = (row.details ?? {}) as Record<string, unknown>;
    return {
      id: row.id as string,
      at: row.created_at as string,
      actor: row.actor as string,
      phase: String(d["phase"] ?? ""),
      phaseTitle: PHASE_TITLE[(d["phase"] as PhaseKey) ?? "paperwork"] ?? String(d["phase"] ?? ""),
      summary: String(d["summary"] ?? "Updated"),
      note: String(d["note"] ?? ""),
    };
  });
}

export type PhaseUpdateInput = {
  newHireId: string;
  phase: PhaseKey;
  status?: string | null | undefined;
  startedAt?: string | null | undefined;
  completedAt?: string | null | undefined;
  dueOn?: string | null | undefined;
  note?: string | undefined;
};

/** Manager correction: set a phase's status, its dates, and say why. */
export async function updateOnboardingPhaseAction(userId: string, input: PhaseUpdateInput) {
  const actor = await loadActor(userId);
  requireManager(actor);
  const who =
    actor.employee?.full_name ?? actor.profile?.full_name ?? actor.profile?.email ?? "A manager";

  const { data: hire } = await db
    .from("new_hires")
    .select("id, full_name")
    .eq("id", input.newHireId)
    .maybeSingle();
  if (!hire) throw new Error("That new hire record no longer exists.");

  const { data: existing } = await db
    .from("onboarding_phase_status")
    .select("*")
    .eq("new_hire_id", input.newHireId)
    .eq("phase", input.phase)
    .maybeSingle();

  const patch: {
    new_hire_id: string;
    phase: string;
    note: string;
    updated_by: string;
    updated_at: string;
    last_reminded_on: string | null;
    status?: string | null;
    started_at?: string | null;
    completed_at?: string | null;
    due_on?: string | null;
  } = {
    new_hire_id: input.newHireId,
    phase: input.phase,
    last_reminded_on: null,
    note: input.note ?? (existing?.note as string | undefined) ?? "",
    updated_by: who,
    updated_at: new Date().toISOString(),
  };
  // A fresh correction restarts the reminder clock so people are not double-nudged.
  if (input.status !== undefined) patch.status = input.status;
  if (input.startedAt !== undefined) patch.started_at = input.startedAt;
  if (input.completedAt !== undefined) patch.completed_at = input.completedAt;
  if (input.dueOn !== undefined) patch.due_on = input.dueOn;

  if (existing) {
    await db.from("onboarding_phase_status").update(patch).eq("id", existing.id);
  } else {
    await db.from("onboarding_phase_status").insert(patch);
  }

  const changes: string[] = [];
  if (input.status !== undefined && input.status !== (existing?.status ?? null))
    changes.push(`status set to ${input.status ?? "automatic"}`);
  if (input.startedAt !== undefined && input.startedAt !== (existing?.started_at ?? null))
    changes.push(`started ${input.startedAt ? input.startedAt.slice(0, 10) : "cleared"}`);
  if (input.completedAt !== undefined && input.completedAt !== (existing?.completed_at ?? null))
    changes.push(`finished ${input.completedAt ? input.completedAt.slice(0, 10) : "cleared"}`);
  if (input.dueOn !== undefined && input.dueOn !== (existing?.due_on ?? null))
    changes.push(`due ${input.dueOn ?? "cleared"}`);
  if (input.note && input.note !== (existing?.note ?? "")) changes.push("note added");
  const summary = changes.length
    ? `${PHASE_TITLE[input.phase]}: ${changes.join(", ")}`
    : `${PHASE_TITLE[input.phase]} reviewed`;

  await logAudit("onboarding_phase_updated", who, "onboarding_phase", input.newHireId, {
    phase: input.phase,
    summary,
    note: input.note ?? "",
    hire: hire.full_name,
  });

  return { ok: true as const, summary };
}

/** Clear a correction and go back to what the system works out on its own. */
export async function clearOnboardingPhaseAction(
  userId: string,
  newHireId: string,
  phase: PhaseKey,
) {
  const actor = await loadActor(userId);
  requireManager(actor);
  const who = actor.employee?.full_name ?? actor.profile?.full_name ?? "A manager";
  await db.from("onboarding_phase_status").delete().eq("new_hire_id", newHireId).eq("phase", phase);
  await logAudit("onboarding_phase_updated", who, "onboarding_phase", newHireId, {
    phase,
    summary: `${PHASE_TITLE[phase]}: correction removed, back to tracking itself`,
    note: "",
  });
  return { ok: true as const };
}

type PhaseState = { key: PhaseKey; complete: boolean; dueOn: string | null; nextStep: string };

/**
 * Nudges every onboarding phase that is past due or coming up, by text and in the app,
 * to the new hire, their recruiter/manager group, and the preceptor when training is late.
 */
export async function onboardingReminderSweep() {
  const { getNotifyPrefs, notifyEmployee, queueText } = await import("./messaging.server");
  const prefs = await getNotifyPrefs();
  if (!prefs.onboarding)
    return { checked: 0, reminders: 0, overdue: 0, skipped: "notifications_off" as const };

  const now = today();
  const { data: hires } = await db
    .from("new_hires")
    .select(
      "id, full_name, phone, position, start_date, status, employee_id, preceptor_id, orientation_scheduled",
    )
    .is("employee_id", null)
    .not("status", "in", '("withdrawn","declined","cancelled")');

  let reminders = 0;
  let overdue = 0;
  let checked = 0;

  for (const hire of hires ?? []) {
    const { onboardingTimelineQuery } = await import("./timeline.impl.server");
    let phases: PhaseState[];
    try {
      const timeline = await onboardingTimelineQuery(null, hire.id as string, { skipAuth: true });
      phases = timeline.phases.map((p) => ({
        key: p.key,
        complete: p.status === "complete",
        dueOn: p.dueOn,
        nextStep: p.nextStep,
      }));
    } catch {
      continue;
    }
    checked += 1;

    const { data: rows } = await db
      .from("onboarding_phase_status")
      .select("phase, last_reminded_on, reminder_count")
      .eq("new_hire_id", hire.id);
    const lastById = new Map((rows ?? []).map((r) => [r.phase as string, r]));

    for (const phase of phases) {
      if (phase.complete || !phase.dueOn) continue;
      const daysLeft = daysBetween(phase.dueOn, now);
      // Nudge three days out, on the due date, and every couple of days after.
      if (daysLeft > 3) continue;
      const last = lastById.get(phase.key);
      const lastOn = (last?.last_reminded_on as string | null) ?? null;
      if (lastOn && daysBetween(now, lastOn) < REMINDER_GAP_DAYS) continue;

      const late = daysLeft < 0;
      if (late) overdue += 1;
      const timing = late
        ? `${Math.abs(daysLeft)} day${Math.abs(daysLeft) === 1 ? "" : "s"} past due`
        : daysLeft === 0
          ? "due today"
          : `due in ${daysLeft} day${daysLeft === 1 ? "" : "s"}`;
      const title = `${PHASE_TITLE[phase.key]} for ${hire.full_name} is ${timing}`;
      const body = `${phase.nextStep} Target date ${phase.dueOn}${hire.start_date ? `, start date ${hire.start_date}` : ""}.`;

      await db.from("notifications").insert({
        audience: "manager",
        title,
        body,
      });

      if (hire.phone) {
        await queueText({
          phone: hire.phone as string,
          body: `${PHASE_TITLE[phase.key]} for your start at the facility is ${timing}. ${phase.nextStep} Reply here if you need help.`,
          kind: "onboarding",
        }).catch(() => undefined);
      }

      if (phase.key === "training" && late && hire.preceptor_id) {
        await notifyEmployee({
          employeeId: hire.preceptor_id as string,
          category: "onboarding",
          title: `Orientation for ${hire.full_name} is behind`,
          body,
          text: `Orientation for ${hire.full_name} is ${timing}. ${phase.nextStep}`,
          kind: "onboarding",
        }).catch(() => undefined);
      }

      const count = Number(last?.reminder_count ?? 0) + 1;
      if (last) {
        await db
          .from("onboarding_phase_status")
          .update({ last_reminded_on: now, reminder_count: count })
          .eq("new_hire_id", hire.id)
          .eq("phase", phase.key);
      } else {
        await db.from("onboarding_phase_status").insert({
          new_hire_id: hire.id as string,
          phase: phase.key,
          last_reminded_on: now,
          reminder_count: count,
        });
      }
      reminders += 1;
    }
  }

  return { checked, reminders, overdue, skipped: null };
}
