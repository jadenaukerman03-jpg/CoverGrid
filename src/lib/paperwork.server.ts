// Privacy, security and survey paperwork tracking. Server-only.
import { db, logAudit, today } from "./staffing.server";
import { addDays } from "./facility";

export const PAPERWORK_CATEGORIES = [
  { id: "privacy", label: "Privacy & HIPAA" },
  { id: "security", label: "Security" },
  { id: "data", label: "Data handling" },
  { id: "workforce", label: "Survey & CMS" },
] as const;

export const PAPERWORK_STATUSES = ["not_started", "in_progress", "complete"] as const;
export type PaperworkStatus = (typeof PAPERWORK_STATUSES)[number];

export async function paperworkBoard() {
  const { data } = await db
    .from("compliance_items")
    .select("*")
    .order("category", { ascending: true })
    .order("title", { ascending: true });
  const rows = (data ?? []).map((r) => ({
    id: r.id as string,
    category: r.category as string,
    title: r.title as string,
    detail: (r.detail as string) ?? "",
    status: (r.status as PaperworkStatus) ?? "not_started",
    owner: (r.owner as string) ?? "",
    evidenceUrl: (r.evidence_url as string) ?? "",
    reviewedOn: (r.reviewed_on as string | null) ?? null,
    nextReviewOn: (r.next_review_on as string | null) ?? null,
    overdue: Boolean(r.next_review_on && (r.next_review_on as string) < today()),
  }));

  const complete = rows.filter((r) => r.status === "complete").length;
  return {
    rows,
    summary: {
      total: rows.length,
      complete,
      inProgress: rows.filter((r) => r.status === "in_progress").length,
      notStarted: rows.filter((r) => r.status === "not_started").length,
      overdue: rows.filter((r) => r.overdue).length,
      percent: rows.length ? Math.round((complete / rows.length) * 100) : 0,
    },
  };
}

export async function savePaperwork(
  input: {
    id?: string | null | undefined;
    category?: string | undefined;
    title: string;
    detail?: string | undefined;
    status?: PaperworkStatus | undefined;
    owner?: string | undefined;
    evidenceUrl?: string | undefined;
    reviewedOn?: string | null | undefined;
    nextReviewOn?: string | null | undefined;
  },
  actorLabel: string,
) {
  const patch = {
    category: input.category ?? "privacy",
    title: input.title,
    detail: input.detail ?? "",
    status: input.status ?? "not_started",
    owner: input.owner ?? "",
    evidence_url: input.evidenceUrl ?? "",
    reviewed_on: input.reviewedOn ?? null,
    next_review_on: input.nextReviewOn ?? null,
  };
  if (input.id) {
    const { error } = await db.from("compliance_items").update(patch).eq("id", input.id);
    if (error) throw new Error(error.message);
    await logAudit("paperwork_updated", actorLabel, "compliance_items", input.id, {
      title: input.title,
      status: patch.status,
    });
    return { id: input.id };
  }
  const { data, error } = await db.from("compliance_items").insert(patch).select("id").single();
  if (error) throw new Error(error.message);
  await logAudit("paperwork_added", actorLabel, "compliance_items", data.id as string, {
    title: input.title,
  });
  return { id: data.id as string };
}

export async function setPaperworkStatus(id: string, status: PaperworkStatus, actorLabel: string) {
  const patch: { status: PaperworkStatus; reviewed_on?: string; next_review_on?: string } = {
    status,
  };
  if (status === "complete") {
    patch.reviewed_on = today();
    patch.next_review_on = addDays(today(), 365);
  }
  const { error } = await db.from("compliance_items").update(patch).eq("id", id);
  if (error) throw new Error(error.message);
  await logAudit("paperwork_status_changed", actorLabel, "compliance_items", id, { status });
  return { ok: true };
}

/** Flags paperwork that has gone past its review date. Runs unattended. */
export async function paperworkSweep() {
  const { data } = await db
    .from("compliance_items")
    .select("id,title,next_review_on,status")
    .not("next_review_on", "is", null)
    .lte("next_review_on", today());
  let flagged = 0;
  for (const row of data ?? []) {
    if (row.status !== "complete") continue;
    await db.from("compliance_items").update({ status: "in_progress" }).eq("id", row.id);
    await db.from("notifications").insert({
      audience: "manager",
      title: "Paperwork due for review",
      body: `${row.title} passed its review date. Re-confirm it and mark it complete.`,
    });
    flagged += 1;
  }
  return { flagged };
}
