// Server-only engine for agencies, credentials, call-off risk, phone intake,
// fairness, labor projection, the shared float pool, orientation and shift pickup.
import {
  addDays,
  dateRange,
  OVERTIME_THRESHOLD_HOURS,
  POSITION_LABEL,
  SHIFT_LABEL,
  SHIFT_ORDER,
  SHIFT_WINDOW,
  shiftHours,
  startOfWeek,
  isWeekend,
  type PositionType,
  type ShiftType,
} from "./facility";
import { applyEarnedBuyback } from "./buyback.server";
import { db, getCoverage, logAudit, today, unitMap, weeklyHoursMap } from "./staffing.server";
import { seniorityYears } from "./floats.server";

const money = (n: number) => Math.round(n * 100) / 100;

// ============================ Agencies ============================

export async function agencyBoard(weekStart?: string) {
  const ws = startOfWeek(weekStart ?? today());
  const we = addDays(ws, 6);
  const [{ data: agencies }, { data: staff }, { data: asg }, { byId }] = await Promise.all([
    db.from("agencies").select("*").order("name"),
    db.from("agency_staff").select("*").order("full_name"),
    db
      .from("shift_assignments")
      .select("id,shift_date,shift,unit_id,position,agency_id,agency_staff_id,status,hours")
      .gte("shift_date", ws)
      .lte("shift_date", we)
      .not("agency_staff_id", "is", null),
    unitMap(),
  ]);

  const rateFor = (a: Record<string, unknown>, position: PositionType) =>
    Number(
      position === "nurse" ? a["rate_nurse"] : position === "qma" ? a["rate_qma"] : a["rate_cna"],
    ) || 0;

  const staffById = new Map((staff ?? []).map((s) => [s.id, s]));

  const rows = (agencies ?? []).map((a) => {
    const mine = (asg ?? []).filter((x) => {
      const s = x.agency_staff_id ? staffById.get(x.agency_staff_id) : null;
      return s?.agency_id === a.id;
    });
    const shifts = mine.filter((m) => m.status !== "cancelled").length;
    const spend = money(
      mine
        .filter((m) => m.status !== "cancelled")
        .reduce((sum, m) => sum + Number(m.hours) * rateFor(a, m.position as PositionType), 0),
    );
    const budget = Number(a.weekly_budget) || 0;
    const maxShifts = Number(a.max_shifts_per_week) || 0;
    const overBudget = budget > 0 && spend > budget;
    const overShifts = maxShifts > 0 && shifts > maxShifts;
    return {
      id: a.id as string,
      name: a.name as string,
      contactName: a.contact_name as string,
      contactEmail: (a.contact_email as string | null) ?? "",
      contactPhone: (a.contact_phone as string | null) ?? "",
      notes: a.notes as string,
      isActive: a.is_active as boolean,
      weeklyBudget: budget,
      maxShiftsPerWeek: maxShifts,
      rates: { nurse: Number(a.rate_nurse), qma: Number(a.rate_qma), cna: Number(a.rate_cna) },
      shiftsUsed: shifts,
      shiftsLeft: maxShifts > 0 ? Math.max(0, maxShifts - shifts) : null,
      spend,
      budgetLeft: budget > 0 ? money(budget - spend) : null,
      budgetPercent: budget > 0 ? Math.min(200, Math.round((spend / budget) * 100)) : 0,
      status:
        overBudget || overShifts
          ? "over"
          : (budget > 0 && spend / budget > 0.8) || (maxShifts > 0 && shifts / maxShifts > 0.8)
            ? "close"
            : "ok",
      warning: overBudget
        ? "Over the weekly dollar budget — stop booking this agency."
        : overShifts
          ? "Over the shifts allowed this week — stop booking this agency."
          : "",
      staff: (staff ?? [])
        .filter((s) => s.agency_id === a.id)
        .map((s) => {
          const upcoming = (asg ?? [])
            .filter((x) => x.agency_staff_id === s.id && x.status !== "cancelled")
            .sort((x, y) => x.shift_date.localeCompare(y.shift_date))
            .map((x) => ({
              assignmentId: x.id as string,
              date: x.shift_date as string,
              shift: x.shift as ShiftType,
              shiftLabel: SHIFT_LABEL[x.shift as ShiftType],
              window: SHIFT_WINDOW[x.shift as ShiftType][x.position as PositionType].join(" – "),
              unit: byId.get(x.unit_id as string) ?? "—",
              unitId: x.unit_id as string,
              position: x.position as PositionType,
            }));
          return {
            id: s.id as string,
            agencyId: s.agency_id as string,
            name: s.full_name as string,
            position: s.position as PositionType,
            positionLabel: POSITION_LABEL[s.position as PositionType],
            phone: (s.phone as string | null) ?? "",
            email: (s.email as string | null) ?? "",
            chartingUsername: s.charting_username as string,
            chartingPassword: s.charting_password as string,
            clockInNumber: s.clock_in_number as string,
            notes: s.notes as string,
            isActive: s.is_active as boolean,
            upcoming,
          };
        }),
    };
  });

  return { weekStart: ws, weekEnd: we, agencies: rows };
}

/** Who an agency worker (or a manager looking at one) is on the floor with. */
export async function agencyStaffDetail(agencyStaffId: string) {
  const { data: s } = await db
    .from("agency_staff")
    .select("*, agencies(name, contact_phone)")
    .eq("id", agencyStaffId)
    .maybeSingle();
  if (!s) throw new Error("That agency worker is not in the system.");
  const from = today();
  const { byId } = await unitMap();
  const { data: mine } = await db
    .from("shift_assignments")
    .select("id,shift_date,shift,unit_id,position,status")
    .eq("agency_staff_id", agencyStaffId)
    .gte("shift_date", from)
    .order("shift_date");

  const shifts = [];
  for (const a of mine ?? []) {
    const { data: mates } = await db
      .from("shift_assignments")
      .select(
        "position,employee_id,agency_staff_id,is_training,employees!shift_assignments_employee_id_fkey(full_name)",
      )
      .eq("shift_date", a.shift_date)
      .eq("shift", a.shift)
      .eq("unit_id", a.unit_id)
      .neq("id", a.id)
      .in("status", ["scheduled", "completed"]);
    const withNames = (mates ?? [])
      .map((m) => ({
        name:
          (m.employees as { full_name: string } | null)?.full_name ??
          (m.agency_staff_id ? "Agency staff" : null),
        position: POSITION_LABEL[m.position as PositionType],
        training: Boolean(m.is_training),
      }))
      .filter((m) => m.name);
    shifts.push({
      assignmentId: a.id as string,
      date: a.shift_date as string,
      shift: a.shift as ShiftType,
      shiftLabel: SHIFT_LABEL[a.shift as ShiftType],
      window: SHIFT_WINDOW[a.shift as ShiftType][a.position as PositionType].join(" – "),
      unit: byId.get(a.unit_id as string) ?? "—",
      position: POSITION_LABEL[a.position as PositionType],
      status: a.status as string,
      workingWith: withNames,
    });
  }

  return {
    id: s.id as string,
    name: s.full_name as string,
    agency: (s.agencies as { name: string } | null)?.name ?? "Agency",
    agencyPhone: (s.agencies as { contact_phone: string | null } | null)?.contact_phone ?? "",
    positionLabel: POSITION_LABEL[s.position as PositionType],
    phone: (s.phone as string | null) ?? "",
    email: (s.email as string | null) ?? "",
    chartingUsername: s.charting_username as string,
    chartingPassword: s.charting_password as string,
    clockInNumber: s.clock_in_number as string,
    notes: s.notes as string,
    shifts,
  };
}

export async function saveAgency(
  input: {
    id?: string | null | undefined;
    name: string;
    contactName?: string | undefined;
    contactEmail?: string | undefined;
    contactPhone?: string | undefined;
    weeklyBudget?: number | undefined;
    maxShiftsPerWeek?: number | undefined;
    rateNurse?: number | undefined;
    rateQma?: number | undefined;
    rateCna?: number | undefined;
    notes?: string | undefined;
    isActive?: boolean | undefined;
  },
  actorLabel: string,
) {
  const patch = {
    name: input.name,
    contact_name: input.contactName ?? "",
    contact_email: input.contactEmail ?? null,
    contact_phone: input.contactPhone ?? null,
    weekly_budget: input.weeklyBudget ?? 0,
    max_shifts_per_week: input.maxShiftsPerWeek ?? 0,
    rate_nurse: input.rateNurse ?? 0,
    rate_qma: input.rateQma ?? 0,
    rate_cna: input.rateCna ?? 0,
    notes: input.notes ?? "",
    is_active: input.isActive ?? true,
  };
  if (input.id) {
    await db.from("agencies").update(patch).eq("id", input.id);
    await logAudit("agency_updated", actorLabel, "agency", input.id, patch);
    return { id: input.id };
  }
  const { data } = await db.from("agencies").insert(patch).select("id").maybeSingle();
  await logAudit("agency_added", actorLabel, "agency", data?.id ?? null, patch);
  return { id: data?.id as string };
}

export async function saveAgencyStaff(
  input: {
    id?: string | null | undefined;
    agencyId: string;
    fullName: string;
    position: PositionType;
    phone?: string | undefined;
    email?: string | undefined;
    chartingUsername?: string | undefined;
    chartingPassword?: string | undefined;
    clockInNumber?: string | undefined;
    notes?: string | undefined;
    isActive?: boolean | undefined;
  },
  actorLabel: string,
) {
  const patch = {
    agency_id: input.agencyId,
    full_name: input.fullName,
    position: input.position,
    phone: input.phone ?? null,
    email: input.email ?? null,
    charting_username: input.chartingUsername ?? "",
    charting_password: input.chartingPassword ?? "",
    clock_in_number: input.clockInNumber ?? "",
    notes: input.notes ?? "",
    is_active: input.isActive ?? true,
  };
  if (input.id) {
    await db.from("agency_staff").update(patch).eq("id", input.id);
    await logAudit("agency_staff_updated", actorLabel, "agency_staff", input.id, {
      name: input.fullName,
    });
    return { id: input.id };
  }
  const { data } = await db.from("agency_staff").insert(patch).select("id").maybeSingle();
  await logAudit("agency_staff_added", actorLabel, "agency_staff", data?.id ?? null, {
    name: input.fullName,
  });
  return { id: data?.id as string };
}

/** Put an agency worker on an open shift so the whole floor can see it. */
export async function bookAgencyShift(input: {
  agencyStaffId: string;
  date: string;
  shift: ShiftType;
  unitId: string;
  position: PositionType;
  assignmentId?: string | null | undefined;
  actorLabel: string;
  force?: boolean | undefined;
}) {
  const { data: s } = await db
    .from("agency_staff")
    .select("*")
    .eq("id", input.agencyStaffId)
    .maybeSingle();
  if (!s) throw new Error("That agency worker is not in the system.");
  const board = await agencyBoard(input.date);
  const agency = board.agencies.find((a) => a.id === s.agency_id);
  if (agency && !input.force) {
    if (agency.status === "over") {
      throw new Error(
        `${agency.name} is already over its limit for that week (${agency.shiftsUsed} shifts, $${agency.spend}). ${agency.warning}`,
      );
    }
    {
      const projectedShifts = agency.shiftsUsed + 1;
      const projectedSpend =
        agency.spend +
        shiftHours(input.position) *
          (input.position === "nurse"
            ? agency.rates.nurse
            : input.position === "qma"
              ? agency.rates.qma
              : agency.rates.cna);
      if (agency.maxShiftsPerWeek > 0 && projectedShifts > agency.maxShiftsPerWeek) {
        throw new Error(
          `That booking would put ${agency.name} at ${projectedShifts} shifts this week, over its cap of ${agency.maxShiftsPerWeek}.`,
        );
      }
      if (agency.weeklyBudget > 0 && projectedSpend > agency.weeklyBudget) {
        throw new Error(
          `That booking would put ${agency.name} at $${Math.round(projectedSpend)} this week, over its $${agency.weeklyBudget} budget.`,
        );
      }
    }
  }

  const { byId } = await unitMap();
  const hours = shiftHours(input.position);
  if (input.assignmentId) {
    await db
      .from("shift_assignments")
      .update({
        agency_staff_id: input.agencyStaffId,
        agency_id: s.agency_id,
        employee_id: null,
        status: "scheduled",
      })
      .eq("id", input.assignmentId);
  } else {
    await db.from("shift_assignments").insert({
      shift_date: input.date,
      shift: input.shift,
      unit_id: input.unitId,
      position: input.position,
      employee_id: null,
      agency_staff_id: input.agencyStaffId,
      agency_id: s.agency_id,
      hours,
      status: "scheduled",
      note: `Agency coverage — ${s.full_name}`,
      fill_reason: `Booked through ${agency?.name ?? "the agency"} to cover an opening on ${byId.get(input.unitId)}.`,
    });
  }
  await logAudit("agency_shift_booked", input.actorLabel, "agency_staff", input.agencyStaffId, {
    date: input.date,
    shift: input.shift,
    unit: byId.get(input.unitId),
  });
  return {
    ok: true,
    message: `${s.full_name} (${agency?.name ?? "agency"}) is on ${byId.get(input.unitId)} for the ${SHIFT_LABEL[input.shift].toLowerCase()} on ${input.date}.`,
    agencyStatus: agency?.status ?? "ok",
  };
}

// ============================ Credentials ============================

export const CREDENTIAL_KINDS = [
  "Nursing license",
  "QMA certification",
  "CNA certification",
  "CPR",
  "TB test",
  "Flu vaccine",
  "Background check",
] as const;

export async function credentialBoard() {
  const { data } = await db
    .from("employee_credentials")
    .select("*, employees(full_name, position, is_active)")
    .order("expires_on");
  const now = today();
  const rows = (data ?? []).map((c) => {
    const days = Math.round(
      (new Date(`${c.expires_on}T12:00:00`).getTime() - new Date(`${now}T12:00:00`).getTime()) /
        86400000,
    );
    const state = days < 0 ? "expired" : days <= 7 ? "expiring" : days <= 30 ? "soon" : "ok";
    return {
      id: c.id as string,
      employeeId: c.employee_id as string,
      employee: (c.employees as { full_name: string } | null)?.full_name ?? "—",
      positionLabel:
        POSITION_LABEL[
          ((c.employees as { position: PositionType } | null)?.position ?? "cna") as PositionType
        ],
      kind: c.kind as string,
      identifier: c.identifier as string,
      expiresOn: c.expires_on as string,
      daysLeft: days,
      state,
      removedFromSchedule: c.removed_from_schedule as boolean,
      notes: c.notes as string,
    };
  });
  return {
    rows,
    expired: rows.filter((r) => r.state === "expired"),
    expiring: rows.filter((r) => r.state === "expiring"),
    soon: rows.filter((r) => r.state === "soon"),
  };
}

export async function saveCredential(
  input: {
    id?: string | null | undefined;
    employeeId: string;
    kind: string;
    identifier?: string | undefined;
    issuedOn?: string | null | undefined;
    expiresOn: string;
    notes?: string | undefined;
  },
  actorLabel: string,
) {
  const patch = {
    employee_id: input.employeeId,
    kind: input.kind,
    identifier: input.identifier ?? "",
    issued_on: input.issuedOn || null,
    expires_on: input.expiresOn,
    notes: input.notes ?? "",
    status: "active",
    removed_from_schedule: false,
  };
  if (input.id) {
    await db.from("employee_credentials").update(patch).eq("id", input.id);
    await logAudit("credential_updated", actorLabel, "employee_credential", input.id, patch);
    return { id: input.id };
  }
  const { data } = await db.from("employee_credentials").insert(patch).select("id").maybeSingle();
  await logAudit("credential_added", actorLabel, "employee_credential", data?.id ?? null, patch);
  return { id: data?.id as string };
}

/**
 * Warn a week out, then pull anyone whose credential has actually lapsed off
 * every future shift so they cannot work unlicensed.
 */
export async function credentialSweep(actorLabel = "the system") {
  const now = today();
  const warnBy = addDays(now, 7);
  const { data: creds } = await db
    .from("employee_credentials")
    .select("*, employees(full_name)")
    .lte("expires_on", warnBy);

  const warned: string[] = [];
  const removed: string[] = [];

  for (const c of creds ?? []) {
    const name = (c.employees as { full_name: string } | null)?.full_name ?? "Employee";
    const expired = (c.expires_on as string) < now;

    if (!expired) {
      if (c.last_warned_on === now) continue;
      await db.from("employee_credentials").update({ last_warned_on: now }).eq("id", c.id);
      await db.from("notifications").insert({
        employee_id: c.employee_id,
        audience: "employee",
        title: `Your ${c.kind} expires on ${c.expires_on}`,
        body: `Please renew your ${c.kind} before ${c.expires_on}. If it is not renewed by then you will be taken off the schedule until it is current again.`,
      });
      warned.push(`${name} — ${c.kind} expires ${c.expires_on}`);
      continue;
    }

    if (c.removed_from_schedule) continue;
    const { data: future } = await db
      .from("shift_assignments")
      .select("id,shift_date,shift,unit_id,position")
      .eq("employee_id", c.employee_id)
      .gte("shift_date", now)
      .in("status", ["scheduled"]);
    for (const a of future ?? []) {
      await db
        .from("shift_assignments")
        .update({ employee_id: null, status: "open", note: `Opened — ${c.kind} expired` })
        .eq("id", a.id);
      await db.from("staffing_alerts").insert({
        severity: "critical",
        shift_date: a.shift_date,
        shift: a.shift,
        unit_id: a.unit_id,
        position: a.position,
        message: `${name} was removed from this shift because their ${c.kind} expired on ${c.expires_on}.`,
        status: "open",
      });
    }
    await db
      .from("employee_credentials")
      .update({ removed_from_schedule: true, status: "expired" })
      .eq("id", c.id);
    await db.from("notifications").insert({
      employee_id: c.employee_id,
      audience: "employee",
      title: `${c.kind} expired — removed from the schedule`,
      body: `Your ${c.kind} expired on ${c.expires_on}, so your upcoming shifts have been opened up. As soon as it is renewed and entered here you will be put back on the schedule.`,
    });
    await db.from("notifications").insert({
      audience: "manager",
      title: `${name} pulled from the schedule`,
      body: `${name}'s ${c.kind} expired on ${c.expires_on}. ${(future ?? []).length} upcoming shift(s) were opened for coverage.`,
    });
    await logAudit("credential_expired_removal", actorLabel, "employee", c.employee_id as string, {
      kind: c.kind,
      shiftsOpened: (future ?? []).length,
    });
    removed.push(`${name} — ${c.kind} expired ${c.expires_on}`);
  }

  return { warned, removed };
}

// ============================ Call-off risk ============================

type RiskDetail = {
  employeeId: string;
  name: string;
  positionLabel: string;
  score: number;
  label: "high" | "elevated" | "low";
  reason: string;
  callOffs: number;
  lates: number;
  worstShift: string | null;
  worstDay: string | null;
  weekendShare: number;
  lastCallOff: string | null;
};

const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export async function computeRisk(): Promise<RiskDetail[]> {
  const since = addDays(today(), -365);
  const [{ data: emps }, { data: events }] = await Promise.all([
    db
      .from("employees")
      .select("id,full_name,position,hire_date,is_active,scheduled_shift")
      .eq("is_active", true),
    db
      .from("attendance_events")
      .select("employee_id,kind,occurred_at,assignment_id")
      .gte("occurred_at", `${since}T00:00:00Z`),
  ]);

  const asgIds = Array.from(
    new Set((events ?? []).map((e) => e.assignment_id).filter(Boolean)),
  ) as string[];
  const asgById = new Map<string, { shift: ShiftType; date: string }>();
  for (let i = 0; i < asgIds.length; i += 200) {
    const { data } = await db
      .from("shift_assignments")
      .select("id,shift,shift_date")
      .in("id", asgIds.slice(i, i + 200));
    (data ?? []).forEach((a) =>
      asgById.set(a.id, { shift: a.shift as ShiftType, date: a.shift_date as string }),
    );
  }

  const out: RiskDetail[] = [];
  for (const e of emps ?? []) {
    const mine = (events ?? []).filter((x) => x.employee_id === e.id);
    const callOffs = mine.filter((m) => m.kind === "call_off").length;
    const lates = mine.filter((m) => m.kind === "late").length;
    const shiftCount = new Map<string, number>();
    const dayCount = new Map<number, number>();
    let weekendOffs = 0;
    for (const m of mine) {
      const a = m.assignment_id ? asgById.get(m.assignment_id) : null;
      const date = a?.date ?? (m.occurred_at as string).slice(0, 10);
      if (a) shiftCount.set(a.shift, (shiftCount.get(a.shift) ?? 0) + 1);
      const dow = new Date(`${date}T12:00:00`).getDay();
      dayCount.set(dow, (dayCount.get(dow) ?? 0) + 1);
      if (isWeekend(date)) weekendOffs += 1;
    }
    const lastCallOff =
      mine
        .filter((m) => m.kind === "call_off")
        .map((m) => (m.occurred_at as string).slice(0, 10))
        .sort()
        .pop() ?? null;
    const daysSince = lastCallOff
      ? Math.round(
          (new Date(`${today()}T12:00:00`).getTime() -
            new Date(`${lastCallOff}T12:00:00`).getTime()) /
            86400000,
        )
      : null;

    const recency = daysSince === null ? 0 : Math.max(0, 30 - Math.min(daysSince, 30)) / 30; // 0..1
    const tenure = seniorityYears(e.hire_date as string);
    let score = callOffs * 12 + lates * 4 + recency * 20 - Math.min(tenure, 5) * 2;
    if (mine.length === 0) score = 0;
    score = Math.max(0, Math.min(100, Math.round(score)));

    const worstShiftEntry = [...shiftCount.entries()].sort((a, b) => b[1] - a[1])[0];
    const worstDayEntry = [...dayCount.entries()].sort((a, b) => b[1] - a[1])[0];
    const worstShift =
      worstShiftEntry && worstShiftEntry[1] > 1
        ? SHIFT_LABEL[worstShiftEntry[0] as ShiftType]
        : null;
    const worstDay = worstDayEntry && worstDayEntry[1] > 1 ? DAY_NAMES[worstDayEntry[0]]! : null;

    const label: RiskDetail["label"] = score >= 55 ? "high" : score >= 25 ? "elevated" : "low";
    const bits: string[] = [];
    bits.push(
      `${callOffs} call-off${callOffs === 1 ? "" : "s"} and ${lates} late arrival${lates === 1 ? "" : "s"} in the last year`,
    );
    if (worstDay) bits.push(`most often on a ${worstDay}`);
    if (worstShift) bits.push(`usually the ${worstShift.toLowerCase()}`);
    if (weekendOffs >= 2) bits.push(`${weekendOffs} of them on a weekend`);
    if (daysSince !== null && daysSince <= 30)
      bits.push(`last one was ${daysSince} day${daysSince === 1 ? "" : "s"} ago`);
    if (tenure >= 3) bits.push(`${tenure} years of service counts in their favor`);
    const reason =
      callOffs === 0 && lates === 0
        ? "No call-offs or late arrivals on record in the last year — not likely to call off."
        : `${label === "high" ? "Likely to call off" : label === "elevated" ? "Worth watching" : "Not likely to call off"}: ${bits.join("; ")}.`;

    out.push({
      employeeId: e.id as string,
      name: e.full_name as string,
      positionLabel: POSITION_LABEL[e.position as PositionType],
      score,
      label,
      reason,
      callOffs,
      lates,
      worstShift,
      worstDay,
      weekendShare: mine.length ? Math.round((weekendOffs / mine.length) * 100) : 0,
      lastCallOff,
    });
  }
  return out.sort((a, b) => b.score - a.score);
}

export async function riskSweep() {
  const rows = await computeRisk();
  for (const r of rows) {
    await db
      .from("employees")
      .update({
        no_show_risk: r.score,
        risk_label: r.label,
        risk_reason: r.reason,
        risk_updated_at: new Date().toISOString(),
      })
      .eq("id", r.employeeId);
  }
  return { scored: rows.length, high: rows.filter((r) => r.label === "high").length };
}

/** Risk view for managers, including which upcoming shifts are shaky. */
export async function riskBoard() {
  const rows = await computeRisk();
  const byId = new Map(rows.map((r) => [r.employeeId, r]));
  const from = today();
  const to = addDays(from, 7);
  const { byId: units } = await unitMap();
  const { data: asg } = await db
    .from("shift_assignments")
    .select("id,shift_date,shift,unit_id,position,employee_id")
    .gte("shift_date", from)
    .lte("shift_date", to)
    .eq("status", "scheduled")
    .not("employee_id", "is", null);

  const shaky = (asg ?? [])
    .map((a) => {
      const r = byId.get(a.employee_id as string);
      if (!r || r.label === "low") return null;
      const dow = DAY_NAMES[new Date(`${a.shift_date}T12:00:00`).getDay()]!;
      const patternHit =
        (r.worstDay === dow ? 1 : 0) + (r.worstShift === SHIFT_LABEL[a.shift as ShiftType] ? 1 : 0);
      return {
        assignmentId: a.id as string,
        date: a.shift_date as string,
        day: dow,
        shiftLabel: SHIFT_LABEL[a.shift as ShiftType],
        unit: units.get(a.unit_id as string) ?? "—",
        employeeId: a.employee_id as string,
        name: r.name,
        score: r.score + patternHit * 10,
        label: r.label,
        reason: r.reason,
        patternNote:
          patternHit > 0
            ? `This is exactly the pattern: ${r.worstDay === dow ? `${dow}s` : ""}${patternHit === 2 ? " on the " : ""}${r.worstShift === SHIFT_LABEL[a.shift as ShiftType] ? `${r.worstShift.toLowerCase()}` : ""}.`
            : "",
      };
    })
    .filter(Boolean)
    .sort((a, b) => b!.score - a!.score) as NonNullable<ReturnType<() => never>>[] extends never
    ? never[]
    : {
        assignmentId: string;
        date: string;
        day: string;
        shiftLabel: string;
        unit: string;
        employeeId: string;
        name: string;
        score: number;
        label: string;
        reason: string;
        patternNote: string;
      }[];

  return {
    people: rows,
    likely: rows.filter((r) => r.label === "high"),
    watch: rows.filter((r) => r.label === "elevated"),
    shakyShifts: shaky.slice(0, 25),
  };
}

// ============================ Phone / voice call-off intake ============================

const SHIFT_WORDS: [RegExp, ShiftType][] = [
  [/\b(1st|first|day|morning|6\s*(am)?)\b/i, "first"],
  [/\b(2nd|second|evening|afternoon|2\s*(pm)?)\b/i, "second"],
  [/\b(3rd|third|night|overnight|10\s*(pm)?)\b/i, "third"],
];

export function parseIntake(transcript: string, fallbackDate = today()) {
  const t = transcript.toLowerCase();
  let date = fallbackDate;
  if (/tomorrow/.test(t)) date = addDays(fallbackDate, 1);
  const explicit = t.match(/(\d{4}-\d{2}-\d{2})/);
  if (explicit?.[1]) date = explicit[1];

  const lateMatch = t.match(/(\d{1,3})\s*(minutes|mins|min)\b/);
  const isLate =
    /\blate\b|running behind|be there (in|by)/.test(t) &&
    !/call(ing)? off|can'?t (make|come)|not coming/.test(t);
  const kind: "call_off" | "late" = isLate ? "late" : "call_off";

  let shift: ShiftType | null = null;
  for (const [re, s] of SHIFT_WORDS)
    if (re.test(t)) {
      shift = s;
      break;
    }

  let confidence = 0.4;
  if (shift) confidence += 0.2;
  if (/tomorrow|today|\d{4}-\d{2}-\d{2}/.test(t)) confidence += 0.2;
  if (isLate ? Boolean(lateMatch) : /call(ing)? off|can'?t (make|come)|not coming|sick/.test(t))
    confidence += 0.2;

  return {
    kind,
    date,
    shift,
    minutesLate: lateMatch?.[1] ? Number(lateMatch[1]) : isLate ? 30 : null,
    confidence: Math.min(1, Number(confidence.toFixed(2))),
  };
}

export async function recordIntake(input: {
  employeeId?: string | null | undefined;
  callerName?: string | undefined;
  callerPhone?: string | undefined;
  channel?: string | undefined;
  transcript: string;
}) {
  const parsed = parseIntake(input.transcript);
  let employeeId = input.employeeId ?? null;
  if (!employeeId && input.callerPhone) {
    const { data } = await db
      .from("employees")
      .select("id")
      .eq("phone", input.callerPhone)
      .maybeSingle();
    employeeId = (data?.id as string | undefined) ?? null;
  }
  if (!employeeId && input.callerName) {
    const { data } = await db
      .from("employees")
      .select("id,full_name")
      .ilike("full_name", `%${input.callerName}%`)
      .limit(2);
    if ((data ?? []).length === 1) employeeId = data![0]!.id as string;
  }
  const { data: row } = await db
    .from("call_off_intakes")
    .insert({
      employee_id: employeeId,
      caller_name: input.callerName ?? "",
      caller_phone: input.callerPhone ?? "",
      channel: input.channel ?? "phone",
      transcript: input.transcript,
      parsed_kind: parsed.kind,
      parsed_date: parsed.date,
      parsed_shift: parsed.shift,
      minutes_late: parsed.minutesLate,
      confidence: parsed.confidence,
      status: "pending",
    })
    .select("id")
    .maybeSingle();

  await db.from("notifications").insert({
    audience: "manager",
    title: parsed.kind === "late" ? "Someone called in late" : "Someone called off",
    body: `${input.callerName || "A caller"}: “${input.transcript.slice(0, 160)}” — heard as a ${parsed.kind === "late" ? "late arrival" : "call-off"} for ${parsed.date}${parsed.shift ? ` (${SHIFT_LABEL[parsed.shift].toLowerCase()})` : ""}.`,
  });

  return { id: row?.id as string, parsed, matched: Boolean(employeeId) };
}

export async function intakeInbox() {
  const { data } = await db
    .from("call_off_intakes")
    .select("*, employees(full_name)")
    .order("created_at", { ascending: false })
    .limit(60);
  return (data ?? []).map((r) => ({
    id: r.id as string,
    employeeId: (r.employee_id as string | null) ?? null,
    employee: (r.employees as { full_name: string } | null)?.full_name ?? null,
    callerName: r.caller_name as string,
    callerPhone: r.caller_phone as string,
    channel: r.channel as string,
    transcript: r.transcript as string,
    kind: (r.parsed_kind as string | null) ?? "call_off",
    date: (r.parsed_date as string | null) ?? "",
    shift: (r.parsed_shift as ShiftType | null) ?? null,
    shiftLabel: r.parsed_shift ? SHIFT_LABEL[r.parsed_shift as ShiftType] : null,
    minutesLate: (r.minutes_late as number | null) ?? null,
    confidence: Number(r.confidence),
    status: r.status as string,
    outcome: r.outcome as string,
    createdAt: r.created_at as string,
  }));
}

export async function findIntakeAssignment(
  employeeId: string,
  date: string,
  shift: ShiftType | null,
) {
  let q = db
    .from("shift_assignments")
    .select("id,shift,unit_id")
    .eq("employee_id", employeeId)
    .eq("shift_date", date)
    .eq("status", "scheduled");
  if (shift) q = q.eq("shift", shift);
  const { data } = await q.limit(1);
  return (data ?? [])[0] ?? null;
}

// ============================ Fairness scorecard ============================

export async function fairnessScorecard(from?: string | undefined, to?: string) {
  const start = from ?? addDays(today(), -84);
  const end = to ?? today();
  const [{ data: emps }, { data: asg }, { data: floats }] = await Promise.all([
    db.from("employees").select("id,full_name,position,hire_date,is_active").eq("is_active", true),
    db
      .from("shift_assignments")
      .select("employee_id,shift_date,shift,is_overtime,hours,status,is_float")
      .gte("shift_date", start)
      .lte("shift_date", end)
      .in("status", ["scheduled", "completed"]),
    db.from("float_events").select("employee_id").gte("shift_date", start).lte("shift_date", end),
  ]);

  const rows = (emps ?? []).map((e) => {
    const mine = (asg ?? []).filter((a) => a.employee_id === e.id);
    const weekends = mine.filter((a) => isWeekend(a.shift_date as string)).length;
    const nights = mine.filter((a) => a.shift === "third").length;
    const otHours = mine.filter((a) => a.is_overtime).reduce((s, a) => s + Number(a.hours), 0);
    const floatCount = (floats ?? []).filter((f) => f.employee_id === e.id).length;
    return {
      employeeId: e.id as string,
      name: e.full_name as string,
      positionLabel: POSITION_LABEL[e.position as PositionType],
      shifts: mine.length,
      weekends,
      weekendShare: mine.length ? Math.round((weekends / mine.length) * 100) : 0,
      nights,
      otHours: money(otHours),
      floats: floatCount,
      years: seniorityYears(e.hire_date as string),
    };
  });

  const avg = (pick: (r: (typeof rows)[number]) => number) =>
    rows.length ? rows.reduce((s, r) => s + pick(r), 0) / rows.length : 0;
  const avgWeekend = avg((r) => r.weekends);
  const avgNight = avg((r) => r.nights);
  const avgOt = avg((r) => r.otHours);
  const avgFloat = avg((r) => r.floats);

  const scored = rows
    .map((r) => {
      const load =
        (r.weekends - avgWeekend) * 1.5 +
        (r.nights - avgNight) * 1 +
        (r.otHours - avgOt) * 0.25 +
        (r.floats - avgFloat) * 1.5;
      const balance = load > 3 ? "carrying more" : load < -3 ? "carrying less" : "even";
      return {
        ...r,
        loadIndex: money(load),
        balance,
        note:
          balance === "carrying more"
            ? `Above the floor average on ${[r.weekends > avgWeekend ? "weekends" : null, r.nights > avgNight ? "nights" : null, r.otHours > avgOt ? "overtime" : null, r.floats > avgFloat ? "floats" : null].filter(Boolean).join(", ")}.`
            : balance === "carrying less"
              ? "Below the floor average on the tough shifts — next in line when something hard comes up."
              : "Right around the floor average.",
      };
    })
    .sort((a, b) => b.loadIndex - a.loadIndex);

  return {
    from: start,
    to: end,
    averages: {
      weekends: money(avgWeekend),
      nights: money(avgNight),
      otHours: money(avgOt),
      floats: money(avgFloat),
    },
    rows: scored,
  };
}

// ============================ Labor cost projection ============================

export async function costProjection(weekStart?: string) {
  const ws = startOfWeek(weekStart ?? today());
  const we = addDays(ws, 6);
  const [
    { data: asg },
    { data: emps },
    { data: agencies },
    { data: agencyStaff },
    { data: facilities },
  ] = await Promise.all([
    db
      .from("shift_assignments")
      .select(
        "shift_date,shift,position,hours,is_overtime,employee_id,agency_staff_id,status,unit_id",
      )
      .gte("shift_date", ws)
      .lte("shift_date", we)
      .in("status", ["scheduled", "completed"]),
    db.from("employees").select("id,hourly_rate"),
    db
      .from("agencies")
      .select("id,name,rate_nurse,rate_qma,rate_cna,weekly_budget,max_shifts_per_week"),
    db.from("agency_staff").select("id,agency_id"),
    db.from("facilities").select("id,name,weekly_labor_budget").order("sort_order"),
  ]);

  const rateById = new Map((emps ?? []).map((e) => [e.id as string, Number(e.hourly_rate) || 0]));
  const staffAgency = new Map(
    (agencyStaff ?? []).map((s) => [s.id as string, s.agency_id as string]),
  );
  const agencyById = new Map((agencies ?? []).map((a) => [a.id as string, a]));

  let straight = 0;
  let overtime = 0;
  let agencyCost = 0;
  const byDay = new Map<string, number>();
  const byAgency = new Map<
    string,
    { name: string; cost: number; shifts: number; budget: number }
  >();

  for (const a of asg ?? []) {
    const hours = Number(a.hours);
    let cost = 0;
    if (a.agency_staff_id) {
      const ag = agencyById.get(staffAgency.get(a.agency_staff_id as string) ?? "");
      const rate = ag
        ? Number(
            a.position === "nurse"
              ? ag.rate_nurse
              : a.position === "qma"
                ? ag.rate_qma
                : ag.rate_cna,
          )
        : 0;
      cost = hours * rate;
      agencyCost += cost;
      if (ag) {
        const cur = byAgency.get(ag.id as string) ?? {
          name: ag.name as string,
          cost: 0,
          shifts: 0,
          budget: Number(ag.weekly_budget),
        };
        cur.cost += cost;
        cur.shifts += 1;
        byAgency.set(ag.id as string, cur);
      }
    } else if (a.employee_id) {
      const rate = rateById.get(a.employee_id as string) ?? 0;
      cost = hours * rate * (a.is_overtime ? 1.5 : 1);
      if (a.is_overtime) overtime += cost;
      else straight += cost;
    }
    byDay.set(a.shift_date as string, (byDay.get(a.shift_date as string) ?? 0) + cost);
  }

  const projected = money(straight + overtime + agencyCost);
  const budget = (facilities ?? []).reduce((s, f) => s + Number(f.weekly_labor_budget), 0);
  return {
    weekStart: ws,
    weekEnd: we,
    straight: money(straight),
    overtime: money(overtime),
    agency: money(agencyCost),
    projected,
    budget: money(budget),
    variance: money(budget - projected),
    percentOfBudget: budget > 0 ? Math.round((projected / budget) * 100) : 0,
    days: dateRange(ws, we).map((d) => ({ date: d, cost: money(byDay.get(d) ?? 0) })),
    agencies: [...byAgency.values()].map((a) => ({ ...a, cost: money(a.cost) })),
    facilities: (facilities ?? []).map((f) => ({
      id: f.id as string,
      name: f.name as string,
      budget: Number(f.weekly_labor_budget),
    })),
  };
}

// ============================ Buildings & shared float pool ============================

export async function floatPoolBoard() {
  const [{ data: facilities }, { data: units }, { data: emps }] = await Promise.all([
    db.from("facilities").select("*").order("sort_order"),
    db.from("units").select("id,name,facility_id").order("sort_order"),
    db
      .from("employees")
      .select(
        "id,full_name,position,primary_unit_id,home_facility_id,float_pool_optin,float_count,last_floated_on,hire_date,is_active",
      )
      .eq("is_active", true),
  ]);

  const unitFacility = new Map(
    (units ?? []).map((u) => [u.id as string, u.facility_id as string | null]),
  );

  const members = (emps ?? [])
    .filter((e) => e.float_pool_optin)
    .map((e) => ({
      id: e.id as string,
      name: e.full_name as string,
      positionLabel: POSITION_LABEL[e.position as PositionType],
      facilityId:
        (e.home_facility_id as string | null) ??
        unitFacility.get((e.primary_unit_id as string) ?? "") ??
        null,
      floatCount: Number(e.float_count),
      lastFloatedOn: (e.last_floated_on as string | null) ?? null,
      years: seniorityYears(e.hire_date as string),
    }))
    .sort((a, b) => a.floatCount - b.floatCount || b.years - a.years);

  return {
    facilities: (facilities ?? []).map((f) => ({
      id: f.id as string,
      name: f.name as string,
      address: f.address as string,
      weeklyLaborBudget: Number(f.weekly_labor_budget),
      isActive: f.is_active as boolean,
      geofenceLat: (f.geofence_lat as number | null) ?? null,
      geofenceLng: (f.geofence_lng as number | null) ?? null,
      geofenceRadiusM: (f.geofence_radius_m as number | null) ?? null,
      units: (units ?? [])
        .filter((u) => u.facility_id === f.id)
        .map((u) => ({ id: u.id as string, name: u.name as string })),
      poolMembers: members.filter((m) => m.facilityId === f.id).length,
    })),
    members,
    optedOut: (emps ?? []).filter((e) => !e.float_pool_optin).length,
  };
}

export async function saveFacility(
  input: {
    id?: string | null | undefined;
    name: string;
    address?: string | undefined;
    weeklyLaborBudget?: number | undefined;
    geofenceLat?: number | null | undefined;
    geofenceLng?: number | null | undefined;
    geofenceRadiusM?: number | null | undefined;
  },
  actorLabel: string,
) {
  const patch = {
    name: input.name,
    address: input.address ?? "",
    weekly_labor_budget: input.weeklyLaborBudget ?? 0,
    geofence_lat: input.geofenceLat ?? null,
    geofence_lng: input.geofenceLng ?? null,
    geofence_radius_m: input.geofenceRadiusM ?? null,
  };
  if (input.id) {
    await db.from("facilities").update(patch).eq("id", input.id);
    await logAudit("facility_updated", actorLabel, "facility", input.id, patch);
    return { id: input.id };
  }
  const { data } = await db.from("facilities").insert(patch).select("id").maybeSingle();
  await logAudit("facility_added", actorLabel, "facility", data?.id ?? null, patch);
  return { id: data?.id as string };
}

export async function setFloatPoolOptin(employeeId: string, optin: boolean, actorLabel: string) {
  await db.from("employees").update({ float_pool_optin: optin }).eq("id", employeeId);
  await logAudit("float_pool_optin", actorLabel, "employee", employeeId, { optin });
  return { ok: true };
}

// ============================ Orientation / training ============================

export async function trainingBoard() {
  const { byId } = await unitMap();
  const [{ data: trainees }, { data: mentors }] = await Promise.all([
    db
      .from("employees")
      .select(
        "id,full_name,position,primary_unit_id,scheduled_shift,hire_date,in_training,training_ends_on",
      )
      .eq("is_active", true)
      .eq("in_training", true),
    db
      .from("employees")
      .select("id,full_name,position,primary_unit_id,hire_date")
      .eq("is_active", true),
  ]);

  const rows = [];
  for (const t of trainees ?? []) {
    const { data: shifts } = await db
      .from("shift_assignments")
      .select(
        "id,shift_date,shift,unit_id,position,is_training,preceptor_id,employees!shift_assignments_preceptor_id_fkey(full_name)",
      )
      .eq("employee_id", t.id)
      .gte("shift_date", today())
      .order("shift_date")
      .limit(12);
    rows.push({
      id: t.id as string,
      name: t.full_name as string,
      positionLabel: POSITION_LABEL[t.position as PositionType],
      unit: byId.get((t.primary_unit_id as string) ?? "") ?? "—",
      hireDate: t.hire_date as string,
      trainingEndsOn: (t.training_ends_on as string | null) ?? null,
      shifts: (shifts ?? []).map((s) => ({
        id: s.id as string,
        date: s.shift_date as string,
        shiftLabel: SHIFT_LABEL[s.shift as ShiftType],
        unit: byId.get(s.unit_id as string) ?? "—",
        isTraining: Boolean(s.is_training),
        preceptor: (s.employees as { full_name: string } | null)?.full_name ?? null,
      })),
    });
  }

  return {
    trainees: rows,
    mentors: (mentors ?? [])
      .filter((m) => seniorityYears(m.hire_date as string) >= 1)
      .map((m) => ({
        id: m.id as string,
        name: m.full_name as string,
        positionLabel: POSITION_LABEL[m.position as PositionType],
        unit: byId.get((m.primary_unit_id as string) ?? "") ?? "—",
        years: seniorityYears(m.hire_date as string),
      }))
      .sort((a, b) => b.years - a.years),
  };
}

export async function setTraining(
  input: { employeeId: string; inTraining: boolean; endsOn?: string | null | undefined },
  actorLabel: string,
) {
  await db
    .from("employees")
    .update({ in_training: input.inTraining, training_ends_on: input.endsOn || null })
    .eq("id", input.employeeId);
  if (input.inTraining) {
    // Orientation shifts shadow a preceptor and never count as their own assignment.
    await db
      .from("shift_assignments")
      .update({ is_training: true })
      .eq("employee_id", input.employeeId)
      .gte("shift_date", today())
      .lte("shift_date", input.endsOn || addDays(today(), 14));
  } else {
    await db
      .from("shift_assignments")
      .update({ is_training: false, preceptor_id: null })
      .eq("employee_id", input.employeeId)
      .gte("shift_date", today());
  }
  await logAudit(
    "training_set",
    actorLabel,
    "employee",
    input.employeeId,
    input as unknown as Record<string, unknown>,
  );
  return { ok: true };
}

export async function setPreceptor(
  assignmentId: string,
  preceptorId: string | null,
  actorLabel: string,
) {
  await db
    .from("shift_assignments")
    .update({ preceptor_id: preceptorId, is_training: true })
    .eq("id", assignmentId);
  await logAudit("preceptor_set", actorLabel, "shift_assignment", assignmentId, { preceptorId });
  return { ok: true };
}

/** Anyone still in orientation shadows a preceptor instead of holding a slot. */
export async function trainingSweep(actorLabel = "the system") {
  const now = today();
  const { data: trainees } = await db
    .from("employees")
    .select("id,full_name,training_ends_on,primary_unit_id,position")
    .eq("in_training", true)
    .eq("is_active", true);
  let paired = 0;
  let graduated = 0;
  for (const t of trainees ?? []) {
    if (t.training_ends_on && (t.training_ends_on as string) < now) {
      await db.from("employees").update({ in_training: false }).eq("id", t.id);
      await db
        .from("shift_assignments")
        .update({ is_training: false, preceptor_id: null })
        .eq("employee_id", t.id)
        .gte("shift_date", now);
      await db.from("notifications").insert({
        employee_id: t.id,
        audience: "employee",
        title: "Orientation complete",
        body: "You have finished orientation and now carry your own assignment. Welcome aboard.",
      });
      graduated += 1;
      continue;
    }
    const { data: shifts } = await db
      .from("shift_assignments")
      .select("id,shift_date,shift,unit_id")
      .eq("employee_id", t.id)
      .gte("shift_date", now)
      .is("preceptor_id", null);
    for (const s of shifts ?? []) {
      const { data: mates } = await db
        .from("shift_assignments")
        .select("employee_id,employees!shift_assignments_employee_id_fkey(full_name,hire_date)")
        .eq("shift_date", s.shift_date)
        .eq("shift", s.shift)
        .eq("unit_id", s.unit_id)
        .eq("position", t.position)
        .neq("employee_id", t.id)
        .eq("status", "scheduled");
      const best = (mates ?? [])
        .filter((m) => m.employee_id)
        .sort(
          (a, b) =>
            seniorityYears((b.employees as { hire_date: string } | null)?.hire_date) -
            seniorityYears((a.employees as { hire_date: string } | null)?.hire_date),
        )[0];
      await db
        .from("shift_assignments")
        .update({ is_training: true, preceptor_id: best?.employee_id ?? null })
        .eq("id", s.id);
      if (best) paired += 1;
    }
  }
  if (paired || graduated)
    await logAudit("training_sweep", actorLabel, "employee", null, { paired, graduated });
  return { paired, graduated };
}

// ============================ Shift pickup board ============================

export type PickupShift = {
  key: string;
  assignmentId: string | null;
  date: string;
  dayLabel: string;
  shift: ShiftType;
  shiftLabel: string;
  window: string;
  unitId: string;
  unit: string;
  position: PositionType;
  positionLabel: string;
  hours: number;
  eligible: boolean;
  wouldBeOvertime: boolean;
  why: string;
  urgency: "critical" | "needed" | "extra";
};

export async function pickupBoard(employeeId: string, daysAhead = 21) {
  const { data: emp } = await db.from("employees").select("*").eq("id", employeeId).maybeSingle();
  if (!emp) throw new Error("We could not find your employee record.");
  const from = addDays(today(), 1);
  const to = addDays(today(), daysAhead);
  const { byId } = await unitMap();

  const [coverage, { data: mine }, { data: openRows }, { data: pto }] = await Promise.all([
    getCoverage(from, to),
    db
      .from("shift_assignments")
      .select("shift_date,shift,hours,position")
      .eq("employee_id", employeeId)
      .gte("shift_date", from)
      .in("status", ["scheduled", "completed"]),
    db
      .from("shift_assignments")
      .select("id,shift_date,shift,unit_id,position,status,hours")
      .gte("shift_date", from)
      .lte("shift_date", to)
      .is("employee_id", null)
      .is("agency_staff_id", null)
      .in("status", ["open", "scheduled"]),
    db
      .from("pto_requests")
      .select("start_date,end_date,status")
      .eq("employee_id", employeeId)
      .eq("status", "approved"),
  ]);

  const takenDates = new Set((mine ?? []).map((m) => m.shift_date as string));
  const weekHours = new Map<string, number>();
  for (const m of mine ?? []) {
    const ws = startOfWeek(m.shift_date as string);
    weekHours.set(ws, (weekHours.get(ws) ?? 0) + Number(m.hours));
  }
  const onPto = (d: string) =>
    (pto ?? []).some((p) => d >= (p.start_date as string) && d <= (p.end_date as string));
  const qualified = new Set(
    [emp.primary_unit_id, ...((emp.qualified_unit_ids as string[]) ?? [])].filter(
      Boolean,
    ) as string[],
  );

  const openByKey = new Map<string, { id: string; hours: number }>();
  for (const r of openRows ?? []) {
    openByKey.set(`${r.shift_date}|${r.shift}|${r.unit_id}|${r.position}`, {
      id: r.id as string,
      hours: Number(r.hours),
    });
  }

  const list: PickupShift[] = [];
  const seen = new Set<string>();
  const consider = (
    date: string,
    shift: ShiftType,
    unitId: string,
    position: PositionType,
    gap: number,
    assignmentId: string | null,
    hours: number,
  ) => {
    const key = `${date}|${shift}|${unitId}|${position}`;
    if (seen.has(key)) return;
    seen.add(key);
    const reasons: string[] = [];
    let eligible = true;
    if (position !== (emp.position as PositionType)) {
      eligible = false;
      reasons.push(
        `This is a ${POSITION_LABEL[position]} shift and you are a ${POSITION_LABEL[emp.position as PositionType]}.`,
      );
    }
    if (!qualified.has(unitId)) {
      eligible = false;
      reasons.push(`You are not signed off on ${byId.get(unitId)} yet.`);
    }
    if (takenDates.has(date)) {
      eligible = false;
      reasons.push("You already work that day.");
    }
    if (onPto(date)) {
      eligible = false;
      reasons.push("You have approved time off that day.");
    }
    if (emp.in_training) {
      eligible = false;
      reasons.push("You are still in orientation, so a trainer has to schedule you.");
    }
    const ws = startOfWeek(date);
    const projected = (weekHours.get(ws) ?? 0) + hours;
    const wouldBeOvertime = projected > OVERTIME_THRESHOLD_HOURS;
    list.push({
      key,
      assignmentId,
      date,
      dayLabel: new Date(`${date}T12:00:00`).toLocaleDateString("en-US", {
        weekday: "long",
        month: "short",
        day: "numeric",
      }),
      shift,
      shiftLabel: SHIFT_LABEL[shift],
      window: SHIFT_WINDOW[shift][position].join(" – "),
      unitId,
      unit: byId.get(unitId) ?? "Unit",
      position,
      positionLabel: POSITION_LABEL[position],
      hours,
      eligible,
      wouldBeOvertime,
      why: eligible
        ? `${byId.get(unitId)} needs ${gap} more ${POSITION_LABEL[position]}${gap === 1 ? "" : "s"} that shift. This would put you at about ${projected.toFixed(1)} hours that week${wouldBeOvertime ? " — overtime pay." : "."}`
        : reasons.join(" "),
      urgency: gap >= 2 ? "critical" : gap === 1 ? "needed" : "extra",
    });
  };

  for (const c of coverage) {
    if (c.gap <= 0) continue;
    const key = `${c.date}|${c.shift}|${c.unitId}|${c.position}`;
    const row = openByKey.get(key);
    consider(
      c.date,
      c.shift,
      c.unitId,
      c.position,
      c.gap,
      row?.id ?? null,
      row?.hours ?? shiftHours(c.position),
    );
  }
  for (const [key, row] of openByKey) {
    const [date, shift, unitId, position] = key.split("|") as [
      string,
      ShiftType,
      string,
      PositionType,
    ];
    consider(date, shift, unitId, position, 1, row.id, row.hours);
  }

  list.sort(
    (a, b) =>
      Number(b.eligible) - Number(a.eligible) ||
      a.date.localeCompare(b.date) ||
      SHIFT_ORDER[a.shift] - SHIFT_ORDER[b.shift] ||
      a.unit.localeCompare(b.unit),
  );

  return {
    employeeName: emp.full_name as string,
    positionLabel: POSITION_LABEL[emp.position as PositionType],
    shifts: list,
    openForMe: list.filter((s) => s.eligible).length,
  };
}

export async function claimShift(
  employeeId: string,
  input: { assignmentId?: string | null | undefined; key?: string | null | undefined },
) {
  const board = await pickupBoard(employeeId, 60);
  const target = input.assignmentId
    ? board.shifts.find((s) => s.assignmentId === input.assignmentId)
    : board.shifts.find((s) => s.key === input.key);
  if (!target) throw new Error("That shift is no longer on the board.");
  if (!target.eligible) throw new Error(target.why);

  const { data: emp } = await db
    .from("employees")
    .select("full_name")
    .eq("id", employeeId)
    .maybeSingle();
  const name = emp?.full_name ?? "An employee";
  const fillReason = `${name} picked this shift up from the open shift board on ${today()}. It was short ${target.urgency === "critical" ? "two or more people" : "one person"}.`;

  let assignmentId = target.assignmentId;
  if (assignmentId) {
    const { data: still } = await db
      .from("shift_assignments")
      .select("employee_id,agency_staff_id")
      .eq("id", assignmentId)
      .maybeSingle();
    if (still?.employee_id || still?.agency_staff_id)
      throw new Error("Someone just took that shift. Please pick another one.");
    await db
      .from("shift_assignments")
      .update({
        employee_id: employeeId,
        status: "scheduled",
        is_overtime: target.wouldBeOvertime,
        fill_reason: fillReason,
      })
      .eq("id", assignmentId);
  } else {
    const { data: created } = await db
      .from("shift_assignments")
      .insert({
        shift_date: target.date,
        shift: target.shift,
        unit_id: target.unitId,
        position: target.position,
        employee_id: employeeId,
        hours: target.hours,
        status: "scheduled",
        is_overtime: target.wouldBeOvertime,
        fill_reason: fillReason,
        note: "Picked up from the open shift board",
      })
      .select("id")
      .maybeSingle();
    assignmentId = (created?.id as string | undefined) ?? null;
  }

  await db
    .from("staffing_alerts")
    .update({ status: "resolved" })
    .eq("shift_date", target.date)
    .eq("shift", target.shift)
    .eq("unit_id", target.unitId)
    .eq("position", target.position)
    .eq("status", "open");

  await db.from("notifications").insert({
    employee_id: employeeId,
    audience: "employee",
    title: "Shift picked up",
    body: `You are scheduled on ${target.unit} for the ${target.shiftLabel.toLowerCase()} on ${target.dayLabel} (${target.window}).${target.wouldBeOvertime ? " This one pays overtime." : ""}`,
  });
  await db.from("notifications").insert({
    audience: "manager",
    title: "Open shift filled",
    body: `${name} picked up ${target.unit} · ${target.shiftLabel.toLowerCase()} on ${target.date}.${target.wouldBeOvertime ? " It counts as overtime." : ""}`,
  });
  const buyback = await applyEarnedBuyback(employeeId, "the system").catch(() => ({
    applied: false as const,
  }));

  await logAudit("shift_picked_up", name, "shift_assignment", assignmentId, {
    date: target.date,
    unit: target.unit,
    shift: target.shift,
    overtime: target.wouldBeOvertime,
  });

  return {
    ok: true,
    message: `You've got it — ${target.unit}, ${target.shiftLabel.toLowerCase()}, ${target.dayLabel}.${
      buyback.applied
        ? ` That earned you ${(buyback as { points: number }).points} attendance point(s) back.`
        : ""
    }`,
    overtime: target.wouldBeOvertime,
  };
}

export async function dropClaimedShift(
  employeeId: string,
  assignmentId: string,
  actorLabel: string,
) {
  const { data: a } = await db
    .from("shift_assignments")
    .select("*")
    .eq("id", assignmentId)
    .maybeSingle();
  if (!a || a.employee_id !== employeeId) throw new Error("That is not one of your shifts.");
  if ((a.fill_reason as string | null)?.includes("open shift board") !== true) {
    throw new Error(
      "Only shifts you picked up yourself can be given back here. Ask a manager for anything else.",
    );
  }
  await db
    .from("shift_assignments")
    .update({ employee_id: null, status: "open", fill_reason: null })
    .eq("id", assignmentId);
  await logAudit("picked_up_shift_released", actorLabel, "shift_assignment", assignmentId, {});
  return { ok: true };
}

export async function weeklyHoursFor(employeeId: string, weekStart: string) {
  return (await weeklyHoursMap(weekStart)).get(employeeId) ?? 0;
}
