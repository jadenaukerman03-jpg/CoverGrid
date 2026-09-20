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
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  acknowledgeIncidentFn,
  getIntegrations,
  ingestIntegrationFn,
  runIntegrationSweepFn,
  saveIntegrationFn,
  testIntegrationFn,
} from "@/lib/integrations.functions";

export const Route = createFileRoute("/_authenticated/integrations")({
  head: () => ({
    meta: [
      { title: "Integrations — CoverGrid" },
      {
        name: "description",
        content:
          "Live health for payroll, time clock, HR, credentialing, EMR census and agency portal feeds, with automatic fallback so the schedule keeps running when one goes down.",
      },
      { property: "og:title", content: "Integrations — CoverGrid" },
      {
        property: "og:description",
        content: "Every outside system, its health, and what happens when it fails.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: IntegrationsPage,
});

const STATUS_STYLE: Record<
  string,
  { label: string; variant: "secondary" | "destructive" | "outline" }
> = {
  healthy: { label: "Reporting in", variant: "secondary" },
  degraded: { label: "Running late", variant: "outline" },
  failing: { label: "Down", variant: "destructive" },
  disabled: { label: "Off", variant: "outline" },
  never_synced: { label: "Never connected", variant: "outline" },
};

const FALLBACK_LABEL: Record<string, string> = {
  last_known_good: "Keep running on the last good data",
  manual: "Hand it to a manager",
  halt: "Hold changes that depend on it",
};

function IntegrationsPage() {
  const qc = useQueryClient();
  const load = useServerFn(getIntegrations);
  const save = useServerFn(saveIntegrationFn);
  const test = useServerFn(testIntegrationFn);
  const ingest = useServerFn(ingestIntegrationFn);
  const ack = useServerFn(acknowledgeIncidentFn);
  const sweep = useServerFn(runIntegrationSweepFn);

  const { data, isLoading, error } = useQuery({
    queryKey: ["integrations"],
    queryFn: () => load(),
  });
  const [openSlug, setOpenSlug] = useState<string | null>(null);
  const [paste, setPaste] = useState<Record<string, string>>({});

  const refresh = () => void qc.invalidateQueries({ queryKey: ["integrations"] });

  const saveOne = useMutation({
    mutationFn: (v: {
      id?: string;
      isEnabled?: boolean;
      isRequired?: boolean;
      expectedEveryMinutes?: number;
      staleAfterMinutes?: number;
      failureThreshold?: number;
      fallbackMode?: "last_known_good" | "manual" | "halt";
    }) => save({ data: v }),
    onSuccess: () => {
      toast.success("Connection updated.");
      refresh();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const testOne = useMutation({
    mutationFn: (slug: string) => test({ data: { slug } }),
    onSuccess: (r) => {
      if (r.ok) toast.success(r.message);
      else toast.warning(r.message);
      refresh();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const pushRows = useMutation({
    mutationFn: (v: { slug: string; csv: string }) => ingest({ data: v }),
    onSuccess: (r) => {
      if (r.ok) toast.success(`${r.connection}: ${r.message}`);
      else toast.error(`${r.connection}: ${r.message}`);
      refresh();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const ackOne = useMutation({
    mutationFn: (id: string) => ack({ data: { id } }),
    onSuccess: () => {
      toast.success("Incident closed.");
      refresh();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const runSweep = useMutation({
    mutationFn: () => sweep(),
    onSuccess: (r) => {
      toast.success(r.summary);
      refresh();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (error)
    return <p className="text-muted-foreground">Integrations are available to managers only.</p>;

  const summary = data?.summary;
  const openIncidents = (data?.incidents ?? []).filter((i) => i.status === "open");

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <h1 className="font-display text-3xl">Integrations</h1>
          <p className="text-muted-foreground">
            Payroll, time clocks, HR, credentialing, the EMR census and agency portals all report in
            here. If one stops, the schedule keeps running on the last good data instead of
            collapsing.
          </p>
        </div>
        <Button onClick={() => runSweep.mutate()} disabled={runSweep.isPending}>
          {runSweep.isPending ? "Checking…" : "Check every system now"}
        </Button>
      </div>

      <Card
        className={
          summary?.posture === "degraded"
            ? "border-destructive/50"
            : summary?.posture === "watch"
              ? "border-primary/40"
              : undefined
        }
      >
        <CardHeader>
          <CardTitle className="text-base">
            {summary?.headline ?? "Checking connections…"}
          </CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <Stat label="Connected" value={summary?.enabled ?? 0} />
          <Stat label="Reporting in" value={summary?.healthy ?? 0} />
          <Stat label="Running late" value={summary?.degraded ?? 0} />
          <Stat label="Down" value={summary?.failing ?? 0} />
          <Stat label="Open incidents" value={summary?.openIncidents ?? 0} />
        </CardContent>
      </Card>

      {openIncidents.length > 0 && (
        <Card className="border-destructive/50">
          <CardHeader>
            <CardTitle className="text-base">What is broken right now</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {openIncidents.map((i) => (
              <div key={i.id} className="rounded-md border p-3 text-sm">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="min-w-0">
                    <div className="font-medium">{i.connectionName}</div>
                    <div className="text-muted-foreground">{i.summary}</div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant={i.severity === "critical" ? "destructive" : "outline"}>
                      {i.severity}
                    </Badge>
                    <Button size="sm" variant="outline" onClick={() => ackOne.mutate(i.id)}>
                      Mark handled
                    </Button>
                  </div>
                </div>
                <p className="mt-2 text-xs text-muted-foreground">
                  {i.impact} <strong className="text-foreground">{i.fallbackUsed}</strong>
                </p>
                <p className="text-xs text-muted-foreground">
                  Started {new Date(i.openedAt).toLocaleString()}
                </p>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {isLoading && <p className="text-muted-foreground">Loading…</p>}

      <div className="grid gap-4 lg:grid-cols-2">
        {(data?.rows ?? []).map((r) => {
          const style = STATUS_STYLE[r.status] ?? STATUS_STYLE["never_synced"]!;
          const isOpen = openSlug === r.slug;
          return (
            <Card
              key={r.id}
              className={
                r.status === "failing" && r.isEnabled ? "border-destructive/50" : undefined
              }
            >
              <CardHeader className="pb-3">
                <CardTitle className="flex flex-wrap items-center justify-between gap-2 text-base">
                  <span className="min-w-0 truncate">{r.name}</span>
                  <Badge variant={style.variant}>{style.label}</Badge>
                </CardTitle>
                <p className="text-xs text-muted-foreground">
                  {r.kindLabel} · {r.vendor || "no vendor set"} · {r.direction}
                </p>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                <p className="text-muted-foreground">{r.reason}</p>
                <div className="grid grid-cols-2 gap-2 text-xs text-muted-foreground">
                  <div>
                    Last good data: <span className="text-foreground">{r.ageLabel}</span>
                  </div>
                  <div>
                    Reliability:{" "}
                    <span className="text-foreground">
                      {r.reliability === null ? "—" : `${r.reliability}%`}
                    </span>
                  </div>
                  <div>
                    Expected every:{" "}
                    <span className="text-foreground">{minutes(r.expectedEveryMinutes)}</span>
                  </div>
                  <div>
                    Counts as down after:{" "}
                    <span className="text-foreground">{minutes(r.staleAfterMinutes)}</span>
                  </div>
                </div>

                <div className="rounded-md border border-dashed p-2 text-xs">
                  <span className="font-medium">If it fails: </span>
                  {r.fallbackSentence}
                  {r.snapshot && (
                    <div className="mt-1 text-muted-foreground">
                      Saved fallback: {r.snapshot.rows} row{r.snapshot.rows === 1 ? "" : "s"} from{" "}
                      {new Date(r.snapshot.capturedAt).toLocaleString()}
                    </div>
                  )}
                </div>

                <div className="flex flex-wrap items-center gap-3">
                  <div className="flex items-center gap-2">
                    <Switch
                      id={`on-${r.id}`}
                      checked={r.isEnabled}
                      onCheckedChange={(v) => saveOne.mutate({ id: r.id, isEnabled: v })}
                    />
                    <Label htmlFor={`on-${r.id}`} className="text-xs">
                      Connected
                    </Label>
                  </div>
                  <div className="flex items-center gap-2">
                    <Switch
                      id={`req-${r.id}`}
                      checked={r.isRequired}
                      onCheckedChange={(v) => saveOne.mutate({ id: r.id, isRequired: v })}
                    />
                    <Label htmlFor={`req-${r.id}`} className="text-xs">
                      Schedule depends on it
                    </Label>
                  </div>
                  <Button size="sm" variant="outline" onClick={() => testOne.mutate(r.slug)}>
                    Test
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setOpenSlug(isOpen ? null : r.slug)}
                  >
                    {isOpen ? "Hide details" : "Details & manual feed"}
                  </Button>
                </div>

                {isOpen && (
                  <div className="space-y-4 rounded-md border p-3">
                    <div className="space-y-1">
                      <Label className="text-xs">Endpoint the outside system posts to</Label>
                      <code className="block overflow-x-auto rounded bg-muted p-2 text-xs">
                        POST {r.endpointPath} · header apikey
                      </code>
                    </div>

                    <div className="grid gap-3 sm:grid-cols-3">
                      <NumberField
                        label="Expected every (min)"
                        value={r.expectedEveryMinutes}
                        onCommit={(n) => saveOne.mutate({ id: r.id, expectedEveryMinutes: n })}
                      />
                      <NumberField
                        label="Down after (min)"
                        value={r.staleAfterMinutes}
                        onCommit={(n) => saveOne.mutate({ id: r.id, staleAfterMinutes: n })}
                      />
                      <NumberField
                        label="Failures allowed"
                        value={r.failureThreshold}
                        onCommit={(n) => saveOne.mutate({ id: r.id, failureThreshold: n })}
                      />
                    </div>

                    <div className="space-y-1">
                      <Label className="text-xs">When this feed fails</Label>
                      <div className="flex flex-wrap gap-2">
                        {(["last_known_good", "manual", "halt"] as const).map((mode) => (
                          <Button
                            key={mode}
                            size="sm"
                            variant={r.fallbackMode === mode ? "default" : "outline"}
                            onClick={() => saveOne.mutate({ id: r.id, fallbackMode: mode })}
                          >
                            {FALLBACK_LABEL[mode]}
                          </Button>
                        ))}
                      </div>
                    </div>

                    <div className="space-y-1">
                      <Label className="text-xs">Feed it by hand (paste a CSV export)</Label>
                      <Textarea
                        rows={4}
                        placeholder={placeholderFor(r.kind)}
                        value={paste[r.slug] ?? ""}
                        onChange={(e) => setPaste((p) => ({ ...p, [r.slug]: e.target.value }))}
                      />
                      <Button
                        size="sm"
                        disabled={!(paste[r.slug] ?? "").trim() || pushRows.isPending}
                        onClick={() => pushRows.mutate({ slug: r.slug, csv: paste[r.slug] ?? "" })}
                      >
                        {pushRows.isPending ? "Importing…" : "Import now"}
                      </Button>
                    </div>

                    <div className="space-y-1">
                      <Label className="text-xs">Recent activity</Label>
                      {r.recent.length === 0 && (
                        <p className="text-xs text-muted-foreground">Nothing yet.</p>
                      )}
                      <ul className="space-y-1 text-xs text-muted-foreground">
                        {r.recent.map((s) => (
                          <li key={s.id} className="rounded border p-2">
                            <span
                              className={
                                s.status === "ok"
                                  ? "text-foreground"
                                  : s.status === "partial"
                                    ? "text-primary"
                                    : "text-destructive"
                              }
                            >
                              {s.status}
                            </span>{" "}
                            · {s.trigger} · {s.rowsApplied}/{s.rowsReceived} rows ·{" "}
                            {new Date(s.createdAt).toLocaleString()}
                            <div>{s.message}</div>
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Why the schedule cannot collapse</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-muted-foreground">
          <p>
            Every feed above has a limit for how long it can stay quiet. Past that limit the system
            opens an incident, tells managers what is affected, and switches to the fallback you
            picked — it never simply stops scheduling.
          </p>
          <ul className="list-disc space-y-1 pl-5">
            {(data?.kinds ?? []).map((k) => (
              <li key={k.id}>
                <strong className="text-foreground">{k.label}:</strong> {k.fallback}
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}

function minutes(n: number) {
  if (n < 60) return `${n} min`;
  if (n < 2880) return `${Math.round(n / 60)} hr`;
  return `${Math.round(n / 1440)} days`;
}

function placeholderFor(kind: string) {
  switch (kind) {
    case "emr":
      return "date,unit,census\n2026-08-18,Birch,41";
    case "timeclock":
      return "clockInNumber,date,clockIn,clockOut\n1042,2026-08-18,2026-08-18T06:58,2026-08-18T19:04";
    case "hris":
      return "payrollId,name,status,hourlyRate,unit\nA1042,Sarah Nolan,active,31.5,Cedar";
    case "credentialing":
      return "name,kind,licenseNumber,status,expires\nSarah Nolan,Nursing license,RN123456,active,2027-04-30";
    case "agency":
      return "agency,name,position,phone\nMidwest Staffing,Dana Ruiz,nurse,3175550123";
    default:
      return "payrollId,status\nA1042,accepted";
  }
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-md border p-3">
      <div className="text-2xl font-semibold">{value}</div>
      <div className="text-xs text-muted-foreground">{label}</div>
    </div>
  );
}

function NumberField({
  label,
  value,
  onCommit,
}: {
  label: string;
  value: number;
  onCommit: (n: number) => void;
}) {
  const [v, setV] = useState(String(value));
  return (
    <div className="space-y-1">
      <Label className="text-xs">{label}</Label>
      <Input
        type="number"
        value={v}
        onChange={(e) => setV(e.target.value)}
        onBlur={() => {
          const n = Number(v);
          if (!Number.isNaN(n) && n !== value) onCommit(n);
        }}
      />
    </div>
  );
}
