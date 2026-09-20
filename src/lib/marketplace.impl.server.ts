// Per-diem marketplace: an outside pool that can be offered open shifts the
// in-house roster cannot cover, before anyone reaches for premium agency.
import {
  POSITION_LABEL,
  SHIFT_LABEL,
  addDays,
  shiftHours,
  type PositionType,
  type ShiftType,
} from "./facility";
import { db, loadActor, logAudit, requireManager, today } from "./staffing.server";

export type MarketplaceWorkerInput = {
  id?: string | null | undefined;
  fullName: string;
  position: PositionType;
  phone?: string | undefined;
  email?: string | undefined;
  city?: string | undefined;
  hourlyRate?: number | undefined;
  licenseNumber?: string | undefined;
  licenseExpiresOn?: string | null | undefined;
  status?: string | undefined;
  isActive?: boolean | undefined;
  notes?: string | undefined;
};

async function manager(userId: string) {
  const actor = await loadActor(userId);
  requireManager(actor);
  return actor;
}
const label = (a: Awaited<ReturnType<typeof loadActor>>) =>
  a.employee?.full_name ?? a.profile?.full_name ?? a.profile?.email ?? "a manager";

/** Reliability blends completed shifts against no-shows so the best people surface first. */
export function reliabilityScore(shiftsWorked: number, noShows: number) {
  const total = shiftsWorked + noShows;
  if (total === 0) return 100;
  return Math.round(((shiftsWorked - noShows * 2) / total) * 100 * 10) / 10;
}

export async function marketplaceBoardQuery(userId: string) {
  await manager(userId);
  const from = today();
  const to = addDays(from, 21);
  const [
    { data: workers },
    { data: offers },
    { data: units },
    { data: openShifts },
    { data: agencies },
  ] = await Promise.all([
    db.from("marketplace_workers").select("*").order("full_name"),
    db
      .from("marketplace_offers")
      .select("*")
      .gte("shift_date", addDays(from, -7))
      .order("shift_date", { ascending: true }),
    db.from("units").select("id, name").order("sort_order"),
    db
      .from("shift_assignments")
      .select("id, shift_date, shift, unit_id, position, status")
      .eq("status", "open")
      .gte("shift_date", from)
      .lte("shift_date", to)
      .order("shift_date"),
    db.from("agencies").select("rate_nurse, rate_qma, rate_cna").eq("is_active", true),
  ]);

  const workerList = workers ?? [];
  const offerList = offers ?? [];
  const unitName = new Map((units ?? []).map((u) => [u.id, u.name]));
  const workerName = new Map(workerList.map((w) => [w.id, w.full_name]));

  // What the same hours would have cost through an agency, versus the per-diem rate.
  const agencyAvg = (position: PositionType) => {
    const rows = agencies ?? [];
    if (!rows.length) return 0;
    const key = position === "nurse" ? "rate_nurse" : position === "qma" ? "rate_qma" : "rate_cna";
    return rows.reduce((s, r) => s + Number(r[key as keyof typeof r] ?? 0), 0) / rows.length;
  };

  const claimed = offerList.filter((o) => o.status === "claimed");
  const savings = claimed.reduce((sum, o) => {
    const hours = shiftHours(o.position as PositionType);
    const diff = agencyAvg(o.position as PositionType) - Number(o.offered_rate);
    return sum + Math.max(0, diff) * hours;
  }, 0);

  return {
    workers: workerList.map((w) => ({
      ...w,
      reliability: reliabilityScore(w.shifts_worked, w.no_shows),
      licenseExpiring:
        !!w.license_expires_on && w.license_expires_on <= addDays(from, 45)
          ? w.license_expires_on
          : null,
    })),
    offers: offerList.map((o) => ({
      ...o,
      unitName: o.unit_id ? (unitName.get(o.unit_id) ?? "Unit") : "Unit",
      workerName: o.worker_id ? (workerName.get(o.worker_id) ?? "Worker") : "Worker",
      shiftLabel: SHIFT_LABEL[o.shift as ShiftType],
      positionLabel: POSITION_LABEL[o.position as PositionType],
    })),
    openShifts: (openShifts ?? []).map((s) => ({
      ...s,
      unitName: unitName.get(s.unit_id) ?? "Unit",
      shiftLabel: SHIFT_LABEL[s.shift as ShiftType],
      positionLabel: POSITION_LABEL[s.position as PositionType],
      alreadyOffered: offerList.some((o) => o.assignment_id === s.id && o.status === "offered"),
    })),
    units: units ?? [],
    counts: {
      approved: workerList.filter((w) => w.status === "approved" && w.is_active).length,
      pending: workerList.filter((w) => w.status === "pending").length,
      openOffers: offerList.filter((o) => o.status === "offered").length,
      claimed: claimed.length,
      savings: Math.round(savings),
    },
  };
}

export async function saveMarketplaceWorkerAction(userId: string, input: MarketplaceWorkerInput) {
  const actor = await manager(userId);
  const patch = {
    full_name: input.fullName,
    position: input.position,
    phone: input.phone ?? "",
    email: input.email ?? "",
    city: input.city ?? "",
    hourly_rate: input.hourlyRate ?? 0,
    license_number: input.licenseNumber ?? "",
    license_expires_on: input.licenseExpiresOn || null,
    ...(input.status ? { status: input.status } : {}),
    ...(input.isActive === undefined ? {} : { is_active: input.isActive }),
    notes: input.notes ?? "",
  };
  if (input.id) {
    await db.from("marketplace_workers").update(patch).eq("id", input.id);
    await logAudit("marketplace_worker_updated", label(actor), "marketplace_worker", input.id, {
      name: input.fullName,
    });
    return { id: input.id };
  }
  const { data, error } = await db
    .from("marketplace_workers")
    .insert(patch)
    .select("id")
    .maybeSingle();
  if (error) throw new Error(error.message);
  await logAudit("marketplace_worker_added", label(actor), "marketplace_worker", data?.id ?? null, {
    name: input.fullName,
  });
  return { id: data?.id as string };
}

export async function setWorkerStatusAction(userId: string, id: string, status: string) {
  const actor = await manager(userId);
  await db.from("marketplace_workers").update({ status }).eq("id", id);
  await logAudit("marketplace_worker_status", label(actor), "marketplace_worker", id, { status });
  return { ok: true };
}

export async function deleteMarketplaceWorkerAction(userId: string, id: string) {
  const actor = await manager(userId);
  await db.from("marketplace_workers").delete().eq("id", id);
  await logAudit("marketplace_worker_removed", label(actor), "marketplace_worker", id, {});
  return { ok: true };
}

/**
 * Offer one open shift to the best-matched approved per-diem workers.
 * Ranking: right position, license good, most reliable, then cheapest.
 */
export async function offerShiftAction(userId: string, assignmentId: string, count = 5) {
  const actor = await manager(userId);
  const { data: shift } = await db
    .from("shift_assignments")
    .select("id, shift_date, shift, unit_id, position, status")
    .eq("id", assignmentId)
    .maybeSingle();
  if (!shift) throw new Error("That open shift no longer exists.");
  if (shift.status !== "open") throw new Error("That shift is already covered.");

  const { data: workers } = await db
    .from("marketplace_workers")
    .select("*")
    .eq("position", shift.position)
    .eq("status", "approved")
    .eq("is_active", true);

  const eligible = (workers ?? [])
    .filter((w) => !w.license_expires_on || w.license_expires_on >= shift.shift_date)
    .sort(
      (a, b) =>
        reliabilityScore(b.shifts_worked, b.no_shows) -
          reliabilityScore(a.shifts_worked, a.no_shows) ||
        Number(a.hourly_rate) - Number(b.hourly_rate),
    )
    .slice(0, count);

  if (!eligible.length) {
    return { offered: 0, message: "No approved per-diem worker matches that shift yet." };
  }

  const { data: existing } = await db
    .from("marketplace_offers")
    .select("worker_id")
    .eq("assignment_id", assignmentId)
    .eq("status", "offered");
  const already = new Set((existing ?? []).map((o) => o.worker_id));

  const rows = eligible
    .filter((w) => !already.has(w.id))
    .map((w) => ({
      assignment_id: assignmentId,
      worker_id: w.id,
      shift_date: shift.shift_date,
      shift: shift.shift,
      unit_id: shift.unit_id,
      position: shift.position,
      offered_rate: Number(w.hourly_rate),
      status: "offered",
      expires_at: new Date(Date.now() + 6 * 3600_000).toISOString(),
      reason: `Offered to the ${eligible.length} best-matched per-diem workers: ${reliabilityScore(
        eligible[0]!.shifts_worked,
        eligible[0]!.no_shows,
      )}% reliability at the top.`,
    }));
  if (rows.length) await db.from("marketplace_offers").insert(rows);

  await logAudit("marketplace_offered", label(actor), "shift_assignment", assignmentId, {
    offered: rows.length,
  });
  return {
    offered: rows.length,
    message: `Offered to ${rows.length} per-diem worker${rows.length === 1 ? "" : "s"}.`,
  };
}

/** Accept an offer: the worker takes the shift and every other offer on it closes. */
export async function acceptOfferAction(userId: string, offerId: string) {
  const actor = await manager(userId);
  const { data: offer } = await db
    .from("marketplace_offers")
    .select("*")
    .eq("id", offerId)
    .maybeSingle();
  if (!offer) throw new Error("That offer no longer exists.");
  if (offer.status !== "offered") throw new Error("That offer has already been answered.");

  const { data: worker } = await db
    .from("marketplace_workers")
    .select("*")
    .eq("id", offer.worker_id ?? "")
    .maybeSingle();
  if (!worker) throw new Error("That per-diem worker is no longer in the pool.");

  await db
    .from("marketplace_offers")
    .update({ status: "claimed", responded_at: new Date().toISOString() })
    .eq("id", offerId);
  if (offer.assignment_id) {
    await db
      .from("marketplace_offers")
      .update({ status: "closed", responded_at: new Date().toISOString() })
      .eq("assignment_id", offer.assignment_id)
      .eq("status", "offered");
    await db
      .from("shift_assignments")
      .update({
        status: "scheduled",
        note: `Covered by per-diem worker ${worker.full_name} at $${Number(offer.offered_rate).toFixed(2)}/hr`,
        fill_reason: `No in-house staff was available, so the shift went to the per-diem pool. ${worker.full_name} was the highest-rated match at $${Number(offer.offered_rate).toFixed(2)} an hour.`,
      })
      .eq("id", offer.assignment_id);
  }
  await db
    .from("marketplace_workers")
    .update({ shifts_worked: worker.shifts_worked + 1 })
    .eq("id", worker.id);

  await logAudit("marketplace_claimed", label(actor), "shift_assignment", offer.assignment_id, {
    worker: worker.full_name,
  });
  return { ok: true, message: `${worker.full_name} is confirmed for that shift.` };
}

export async function declineOfferAction(userId: string, offerId: string, noShow = false) {
  const actor = await manager(userId);
  const { data: offer } = await db
    .from("marketplace_offers")
    .select("*")
    .eq("id", offerId)
    .maybeSingle();
  if (!offer) throw new Error("That offer no longer exists.");
  await db
    .from("marketplace_offers")
    .update({ status: noShow ? "no_show" : "declined", responded_at: new Date().toISOString() })
    .eq("id", offerId);
  if (noShow && offer.worker_id) {
    const { data: worker } = await db
      .from("marketplace_workers")
      .select("no_shows")
      .eq("id", offer.worker_id)
      .maybeSingle();
    await db
      .from("marketplace_workers")
      .update({ no_shows: (worker?.no_shows ?? 0) + 1 })
      .eq("id", offer.worker_id);
  }
  await logAudit(
    noShow ? "marketplace_no_show" : "marketplace_declined",
    label(actor),
    "marketplace_offer",
    offerId,
    {},
  );
  return { ok: true };
}

/**
 * Autonomous sweep: any open shift inside the window that the in-house roster
 * did not cover gets offered to the per-diem pool automatically.
 */
export async function marketplaceSweep(daysAhead = 3) {
  const from = today();
  const to = addDays(from, daysAhead);
  const { data: open } = await db
    .from("shift_assignments")
    .select("id, shift_date, shift, unit_id, position")
    .eq("status", "open")
    .gte("shift_date", from)
    .lte("shift_date", to)
    .limit(40);
  let offered = 0;
  let shifts = 0;
  for (const s of open ?? []) {
    const { data: existing } = await db
      .from("marketplace_offers")
      .select("id")
      .eq("assignment_id", s.id)
      .eq("status", "offered")
      .limit(1);
    if (existing && existing.length) continue;
    const { data: workers } = await db
      .from("marketplace_workers")
      .select("*")
      .eq("position", s.position)
      .eq("status", "approved")
      .eq("is_active", true);
    const eligible = (workers ?? [])
      .filter((w) => !w.license_expires_on || w.license_expires_on >= s.shift_date)
      .sort(
        (a, b) =>
          reliabilityScore(b.shifts_worked, b.no_shows) -
            reliabilityScore(a.shifts_worked, a.no_shows) ||
          Number(a.hourly_rate) - Number(b.hourly_rate),
      )
      .slice(0, 5);
    if (!eligible.length) continue;
    await db.from("marketplace_offers").insert(
      eligible.map((w) => ({
        assignment_id: s.id,
        worker_id: w.id,
        shift_date: s.shift_date,
        shift: s.shift,
        unit_id: s.unit_id,
        position: s.position,
        offered_rate: Number(w.hourly_rate),
        status: "offered",
        expires_at: new Date(Date.now() + 6 * 3600_000).toISOString(),
        reason: "Sent out automatically because no in-house staff was available.",
      })),
    );
    offered += eligible.length;
    shifts++;
  }
  // Expire anything nobody answered in time.
  const { data: stale } = await db
    .from("marketplace_offers")
    .select("id")
    .eq("status", "offered")
    .lt("expires_at", new Date().toISOString())
    .limit(200);
  if (stale && stale.length) {
    await db
      .from("marketplace_offers")
      .update({ status: "expired" })
      .in(
        "id",
        stale.map((s) => s.id),
      );
  }
  return { shifts, offered, expired: stale?.length ?? 0 };
}
