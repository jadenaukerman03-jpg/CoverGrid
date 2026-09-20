import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { formatDate } from "@/lib/facility";
import { PAYROLL_FORMATS, type PayrollFormat } from "@/lib/payroll-formats";
import { getPayrollExport } from "@/lib/platform.functions";
import { getPayroll } from "@/lib/workforce.functions";

export const Route = createFileRoute("/_authenticated/payroll")({
  head: () => ({
    meta: [
      { title: "Payroll — CoverGrid" },
      {
        name: "description",
        content:
          "Pay period totals, overtime, wage advances and a payroll export ready for your HRIS.",
      },
      { property: "og:title", content: "Payroll — CoverGrid" },
      {
        property: "og:description",
        content: "Hours, overtime and gross pay calculated straight from the schedule.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: PayrollPage,
});

function download(name: string, csv: string) {
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

function PayrollPage() {
  const load = useServerFn(getPayroll);
  const runExport = useServerFn(getPayrollExport);
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [format, setFormat] = useState<PayrollFormat>("standard");
  const [companyCode, setCompanyCode] = useState("");
  const [exporting, setExporting] = useState(false);
  const [note, setNote] = useState("");

  async function exportForHris() {
    setExporting(true);
    setNote("");
    try {
      const res = await runExport({
        data: {
          start: start || undefined,
          end: end || undefined,
          format,
          companyCode: companyCode || undefined,
        },
      });
      download(res.filename, res.csv);
      setNote(
        res.missingPayrollIds > 0
          ? `${res.rowCount} rows exported. ${res.missingPayrollIds} people have no payroll ID yet — their clock-in number was used instead.`
          : `${res.rowCount} rows exported.`,
      );
    } catch (e) {
      setNote((e as Error).message);
    } finally {
      setExporting(false);
    }
  }

  const { data, error, isLoading } = useQuery({
    queryKey: ["payroll", start, end],
    queryFn: () => load({ data: { start: start || undefined, end: end || undefined } }),
  });

  if (error) return <p className="text-muted-foreground">Payroll is available to managers only.</p>;

  const t = data?.totals;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl">Payroll</h1>
          <p className="text-muted-foreground">
            Pay periods roll forward on their own. Hours, overtime premium and wage advances are
            already netted out.
          </p>
        </div>
        <div className="flex items-end gap-3">
          <div>
            <label className="text-xs text-muted-foreground" htmlFor="pstart">
              Start
            </label>
            <Input
              id="pstart"
              type="date"
              value={start}
              onChange={(e) => setStart(e.target.value)}
            />
          </div>
          <div>
            <label className="text-xs text-muted-foreground" htmlFor="pend">
              End
            </label>
            <Input id="pend" type="date" value={end} onChange={(e) => setEnd(e.target.value)} />
          </div>
          <Button
            variant="secondary"
            disabled={!data}
            onClick={() => data && download(`payroll-${data.start}.csv`, data.csv)}
          >
            Export CSV
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Send it to your payroll system</CardTitle>
          <CardDescription>
            Pick the system your office already uses and download a file in that exact layout — no
            re-keying.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {PAYROLL_FORMATS.map((f) => (
              <button
                key={f.id}
                type="button"
                onClick={() => setFormat(f.id)}
                className={`rounded-lg border p-3 text-left transition ${
                  format === f.id ? "border-primary bg-primary/5" : "hover:bg-muted/50"
                }`}
              >
                <p className="font-medium">{f.label}</p>
                <p className="text-xs text-muted-foreground">{f.note}</p>
              </button>
            ))}
          </div>
          <div className="flex flex-wrap items-end gap-3">
            <div>
              <label className="text-xs text-muted-foreground" htmlFor="cc">
                Company code (optional)
              </label>
              <Input
                id="cc"
                value={companyCode}
                onChange={(e) => setCompanyCode(e.target.value)}
                placeholder="MAIN"
              />
            </div>
            <Button disabled={exporting} onClick={() => void exportForHris()}>
              {exporting ? "Building…" : "Download file"}
            </Button>
          </div>
          {note && <p className="text-sm text-muted-foreground">{note}</p>}
        </CardContent>
      </Card>

      {isLoading && <p className="text-muted-foreground">Building the pay period…</p>}

      {data && (
        <p className="text-sm text-muted-foreground">
          Period {formatDate(data.start)} – {formatDate(data.end)}
        </p>
      )}

      {t && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          <Metric label="Gross pay" value={`$${t.gross.toLocaleString("en-US")}`} />
          <Metric label="Regular hours" value={`${t.regularHours}h`} />
          <Metric label="Overtime hours" value={`${t.overtimeHours}h`} />
          <Metric label="Advances drawn" value={`$${t.advances.toLocaleString("en-US")}`} />
          <Metric label="Paid staff" value={String(t.headcount)} />
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Employee detail</CardTitle>
          <CardDescription>
            Overtime is paid at 1.5× beyond 40 hours in a Sunday–Saturday week.
          </CardDescription>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-sm">
            <thead className="text-left text-xs uppercase text-muted-foreground">
              <tr>
                <th className="pb-2">Employee</th>
                <th className="pb-2">Role</th>
                <th className="pb-2">Type</th>
                <th className="pb-2">Rate</th>
                <th className="pb-2">Regular</th>
                <th className="pb-2">OT</th>
                <th className="pb-2">Advances</th>
                <th className="pb-2">Gross</th>
              </tr>
            </thead>
            <tbody>
              {(data?.rows ?? []).map((r) => (
                <tr key={r.employeeId} className="border-t">
                  <td className="py-2 font-medium">{r.name}</td>
                  <td className="py-2">{r.position}</td>
                  <td className="py-2">{r.employmentType}</td>
                  <td className="py-2">${r.rate}</td>
                  <td className="py-2">{r.regularHours}h</td>
                  <td className={r.overtimeHours > 0 ? "py-2 text-warning" : "py-2"}>
                    {r.overtimeHours}h
                  </td>
                  <td className="py-2">${r.advances}</td>
                  <td className="py-2 font-medium">${r.gross.toLocaleString("en-US")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Recent periods</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          {(data?.periods ?? []).map((p) => (
            <Badge key={p.id} variant="secondary">
              {formatDate(p.start_date)} – {formatDate(p.end_date)} · {p.status}
            </Badge>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <Card>
      <CardContent className="space-y-1 p-5">
        <p className="text-sm text-muted-foreground">{label}</p>
        <p className="font-display text-2xl">{value}</p>
      </CardContent>
    </Card>
  );
}
