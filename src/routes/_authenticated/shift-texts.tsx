import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { broadcastShiftFn, getClaimBoard } from "@/lib/claims.functions";

export const Route = createFileRoute("/_authenticated/shift-texts")({
  head: () => ({
    meta: [
      { title: "Fill shifts by text — CoverGrid" },
      {
        name: "description",
        content:
          "Text an open shift to everyone qualified and let the first person who replies take it. No phone tag, no calling down a list.",
      },
      { property: "og:title", content: "Fill shifts by text — CoverGrid" },
      {
        property: "og:description",
        content: "Blast an open shift to qualified staff; the first reply gets it.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: ShiftTextsPage,
});

const STATUS_LABEL: Record<string, string> = {
  sent: "Waiting on a reply",
  claimed: "Took the shift",
  filled_by_other: "Someone else got it",
  expired: "No reply",
  error: "Could not add them",
};

function ShiftTextsPage() {
  const qc = useQueryClient();
  const load = useServerFn(getClaimBoard);
  const blast = useServerFn(broadcastShiftFn);
  const [hours, setHours] = useState(6);
  const [limit, setLimit] = useState(12);
  const [includeOvertime, setIncludeOvertime] = useState(false);

  const { data, isLoading, error } = useQuery({
    queryKey: ["claim-board"],
    queryFn: () => load(),
    refetchInterval: 60_000,
  });

  const send = useMutation({
    mutationFn: (assignmentId: string) =>
      blast({ data: { assignmentId, hoursToRespond: hours, limit, includeOvertime } }),
    onSuccess: (result) => {
      toast.success(result.message);
      void qc.invalidateQueries({ queryKey: ["claim-board"] });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-semibold sm:text-3xl">Fill shifts by text</h1>
        <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
          Send an open shift to everyone qualified at once. Whoever texts back the number first is
          put on the schedule straight away, and everybody else gets a short note saying it is
          taken.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">How the text goes out</CardTitle>
          <CardDescription>These settings apply to the next shift you send.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-3">
          <div className="space-y-1">
            <Label htmlFor="hours">Hours to reply</Label>
            <Input
              id="hours"
              type="number"
              min={1}
              max={72}
              value={hours}
              onChange={(e) => setHours(Number(e.target.value) || 6)}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="limit">How many people</Label>
            <Input
              id="limit"
              type="number"
              min={1}
              max={40}
              value={limit}
              onChange={(e) => setLimit(Number(e.target.value) || 12)}
            />
          </div>
          <div className="flex items-end gap-3">
            <Switch id="ot" checked={includeOvertime} onCheckedChange={setIncludeOvertime} />
            <Label htmlFor="ot" className="pb-2 text-sm font-normal">
              Include people who would go into overtime
            </Label>
          </div>
        </CardContent>
      </Card>

      {error ? <p className="text-sm text-destructive">{(error as Error).message}</p> : null}
      {isLoading ? <p className="text-sm text-muted-foreground">Loading…</p> : null}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Open shifts</CardTitle>
          <CardDescription>Everything still uncovered in the next three weeks.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {(data?.openShifts ?? []).length === 0 ? (
            <p className="text-sm text-muted-foreground">Nothing is open right now.</p>
          ) : null}
          {(data?.openShifts ?? []).map((s) => (
            <div
              key={s.assignmentId}
              className="flex flex-col gap-2 rounded-md border p-3 sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="min-w-0">
                <p className="text-sm font-medium">
                  {s.positionLabel} · {s.unit} · {s.shiftLabel.toLowerCase()}
                </p>
                <p className="text-xs text-muted-foreground">
                  {s.date} · {s.window}
                </p>
              </div>
              <div className="flex items-center gap-2">
                {s.alreadyTexted ? <Badge variant="secondary">Already texted</Badge> : null}
                <Button
                  size="sm"
                  disabled={send.isPending}
                  onClick={() => send.mutate(s.assignmentId)}
                >
                  {send.isPending
                    ? "Sending…"
                    : s.alreadyTexted
                      ? "Send again"
                      : "Text this shift out"}
                </Button>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Recent shift texts</CardTitle>
          <CardDescription>Who was asked, who replied, and how it ended.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {(data?.batches ?? []).length === 0 ? (
            <p className="text-sm text-muted-foreground">Nothing has gone out in the last week.</p>
          ) : null}
          {(data?.batches ?? []).map((b) => (
            <div key={b.batchId} className="rounded-md border p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm font-medium">{b.shift}</p>
                {b.claimedBy ? (
                  <Badge>Filled by {b.claimedBy}</Badge>
                ) : (
                  <Badge variant="secondary">Still waiting</Badge>
                )}
              </div>
              <p className="text-xs text-muted-foreground">
                Sent to {b.sent} {b.sent === 1 ? "person" : "people"} on{" "}
                {new Date(b.sentAt).toLocaleString()}
              </p>
              <ul className="mt-2 grid gap-1 sm:grid-cols-2">
                {b.people.map((p, i) => (
                  <li
                    key={`${b.batchId}-${i}`}
                    className="flex items-center justify-between gap-2 text-xs"
                  >
                    <span className="truncate">
                      {p.name} <span className="text-muted-foreground">(replies {p.code})</span>
                    </span>
                    <span className="shrink-0 text-muted-foreground">
                      {STATUS_LABEL[p.status] ?? p.status}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
