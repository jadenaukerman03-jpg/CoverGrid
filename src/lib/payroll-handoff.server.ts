// When a new hire becomes a real person on the roster, they need a payroll ID,
// a clock-in number and a punch PIN before their first shift — and payroll needs
// to be told about them. This does all of that without anyone typing it in.
import { db, logAudit } from "./staffing.server";

function pin() {
  const bytes = new Uint8Array(2);
  crypto.getRandomValues(bytes);
  return String(((bytes[0]! << 8) | bytes[1]!) % 10000).padStart(4, "0");
}

/** Next free badge number, starting at 1001 so short numbers stay readable. */
async function nextClockNumber(taken: Set<string>) {
  let n = 1001;
  while (taken.has(String(n))) n += 1;
  return String(n);
}

/** Payroll IDs look like MC-000142 and never repeat. */
async function nextPayrollId(prefix: string, taken: Set<string>) {
  let max = 0;
  for (const id of taken) {
    const m = /^([A-Z]+)-(\d+)$/.exec(id);
    if (m && m[1] === prefix) max = Math.max(max, Number(m[2]));
  }
  return `${prefix}-${String(max + 1).padStart(6, "0")}`;
}

export type HandoffResult = {
  clockInNumber: string;
  payrollId: string;
  pinIssued: boolean;
  pushed: boolean;
  message: string;
};

/**
 * Generates whatever the person is still missing and pushes the record to payroll.
 * Safe to run twice: anything already filled in is left alone.
 */
export async function payrollHandoff(
  employeeId: string,
  actorLabel: string,
  opts?: { newHireId?: string | null | undefined },
): Promise<HandoffResult> {
  const { data: emp } = await db
    .from("employees")
    .select(
      "id,full_name,position,hire_date,hourly_rate,employment_type,clock_in_number,payroll_id,punch_pin,primary_unit_id",
    )
    .eq("id", employeeId)
    .maybeSingle();
  if (!emp) throw new Error("That person is no longer on the roster.");

  const { data: others } = await db
    .from("employees")
    .select("clock_in_number,payroll_id")
    .neq("id", employeeId);
  const badges = new Set(
    (others ?? []).map((o) => String(o.clock_in_number ?? "")).filter(Boolean),
  );
  const payrollIds = new Set((others ?? []).map((o) => String(o.payroll_id ?? "")).filter(Boolean));

  const { data: cfg } = await db.from("app_config").select("*").maybeSingle();
  const prefix = String(
    ((cfg as { payroll_prefix?: string } | null)?.payroll_prefix ?? "MC")
      .toString()
      .replace(/[^A-Za-z]/g, "")
      .toUpperCase() || "MC",
  );

  const clockInNumber = String(emp.clock_in_number ?? "").trim() || (await nextClockNumber(badges));
  const payrollId =
    String(emp.payroll_id ?? "").trim() || (await nextPayrollId(prefix, payrollIds));
  const needsPin = !String(emp.punch_pin ?? "").trim();

  const patch: Record<string, string> = { clock_in_number: clockInNumber, payroll_id: payrollId };
  if (needsPin) patch["punch_pin"] = pin();
  await db
    .from("employees")
    .update(patch as never)
    .eq("id", employeeId);

  if (opts?.newHireId) {
    await db
      .from("new_hires")
      .update({
        clock_in_number: clockInNumber,
        payroll_id: payrollId,
        badge_issued: true,
      } as never)
      .eq("id", opts.newHireId);
  }

  // Tell payroll. If the payroll connection is missing or off, the credentials
  // still stand — we simply note that nothing was sent.
  let pushed = false;
  let note = "Payroll is not connected yet, so the record is waiting in the next export.";
  try {
    const { data: conn } = await db
      .from("integration_connections")
      .select("*")
      .eq("kind", "payroll")
      .eq("is_enabled", true)
      .limit(1)
      .maybeSingle();
    if (conn) {
      const { recordSync } = await import("./integrations.server");
      const summary = `New hire ${emp.full_name} sent to payroll as ${payrollId} (badge ${clockInNumber}).`;
      await recordSync({
        connection: conn as never,
        direction: "outbound",
        trigger: "automatic",
        status: "ok",
        rowsReceived: 1,
        rowsApplied: 1,
        message: summary,
        actorLabel,
        snapshot: {
          rows: 1,
          summary,
          payload: {
            payrollId,
            clockInNumber,
            name: emp.full_name,
            position: emp.position,
            hireDate: emp.hire_date,
            hourlyRate: Number(emp.hourly_rate ?? 0),
            employmentType: emp.employment_type,
          },
        },
      });
      pushed = true;
      note = `Sent to ${String((conn as { name?: string }).name ?? "payroll")}.`;
    }
  } catch (err) {
    note =
      err instanceof Error ? err.message : "Payroll could not be reached; the record is queued.";
  }

  await logAudit("payroll_handoff", actorLabel, "employee", employeeId, {
    payrollId,
    clockInNumber,
    pushed,
  });

  return {
    clockInNumber,
    payrollId,
    pinIssued: needsPin,
    pushed,
    message: `Payroll ID ${payrollId}, clock-in number ${clockInNumber}. ${note}`,
  };
}
