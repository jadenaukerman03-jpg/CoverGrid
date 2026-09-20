// Reply-to-claim open shift texts.
// A manager (or the system) blasts an open shift to qualified people; the first
// person to text back a code gets the shift and everyone else is told it is gone.
// Server-only.
import {
  POSITION_LABEL,
  SHIFT_LABEL,
  SHIFT_WINDOW,
  type PositionType,
  type ShiftType,
} from "./facility";
import { queueText } from "./messaging.server";
import { db, findCandidates, logAudit, today, unitMap } from "./staffing.server";

export type ClaimOfferRow = {
  id: string;
  assignment_id: string;
  employee_id: string;
  batch_id: string;
  reply_code: string;
  phone: string;
  status: string;
  reason: string;
  sent_at: string;
  expires_at: string;
  responded_at: string | null;
};

function tidyPhone(raw: string | null | undefined) {
  const digits = (raw ?? "").replace(/[^\d]/g, "");
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  if (digits.length > 11) return `+${digits}`;
  return "";
}

/** Codes people can reply with. Short and unambiguous over a phone keypad. */
const CODE_POOL = ["1", "2", "3", "4", "5", "6", "7", "8", "9"];

async function nextCodeFor(phone: string) {
  const { data } = await db
    .from("shift_claim_offers")
    .select("reply_code")
    .eq("phone", phone)
    .eq("status", "sent")
    .gt("expires_at", new Date().toISOString());
  const taken = new Set((data ?? []).map((r) => String(r.reply_code)));
  return CODE_POOL.find((c) => !taken.has(c)) ?? null;
}

function describe(a: {
  date: string;
  shiftLabel: string;
  unit: string;
  positionLabel: string;
  window: string;
}) {
  return `${a.positionLabel} · ${a.unit} · ${a.shiftLabel.toLowerCase()} ${a.window} on ${a.date}`;
}

/**
 * Text an open shift to the best-matched people. First reply wins.
 */
export async function broadcastOpenShift(
  assignmentId: string,
  actorLabel: string,
  opts?: { limit?: number; hoursToRespond?: number; includeOvertime?: boolean },
) {
  const limit = Math.max(1, Math.min(40, opts?.limit ?? 12));
  const hours = Math.max(1, Math.min(72, opts?.hoursToRespond ?? 6));
  const includeOvertime = opts?.includeOvertime ?? false;

  const { data: asg } = await db
    .from("shift_assignments")
    .select("id,employee_id,agency_staff_id,status")
    .eq("id", assignmentId)
    .maybeSingle();
  if (!asg) throw new Error("That shift is no longer on the schedule.");
  if (asg.employee_id || asg.agency_staff_id) throw new Error("That shift is already filled.");

  const { assignment, candidates } = await findCandidates(assignmentId, 60);
  const pool = candidates.filter((c) => includeOvertime || !c.wouldBeOvertime).slice(0, limit);
  if (!pool.length) {
    return { sent: 0, skipped: 0, message: "Nobody qualified is free for that shift right now." };
  }

  const ids = pool.map((c) => c.employeeId);
  const { data: emps } = await db.from("employees").select("id,phone,sms_optin").in("id", ids);
  const phoneOf = new Map((emps ?? []).map((e) => [e.id as string, e]));

  const batchId = crypto.randomUUID();
  const expiresAt = new Date(Date.now() + hours * 3600_000).toISOString();
  const summary = describe(assignment);

  let sent = 0;
  let skipped = 0;
  for (const c of pool) {
    const row = phoneOf.get(c.employeeId);
    const phone = tidyPhone(row?.phone as string | null);
    if (!phone || row?.sms_optin === false) {
      skipped += 1;
      continue;
    }
    const code = await nextCodeFor(phone);
    if (!code) {
      skipped += 1;
      continue;
    }
    const { error } = await db.from("shift_claim_offers").insert({
      assignment_id: assignmentId,
      employee_id: c.employeeId,
      batch_id: batchId,
      reply_code: code,
      phone,
      status: "sent",
      expires_at: expiresAt,
      reason: c.reasons.join("; "),
    });
    if (error) {
      skipped += 1;
      continue;
    }
    await queueText({
      employeeId: c.employeeId,
      phone,
      kind: "open_shift",
      urgent: true,
      body: `Open shift: ${summary}.${c.wouldBeOvertime ? " Pays overtime." : ""} Reply ${code} to take it. First reply gets it. Reply STOP to opt out.`,
    }).catch(() => undefined);
    sent += 1;
  }

  await logAudit("open_shift_broadcast", actorLabel, "shift_assignment", assignmentId, {
    sent,
    skipped,
    batch: batchId,
  });

  return {
    sent,
    skipped,
    batchId,
    message:
      sent > 0
        ? `Texted ${sent} ${sent === 1 ? "person" : "people"}. The first one to reply gets the shift.`
        : "Nobody in that group has a mobile number we can text.",
  };
}

/** Close out every other outstanding offer on a shift once it is taken. */
async function closeSiblings(assignmentId: string, winnerOfferId: string | null, why: string) {
  const { data: others } = await db
    .from("shift_claim_offers")
    .select("id,employee_id,phone")
    .eq("assignment_id", assignmentId)
    .eq("status", "sent");
  for (const o of others ?? []) {
    if (winnerOfferId && o.id === winnerOfferId) continue;
    await db
      .from("shift_claim_offers")
      .update({ status: "filled_by_other", reason: why, responded_at: new Date().toISOString() })
      .eq("id", o.id);
    await queueText({
      employeeId: o.employee_id as string,
      phone: o.phone as string,
      kind: "open_shift",
      urgent: false,
      body: "That open shift has been taken. Thanks for the quick reply — we will text you the next one.",
    }).catch(() => undefined);
  }
}

/**
 * Handle a text somebody sends back to the facility number.
 * Returns the plain-English reply to send them.
 */
export async function handleInboundText(fromPhone: string, rawBody: string) {
  const phone = tidyPhone(fromPhone);
  const body = rawBody.trim();
  const word = body.toUpperCase();

  if (!phone) return { reply: "", handled: false as const };

  if (["STOP", "UNSUBSCRIBE", "CANCEL", "QUIT", "END"].includes(word)) {
    await db.from("employees").update({ sms_optin: false }).eq("phone", phone);
    return {
      reply: "You will not get any more shift texts. Reply START to turn them back on.",
      handled: true as const,
    };
  }
  if (["START", "YES PLEASE", "UNSTOP"].includes(word)) {
    await db.from("employees").update({ sms_optin: true }).eq("phone", phone);
    return { reply: "Shift texts are back on.", handled: true as const };
  }

  const { data: offers } = await db
    .from("shift_claim_offers")
    .select("*")
    .eq("phone", phone)
    .eq("status", "sent")
    .order("sent_at", { ascending: true });
  const live = (offers ?? []).filter(
    (o) => Date.parse(o.expires_at as string) > Date.now(),
  ) as ClaimOfferRow[];

  if (!live.length) {
    return {
      reply:
        "We do not have an open shift waiting on your reply right now. Open the app to see what is available.",
      handled: true as const,
    };
  }

  const code = (word.match(/\b([1-9])\b/) ?? [])[1] ?? null;
  const chosen =
    code !== null
      ? (live.find((o) => o.reply_code === code) ?? null)
      : live.length === 1 &&
          ["Y", "YES", "OK", "I'LL TAKE IT", "ILL TAKE IT", "TAKE IT"].includes(word)
        ? live[0]!
        : null;

  if (!chosen) {
    const list = live.map((o) => `${o.reply_code}`).join(" or ");
    return {
      reply: `Reply with just the number of the shift you want: ${list}.`,
      handled: true as const,
    };
  }

  const { data: asg } = await db
    .from("shift_assignments")
    .select("id,employee_id,agency_staff_id,shift_date,shift,unit_id,position")
    .eq("id", chosen.assignment_id)
    .maybeSingle();
  if (!asg || asg.employee_id || asg.agency_staff_id) {
    await db
      .from("shift_claim_offers")
      .update({ status: "filled_by_other", responded_at: new Date().toISOString() })
      .eq("id", chosen.id);
    return {
      reply: "Sorry — somebody else got that one first. We will text you the next open shift.",
      handled: true as const,
    };
  }

  try {
    const { claimShift } = await import("./ops.server");
    const result = await claimShift(chosen.employee_id, { assignmentId: chosen.assignment_id });
    await db
      .from("shift_claim_offers")
      .update({ status: "claimed", responded_at: new Date().toISOString() })
      .eq("id", chosen.id);
    await closeSiblings(chosen.assignment_id, chosen.id, "Someone else replied first.");
    await logAudit(
      "open_shift_claimed_by_text",
      "text reply",
      "shift_assignment",
      chosen.assignment_id,
      {
        employeeId: chosen.employee_id,
      },
    );
    return { reply: result.message, handled: true as const };
  } catch (err) {
    const message = err instanceof Error ? err.message : "We could not add you to that shift.";
    await db
      .from("shift_claim_offers")
      .update({ status: "error", reason: message })
      .eq("id", chosen.id);
    return { reply: `${message} Call the scheduler if you still want it.`, handled: true as const };
  }
}

/** Manager view: what has gone out and who replied. */
export async function claimBoard(daysAhead = 21) {
  const { byId } = await unitMap();
  const since = new Date(Date.now() - 7 * 24 * 3600_000).toISOString();
  const { data: offers } = await db
    .from("shift_claim_offers")
    .select("*")
    .gte("sent_at", since)
    .order("sent_at", { ascending: false })
    .limit(300);
  const rows = (offers ?? []) as ClaimOfferRow[];

  const empIds = [...new Set(rows.map((r) => r.employee_id))];
  const asgIds = [...new Set(rows.map((r) => r.assignment_id))];
  const [{ data: emps }, { data: asgs }] = await Promise.all([
    empIds.length
      ? db.from("employees").select("id,full_name").in("id", empIds)
      : Promise.resolve({ data: [] }),
    asgIds.length
      ? db
          .from("shift_assignments")
          .select("id,shift_date,shift,unit_id,position,employee_id")
          .in("id", asgIds)
      : Promise.resolve({ data: [] }),
  ]);
  const nameOf = new Map((emps ?? []).map((e) => [e.id as string, e.full_name as string]));
  const asgOf = new Map((asgs ?? []).map((a) => [a.id as string, a]));

  const batches = new Map<
    string,
    { batchId: string; shift: string; sentAt: string; offers: typeof rows }
  >();
  for (const r of rows) {
    const a = asgOf.get(r.assignment_id);
    const key = r.batch_id;
    const unit = a ? (byId.get(a.unit_id as string) ?? "Unit") : "Shift";
    const desc = a
      ? `${POSITION_LABEL[a.position as PositionType]} · ${unit} · ${SHIFT_LABEL[a.shift as ShiftType].toLowerCase()} on ${a.shift_date}`
      : "Shift removed";
    const existing = batches.get(key);
    if (existing) existing.offers.push(r);
    else batches.set(key, { batchId: key, shift: desc, sentAt: r.sent_at, offers: [r] });
  }

  // Open shifts that have not been blasted yet.
  const { data: open } = await db
    .from("shift_assignments")
    .select("id,shift_date,shift,unit_id,position,status")
    .gte("shift_date", today())
    .lte("shift_date", new Date(Date.now() + daysAhead * 86400_000).toISOString().slice(0, 10))
    .is("employee_id", null)
    .is("agency_staff_id", null)
    .in("status", ["open", "called_off"])
    .order("shift_date");

  const blasted = new Set(rows.map((r) => r.assignment_id));

  return {
    openShifts: (open ?? []).map((a) => {
      const position = a.position as PositionType;
      const shift = a.shift as ShiftType;
      return {
        assignmentId: a.id as string,
        date: a.shift_date as string,
        unit: byId.get(a.unit_id as string) ?? "Unit",
        shiftLabel: SHIFT_LABEL[shift],
        positionLabel: POSITION_LABEL[position],
        window: SHIFT_WINDOW[shift][position].join(" – "),
        alreadyTexted: blasted.has(a.id as string),
      };
    }),
    batches: [...batches.values()].slice(0, 40).map((b) => ({
      batchId: b.batchId,
      shift: b.shift,
      sentAt: b.sentAt,
      sent: b.offers.length,
      claimedBy:
        b.offers
          .filter((o) => o.status === "claimed")
          .map((o) => nameOf.get(o.employee_id) ?? "Staff")[0] ?? null,
      people: b.offers.map((o) => ({
        name: nameOf.get(o.employee_id) ?? "Staff",
        code: o.reply_code,
        status: o.status,
        respondedAt: o.responded_at,
      })),
    })),
  };
}

/** Housekeeping: mark offers nobody answered as expired. */
export async function expireStaleOffers() {
  const { data } = await db
    .from("shift_claim_offers")
    .update({ status: "expired" })
    .eq("status", "sent")
    .lt("expires_at", new Date().toISOString())
    .select("id");
  return { expired: (data ?? []).length };
}
