import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { getMeOverview, recordCallOffFn } from "@/lib/staffing.functions";

export const Route = createFileRoute("/_authenticated/my-shifts")({
  head: () => ({
    meta: [
      { title: "My shifts — CoverGrid" },
      {
        name: "description",
        content: "Your upcoming shifts, hours, attendance points and open shifts you can pick up.",
      },
      { property: "og:title", content: "My shifts — CoverGrid" },
      {
        property: "og:description",
        content: "Your schedule, hours and attendance points in one place.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: MyShiftsPage,
});

function MyShiftsPage() {
  const qc = useQueryClient();
  const load = useServerFn(getMeOverview);
  const callOff = useServerFn(recordCallOffFn);
  const [note, setNote] = useState("");
  const [target, setTarget] = useState<string | null>(null);

  const { data, isLoading } = useQuery({ queryKey: ["me"], queryFn: () => load() });

  const callOffMutation = useMutation({
    mutationFn: (assignmentId: string) => callOff({ data: { assignmentId, note } }),
    onSuccess: () => {
      toast.success(
        "Call-off recorded. 1 attendance point applied and a replacement search has started.",
      );
      setTarget(null);
      setNote("");
      void qc.invalidateQueries({ queryKey: ["me"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (isLoading || !data) return <p className="text-muted-foreground">Loading your schedule…</p>;
  if (!data.employee)
    return (
      <Card>
        <CardHeader>
          <CardTitle>No employee record linked</CardTitle>
          <CardDescription>
            Your login isn't matched to an employee file yet. Ask a manager to add your work email
            to the roster.
          </CardDescription>
        </CardHeader>
      </Card>
    );

  const emp = data.employee;

  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-display text-3xl">Hello, {emp.name.split(" ")[0]}</h1>
        <p className="text-muted-foreground">
          {emp.positionLabel} · {emp.homeUnit} · {emp.scheduledShiftLabel} · weekend group{" "}
          {emp.weekendGroup}
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardContent className="space-y-1 p-5">
            <p className="text-sm text-muted-foreground">Hours this week</p>
            <p className="font-display text-3xl">{data.weekHours}h</p>
            <p className="text-xs text-muted-foreground">
              {data.weekHours > 40 ? "Includes overtime" : "Within regular hours"}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="space-y-1 p-5">
            <p className="text-sm text-muted-foreground">Attendance points</p>
            <p className="font-display text-3xl">{data.points}</p>
            <p className="text-xs text-muted-foreground">Only you and management can see this.</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="space-y-1 p-5">
            <p className="text-sm text-muted-foreground">Next shift</p>
            <p className="font-display text-xl">
              {data.nextShift ? `${data.nextShift.date}` : "None scheduled"}
            </p>
            <p className="text-xs text-muted-foreground">
              {data.nextShift
                ? `${data.nextShift.unit} · ${data.nextShift.window}`
                : "Enjoy the time off."}
            </p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Next two weeks</CardTitle>
          <CardDescription>
            Call off only when you truly cannot make it — it adds 1 attendance point.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {data.shifts.length === 0 && (
            <p className="text-muted-foreground">Nothing scheduled in this window.</p>
          )}
          {data.shifts.map((s) => (
            <div key={s.id} className="rounded-lg border p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <div className="font-medium">
                    {s.date} · {s.unit} · {s.shiftLabel}
                  </div>
                  <div className="text-sm text-muted-foreground">
                    {s.window} · {s.hours}h{" "}
                    {s.isOvertime && (
                      <Badge className="ml-1 bg-warning text-warning-foreground">OT</Badge>
                    )}
                  </div>
                </div>
                {s.status === "scheduled" ? (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setTarget(target === s.id ? null : s.id)}
                  >
                    {target === s.id ? "Cancel" : "Call off"}
                  </Button>
                ) : (
                  <Badge variant="secondary" className="capitalize">
                    {s.status.replace("_", " ")}
                  </Badge>
                )}
              </div>
              {target === s.id && (
                <div className="mt-3 space-y-2 border-t pt-3">
                  <Textarea
                    placeholder="Optional note for your manager"
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                  />
                  <Button
                    variant="destructive"
                    size="sm"
                    disabled={callOffMutation.isPending}
                    onClick={() => callOffMutation.mutate(s.id)}
                  >
                    Confirm call-off (1 point)
                  </Button>
                </div>
              )}
            </div>
          ))}
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Open shifts you can pick up</CardTitle>
            <CardDescription>Matched to your position and qualified units.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            {data.openShifts.length === 0 && (
              <p className="text-muted-foreground">No open shifts right now.</p>
            )}
            {data.openShifts.map((o) => (
              <div
                key={`${o.date}-${o.shift}-${o.unitId}`}
                className="flex justify-between rounded-md bg-muted/60 px-3 py-2"
              >
                <span>
                  {o.date} · {o.unitName} · {o.shift}
                </span>
                <span className="text-muted-foreground">{o.gap} open</span>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Notifications</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            {data.notifications.length === 0 && (
              <p className="text-muted-foreground">Nothing new.</p>
            )}
            {data.notifications.map((n) => (
              <div
                key={n.id}
                className="rounded-md border-l-2 border-l-primary bg-muted/40 px-3 py-2"
              >
                <div className="font-medium">{n.title}</div>
                <div className="text-muted-foreground">{n.body}</div>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
