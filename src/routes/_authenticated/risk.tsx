import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  confirmIntakeFn,
  dismissIntakeFn,
  getIntakeInbox,
  getRiskBoard,
  recordIntakeFn,
  refreshRiskFn,
} from "@/lib/ops.functions";

export const Route = createFileRoute("/_authenticated/risk")({
  head: () => ({
    meta: [
      { title: "Call-off risk & phone call-offs — CoverGrid" },
      {
        name: "description",
        content:
          "See who is likely to call off and which upcoming shifts are shaky, and turn a phone call or voicemail into a recorded call-off with a replacement search.",
      },
      { property: "og:title", content: "Call-off risk & phone call-offs — CoverGrid" },
      {
        property: "og:description",
        content: "Know which shifts are shaky before they fall apart.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: RiskPage,
});

function RiskPage() {
  const qc = useQueryClient();
  const loadRisk = useServerFn(getRiskBoard);
  const loadInbox = useServerFn(getIntakeInbox);
  const refresh = useServerFn(refreshRiskFn);
  const record = useServerFn(recordIntakeFn);
  const confirm = useServerFn(confirmIntakeFn);
  const dismiss = useServerFn(dismissIntakeFn);

  const [caller, setCaller] = useState("");
  const [phone, setPhone] = useState("");
  const [transcript, setTranscript] = useState("");

  const risk = useQuery({ queryKey: ["risk-board"], queryFn: () => loadRisk() });
  const inbox = useQuery({ queryKey: ["intake-inbox"], queryFn: () => loadInbox() });

  const refreshMut = useMutation({
    mutationFn: () => refresh(),
    onSuccess: (r) => {
      toast.success(`${r.scored} people scored — ${r.high} flagged as likely to call off.`);
      void qc.invalidateQueries({ queryKey: ["risk-board"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const recordMut = useMutation({
    mutationFn: () =>
      record({ data: { transcript, callerName: caller, callerPhone: phone, channel: "phone" } }),
    onSuccess: (r) => {
      toast.success(
        r.matched
          ? "Logged and matched to a person — confirm it below."
          : "Logged. Pick the right person below so it can be recorded.",
      );
      setTranscript("");
      setCaller("");
      setPhone("");
      void qc.invalidateQueries({ queryKey: ["intake-inbox"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const confirmMut = useMutation({
    mutationFn: (v: {
      intakeId: string;
      employeeId: string;
      kind: "call_off" | "late";
      date: string;
      minutesLate: number | null;
    }) => confirm({ data: v }),
    onSuccess: (r) => {
      toast.success(r.message);
      void qc.invalidateQueries();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const dismissMut = useMutation({
    mutationFn: (intakeId: string) => dismiss({ data: { intakeId, reason: "Not a call-off" } }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["intake-inbox"] }),
    onError: (e: Error) => toast.error(e.message),
  });

  if (risk.error)
    return <p className="text-muted-foreground">This page is available to managers only.</p>;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl">Call-off risk</h1>
          <p className="text-muted-foreground">
            The system watches attendance patterns — who, which day, which shift — and marks each
            person as likely or not likely to call off, so shaky shifts get a backup lined up early.
          </p>
        </div>
        <Button
          variant="outline"
          onClick={() => refreshMut.mutate()}
          disabled={refreshMut.isPending}
        >
          Recheck everyone now
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Shifts worth watching in the next week</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {(risk.data?.shakyShifts ?? []).length === 0 && (
            <p className="text-muted-foreground">Nothing looks shaky right now.</p>
          )}
          {(risk.data?.shakyShifts ?? []).map((s) => (
            <div key={s.assignmentId} className="rounded-lg border p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="font-medium">
                  {s.name} — {s.unit} · {s.shiftLabel} · {s.day} {s.date}
                </p>
                <Badge variant={s.label === "high" ? "destructive" : "secondary"}>
                  {s.label === "high" ? "Likely to call off" : "Worth watching"}
                </Badge>
              </div>
              <p className="text-sm text-muted-foreground">{s.reason}</p>
              {s.patternNote && <p className="text-sm text-destructive">{s.patternNote}</p>}
            </div>
          ))}
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Take a call-off over the phone</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Type what the person said, word for word if you like. The system figures out whether
              it is a call-off or a late arrival, which day and which shift, then records it and
              starts looking for a replacement.
            </p>
            <div className="grid gap-1">
              <Label htmlFor="caller">Who called</Label>
              <Input
                id="caller"
                value={caller}
                onChange={(e) => setCaller(e.target.value)}
                placeholder="Maria Lopez"
              />
            </div>
            <div className="grid gap-1">
              <Label htmlFor="phone">Phone number (optional)</Label>
              <Input
                id="phone"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="555-0134"
              />
            </div>
            <div className="grid gap-1">
              <Label htmlFor="transcript">What they said</Label>
              <Textarea
                id="transcript"
                rows={4}
                value={transcript}
                onChange={(e) => setTranscript(e.target.value)}
                placeholder="This is Maria, I'm sick and can't make my third shift tonight."
              />
            </div>
            <Button
              onClick={() => recordMut.mutate()}
              disabled={recordMut.isPending || transcript.trim().length < 4}
            >
              Log the call
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Calls waiting on you</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {(inbox.data?.items ?? []).filter((i) => i.status === "pending").length === 0 && (
              <p className="text-muted-foreground">Nothing waiting.</p>
            )}
            {(inbox.data?.items ?? [])
              .filter((i) => i.status === "pending")
              .map((i) => (
                <div key={i.id} className="space-y-2 rounded-lg border p-3">
                  <p className="text-sm italic">“{i.transcript}”</p>
                  <p className="text-xs text-muted-foreground">
                    {i.employee ?? (i.callerName || "Unknown caller")} · heard as a{" "}
                    {i.kind === "late" ? `${i.minutesLate ?? 30}-minute late arrival` : "call-off"}{" "}
                    for {i.date}
                    {i.shiftLabel && ` (${i.shiftLabel.toLowerCase()})`} ·{" "}
                    {Math.round(i.confidence * 100)}% sure
                  </p>
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      disabled={!i.employeeId || confirmMut.isPending}
                      onClick={() =>
                        i.employeeId &&
                        confirmMut.mutate({
                          intakeId: i.id,
                          employeeId: i.employeeId,
                          kind: i.kind === "late" ? "late" : "call_off",
                          date: i.date,
                          minutesLate: i.minutesLate,
                        })
                      }
                    >
                      {i.employeeId ? "Record it" : "Match a person first"}
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => dismissMut.mutate(i.id)}>
                      Not a call-off
                    </Button>
                  </div>
                </div>
              ))}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Everyone, most to least likely</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {(risk.data?.people ?? []).slice(0, 60).map((p) => (
            <div
              key={p.employeeId}
              className="flex flex-wrap items-center justify-between gap-2 rounded-lg border p-3"
            >
              <div>
                <p className="font-medium">
                  {p.name} <span className="text-xs text-muted-foreground">{p.positionLabel}</span>
                </p>
                <p className="text-sm text-muted-foreground">{p.reason}</p>
              </div>
              <Badge
                variant={
                  p.label === "high"
                    ? "destructive"
                    : p.label === "elevated"
                      ? "secondary"
                      : "outline"
                }
              >
                {p.label === "high" ? "Likely" : p.label === "elevated" ? "Watch" : "Not likely"} ·{" "}
                {p.score}
              </Badge>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
