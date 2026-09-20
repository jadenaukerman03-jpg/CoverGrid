import { db, loadActor, logAudit, requireManager, today } from "./staffing.server";
import type { PositionType, ShiftType } from "./facility";

export type NewHireInput = {
  id?: string | null | undefined;
  fullName: string;
  email?: string | undefined;
  phone?: string | undefined;
  position: PositionType;
  unitId?: string | null | undefined;
  shift?: ShiftType | null | undefined;
  daysPerWeek?: number | undefined;
  hourlyRate?: number | undefined;
  employmentType?: string | undefined;
  source?: string | undefined;
  recruiter?: string | undefined;
  offerDate?: string | null | undefined;
  startDate?: string | null | undefined;
  orientationStart?: string | null | undefined;
  orientationEnd?: string | null | undefined;
  preceptorId?: string | null | undefined;
  clockInNumber?: string | undefined;
  chartingUsername?: string | undefined;
  payrollId?: string | undefined;
  emergencyContactName?: string | undefined;
  emergencyContactPhone?: string | undefined;
  licenseNumber?: string | undefined;
  licenseExpiresOn?: string | null | undefined;
  notes?: string | undefined;
  status?: string | undefined;
};

export const CHECKLIST = [
  ["offer_accepted", "Offer accepted"],
  ["background_check_done", "Background check"],
  ["drug_screen_done", "Drug screen"],
  ["physical_tb_done", "Physical / TB test"],
  ["license_verified", "License or certification verified"],
  ["paperwork_done", "Paperwork & I-9"],
  ["badge_issued", "Badge & clock-in number"],
  ["charting_login_created", "Charting login created"],
  ["orientation_scheduled", "Orientation scheduled"],
  ["added_to_schedule", "Added to the schedule"],
] as const;

type ChecklistKey = (typeof CHECKLIST)[number][0];

async function manager(userId: string) {
  const actor = await loadActor(userId);
  requireManager(actor);
  return actor;
}
const label = (a: Awaited<ReturnType<typeof loadActor>>) =>
  a.employee?.full_name ?? a.profile?.full_name ?? a.profile?.email ?? "a manager";

export async function newHireBoardQuery(userId: string) {
  await manager(userId);
  const [{ data: rows }, { data: units }, { data: staff }] = await Promise.all([
    db.from("new_hires").select("*").order("start_date", { ascending: true }),
    db.from("units").select("id, name").order("sort_order"),
    db.from("employees").select("id, full_name, position").eq("is_active", true).order("full_name"),
  ]);
  const list = rows ?? [];
  const now = today();
  const progress = (r: (typeof list)[number]) => {
    const done = CHECKLIST.filter(([k]) => r[k as ChecklistKey]).length;
    return Math.round((done / CHECKLIST.length) * 100);
  };
  return {
    rows: list.map((r) => ({ ...r, progress: progress(r) })),
    units: units ?? [],
    staff: staff ?? [],
    counts: {
      onboarding: list.filter((r) => r.status === "onboarding").length,
      startingSoon: list.filter(
        (r) => r.status === "onboarding" && r.start_date && r.start_date >= now,
      ).length,
      needsAttention: list.filter((r) => r.status === "onboarding" && progress(r) < 100).length,
      hired: list.filter((r) => r.status === "hired").length,
    },
  };
}

export async function saveNewHireAction(userId: string, input: NewHireInput) {
  const actor = await manager(userId);
  const patch = {
    full_name: input.fullName,
    email: input.email ?? "",
    phone: input.phone ?? "",
    position: input.position,
    unit_id: input.unitId || null,
    shift: input.shift || null,
    days_per_week: input.daysPerWeek ?? 4,
    hourly_rate: input.hourlyRate ?? 0,
    employment_type: input.employmentType ?? "full_time",
    source: input.source ?? "",
    recruiter: input.recruiter ?? "",
    offer_date: input.offerDate || null,
    start_date: input.startDate || null,
    orientation_start: input.orientationStart || null,
    orientation_end: input.orientationEnd || null,
    preceptor_id: input.preceptorId || null,
    clock_in_number: input.clockInNumber ?? "",
    charting_username: input.chartingUsername ?? "",
    payroll_id: input.payrollId ?? "",
    emergency_contact_name: input.emergencyContactName ?? "",
    emergency_contact_phone: input.emergencyContactPhone ?? "",
    license_number: input.licenseNumber ?? "",
    license_expires_on: input.licenseExpiresOn || null,
    notes: input.notes ?? "",
    ...(input.status ? { status: input.status } : {}),
  };
  if (input.id) {
    await db.from("new_hires").update(patch).eq("id", input.id);
    await logAudit("new_hire_updated", label(actor), "new_hire", input.id, {
      name: input.fullName,
    });
    return { id: input.id };
  }
  const { data, error } = await db.from("new_hires").insert(patch).select("id").maybeSingle();
  if (error) throw new Error(error.message);
  await logAudit("new_hire_added", label(actor), "new_hire", data?.id ?? null, {
    name: input.fullName,
  });
  return { id: data?.id as string };
}

export async function toggleChecklistAction(
  userId: string,
  id: string,
  key: string,
  value: boolean,
) {
  const actor = await manager(userId);
  if (!CHECKLIST.some(([k]) => k === key)) throw new Error("Unknown onboarding step.");
  await db
    .from("new_hires")
    .update({ [key]: value } as never)
    .eq("id", id);
  await logAudit("new_hire_step", label(actor), "new_hire", id, { step: key, done: value });
  return { ok: true };
}

export async function deleteNewHireAction(userId: string, id: string) {
  const actor = await manager(userId);
  await db.from("new_hires").delete().eq("id", id);
  await logAudit("new_hire_removed", label(actor), "new_hire", id, {});
  return { ok: true };
}

/** Turn a finished onboarding record into a real person on the roster. */
export async function convertNewHireAction(userId: string, id: string) {
  const actor = await manager(userId);
  const { data: hire } = await db.from("new_hires").select("*").eq("id", id).maybeSingle();
  if (!hire) throw new Error("That new hire record no longer exists.");
  if (hire.employee_id) throw new Error("This person is already on the roster.");

  const { data: employee, error } = await db
    .from("employees")
    .insert({
      full_name: hire.full_name,
      email: hire.email || null,
      position: hire.position,
      primary_unit_id: hire.unit_id,
      qualified_unit_ids: hire.unit_id ? [hire.unit_id] : [],
      scheduled_shift: hire.shift ?? "first",
      days_per_week: hire.days_per_week,
      hourly_rate: hire.hourly_rate,
      employment_type: hire.employment_type,
      hire_date: hire.start_date ?? today(),
      phone: hire.phone || null,
      clock_in_number: hire.clock_in_number,
      payroll_id: hire.payroll_id,
      in_training: true,
      training_ends_on: hire.orientation_end,
      notes: hire.notes,
    })
    .select("id")
    .maybeSingle();
  if (error) throw new Error(error.message);

  await db
    .from("new_hires")
    .update({ status: "hired", employee_id: employee?.id ?? null, added_to_schedule: true })
    .eq("id", id);

  if (hire.license_number && hire.license_expires_on && employee?.id) {
    await db.from("employee_credentials").insert({
      employee_id: employee.id,
      kind:
        hire.position === "nurse"
          ? "Nursing license"
          : hire.position === "qma"
            ? "QMA certification"
            : "CNA certification",
      identifier: hire.license_number,
      expires_on: hire.license_expires_on,
      status: "active",
    });
  }

  await logAudit("new_hire_converted", label(actor), "employee", employee?.id ?? null, {
    name: hire.full_name,
  });

  // Payroll ID, clock-in number and PIN are generated and handed to payroll
  // automatically — nobody has to remember to do it.
  let handoff: Awaited<
    ReturnType<typeof import("./payroll-handoff.server").payrollHandoff>
  > | null = null;
  if (employee?.id) {
    try {
      const { payrollHandoff } = await import("./payroll-handoff.server");
      handoff = await payrollHandoff(employee.id, label(actor), { newHireId: id });
    } catch (err) {
      console.error("payroll handoff failed", err);
    }
  }

  return { employeeId: employee?.id as string, payroll: handoff };
}

/**
 * Hand a hired applicant straight over to onboarding: creates the new hire record,
 * links it back to the application, moves the applicant to "hired" and starts the
 * paperwork packet and background screenings in one step.
 */
export async function hireApplicantAction(
  userId: string,
  applicantId: string,
  overrides?: { startDate?: string | null | undefined; hourlyRate?: number | undefined },
) {
  const actor = await manager(userId);
  const { data: applicant } = await db
    .from("job_applicants")
    .select("id, full_name, email, phone, source, posting_id, stage")
    .eq("id", applicantId)
    .maybeSingle();
  if (!applicant) throw new Error("That applicant is no longer in the pipeline.");

  const { data: existing } = await db
    .from("new_hires")
    .select("id")
    .eq("applicant_id", applicantId)
    .maybeSingle();
  if (existing) return { id: existing.id, alreadyStarted: true as const };

  type PostingShape = {
    position: PositionType;
    shift: ShiftType | null;
    unit_id: string | null;
    employment_type: string;
  };
  let posting: PostingShape | null = null;
  if (applicant.posting_id) {
    const { data } = await db
      .from("job_postings")
      .select("position, shift, unit_id, employment_type")
      .eq("id", applicant.posting_id)
      .maybeSingle();
    posting = (data as PostingShape | null) ?? null;
  }

  const { data: created, error } = await db
    .from("new_hires")
    .insert({
      applicant_id: applicantId,
      full_name: applicant.full_name,
      email: applicant.email ?? "",
      phone: applicant.phone ?? "",
      position: posting?.position ?? "cna",
      unit_id: posting?.unit_id ?? null,
      shift: posting?.shift ?? null,
      employment_type: posting?.employment_type ?? "full_time",
      source: applicant.source ?? "career_site",
      recruiter: label(actor),
      offer_date: today(),
      start_date: overrides?.startDate ?? null,
      hourly_rate: overrides?.hourlyRate ?? 0,
      status: "onboarding",
      offer_accepted: true,
    })
    .select("id")
    .maybeSingle();
  if (error) throw new Error(error.message);
  const newHireId = created?.id as string;

  if (applicant.stage !== "hired") {
    await db
      .from("job_applicants")
      .update({ stage: "hired", updated_at: new Date().toISOString() })
      .eq("id", applicantId);
  }

  const { startOnboardingPacketAction } = await import("./hr.impl.server");
  const packet = await startOnboardingPacketAction(userId, newHireId).catch(() => ({
    documents: 0,
    checks: 0,
  }));

  const { getNotifyPrefs, queueText } = await import("./messaging.server");
  const notifyPrefs = await getNotifyPrefs();
  if (notifyPrefs.onboarding) {
    await db.from("notifications").insert({
      audience: "manager",
      title: "New hire started onboarding",
      body: `${applicant.full_name} moved from the hiring pipeline into onboarding. Paperwork and background screenings have been started.`,
    });
    if (applicant.phone) {
      await queueText({
        phone: applicant.phone,
        body: `Welcome aboard, ${applicant.full_name.split(" ")[0]}! Your onboarding paperwork has been sent. Watch your email and reply here with any questions.`,
        kind: "onboarding",
      }).catch(() => undefined);
    }
  }

  await logAudit("applicant_hired", label(actor), "new_hire", newHireId, {
    applicantId,
    name: applicant.full_name,
  });
  return { id: newHireId, alreadyStarted: false as const, packet };
}
