import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";

import { EmployeeProfileDialog } from "@/components/employee-profile-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  floatAssignment,
  getFacilityConfig,
  getFloatHistory,
  getFloatTracker,
  getSchedule,
  setAssignmentNote,
} from "@/lib/staffing.functions";

export const Route = createFileRoute("/_authenticated/schedule")({
  head: () => ({
    meta: [
      { title: "Schedule board — CoverGrid" },
      {
        name: "description",
        content:
          "A shift-by-shift, unit-by-unit board: open staff profiles, add shift notes, drag people between units and see whose turn it is to float.",
      },
      { property: "og:title", content: "Schedule board — CoverGrid" },
      {
        property: "og:description",
        content: "Drag-and-drop unit staffing with a built-in float rotation tracker.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: SchedulePage,
});

const iso = (d: Date) => d.toISOString().slice(0, 10);
const SHIFTS = [
  { key: "first", label: "1st shift", hint: "Days" },
  { key: "second", label: "2nd shift", hint: "Evenings" },
  { key: "third", label: "3rd shift", hint: "Nights" },
] as const;

const weekday = (date: string) =>
  new Date(`${date}T12:00:00Z`).toLocaleDateString(undefined, {
    weekday: "long",
    month: "short",
    day: "numeric",
  });

type Entry = {
  id: string;
  date: string;
  shift: string;
  shiftLabel: string;
  window: string;
  unit: string;
  unitId: string;
  position: string;
  employeeId: string | null;
  employee: string | null;
  status: string;
  isOvertime: boolean;
  isFloat: boolean;
  homeUnit: string | null;
  note: string | null;
  floatReason?: string | null;
  fillReason?: string | null;
};

const FLOAT_REASONS = [
  { value: "coverage", label: "Coverage gap on that unit" },
  { value: "call_off", label: "Backfilling a call-off" },
  { value: "census", label: "Census / acuity balance" },
  { value: "rotation", label: "Their turn in the rotation" },
  { value: "request", label: "They asked to move" },
  { value: "manual", label: "Manager decision" },
] as const;

function SchedulePage() {
  const qc = useQueryClient();
  const load = useServerFn(getSchedule);
  const loadConfig = useServerFn(getFacilityConfig);
  const loadFloats = useServerFn(getFloatTracker);
  const doFloat = useServerFn(floatAssignment);
  const saveNote = useServerFn(setAssignmentNote);

  const [from, setFrom] = useState(iso(new Date()));
  const [days, setDays] = useState(3);
  const [profileId, setProfileId] = useState<string | null>(null);
  const [noteFor, setNoteFor] = useState<string | null>(null);
  const [noteText, setNoteText] = useState("");
  const [dragOver, setDragOver] = useState<string | null>(null);
  const [floatReason, setFloatReason] = useState<string>("coverage");
  const [compact, setCompact] = useState(false);

  const loadHistory = useServerFn(getFloatHistory);
  const to = iso(new Date(new Date(`${from}T00:00:00Z`).getTime() + (days - 1) * 864e5));

  const { data: config } = useQuery({ queryKey: ["facility-config"], queryFn: () => loadConfig() });
  const { data, isLoading } = useQuery({
    queryKey: ["schedule", from, to],
    queryFn: () => load({ data: { from, to } }),
  });
  const floats = useQuery({ queryKey: ["float-tracker"], queryFn: () => loadFloats({ data: {} }) });
  const history = useQuery({
    queryKey: ["float-history"],
    queryFn: () => loadHistory({ data: { limit: 20 } }),
  });

  const isManager = Boolean(data?.isManager);
  const units = config?.units ?? [];

  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ["schedule"] });
    void qc.invalidateQueries({ queryKey: ["float-tracker"] });
    void qc.invalidateQueries({ queryKey: ["float-history"] });
    void qc.invalidateQueries({ queryKey: ["ppd-week"] });
  };

  const move = useMutation({
    mutationFn: (v: { assignmentId: string; toUnitId: string; reason?: string }) =>
      doFloat({
        data: {
          assignmentId: v.assignmentId,
          toUnitId: v.toUnitId,
          reason: (v.reason ?? "coverage") as "coverage",
        },
      }),
    onSuccess: (res) => {
      refresh();
      toast.success(res.returnedHome ? "Moved back to their home unit" : `Floated to ${res.to}`, {
        description: res.rationale || undefined,
        duration: 8000,
      });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const note = useMutation({
    mutationFn: (v: { assignmentId: string; note: string }) => saveNote({ data: v }),
    onSuccess: () => {
      setNoteFor(null);
      setNoteText("");
      refresh();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const entries = (data?.entries ?? []) as Entry[];
  const dates = Array.from(new Set(entries.map((e) => e.date))).sort();
  const hoursOf = new Map((data?.weeklyHours ?? []).map((h) => [h.employeeId, h.hours]));
  const otThreshold = data?.overtimeThreshold ?? 40;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl">Schedule board</h1>
          <p className="text-muted-foreground">
            {isManager
              ? "Each day is split by shift, then by unit. Drag a person onto another unit to float them."
              : "Your assigned shifts, day by day."}
          </p>
        </div>
        <div className="flex items-end gap-3">
          <div>
            <label className="text-xs text-muted-foreground" htmlFor="from">
              Start
            </label>
            <Input id="from" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          </div>
          <div>
            <label className="text-xs text-muted-foreground" htmlFor="days">
              Days
            </label>
            <Input
              id="days"
              type="number"
              min={1}
              max={14}
              value={days}
              onChange={(e) => setDays(Math.max(1, Math.min(14, Number(e.target.value) || 3)))}
            />
          </div>
          {isManager && (
            <div>
              <label className="text-xs text-muted-foreground" htmlFor="float-reason">
                Reason for the next float
              </label>
              <select
                id="float-reason"
                value={floatReason}
                onChange={(e) => setFloatReason(e.target.value)}
                className="h-9 w-56 rounded-md border border-input bg-background px-3 text-sm"
              >
                {FLOAT_REASONS.map((r) => (
                  <option key={r.value} value={r.value}>
                    {r.label}
                  </option>
                ))}
              </select>
            </div>
          )}
          <Button type="button" variant="outline" size="sm" onClick={() => setCompact((c) => !c)}>
            {compact ? "Roomy view" : "Compact view"}
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap gap-4 text-xs text-muted-foreground">
        <Legend className="bg-primary/15 border-primary/40" text="Scheduled" />
        <Legend
          className="bg-amber-400/20 border-amber-500/50"
          text="Floated in from another unit"
        />
        <Legend className="bg-destructive/15 border-destructive/40" text="Called off / open" />
        <Legend className="bg-muted border-border" text="Open shift — nobody assigned" />
      </div>

      {isLoading && <p className="text-muted-foreground">Loading schedule…</p>}

      {dates.map((date) => (
        <Card key={date}>
          <CardHeader className="pb-3">
            <CardTitle className="text-lg">{weekday(date)}</CardTitle>
            <CardDescription>
              {entries.filter((e) => e.date === date && e.employeeId).length} staff scheduled ·{" "}
              {entries.filter((e) => e.date === date && !e.employeeId).length} open
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {SHIFTS.map((s) => {
              const shiftEntries = entries.filter((e) => e.date === date && e.shift === s.key);
              if (!shiftEntries.length) return null;
              const unitIds = isManager
                ? units.map((u) => u.id)
                : Array.from(new Set(shiftEntries.map((e) => e.unitId)));
              return (
                <div key={s.key} className="space-y-2">
                  <div className="flex items-baseline gap-2">
                    <h3 className="font-display text-lg">{s.label}</h3>
                    <span className="text-xs text-muted-foreground">
                      {s.hint} · {shiftEntries[0]?.window}
                    </span>
                  </div>
                  <div className="grid gap-3 md:grid-cols-3">
                    {unitIds.map((unitId) => {
                      const unitName =
                        units.find((u) => u.id === unitId)?.name ??
                        shiftEntries.find((e) => e.unitId === unitId)?.unit ??
                        "Unit";
                      const cell = shiftEntries.filter((e) => e.unitId === unitId);
                      const key = `${date}|${s.key}|${unitId}`;
                      return (
                        <div
                          key={unitId}
                          onDragOver={(ev) => {
                            if (!isManager) return;
                            ev.preventDefault();
                            setDragOver(key);
                          }}
                          onDragLeave={() => setDragOver((k) => (k === key ? null : k))}
                          onDrop={(ev) => {
                            if (!isManager) return;
                            ev.preventDefault();
                            setDragOver(null);
                            const id = ev.dataTransfer.getData("text/assignment");
                            const fromUnit = ev.dataTransfer.getData("text/unit");
                            if (id && fromUnit !== unitId)
                              move.mutate({
                                assignmentId: id,
                                toUnitId: unitId,
                                reason: floatReason,
                              });
                          }}
                          className={`rounded-lg border p-3 transition-colors ${dragOver === key ? "border-primary bg-primary/5" : "bg-card"}`}
                        >
                          <div className="mb-2 flex items-center justify-between">
                            <p className="font-medium">{unitName}</p>
                            <span className="text-xs text-muted-foreground">
                              {cell.filter((e) => e.employeeId && e.status !== "called_off").length}{" "}
                              staffed
                            </span>
                          </div>
                          <div className="space-y-2">
                            {cell.length === 0 && (
                              <p className="text-xs text-muted-foreground">
                                Nobody scheduled here.
                              </p>
                            )}
                            {cell.map((e) => (
                              <div
                                key={e.id}
                                draggable={isManager && Boolean(e.employeeId)}
                                onDragStart={(ev) => {
                                  ev.dataTransfer.setData("text/assignment", e.id);
                                  ev.dataTransfer.setData("text/unit", e.unitId);
                                }}
                                className={`rounded-md border text-sm ${compact ? "px-2 py-1" : "px-2.5 py-2"} ${
                                  !e.employeeId
                                    ? "border-border bg-muted"
                                    : e.status === "called_off" || e.status === "open"
                                      ? "border-destructive/40 bg-destructive/10"
                                      : e.isFloat
                                        ? "border-amber-500/50 bg-amber-400/15"
                                        : "border-primary/40 bg-primary/10"
                                } ${isManager && e.employeeId ? "cursor-grab active:cursor-grabbing" : ""}`}
                              >
                                <div className="flex items-start justify-between gap-2">
                                  {e.employeeId ? (
                                    <button
                                      type="button"
                                      className="text-left font-medium underline-offset-2 hover:underline"
                                      onClick={() => setProfileId(e.employeeId)}
                                    >
                                      {e.employee}
                                    </button>
                                  ) : (
                                    <span className="font-medium text-muted-foreground">
                                      Open shift
                                    </span>
                                  )}
                                  <div className="flex shrink-0 gap-1">
                                    {isManager && e.employeeId && hoursOf.has(e.employeeId) && (
                                      <Badge
                                        variant={
                                          (hoursOf.get(e.employeeId) ?? 0) > otThreshold
                                            ? "destructive"
                                            : "outline"
                                        }
                                        title={`${hoursOf.get(e.employeeId)} hours booked this week (overtime starts at ${otThreshold})`}
                                      >
                                        {hoursOf.get(e.employeeId)}h
                                      </Badge>
                                    )}
                                    {e.isOvertime && <Badge variant="outline">OT</Badge>}
                                    {e.isFloat && <Badge variant="secondary">Float</Badge>}
                                  </div>
                                </div>
                                <p className="text-xs text-muted-foreground">
                                  {e.position === "cna"
                                    ? "CNA"
                                    : e.position === "qma"
                                      ? "QMA"
                                      : "Nurse"}
                                  {e.isFloat && e.homeUnit ? ` · home: ${e.homeUnit}` : ""}
                                  {e.status !== "scheduled"
                                    ? ` · ${e.status.replace("_", " ")}`
                                    : ""}
                                </p>

                                {!compact && e.isFloat && e.floatReason && (
                                  <p className="mt-1 rounded bg-amber-400/15 px-2 py-1 text-xs">
                                    <span className="font-medium">Why floated: </span>
                                    {e.floatReason}
                                  </p>
                                )}
                                {!compact && e.fillReason && (
                                  <details className="mt-1 rounded bg-background/60 px-2 py-1 text-xs">
                                    <summary className="cursor-pointer select-none font-medium">
                                      Why this person?
                                    </summary>
                                    <p className="mt-1 text-muted-foreground">{e.fillReason}</p>
                                  </details>
                                )}

                                {!compact && e.note && (
                                  <p className="mt-1 rounded bg-background/60 px-2 py-1 text-xs italic">
                                    {e.note}
                                  </p>
                                )}
                                {!compact &&
                                  isManager &&
                                  (noteFor === e.id ? (
                                    <div className="mt-2 space-y-1">
                                      <Textarea
                                        rows={2}
                                        value={noteText}
                                        onChange={(ev) => setNoteText(ev.target.value)}
                                        placeholder="Note for this shift…"
                                      />
                                      <div className="flex gap-1">
                                        <Button
                                          size="sm"
                                          onClick={() =>
                                            note.mutate({ assignmentId: e.id, note: noteText })
                                          }
                                        >
                                          Save
                                        </Button>
                                        <Button
                                          size="sm"
                                          variant="ghost"
                                          onClick={() => setNoteFor(null)}
                                        >
                                          Cancel
                                        </Button>
                                      </div>
                                    </div>
                                  ) : (
                                    <button
                                      type="button"
                                      className="mt-1 text-xs text-muted-foreground underline-offset-2 hover:underline"
                                      onClick={() => {
                                        setNoteFor(e.id);
                                        setNoteText(e.note ?? "");
                                      }}
                                    >
                                      {e.note ? "Edit note" : "Add note"}
                                    </button>
                                  ))}
                              </div>
                            ))}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </CardContent>
        </Card>
      ))}

      <Card>
        <CardHeader>
          <CardTitle>Float tracker</CardTitle>
          <CardDescription>
            Order is scored: fewest floats first, then longest since their last float, and seniority
            protects longer-serving staff. Nobody wants to float, so the person with the lightest
            recent load comes up first.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <p className="mb-2 text-sm font-medium">Next up to float</p>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {(floats.data?.nextUp ?? []).map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => setProfileId(p.id)}
                  className="rounded-md border bg-card px-3 py-2 text-left text-sm hover:border-primary"
                >
                  <span className="font-medium">{p.name}</span>
                  <p className="text-xs text-muted-foreground">
                    {p.homeUnit} · {p.shiftLabel} · {p.positionLabel} · floated {p.floatCount}× ·{" "}
                    {p.seniorityYears} yr{p.seniorityYears === 1 ? "" : "s"} of service
                    {p.lastFloatedOn ? ` · last ${p.lastFloatedOn}` : " · never floated"}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground/80">{p.why}</p>
                </button>
              ))}
            </div>
          </div>
          <div>
            <p className="mb-2 text-sm font-medium">Full rotation order</p>
            <div className="max-h-72 space-y-1 overflow-y-auto pr-1">
              {(floats.data?.rows ?? []).map((p, i) => (
                <div
                  key={p.id}
                  className="flex items-center justify-between gap-3 rounded-md border px-3 py-1.5 text-sm"
                >
                  <button
                    type="button"
                    className="text-left hover:underline"
                    onClick={() => setProfileId(p.id)}
                  >
                    <span className="mr-2 text-xs text-muted-foreground">{i + 1}.</span>
                    {p.name}
                  </button>
                  <span className="text-right text-xs text-muted-foreground">
                    {p.homeUnit} · {p.positionLabel} · {p.floatCount} floats · {p.seniorityYears}{" "}
                    yrs ·{" "}
                    {p.daysSinceLastFloat === null
                      ? "never floated"
                      : `${p.daysSinceLastFloat}d since last`}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Float log</CardTitle>
          <CardDescription>Every move between units, with the reason it happened.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {(history.data ?? []).length === 0 && (
            <p className="text-sm text-muted-foreground">No floats recorded yet.</p>
          )}
          {(history.data ?? []).map((f) => (
            <div key={f.id} className="rounded-md border px-3 py-2 text-sm">
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  className="font-medium hover:underline"
                  onClick={() => setProfileId(f.employeeId)}
                >
                  {f.name}
                </button>
                <span className="text-muted-foreground">
                  {f.from} → {f.to} · {f.date} · {f.shiftLabel}
                </span>
                <Badge variant={f.returnedHome ? "outline" : "secondary"}>{f.reasonLabel}</Badge>
                {f.automatic && <Badge variant="outline">auto</Badge>}
              </div>
              <p className="mt-1 text-xs text-muted-foreground">{f.rationale}</p>
              <p className="text-xs text-muted-foreground/70">
                Recorded by {f.decidedBy} · {new Date(f.createdAt).toLocaleString()}
              </p>
            </div>
          ))}
        </CardContent>
      </Card>

      <EmployeeProfileDialog
        employeeId={profileId}
        onOpenChange={(open) => !open && setProfileId(null)}
      />
    </div>
  );
}

function Legend({ className, text }: { className: string; text: string }) {
  return (
    <span className="flex items-center gap-2">
      <span className={`inline-block h-3 w-3 rounded border ${className}`} />
      {text}
    </span>
  );
}
