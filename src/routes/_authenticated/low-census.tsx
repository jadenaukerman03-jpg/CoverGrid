import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  POSITION_LABEL,
  SHIFT_LABEL,
  addDays,
  formatDate,
  toISODate,
  type PositionType,
  type ShiftType,
} from "@/lib/facility";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { getLowCensus, sendHomeLowCensusFn, undoSendHomeFn } from "@/lib/workforce.functions";

export const Route = createFileRoute("/_authenticated/low-census")({
  head: () => ({
    meta: [
      { title: "Low census suggestions — CoverGrid" },
      {
        name: "description",
        content:
          "When a unit is over its care-hour goal, see exactly who to offer low census to first — overtime and agency hours come off before anyone else.",
      },
      { property: "og:title", content: "Low census suggestions — CoverGrid" },
      {
        property: "og:description",
        content:
          "Who to send home when you are over PPD, ranked by overtime, agency cost and seniority.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: LowCensusPage,
});

function LowCensusPage() {
  const qc = useQueryClient();
  const load = useServerFn(getLowCensus);
  const sendHome = useServerFn(sendHomeLowCensusFn);
  const undoSendHome = useServerFn(undoSendHomeFn);
  const [from, setFrom] = useState(toISODate(new Date()));
  const [to, setTo] = useState(addDays(toISODate(new Date()), 6));

  const { data, isLoading, error } = useQuery({
    queryKey: ["low-census", from, to],
    queryFn: () => load({ data: { from, to } }),
    refetchInterval: 120_000,
  });

  const undoMutation = useMutation({
    mutationFn: (assignmentId: string) => undoSendHome({ data: { assignmentId } }),
    onSuccess: () => {
      toast.success(
        "Put back on the schedule. The text was pulled and they were told it was a mistake.",
      );
      void qc.invalidateQueries({ queryKey: ["low-census"] });
      void qc.invalidateQueries({ queryKey: ["schedule"] });
      void qc.invalidateQueries({ queryKey: ["dashboard"] });
      void qc.invalidateQueries({ queryKey: ["labor"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const sendHomeMutation = useMutation({
    mutationFn: (assignmentId: string) => sendHome({ data: { assignmentId } }),
    onSuccess: (res, assignmentId) => {
      const minutes = (res as { undoWindowMinutes?: number } | undefined)?.undoWindowMinutes ?? 10;
      toast.success("Sent home for low census.", {
        description: `The schedule, the person and the activity log were all updated. You have ${minutes} minute${minutes === 1 ? "" : "s"} to undo this.`,
        duration: 30_000,
        action: {
          label: "Undo",
          onClick: () => undoMutation.mutate(assignmentId),
        },
      });
      void qc.invalidateQueries({ queryKey: ["low-census"] });
      void qc.invalidateQueries({ queryKey: ["schedule"] });
      void qc.invalidateQueries({ queryKey: ["dashboard"] });
      void qc.invalidateQueries({ queryKey: ["labor"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (error)
    return (
      <p className="text-muted-foreground">
        Low census suggestions are available to managers only.
      </p>
    );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl">Low census suggestions</h1>
          <p className="max-w-2xl text-muted-foreground">
            The system watches care hours against the PPD goal and lists who to offer low census to
            first. Overtime and agency hours come off before anyone else, and nobody is suggested if
            it would leave a shift short. The call is always yours — nothing here happens on its
            own.
          </p>
        </div>
        <div className="flex items-end gap-2">
          <div>
            <label className="text-xs text-muted-foreground" htmlFor="lc-from">
              From
            </label>
            <Input
              id="lc-from"
              type="date"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
            />
          </div>
          <div>
            <label className="text-xs text-muted-foreground" htmlFor="lc-to">
              To
            </label>
            <Input id="lc-to" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          </div>
        </div>
      </div>

      {data ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Stat label="Goal PPD" value={data.goalPpd.toFixed(2)} />
          <Stat label="Unit-days over goal" value={String(data.totals.daysOver)} />
          <Stat label="Extra hours scheduled" value={`${data.totals.excessHours} h`} />
          <Stat
            label="If you act on all of it"
            value={`$${data.totals.estimatedSavings.toLocaleString("en-US")}`}
          />
        </div>
      ) : null}

      {isLoading ? <p className="text-muted-foreground">Checking care hours…</p> : null}

      {data && data.days.length === 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>Nothing to cut</CardTitle>
            <CardDescription>
              No unit is running over the PPD goal in this window, so nobody needs to be offered low
              census.
            </CardDescription>
          </CardHeader>
        </Card>
      ) : null}

      <div className="space-y-4">
        {(data?.days ?? []).map((d) => (
          <Card key={`${d.date}|${d.unitId}`}>
            <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3">
              <div>
                <CardTitle>
                  {formatDate(d.date)} · {d.unitName}
                </CardTitle>
                <CardDescription>
                  Census {d.census} · {d.scheduledHours} h scheduled vs {d.targetHours} h at goal ·{" "}
                  {d.excessHours} extra hours
                </CardDescription>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="destructive">PPD {d.actualPpd.toFixed(2)}</Badge>
                <Badge variant="outline">Goal {d.goalPpd.toFixed(2)}</Badge>
                {d.estimatedSavings > 0 ? (
                  <Badge variant="secondary">
                    Saves about ${d.estimatedSavings.toLocaleString("en-US")}
                  </Badge>
                ) : null}
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="text-sm text-muted-foreground">{d.note}</p>
              <ol className="space-y-3">
                {d.picks.map((p, i) => (
                  <li key={p.assignmentId} className="rounded-lg border bg-card p-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary text-xs text-primary-foreground">
                        {i + 1}
                      </span>
                      <span className="font-medium">{p.name}</span>
                      <Badge variant="outline">{POSITION_LABEL[p.position as PositionType]}</Badge>
                      <Badge variant="outline">{SHIFT_LABEL[p.shift as ShiftType]}</Badge>
                      {p.overtimeHours > 0 ? (
                        <Badge variant="destructive">{p.overtimeHours} h overtime</Badge>
                      ) : null}
                      {p.isAgency ? <Badge variant="destructive">Agency</Badge> : null}
                      <span className="ml-auto text-sm text-muted-foreground">
                        {p.hours} h · about ${p.savings.toLocaleString("en-US")} back
                      </span>
                    </div>
                    <ul className="mt-2 list-disc space-y-1 pl-9 text-sm text-muted-foreground">
                      {p.reasons.map((r) => (
                        <li key={r}>{r}</li>
                      ))}
                      <li>{p.remainingAfter}</li>
                    </ul>
                    <div className="mt-3 pl-9">
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button size="sm" variant="outline" disabled={sendHomeMutation.isPending}>
                            {sendHomeMutation.isPending ? "Working…" : "Send home"}
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Send {p.name} home?</AlertDialogTitle>
                            <AlertDialogDescription>
                              This takes the shift off the schedule, texts them, and writes it into
                              the activity log. No attendance points apply. You will have a short
                              window to undo it right after.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Keep them on</AlertDialogCancel>
                            <AlertDialogAction
                              onClick={() => sendHomeMutation.mutate(p.assignmentId)}
                            >
                              Yes, send home
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                      <span className="ml-2 text-xs text-muted-foreground">
                        Takes the shift off the schedule, texts them, and logs it. No attendance
                        points.
                      </span>
                    </div>
                  </li>
                ))}
              </ol>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardDescription>{label}</CardDescription>
        <CardTitle className="text-2xl">{value}</CardTitle>
      </CardHeader>
    </Card>
  );
}
