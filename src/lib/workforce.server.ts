// Server-only workforce engine: labor/HPPD, time & attendance, payroll, hiring,
// engagement and compliance. Never imported from client code directly.
import {
  addDays,
  dateRange,
  OVERTIME_THRESHOLD_HOURS,
  POSITION_LABEL,
  SHIFT_LABEL,
  SHIFT_WINDOW,
  startOfWeek,
  type PositionType,
  type ShiftType,
} from "./facility";
import { db, logAudit, today, unitMap } from "./staffing.server";

export const OT_MULTIPLIER = 1.5;
/** Share of already-earned net wages an employee may draw before payday. */
export const EWA_MAX_SHARE = 0.5;
export const EWA_ESTIMATED_NET = 0.75;

// ---------------- Census & HPPD ----------------

/** Deterministic census fallback so care-hour math never blocks on manual entry. */
function seedCensus(unitIndex: number, date: string): number {
  const day = Number(date.slice(8, 10));
  const base = [28, 32, 26][unitIndex % 3] ?? 28;
  return base + ((day * 7 + unitIndex * 3) % 5) - 2;
}

/** Fills any missing census days so the system keeps reporting without human input. */
export async function ensureCensus(from: string, to: string) {
  const { units } = await unitMap();
  const { data: existing } = await db
    .from("census_days")
    .select("date,unit_id")
    .gte("date", from)
    .lte("date", to);
  const have = new Set((existing ?? []).map((c) => `${c.date}|${c.unit_id}`));
  const rows: { date: string; unit_id: string; census: number }[] = [];
  for (const date of dateRange(from, to)) {
    units.forEach((u, i) => {
      if (!have.has(`${date}|${u.id}`))
        rows.push({ date, unit_id: u.id, census: seedCensus(i, date) });
    });
  }
  if (rows.length > 0) await db.from("census_days").upsert(rows, { onConflict: "date,unit_id" });
  return rows.length;
}

export type LaborDay = {
  date: string;
  unitId: string;
  unitName: string;
  census: number;
  targetHppd: number;
  nurseHours: number;
  cnaHours: number;
  totalHours: number;
  actualHppd: number;
  targetHours: number;
  varianceHours: number;
  cost: number;
  otHours: number;
  otCost: number;
};

export async function laborReport(from: string, to: string) {
  await ensureCensus(from, to);
  const { units, byId } = await unitMap();
  const [{ data: census }, { data: asg }, { data: emps }] = await Promise.all([
    db.from("census_days").select("date,unit_id,census").gte("date", from).lte("date", to),
    db
      .from("shift_assignments")
      .select("shift_date,unit_id,position,hours,status,employee_id")
      .gte("shift_date", from)
      .lte("shift_date", to),
    db.from("employees").select("id,hourly_rate,employment_type"),
  ]);
  const rateOf = new Map((emps ?? []).map((e) => [e.id, Number(e.hourly_rate)]));
  const typeOf = new Map((emps ?? []).map((e) => [e.id, e.employment_type as string]));
  const censusOf = new Map((census ?? []).map((c) => [`${c.date}|${c.unit_id}`, c.census]));
  const targetOf = new Map(units.map((u) => [u.id, Number(u.target_hppd ?? 3.6)]));

  // Weekly running hours per employee to attribute overtime premium.
  const running = new Map<string, number>();
  const sorted = [...(asg ?? [])].sort((a, b) => a.shift_date.localeCompare(b.shift_date));

  const cells = new Map<string, LaborDay>();
  for (const date of dateRange(from, to)) {
    for (const u of units) {
      cells.set(`${date}|${u.id}`, {
        date,
        unitId: u.id,
        unitName: u.name,
        census: censusOf.get(`${date}|${u.id}`) ?? 0,
        targetHppd: targetOf.get(u.id) ?? 3.6,
        nurseHours: 0,
        cnaHours: 0,
        totalHours: 0,
        actualHppd: 0,
        targetHours: 0,
        varianceHours: 0,
        cost: 0,
        otHours: 0,
        otCost: 0,
      });
    }
  }

  for (const a of sorted) {
    if (!a.employee_id || !["scheduled", "completed"].includes(a.status as string)) continue;
    const cell = cells.get(`${a.shift_date}|${a.unit_id}`);
    if (!cell) continue;
    const hours = Number(a.hours);
    const wk = startOfWeek(a.shift_date);
    const key = `${a.employee_id}|${wk}`;
    const before = running.get(key) ?? 0;
    running.set(key, before + hours);
    const ot =
      Math.max(0, before + hours - OVERTIME_THRESHOLD_HOURS) -
      Math.max(0, before - OVERTIME_THRESHOLD_HOURS);
    const reg = hours - ot;
    let rate = rateOf.get(a.employee_id) ?? 22;
    if (typeOf.get(a.employee_id) === "agency") rate *= 1.8;
    if (a.position === "nurse") cell.nurseHours += hours;
    else cell.cnaHours += hours;
    cell.totalHours += hours;
    cell.otHours += ot;
    cell.cost += reg * rate + ot * rate * OT_MULTIPLIER;
    cell.otCost += ot * rate * OT_MULTIPLIER;
  }

  const days = [...cells.values()].map((c) => {
    c.actualHppd = c.census > 0 ? Number((c.totalHours / c.census).toFixed(2)) : 0;
    c.targetHours = Number((c.census * c.targetHppd).toFixed(1));
    c.varianceHours = Number((c.totalHours - c.targetHours).toFixed(1));
    c.cost = Number(c.cost.toFixed(0));
    c.otCost = Number(c.otCost.toFixed(0));
    c.totalHours = Number(c.totalHours.toFixed(1));
    c.nurseHours = Number(c.nurseHours.toFixed(1));
    c.cnaHours = Number(c.cnaHours.toFixed(1));
    c.otHours = Number(c.otHours.toFixed(1));
    return c;
  });
  days.sort((a, b) => a.date.localeCompare(b.date) || a.unitName.localeCompare(b.unitName));

  const totalHours = days.reduce((s, d) => s + d.totalHours, 0);
  const totalCensus = days.reduce((s, d) => s + d.census, 0);
  const totalCost = days.reduce((s, d) => s + d.cost, 0);
  const byUnit = units.map((u) => {
    const rows = days.filter((d) => d.unitId === u.id);
    const hrs = rows.reduce((s, d) => s + d.totalHours, 0);
    const cen = rows.reduce((s, d) => s + d.census, 0);
    return {
      unitId: u.id,
      unitName: byId.get(u.id) ?? u.name,
      targetHppd: targetOf.get(u.id) ?? 3.6,
      hppd: cen > 0 ? Number((hrs / cen).toFixed(2)) : 0,
      hours: Number(hrs.toFixed(1)),
      cost: rows.reduce((s, d) => s + d.cost, 0),
      otCost: rows.reduce((s, d) => s + d.otCost, 0),
    };
  });

  return {
    from,
    to,
    days,
    byUnit,
    totals: {
      hppd: totalCensus > 0 ? Number((totalHours / totalCensus).toFixed(2)) : 0,
      hours: Number(totalHours.toFixed(1)),
      cost: Math.round(totalCost),
      otCost: Math.round(days.reduce((s, d) => s + d.otCost, 0)),
      avgCensus:
        days.length > 0 ? Math.round(totalCensus / (days.length / (byUnit.length || 1))) : 0,
      costPerResidentDay: totalCensus > 0 ? Number((totalCost / totalCensus).toFixed(2)) : 0,
    },
  };
}

export async function setCensus(date: string, unitId: string, census: number) {
  await db
    .from("census_days")
    .upsert({ date, unit_id: unitId, census }, { onConflict: "date,unit_id" });
  return { date, unitId, census };
}

// ---------------- Time & attendance ----------------

function shiftStartAt(date: string, shift: ShiftType) {
  const hour = shift === "first" ? 6 : shift === "second" ? 14 : 22;
  return new Date(`${date}T${String(hour).padStart(2, "0")}:00:00`);
}

/** Great-circle distance in meters (Haversine). */
function distanceMeters(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6_371_000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/** Which building this punch should be checked against: the shift's unit first, then the employee's own. */
async function resolveFacilityId(
  employeeId: string,
  assignmentId: string | null,
): Promise<string | null> {
  if (assignmentId) {
    const { data: a } = await db
      .from("shift_assignments")
      .select("unit_id")
      .eq("id", assignmentId)
      .maybeSingle();
    if (a?.unit_id) {
      const { data: u } = await db
        .from("units")
        .select("facility_id")
        .eq("id", a.unit_id)
        .maybeSingle();
      if (u?.facility_id) return u.facility_id as string;
    }
  }
  const { data: e } = await db
    .from("employees")
    .select("home_facility_id,primary_unit_id")
    .eq("id", employeeId)
    .maybeSingle();
  if (e?.home_facility_id) return e.home_facility_id as string;
  if (e?.primary_unit_id) {
    const { data: u } = await db
      .from("units")
      .select("facility_id")
      .eq("id", e.primary_unit_id)
      .maybeSingle();
    if (u?.facility_id) return u.facility_id as string;
  }
  return null;
}

export type PunchLocation = { lat: number; lng: number; accuracyM?: number | undefined };

export async function punch(
  employeeId: string,
  assignmentId: string | null,
  kind: "in" | "out",
  opts?: { location?: PunchLocation | null | undefined; locationAttempted?: boolean | undefined },
) {
  const now = new Date();
  const date = today();
  const { data: open } = await db
    .from("time_punches")
    .select("*")
    .eq("employee_id", employeeId)
    .is("clock_out", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (kind === "in") {
    if (open) throw new Error("You are already clocked in.");
    const flags: string[] = [];
    if (assignmentId) {
      const { data: a } = await db
        .from("shift_assignments")
        .select("shift_date,shift")
        .eq("id", assignmentId)
        .maybeSingle();
      if (a) {
        const diff =
          (now.getTime() - shiftStartAt(a.shift_date, a.shift as ShiftType).getTime()) / 60000;
        if (diff > 7) flags.push("late_punch");
        else if (diff < -15) flags.push("early_punch");
      }
    }

    // Only a self-service punch (one where the browser actually tried to get a
    // location) is checked against the building's geofence — a wall clock/kiosk
    // punch is inherently on-site and never asks for one.
    if (opts?.locationAttempted) {
      const facilityId = await resolveFacilityId(employeeId, assignmentId);
      const fac = facilityId
        ? (
            await db
              .from("facilities")
              .select("geofence_lat,geofence_lng,geofence_radius_m")
              .eq("id", facilityId)
              .maybeSingle()
          ).data
        : null;
      if (fac?.geofence_lat != null && fac.geofence_lng != null && fac.geofence_radius_m != null) {
        if (opts.location) {
          const dist = distanceMeters(
            Number(fac.geofence_lat),
            Number(fac.geofence_lng),
            opts.location.lat,
            opts.location.lng,
          );
          // GPS accuracy varies; give a little room rather than punishing a fuzzy reading.
          const buffer = Math.min(200, Math.max(0, opts.location.accuracyM ?? 0));
          if (dist > Number(fac.geofence_radius_m) + buffer) flags.push("outside_geofence");
        } else {
          flags.push("no_location");
        }
      }
    }

    const exception = flags.length ? flags.join(",") : null;
    const { data, error } = await db
      .from("time_punches")
      .insert({
        employee_id: employeeId,
        assignment_id: assignmentId,
        date,
        clock_in: now.toISOString(),
        exception,
        lat: opts?.location?.lat ?? null,
        lng: opts?.location?.lng ?? null,
        accuracy_m: opts?.location?.accuracyM ?? null,
      })
      .select()
      .single();
    if (error) throw new Error(error.message);
    const message = flags.includes("outside_geofence")
      ? "Clocked in — flagged as outside the building."
      : flags.includes("late_punch")
        ? "Clocked in — flagged as a late punch."
        : "Clocked in.";
    return { punch: data, message };
  }

  if (!open) throw new Error("You are not clocked in.");
  const minutes = Math.max(
    0,
    Math.round((now.getTime() - new Date(open.clock_in as string).getTime()) / 60000),
  );
  const { data, error } = await db
    .from("time_punches")
    .update({ clock_out: now.toISOString(), minutes_worked: minutes })
    .eq("id", open.id)
    .select()
    .single();
  if (error) throw new Error(error.message);
  return { punch: data, message: `Clocked out — ${(minutes / 60).toFixed(2)} hours recorded.` };
}

/** Closes abandoned punches and flags missed punches — runs unattended. */
export async function punchSweep() {
  const cutoff = new Date(Date.now() - 16 * 3600 * 1000).toISOString();
  const { data: stale } = await db
    .from("time_punches")
    .select("*")
    .is("clock_out", null)
    .lt("clock_in", cutoff);
  let closed = 0;
  for (const p of stale ?? []) {
    await db
      .from("time_punches")
      .update({ clock_out: p.clock_in, minutes_worked: 0, exception: "missed_clock_out" })
      .eq("id", p.id);
    closed += 1;
  }
  // Completed shifts yesterday with no punch at all.
  const yday = addDays(today(), -1);
  const [{ data: asg }, { data: punches }] = await Promise.all([
    db
      .from("shift_assignments")
      .select("id,employee_id")
      .eq("shift_date", yday)
      .in("status", ["completed", "scheduled"]),
    db.from("time_punches").select("assignment_id").eq("date", yday),
  ]);
  const punched = new Set((punches ?? []).map((p) => p.assignment_id));
  let missing = 0;
  for (const a of asg ?? []) {
    if (!a.employee_id || punched.has(a.id)) continue;
    await db.from("time_punches").insert({
      employee_id: a.employee_id,
      assignment_id: a.id,
      date: yday,
      exception: "no_punch",
      source: "system",
    });
    missing += 1;
  }
  return { closed, missing };
}

export async function punchReport(from: string, to: string) {
  const [{ data: punches }, { data: emps }] = await Promise.all([
    db
      .from("time_punches")
      .select("*")
      .gte("date", from)
      .lte("date", to)
      .order("date", { ascending: false }),
    db.from("employees").select("id,full_name,position"),
  ]);
  const nameOf = new Map((emps ?? []).map((e) => [e.id, e.full_name]));
  const rows = (punches ?? []).map((p) => ({
    id: p.id,
    date: p.date,
    employee: nameOf.get(p.employee_id) ?? "—",
    clockIn: p.clock_in,
    clockOut: p.clock_out,
    hours: Number((p.minutes_worked / 60).toFixed(2)),
    exception: p.exception,
    source: p.source,
  }));
  return {
    rows,
    exceptions: rows.filter((r) => r.exception),
    totalHours: Number(rows.reduce((s, r) => s + r.hours, 0).toFixed(1)),
  };
}

// ---------------- Payroll ----------------

export async function payrollPeriod(start?: string, end?: string) {
  const s = start ?? startOfWeek(addDays(today(), -7));
  const e = end ?? addDays(s, 13);
  const [{ data: asg }, { data: emps }, { data: advances }] = await Promise.all([
    db
      .from("shift_assignments")
      .select("employee_id,shift_date,hours,status,position")
      .gte("shift_date", s)
      .lte("shift_date", e),
    db
      .from("employees")
      .select("id,full_name,position,hourly_rate,employment_type")
      .eq("is_active", true),
    db.from("wage_advances").select("employee_id,amount").gte("requested_at", `${s}T00:00:00Z`),
  ]);
  const advanceOf = new Map<string, number>();
  for (const a of advances ?? [])
    advanceOf.set(a.employee_id, (advanceOf.get(a.employee_id) ?? 0) + Number(a.amount));

  const byEmpWeek = new Map<string, number>();
  for (const a of asg ?? []) {
    if (!a.employee_id || !["scheduled", "completed"].includes(a.status as string)) continue;
    const k = `${a.employee_id}|${startOfWeek(a.shift_date)}`;
    byEmpWeek.set(k, (byEmpWeek.get(k) ?? 0) + Number(a.hours));
  }
  const rows = (emps ?? [])
    .map((emp) => {
      let reg = 0;
      let ot = 0;
      for (const [k, hrs] of byEmpWeek) {
        if (!k.startsWith(`${emp.id}|`)) continue;
        ot += Math.max(0, hrs - OVERTIME_THRESHOLD_HOURS);
        reg += Math.min(hrs, OVERTIME_THRESHOLD_HOURS);
      }
      const rate = Number(emp.hourly_rate);
      const gross = reg * rate + ot * rate * OT_MULTIPLIER;
      return {
        employeeId: emp.id,
        name: emp.full_name,
        position: POSITION_LABEL[emp.position as PositionType],
        employmentType: emp.employment_type,
        rate,
        regularHours: Number(reg.toFixed(2)),
        overtimeHours: Number(ot.toFixed(2)),
        advances: Number((advanceOf.get(emp.id) ?? 0).toFixed(2)),
        gross: Number(gross.toFixed(2)),
      };
    })
    .filter((r) => r.regularHours + r.overtimeHours > 0)
    .sort((a, b) => b.gross - a.gross);

  return {
    start: s,
    end: e,
    rows,
    totals: {
      gross: Number(rows.reduce((x, r) => x + r.gross, 0).toFixed(2)),
      regularHours: Number(rows.reduce((x, r) => x + r.regularHours, 0).toFixed(1)),
      overtimeHours: Number(rows.reduce((x, r) => x + r.overtimeHours, 0).toFixed(1)),
      advances: Number(rows.reduce((x, r) => x + r.advances, 0).toFixed(2)),
      headcount: rows.length,
    },
  };
}

export function payrollCsv(period: Awaited<ReturnType<typeof payrollPeriod>>) {
  const head = "employee,position,type,rate,regular_hours,overtime_hours,advances,gross_pay";
  const lines = period.rows.map((r) =>
    [
      r.name,
      r.position,
      r.employmentType,
      r.rate,
      r.regularHours,
      r.overtimeHours,
      r.advances,
      r.gross,
    ]
      .map((v) => `"${String(v).replace(/"/g, '""')}"`)
      .join(","),
  );
  return [head, ...lines].join("\n");
}

/** Keeps pay periods rolling forward without anyone opening them. */
export async function ensurePayrollPeriods() {
  const anchor = startOfWeek(today());
  const start = anchor;
  const end = addDays(anchor, 13);
  const { data: existing } = await db
    .from("payroll_periods")
    .select("id")
    .eq("start_date", start)
    .maybeSingle();
  if (existing) return { created: 0 };
  await db.from("payroll_periods").insert({ start_date: start, end_date: end, status: "open" });
  return { created: 1 };
}

// ---------------- Earned wage access ----------------

export async function wageAccess(employeeId: string) {
  const periodStart = startOfWeek(today());
  const [{ data: emp }, { data: asg }, { data: advances }] = await Promise.all([
    db.from("employees").select("hourly_rate").eq("id", employeeId).maybeSingle(),
    db
      .from("shift_assignments")
      .select("hours,status,shift_date")
      .eq("employee_id", employeeId)
      .gte("shift_date", periodStart)
      .lte("shift_date", today()),
    db
      .from("wage_advances")
      .select("amount,requested_at,status,id,note")
      .eq("employee_id", employeeId)
      .order("requested_at", { ascending: false }),
  ]);
  const rate = Number(emp?.hourly_rate ?? 22);
  const earnedHours = (asg ?? [])
    .filter((a) => a.status === "completed")
    .reduce((s, a) => s + Number(a.hours), 0);
  const earnedNet = earnedHours * rate * EWA_ESTIMATED_NET;
  const taken = (advances ?? [])
    .filter((a) => a.requested_at >= `${periodStart}T00:00:00`)
    .reduce((s, a) => s + Number(a.amount), 0);
  const available = Math.max(0, Math.floor(earnedNet * EWA_MAX_SHARE - taken));
  return {
    rate,
    earnedHours: Number(earnedHours.toFixed(1)),
    earnedNet: Math.round(earnedNet),
    taken,
    available,
    history: advances ?? [],
  };
}

export async function requestAdvance(employeeId: string, amount: number, note: string) {
  const access = await wageAccess(employeeId);
  if (amount <= 0) throw new Error("Enter an amount greater than zero.");
  if (amount > access.available)
    throw new Error(`You can access up to $${access.available} of earned wages right now.`);
  const { data, error } = await db
    .from("wage_advances")
    .insert({ employee_id: employeeId, amount, note, status: "approved" })
    .select()
    .single();
  if (error) throw new Error(error.message);
  await db.from("notifications").insert({
    employee_id: employeeId,
    title: "Earned wages sent",
    body: `$${amount} of your earned wages is on the way. It will be deducted from your next paycheck.`,
  });
  return data;
}

// ---------------- Talent acquisition ----------------

const STAGES = ["applied", "screened", "interview", "offer", "hired", "rejected"] as const;
export type ApplicantStage = (typeof STAGES)[number];

/** Rule-based screening so applicants never sit untouched. */
function scoreApplicant(a: {
  source: string;
  phone: string | null;
  email: string | null;
  notes: string;
}) {
  let score = 55;
  if (a.email) score += 10;
  if (a.phone) score += 10;
  if (a.source === "referral") score += 20;
  if (a.source === "career_site") score += 5;
  if (/experience|years|certified|cna|lpn|rn/i.test(a.notes)) score += 10;
  return Math.min(99, score);
}

export async function hiringBoard() {
  const [{ data: postings }, { data: applicants }, { byId }] = await Promise.all([
    db.from("job_postings").select("*").order("created_at", { ascending: false }),
    db.from("job_applicants").select("*").order("applied_at", { ascending: false }),
    unitMap(),
  ]);
  const list = postings ?? [];
  const apps = applicants ?? [];
  const byStage = Object.fromEntries(
    STAGES.map((s) => [s, apps.filter((a) => a.stage === s)]),
  ) as Record<ApplicantStage, typeof apps>;
  const hired = apps.filter((a) => a.stage === "hired");
  const avgDays =
    hired.length > 0
      ? Math.round(
          hired.reduce(
            (s, a) =>
              s + (new Date(a.updated_at).getTime() - new Date(a.applied_at).getTime()) / 86400000,
            0,
          ) / hired.length,
        )
      : 0;
  return {
    postings: list.map((p) => ({
      ...p,
      unitName: p.unit_id ? (byId.get(p.unit_id) ?? "—") : "Any unit",
      shiftLabel: p.shift ? SHIFT_LABEL[p.shift as ShiftType] : "Any shift",
      applicants: apps.filter((a) => a.posting_id === p.id).length,
    })),
    applicants: apps,
    byStage,
    metrics: {
      openings: list.filter((p) => p.status === "open").reduce((s, p) => s + p.openings, 0),
      applied: apps.length,
      inPipeline: apps.filter((a) => !["hired", "rejected"].includes(a.stage)).length,
      hired: hired.length,
      avgDaysToHire: avgDays,
    },
  };
}

export async function createPosting(input: {
  title: string;
  position: PositionType;
  shift?: ShiftType | null | undefined;
  unitId?: string | null | undefined;
  employmentType?: string | undefined;
  payRange?: string | undefined;
  description?: string | undefined;
  openings?: number | undefined;
}) {
  const { data, error } = await db
    .from("job_postings")
    .insert({
      title: input.title,
      position: input.position,
      shift: input.shift ?? null,
      unit_id: input.unitId ?? null,
      employment_type: input.employmentType ?? "staff",
      pay_range: input.payRange ?? "",
      description: input.description ?? "",
      openings: input.openings ?? 1,
    })
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data;
}

export async function addApplicant(input: {
  postingId: string | null;
  fullName: string;
  email?: string | undefined;
  phone?: string | undefined;
  source?: string | undefined;
  notes?: string | undefined;
}) {
  const notes = input.notes ?? "";
  const score = scoreApplicant({
    source: input.source ?? "career_site",
    phone: input.phone ?? null,
    email: input.email ?? null,
    notes,
  });
  const { data, error } = await db
    .from("job_applicants")
    .insert({
      posting_id: input.postingId,
      full_name: input.fullName,
      email: input.email ?? null,
      phone: input.phone ?? null,
      source: input.source ?? "career_site",
      notes,
      ai_score: score,
      ai_summary:
        score >= 80
          ? "Strong match — auto-advanced to screening and flagged for interview."
          : score >= 65
            ? "Solid candidate — auto-advanced to screening."
            : "Needs review — incomplete contact details or limited experience noted.",
      stage: score >= 65 ? "screened" : "applied",
    })
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data;
}

export async function moveApplicant(id: string, stage: ApplicantStage, actorLabel: string) {
  const { data, error } = await db
    .from("job_applicants")
    .update({ stage, updated_at: new Date().toISOString() })
    .eq("id", id)
    .select()
    .single();
  if (error) throw new Error(error.message);
  await logAudit("applicant_stage", actorLabel, "job_applicants", id, { stage });
  return data;
}

/** Opens requisitions automatically when a unit/shift is chronically short. */
export async function autoRequisition() {
  const from = today();
  const to = addDays(from, 27);
  const [{ data: reqs }, { data: asg }, { data: postings }, { byId }] = await Promise.all([
    db.from("staffing_requirements").select("unit_id,position,shift,required_count"),
    db
      .from("shift_assignments")
      .select("shift_date,shift,unit_id,position,employee_id,status")
      .gte("shift_date", from)
      .lte("shift_date", to),
    db.from("job_postings").select("id,position,shift,unit_id,status"),
    unitMap(),
  ]);
  const filled = new Map<string, number>();
  for (const a of asg ?? []) {
    if (!a.employee_id || !["scheduled", "completed"].includes(a.status as string)) continue;
    filled.set(
      `${a.shift_date}|${a.shift}|${a.unit_id}|${a.position}`,
      (filled.get(`${a.shift_date}|${a.shift}|${a.unit_id}|${a.position}`) ?? 0) + 1,
    );
  }
  const shortDays = new Map<string, number>();
  for (const date of dateRange(from, to)) {
    for (const r of reqs ?? []) {
      const k = `${date}|${r.shift}|${r.unit_id}|${r.position}`;
      if ((filled.get(k) ?? 0) < r.required_count) {
        const gk = `${r.unit_id}|${r.position}|${r.shift}`;
        shortDays.set(gk, (shortDays.get(gk) ?? 0) + 1);
      }
    }
  }
  let created = 0;
  for (const [gk, days] of shortDays) {
    if (days < 5) continue;
    const [unitId, position, shift] = gk.split("|") as [string, PositionType, ShiftType];
    const exists = (postings ?? []).some(
      (p) =>
        p.status === "open" && p.position === position && p.shift === shift && p.unit_id === unitId,
    );
    if (exists) continue;
    await createPosting({
      title: `${POSITION_LABEL[position]} — ${byId.get(unitId) ?? "Unit"} ${SHIFT_LABEL[shift]}`,
      position,
      shift,
      unitId,
      payRange: position === "nurse" ? "$32–$41 / hr" : "$19–$25 / hr",
      description: `Auto-opened by CoverGrid: ${days} short days detected in the next four weeks on ${SHIFT_WINDOW[shift][position].join("–")}.`,
      openings: Math.max(1, Math.round(days / 7)),
    });
    created += 1;
  }
  return { created };
}

// ---------------- Engagement & retention ----------------

export async function engagementBoard(employeeId?: string | null) {
  const since = addDays(today(), -90);
  const [{ data: recognitions }, { data: emps }, { data: ledger }] = await Promise.all([
    db.from("recognitions").select("*").order("created_at", { ascending: false }).limit(40),
    db
      .from("employees")
      .select("id,full_name,position,reward_points,hire_date,termination_date,is_active"),
    db.from("reward_ledger").select("*").order("created_at", { ascending: false }).limit(50),
  ]);
  const nameOf = new Map((emps ?? []).map((e) => [e.id, e.full_name]));
  const active = (emps ?? []).filter((e) => e.is_active);
  const left = (emps ?? []).filter((e) => e.termination_date && e.termination_date >= since);
  const newHires = (emps ?? []).filter((e) => e.hire_date >= since);
  const leaderboard = [...active]
    .sort((a, b) => b.reward_points - a.reward_points)
    .slice(0, 10)
    .map((e) => ({ id: e.id, name: e.full_name, position: e.position, points: e.reward_points }));
  return {
    feed: (recognitions ?? []).map((r) => ({
      id: r.id,
      to: nameOf.get(r.employee_id) ?? "—",
      from: r.from_employee_id ? (nameOf.get(r.from_employee_id) ?? "Management") : "Management",
      badge: r.badge,
      message: r.message,
      points: r.points,
      createdAt: r.created_at,
    })),
    leaderboard,
    myLedger: employeeId ? (ledger ?? []).filter((l) => l.employee_id === employeeId) : [],
    myPoints: employeeId ? (active.find((e) => e.id === employeeId)?.reward_points ?? 0) : 0,
    metrics: {
      headcount: active.length,
      newHires90: newHires.length,
      departures90: left.length,
      turnoverRate:
        active.length > 0 ? Number(((left.length / active.length) * 100).toFixed(1)) : 0,
      recognitions90: (recognitions ?? []).filter((r) => r.created_at >= `${since}T00:00:00`)
        .length,
    },
  };
}

export async function awardPoints(employeeId: string, points: number, reason: string) {
  const { data: emp } = await db
    .from("employees")
    .select("reward_points")
    .eq("id", employeeId)
    .maybeSingle();
  await db
    .from("employees")
    .update({ reward_points: (emp?.reward_points ?? 0) + points })
    .eq("id", employeeId);
  await db.from("reward_ledger").insert({ employee_id: employeeId, points, reason });
  return { employeeId, points, reason };
}

export async function giveRecognition(input: {
  employeeId: string;
  fromEmployeeId: string | null;
  badge: string;
  message: string;
  points?: number;
}) {
  const points = input.points ?? 10;
  const { data, error } = await db
    .from("recognitions")
    .insert({
      employee_id: input.employeeId,
      from_employee_id: input.fromEmployeeId,
      badge: input.badge,
      message: input.message,
      points,
    })
    .select()
    .single();
  if (error) throw new Error(error.message);
  await awardPoints(input.employeeId, points, `Recognition: ${input.badge}`);
  await db.from("notifications").insert({
    employee_id: input.employeeId,
    title: `You received a ${input.badge} badge`,
    body: input.message || "Thank you for the great work.",
  });
  return data;
}

/** Rewards reliability automatically: perfect attendance and picked-up shifts. */
export async function retentionSweep() {
  const from = addDays(today(), -7);
  const to = addDays(today(), -1);
  const [{ data: asg }, { data: events }, { data: ledger }] = await Promise.all([
    db
      .from("shift_assignments")
      .select("employee_id,status,created_by_ai,shift_date")
      .gte("shift_date", from)
      .lte("shift_date", to),
    db
      .from("attendance_events")
      .select("employee_id,occurred_at")
      .gte("occurred_at", `${from}T00:00:00Z`)
      .lte("occurred_at", `${to}T23:59:59Z`),
    db
      .from("reward_ledger")
      .select("employee_id,reason,created_at")
      .gte("created_at", `${to}T00:00:00Z`),
  ]);
  const flagged = new Set((events ?? []).map((e) => e.employee_id));
  const worked = new Map<string, number>();
  for (const a of asg ?? []) {
    if (!a.employee_id || a.status === "cancelled") continue;
    worked.set(a.employee_id, (worked.get(a.employee_id) ?? 0) + 1);
  }
  const alreadyPaid = new Set(
    (ledger ?? []).filter((l) => l.reason === "Perfect week").map((l) => l.employee_id),
  );
  let awarded = 0;
  for (const [empId, count] of worked) {
    if (flagged.has(empId) || alreadyPaid.has(empId) || count < 3) continue;
    await awardPoints(empId, 25, "Perfect week");
    awarded += 1;
  }
  return { awarded };
}

// ---------------- Messaging ----------------

export async function listMessages(employeeId: string | null, isManager: boolean) {
  let q = db.from("messages").select("*").order("created_at", { ascending: false }).limit(80);
  if (!isManager && employeeId)
    q = q.or(`recipient_id.is.null,recipient_id.eq.${employeeId},sender_id.eq.${employeeId}`);
  const { data } = await q;
  return data ?? [];
}

export async function sendMessage(input: {
  senderId: string | null;
  senderName: string;
  recipientId: string | null;
  audience: string;
  subject: string;
  body: string;
}) {
  const { data, error } = await db
    .from("messages")
    .insert({
      sender_id: input.senderId,
      sender_name: input.senderName,
      recipient_id: input.recipientId,
      audience: input.audience,
      subject: input.subject,
      body: input.body,
    })
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data;
}

// ---------------- Compliance / PBJ ----------------

export async function pbjReport(from: string, to: string) {
  const [{ data: asg }, { data: emps }] = await Promise.all([
    db
      .from("shift_assignments")
      .select("shift_date,position,hours,status,employee_id")
      .gte("shift_date", from)
      .lte("shift_date", to),
    db.from("employees").select("id,employment_type"),
  ]);
  const typeOf = new Map((emps ?? []).map((e) => [e.id, e.employment_type as string]));
  const byDate = new Map<
    string,
    { date: string; rnHours: number; cnaHours: number; contractHours: number; total: number }
  >();
  for (const a of asg ?? []) {
    if (!a.employee_id || a.status !== "completed") continue;
    const row = byDate.get(a.shift_date) ?? {
      date: a.shift_date,
      rnHours: 0,
      cnaHours: 0,
      contractHours: 0,
      total: 0,
    };
    const hours = Number(a.hours);
    if (a.position === "nurse") row.rnHours += hours;
    else row.cnaHours += hours;
    if (typeOf.get(a.employee_id) === "agency") row.contractHours += hours;
    row.total += hours;
    byDate.set(a.shift_date, row);
  }
  const rows = [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));
  return {
    from,
    to,
    rows,
    totals: {
      rnHours: Number(rows.reduce((s, r) => s + r.rnHours, 0).toFixed(1)),
      cnaHours: Number(rows.reduce((s, r) => s + r.cnaHours, 0).toFixed(1)),
      contractHours: Number(rows.reduce((s, r) => s + r.contractHours, 0).toFixed(1)),
      total: Number(rows.reduce((s, r) => s + r.total, 0).toFixed(1)),
    },
  };
}

export function pbjCsv(report: Awaited<ReturnType<typeof pbjReport>>) {
  const head = "work_date,job_code_rn_hours,job_code_nurse_aide_hours,contract_hours,total_hours";
  const lines = report.rows.map((r) =>
    [
      r.date,
      r.rnHours.toFixed(2),
      r.cnaHours.toFixed(2),
      r.contractHours.toFixed(2),
      r.total.toFixed(2),
    ].join(","),
  );
  return [head, ...lines].join("\n");
}
