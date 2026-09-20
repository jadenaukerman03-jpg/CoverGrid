// Downloads the corporate rollup week as a CSV or a printable PDF (browser only).
import { jsPDF } from "jspdf";

import type { FacilityRollup } from "./rollup.server";

export type RollupExport = {
  weekStart: string;
  weekEnd: string;
  rows: FacilityRollup[];
  totals: {
    buildings: number;
    headcount: number;
    required: number;
    filled: number;
    openSlots: number;
    openPosted: number;
    agencyShifts: number;
    callOffs: number;
    overtimeHours: number;
    scheduledHours: number;
    laborCost: number;
    weeklyLaborBudget: number;
    coveragePct: number;
  };
  attention: { facility: string; issue: string }[];
};

const COLUMNS: { label: string; value: (r: FacilityRollup) => string }[] = [
  { label: "Building", value: (r) => r.name },
  { label: "Units", value: (r) => r.units.join(" / ") },
  { label: "Staff", value: (r) => String(r.headcount) },
  { label: "Float pool", value: (r) => String(r.floatPool) },
  { label: "Coverage %", value: (r) => String(r.coveragePct) },
  { label: "Slots filled", value: (r) => `${r.filled}/${r.required}` },
  { label: "Open slots", value: (r) => String(r.openSlots) },
  { label: "Open posted", value: (r) => String(r.openPosted) },
  { label: "Agency shifts", value: (r) => String(r.agencyShifts) },
  { label: "Agency %", value: (r) => String(r.agencyPct) },
  { label: "Call-offs", value: (r) => String(r.callOffs) },
  { label: "Overtime hrs", value: (r) => String(r.overtimeHours) },
  { label: "Scheduled hrs", value: (r) => String(r.scheduledHours) },
  { label: "PPD", value: (r) => String(r.ppd) },
  { label: "PPD goal", value: (r) => String(r.targetPpd) },
  { label: "Avg census", value: (r) => String(r.avgCensus) },
  { label: "Utilization %", value: (r) => String(r.utilizationPct) },
  { label: "Labor cost", value: (r) => String(r.laborCost) },
  { label: "Labor budget", value: (r) => String(r.weeklyLaborBudget) },
  { label: "Budget %", value: (r) => String(r.budgetPct) },
  {
    label: "Worst day",
    value: (r) => (r.worstDay ? `${r.worstDay.date} (${r.worstDay.openSlots} open)` : ""),
  },
];

function download(name: string, blob: Blob) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

const cell = (v: string) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);

export function downloadRollupCsv(data: RollupExport) {
  const lines: string[] = [];
  lines.push(cell(`Corporate rollup ${data.weekStart} to ${data.weekEnd}`));
  lines.push("");
  lines.push(COLUMNS.map((c) => cell(c.label)).join(","));
  for (const r of data.rows) lines.push(COLUMNS.map((c) => cell(c.value(r))).join(","));
  const t = data.totals;
  lines.push(
    [
      "ALL BUILDINGS",
      "",
      t.headcount,
      "",
      t.coveragePct,
      `${t.filled}/${t.required}`,
      t.openSlots,
      t.openPosted,
      t.agencyShifts,
      "",
      t.callOffs,
      t.overtimeHours,
      t.scheduledHours,
      "",
      "",
      "",
      "",
      t.laborCost,
      t.weeklyLaborBudget,
      "",
      "",
    ]
      .map((v) => cell(String(v)))
      .join(","),
  );
  lines.push("");
  lines.push(cell("Needs a look"));
  lines.push([cell("Building"), cell("Issue")].join(","));
  if (data.attention.length === 0)
    lines.push([cell("—"), cell("Nothing flagged this week.")].join(","));
  for (const a of data.attention) lines.push([cell(a.facility), cell(a.issue)].join(","));

  download(
    `corporate-rollup-${data.weekStart}.csv`,
    new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" }),
  );
}

export function downloadRollupPdf(data: RollupExport) {
  const doc = new jsPDF({ unit: "pt", format: "letter", orientation: "landscape" });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const left = 36;
  const right = pageW - 36;
  let y = 48;

  const room = (needed: number) => {
    if (y + needed > pageH - 40) {
      doc.addPage();
      y = 48;
    }
  };

  doc.setFont("helvetica", "bold");
  doc.setFontSize(18);
  doc.setTextColor(30, 30, 30);
  doc.text("Corporate rollup", left, y);
  y += 20;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(90, 96, 104);
  doc.text(
    `Week of ${data.weekStart} through ${data.weekEnd} · printed ${new Date().toLocaleString()}`,
    left,
    y,
  );
  y += 20;

  const t = data.totals;
  doc.setTextColor(30, 30, 30);
  doc.setFontSize(10);
  const summary = [
    `${t.buildings} buildings · ${t.headcount} staff`,
    `Coverage ${t.coveragePct}% (${t.filled}/${t.required})`,
    `${t.openSlots} open slots · ${t.openPosted} posted · ${t.callOffs} call-offs`,
    `${t.agencyShifts} agency shifts · ${t.overtimeHours} OT hrs of ${t.scheduledHours} scheduled`,
    `Labor $${t.laborCost.toLocaleString()}${t.weeklyLaborBudget ? ` of $${t.weeklyLaborBudget.toLocaleString()} budgeted` : ""}`,
  ];
  for (const s of summary) {
    room(14);
    doc.text(s, left, y);
    y += 13;
  }
  y += 8;

  // Table
  const cols: { label: string; w: number; get: (r: FacilityRollup) => string }[] = [
    { label: "Building", w: 150, get: (r) => r.name },
    { label: "Staff", w: 45, get: (r) => String(r.headcount) },
    { label: "Coverage", w: 75, get: (r) => `${r.coveragePct}% (${r.filled}/${r.required})` },
    { label: "Open", w: 45, get: (r) => String(r.openSlots) },
    { label: "Agency", w: 60, get: (r) => `${r.agencyShifts} (${r.agencyPct}%)` },
    { label: "Call-offs", w: 55, get: (r) => String(r.callOffs) },
    { label: "OT hrs", w: 50, get: (r) => String(r.overtimeHours) },
    { label: "PPD", w: 70, get: (r) => `${r.ppd || "—"} / ${r.targetPpd || "—"}` },
    { label: "Util.", w: 45, get: (r) => `${r.utilizationPct}%` },
    {
      label: "Labor vs budget",
      w: 130,
      get: (r) =>
        `$${r.laborCost.toLocaleString()}${r.weeklyLaborBudget ? ` (${r.budgetPct}%)` : ""}`,
    },
  ];

  const header = () => {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.setTextColor(90, 96, 104);
    let x = left;
    for (const c of cols) {
      doc.text(c.label, x, y);
      x += c.w;
    }
    y += 6;
    doc.setDrawColor(210, 214, 220);
    doc.line(left, y, right, y);
    y += 12;
    doc.setFont("helvetica", "normal");
    doc.setTextColor(30, 30, 30);
  };

  header();
  for (const r of data.rows) {
    if (y + 26 > pageH - 40) {
      doc.addPage();
      y = 48;
      header();
    }
    let x = left;
    doc.setFontSize(9);
    for (const c of cols) {
      const text = doc.splitTextToSize(c.get(r), c.w - 8) as string[];
      doc.text(text[0] ?? "", x, y);
      x += c.w;
    }
    y += 12;
    doc.setFontSize(7.5);
    doc.setTextColor(130, 136, 144);
    const sub = doc.splitTextToSize(
      r.units.length ? r.units.join(", ") : "no units",
      cols[0]!.w - 8,
    ) as string[];
    doc.text(sub[0] ?? "", left, y);
    doc.setTextColor(30, 30, 30);
    y += 10;
    doc.setDrawColor(232, 235, 239);
    doc.line(left, y - 4, right, y - 4);
  }

  y += 14;
  room(40);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.text("Needs a look", left, y);
  y += 15;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  if (data.attention.length === 0) {
    doc.setTextColor(110, 116, 124);
    doc.text("Every building is covered, inside budget and under its PPD goal this week.", left, y);
    doc.setTextColor(30, 30, 30);
  } else {
    for (const a of data.attention) {
      room(14);
      const rows = doc.splitTextToSize(`${a.facility} — ${a.issue}`, right - left) as string[];
      for (const rline of rows) {
        room(12);
        doc.text(rline, left, y);
        y += 12;
      }
    }
  }

  doc.save(`corporate-rollup-${data.weekStart}.pdf`);
}
