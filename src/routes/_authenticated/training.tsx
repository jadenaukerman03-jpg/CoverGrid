import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { getTrainingBoard, setPreceptorFn, setTrainingFn } from "@/lib/ops.functions";
import { getEmployees } from "@/lib/staffing.functions";

export const Route = createFileRoute("/_authenticated/training")({
  head: () => ({
    meta: [
      { title: "Orientation & preceptors — CoverGrid" },
      {
        name: "description",
        content:
          "New hires shadow an experienced preceptor during orientation and never count as their own assignment, so units stay properly staffed while people learn.",
      },
      { property: "og:title", content: "Orientation & preceptors — CoverGrid" },
      {
        property: "og:description",
        content: "New hires shadow a preceptor and never fill a slot on their own.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: TrainingPage,
});

function TrainingPage() {
  const qc = useQueryClient();
  const load = useServerFn(getTrainingBoard);
  const loadEmployees = useServerFn(getEmployees);
  const setTraining = useServerFn(setTrainingFn);
  const setPreceptor = useServerFn(setPreceptorFn);
  const [form, setForm] = useState<{ employeeId: string; endsOn: string } | null>(null);

  const { data, isLoading, error } = useQuery({
    queryKey: ["training-board"],
    queryFn: () => load(),
  });
  const roster = useQuery({
    queryKey: ["employees"],
    queryFn: () => loadEmployees(),
    enabled: Boolean(form),
  });

  const startMut = useMutation({
    mutationFn: (v: { employeeId: string; inTraining: boolean; endsOn: string | null }) =>
      setTraining({ data: v }),
    onSuccess: () => {
      toast.success("Orientation updated.");
      setForm(null);
      void qc.invalidateQueries({ queryKey: ["training-board"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const preceptorMut = useMutation({
    mutationFn: (v: { assignmentId: string; preceptorId: string | null }) =>
      setPreceptor({ data: v }),
    onSuccess: () => {
      toast.success("Preceptor set.");
      void qc.invalidateQueries({ queryKey: ["training-board"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (error)
    return <p className="text-muted-foreground">This page is available to managers only.</p>;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl">Orientation</h1>
          <p className="text-muted-foreground">
            Someone on their first days shadows an experienced person instead of holding an
            assignment, so the unit still gets its full crew while the new hire learns the floor.
          </p>
        </div>
        <Button onClick={() => setForm({ employeeId: "", endsOn: "" })}>
          Put someone in orientation
        </Button>
      </div>

      {isLoading && <p className="text-muted-foreground">Loading…</p>}

      <div className="space-y-4">
        {(data?.trainees ?? []).length === 0 && !isLoading && (
          <p className="text-muted-foreground">Nobody is in orientation right now.</p>
        )}
        {(data?.trainees ?? []).map((t) => (
          <Card key={t.id}>
            <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-2">
              <div>
                <CardTitle className="flex items-center gap-2">
                  {t.name}
                  <Badge variant="secondary">In orientation</Badge>
                </CardTitle>
                <p className="text-sm text-muted-foreground">
                  {t.positionLabel} · {t.unit} · hired {t.hireDate}
                  {t.trainingEndsOn && ` · finishes ${t.trainingEndsOn}`}
                </p>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() =>
                  startMut.mutate({ employeeId: t.id, inTraining: false, endsOn: null })
                }
              >
                Finish orientation
              </Button>
            </CardHeader>
            <CardContent className="space-y-2">
              {t.shifts.length === 0 && (
                <p className="text-sm text-muted-foreground">No upcoming shifts scheduled.</p>
              )}
              {t.shifts.map((s) => (
                <div
                  key={s.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-lg border p-3 text-sm"
                >
                  <span>
                    {s.date} · {s.unit} · {s.shiftLabel}
                  </span>
                  <span className="flex items-center gap-2">
                    <span className="text-muted-foreground">
                      {s.preceptor ? `Shadowing ${s.preceptor}` : "No preceptor picked yet"}
                    </span>
                    <select
                      className="h-8 rounded-md border bg-background px-2 text-xs"
                      value=""
                      onChange={(e) =>
                        e.target.value &&
                        preceptorMut.mutate({ assignmentId: s.id, preceptorId: e.target.value })
                      }
                    >
                      <option value="">Pick a preceptor…</option>
                      {(data?.mentors ?? []).map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.name} — {m.positionLabel}, {m.years} yr
                        </option>
                      ))}
                    </select>
                  </span>
                </div>
              ))}
            </CardContent>
          </Card>
        ))}
      </div>

      <Dialog open={Boolean(form)} onOpenChange={(o) => !o && setForm(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Put someone in orientation</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3">
            <div className="grid gap-1">
              <Label htmlFor="t-emp">Who</Label>
              <select
                id="t-emp"
                className="h-9 rounded-md border bg-background px-2 text-sm"
                value={form?.employeeId ?? ""}
                onChange={(e) =>
                  setForm({ employeeId: e.target.value, endsOn: form?.endsOn ?? "" })
                }
              >
                <option value="">Choose a person…</option>
                {(roster.data?.employees ?? []).map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="grid gap-1">
              <Label htmlFor="t-end">Last day of orientation</Label>
              <Input
                id="t-end"
                type="date"
                value={form?.endsOn ?? ""}
                onChange={(e) =>
                  setForm({ employeeId: form?.employeeId ?? "", endsOn: e.target.value })
                }
              />
            </div>
            <Button
              disabled={!form?.employeeId || startMut.isPending}
              onClick={() =>
                form &&
                startMut.mutate({
                  employeeId: form.employeeId,
                  inTraining: true,
                  endsOn: form.endsOn || null,
                })
              }
            >
              Start orientation
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
