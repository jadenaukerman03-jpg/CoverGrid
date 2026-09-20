// Payroll / HRIS export layouts. Server-only.
import { db } from "./staffing.server";
import { payrollPeriod } from "./workforce.server";

export { PAYROLL_FORMATS, type PayrollFormat } from "./payroll-formats";
import type { PayrollFormat } from "./payroll-formats";

const q = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
const line = (cells: unknown[]) => cells.map(q).join(",");

const PBJ_JOB_CODE: Record<string, string> = { nurse: "5", qma: "10", cna: "10" };

export async function payrollExport(input: {
  start?: string | undefined;
  end?: string | undefined;
  format: PayrollFormat;
  companyCode?: string | undefined;
}) {
  const period = await payrollPeriod(input.start, input.end);
  const company = (input.companyCode ?? "").trim() || "MAIN";

  const { data: emps } = await db.from("employees").select("id,payroll_id,position");
  const meta = new Map((emps ?? []).map((e) => [e.id as string, e]));
  const idOf = (employeeId: string) => {
    const m = meta.get(employeeId);
    const pid = (m?.payroll_id as string | undefined)?.trim();
    return pid || employeeId.slice(0, 8).toUpperCase();
  };

  let head: string;
  let rows: string[];

  switch (input.format) {
    case "adp":
      head = "Co Code,Batch ID,File #,Reg Hours,O/T Hours,Hours 3 Code,Hours 3 Amount";
      rows = period.rows.map((r) =>
        line([
          company,
          `SS${period.start.replace(/-/g, "").slice(2)}`,
          idOf(r.employeeId),
          r.regularHours,
          r.overtimeHours,
          r.advances ? "ADV" : "",
          r.advances || "",
        ]),
      );
      break;
    case "paycom":
      head = "Employee_Code,Pay_Period_End,Earning_Code,Hours,Rate,Amount";
      rows = period.rows.flatMap((r) => {
        const out = [line([idOf(r.employeeId), period.end, "REG", r.regularHours, r.rate, ""])];
        if (r.overtimeHours)
          out.push(line([idOf(r.employeeId), period.end, "OT", r.overtimeHours, r.rate, ""]));
        if (r.advances)
          out.push(line([idOf(r.employeeId), period.end, "ADV", "", "", -r.advances]));
        return out;
      });
      break;
    case "ukg":
      head = "Person Number,Pay Code,Amount,Apply Date,Comment";
      rows = period.rows.flatMap((r) => {
        const out = [line([idOf(r.employeeId), "Regular", r.regularHours, period.end, ""])];
        if (r.overtimeHours)
          out.push(line([idOf(r.employeeId), "Overtime", r.overtimeHours, period.end, ""]));
        return out;
      });
      break;
    case "paylocity":
      head = "Company ID,Employee ID,Earning Code,Hours,Rate,Check Date";
      rows = period.rows.flatMap((r) => {
        const out = [
          line([company, idOf(r.employeeId), "REG", r.regularHours, r.rate, period.end]),
        ];
        if (r.overtimeHours)
          out.push(line([company, idOf(r.employeeId), "OVT", r.overtimeHours, r.rate, period.end]));
        return out;
      });
      break;
    case "pbj":
      head = "Employee ID,Job Title Code,Pay Type Code,Hours,Work Date Start,Work Date End";
      rows = period.rows.map((r) => {
        const emp = meta.get(r.employeeId);
        const code = PBJ_JOB_CODE[(emp?.position as string) ?? "cna"] ?? "10";
        const payType = r.employmentType === "prn" ? "2" : "1";
        return line([
          idOf(r.employeeId),
          code,
          payType,
          (r.regularHours + r.overtimeHours).toFixed(2),
          period.start,
          period.end,
        ]);
      });
      break;
    default:
      head = "Employee ID,Name,Position,Type,Rate,Regular Hours,Overtime Hours,Advances,Gross Pay";
      rows = period.rows.map((r) =>
        line([
          idOf(r.employeeId),
          r.name,
          r.position,
          r.employmentType,
          r.rate,
          r.regularHours,
          r.overtimeHours,
          r.advances,
          r.gross,
        ]),
      );
  }

  const missingIds = period.rows.filter(
    (r) => !(meta.get(r.employeeId)?.payroll_id as string | undefined)?.trim(),
  ).length;

  return {
    format: input.format,
    filename: `${input.format}-payroll-${period.start}-to-${period.end}.csv`,
    csv: [head, ...rows].join("\n"),
    rowCount: rows.length,
    start: period.start,
    end: period.end,
    missingPayrollIds: missingIds,
  };
}
