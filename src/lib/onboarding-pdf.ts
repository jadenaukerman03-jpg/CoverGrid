// Turns a loaded onboarding timeline into a printable PDF report (browser only).
import { jsPDF } from "jspdf";

type Event = { label: string; at: string | null; done: boolean };
type Phase = {
  key: string;
  title: string;
  blurb: string;
  status: string;
  startedAt: string | null;
  completedAt: string | null;
  progress: number;
  dueOn: string | null;
  overdue: boolean;
  corrected: boolean;
  note: string;
  correctedBy: string;
  events: Event[];
  nextStep: string;
};
type Correction = { id: string; summary: string; note: string; actor: string; at: string };

export type TimelineReport = {
  hire: { fullName: string; position: string; startDate: string | null; status: string };
  overall: number;
  nextAction: string;
  phases: Phase[];
  corrections: Correction[];
};

const STATUS_LABEL: Record<string, string> = {
  not_started: "Not started",
  in_progress: "In progress",
  blocked: "Needs attention",
  complete: "Done",
};

function when(value: string | null) {
  if (!value) return "—";
  const d = new Date(value.length <= 10 ? `${value}T00:00:00Z` : value);
  if (Number.isNaN(d.getTime())) return value;
  return value.length <= 10
    ? d.toLocaleDateString(undefined, {
        month: "short",
        day: "numeric",
        year: "numeric",
        timeZone: "UTC",
      })
    : d.toLocaleString(undefined, {
        month: "short",
        day: "numeric",
        year: "numeric",
        hour: "numeric",
        minute: "2-digit",
      });
}

export function downloadOnboardingPdf(data: TimelineReport) {
  const doc = new jsPDF({ unit: "pt", format: "letter" });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const left = 48;
  const right = pageW - 48;
  const width = right - left;
  let y = 56;

  const room = (needed: number) => {
    if (y + needed > pageH - 56) {
      doc.addPage();
      y = 56;
    }
  };

  const line = (
    text: string,
    opts: {
      size?: number;
      bold?: boolean;
      gap?: number;
      color?: [number, number, number];
      indent?: number;
    } = {},
  ) => {
    const size = opts.size ?? 10;
    doc.setFont("helvetica", opts.bold ? "bold" : "normal");
    doc.setFontSize(size);
    doc.setTextColor(...(opts.color ?? [30, 30, 30]));
    const indent = opts.indent ?? 0;
    const rows = doc.splitTextToSize(text, width - indent) as string[];
    for (const row of rows) {
      room(size + 4);
      doc.text(row, left + indent, y);
      y += size + 3;
    }
    y += opts.gap ?? 0;
  };

  const rule = () => {
    room(12);
    doc.setDrawColor(210, 214, 220);
    doc.line(left, y, right, y);
    y += 12;
  };

  // Header
  line("Onboarding report", { size: 20, bold: true });
  line(data.hire.fullName, { size: 14, bold: true });
  line(
    `${data.hire.position.toUpperCase()} · Start date ${data.hire.startDate ? when(data.hire.startDate) : "not set"} · Status ${data.hire.status}`,
    { color: [90, 96, 104] },
  );
  line(`Printed ${new Date().toLocaleString()}`, { size: 9, color: [130, 136, 144], gap: 6 });
  rule();

  line(`${data.overall}% ready`, { size: 13, bold: true });
  line(`Next: ${data.nextAction}`, { gap: 6 });
  rule();

  for (const p of data.phases) {
    room(60);
    line(`${p.title} — ${STATUS_LABEL[p.status] ?? p.status} (${p.progress}%)`, {
      size: 12,
      bold: true,
    });
    line(p.blurb, { size: 9, color: [110, 116, 124] });
    line(
      `Started ${when(p.startedAt)} · Finished ${when(p.completedAt)} · Due ${when(p.dueOn)}${p.overdue ? " (past due)" : ""}`,
      { size: 9, color: [90, 96, 104] },
    );
    if (p.corrected)
      line(`Corrected by ${p.correctedBy || "a manager"}${p.note ? `: ${p.note}` : ""}`, {
        size: 9,
        color: [150, 90, 20],
      });
    for (const e of p.events)
      line(`${e.done ? "[x]" : "[ ]"} ${e.label} — ${when(e.at)}`, { size: 9, indent: 12 });
    line(`Next step: ${p.nextStep}`, { size: 9, color: [60, 66, 74], gap: 8 });
    rule();
  }

  line("Audit trail", { size: 13, bold: true });
  if (data.corrections.length === 0) {
    line("No hand corrections have been made — every phase tracked itself.", {
      size: 9,
      color: [110, 116, 124],
    });
  } else {
    for (const c of data.corrections) {
      line(c.summary, { size: 10, bold: true });
      if (c.note) line(`"${c.note}"`, { size: 9, color: [90, 96, 104], indent: 12 });
      line(`${c.actor} · ${when(c.at)}`, { size: 9, color: [130, 136, 144], indent: 12, gap: 4 });
    }
  }

  const safe = data.hire.fullName.replace(/[^a-z0-9]+/gi, "-").toLowerCase();
  doc.save(`onboarding-${safe}.pdf`);
}
