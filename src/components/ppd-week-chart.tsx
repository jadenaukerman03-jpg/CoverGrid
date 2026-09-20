import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { addDays, startOfWeek, toISODate } from "@/lib/facility";
import { getFacilityConfig, setPpdGoalFn } from "@/lib/staffing.functions";
import { getLabor } from "@/lib/workforce.functions";

const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** Facility-wide care hours per resident day for the current Sunday–Saturday week. */
export function PpdWeekChart() {
  const qc = useQueryClient();
  const loadLabor = useServerFn(getLabor);
  const loadConfig = useServerFn(getFacilityConfig);
  const saveGoal = useServerFn(setPpdGoalFn);
  const todayIso = toISODate(new Date());
  const from = startOfWeek(todayIso);
  const to = addDays(from, 6);

  const { data, isLoading } = useQuery({
    queryKey: ["ppd-week", from, to],
    queryFn: () => loadLabor({ data: { from, to } }),
    refetchInterval: 60_000,
  });
  const { data: config } = useQuery({ queryKey: ["facility-config"], queryFn: () => loadConfig() });

  const goal = Number(config?.ppdGoal ?? 3.6);
  const isAdmin = Boolean(config?.isAdmin);
  const [goalInput, setGoalInput] = useState(String(goal));
  useEffect(() => setGoalInput(String(goal)), [goal]);

  const goalMutation = useMutation({
    mutationFn: (value: number) => saveGoal({ data: { goal: value } }),
    onSuccess: () => {
      toast.success("PPD goal updated.");
      void qc.invalidateQueries({ queryKey: ["facility-config"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const rows = DAY_LABELS.map((label, i) => {
    const date = addDays(from, i);
    const cells = (data?.days ?? []).filter((d) => d.date === date);
    const hours = cells.reduce((s, d) => s + d.totalHours, 0);
    const census = cells.reduce((s, d) => s + d.census, 0);
    return {
      day: label,
      date,
      ppd: census > 0 ? Number((hours / census).toFixed(2)) : 0,
      hours: Number(hours.toFixed(1)),
      census,
      future: date > todayIso,
      isToday: date === todayIso,
    };
  });

  const withData = rows.filter((r) => r.ppd > 0);
  const weekAvg =
    withData.length > 0
      ? Number((withData.reduce((s, r) => s + r.ppd, 0) / withData.length).toFixed(2))
      : 0;

  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3">
        <div>
          <CardTitle>Care hours per resident day (PPD)</CardTitle>
          <CardDescription>
            Sunday through Saturday, recalculated every time the schedule changes. Bars above the
            goal line are red.
          </CardDescription>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="outline">Week average {weekAvg.toFixed(2)}</Badge>
          <div className="flex items-center gap-2 rounded-lg border bg-card px-3 py-2">
            <label className="text-xs text-muted-foreground" htmlFor="ppd-goal">
              Goal PPD
            </label>
            {isAdmin ? (
              <>
                <Input
                  id="ppd-goal"
                  type="number"
                  step="0.05"
                  min="1"
                  max="12"
                  className="h-8 w-20"
                  value={goalInput}
                  onChange={(e) => setGoalInput(e.target.value)}
                />
                <Button
                  size="sm"
                  disabled={
                    goalMutation.isPending || Number(goalInput) === goal || !Number(goalInput)
                  }
                  onClick={() => goalMutation.mutate(Number(goalInput))}
                >
                  Save
                </Button>
              </>
            ) : (
              <span className="font-display text-lg">{goal.toFixed(2)}</span>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {!isAdmin && (
          <p className="mb-3 text-xs text-muted-foreground">
            Only an administrator can change the goal.
          </p>
        )}
        {isLoading && !data ? (
          <p className="text-sm text-muted-foreground">Adding up this week's care hours…</p>
        ) : (
          <div className="h-72 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={rows} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                <XAxis
                  dataKey="day"
                  tickLine={false}
                  axisLine={false}
                  stroke="var(--muted-foreground)"
                  fontSize={12}
                />
                <YAxis
                  tickLine={false}
                  axisLine={false}
                  stroke="var(--muted-foreground)"
                  fontSize={12}
                />
                <Tooltip
                  cursor={{ fill: "var(--muted)" }}
                  contentStyle={{
                    background: "var(--card)",
                    border: "1px solid var(--border)",
                    borderRadius: 8,
                    color: "var(--card-foreground)",
                    fontSize: 12,
                  }}
                  formatter={(v: number, _n, item) => {
                    const r = item.payload as (typeof rows)[number];
                    return [`${v.toFixed(2)} PPD · ${r.hours}h · census ${r.census}`, r.date];
                  }}
                  labelFormatter={() => ""}
                />
                <ReferenceLine
                  y={goal}
                  stroke="var(--primary)"
                  strokeWidth={2}
                  label={{
                    value: `Goal ${goal.toFixed(2)}`,
                    position: "right",
                    fill: "var(--muted-foreground)",
                    fontSize: 11,
                  }}
                />
                <Bar dataKey="ppd" radius={[6, 6, 0, 0]}>
                  {rows.map((r) => (
                    <Cell
                      key={r.date}
                      fill={r.ppd > goal ? "var(--critical)" : "var(--success)"}
                      fillOpacity={r.future ? 0.45 : 1}
                      stroke={r.isToday ? "var(--primary)" : undefined}
                      strokeWidth={r.isToday ? 2 : 0}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
        <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-muted-foreground sm:grid-cols-4">
          <span>Solid bars: days already worked or in progress</span>
          <span>Faded bars: scheduled days ahead</span>
          <span>Red: over the goal PPD</span>
          <span>Line: the facility goal</span>
        </div>
      </CardContent>
    </Card>
  );
}
