import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { addDays, formatDate, toISODate } from "@/lib/facility";
import { getLabor, setCensusFn } from "@/lib/workforce.functions";

export const Route = createFileRoute("/_authenticated/labor")({
  head: () => ({
    meta: [
      { title: "Labor & HPPD — CoverGrid" },
      {
        name: "description",
        content:
          "Real-time hours per patient day, census, labor cost and overtime spend for every unit in the facility.",
      },
      { property: "og:title", content: "Labor & HPPD — CoverGrid" },
      {
        property: "og:description",
        content: "Track care hours against census and budget, unit by unit, day by day.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: LaborPage,
});

const money = (n: number) => `$${n.toLocaleString("en-US")}`;

function LaborPage() {
  const qc = useQueryClient();
  const load = useServerFn(getLabor);
  const save = useServerFn(setCensusFn);
  const [from, setFrom] = useState(addDays(toISODate(new Date()), -6));
  const [to, setTo] = useState(toISODate(new Date()));

  const { data, isLoading, error } = useQuery({
    queryKey: ["labor", from, to],
    queryFn: () => load({ data: { from, to } }),
  });

  const censusMutation = useMutation({
    mutationFn: (v: { date: string; unitId: string; census: number }) => save({ data: v }),
    onSuccess: () => {
      toast.success("Census updated — care-hour targets recalculated.");
      void qc.invalidateQueries({ queryKey: ["labor"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (error)
    return <p className="text-muted-foreground">Labor analytics are available to managers only.</p>;

  const t = data?.totals;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl">Labor & HPPD</h1>
          <p className="text-muted-foreground">
            Care hours measured against census and budget. Census fills itself in automatically when
            nobody enters it.
          </p>
        </div>
        <div className="flex items-end gap-3">
          <div>
            <label className="text-xs text-muted-foreground" htmlFor="lfrom">
              From
            </label>
            <Input id="lfrom" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          </div>
          <div>
            <label className="text-xs text-muted-foreground" htmlFor="lto">
              To
            </label>
            <Input id="lto" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          </div>
        </div>
      </div>

      {isLoading && <p className="text-muted-foreground">Calculating care hours…</p>}

      {t && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard
            label="Actual HPPD"
            value={t.hppd.toFixed(2)}
            hint="Total care hours ÷ resident days"
          />
          <StatCard
            label="Care hours"
            value={`${t.hours.toLocaleString("en-US")}h`}
            hint="Scheduled and worked"
          />
          <StatCard
            label="Labor cost"
            value={money(t.cost)}
            hint={`${money(t.otCost)} of it overtime`}
          />
          <StatCard
            label="Cost / resident day"
            value={`$${t.costPerResidentDay}`}
            hint="Direct care labor only"
          />
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-3">
        {(data?.byUnit ?? []).map((u) => {
          const over = u.hppd >= u.targetHppd;
          return (
            <Card key={u.unitId}>
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-lg">{u.unitName}</CardTitle>
                  <Badge
                    className={
                      over
                        ? "bg-success text-success-foreground"
                        : "bg-critical text-critical-foreground"
                    }
                  >
                    {u.hppd.toFixed(2)} HPPD
                  </Badge>
                </div>
                <CardDescription>
                  Target {u.targetHppd.toFixed(2)} · {u.hours.toLocaleString("en-US")}h
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-2">
                <div className="h-2 overflow-hidden rounded-full bg-muted">
                  <div
                    className={over ? "h-full bg-success" : "h-full bg-critical"}
                    style={{ width: `${Math.min(100, (u.hppd / (u.targetHppd || 1)) * 100)}%` }}
                  />
                </div>
                <p className="text-sm text-muted-foreground">
                  {money(u.cost)} labor · {money(u.otCost)} overtime
                </p>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Daily detail</CardTitle>
          <CardDescription>
            Edit census inline — everything downstream recalculates instantly.
          </CardDescription>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-sm">
            <thead className="text-left text-xs uppercase text-muted-foreground">
              <tr>
                <th className="pb-2">Date</th>
                <th className="pb-2">Unit</th>
                <th className="pb-2">Census</th>
                <th className="pb-2">Nurse h</th>
                <th className="pb-2">CNA h</th>
                <th className="pb-2">HPPD</th>
                <th className="pb-2">Variance</th>
                <th className="pb-2">Cost</th>
              </tr>
            </thead>
            <tbody>
              {(data?.days ?? []).map((d) => (
                <tr key={`${d.date}-${d.unitId}`} className="border-t">
                  <td className="py-2">{formatDate(d.date)}</td>
                  <td className="py-2">{d.unitName}</td>
                  <td className="py-2">
                    <Input
                      className="h-8 w-20"
                      type="number"
                      defaultValue={d.census}
                      onBlur={(e) => {
                        const v = Number(e.target.value);
                        if (v !== d.census)
                          censusMutation.mutate({ date: d.date, unitId: d.unitId, census: v });
                      }}
                    />
                  </td>
                  <td className="py-2">{d.nurseHours}</td>
                  <td className="py-2">{d.cnaHours}</td>
                  <td className="py-2 font-medium">{d.actualHppd.toFixed(2)}</td>
                  <td className={d.varianceHours < 0 ? "py-2 text-critical" : "py-2 text-success"}>
                    {d.varianceHours > 0 ? "+" : ""}
                    {d.varianceHours}h
                  </td>
                  <td className="py-2">{money(d.cost)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}

function StatCard({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <Card>
      <CardContent className="space-y-1 p-5">
        <p className="text-sm text-muted-foreground">{label}</p>
        <p className="font-display text-3xl">{value}</p>
        <p className="text-xs text-muted-foreground">{hint}</p>
      </CardContent>
    </Card>
  );
}
