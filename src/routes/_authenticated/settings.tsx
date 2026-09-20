import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { BrandColorsCard } from "@/components/brand-colors-card";
import { getAutomation, runAutomation, saveAutopilot } from "@/lib/automation.functions";
import { setFloatOptinFn } from "@/lib/ops.functions";
import { getOutbox, setSmsOptinFn, updateMessagingSettingsFn } from "@/lib/platform.functions";
import { getFacilityConfig } from "@/lib/staffing.functions";

export const Route = createFileRoute("/_authenticated/settings")({
  head: () => ({
    meta: [
      { title: "Settings — CoverGrid" },
      {
        name: "description",
        content:
          "Core settings for the facility plus the controls for the system that runs the schedule on its own: how far ahead it fills, how much cushion it keeps, and how it weighs seniority.",
      },
      { property: "og:title", content: "Settings — CoverGrid" },
      {
        property: "og:description",
        content: "Core settings and the controls for the system that runs itself.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: SettingsPage,
});

function SettingsPage() {
  const qc = useQueryClient();
  const loadConfig = useServerFn(getFacilityConfig);
  const loadAutomation = useServerFn(getAutomation);
  const loadOutbox = useServerFn(getOutbox);
  const saveHelper = useServerFn(saveAutopilot);
  const runNow = useServerFn(runAutomation);
  const saveTexts = useServerFn(updateMessagingSettingsFn);
  const setOptin = useServerFn(setSmsOptinFn);
  const setFloat = useServerFn(setFloatOptinFn);

  const config = useQuery({ queryKey: ["facility-config"], queryFn: () => loadConfig() });
  const isManager = config.data?.isManager ?? false;
  const isAdmin = Boolean((config.data as { isAdmin?: boolean } | undefined)?.isAdmin);
  const employee = (config.data?.employee ?? null) as
    | ({ sms_optin?: boolean; float_pool_optin?: boolean; phone?: string | null } & Record<
        string,
        unknown
      >)
    | null;

  const automation = useQuery({
    queryKey: ["automation"],
    queryFn: () => loadAutomation(),
    enabled: isManager,
  });
  const outbox = useQuery({
    queryKey: ["outbox"],
    queryFn: () => loadOutbox(),
    enabled: isManager,
  });

  const helperMut = useMutation({
    mutationFn: (
      v: Parameters<typeof saveAutopilot>[0] extends never ? never : Record<string, unknown>,
    ) => saveHelper({ data: v as never }),
    onSuccess: () => {
      toast.success("Saved.");
      void qc.invalidateQueries({ queryKey: ["automation"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const textMut = useMutation({
    mutationFn: (v: {
      smsEnabled?: boolean;
      quietStart?: number;
      quietEnd?: number;
      retentionDays?: number;
    }) => saveTexts({ data: v }),
    onSuccess: () => {
      toast.success("Saved.");
      void qc.invalidateQueries({ queryKey: ["outbox"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const personalMut = useMutation({
    mutationFn: async (v: { sms?: boolean; float?: boolean }) => {
      if (v.sms !== undefined) await setOptin({ data: { optin: v.sms } });
      if (v.float !== undefined) await setFloat({ data: { optin: v.float } });
    },
    onSuccess: () => {
      toast.success("Preference saved.");
      void qc.invalidateQueries({ queryKey: ["facility-config"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const runMut = useMutation({
    mutationFn: () => runNow(),
    onSuccess: (r) => {
      toast.success(r.summary);
      void qc.invalidateQueries();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const s = automation.data?.settings;
  const texts = outbox.data?.settings as
    | { smsEnabled?: boolean; quietStart?: number; quietEnd?: number; retentionDays?: number }
    | undefined;

  const number = (
    label: string,
    help: string,
    value: number,
    onSave: (n: number) => void,
    min = 0,
    max = 30,
  ) => (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      <Input
        type="number"
        min={min}
        max={max}
        step="0.5"
        defaultValue={value}
        onBlur={(e) => {
          const n = Number(e.target.value);
          if (!Number.isNaN(n) && n !== value) onSave(n);
        }}
      />
      <p className="text-xs text-muted-foreground">{help}</p>
    </div>
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-3xl">Settings</h1>
        <p className="max-w-2xl text-muted-foreground">
          Core settings for how the building runs, plus the controls for the system that keeps the
          schedule filled on its own. Changes save as soon as you make them.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">My preferences</CardTitle>
          <CardDescription>These only affect you.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {employee ? (
            <>
              <div className="flex items-center gap-3">
                <Switch
                  id="my-sms"
                  checked={Boolean(employee.sms_optin)}
                  onCheckedChange={(v) => personalMut.mutate({ sms: v })}
                />
                <Label htmlFor="my-sms">Text me about open shifts and schedule changes</Label>
              </div>
              <div className="flex items-center gap-3">
                <Switch
                  id="my-float"
                  checked={Boolean(employee.float_pool_optin)}
                  onCheckedChange={(v) => personalMut.mutate({ float: v })}
                />
                <Label htmlFor="my-float">
                  I'm willing to float to another unit when they're short
                </Label>
              </div>
              <p className="text-xs text-muted-foreground">
                Phone on file: {employee.phone || "none yet — ask your scheduler to add one"}
              </p>
            </>
          ) : (
            <p className="text-sm text-muted-foreground">
              Your account isn't linked to a staff record yet, so there are no personal preferences
              to set.
            </p>
          )}
        </CardContent>
      </Card>

      {isManager && (
        <>
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Core settings</CardTitle>
              <CardDescription>Texting, quiet hours and how long records are kept.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center gap-3">
                <Switch
                  id="sms-enabled"
                  checked={Boolean(texts?.smsEnabled)}
                  onCheckedChange={(v) => textMut.mutate({ smsEnabled: v })}
                />
                <Label htmlFor="sms-enabled">Send text messages to staff</Label>
              </div>
              <div className="grid gap-4 sm:grid-cols-3">
                {number(
                  "Quiet hours start (hour of day)",
                  "Nothing goes out after this hour except true emergencies.",
                  Number(texts?.quietStart ?? 21),
                  (n) => textMut.mutate({ quietStart: n }),
                  0,
                  23,
                )}
                {number(
                  "Quiet hours end (hour of day)",
                  "Messages held overnight go out at this hour.",
                  Number(texts?.quietEnd ?? 7),
                  (n) => textMut.mutate({ quietEnd: n }),
                  0,
                  23,
                )}
                {number(
                  "Keep records for (days)",
                  "Old message and punch history is cleaned up after this.",
                  Number(texts?.retentionDays ?? 365),
                  (n) => textMut.mutate({ retentionDays: n }),
                  30,
                  3650,
                )}
              </div>
            </CardContent>
          </Card>

          <Card className={s?.autopilotEnabled ? "border-primary/40" : "border-destructive/40"}>
            <CardHeader>
              <CardTitle className="flex flex-wrap items-center gap-3 text-base">
                The system that runs the schedule
                <Badge variant={s?.autopilotEnabled ? "secondary" : "destructive"}>
                  {s?.autopilotEnabled ? "Running" : "Off"}
                </Badge>
                {s?.lastRunAt && (
                  <span className="text-xs font-normal text-muted-foreground">
                    last check {new Date(s.lastRunAt).toLocaleString()}
                  </span>
                )}
              </CardTitle>
              <CardDescription>
                This is what fills open shifts, watches coverage, warns people about licenses and
                closes out attendance — every hour, without anyone asking.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center gap-3">
                <Switch
                  id="helper-on"
                  checked={Boolean(s?.autopilotEnabled)}
                  onCheckedChange={(v) => helperMut.mutate({ autopilotEnabled: v })}
                />
                <Label htmlFor="helper-on">Keep the system running on its own</Label>
              </div>
              <div className="rounded-md border p-3 space-y-3">
                <p className="text-sm font-medium">What staff get told</p>
                <div className="flex items-center gap-3">
                  <Switch
                    id="notify-onboarding"
                    checked={s?.notifyOnboarding !== false}
                    onCheckedChange={(v) => helperMut.mutate({ notifyOnboarding: v })}
                  />
                  <Label htmlFor="notify-onboarding">
                    Tell people when onboarding starts and paperwork is sent
                  </Label>
                </div>
                <div className="flex items-center gap-3">
                  <Switch
                    id="notify-schedule"
                    checked={s?.notifyScheduleUpdates !== false}
                    onCheckedChange={(v) => helperMut.mutate({ notifyScheduleUpdates: v })}
                  />
                  <Label htmlFor="notify-schedule">Tell people when their schedule changes</Label>
                </div>
                <div className="flex items-center gap-3">
                  <Switch
                    id="notify-failures"
                    checked={s?.notifyDeliveryFailures !== false}
                    onCheckedChange={(v) => helperMut.mutate({ notifyDeliveryFailures: v })}
                  />
                  <Label htmlFor="notify-failures">
                    Warn managers when a text does not reach someone
                  </Label>
                </div>
                {number(
                  "Undo window (minutes)",
                  "How long a send home can be taken back.",
                  Number(s?.undoWindowMinutes ?? 10),
                  (n) => helperMut.mutate({ undoWindowMinutes: n }),
                  1,
                  120,
                )}
              </div>
              <div className="flex items-center gap-3">
                <Switch
                  id="helper-watch"
                  checked={Boolean(s?.watchOnly)}
                  onCheckedChange={(v) => helperMut.mutate({ watchOnly: v })}
                />
                <Label htmlFor="helper-watch">
                  Watch only — show what it would do, but don't change anything
                </Label>
              </div>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                {number(
                  "Extra person kept per shift",
                  "Cushion in case someone calls off.",
                  Number(s?.coverageBuffer ?? 1),
                  (n) => helperMut.mutate({ coverageBuffer: n }),
                  0,
                  5,
                )}
                {number(
                  "Fill shifts this many days out",
                  "How far ahead it will fill holes on its own.",
                  Number(s?.autoFillDays ?? 7),
                  (n) => helperMut.mutate({ autoFillDays: n }),
                  1,
                  30,
                )}
                {number(
                  "Build the schedule this many weeks out",
                  "How far ahead the rotation is written.",
                  Number(s?.horizonWeeks ?? 6),
                  (n) => helperMut.mutate({ horizonWeeks: n }),
                  1,
                  16,
                )}
                {number(
                  "Weight on seniority",
                  "Higher means senior staff float less often.",
                  Number(s?.seniorityWeight ?? 1),
                  (n) => helperMut.mutate({ seniorityWeight: n }),
                  0,
                  3,
                )}
                {number(
                  "Weight on who floated last",
                  "Higher means it spreads floating out more evenly.",
                  Number(s?.recencyWeight ?? 1),
                  (n) => helperMut.mutate({ recencyWeight: n }),
                  0,
                  3,
                )}
              </div>
              <div className="flex flex-wrap gap-2">
                <Button onClick={() => runMut.mutate()} disabled={runMut.isPending}>
                  {runMut.isPending ? "Checking…" : "Run a check right now"}
                </Button>
              </div>
            </CardContent>
          </Card>
          <Card className={s?.buybackEnabled ? "border-primary/40" : ""}>
            <CardHeader>
              <CardTitle className="flex flex-wrap items-center gap-3 text-base">
                Earning attendance points back
                <Badge variant={s?.buybackEnabled ? "secondary" : "outline"}>
                  {s?.buybackEnabled ? "On" : "Off"}
                </Badge>
              </CardTitle>
              <CardDescription>
                When this is on, staff who pick up extra open shifts have attendance points taken
                back off their record automatically. Turn it off and nothing changes for anyone.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center gap-3">
                <Switch
                  id="buyback-on"
                  checked={Boolean(s?.buybackEnabled)}
                  onCheckedChange={(v) => helperMut.mutate({ buybackEnabled: v })}
                />
                <Label htmlFor="buyback-on">
                  Let staff earn attendance points back by picking up shifts
                </Label>
              </div>
              <div className="grid gap-4 sm:grid-cols-3">
                {number(
                  "Shifts needed to earn points back",
                  "How many extra shifts someone has to pick up and work.",
                  Number(s?.buybackShiftsRequired ?? 3),
                  (n) => helperMut.mutate({ buybackShiftsRequired: n }),
                  1,
                  20,
                )}
                {number(
                  "Points removed each time",
                  "How much comes off the record once they hit that number.",
                  Number(s?.buybackPointsRemoved ?? 1),
                  (n) => helperMut.mutate({ buybackPointsRemoved: n }),
                  0.5,
                  5,
                )}
                {number(
                  "Most points anyone can earn back per year",
                  "A yearly ceiling so the policy still has teeth.",
                  Number(s?.buybackMaxPointsPerYear ?? 3),
                  (n) => helperMut.mutate({ buybackMaxPointsPerYear: n }),
                  0,
                  20,
                )}
              </div>
              <div className="rounded-md border p-3 text-sm">
                <p className="font-medium">
                  {automation.data?.buyback?.totalPointsRemoved ?? 0} points earned back so far
                </p>
                {(automation.data?.buyback?.recent ?? []).length === 0 ? (
                  <p className="text-xs text-muted-foreground">
                    Nobody has earned points back yet.
                  </p>
                ) : (
                  <div className="mt-2 space-y-1">
                    {(automation.data?.buyback?.recent ?? []).slice(0, 8).map((r) => (
                      <p key={r.id} className="text-xs text-muted-foreground">
                        {new Date(r.createdAt).toLocaleDateString()} · {r.employee} — {r.points}{" "}
                        point(s) back for {r.shiftsUsed} picked-up shift(s)
                      </p>
                    ))}
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </>
      )}

      {isAdmin && <BrandColorsCard />}
    </div>
  );
}
