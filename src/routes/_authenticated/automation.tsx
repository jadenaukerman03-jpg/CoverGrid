import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import {
  generateSchedule,
  getAutomation,
  runAutomation,
  saveAutopilot,
} from "@/lib/automation.functions";
import { DAY_LABEL, ROTATION_ANCHOR, rotationLabel, formatDate } from "@/lib/facility";

export const Route = createFileRoute("/_authenticated/automation")({
  head: () => ({
    meta: [
      { title: "Automation — CoverGrid" },
      {
        name: "description",
        content:
          "Autonomous staffing: two-week rotation schedule generation, coverage monitoring, open-shift invitations and attendance sweeps.",
      },
      { property: "og:title", content: "Automation — CoverGrid" },
      {
        property: "og:description",
        content: "Hands-off scheduling, monitoring and attendance automation.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: AutomationPage,
});

function AutomationPage() {
  const qc = useQueryClient();
  const load = useServerFn(getAutomation);
  const run = useServerFn(runAutomation);
  const generate = useServerFn(generateSchedule);
  const save = useServerFn(saveAutopilot);
  const [weeks, setWeeks] = useState(4);

  const { data, isLoading, error } = useQuery({ queryKey: ["automation"], queryFn: () => load() });

  const runNow = useMutation({
    mutationFn: () => run(),
    onSuccess: (res) => {
      toast.success(res.summary);
      void qc.invalidateQueries();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const settings = data?.settings;
  const saveSettings = useMutation({
    mutationFn: (v: {
      autopilotEnabled?: boolean;
      watchOnly?: boolean;
      coverageBuffer?: number;
      autoFillDays?: number;
      seniorityWeight?: number;
      recencyWeight?: number;
    }) => save({ data: v }),
    onSuccess: () => {
      toast.success("System settings updated.");
      void qc.invalidateQueries({ queryKey: ["automation"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const gen = useMutation({
    mutationFn: () => generate({ data: { weeks } }),
    onSuccess: (res) => {
      toast.success(`Created ${res.created} shifts from the two-week rotation.`);
      void qc.invalidateQueries();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (error) {
    return (
      <p className="text-muted-foreground">Automation controls are available to managers only.</p>
    );
  }

  const todayDate = data?.today ?? "";

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl">Automation</h1>
          <p className="text-muted-foreground">
            The system runs itself: it generates the rotation, watches coverage, invites qualified
            staff to open shifts and closes out attendance.
          </p>
        </div>
        <Button onClick={() => runNow.mutate()} disabled={runNow.isPending}>
          {runNow.isPending ? "Running…" : "Run automation now"}
        </Button>
      </div>

      <Card className={settings?.autopilotEnabled ? "border-primary/40" : "border-destructive/40"}>
        <CardHeader>
          <CardTitle className="flex flex-wrap items-center gap-3 text-base">
            The system runs itself — automatic scheduling
            <Badge variant={settings?.autopilotEnabled ? "secondary" : "destructive"}>
              {settings?.autopilotEnabled ? "Running" : "Off"}
            </Badge>
            {settings?.lastRunAt && (
              <span className="text-xs font-normal text-muted-foreground">
                last cycle {new Date(settings.lastRunAt).toLocaleString()}
              </span>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            This is the second layer: the system runs on its own every hour to keep the schedule in
            shape — no one has to ask it. The scheduling helper answers questions and makes changes
            on request; this one never stops watching.
          </p>
          <div className="flex items-center gap-3">
            <Switch
              id="autopilot"
              checked={!!settings?.autopilotEnabled}
              onCheckedChange={(v) => saveSettings.mutate({ autopilotEnabled: v })}
            />
            <Label htmlFor="autopilot">Keep the system running automatically</Label>
          </div>
          <div className="rounded-md border border-dashed p-3">
            <div className="flex items-center gap-3">
              <Switch
                id="watch-only"
                checked={!!settings?.watchOnly}
                onCheckedChange={(v) => saveSettings.mutate({ watchOnly: v })}
              />
              <Label htmlFor="watch-only">Watch only — recommend, don't change anything</Label>
              {settings?.watchOnly && <Badge variant="outline">Watching</Badge>}
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              Turn this on for a week and the system will show exactly who it would have put on each
              shift, and why, without moving a single person. Leadership can read the
              recommendations below before letting it act.
            </p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <NumberSetting
              label="Call-off cushion"
              hint="Extra staff per unit / shift above the minimum ratio, so one call-off does not drop you below requirement."
              value={settings?.coverageBuffer ?? 1}
              min={0}
              max={5}
              onCommit={(n) => saveSettings.mutate({ coverageBuffer: n })}
            />
            <NumberSetting
              label="Auto-fill window (days)"
              hint="How far ahead the system fills open shifts."
              value={settings?.autoFillDays ?? 7}
              min={1}
              max={30}
              onCommit={(n) => saveSettings.mutate({ autoFillDays: n })}
            />
            <NumberSetting
              label="Seniority weight"
              hint="Higher means senior staff are protected more strongly from floating."
              value={settings?.seniorityWeight ?? 1}
              min={0}
              max={3}
              step={0.5}
              onCommit={(n) => saveSettings.mutate({ seniorityWeight: n })}
            />
            <NumberSetting
              label="Time-since-last-float weight"
              hint="Higher means a long stretch without floating moves someone up the rotation faster."
              value={settings?.recencyWeight ?? 1}
              min={0}
              max={3}
              step={0.5}
              onCommit={(n) => saveSettings.mutate({ recencyWeight: n })}
            />
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Two-week rotation</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm text-muted-foreground">
            <p>
              Weeks run <strong>Sunday – Saturday</strong>. Everyone works a repeating two-week
              pattern of 4 days per week unless their record says otherwise, with every other
              weekend on.
            </p>
            <p>
              Anchor week: {formatDate(ROTATION_ANCHOR)} · this week is rotation week{" "}
              <Badge variant="secondary">{todayDate ? rotationLabel(todayDate) : "—"}</Badge>
            </p>
            <p className="text-xs">Day keys: {DAY_LABEL.join(" · ")}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Generate schedule</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Builds shifts forward from this Sunday using each employee's rotation, skipping
              approved PTO, existing shifts and anyone who would exceed their weekly hour cap.
            </p>
            <div className="flex items-center gap-2">
              <Input
                type="number"
                min={1}
                max={12}
                value={weeks}
                onChange={(e) => setWeeks(Number(e.target.value) || 1)}
                className="w-24"
              />
              <span className="text-sm text-muted-foreground">weeks ahead</span>
            </div>
            <Button variant="secondary" onClick={() => gen.mutate()} disabled={gen.isPending}>
              {gen.isPending ? "Generating…" : "Generate rotation schedule"}
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">What each cycle does</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            <ol className="list-decimal space-y-1 pl-4">
              <li>Extends the rotation schedule six weeks out.</li>
              <li>
                Auto-fills coverage gaps — plus the call-off cushion — with the best-ranked
                qualified staff.
              </li>
              <li>Raises and resolves staffing alerts for the next 14 days.</li>
              <li>Invites qualified employees to pick up remaining open shifts.</li>
              <li>Closes out past shifts and sends attendance point notices.</li>
            </ol>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Recent runs and recommendations</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {isLoading && <p className="text-muted-foreground">Loading…</p>}
          {!isLoading && (data?.runs.length ?? 0) === 0 && (
            <p className="text-sm text-muted-foreground">No runs yet. Trigger one above.</p>
          )}
          {(data?.runs ?? []).map((r) => (
            <div key={r.id} className="rounded-md border p-3 text-sm">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <div className="font-medium">{r.summary}</div>
                  <div className="text-xs text-muted-foreground">
                    {new Date(r.created_at).toLocaleString()}
                  </div>
                </div>
                <div className="flex gap-2">
                  {r.kind === "preview" && <Badge variant="outline">watch only</Badge>}
                  <Badge variant={r.status === "ok" ? "secondary" : "destructive"}>
                    {r.status}
                  </Badge>
                </div>
              </div>
              <Recommendations details={r.details} />
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

type Recommendation = {
  date: string;
  unit: string;
  shift: string;
  position: string;
  cushion: boolean;
  wouldPick: string | null;
  why: string;
};

function Recommendations({ details }: { details: unknown }) {
  const list = (details as { recommendations?: Recommendation[] } | null)?.recommendations;
  if (!Array.isArray(list) || list.length === 0) return null;
  return (
    <details className="mt-2">
      <summary className="cursor-pointer select-none text-xs font-medium">
        What the system would have done ({list.length})
      </summary>
      <ul className="mt-2 space-y-1 text-xs text-muted-foreground">
        {list.map((r, i) => (
          <li key={i} className="rounded border p-2">
            <span className="font-medium text-foreground">
              {r.date} · {r.unit} · {r.shift} · {r.position}
              {r.cushion ? " (cushion)" : ""}
            </span>{" "}
            → {r.wouldPick ?? "nobody available"}
            <div>{r.why}</div>
          </li>
        ))}
      </ul>
    </details>
  );
}

function NumberSetting(props: {
  label: string;
  hint: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  onCommit: (n: number) => void;
}) {
  const [v, setV] = useState(String(props.value));
  return (
    <div className="space-y-1">
      <Label className="text-xs">{props.label}</Label>
      <Input
        type="number"
        min={props.min}
        max={props.max}
        step={props.step ?? 1}
        value={v}
        onChange={(e) => setV(e.target.value)}
        onBlur={() => {
          const n = Number(v);
          if (!Number.isNaN(n) && n !== props.value) props.onCommit(n);
        }}
      />
      <p className="text-xs text-muted-foreground">{props.hint}</p>
    </div>
  );
}
