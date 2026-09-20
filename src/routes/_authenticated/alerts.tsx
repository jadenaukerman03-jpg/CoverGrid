import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import {
  flushOutboxFn,
  getClocks,
  getOutbox,
  rotateClockKeyFn,
  saveClockFn,
  sendTestTextFn,
  updateMessagingSettingsFn,
} from "@/lib/platform.functions";

export const Route = createFileRoute("/_authenticated/alerts")({
  head: () => ({
    meta: [
      { title: "Text alerts & time clocks — CoverGrid" },
      {
        name: "description",
        content:
          "Send open-shift and attendance alerts straight to staff phones, and register the wall clocks staff punch in on.",
      },
      { property: "og:title", content: "Text alerts & time clocks — CoverGrid" },
      {
        property: "og:description",
        content: "Phone alerts that reach the floor, and real badge-and-PIN time clocks.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: AlertsPage,
});

const STATUS_TONE: Record<string, string> = {
  sent: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
  queued: "bg-amber-500/15 text-amber-700 dark:text-amber-300",
  failed: "bg-destructive/15 text-destructive",
};

function AlertsPage() {
  const qc = useQueryClient();
  const loadOutbox = useServerFn(getOutbox);
  const loadClocks = useServerFn(getClocks);
  const saveSettings = useServerFn(updateMessagingSettingsFn);
  const testText = useServerFn(sendTestTextFn);
  const flush = useServerFn(flushOutboxFn);
  const saveClock = useServerFn(saveClockFn);
  const rotate = useServerFn(rotateClockKeyFn);

  const [phone, setPhone] = useState("");
  const [clockName, setClockName] = useState("");

  const outbox = useQuery({ queryKey: ["outbox"], queryFn: () => loadOutbox() });
  const clocks = useQuery({ queryKey: ["clocks"], queryFn: () => loadClocks() });

  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ["outbox"] });
    void qc.invalidateQueries({ queryKey: ["clocks"] });
  };

  const settingsMutation = useMutation({
    mutationFn: (data: {
      smsEnabled?: boolean;
      quietStart?: number;
      quietEnd?: number;
      retentionDays?: number;
    }) => saveSettings({ data }),
    onSuccess: () => {
      toast.success("Saved.");
      refresh();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const testMutation = useMutation({
    mutationFn: () => testText({ data: { phone } }),
    onSuccess: (r) => {
      toast.success(r.message);
      setPhone("");
      refresh();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const flushMutation = useMutation({
    mutationFn: () => flush(),
    onSuccess: (r) =>
      toast.success(
        r.configured
          ? `Sent ${r.sent}, failed ${r.failed}.`
          : `${r.waiting} message(s) waiting on texting setup.`,
      ),
    onError: (e: Error) => toast.error(e.message),
  });

  const clockMutation = useMutation({
    mutationFn: () => saveClock({ data: { name: clockName } }),
    onSuccess: () => {
      toast.success("Clock registered.");
      setClockName("");
      refresh();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const rotateMutation = useMutation({
    mutationFn: (id: string) => rotate({ data: { id } }),
    onSuccess: () => {
      toast.success("New key issued. Re-open the clock screen on that device.");
      refresh();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (outbox.error)
    return <p className="text-muted-foreground">Text alerts are available to managers only.</p>;

  const data = outbox.data;
  const settings = data?.settings;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-3xl">Text alerts & time clocks</h1>
        <p className="text-muted-foreground">
          Open shifts, attendance notices and license reminders go to the phone as well as the app.
          Quiet hours are respected unless a shift needs covering tonight.
        </p>
      </div>

      {data && !data.configured && (
        <Card className="border-amber-500/40 bg-amber-500/5">
          <CardHeader>
            <CardTitle className="text-base">Texting is not connected yet</CardTitle>
            <CardDescription>
              Messages are being written and held safely. Once a texting number is connected,
              everything waiting goes out on the next cycle — nothing is lost.
            </CardDescription>
          </CardHeader>
        </Card>
      )}

      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Sent this week</CardDescription>
            <CardTitle className="text-3xl">{data?.counts.sent ?? 0}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Waiting</CardDescription>
            <CardTitle className="text-3xl">{data?.counts.queued ?? 0}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Opted out</CardDescription>
            <CardTitle className="text-3xl">{data?.optedOut ?? 0}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>No phone on file</CardDescription>
            <CardTitle className="text-3xl">{data?.noPhone ?? 0}</CardTitle>
          </CardHeader>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Settings</CardTitle>
            <CardDescription>
              Quiet hours hold routine notices until morning. Coverage calls always go out.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium">Send text alerts</p>
                <p className="text-sm text-muted-foreground">
                  Turn this off and everything stays in the app only.
                </p>
              </div>
              <Switch
                checked={settings?.smsEnabled ?? true}
                onCheckedChange={(v) => settingsMutation.mutate({ smsEnabled: v })}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-muted-foreground" htmlFor="qs">
                  Quiet hours start (hour)
                </label>
                <Input
                  id="qs"
                  type="number"
                  min={0}
                  max={23}
                  defaultValue={settings?.quietStart ?? 21}
                  onBlur={(e) => settingsMutation.mutate({ quietStart: Number(e.target.value) })}
                />
              </div>
              <div>
                <label className="text-xs text-muted-foreground" htmlFor="qe">
                  Quiet hours end (hour)
                </label>
                <Input
                  id="qe"
                  type="number"
                  min={0}
                  max={23}
                  defaultValue={settings?.quietEnd ?? 6}
                  onBlur={(e) => settingsMutation.mutate({ quietEnd: Number(e.target.value) })}
                />
              </div>
            </div>
            <div>
              <label className="text-xs text-muted-foreground" htmlFor="ret">
                Keep records for (days)
              </label>
              <Input
                id="ret"
                type="number"
                min={365}
                max={3650}
                defaultValue={settings?.retentionDays ?? 2555}
                onBlur={(e) => settingsMutation.mutate({ retentionDays: Number(e.target.value) })}
              />
            </div>
            <div className="flex gap-2">
              <Input
                placeholder="Send a test to (555) 555-5555"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
              />
              <Button
                disabled={!phone || testMutation.isPending}
                onClick={() => testMutation.mutate()}
              >
                Test
              </Button>
              <Button
                variant="secondary"
                disabled={flushMutation.isPending}
                onClick={() => flushMutation.mutate()}
              >
                Send now
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Wall clocks</CardTitle>
            <CardDescription>
              Register a tablet or clock, then open its screen at{" "}
              <span className="font-mono">/kiosk</span> and paste the key. Staff punch with their
              clock-in number and PIN.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex gap-2">
              <Input
                placeholder="Clock name (e.g. Birch hallway)"
                value={clockName}
                onChange={(e) => setClockName(e.target.value)}
              />
              <Button
                disabled={!clockName || clockMutation.isPending}
                onClick={() => clockMutation.mutate()}
              >
                Register
              </Button>
            </div>
            <div className="space-y-2">
              {(clocks.data?.devices ?? []).map((d) => (
                <div key={d.id} className="rounded-lg border p-3">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="font-medium">{d.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {d.unit} ·{" "}
                        {d.lastSeenAt
                          ? `last used ${new Date(d.lastSeenAt).toLocaleString()}`
                          : "never used"}
                      </p>
                    </div>
                    <Button size="sm" variant="outline" onClick={() => rotateMutation.mutate(d.id)}>
                      New key
                    </Button>
                  </div>
                  <p className="mt-2 break-all rounded bg-muted px-2 py-1 font-mono text-xs">
                    {d.deviceKey}
                  </p>
                </div>
              ))}
              {clocks.data && clocks.data.devices.length === 0 && (
                <p className="text-sm text-muted-foreground">No clocks registered yet.</p>
              )}
            </div>
            {clocks.data && clocks.data.needsBadge.length > 0 && (
              <p className="text-sm text-muted-foreground">
                {clocks.data.needsBadge.length} staff member(s) still need a clock-in number and PIN
                — set those on their profile before go-live.
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Recent messages</CardTitle>
          <CardDescription>
            Everything the system sent or is holding, from the last seven days.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {(data?.messages ?? []).map((m) => (
            <div
              key={m.id}
              className="flex flex-wrap items-start justify-between gap-3 rounded-lg border p-3"
            >
              <div className="min-w-0">
                <p className="font-medium">
                  {m.name} <span className="text-xs text-muted-foreground">{m.to}</span>
                </p>
                <p className="text-sm text-muted-foreground">{m.body}</p>
                {m.error && <p className="text-xs text-destructive">{m.error}</p>}
              </div>
              <Badge className={STATUS_TONE[m.status] ?? ""} variant="secondary">
                {m.status === "sent"
                  ? `Sent ${new Date(m.sentAt ?? "").toLocaleTimeString()}`
                  : m.status}
              </Badge>
            </div>
          ))}
          {data && data.messages.length === 0 && (
            <p className="text-sm text-muted-foreground">Nothing sent yet.</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
