// Hiring paperwork, screening checks and in-service training records.
import { POSITION_LABEL, addDays, type PositionType } from "./facility";
import { db, loadActor, logAudit, requireManager, today } from "./staffing.server";

async function manager(userId: string) {
  const actor = await loadActor(userId);
  requireManager(actor);
  return actor;
}
const label = (a: Awaited<ReturnType<typeof loadActor>>) =>
  a.employee?.full_name ?? a.profile?.full_name ?? a.profile?.email ?? "a manager";

/** The packet every new person signs before their first shift. */
export const DOCUMENT_PACKET: { type: string; title: string }[] = [
  { type: "offer_letter", title: "Offer letter" },
  { type: "i9", title: "Form I-9 (work eligibility)" },
  { type: "w4", title: "Form W-4 (tax withholding)" },
  { type: "direct_deposit", title: "Direct deposit authorization" },
  { type: "handbook", title: "Employee handbook acknowledgement" },
  { type: "confidentiality", title: "HIPAA & confidentiality agreement" },
  { type: "attendance_policy", title: "Attendance point policy acknowledgement" },
  { type: "job_description", title: "Job description acknowledgement" },
];

export const SCREENING_KINDS: { kind: string; title: string }[] = [
  { kind: "background", title: "Criminal background check" },
  { kind: "registry", title: "Nurse aide / abuse registry check" },
  { kind: "oig", title: "OIG exclusion list check" },
  { kind: "drug_screen", title: "Drug screen" },
  { kind: "everify", title: "E-Verify work eligibility" },
  { kind: "tb_physical", title: "TB test & physical" },
  { kind: "references", title: "Reference checks" },
];

export async function hrBoardQuery(userId: string) {
  await manager(userId);
  const [
    { data: hires },
    { data: docs },
    { data: checks },
    { data: courses },
    { data: completions },
    { data: staff },
  ] = await Promise.all([
    db.from("new_hires").select("id, full_name, position, start_date, status").order("start_date"),
    db.from("hire_documents").select("*").order("created_at", { ascending: false }),
    db.from("screening_checks").select("*").order("created_at", { ascending: false }),
    db.from("inservice_courses").select("*").eq("is_active", true).order("title"),
    db.from("course_completions").select("*").order("completed_on", { ascending: false }),
    db
      .from("employees")
      .select("id, full_name, position, in_training")
      .eq("is_active", true)
      .order("full_name"),
  ]);

  const hireList = hires ?? [];
  const docList = docs ?? [];
  const checkList = checks ?? [];
  const courseList = courses ?? [];
  const completionList = completions ?? [];
  const staffList = staff ?? [];
  const now = today();

  const hireName = new Map(hireList.map((h) => [h.id, h.full_name]));
  const staffName = new Map(staffList.map((s) => [s.id, s.full_name]));
  const nameFor = (d: { new_hire_id: string | null; employee_id: string | null }) =>
    (d.new_hire_id
      ? hireName.get(d.new_hire_id)
      : d.employee_id
        ? staffName.get(d.employee_id)
        : null) ?? "Unassigned";

  // Who is overdue on required annual training.
  const overdue: { name: string; course: string; dueOn: string | null }[] = [];
  for (const person of staffList) {
    for (const course of courseList) {
      const applies =
        course.applies_to_positions.length === 0 ||
        course.applies_to_positions.includes(person.position as PositionType);
      if (!applies) continue;
      const done = completionList
        .filter((c) => c.employee_id === person.id && c.course_id === course.id)
        .sort((a, b) => (a.completed_on < b.completed_on ? 1 : -1))[0];
      const due = done?.due_on ?? null;
      if (!done || (due && due < now)) {
        overdue.push({ name: person.full_name, course: course.title, dueOn: due });
      }
    }
  }

  return {
    hires: hireList,
    staff: staffList.map((s) => ({
      ...s,
      positionLabel: POSITION_LABEL[s.position as PositionType],
    })),
    documents: docList.map((d) => ({ ...d, personName: nameFor(d) })),
    checks: checkList.map((c) => ({ ...c, personName: nameFor(c) })),
    courses: courseList,
    completions: completionList.map((c) => ({
      ...c,
      personName: nameFor(c),
      courseTitle: courseList.find((x) => x.id === c.course_id)?.title ?? "Course",
      isOverdue: !!c.due_on && c.due_on < now,
    })),
    overdue: overdue.slice(0, 60),
    counts: {
      awaitingSignature: docList.filter((d) => d.status === "sent").length,
      signed: docList.filter((d) => d.status === "signed").length,
      screeningsPending: checkList.filter(
        (c) => c.status === "ordered" || c.status === "not_started",
      ).length,
      screeningsFailed: checkList.filter((c) => c.status === "failed").length,
      trainingOverdue: overdue.length,
      trainingDueSoon: completionList.filter(
        (c) => c.due_on && c.due_on >= now && c.due_on <= addDays(now, 30),
      ).length,
    },
    packet: DOCUMENT_PACKET,
    screeningKinds: SCREENING_KINDS,
  };
}

/** Create the standard signing packet plus every screening for a new hire in one action. */
export async function startOnboardingPacketAction(userId: string, newHireId: string) {
  const actor = await manager(userId);
  const { data: hire } = await db
    .from("new_hires")
    .select("id, full_name")
    .eq("id", newHireId)
    .maybeSingle();
  if (!hire) throw new Error("That new hire record no longer exists.");

  const { data: existingDocs } = await db
    .from("hire_documents")
    .select("doc_type")
    .eq("new_hire_id", newHireId);
  const haveDocs = new Set((existingDocs ?? []).map((d) => d.doc_type));
  const docRows = DOCUMENT_PACKET.filter((d) => !haveDocs.has(d.type)).map((d) => ({
    new_hire_id: newHireId,
    doc_type: d.type,
    title: d.title,
    status: "sent",
    sent_at: new Date().toISOString(),
  }));
  if (docRows.length) await db.from("hire_documents").insert(docRows);

  const { data: existingChecks } = await db
    .from("screening_checks")
    .select("kind")
    .eq("new_hire_id", newHireId);
  const haveChecks = new Set((existingChecks ?? []).map((c) => c.kind));
  const checkRows = SCREENING_KINDS.filter((c) => !haveChecks.has(c.kind)).map((c) => ({
    new_hire_id: newHireId,
    kind: c.kind,
    status: "ordered",
    ordered_on: today(),
  }));
  if (checkRows.length) await db.from("screening_checks").insert(checkRows);

  await logAudit("onboarding_packet_started", label(actor), "new_hire", newHireId, {
    documents: docRows.length,
    checks: checkRows.length,
  });
  return {
    documents: docRows.length,
    checks: checkRows.length,
    message: `Sent ${docRows.length} document${docRows.length === 1 ? "" : "s"} and ordered ${checkRows.length} check${checkRows.length === 1 ? "" : "s"} for ${hire.full_name}.`,
  };
}

export async function signDocumentAction(userId: string, id: string, signedName: string) {
  const actor = await manager(userId);
  await db
    .from("hire_documents")
    .update({ status: "signed", signed_at: new Date().toISOString(), signed_name: signedName })
    .eq("id", id);
  await logAudit("document_signed", label(actor), "hire_document", id, { signedName });
  return { ok: true };
}

export async function setDocumentStatusAction(
  userId: string,
  id: string,
  status: string,
  fileUrl?: string,
) {
  const actor = await manager(userId);
  await db
    .from("hire_documents")
    .update({ status, ...(fileUrl === undefined ? {} : { file_url: fileUrl }) })
    .eq("id", id);
  await logAudit("document_status", label(actor), "hire_document", id, { status });
  return { ok: true };
}

export async function addDocumentAction(
  userId: string,
  input: {
    newHireId?: string | null | undefined;
    employeeId?: string | null | undefined;
    docType: string;
    title: string;
  },
) {
  const actor = await manager(userId);
  const { data, error } = await db
    .from("hire_documents")
    .insert({
      new_hire_id: input.newHireId || null,
      employee_id: input.employeeId || null,
      doc_type: input.docType,
      title: input.title,
      status: "sent",
      sent_at: new Date().toISOString(),
    })
    .select("id")
    .maybeSingle();
  if (error) throw new Error(error.message);
  await logAudit("document_added", label(actor), "hire_document", data?.id ?? null, {
    title: input.title,
  });
  return { id: data?.id as string };
}

export async function updateScreeningAction(
  userId: string,
  input: {
    id: string;
    status: string;
    vendor?: string | undefined;
    reference?: string | undefined;
    result?: string | undefined;
    completedOn?: string | null | undefined;
  },
) {
  const actor = await manager(userId);
  await db
    .from("screening_checks")
    .update({
      status: input.status,
      ...(input.vendor === undefined ? {} : { vendor: input.vendor }),
      ...(input.reference === undefined ? {} : { reference: input.reference }),
      ...(input.result === undefined ? {} : { result: input.result }),
      completed_on:
        input.completedOn !== undefined
          ? input.completedOn
          : input.status === "passed" || input.status === "failed"
            ? today()
            : null,
    })
    .eq("id", input.id);
  await logAudit("screening_updated", label(actor), "screening_check", input.id, {
    status: input.status,
  });
  return { ok: true };
}

export async function saveCourseAction(
  userId: string,
  input: {
    id?: string | null | undefined;
    title: string;
    description?: string | undefined;
    category?: string | undefined;
    requiredMinutes?: number | undefined;
    recurrenceMonths?: number | undefined;
    appliesToPositions?: PositionType[] | undefined;
    requiredForNewHires?: boolean | undefined;
    contentUrl?: string | undefined;
    isActive?: boolean | undefined;
  },
) {
  const actor = await manager(userId);
  const patch = {
    title: input.title,
    description: input.description ?? "",
    category: input.category ?? "annual",
    required_minutes: input.requiredMinutes ?? 30,
    recurrence_months: input.recurrenceMonths ?? 12,
    applies_to_positions: input.appliesToPositions ?? [],
    required_for_new_hires: input.requiredForNewHires ?? true,
    content_url: input.contentUrl ?? "",
    ...(input.isActive === undefined ? {} : { is_active: input.isActive }),
  };
  if (input.id) {
    await db.from("inservice_courses").update(patch).eq("id", input.id);
    await logAudit("course_updated", label(actor), "inservice_course", input.id, {
      title: input.title,
    });
    return { id: input.id };
  }
  const { data, error } = await db
    .from("inservice_courses")
    .insert(patch)
    .select("id")
    .maybeSingle();
  if (error) throw new Error(error.message);
  await logAudit("course_added", label(actor), "inservice_course", data?.id ?? null, {
    title: input.title,
  });
  return { id: data?.id as string };
}

export async function recordCompletionAction(
  userId: string,
  input: {
    courseId: string;
    employeeId?: string | null | undefined;
    newHireId?: string | null | undefined;
    minutes?: number | undefined;
    score?: number | null | undefined;
    completedOn?: string | undefined;
  },
) {
  const actor = await manager(userId);
  const { data: course } = await db
    .from("inservice_courses")
    .select("recurrence_months, required_minutes, title")
    .eq("id", input.courseId)
    .maybeSingle();
  if (!course) throw new Error("That course no longer exists.");
  const completedOn = input.completedOn ?? today();
  const due = new Date(`${completedOn}T12:00:00`);
  due.setMonth(due.getMonth() + course.recurrence_months);

  const { error } = await db.from("course_completions").insert({
    course_id: input.courseId,
    employee_id: input.employeeId || null,
    new_hire_id: input.newHireId || null,
    completed_on: completedOn,
    minutes: input.minutes ?? course.required_minutes,
    score: input.score ?? null,
    due_on: due.toISOString().slice(0, 10),
    recorded_by: label(actor),
  });
  if (error) throw new Error(error.message);
  await logAudit("training_recorded", label(actor), "inservice_course", input.courseId, {
    course: course.title,
  });
  return {
    ok: true,
    message: `Recorded ${course.title}. Due again ${due.toISOString().slice(0, 10)}.`,
  };
}

/** Hourly sweep: warn managers and staff about training that is due or past due. */
export async function trainingComplianceSweep() {
  const now = today();
  const soon = addDays(now, 30);
  const [{ data: courses }, { data: staff }, { data: completions }] = await Promise.all([
    db.from("inservice_courses").select("id, title, applies_to_positions").eq("is_active", true),
    db.from("employees").select("id, full_name, position").eq("is_active", true),
    db.from("course_completions").select("employee_id, course_id, due_on"),
  ]);
  let notices = 0;
  let overdue = 0;
  for (const person of staff ?? []) {
    for (const course of courses ?? []) {
      const applies =
        course.applies_to_positions.length === 0 ||
        course.applies_to_positions.includes(person.position as PositionType);
      if (!applies) continue;
      const latest = (completions ?? [])
        .filter((c) => c.employee_id === person.id && c.course_id === course.id)
        .map((c) => c.due_on)
        .filter(Boolean)
        .sort()
        .pop();
      const isOverdue = !latest || latest < now;
      const dueSoon = !!latest && latest >= now && latest <= soon;
      if (!isOverdue && !dueSoon) continue;
      if (isOverdue) overdue++;
      const title = isOverdue ? "Required training is past due" : "Required training is coming due";
      const body = isOverdue
        ? `${course.title} is past due. Please complete it before your next scheduled shift.`
        : `${course.title} is due ${latest}. Please complete it this month.`;
      const since = new Date(Date.now() - 7 * 24 * 3600_000).toISOString();
      const { data: already } = await db
        .from("notifications")
        .select("id")
        .eq("employee_id", person.id)
        .eq("title", title)
        .eq("body", body)
        .gte("created_at", since)
        .limit(1);
      if (already && already.length) continue;
      await db
        .from("notifications")
        .insert({ employee_id: person.id, audience: "employee", title, body });
      notices++;
    }
  }
  return { notices, overdue };
}

/** What one employee sees about their own training. */
export async function myTrainingQuery(userId: string) {
  const actor = await loadActor(userId);
  if (!actor.employee) return { rows: [], overdue: 0 };
  const [{ data: courses }, { data: completions }] = await Promise.all([
    db.from("inservice_courses").select("*").eq("is_active", true).order("title"),
    db.from("course_completions").select("*").eq("employee_id", actor.employee.id),
  ]);
  const now = today();
  const rows = (courses ?? [])
    .filter(
      (c) =>
        c.applies_to_positions.length === 0 ||
        c.applies_to_positions.includes(actor.employee!.position as PositionType),
    )
    .map((c) => {
      const latest = (completions ?? [])
        .filter((x) => x.course_id === c.id)
        .sort((a, b) => (a.completed_on < b.completed_on ? 1 : -1))[0];
      return {
        id: c.id,
        title: c.title,
        description: c.description,
        minutes: c.required_minutes,
        completedOn: latest?.completed_on ?? null,
        dueOn: latest?.due_on ?? null,
        status: !latest ? "not_done" : latest.due_on && latest.due_on < now ? "overdue" : "current",
      };
    });
  return { rows, overdue: rows.filter((r) => r.status !== "current").length };
}
