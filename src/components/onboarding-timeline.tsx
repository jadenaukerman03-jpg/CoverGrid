import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { startPacketFn } from "@/lib/hr.functions";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  clearOnboardingPhaseFn,
  convertNewHireFn,
  getOnboardingTimeline,
  updateOnboardingPhaseFn,
} from "@/lib/onboarding.functions";

const STATUS_LABEL: Record<string, string> = {
  not_started: "Not started",
  in_progress: "In progress",
  blocked: "Needs attention",
  complete: "Done",
};

function when(value: string | null) {
  if (!value) return "no date yet";
  const d = new Date(value.length <= 10 ? `${value}T00:00:00Z` : value);
  if (Number.isNaN(d.getTime())) return value;
  return value.length <= 10
    ? d.toLocaleDateString(undefined, {
        month: "short",
        day: "numeric",
        year: "numeric",
        timeZone: "UTC",
      })
    : d.toLocaleString(undefined, {
        month: "short",
        day: "numeric",
        year: "numeric",
        hour: "numeric",
        minute: "2-digit",
      });
}

export function OnboardingTimelineDialog({
  hireId,
  onClose,
}: {
  hireId: string | null;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const load = useServerFn(getOnboardingTimeline);
  const startPacket = useServerFn(startPacketFn);
  const convert = useServerFn(convertNewHireFn);
  const savePhase = useServerFn(updateOnboardingPhaseFn);
  const clearPhase = useServerFn(clearOnboardingPhaseFn);
  const [editing, setEditing] = useState<string | null>(null);
  const [form, setForm] = useState<{
    status: string;
    startedAt: string;
    completedAt: string;
    dueOn: string;
    note: string;
  }>({
    status: "auto",
    startedAt: "",
    completedAt: "",
    dueOn: "",
    note: "",
  });

  const { data, isLoading, error } = useQuery({
    queryKey: ["onboarding-timeline", hireId],
    queryFn: () => load({ data: { id: hireId as string } }),
    enabled: Boolean(hireId),
  });

  const refresh = () => void qc.invalidateQueries();

  const packetMut = useMutation({
    mutationFn: () => startPacket({ data: { newHireId: hireId as string } }),
    onSuccess: (r) => {
      toast.success(r.message ?? "Packet sent.");
      refresh();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const phaseMut = useMutation({
    mutationFn: (phase: string) =>
      savePhase({
        data: {
          newHireId: hireId as string,
          phase: phase as "paperwork" | "screening" | "training" | "start",
          status:
            form.status === "auto"
              ? null
              : (form.status as "not_started" | "in_progress" | "blocked" | "complete"),
          startedAt: form.startedAt ? new Date(`${form.startedAt}T12:00:00Z`).toISOString() : null,
          completedAt: form.completedAt
            ? new Date(`${form.completedAt}T12:00:00Z`).toISOString()
            : null,
          dueOn: form.dueOn || null,
          note: form.note,
        },
      }),
    onSuccess: (r) => {
      toast.success(`Saved — ${r.summary}`);
      setEditing(null);
      refresh();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const clearMut = useMutation({
    mutationFn: (phase: string) =>
      clearPhase({
        data: {
          newHireId: hireId as string,
          phase: phase as "paperwork" | "screening" | "training" | "start",
        },
      }),
    onSuccess: () => {
      toast.success("Correction removed — this phase tracks itself again.");
      setEditing(null);
      refresh();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const rosterMut = useMutation({
    mutationFn: () => convert({ data: { id: hireId as string } }),
    onSuccess: () => {
      toast.success("Added to the roster in orientation mode.");
      refresh();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={Boolean(hireId)} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[85vh] max-w-3xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-display text-2xl">
            {data ? `${data.hire.fullName} — onboarding timeline` : "Onboarding timeline"}
          </DialogTitle>
        </DialogHeader>

        {data && (
          <div className="-mt-2">
            <Button
              size="sm"
              variant="outline"
              onClick={async () => {
                try {
                  const { downloadOnboardingPdf } = await import("@/lib/onboarding-pdf");
                  downloadOnboardingPdf({
                    hire: {
                      fullName: data.hire.fullName,
                      position: data.hire.position,
                      startDate: data.hire.startDate,
                      status: data.hire.status,
                    },
                    overall: data.overall,
                    nextAction: data.nextAction,
                    phases: data.phases,
                    corrections: data.corrections,
                  });
                  toast.success("Report downloaded.");
                } catch (e) {
                  toast.error((e as Error).message);
                }
              }}
            >
              Download PDF report
            </Button>
          </div>
        )}

        {isLoading && <p className="text-muted-foreground">Loading the timeline…</p>}
        {error && <p className="text-destructive">{(error as Error).message}</p>}

        {data && (
          <div className="space-y-6">
            <div className="rounded-lg border p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="text-sm text-muted-foreground">Where things stand</p>
                  <p className="font-display text-3xl">{data.overall}% ready</p>
                </div>
                <div className="text-right text-sm">
                  <p className="text-muted-foreground">Start date</p>
                  <p className="font-medium">
                    {data.hire.startDate ? when(data.hire.startDate) : "Not set"}
                    {data.hire.daysOut !== null && data.hire.daysOut >= 0
                      ? ` · ${data.hire.daysOut} days out`
                      : ""}
                  </p>
                </div>
              </div>
              <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-muted">
                <div className="h-full bg-primary" style={{ width: `${data.overall}%` }} />
              </div>
              <p className="mt-3 text-sm">
                <span className="font-medium">Next: </span>
                {data.nextAction}
              </p>
              {data.atRisk && (
                <p className="mt-2 text-sm text-destructive">
                  This one needs attention — the start date is close or a screening came back
                  failed.
                </p>
              )}
            </div>

            <ol className="relative space-y-5 border-l pl-6">
              {data.phases.map((p) => (
                <li key={p.key} className="relative">
                  <span
                    className={`absolute -left-[31px] top-1.5 h-3 w-3 rounded-full ring-4 ring-background ${
                      p.status === "complete"
                        ? "bg-primary"
                        : p.status === "blocked"
                          ? "bg-destructive"
                          : p.status === "in_progress"
                            ? "bg-secondary-foreground/60"
                            : "bg-muted-foreground/40"
                    }`}
                  />
                  <div className="rounded-lg border p-4">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div>
                        <p className="font-display text-lg">{p.title}</p>
                        <p className="text-sm text-muted-foreground">{p.blurb}</p>
                      </div>
                      <Badge
                        variant={
                          p.status === "complete"
                            ? "default"
                            : p.status === "blocked"
                              ? "destructive"
                              : "secondary"
                        }
                      >
                        {STATUS_LABEL[p.status]} · {p.progress}%
                      </Badge>
                    </div>

                    <p className="mt-2 text-xs text-muted-foreground">
                      Started {p.startedAt ? when(p.startedAt) : "—"} · Finished{" "}
                      {p.completedAt ? when(p.completedAt) : "—"}
                    </p>

                    {p.events.length > 0 && (
                      <ul className="mt-3 space-y-1.5 text-sm">
                        {p.events.map((e, i) => (
                          <li
                            key={`${p.key}-${i}`}
                            className="flex items-start justify-between gap-3"
                          >
                            <span className={e.done ? "" : "text-muted-foreground"}>
                              {e.done ? "✓" : "○"} {e.label}
                            </span>
                            <span className="shrink-0 text-xs text-muted-foreground">
                              {when(e.at)}
                            </span>
                          </li>
                        ))}
                      </ul>
                    )}

                    <p className="mt-3 rounded-md bg-muted/50 p-3 text-sm">{p.nextStep}</p>

                    <div className="mt-3 rounded-md border p-3">
                      {editing === p.key ? (
                        <div className="space-y-3">
                          <div className="grid gap-3 sm:grid-cols-2">
                            <div className="space-y-1">
                              <Label>Status</Label>
                              <Select
                                value={form.status}
                                onValueChange={(v) => setForm((f) => ({ ...f, status: v }))}
                              >
                                <SelectTrigger>
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="auto">Let it track itself</SelectItem>
                                  <SelectItem value="not_started">Not started</SelectItem>
                                  <SelectItem value="in_progress">In progress</SelectItem>
                                  <SelectItem value="blocked">Needs attention</SelectItem>
                                  <SelectItem value="complete">Done</SelectItem>
                                </SelectContent>
                              </Select>
                            </div>
                            <div className="space-y-1">
                              <Label>Due by</Label>
                              <Input
                                type="date"
                                value={form.dueOn}
                                onChange={(e) => setForm((f) => ({ ...f, dueOn: e.target.value }))}
                              />
                            </div>
                            <div className="space-y-1">
                              <Label>Started on</Label>
                              <Input
                                type="date"
                                value={form.startedAt}
                                onChange={(e) =>
                                  setForm((f) => ({ ...f, startedAt: e.target.value }))
                                }
                              />
                            </div>
                            <div className="space-y-1">
                              <Label>Finished on</Label>
                              <Input
                                type="date"
                                value={form.completedAt}
                                onChange={(e) =>
                                  setForm((f) => ({ ...f, completedAt: e.target.value }))
                                }
                              />
                            </div>
                          </div>
                          <div className="space-y-1">
                            <Label>Why the correction</Label>
                            <Textarea
                              rows={2}
                              placeholder="Signed packet came in on paper, dated the 3rd."
                              value={form.note}
                              onChange={(e) => setForm((f) => ({ ...f, note: e.target.value }))}
                            />
                          </div>
                          <div className="flex flex-wrap gap-2">
                            <Button
                              size="sm"
                              onClick={() => phaseMut.mutate(p.key)}
                              disabled={phaseMut.isPending}
                            >
                              {phaseMut.isPending ? "Saving…" : "Save correction"}
                            </Button>
                            <Button size="sm" variant="ghost" onClick={() => setEditing(null)}>
                              Cancel
                            </Button>
                            {p.corrected && (
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => clearMut.mutate(p.key)}
                                disabled={clearMut.isPending}
                              >
                                Remove correction
                              </Button>
                            )}
                          </div>
                        </div>
                      ) : (
                        <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
                          <span className="text-muted-foreground">
                            Due {p.dueOn ? when(p.dueOn) : "—"}
                            {p.overdue ? " · past due" : ""}
                            {p.corrected
                              ? ` · corrected by ${p.correctedBy || "a manager"}${p.note ? `: ${p.note}` : ""}`
                              : ""}
                          </span>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => {
                              setForm({
                                status: p.corrected && p.status ? p.status : "auto",
                                startedAt: p.startedAt ? p.startedAt.slice(0, 10) : "",
                                completedAt: p.completedAt ? p.completedAt.slice(0, 10) : "",
                                dueOn: p.dueOn ?? "",
                                note: p.note ?? "",
                              });
                              setEditing(p.key);
                            }}
                          >
                            Correct this phase
                          </Button>
                        </div>
                      )}
                    </div>

                    {p.action && (
                      <div className="mt-3">
                        {p.action.kind === "start_packet" && (
                          <Button
                            size="sm"
                            onClick={() => packetMut.mutate()}
                            disabled={packetMut.isPending}
                          >
                            {packetMut.isPending ? "Sending…" : p.action.label}
                          </Button>
                        )}
                        {p.action.kind === "add_to_roster" && (
                          <Button
                            size="sm"
                            onClick={() => rosterMut.mutate()}
                            disabled={rosterMut.isPending}
                          >
                            {rosterMut.isPending ? "Working…" : p.action.label}
                          </Button>
                        )}
                        {p.action.kind === "open_paperwork" && (
                          <Button asChild size="sm" variant="outline">
                            <Link to="/paperwork">{p.action.label}</Link>
                          </Button>
                        )}
                        {p.action.kind === "open_training" && (
                          <Button asChild size="sm" variant="outline">
                            <Link to="/training">{p.action.label}</Link>
                          </Button>
                        )}
                        {p.action.kind === "set_start_date" && (
                          <p className="text-sm text-muted-foreground">
                            Use Edit on the new hire card to set the start date.
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                </li>
              ))}
            </ol>

            {data.corrections.length > 0 && (
              <div className="rounded-lg border p-4">
                <p className="font-display text-lg">Correction history</p>
                <p className="text-sm text-muted-foreground">
                  Every hand change to this person's onboarding, newest first.
                </p>
                <ul className="mt-3 space-y-2 text-sm">
                  {data.corrections.map((c) => (
                    <li key={c.id} className="rounded-md border p-2">
                      <p className="font-medium">{c.summary}</p>
                      {c.note && <p className="text-muted-foreground">“{c.note}”</p>}
                      <p className="text-xs text-muted-foreground">
                        {c.actor} · {when(c.at)}
                      </p>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
