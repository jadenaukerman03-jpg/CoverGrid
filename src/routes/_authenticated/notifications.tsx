import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";

import { NotificationAudit } from "@/components/notification-audit";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import {
  getNotificationHistory,
  getNotificationRules,
  markNotificationsReadFn,
  previewNotificationFn,
  resendFailedTextFn,
  resetMyNotificationRuleFn,
  saveMyNotificationRuleFn,
  saveRoleNotificationRuleFn,
} from "@/lib/notifications.functions";

export const Route = createFileRoute("/_authenticated/notifications")({
  head: () => ({
    meta: [
      { title: "Notifications — CoverGrid" },
      {
        name: "description",
        content:
          "Every message the facility has sent you — in the app and by text — with delivery status, so nothing important gets missed.",
      },
      { property: "og:title", content: "Notifications — CoverGrid" },
      {
        property: "og:description",
        content: "Your full notification history with delivery status for every text.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: NotificationsPage,
});

function when(value: string) {
  const d = new Date(value);
  return Number.isNaN(d.getTime())
    ? value
    : d.toLocaleString(undefined, {
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
      });
}

function NotificationsPage() {
  const qc = useQueryClient();
  const load = useServerFn(getNotificationHistory);
  const markRead = useServerFn(markNotificationsReadFn);
  const resend = useServerFn(resendFailedTextFn);
  const loadRules = useServerFn(getNotificationRules);
  const saveMine = useServerFn(saveMyNotificationRuleFn);
  const resetMine = useServerFn(resetMyNotificationRuleFn);
  const saveRole = useServerFn(saveRoleNotificationRuleFn);
  const runPreview = useServerFn(previewNotificationFn);
  const [preview, setPreview] = useState<Awaited<ReturnType<typeof previewNotificationFn>> | null>(
    null,
  );

  const previewMut = useMutation({
    mutationFn: (sendTest: boolean) =>
      runPreview({ data: { category: "onboarding" as const, sendTest } }),
    onSuccess: (r) => {
      setPreview(r);
      if (r.testResult) toast.success(r.testResult);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const { data, isLoading } = useQuery({
    queryKey: ["notification-history"],
    queryFn: () => load(),
    refetchInterval: 120_000,
  });

  const { data: rules } = useQuery({
    queryKey: ["notification-rules"],
    queryFn: () => loadRules(),
  });
  const refreshRules = () => {
    void qc.invalidateQueries({ queryKey: ["notification-rules"] });
  };

  const mineMut = useMutation({
    mutationFn: (v: {
      category: "onboarding" | "schedule" | "reminders" | "delivery_failures";
      inApp: boolean;
      sms: boolean;
    }) => saveMine({ data: v }),
    onSuccess: (r) => {
      toast.success(r.summary);
      refreshRules();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const resetMut = useMutation({
    mutationFn: (category: "onboarding" | "schedule" | "reminders" | "delivery_failures") =>
      resetMine({ data: { category } }),
    onSuccess: (r) => {
      toast.success(r.summary);
      refreshRules();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const roleMut = useMutation({
    mutationFn: (v: {
      role: "employee" | "manager" | "admin";
      category: "onboarding" | "schedule" | "reminders" | "delivery_failures";
      inApp: boolean;
      sms: boolean;
    }) => saveRole({ data: v }),
    onSuccess: (r) => {
      toast.success(r.summary);
      refreshRules();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const readMut = useMutation({
    mutationFn: () => markRead(),
    onSuccess: () => {
      toast.success("Marked everything as read.");
      void qc.invalidateQueries({ queryKey: ["notification-history"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const resendMut = useMutation({
    mutationFn: (id: string) => resend({ data: { id } }),
    onSuccess: (r) => {
      if (r.status === "failed") toast.error(r.summary);
      else toast.success(r.summary);
      void qc.invalidateQueries({ queryKey: ["notification-history"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl">Notifications</h1>
          <p className="max-w-2xl text-muted-foreground">
            Everything the facility has sent you over the last 60 days — in the app and by text —
            with whether each text actually reached your phone. Managers can turn each kind of
            message on or off in Settings.
          </p>
        </div>
        <Button variant="outline" onClick={() => readMut.mutate()} disabled={readMut.isPending}>
          Mark all read
        </Button>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        {[
          ["Messages", data?.counts.total ?? 0, "Last 60 days"],
          ["Unread", data?.counts.unread ?? 0, "Waiting on you"],
          ["Not delivered", data?.counts.failed ?? 0, "Texts that failed"],
        ].map(([label, count, note]) => (
          <Card key={label as string}>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-normal text-muted-foreground">{label}</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="font-display text-3xl">{count as number}</p>
              <p className="text-xs text-muted-foreground">{note}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {data?.isManager && data.facilityFailures.length > 0 && (
        <Card className="border-destructive/40">
          <CardHeader>
            <CardTitle className="font-display text-xl">Texts that did not reach anyone</CardTitle>
            <CardDescription>
              Usually a bad or disconnected number. Fix the number in Team, then send it again.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {data.facilityFailures.map((f) => (
              <div
                key={f.id}
                className="flex flex-wrap items-start justify-between gap-3 rounded-md border p-3 text-sm"
              >
                <div>
                  <p className="font-medium">
                    {f.name} · {f.to || "no number"}
                  </p>
                  <p className="text-muted-foreground">{f.body}</p>
                  <p className="text-xs text-destructive">
                    {f.diagnosis?.code ? `Code ${f.diagnosis.code} · ` : ""}
                    {f.diagnosis?.reason || f.error} · {when(f.at)}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Tried {f.diagnosis?.attemptsUsed ?? f.attempts.length} of{" "}
                    {f.diagnosis?.maxAttempts ?? 3}
                    {f.diagnosis?.lastAttemptAt
                      ? ` · last try ${when(f.diagnosis.lastAttemptAt)}`
                      : ""}{" "}
                    · {f.diagnosis?.retryNote ?? "It will not retry on its own."}
                    {f.diagnosis?.hint ? ` ${f.diagnosis.hint}` : ""}
                  </p>
                  {f.attempts.length > 0 && (
                    <ul className="mt-2 space-y-0.5 text-xs text-muted-foreground">
                      {f.attempts.map((a, idx) => (
                        <li key={`${f.id}-${idx}`}>
                          Try {a.attemptNo} · {a.status.replace("_", " ")} · {a.actor} ·{" "}
                          {when(a.at)}
                          {a.error ? ` — ${a.error}` : ""}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => resendMut.mutate(f.id)}
                  disabled={resendMut.isPending}
                >
                  Send again
                </Button>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {rules?.linked && (
        <Card>
          <CardHeader>
            <CardTitle className="font-display text-xl">What you get told about</CardTitle>
            <CardDescription>
              Your own rules. Anything you leave alone follows the standard rule for {rules.myRole}
              s.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {rules.myRules.map((r) => (
              <div key={r.category} className="rounded-md border p-3">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="font-medium">{r.label}</p>
                    <p className="text-sm text-muted-foreground">{r.blurb}</p>
                    <p className="text-xs text-muted-foreground">
                      {r.source === "person" ? "Your own setting" : "Following the standard rule"}
                    </p>
                  </div>
                  <div className="flex items-center gap-5">
                    <label className="flex items-center gap-2 text-sm">
                      In app
                      <Switch
                        checked={r.inApp}
                        onCheckedChange={(v) =>
                          mineMut.mutate({ category: r.category, inApp: v, sms: r.sms })
                        }
                      />
                    </label>
                    <label className="flex items-center gap-2 text-sm">
                      Text
                      <Switch
                        checked={r.sms}
                        onCheckedChange={(v) =>
                          mineMut.mutate({ category: r.category, inApp: r.inApp, sms: v })
                        }
                      />
                    </label>
                    {r.source === "person" && (
                      <Button size="sm" variant="ghost" onClick={() => resetMut.mutate(r.category)}>
                        Use standard
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {rules?.isManager && (
        <Card>
          <CardHeader>
            <CardTitle className="font-display text-xl">Try it before it goes out</CardTitle>
            <CardDescription>
              Builds the exact onboarding handoff message and shows who would get it — in the app,
              by text, or not at all. Nothing is sent unless you ask for a test copy.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex flex-wrap gap-2">
              <Button onClick={() => previewMut.mutate(false)} disabled={previewMut.isPending}>
                {previewMut.isPending ? "Working…" : "Preview onboarding handoff"}
              </Button>
              <Button
                variant="outline"
                onClick={() => previewMut.mutate(true)}
                disabled={previewMut.isPending}
              >
                Send a test to me
              </Button>
            </div>

            {preview && (
              <div className="space-y-3">
                <div className="rounded-md border p-3">
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">
                    {preview.sample
                      ? "Sample wording (no new hires on file)"
                      : `Built from ${preview.hire?.name}`}
                  </p>
                  <p className="mt-1 font-medium">{preview.title}</p>
                  <p className="text-sm text-muted-foreground">{preview.body}</p>
                  <p className="mt-2 text-sm">
                    <span className="font-medium">Text version: </span>
                    {preview.text}
                  </p>
                </div>

                {!preview.facilityOn && (
                  <p className="text-sm text-destructive">{preview.facilityNote}</p>
                )}
                {preview.quietNote && (
                  <p className="text-sm text-muted-foreground">{preview.quietNote}</p>
                )}
                {preview.testResult && <p className="text-sm text-primary">{preview.testResult}</p>}

                <div className="rounded-md border p-3">
                  <p className="text-sm font-medium">
                    Who gets it — {preview.counts.inApp} in the app, {preview.counts.sms} by text,
                    out of {preview.counts.total}
                  </p>
                  {preview.recipients.length === 0 && (
                    <p className="text-sm text-muted-foreground">
                      Nobody would receive this right now.
                    </p>
                  )}
                  <ul className="mt-2 space-y-1 text-sm">
                    {preview.recipients.map((r, idx) => (
                      <li
                        key={`${r.name}-${idx}`}
                        className="flex flex-wrap items-center justify-between gap-2"
                      >
                        <span>
                          {r.name} <span className="text-muted-foreground">· {r.who}</span>
                        </span>
                        <span className="flex items-center gap-2">
                          <Badge variant={r.inApp ? "default" : "outline"}>
                            {r.inApp ? "In app" : "No in-app"}
                          </Badge>
                          <Badge variant={r.sms ? "secondary" : "outline"}>
                            {r.sms
                              ? `Text ${r.phone}`
                              : `No text${r.smsNote ? ` — ${r.smsNote}` : ""}`}
                          </Badge>
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {rules?.isManager && (
        <Card>
          <CardHeader>
            <CardTitle className="font-display text-xl">Standard rules by role</CardTitle>
            <CardDescription>
              What everyone starts with. New employees pick these up automatically until they change
              their own.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            {rules.roleRules.map((group) => (
              <div key={group.role} className="space-y-2">
                <p className="font-display text-lg capitalize">{group.role}s</p>
                {group.rules.map((r) => (
                  <div
                    key={`${group.role}-${r.category}`}
                    className="flex flex-wrap items-center justify-between gap-3 rounded-md border p-3"
                  >
                    <div>
                      <p className="text-sm font-medium">{r.label}</p>
                      <p className="text-xs text-muted-foreground">{r.blurb}</p>
                    </div>
                    <div className="flex items-center gap-5">
                      <label className="flex items-center gap-2 text-sm">
                        In app
                        <Switch
                          checked={r.inApp}
                          onCheckedChange={(v) =>
                            roleMut.mutate({
                              role: group.role as "employee" | "manager" | "admin",
                              category: r.category,
                              inApp: v,
                              sms: r.sms,
                            })
                          }
                        />
                      </label>
                      <label className="flex items-center gap-2 text-sm">
                        Text
                        <Switch
                          checked={r.sms}
                          onCheckedChange={(v) =>
                            roleMut.mutate({
                              role: group.role as "employee" | "manager" | "admin",
                              category: r.category,
                              inApp: r.inApp,
                              sms: v,
                            })
                          }
                        />
                      </label>
                    </div>
                  </div>
                ))}
              </div>
            ))}
            {rules.overrides.length > 0 && (
              <div className="rounded-md border p-3">
                <p className="text-sm font-medium">People with their own settings</p>
                <ul className="mt-1 space-y-0.5 text-xs text-muted-foreground">
                  {rules.overrides.map((o, idx) => (
                    <li key={`${o.employeeId}-${o.category}-${idx}`}>
                      {o.name} · {o.label} · in app {o.inApp ? "on" : "off"}, text{" "}
                      {o.sms ? "on" : "off"}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {data?.isManager && <NotificationAudit />}

      <Card>
        <CardHeader>
          <CardTitle className="font-display text-xl">History</CardTitle>
          <CardDescription>Newest first.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {isLoading && <p className="text-muted-foreground">Loading…</p>}
          {!isLoading && (data?.items.length ?? 0) === 0 && (
            <p className="text-muted-foreground">Nothing has been sent to you yet.</p>
          )}
          {(data?.items ?? []).map((i) => (
            <div key={i.id} className="rounded-md border p-3">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <p className="font-medium">{i.title}</p>
                <div className="flex items-center gap-2">
                  <Badge variant={i.channel === "text" ? "secondary" : "outline"}>
                    {i.channel === "text" ? "Text" : "In app"}
                  </Badge>
                  <Badge
                    variant={
                      i.status === "failed"
                        ? "destructive"
                        : i.status === "unread"
                          ? "default"
                          : "outline"
                    }
                  >
                    {i.statusNote}
                  </Badge>
                </div>
              </div>
              <p className="mt-1 text-sm text-muted-foreground">{i.body}</p>
              <p className="mt-1 text-xs text-muted-foreground">{when(i.at)}</p>
              {i.channel === "text" && i.diagnosis && i.diagnosis.retryState !== "delivered" && (
                <p
                  className={`mt-1 text-xs ${i.status === "failed" ? "text-destructive" : "text-muted-foreground"}`}
                >
                  {i.diagnosis.code ? `Code ${i.diagnosis.code} · ` : ""}
                  {i.diagnosis.reason ? `${i.diagnosis.reason} · ` : ""}
                  {i.diagnosis.retryNote}
                  {i.diagnosis.lastAttemptAt ? ` Last try ${when(i.diagnosis.lastAttemptAt)}.` : ""}
                  {i.diagnosis.nextRetryAt ? ` Next try ${when(i.diagnosis.nextRetryAt)}.` : ""}
                  {i.diagnosis.hint ? ` ${i.diagnosis.hint}` : ""}
                </p>
              )}
              {(i.attempts?.length ?? 0) > 0 && (
                <ul className="mt-2 space-y-0.5 text-xs text-muted-foreground">
                  {(i.attempts ?? []).map((a, idx) => (
                    <li key={`${i.id}-a-${idx}`}>
                      Try {a.attemptNo} · {a.status.replace("_", " ")} · {a.actor} · {when(a.at)}
                      {a.error ? ` — ${a.error}` : ""}
                    </li>
                  ))}
                </ul>
              )}
              {data?.isManager && i.channel === "text" && i.status === "failed" && (
                <Button
                  className="mt-2"
                  size="sm"
                  variant="outline"
                  onClick={() => resendMut.mutate(i.id.slice(2))}
                  disabled={resendMut.isPending}
                >
                  {resendMut.isPending ? "Sending…" : "Send again"}
                </Button>
              )}
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
