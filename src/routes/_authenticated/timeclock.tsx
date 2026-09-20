import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { SHIFT_LABEL, type ShiftType } from "@/lib/facility";
import { getTimeClock, getWageAccess, punchFn, requestAdvanceFn } from "@/lib/workforce.functions";

export const Route = createFileRoute("/_authenticated/timeclock")({
  head: () => ({
    meta: [
      { title: "Time clock & wallet — CoverGrid" },
      {
        name: "description",
        content:
          "Clock in and out from any device, review your punches, and access wages you have already earned.",
      },
      { property: "og:title", content: "Time clock & wallet — CoverGrid" },
      {
        property: "og:description",
        content: "Mobile punches, punch history and earned wage access in one place.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: TimeClockPage,
});

const EXCEPTION_LABEL: Record<string, string> = {
  late_punch: "Late punch",
  early_punch: "Early punch",
  missed_clock_out: "Missed clock-out",
  no_punch: "No punch recorded",
};

function TimeClockPage() {
  const qc = useQueryClient();
  const loadClock = useServerFn(getTimeClock);
  const loadWallet = useServerFn(getWageAccess);
  const doPunch = useServerFn(punchFn);
  const advance = useServerFn(requestAdvanceFn);
  const [amount, setAmount] = useState(50);

  const clock = useQuery({ queryKey: ["timeclock"], queryFn: () => loadClock() });
  const wallet = useQuery({ queryKey: ["wallet"], queryFn: () => loadWallet() });

  const punchMutation = useMutation({
    mutationFn: (v: { assignmentId: string | null; kind: "in" | "out" }) => doPunch({ data: v }),
    onSuccess: (res) => {
      toast.success(res.message);
      void qc.invalidateQueries();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const advanceMutation = useMutation({
    mutationFn: () => advance({ data: { amount, note: "Requested from wallet" } }),
    onSuccess: () => {
      toast.success("Advance approved — funds are on the way.");
      void qc.invalidateQueries();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (clock.error) return <p className="text-muted-foreground">{(clock.error as Error).message}</p>;
  if (clock.isLoading || !clock.data)
    return <p className="text-muted-foreground">Loading your time clock…</p>;

  const c = clock.data;
  const isIn = Boolean(c.openPunch);
  const nextShift = c.todaysShifts.find((s) => s.status === "scheduled") ?? c.todaysShifts[0];

  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-display text-3xl">Time clock & wallet</h1>
        <p className="text-muted-foreground">
          No timeclock hardware — punch from whatever device you have with you.
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>{isIn ? "You are on the clock" : "You are clocked out"}</CardTitle>
            <CardDescription>
              {nextShift
                ? `Today: ${nextShift.unit} · ${SHIFT_LABEL[nextShift.shift as ShiftType]} · ${nextShift.hours}h`
                : "Nothing scheduled for you today."}
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap items-center gap-4">
            <Button
              size="lg"
              variant={isIn ? "destructive" : "default"}
              disabled={punchMutation.isPending}
              onClick={() =>
                punchMutation.mutate({
                  assignmentId: nextShift?.id ?? null,
                  kind: isIn ? "out" : "in",
                })
              }
            >
              {isIn ? "Clock out" : "Clock in"}
            </Button>
            <div className="text-sm text-muted-foreground">
              <div>
                Hours worked this week:{" "}
                <strong className="text-foreground">{c.workedHoursThisWeek}h</strong>
              </div>
              {isIn && c.openPunch?.clock_in && (
                <div>
                  Since{" "}
                  {new Date(c.openPunch.clock_in).toLocaleTimeString("en-US", {
                    hour: "numeric",
                    minute: "2-digit",
                  })}
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Earned wage access</CardTitle>
            <CardDescription>
              Draw up to half of the net wages you have already earned this period.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="font-display text-3xl">${wallet.data?.available ?? 0}</p>
            <p className="text-xs text-muted-foreground">
              {wallet.data?.earnedHours ?? 0}h earned · ${wallet.data?.taken ?? 0} already drawn
              this period
            </p>
            <div className="flex gap-2">
              <Input
                type="number"
                min={1}
                value={amount}
                onChange={(e) => setAmount(Math.max(1, Number(e.target.value) || 0))}
                className="w-28"
              />
              <Button
                variant="secondary"
                disabled={advanceMutation.isPending || (wallet.data?.available ?? 0) <= 0}
                onClick={() => advanceMutation.mutate()}
              >
                Get paid now
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Recent punches</CardTitle>
          <CardDescription>
            Exceptions are flagged automatically and sent to your manager.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          {c.recent.length === 0 && (
            <p className="text-muted-foreground">No punches recorded yet.</p>
          )}
          {c.recent.map((p) => (
            <div
              key={p.id}
              className="flex flex-wrap items-center justify-between gap-2 rounded-md bg-muted/50 px-3 py-2"
            >
              <span className="font-medium">{p.date}</span>
              <span className="text-muted-foreground">
                {p.clock_in
                  ? new Date(p.clock_in).toLocaleTimeString("en-US", {
                      hour: "numeric",
                      minute: "2-digit",
                    })
                  : "—"}
                {" → "}
                {p.clock_out
                  ? new Date(p.clock_out).toLocaleTimeString("en-US", {
                      hour: "numeric",
                      minute: "2-digit",
                    })
                  : "open"}
              </span>
              <span>{(p.minutes_worked / 60).toFixed(2)}h</span>
              {p.exception ? (
                <Badge className="bg-warning text-warning-foreground">
                  {EXCEPTION_LABEL[p.exception] ?? p.exception}
                </Badge>
              ) : (
                <Badge variant="secondary">Clean</Badge>
              )}
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
