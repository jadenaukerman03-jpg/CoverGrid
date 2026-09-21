import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { PpdWeekChart } from "@/components/ppd-week-chart";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { POSITION_LABEL } from "@/lib/facility";
import {
  assignReplacementFn,
  autoFillGapsFn,
  findReplacements,
  getDashboard,
  getFacilityConfig,
} from "@/lib/staffing.functions";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({
    meta: [
      { title: "Staffing dashboard — CoverGrid" },
      {
        name: "description",
        content: "Live coverage, call-offs, overtime and open shifts across every unit.",
      },
      { property: "og:title", content: "Staffing dashboard — CoverGrid" },
      {
        property: "og:description",
        content: "Live coverage, call-offs and overtime across Birch, Cedar and Dogwood.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: DashboardPage,
});

function DashboardPage() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const loadConfig = useServerFn(getFacilityConfig);
  const loadDashboard = useServerFn(getDashboard);
  const search = useServerFn(findReplacements);
  const assign = useServerFn(assignReplacementFn);
  const autoFill = useServerFn(autoFillGapsFn);
  const [openAssignment, setOpenAssignment] = useState<string | null>(null);

  const { data: config } = useQuery({ queryKey: ["facility-config"], queryFn: () => loadConfig() });
  useEffect(() => {
    if (config && !config.isManager) void navigate({ to: "/my-shifts" });
  }, [config, navigate]);

  const { data, isLoading } = useQuery({
    queryKey: ["dashboard"],
    queryFn: () => loadDashboard({ data: {} }),
    enabled: config?.isManager === true,
    refetchInterval: 60_000,
  });

  const candidates = useQuery({
    queryKey: ["candidates", openAssignment],
    queryFn: () => search({ data: { assignmentId: openAssignment as string } }),
    enabled: Boolean(openAssignment),
  });

  const assignMutation = useMutation({
    mutationFn: (v: { assignmentId: string; employeeId: string }) => assign({ data: v }),
    onSuccess: () => {
      toast.success("Replacement assigned and notified.");
      setOpenAssignment(null);
      void qc.invalidateQueries({ queryKey: ["dashboard"] });
      void qc.invalidateQueries({ queryKey: ["ppd-week"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const autoFillMutation = useMutation({
    mutationFn: () => {
      const from = data?.date ?? new Date().toISOString().slice(0, 10);
      const to = new Date(new Date(`${from}T00:00:00Z`).getTime() + 6 * 864e5)
        .toISOString()
        .slice(0, 10);
      return autoFill({ data: { from, to } });
    },
    onSuccess: (res) => {
      toast.success(`Filled ${res.filled.length} of ${res.gapsFound} open slots.`);
      void qc.invalidateQueries({ queryKey: ["dashboard"] });
      void qc.invalidateQueries({ queryKey: ["ppd-week"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (isLoading || !data) return <p className="text-muted-foreground">Loading staffing data…</p>;

  const gapRows = data.todayCoverage.filter((r) => r.gap > 0);

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl">Staffing dashboard</h1>
          <p className="text-muted-foreground">Facility status for {data.date}</p>
        </div>
        <Button onClick={() => autoFillMutation.mutate()} disabled={autoFillMutation.isPending}>
          {autoFillMutation.isPending ? "Optimizing…" : "Fill this week's gaps"}
        </Button>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          title="Coverage today"
          value={`${data.todaySummary.coveragePct}%`}
          detail={`${data.todaySummary.filled}/${data.todaySummary.required} required positions filled`}
          progress={data.todaySummary.coveragePct}
        />
        <StatCard
          title="Open slots today"
          value={String(data.todaySummary.openSlots)}
          detail={`${data.todaySummary.understaffed} understaffed shift groups`}
        />
        <StatCard
          title="Open slots this week"
          value={String(data.weekSummary.openSlots)}
          detail={`${data.weekSummary.coveragePct}% weekly coverage`}
        />
        <StatCard
          title="Overtime this week"
          value={`${data.overtime.overtimeHours}h`}
          detail={`${data.overtime.inOvertime.length} employees over 40h`}
        />
      </div>

      <PpdWeekChart />

      <Tabs defaultValue="gaps">
        <TabsList>
          <TabsTrigger value="gaps">Gaps ({gapRows.length})</TabsTrigger>
          <TabsTrigger value="calloffs">Call-offs ({data.callOffs.length})</TabsTrigger>
          <TabsTrigger value="overtime">Overtime</TabsTrigger>
          <TabsTrigger value="alerts">Alerts ({data.alerts.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="gaps">
          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Unit</TableHead>
                    <TableHead>Shift</TableHead>
                    <TableHead>Position</TableHead>
                    <TableHead className="text-right">Filled / required</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {gapRows.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={4} className="py-6 text-center text-muted-foreground">
                        Every required position is covered today.
                      </TableCell>
                    </TableRow>
                  )}
                  {gapRows.map((r) => (
                    <TableRow key={`${r.unitName}-${r.shift}-${r.position}`}>
                      <TableCell>{r.unitName}</TableCell>
                      <TableCell className="capitalize">{r.shift}</TableCell>
                      <TableCell>{POSITION_LABEL[r.position]}</TableCell>
                      <TableCell className="text-right font-medium text-destructive">
                        {r.filled} / {r.required}
                        {r.recommended !== undefined && r.recommended !== r.required && (
                          <span className="ml-2 font-normal text-muted-foreground">
                            (today's census suggests {r.recommended})
                          </span>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="calloffs">
          <Card>
            <CardContent className="space-y-3 p-6">
              {data.callOffs.length === 0 && (
                <p className="text-muted-foreground">No call-offs in the next 7 days.</p>
              )}
              {data.callOffs.map((c) => (
                <div key={c.id} className="rounded-lg border p-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <div className="font-medium">
                        {c.employee} · {c.unit} · {c.shiftLabel}
                      </div>
                      <div className="text-sm text-muted-foreground">
                        {c.date} · {c.window} · {c.position === "cna" ? "CNA" : "Nurse"}
                      </div>
                    </div>
                    <Button
                      variant={openAssignment === c.id ? "secondary" : "outline"}
                      size="sm"
                      onClick={() => setOpenAssignment(openAssignment === c.id ? null : c.id)}
                    >
                      {openAssignment === c.id ? "Hide candidates" : "Find replacement"}
                    </Button>
                  </div>
                  {openAssignment === c.id && (
                    <div className="mt-4 space-y-2 border-t pt-4">
                      {candidates.isLoading && (
                        <p className="text-sm text-muted-foreground">Ranking candidates…</p>
                      )}
                      {candidates.data?.candidates.length === 0 && (
                        <p className="text-sm text-muted-foreground">
                          No eligible employee is available without breaking rest or qualification
                          rules.
                        </p>
                      )}
                      {candidates.data?.candidates.map((cand) => (
                        <div
                          key={cand.employeeId}
                          className="flex flex-wrap items-center justify-between gap-3 rounded-md bg-muted/60 px-3 py-2"
                        >
                          <div className="text-sm">
                            <div className="font-medium">
                              {cand.name}{" "}
                              {cand.wouldBeOvertime && (
                                <Badge className="ml-1 bg-warning text-warning-foreground">
                                  OT
                                </Badge>
                              )}
                            </div>
                            <div className="text-xs text-muted-foreground">
                              {cand.projectedHours}h projected · {cand.reasons.join(" · ")}
                            </div>
                          </div>
                          <Button
                            size="sm"
                            disabled={assignMutation.isPending}
                            onClick={() =>
                              assignMutation.mutate({
                                assignmentId: c.id,
                                employeeId: cand.employeeId,
                              })
                            }
                          >
                            Assign
                          </Button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="overtime">
          <Card>
            <CardHeader>
              <CardTitle>Weekly hours</CardTitle>
              <CardDescription>
                {data.overtime.totalScheduledHours}h scheduled · {data.overtime.overtimeHours}h over
                the 40-hour line
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-6 md:grid-cols-2">
              <div>
                <h4 className="mb-2 font-medium">In overtime</h4>
                {data.overtime.inOvertime.length === 0 && (
                  <p className="text-sm text-muted-foreground">Nobody is in overtime.</p>
                )}
                <ul className="space-y-1 text-sm">
                  {data.overtime.inOvertime.map((e) => (
                    <li key={e.employeeId} className="flex justify-between">
                      <span>{e.name}</span>
                      <span className="text-destructive">{e.hours}h</span>
                    </li>
                  ))}
                </ul>
              </div>
              <div>
                <h4 className="mb-2 font-medium">Approaching 40h</h4>
                <ul className="space-y-1 text-sm">
                  {data.overtime.approaching.map((e) => (
                    <li key={e.employeeId} className="flex justify-between">
                      <span>{e.name}</span>
                      <span className="text-muted-foreground">{e.hours}h</span>
                    </li>
                  ))}
                </ul>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="alerts">
          <Card>
            <CardContent className="space-y-3 p-6">
              {data.alerts.length === 0 && <p className="text-muted-foreground">No open alerts.</p>}
              {data.alerts.map((a) => (
                <div key={a.id} className="rounded-lg border-l-4 border-l-warning bg-muted/50 p-4">
                  <div className="font-medium capitalize">
                    {a.severity} · {a.unitName || "Facility"}
                    {a.shift_date ? ` · ${a.shift_date}` : ""}
                  </div>
                  <div className="text-sm text-muted-foreground">{a.message}</div>
                </div>
              ))}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function StatCard({
  title,
  value,
  detail,
  progress,
}: {
  title: string;
  value: string;
  detail: string;
  progress?: number;
}) {
  return (
    <Card>
      <CardContent className="space-y-2 p-5">
        <p className="text-sm text-muted-foreground">{title}</p>
        <p className="font-display text-3xl">{value}</p>
        {progress !== undefined && <Progress value={progress} />}
        <p className="text-xs text-muted-foreground">{detail}</p>
      </CardContent>
    </Card>
  );
}
