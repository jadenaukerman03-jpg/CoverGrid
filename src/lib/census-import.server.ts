// Census intake: turns a PointClickCare (or any census system) export into daily census
// numbers so hours-per-patient-day is real without anyone typing it in every morning.
import { db, unitMap } from "./staffing.server";

export type CensusSource = "pointclickcare" | "matrixcare" | "csv" | "manual" | "api";

export type ParsedCensusRow = {
  date: string;
  unitName: string;
  unitId: string | null;
  census: number;
  note: string;
};

export type ParseResult = {
  rows: ParsedCensusRow[];
  unmatchedUnits: string[];
  errors: string[];
  periodStart: string | null;
  periodEnd: string | null;
};

const DATE_KEYS = [
  "date",
  "census date",
  "censusdate",
  "effective date",
  "day",
  "service date",
  "as of",
];
const UNIT_KEYS = [
  "unit",
  "unit name",
  "nursing unit",
  "floor",
  "station",
  "neighborhood",
  "wing",
  "location",
  "facility unit",
];
const COUNT_KEYS = [
  "census",
  "census count",
  "residents",
  "resident count",
  "occupied",
  "occupied beds",
  "midnight census",
  "count",
  "total",
];

function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let quoted = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (ch === '"') {
      if (quoted && line[i + 1] === '"') {
        cur += '"';
        i += 1;
      } else quoted = !quoted;
    } else if ((ch === "," || ch === "\t") && !quoted) {
      out.push(cur);
      cur = "";
    } else cur += ch;
  }
  out.push(cur);
  return out.map((v) => v.trim().replace(/^"|"$/g, ""));
}

function pickIndex(headers: string[], keys: string[]): number {
  const lower = headers.map((h) => h.trim().toLowerCase());
  for (const key of keys) {
    const exact = lower.indexOf(key);
    if (exact >= 0) return exact;
  }
  for (const key of keys) {
    const partial = lower.findIndex((h) => h.includes(key));
    if (partial >= 0) return partial;
  }
  return -1;
}

/** Accepts 2026-08-18, 8/18/2026, 08-18-26 and similar. */
export function normalizeDate(raw: string): string | null {
  const value = raw.trim();
  if (!value) return null;
  const iso = value.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (iso) return `${iso[1]}-${iso[2]!.padStart(2, "0")}-${iso[3]!.padStart(2, "0")}`;
  const us = value.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})/);
  if (us) {
    let year = us[3]!;
    if (year.length === 2) year = `20${year}`;
    return `${year}-${us[1]!.padStart(2, "0")}-${us[2]!.padStart(2, "0")}`;
  }
  const parsed = new Date(value);
  if (!Number.isNaN(parsed.getTime())) return parsed.toISOString().slice(0, 10);
  return null;
}

function normalizeUnitName(raw: string) {
  return raw
    .trim()
    .toLowerCase()
    .replace(/\b(unit|wing|hall|floor|station|neighborhood)\b/g, "")
    .replace(/[^a-z0-9]/g, "");
}

async function unitResolver() {
  const { units } = await unitMap();
  const byKey = new Map<string, { id: string; name: string }>();
  units.forEach((u) => byKey.set(normalizeUnitName(u.name), { id: u.id, name: u.name }));
  return {
    units,
    resolve(name: string) {
      const key = normalizeUnitName(name);
      if (!key) return null;
      const direct = byKey.get(key);
      if (direct) return direct;
      for (const [k, v] of byKey) {
        if (k.startsWith(key) || key.startsWith(k)) return v;
      }
      return null;
    },
  };
}

/** Parse a CSV/TSV census export into rows we can apply. Nothing is written here. */
export async function parseCensusFile(text: string): Promise<ParseResult> {
  const errors: string[] = [];
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length < 2) {
    return {
      rows: [],
      unmatchedUnits: [],
      errors: ["That file didn't have a header row and at least one census row."],
      periodStart: null,
      periodEnd: null,
    };
  }
  const headers = splitCsvLine(lines[0]!);
  const dateIdx = pickIndex(headers, DATE_KEYS);
  const unitIdx = pickIndex(headers, UNIT_KEYS);
  const countIdx = pickIndex(headers, COUNT_KEYS);
  if (dateIdx < 0)
    errors.push("Couldn't find a date column (looked for Date / Census Date / Effective Date).");
  if (unitIdx < 0)
    errors.push("Couldn't find a unit column (looked for Unit / Nursing Unit / Floor / Station).");
  if (countIdx < 0)
    errors.push("Couldn't find a census column (looked for Census / Residents / Occupied Beds).");
  if (errors.length > 0)
    return { rows: [], unmatchedUnits: [], errors, periodStart: null, periodEnd: null };

  const resolver = await unitResolver();
  const rows: ParsedCensusRow[] = [];
  const unmatched = new Set<string>();

  for (let i = 1; i < lines.length; i += 1) {
    const cells = splitCsvLine(lines[i]!);
    const date = normalizeDate(cells[dateIdx] ?? "");
    const unitName = (cells[unitIdx] ?? "").trim();
    const censusRaw = (cells[countIdx] ?? "").replace(/[^0-9.]/g, "");
    const census = Number(censusRaw);
    if (!date || !unitName || censusRaw === "" || Number.isNaN(census)) {
      if (errors.length < 8)
        errors.push(`Row ${i + 1} skipped — missing a date, unit or census number.`);
      continue;
    }
    const unit = resolver.resolve(unitName);
    if (!unit) unmatched.add(unitName);
    rows.push({
      date,
      unitName,
      unitId: unit?.id ?? null,
      census: Math.max(0, Math.min(400, Math.round(census))),
      note: unit ? `Matched to ${unit.name}` : "No matching unit in this facility",
    });
  }

  const dates = rows.map((r) => r.date).sort();
  return {
    rows,
    unmatchedUnits: [...unmatched],
    errors,
    periodStart: dates[0] ?? null,
    periodEnd: dates[dates.length - 1] ?? null,
  };
}

export type ApplyResult = {
  ok: boolean;
  applied: number;
  skipped: number;
  received: number;
  unmatchedUnits: string[];
  errors: string[];
  periodStart: string | null;
  periodEnd: string | null;
  importId: string | null;
};

/** Write parsed rows into census_days and record the import in history. */
export async function applyCensusRows(params: {
  rows: ParsedCensusRow[];
  source: CensusSource;
  connector?: string;
  fileName?: string;
  actorLabel: string;
  errors?: string[];
  unmatchedUnits?: string[];
}): Promise<ApplyResult> {
  const usable = params.rows.filter((r) => r.unitId);
  const skipped = params.rows.length - usable.length;
  const unmatched = params.unmatchedUnits ?? [
    ...new Set(params.rows.filter((r) => !r.unitId).map((r) => r.unitName)),
  ];
  const dates = usable.map((r) => r.date).sort();
  const periodStart = dates[0] ?? null;
  const periodEnd = dates[dates.length - 1] ?? null;

  // Last value wins when the same day/unit shows up twice in one file.
  const deduped = new Map<string, { date: string; unit_id: string; census: number }>();
  usable.forEach((r) =>
    deduped.set(`${r.date}|${r.unitId}`, { date: r.date, unit_id: r.unitId!, census: r.census }),
  );
  const payload = [...deduped.values()].map((r) => ({
    ...r,
    source: params.source,
    imported_at: new Date().toISOString(),
  }));

  const errors = [...(params.errors ?? [])];
  let applied = 0;
  if (payload.length > 0) {
    const { error } = await db.from("census_days").upsert(payload, { onConflict: "date,unit_id" });
    if (error) errors.push(error.message);
    else applied = payload.length;
  }

  const status =
    applied > 0 && errors.length === 0 ? "applied" : applied > 0 ? "partial" : "failed";
  const message =
    applied > 0
      ? `${applied} census day${applied === 1 ? "" : "s"} updated${skipped > 0 ? `, ${skipped} row${skipped === 1 ? "" : "s"} skipped` : ""}.`
      : "Nothing was imported.";

  const { data: inserted } = await db
    .from("census_imports")
    .insert({
      source: params.source,
      connector: params.connector ?? "",
      file_name: params.fileName ?? "",
      period_start: periodStart,
      period_end: periodEnd,
      rows_received: params.rows.length,
      rows_applied: applied,
      rows_skipped: skipped,
      status,
      message,
      created_by: params.actorLabel,
      details: JSON.parse(
        JSON.stringify({ unmatchedUnits: unmatched, errors: errors.slice(0, 10) }),
      ),
    })
    .select("id")
    .maybeSingle();

  return {
    ok: applied > 0,
    applied,
    skipped,
    received: params.rows.length,
    unmatchedUnits: unmatched,
    errors,
    periodStart,
    periodEnd,
    importId: inserted?.id ?? null,
  };
}

/** Rows pushed straight from PointClickCare via the public endpoint. */
export async function applyCensusPayload(params: {
  rows: Array<{ date: string; unit: string; census: number }>;
  source?: CensusSource;
  connector?: string;
  actorLabel?: string;
}): Promise<ApplyResult> {
  const resolver = await unitResolver();
  const errors: string[] = [];
  const parsed: ParsedCensusRow[] = [];
  params.rows.forEach((r, i) => {
    const date = normalizeDate(String(r.date ?? ""));
    const unitName = String(r.unit ?? "").trim();
    const census = Number(r.census);
    if (!date || !unitName || Number.isNaN(census)) {
      if (errors.length < 8)
        errors.push(`Entry ${i + 1} was missing a date, unit or census number.`);
      return;
    }
    const unit = resolver.resolve(unitName);
    parsed.push({
      date,
      unitName,
      unitId: unit?.id ?? null,
      census: Math.max(0, Math.min(400, Math.round(census))),
      note: unit ? `Matched to ${unit.name}` : "No matching unit",
    });
  });
  return applyCensusRows({
    rows: parsed,
    source: params.source ?? "pointclickcare",
    connector: params.connector ?? "",
    fileName: "",
    actorLabel: params.actorLabel ?? "census feed",
    errors,
  });
}

export async function censusImportHistory(limit = 25) {
  const { data } = await db
    .from("census_imports")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(limit);
  return data ?? [];
}

/** How fresh the census feed is, so the labor numbers can be trusted. */
export async function censusFeedStatus() {
  const { units } = await unitMap();
  const since = new Date(Date.now() - 14 * 86400000).toISOString().slice(0, 10);
  const { data } = await db
    .from("census_days")
    .select("date,unit_id,census,source")
    .gte("date", since);
  const rows = data ?? [];
  const imported = rows.filter(
    (r) => r.source && r.source !== "auto" && r.source !== "manual",
  ).length;
  const estimated = rows.filter((r) => !r.source || r.source === "auto").length;
  const lastImportedDate =
    rows
      .filter((r) => r.source && r.source !== "auto" && r.source !== "manual")
      .map((r) => r.date)
      .sort()
      .pop() ?? null;
  const [{ data: lastImport }] = await Promise.all([
    db
      .from("census_imports")
      .select("created_at,source,rows_applied,status")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);
  return {
    units: units.map((u) => ({ id: u.id, name: u.name })),
    trackedDays: rows.length,
    importedDays: imported,
    estimatedDays: estimated,
    lastImportedDate,
    lastImport: lastImport ?? null,
  };
}
