// Rollout tooling: guided go-live checklist plus bulk imports of roster,
// schedule and attendance history so a building can start in days, not weeks.
import { type PositionType, type ShiftType, shiftHours, toISODate } from "./facility";
import { db, loadActor, logAudit, requireManager, today } from "./staffing.server";

async function manager(userId: string) {
  const actor = await loadActor(userId);
  requireManager(actor);
  return actor;
}
const label = (a: Awaited<ReturnType<typeof loadActor>>) =>
  a.employee?.full_name ?? a.profile?.full_name ?? a.profile?.email ?? "a manager";

export const IMPORT_TEMPLATES: Record<
  string,
  { headers: string[]; sample: string[]; help: string }
> = {
  roster: {
    headers: [
      "full_name",
      "position",
      "unit",
      "shift",
      "days_per_week",
      "hire_date",
      "hourly_rate",
      "email",
      "phone",
    ],
    sample: [
      "Jane Miller",
      "cna",
      "Birch",
      "first",
      "4",
      "2019-04-15",
      "18.50",
      "jane@example.com",
      "555-0100",
    ],
    help: "One row per employee. Position must be nurse, qma or cna. Shift must be first, second or third. Unit is matched by name.",
  },
  schedule: {
    headers: ["full_name", "date", "shift", "unit", "position"],
    sample: ["Jane Miller", "2026-09-06", "first", "Birch", "cna"],
    help: "One row per scheduled shift. Names are matched to people already on the roster, so import the roster first.",
  },
  attendance: {
    headers: ["full_name", "date", "kind", "minutes_late", "note"],
    sample: ["Jane Miller", "2026-05-02", "call_off", "", "Called off, no replacement"],
    help: "One row per occurrence. Kind must be call_off or late. Points are figured from your own policy.",
  },
};

export function parseDelimited(text: string): {
  headers: string[];
  rows: Record<string, string>[];
} {
  const clean = text.replace(/\r\n?/g, "\n").trim();
  if (!clean) return { headers: [], rows: [] };
  const lines = clean.split("\n").filter((l) => l.trim().length > 0);
  const delim =
    (lines[0]!.match(/\t/g)?.length ?? 0) > (lines[0]!.match(/,/g)?.length ?? 0) ? "\t" : ",";
  const split = (line: string) => {
    const out: string[] = [];
    let cur = "";
    let quoted = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i]!;
      if (ch === '"') {
        if (quoted && line[i + 1] === '"') {
          cur += '"';
          i++;
        } else quoted = !quoted;
      } else if (ch === delim && !quoted) {
        out.push(cur.trim());
        cur = "";
      } else cur += ch;
    }
    out.push(cur.trim());
    return out;
  };
  const headers = split(lines[0]!).map((h) => h.toLowerCase().replace(/\s+/g, "_"));
  const rows = lines.slice(1).map((line) => {
    const cells = split(line);
    const row: Record<string, string> = {};
    headers.forEach((h, i) => (row[h] = cells[i] ?? ""));
    return row;
  });
  return { headers, rows };
}

const POSITIONS: PositionType[] = ["nurse", "qma", "cna"];
const normalizePosition = (v: string): PositionType | null => {
  const s = v.toLowerCase().trim();
  if (POSITIONS.includes(s as PositionType)) return s as PositionType;
  if (s.startsWith("rn") || s.startsWith("lpn") || s.includes("nurse")) return "nurse";
  if (s.includes("qma") || s.includes("med")) return "qma";
  if (s.includes("cna") || s.includes("aide")) return "cna";
  return null;
};
const SHIFTS: ShiftType[] = ["first", "second", "third"];
const normalizeShift = (v: string): ShiftType | null => {
  const s = v.toLowerCase().trim();
  if (SHIFTS.includes(s as ShiftType)) return s as ShiftType;
  if (s.startsWith("1") || s.includes("day")) return "first";
  if (s.startsWith("2") || s.includes("eve")) return "second";
  if (s.startsWith("3") || s.includes("night") || s.includes("noc")) return "third";
  return null;
};
const normalizeDate = (v: string): string | null => {
  const s = v.trim();
  if (!s) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const parsed = new Date(s);
  if (Number.isNaN(parsed.getTime())) return null;
  return toISODate(parsed);
};

export async function setupBoardQuery(userId: string) {
  await manager(userId);
  const [
    { data: steps },
    { data: batches },
    { data: units },
    { data: employees },
    { data: assignments },
    { data: connections },
  ] = await Promise.all([
    db.from("setup_steps").select("*").order("sort_order"),
    db.from("import_batches").select("*").order("created_at", { ascending: false }).limit(25),
    db.from("units").select("id, name").order("sort_order"),
    db.from("employees").select("id", { count: "exact" }).eq("is_active", true).limit(1),
    db.from("shift_assignments").select("id").gte("shift_date", today()).limit(1),
    db.from("integration_connections").select("id, status, name").eq("is_enabled", true),
  ]);
  const stepList = steps ?? [];
  return {
    steps: stepList,
    batches: batches ?? [],
    templates: IMPORT_TEMPLATES,
    readiness: {
      units: (units ?? []).length,
      hasRoster: (employees ?? []).length > 0,
      hasSchedule: (assignments ?? []).length > 0,
      connections: (connections ?? []).length,
      healthyConnections: (connections ?? []).filter(
        (c) => c.status === "healthy" || c.status === "ok",
      ).length,
      percent: stepList.length
        ? Math.round((stepList.filter((s) => s.status === "done").length / stepList.length) * 100)
        : 0,
    },
  };
}

export async function setStepStatusAction(
  userId: string,
  id: string,
  status: string,
  notes?: string | undefined,
) {
  const actor = await manager(userId);
  await db
    .from("setup_steps")
    .update({
      status,
      completed_at: status === "done" ? new Date().toISOString() : null,
      completed_by: status === "done" ? label(actor) : "",
      ...(notes === undefined ? {} : { notes }),
    })
    .eq("id", id);
  await logAudit("setup_step", label(actor), "setup_step", id, { status });
  return { ok: true };
}

/** Dry-run or apply a bulk import. Nothing is written unless `apply` is true. */
export async function runImportAction(
  userId: string,
  input: { kind: string; fileName?: string | undefined; text: string; apply: boolean },
) {
  const actor = await manager(userId);
  const template = IMPORT_TEMPLATES[input.kind];
  if (!template) throw new Error("Unknown import type.");
  const { rows } = parseDelimited(input.text);
  if (!rows.length) throw new Error("No rows were found in that file.");

  const errors: string[] = [];
  let applied = 0;
  let skipped = 0;

  const [{ data: units }, { data: staff }] = await Promise.all([
    db.from("units").select("id, name"),
    db.from("employees").select("id, full_name, position").eq("is_active", true),
  ]);
  const unitByName = new Map((units ?? []).map((u) => [u.name.toLowerCase(), u.id]));
  const staffByName = new Map((staff ?? []).map((s) => [s.full_name.toLowerCase(), s]));

  if (input.kind === "roster") {
    for (const [i, row] of rows.entries()) {
      const name = row["full_name"] || "";
      const position = normalizePosition(row["position"] ?? "");
      if (!name || !position) {
        errors.push(`Row ${i + 2}: needs a name and a position of nurse, qma or cna.`);
        skipped++;
        continue;
      }
      if (staffByName.has(name.toLowerCase())) {
        errors.push(`Row ${i + 2}: ${name} is already on the roster.`);
        skipped++;
        continue;
      }
      const unitId = unitByName.get((row["unit"] ?? "").toLowerCase()) ?? null;
      const shift = normalizeShift(row["shift"] ?? "") ?? "first";
      if (input.apply) {
        const { error } = await db.from("employees").insert({
          full_name: name,
          position,
          primary_unit_id: unitId,
          qualified_unit_ids: unitId ? [unitId] : [],
          scheduled_shift: shift,
          days_per_week: Number(row["days_per_week"] || 4) || 4,
          hire_date: normalizeDate(row["hire_date"] ?? "") ?? today(),
          hourly_rate: Number(row["hourly_rate"] || 0) || 0,
          email: row["email"] || null,
          phone: row["phone"] || null,
        });
        if (error) {
          errors.push(`Row ${i + 2}: ${error.message}`);
          skipped++;
          continue;
        }
      }
      applied++;
    }
  } else if (input.kind === "schedule") {
    for (const [i, row] of rows.entries()) {
      const person = staffByName.get((row["full_name"] ?? "").toLowerCase());
      const date = normalizeDate(row["date"] ?? "");
      const shift = normalizeShift(row["shift"] ?? "");
      const unitId = unitByName.get((row["unit"] ?? "").toLowerCase()) ?? null;
      if (!person || !date || !shift || !unitId) {
        errors.push(
          `Row ${i + 2}: needs a known employee, a date, a shift and a unit that exists.`,
        );
        skipped++;
        continue;
      }
      const position =
        normalizePosition(row["position"] ?? "") ?? (person.position as PositionType);
      if (input.apply) {
        const { error } = await db.from("shift_assignments").insert({
          shift_date: date,
          shift,
          unit_id: unitId,
          position,
          employee_id: person.id,
          status: "scheduled",
          hours: shiftHours(position),
          note: "Imported from your existing schedule",
        });
        if (error) {
          errors.push(`Row ${i + 2}: ${error.message}`);
          skipped++;
          continue;
        }
      }
      applied++;
    }
  } else {
    for (const [i, row] of rows.entries()) {
      const person = staffByName.get((row["full_name"] ?? "").toLowerCase());
      const date = normalizeDate(row["date"] ?? "");
      const kind = (row["kind"] ?? "").toLowerCase().includes("late") ? "late" : "call_off";
      if (!person || !date) {
        errors.push(`Row ${i + 2}: needs a known employee and a date.`);
        skipped++;
        continue;
      }
      if (input.apply) {
        const { error } = await db.from("attendance_events").insert({
          employee_id: person.id,
          kind,
          points: kind === "late" ? 0.5 : 1,
          minutes_late: row["minutes_late"] ? Number(row["minutes_late"]) : null,
          occurred_at: `${date}T12:00:00Z`,
          note: row["note"] || "Imported history",
        });
        if (error) {
          errors.push(`Row ${i + 2}: ${error.message}`);
          skipped++;
          continue;
        }
      }
      applied++;
    }
  }

  const status = input.apply ? (errors.length && !applied ? "failed" : "applied") : "previewed";
  const message = input.apply
    ? `Brought in ${applied} row${applied === 1 ? "" : "s"}, skipped ${skipped}.`
    : `${applied} row${applied === 1 ? "" : "s"} look good, ${skipped} would be skipped. Nothing has been saved yet.`;

  const { data: batch } = await db
    .from("import_batches")
    .insert({
      kind: input.kind,
      file_name: input.fileName ?? "",
      rows_received: rows.length,
      rows_applied: input.apply ? applied : 0,
      rows_skipped: skipped,
      status,
      message,
      errors: errors.slice(0, 50),
      created_by: label(actor),
    })
    .select("id")
    .maybeSingle();

  if (input.apply) {
    await logAudit("bulk_import", label(actor), "import_batch", batch?.id ?? null, {
      kind: input.kind,
      applied,
      skipped,
    });
  }
  return { applied, skipped, errors: errors.slice(0, 50), message, status };
}
