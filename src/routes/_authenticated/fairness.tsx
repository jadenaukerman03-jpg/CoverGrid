import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { getCostProjection, getFairness } from "@/lib/ops.functions";

export const Route = createFileRoute("/_authenticated/fairness")({
  head: () => ({
    meta: [
      { title: "Fairness & labor cost — CoverGrid" },
      {
        name: "description",
        content:
          "See how weekends, nights, floats and overtime are spread across the floor, and watch this week's projected payroll against budget in real time.",
      },
      { property: "og:title", content: "Fairness & labor cost — CoverGrid" },
      {
        property: "og:description",
        content: "Who is carrying the load, and what this week's schedule actually costs.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: FairnessPage,
});

const money = (n: number) => `$${n.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;

function FairnessPage() {
  const loadFair = useServerFn(getFairness);
  const loadCost = useServerFn(getCostProjection);
  const fair = useQuery({ queryKey: ["fairness"], queryFn: () => loadFair({ data: {} }) });
  const cost = useQuery({ queryKey: ["cost-projection"], queryFn: () => loadCost({ data: {} }) });

  if (fair.error)
    return <p className="text-muted-foreground">This page is available to managers only.</p>;

  const c = cost.data;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-3xl">Fairness & labor cost</h1>
        <p className="text-muted-foreground">
          Two questions answered honestly: is the hard work spread evenly, and what is this week's
          schedule going to cost?
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>This week's payroll, as scheduled</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {!c && <p className="text-muted-foreground">Loading…</p>}
          {c && (
            <>
              <div className="grid gap-4 sm:grid-cols-4">
                {[
                  ["Regular pay", money(c.straight)],
                  ["Overtime", money(c.overtime)],
                  ["Agency", money(c.agency)],
                  ["Total projected", money(c.projected)],
                ].map(([label, value]) => (
                  <div key={label} className="rounded-lg border p-3">
                    <p className="text-xs text-muted-foreground">{label}</p>
                    <p className="font-display text-2xl">{value}</p>
                  </div>
                ))}
              </div>
              {c.budget > 0 && (
                <div>
                  <div className="flex justify-between text-sm">
                    <span>Against a weekly budget of {money(c.budget)}</span>
                    <span className={c.variance < 0 ? "text-destructive" : "text-muted-foreground"}>
                      {c.variance < 0
                        ? `${money(Math.abs(c.variance))} over`
                        : `${money(c.variance)} to spare`}
                    </span>
                  </div>
                  <Progress value={Math.min(100, c.percentOfBudget)} className="mt-2" />
                </div>
              )}
              <div className="flex flex-wrap gap-2">
                {c.days.map((d) => (
                  <div key={d.date} className="rounded-md border px-3 py-2 text-xs">
                    <p className="text-muted-foreground">{d.date}</p>
                    <p className="font-medium">{money(d.cost)}</p>
                  </div>
                ))}
              </div>
              {c.agencies.length > 0 && (
                <p className="text-sm text-muted-foreground">
                  Agency spend:{" "}
                  {c.agencies
                    .map((a) => `${a.name} ${money(a.cost)} (${a.shifts} shifts)`)
                    .join(" · ")}
                </p>
              )}
            </>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Who is carrying the load</CardTitle>
          {fair.data && (
            <p className="text-sm text-muted-foreground">
              Floor average over the last twelve weeks: {fair.data.averages.weekends} weekends,{" "}
              {fair.data.averages.nights} nights, {fair.data.averages.otHours} overtime hours,{" "}
              {fair.data.averages.floats} floats.
            </p>
          )}
        </CardHeader>
        <CardContent className="space-y-2">
          {(fair.data?.rows ?? []).map((r) => (
            <div
              key={r.employeeId}
              className="flex flex-wrap items-center justify-between gap-2 rounded-lg border p-3"
            >
              <div>
                <p className="font-medium">
                  {r.name} <span className="text-xs text-muted-foreground">{r.positionLabel}</span>
                </p>
                <p className="text-sm text-muted-foreground">
                  {r.shifts} shifts · {r.weekends} weekends ({r.weekendShare}%) · {r.nights} nights
                  · {r.otHours} OT hours · {r.floats} floats
                </p>
                <p className="text-xs text-muted-foreground">{r.note}</p>
              </div>
              <Badge
                variant={
                  r.balance === "carrying more"
                    ? "destructive"
                    : r.balance === "carrying less"
                      ? "secondary"
                      : "outline"
                }
              >
                {r.balance === "carrying more"
                  ? "Carrying more"
                  : r.balance === "carrying less"
                    ? "Carrying less"
                    : "Even"}
              </Badge>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
