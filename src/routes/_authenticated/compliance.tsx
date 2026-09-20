import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { addDays, formatDate, toISODate } from "@/lib/facility";
import { getCompliance } from "@/lib/workforce.functions";

export const Route = createFileRoute("/_authenticated/compliance")({
  head: () => ({
    meta: [
      { title: "Compliance & PBJ — CoverGrid" },
      {
        name: "description",
        content:
          "CMS Payroll-Based Journal hours, punch exceptions and HPPD evidence, export-ready at any moment.",
      },
      { property: "og:title", content: "Compliance & PBJ — CoverGrid" },
      {
        property: "og:description",
        content: "Staffing evidence that stays survey-ready without a scramble.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: CompliancePage,
});

function download(name: string, csv: string) {
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

function CompliancePage() {
  const load = useServerFn(getCompliance);
  const [from, setFrom] = useState(addDays(toISODate(new Date()), -29));
  const [to, setTo] = useState(toISODate(new Date()));

  const { data, error } = useQuery({
    queryKey: ["compliance", from, to],
    queryFn: () => load({ data: { from, to } }),
  });

  if (error)
    return (
      <p className="text-muted-foreground">Compliance reporting is available to managers only.</p>
    );

  const t = data?.pbj.totals;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl">Compliance & PBJ</h1>
          <p className="text-muted-foreground">
            Every completed shift rolls into CMS-format staffing hours automatically. Nothing to
            reconstruct at quarter end.
          </p>
        </div>
        <div className="flex items-end gap-3">
          <div>
            <label className="text-xs text-muted-foreground" htmlFor="cfrom">
              From
            </label>
            <Input id="cfrom" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          </div>
          <div>
            <label className="text-xs text-muted-foreground" htmlFor="cto">
              To
            </label>
            <Input id="cto" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          </div>
          <Button
            variant="secondary"
            disabled={!data}
            onClick={() => data && download(`pbj-${from}-${to}.csv`, data.pbjCsv)}
          >
            Export PBJ
          </Button>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <Metric label="Nurse hours" value={`${t?.rnHours ?? 0}h`} />
        <Metric label="Aide hours" value={`${t?.cnaHours ?? 0}h`} />
        <Metric label="Contract hours" value={`${t?.contractHours ?? 0}h`} />
        <Metric label="Total hours" value={`${t?.total ?? 0}h`} />
        <Metric label="Facility HPPD" value={String(data?.hppd ?? 0)} />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        {(data?.byUnit ?? []).map((u) => (
          <Card key={u.unitId}>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">{u.unitName}</CardTitle>
              <CardDescription>Target {u.targetHppd.toFixed(2)} HPPD</CardDescription>
            </CardHeader>
            <CardContent>
              <Badge
                className={
                  u.hppd >= u.targetHppd
                    ? "bg-success text-success-foreground"
                    : "bg-critical text-critical-foreground"
                }
              >
                {u.hppd.toFixed(2)} actual
              </Badge>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Punch exceptions</CardTitle>
          <CardDescription>
            {data?.exceptionCount ?? 0} flagged in this window and resolved by the nightly sweep.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          {(data?.exceptions ?? []).length === 0 && (
            <p className="text-muted-foreground">No exceptions — clean window.</p>
          )}
          {(data?.exceptions ?? []).map((e) => (
            <div
              key={e.id}
              className="flex flex-wrap items-center justify-between gap-2 rounded-md bg-muted/50 px-3 py-2"
            >
              <span className="font-medium">{e.employee}</span>
              <span className="text-muted-foreground">{formatDate(e.date)}</span>
              <span>{e.hours}h</span>
              <Badge className="bg-warning text-warning-foreground">{e.exception}</Badge>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>PBJ daily hours</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="w-full min-w-[520px] text-sm">
            <thead className="text-left text-xs uppercase text-muted-foreground">
              <tr>
                <th className="pb-2">Date</th>
                <th className="pb-2">RN / LPN</th>
                <th className="pb-2">Nurse aide</th>
                <th className="pb-2">Contract</th>
                <th className="pb-2">Total</th>
              </tr>
            </thead>
            <tbody>
              {(data?.pbj.rows ?? []).map((r) => (
                <tr key={r.date} className="border-t">
                  <td className="py-2">{formatDate(r.date)}</td>
                  <td className="py-2">{r.rnHours.toFixed(1)}</td>
                  <td className="py-2">{r.cnaHours.toFixed(1)}</td>
                  <td className="py-2">{r.contractHours.toFixed(1)}</td>
                  <td className="py-2 font-medium">{r.total.toFixed(1)}</td>
                </tr>
              ))}
            </tbody>
          </table>
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
