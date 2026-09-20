import { db, loadActor, requireManager, today } from "./staffing.server";
import {
  defaultDueOn,
  loadPhaseCorrections,
  loadPhaseOverrides,
  type PhaseKey,
} from "./onboarding-phases.server";

export type TimelineEvent = {
  label: string;
  at: string | null;
  done: boolean;
};

export type TimelinePhase = {
  key: "paperwork" | "screening" | "training" | "start";
  title: string;
  blurb: string;
  status: "not_started" | "in_progress" | "blocked" | "complete";
  startedAt: string | null;
  completedAt: string | null;
  progress: number;
  dueOn: string | null;
  overdue: boolean;
  corrected: boolean;
  note: string;
  correctedBy: string;
  events: TimelineEvent[];
  nextStep: string;
  action: null | {
    kind: "start_packet" | "open_paperwork" | "open_training" | "add_to_roster" | "set_start_date";
    label: string;
  };
};

type BasePhase = Omit<TimelinePhase, "dueOn" | "overdue" | "corrected" | "note" | "correctedBy">;

function addDays(date: string, days: number) {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function pct(done: number, total: number) {
  return total === 0 ? 0 : Math.round((done / total) * 100);
}

/** Full onboarding story for one new hire: paperwork, screening, training, start date. */
export async function onboardingTimelineQuery(
  userId: string | null,
  newHireId: string,
  opts: { skipAuth?: boolean } = {},
) {
  if (!opts.skipAuth) {
    const actor = await loadActor(userId as string);
    requireManager(actor);
  }

  const { data: hire } = await db.from("new_hires").select("*").eq("id", newHireId).maybeSingle();
  if (!hire) throw new Error("That new hire record no longer exists.");

  const [
    { data: docs },
    { data: checks },
    { data: courses },
    { data: completions },
    { data: audits },
  ] = await Promise.all([
    db.from("hire_documents").select("*").eq("new_hire_id", newHireId),
    db.from("screening_checks").select("*").eq("new_hire_id", newHireId),
    db
      .from("inservice_courses")
      .select("id, title, required_for_new_hires, applies_to_positions, is_active"),
    db
      .from("course_completions")
      .select("course_id, completed_on, due_on")
      .eq("new_hire_id", newHireId),
    db
      .from("audit_log")
      .select("action, details, created_at")
      .eq("entity", "new_hire")
      .eq("entity_id", newHireId)
      .order("created_at", { ascending: true }),
  ]);

  const docList = docs ?? [];
  const checkList = checks ?? [];
  const auditList = audits ?? [];
  const now = today();

  const firstAudit = (action: string) =>
    auditList.find((a) => a.action === action)?.created_at ?? null;
  const stepAt = (key: string) =>
    auditList.find(
      (a) =>
        a.action === "new_hire_step" &&
        (a.details as Record<string, unknown> | null)?.["step"] === key,
    )?.created_at ?? null;

  const earliest = (values: Array<string | null>) => values.filter(Boolean).sort()[0] ?? null;
  const latest = (values: Array<string | null>) =>
    values.filter(Boolean).sort().slice(-1)[0] ?? null;

  // ---- Paperwork -----------------------------------------------------------
  const signed = docList.filter((d) => d.status === "signed");
  const paperworkEvents: TimelineEvent[] = docList
    .slice()
    .sort((a, b) => a.title.localeCompare(b.title))
    .map((d) => ({
      label:
        d.status === "signed" ? `${d.title} signed` : `${d.title} sent, waiting on a signature`,
      at: d.signed_at ?? d.sent_at ?? null,
      done: d.status === "signed",
    }));
  if (hire.offer_accepted)
    paperworkEvents.unshift({
      label: "Offer accepted",
      at: stepAt("offer_accepted") ?? hire.offer_date,
      done: true,
    });

  const paperworkComplete = docList.length > 0 && signed.length === docList.length;
  const paperwork: BasePhase = {
    key: "paperwork",
    title: "Paperwork",
    blurb: "Offer letter, I-9, tax forms and handbook sign-off.",
    status: docList.length === 0 ? "not_started" : paperworkComplete ? "complete" : "in_progress",
    startedAt: earliest(docList.map((d) => d.sent_at)) ?? firstAudit("onboarding_packet_started"),
    completedAt: paperworkComplete ? latest(signed.map((d) => d.signed_at)) : null,
    progress: pct(signed.length, docList.length),
    events: paperworkEvents,
    nextStep:
      docList.length === 0
        ? "Nothing has been sent yet. Send the signing packet to get paperwork moving."
        : paperworkComplete
          ? "All documents are signed — nothing left here."
          : `Waiting on ${docList.length - signed.length} signature${docList.length - signed.length === 1 ? "" : "s"}. Follow up or mark them signed on the Paperwork page.`,
    action:
      docList.length === 0
        ? { kind: "start_packet", label: "Send the packet" }
        : paperworkComplete
          ? null
          : { kind: "open_paperwork", label: "Open paperwork" },
  };

  // ---- Background screening ------------------------------------------------
  const passed = checkList.filter((c) => c.status === "passed" || c.status === "completed");
  const failed = checkList.filter((c) => c.status === "failed");
  const screeningEvents: TimelineEvent[] = checkList
    .slice()
    .sort((a, b) => a.kind.localeCompare(b.kind))
    .map((c) => ({
      label:
        c.status === "failed"
          ? `${c.kind} came back failed`
          : passed.includes(c)
            ? `${c.kind} cleared`
            : `${c.kind} ordered`,
      at: c.completed_on ?? c.ordered_on ?? null,
      done: passed.includes(c),
    }));
  const screeningComplete = checkList.length > 0 && passed.length === checkList.length;
  const screening: BasePhase = {
    key: "screening",
    title: "Background screening",
    blurb: "Criminal background, drug screen, license verification, TB and physical.",
    status:
      checkList.length === 0
        ? "not_started"
        : failed.length > 0
          ? "blocked"
          : screeningComplete
            ? "complete"
            : "in_progress",
    startedAt: earliest(checkList.map((c) => c.ordered_on)),
    completedAt: screeningComplete ? latest(passed.map((c) => c.completed_on)) : null,
    progress: pct(passed.length, checkList.length),
    events: screeningEvents,
    nextStep:
      checkList.length === 0
        ? "No checks have been ordered. Send the packet to order every screening at once."
        : failed.length > 0
          ? `${failed.length} check${failed.length === 1 ? "" : "s"} came back failed — this person cannot start until that is resolved.`
          : screeningComplete
            ? "Every screening cleared."
            : `${checkList.length - passed.length} check${checkList.length - passed.length === 1 ? "" : "s"} still out. Record the result when the vendor reports back.`,
    action:
      checkList.length === 0
        ? { kind: "start_packet", label: "Order screenings" }
        : screeningComplete
          ? null
          : { kind: "open_paperwork", label: "Open screenings" },
  };

  // ---- Training ------------------------------------------------------------
  const required = (courses ?? []).filter(
    (c) =>
      c.is_active &&
      c.required_for_new_hires &&
      (c.applies_to_positions?.length ? c.applies_to_positions.includes(hire.position) : true),
  );
  const doneCourses = new Set((completions ?? []).map((c) => c.course_id));
  const trainingEvents: TimelineEvent[] = required.map((c) => {
    const hit = (completions ?? []).find((x) => x.course_id === c.id);
    return {
      label: hit ? `${c.title} completed` : `${c.title} not completed yet`,
      at: hit?.completed_on ?? null,
      done: Boolean(hit),
    };
  });
  if (hire.orientation_start)
    trainingEvents.unshift({
      label: `Orientation ${hire.orientation_start} → ${hire.orientation_end ?? "end date not set"}`,
      at: hire.orientation_start,
      done: Boolean(hire.orientation_end && hire.orientation_end < now),
    });
  const trainingDone = required.filter((c) => doneCourses.has(c.id)).length;
  const trainingComplete =
    required.length > 0 && trainingDone === required.length && Boolean(hire.orientation_scheduled);
  const training: BasePhase = {
    key: "training",
    title: "Training & orientation",
    blurb: "Required in-services plus orientation shadowing with a preceptor.",
    status:
      !hire.orientation_scheduled && trainingDone === 0
        ? "not_started"
        : trainingComplete
          ? "complete"
          : "in_progress",
    startedAt: hire.orientation_start ?? stepAt("orientation_scheduled"),
    completedAt: trainingComplete
      ? (hire.orientation_end ?? latest((completions ?? []).map((c) => c.completed_on)))
      : null,
    progress: pct(trainingDone + (hire.orientation_scheduled ? 1 : 0), required.length + 1),
    events: trainingEvents,
    nextStep: !hire.orientation_scheduled
      ? "Orientation is not scheduled yet. Set the orientation dates and pick a preceptor."
      : !hire.preceptor_id
        ? "Orientation dates are set but no preceptor is assigned — pick who they shadow."
        : trainingDone < required.length
          ? `${required.length - trainingDone} required course${required.length - trainingDone === 1 ? "" : "s"} left to finish.`
          : "Orientation and all required courses are done.",
    action:
      trainingDone < required.length || !hire.orientation_scheduled
        ? { kind: "open_training", label: "Open training" }
        : null,
  };

  // ---- Start date ----------------------------------------------------------
  const daysOut = hire.start_date
    ? Math.round(
        (Date.parse(`${hire.start_date}T00:00:00Z`) - Date.parse(`${now}T00:00:00Z`)) / 86_400_000,
      )
    : null;
  const onRoster = Boolean(hire.employee_id);
  const startEvents: TimelineEvent[] = [
    {
      label: hire.offer_date ? `Offer made ${hire.offer_date}` : "Offer date not recorded",
      at: hire.offer_date,
      done: Boolean(hire.offer_date),
    },
    {
      label: hire.start_date ? `Start date ${hire.start_date}` : "Start date not set",
      at: hire.start_date,
      done: Boolean(hire.start_date),
    },
    {
      label: hire.badge_issued
        ? "Badge & clock-in number issued"
        : "Badge & clock-in number not issued",
      at: stepAt("badge_issued"),
      done: hire.badge_issued,
    },
    {
      label: hire.charting_login_created ? "Charting login created" : "Charting login not created",
      at: stepAt("charting_login_created"),
      done: hire.charting_login_created,
    },
    {
      label: onRoster ? "On the roster in orientation mode" : "Not on the roster yet",
      at: firstAudit("new_hire_converted"),
      done: onRoster,
    },
  ];
  const blockers = [
    !paperworkComplete ? "paperwork" : null,
    screening.status !== "complete" ? "screening" : null,
    !hire.orientation_scheduled ? "orientation" : null,
  ].filter(Boolean) as string[];
  const start: BasePhase = {
    key: "start",
    title: "Start date",
    blurb: "Everything that has to be true before their first real shift.",
    status: onRoster
      ? "complete"
      : failed.length > 0
        ? "blocked"
        : hire.start_date
          ? "in_progress"
          : "not_started",
    startedAt: hire.offer_date,
    completedAt: onRoster ? firstAudit("new_hire_converted") : null,
    progress: pct(startEvents.filter((e) => e.done).length, startEvents.length),
    events: startEvents,
    nextStep: onRoster
      ? "They are on the roster and working in orientation mode."
      : !hire.start_date
        ? "Set a start date so orientation and the schedule can be planned around it."
        : blockers.length
          ? `Starts ${hire.start_date}${daysOut !== null ? ` (${daysOut} day${Math.abs(daysOut) === 1 ? "" : "s"} out)` : ""}, but ${blockers.join(", ")} still need${blockers.length === 1 ? "s" : ""} to finish first.`
          : "Everything is clear — put them on the roster in orientation mode.",
    action: onRoster
      ? null
      : !hire.start_date
        ? { kind: "set_start_date", label: "Set a start date" }
        : blockers.length === 0
          ? { kind: "add_to_roster", label: "Add to the roster" }
          : null,
  };

  // ---- Hand corrections ----------------------------------------------------
  const [overrides, corrections] = await Promise.all([
    loadPhaseOverrides(newHireId),
    loadPhaseCorrections(newHireId),
  ]);

  const phases = [paperwork, screening, training, start].map((p) => {
    const o = overrides[p.key];
    const dueOn = o?.dueOn ?? defaultDueOn(hire.start_date, p.key as PhaseKey);
    const status = (o?.status as TimelinePhase["status"] | undefined) ?? p.status;
    const completedAt = o?.completedAt ?? p.completedAt;
    const merged: TimelinePhase = {
      ...p,
      status,
      startedAt: o?.startedAt ?? p.startedAt,
      completedAt,
      progress: status === "complete" ? 100 : p.progress,
      dueOn,
      overdue: Boolean(dueOn && status !== "complete" && dueOn < now),
      corrected: Boolean(o),
      note: o?.note ?? "",
      correctedBy: o?.updatedBy ?? "",
      action: status === "complete" ? null : p.action,
      nextStep:
        status === "complete" && p.status !== "complete"
          ? `Marked done by hand${o?.updatedBy ? ` by ${o.updatedBy}` : ""}.${o?.note ? ` ${o.note}` : ""}`
          : p.nextStep,
    };
    return merged;
  });
  const overall = Math.round(phases.reduce((sum, p) => sum + p.progress, 0) / phases.length);
  const nextAction =
    phases.find((p) => p.action)?.nextStep ?? "Nothing is waiting on you for this person.";

  return {
    hire: {
      id: hire.id,
      fullName: hire.full_name,
      position: hire.position,
      startDate: hire.start_date,
      status: hire.status,
      daysOut,
      readyBy: hire.start_date ? addDays(hire.start_date, -1) : null,
    },
    phases,
    corrections,
    overall,
    nextAction,
    atRisk:
      Boolean(hire.start_date && daysOut !== null && daysOut <= 7 && overall < 100) ||
      failed.length > 0,
  };
}
