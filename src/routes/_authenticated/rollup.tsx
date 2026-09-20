import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { getCorporateRollup, getRollupAlerts, saveRollupAlerts } from "@/lib/rollup.functions";
import { downloadRollupCsv, downloadRollupPdf } from "@/lib/rollup-export";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/rollup")({
  head: () => ({
    meta: [
      { title: "Corporate rollup — every building side by side | CoverGrid" },
      {
        name: "description",
        content:
          "Regional view of staffing coverage, open shifts, agency use, overtime and labor budget across every building in one week.",
      },
      { property: "og:title", content: "Corporate rollup — CoverGrid" },
      {
        property: "og:description",
        content: "Compare coverage, open shifts and utilization across every building.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: RollupPage,
});

function shiftWeek(iso: string, weeks: number) {
  const d = new Date(`${iso}T00:00:00`);
  d.setDate(d.getDate() + weeks * 7);
  return d.toISOString().slice(0, 10);
}

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-lg border p-3">
      <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="font-display text-2xl">{value}</p>
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

function RollupPage() {
  const load = useServerFn(getCorporateRollup);
  const [week, setWeek] = useState<string | undefined>(undefined);
  const { data, isLoading, error } = useQuery({
    queryKey: ["corporate-rollup", week ?? "current"],
    queryFn: () => load({ data: week ? { weekStart: week } : {} }),
  });

  if (error)
    return (
      <p className="text-muted-foreground">
        This page is available to managers and directors only.
      </p>
    );

  const rows = data?.rows ?? [];
  const t = data?.totals;

  const exportData = data
    ? {
        weekStart: data.weekStart,
        weekEnd: data.weekEnd,
        rows: data.rows,
        totals: data.totals,
        attention: data.attention,
      }
    : null;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl">Corporate rollup</h1>
          <p className="text-muted-foreground">
            Every building for one week — who is short, who is leaning on agency, and who is running
            over budget.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() =>
              setWeek(shiftWeek(data?.weekStart ?? new Date().toISOString().slice(0, 10), -1))
            }
          >
            Previous week
          </Button>
          <span className="text-sm text-muted-foreground">
            {data?.weekStart} – {data?.weekEnd}
          </span>
          <Button
            variant="outline"
            size="sm"
            onClick={() =>
              setWeek(shiftWeek(data?.weekStart ?? new Date().toISOString().slice(0, 10), 1))
            }
          >
            Next week
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setWeek(undefined)}>
            This week
          </Button>
          <Button
            variant="secondary"
            size="sm"
            disabled={!exportData}
            onClick={() => {
              if (!exportData) return;
              downloadRollupCsv(exportData);
              toast.success("Spreadsheet downloaded.");
            }}
          >
            Export CSV
          </Button>
          <Button
            size="sm"
            disabled={!exportData}
            onClick={() => {
              if (!exportData) return;
              downloadRollupPdf(exportData);
              toast.success("PDF downloaded.");
            }}
          >
            Export PDF
          </Button>
        </div>
      </div>

      {isLoading && <p className="text-muted-foreground">Loading…</p>}

      {t && (
        <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
          <Stat label="Buildings" value={String(t.buildings)} hint={`${t.headcount} staff`} />
          <Stat label="Coverage" value={`${t.coveragePct}%`} hint={`${t.openSlots} open slots`} />
          <Stat
            label="Open shifts posted"
            value={String(t.openPosted)}
            hint={`${t.callOffs} call-offs`}
          />
          <Stat label="Agency shifts" value={String(t.agencyShifts)} />
          <Stat
            label="Overtime hours"
            value={String(t.overtimeHours)}
            hint={`${t.scheduledHours} scheduled`}
          />
          <Stat
            label="Labor cost"
            value={`$${t.laborCost.toLocaleString()}`}
            hint={
              t.weeklyLaborBudget
                ? `of $${t.weeklyLaborBudget.toLocaleString()} budgeted`
                : "no budget set"
            }
          />
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Building by building</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          {rows.length === 0 && !isLoading && (
            <p className="text-muted-foreground">No buildings have been set up yet.</p>
          )}
          {rows.length > 0 && (
            <table className="w-full min-w-[880px] text-sm">
              <thead>
                <tr className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="py-2 pr-3">Building</th>
                  <th className="py-2 pr-3">Coverage</th>
                  <th className="py-2 pr-3">Open</th>
                  <th className="py-2 pr-3">Agency</th>
                  <th className="py-2 pr-3">Call-offs</th>
                  <th className="py-2 pr-3">Overtime</th>
                  <th className="py-2 pr-3">PPD</th>
                  <th className="py-2 pr-3">Utilization</th>
                  <th className="py-2 pr-3">Labor vs budget</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className="border-b last:border-0 align-top">
                    <td className="py-3 pr-3">
                      <p className="font-medium">{r.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {r.units.length ? r.units.join(", ") : "no units"} · {r.headcount} staff ·{" "}
                        {r.floatPool} in float pool
                      </p>
                    </td>
                    <td className={cn("py-3 pr-3", r.coveragePct < 100 && "text-destructive")}>
                      {r.coveragePct}%
                      <span className="block text-xs text-muted-foreground">
                        {r.filled}/{r.required} slots
                      </span>
                    </td>
                    <td className="py-3 pr-3">
                      {r.openSlots}
                      <span className="block text-xs text-muted-foreground">
                        {r.openPosted} posted{r.worstDay ? ` · worst ${r.worstDay.date}` : ""}
                      </span>
                    </td>
                    <td className={cn("py-3 pr-3", r.agencyPct >= 15 && "text-destructive")}>
                      {r.agencyShifts}
                      <span className="block text-xs text-muted-foreground">
                        {r.agencyPct}% of worked shifts
                      </span>
                    </td>
                    <td className="py-3 pr-3">{r.callOffs}</td>
                    <td className={cn("py-3 pr-3", r.overtimeHours >= 24 && "text-destructive")}>
                      {r.overtimeHours} hrs
                    </td>
                    <td
                      className={cn(
                        "py-3 pr-3",
                        r.targetPpd > 0 && r.ppd > r.targetPpd && "text-destructive",
                      )}
                    >
                      {r.ppd || "—"}
                      <span className="block text-xs text-muted-foreground">
                        goal {r.targetPpd || "—"}
                      </span>
                    </td>
                    <td className="py-3 pr-3">
                      {r.utilizationPct}%
                      <span className="block text-xs text-muted-foreground">
                        {r.scheduledHours} hrs scheduled
                      </span>
                    </td>
                    <td className={cn("py-3 pr-3", r.budgetPct > 100 && "text-destructive")}>
                      ${r.laborCost.toLocaleString()}
                      <span className="block text-xs text-muted-foreground">
                        {r.weeklyLaborBudget
                          ? `${r.budgetPct}% of $${r.weeklyLaborBudget.toLocaleString()}`
                          : "no budget set"}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Needs a look</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {(data?.attention ?? []).length === 0 && (
            <p className="text-muted-foreground">
              Every building is covered, inside budget and under its PPD goal this week.
            </p>
          )}
          {(data?.attention ?? []).map((a, i) => (
            <div
              key={`${a.facility}-${i}`}
              className="flex flex-wrap items-center gap-2 rounded-lg border p-3"
            >
              <Badge variant="secondary">{a.facility}</Badge>
              <span className="text-sm">{a.issue}</span>
            </div>
          ))}
        </CardContent>
      </Card>

      <AlertRules weekStart={week} />
    </div>
  );
}

type RuleForm = {
  enabled: boolean;
  ppdOverGoal: boolean;
  coverageBelowPct: number;
  utilizationAbovePct: number;
  agencyAbovePct: number;
  overtimeAboveHours: number;
  budgetAbovePct: number;
  openSlotsAbove: number;
};

const NUMERIC_RULES: { key: keyof RuleForm; label: string; hint: string; suffix: string }[] = [
  {
    key: "coverageBelowPct",
    label: "Coverage falls below",
    hint: "Filled slots as a share of what the building needs.",
    suffix: "%",
  },
  {
    key: "utilizationAbovePct",
    label: "Utilization goes above",
    hint: "Scheduled hours against a 40-hour week per person.",
    suffix: "%",
  },
  {
    key: "agencyAbovePct",
    label: "Agency use goes above",
    hint: "Share of worked shifts covered by agency staff.",
    suffix: "%",
  },
  {
    key: "overtimeAboveHours",
    label: "Overtime goes above",
    hint: "Scheduled overtime hours for the week.",
    suffix: "hrs",
  },
  {
    key: "budgetAbovePct",
    label: "Labor spend goes above",
    hint: "Weekly labor cost against the building's budget.",
    suffix: "%",
  },
  {
    key: "openSlotsAbove",
    label: "Open slots go above",
    hint: "Unfilled slots left anywhere in the week.",
    suffix: "slots",
  },
];

/** Thresholds that decide when a building shows up in a manager's notifications. */
function AlertRules({ weekStart }: { weekStart: string | undefined }) {
  const loadRules = useServerFn(getRollupAlerts);
  const save = useServerFn(saveRollupAlerts);
  const qc = useQueryClient();
  const { data } = useQuery({
    queryKey: ["rollup-alerts", weekStart ?? "current"],
    queryFn: () => loadRules({ data: weekStart ? { weekStart } : {} }),
  });
  const [form, setForm] = useState<RuleForm | null>(null);

  useEffect(() => {
    if (!data) return;
    const r = data.rules;
    setForm({
      enabled: r.enabled,
      ppdOverGoal: r.ppdOverGoal,
      coverageBelowPct: r.coverageBelowPct,
      utilizationAbovePct: r.utilizationAbovePct,
      agencyAbovePct: r.agencyAbovePct,
      overtimeAboveHours: r.overtimeAboveHours,
      budgetAbovePct: r.budgetAbovePct,
      openSlotsAbove: r.openSlotsAbove,
    });
  }, [data]);

  const saving = useMutation({
    mutationFn: (input: RuleForm) => save({ data: input }),
    onSuccess: () => {
      toast.success("Alert rules saved. The system checks every building each hour.");
      void qc.invalidateQueries({ queryKey: ["rollup-alerts"] });
    },
    onError: (e: unknown) =>
      toast.error(e instanceof Error ? e.message : "Could not save the rules."),
  });

  const breaches = data?.breaches ?? [];

  return (
    <Card>
      <CardHeader>
        <CardTitle>Alert rules</CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        <p className="text-sm text-muted-foreground">
          Set the lines that matter. Every hour the system measures each building against them and
          sends a notification the moment one is crossed — once per building, per rule, per week, so
          nobody gets buried.
        </p>

        <div className="flex items-center justify-between rounded-lg border p-3">
          <div>
            <p className="font-medium">Send these alerts</p>
            <p className="text-xs text-muted-foreground">
              Turn off to keep watching without any notifications.
            </p>
          </div>
          <Switch
            checked={form?.enabled ?? false}
            onCheckedChange={(v) => setForm((f) => (f ? { ...f, enabled: v } : f))}
            aria-label="Send rollup alerts"
          />
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          {NUMERIC_RULES.map((rule) => (
            <div key={rule.key} className="rounded-lg border p-3">
              <Label htmlFor={`rule-${rule.key}`} className="text-sm font-medium">
                {rule.label}
              </Label>
              <div className="mt-2 flex items-center gap-2">
                <Input
                  id={`rule-${rule.key}`}
                  type="number"
                  className="w-28"
                  value={String(form?.[rule.key] ?? "")}
                  onChange={(e) =>
                    setForm((f) => (f ? { ...f, [rule.key]: Number(e.target.value) } : f))
                  }
                />
                <span className="text-sm text-muted-foreground">{rule.suffix}</span>
              </div>
              <p className="mt-2 text-xs text-muted-foreground">{rule.hint}</p>
            </div>
          ))}
          <div className="flex items-center justify-between rounded-lg border p-3 sm:col-span-2">
            <div>
              <p className="text-sm font-medium">Alert when PPD is above a building's goal</p>
              <p className="text-xs text-muted-foreground">
                Uses each unit's own hours-per-patient-day target.
              </p>
            </div>
            <Switch
              checked={form?.ppdOverGoal ?? false}
              onCheckedChange={(v) => setForm((f) => (f ? { ...f, ppdOverGoal: v } : f))}
              aria-label="Alert when PPD is over goal"
            />
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <Button disabled={!form || saving.isPending} onClick={() => form && saving.mutate(form)}>
            {saving.isPending ? "Saving…" : "Save alert rules"}
          </Button>
          {data?.rules.updatedBy && (
            <span className="text-xs text-muted-foreground">
              Last changed by {data.rules.updatedBy}
            </span>
          )}
        </div>

        <div className="space-y-2 border-t pt-4">
          <p className="text-sm font-medium">Crossing the line right now ({breaches.length})</p>
          {breaches.length === 0 && (
            <p className="text-sm text-muted-foreground">Nothing is over the line this week.</p>
          )}
          {breaches.map((b, i) => (
            <div
              key={`${b.facilityId}-${b.metric}-${i}`}
              className="flex flex-wrap items-center gap-2 rounded-lg border p-3"
            >
              <Badge variant={b.severity === "critical" ? "destructive" : "secondary"}>
                {b.facility}
              </Badge>
              <span className="text-sm">{b.message}</span>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
