import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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
  changeAccountRoleFn,
  completeAccessReviewFn,
  createIncidentFn,
  exportAuditTrailFn,
  getSecurityPosture,
  listIncidentsFn,
  runRetentionFn,
  saveSecuritySettingsFn,
  updateIncidentFn,
} from "@/lib/security.functions";
import { CONTROLS, VENDORS } from "@/lib/soc2-catalog";

export const Route = createFileRoute("/_authenticated/security")({
  head: () => ({
    meta: [
      { title: "Security & access review — CoverGrid" },
      {
        name: "description",
        content:
          "Administrator controls: who can reach what, automatic sign-out, how long records are kept, and a downloadable change record.",
      },
      { property: "og:title", content: "Security & access review — CoverGrid" },
      {
        property: "og:description",
        content: "Access reviews, retention and the full change record in one place.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: SecurityPage,
});

const ROLE_LABEL = { admin: "Administrator", manager: "Manager", employee: "Employee" } as const;

function fmt(iso: string | null) {
  if (!iso) return "Never";
  return new Date(iso).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function download(name: string, text: string, type = "text/csv;charset=utf-8") {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

function csv(rows: Array<Record<string, string | number>>): string {
  if (rows.length === 0) return "";
  const headers = Object.keys(rows[0]!);
  const esc = (v: string | number) => `"${String(v).replace(/"/g, '""')}"`;
  return [
    headers.join(","),
    ...rows.map((r) => headers.map((h) => esc(r[h] ?? "")).join(",")),
  ].join("\n");
}

function SecurityPage() {
  const qc = useQueryClient();
  const load = useServerFn(getSecurityPosture);
  const save = useServerFn(saveSecuritySettingsFn);
  const setRole = useServerFn(changeAccountRoleFn);
  const review = useServerFn(completeAccessReviewFn);
  const exportTrail = useServerFn(exportAuditTrailFn);
  const retention = useServerFn(runRetentionFn);

  const [notes, setNotes] = useState("");
  const [changes, setChanges] = useState(0);
  const [draft, setDraft] = useState<Record<string, number>>({});
  const [incident, setIncident] = useState({ title: "", severity: "low", summary: "", impact: "" });

  const { data, isLoading, error } = useQuery({
    queryKey: ["security-posture"],
    queryFn: () => load(),
  });

  const settingsMutation = useMutation({
    mutationFn: (patch: Record<string, number>) => save({ data: patch }),
    onSuccess: () => {
      toast.success("Saved.");
      setDraft({});
      void qc.invalidateQueries({ queryKey: ["security-posture"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const roleMutation = useMutation({
    mutationFn: (v: { targetUserId: string; role: "employee" | "manager" | "admin" }) =>
      setRole({ data: v }),
    onSuccess: () => {
      setChanges((c) => c + 1);
      toast.success("Access updated.");
      void qc.invalidateQueries({ queryKey: ["security-posture"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const reviewMutation = useMutation({
    mutationFn: () =>
      review({
        data: {
          accountsReviewed: data?.accounts.length ?? 0,
          changesMade: changes,
          ...(notes.trim() ? { notes: notes.trim() } : {}),
        },
      }),
    onSuccess: () => {
      toast.success("Access review recorded.");
      setNotes("");
      setChanges(0);
      void qc.invalidateQueries({ queryKey: ["security-posture"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const retentionMutation = useMutation({
    mutationFn: () => retention(),
    onSuccess: (res) =>
      toast.success(
        res.total > 0
          ? `Removed ${res.total} expired records.`
          : "Nothing was past its keep-until date.",
      ),
    onError: (e: Error) => toast.error(e.message),
  });

  const loadIncidents = useServerFn(listIncidentsFn);
  const openIncident = useServerFn(createIncidentFn);
  const editIncident = useServerFn(updateIncidentFn);

  const incidents = useQuery({ queryKey: ["security-incidents"], queryFn: () => loadIncidents() });

  const incidentCreateMutation = useMutation({
    mutationFn: () =>
      openIncident({
        data: {
          title: incident.title.trim(),
          severity: incident.severity as "low" | "medium" | "high" | "critical",
          summary: incident.summary.trim(),
          ...(incident.impact.trim() ? { impact: incident.impact.trim() } : {}),
        },
      }),
    onSuccess: () => {
      toast.success("Logged.");
      setIncident({ title: "", severity: "low", summary: "", impact: "" });
      void qc.invalidateQueries({ queryKey: ["security-incidents"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const incidentUpdateMutation = useMutation({
    mutationFn: (v: { id: string; status: "open" | "investigating" | "resolved" }) =>
      editIncident({ data: v }),
    onSuccess: () => {
      toast.success("Updated.");
      void qc.invalidateQueries({ queryKey: ["security-incidents"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  function downloadControls() {
    download(
      "controls-and-vendors.csv",
      csv([
        ...CONTROLS.map((c) => ({
          type: "control",
          reference: c.id,
          area: c.area,
          detail: c.control,
          evidence: c.evidence,
        })),
        ...VENDORS.map((v) => ({
          type: "vendor",
          reference: v.name,
          area: v.region,
          detail: v.purpose,
          evidence: v.data,
        })),
      ]),
    );
  }

  async function downloadTrail(days: number) {
    const res = await exportTrail({ data: { days } });
    if (res.rows.length === 0) {
      toast.info("No recorded changes in that window.");
      return;
    }
    download(
      `change-record-${days}-days.csv`,
      csv(res.rows as unknown as Array<Record<string, string>>),
    );
  }

  function downloadAccounts() {
    if (!data) return;
    download(
      "access-review.csv",
      csv(
        data.accounts.map((a) => ({
          name: a.name,
          email: a.email,
          access: ROLE_LABEL[a.role],
          staff_record: a.employeeName ?? "",
          active: a.active ? "yes" : "no",
          last_signed_in: a.lastSignInAt ?? "never",
        })),
      ),
    );
  }

  if (error) return <p className="text-muted-foreground">This page is for administrators only.</p>;
  if (isLoading || !data) return <p className="text-muted-foreground">Loading…</p>;

  const s = data.settings;
  const field = (key: keyof typeof s, label: string, help: string, min: number, max: number) => (
    <div className="space-y-1">
      <Label htmlFor={key}>{label}</Label>
      <Input
        id={key}
        type="number"
        min={min}
        max={max}
        className="h-11 max-w-40"
        value={draft[key] ?? (s[key] as number)}
        onChange={(e) => setDraft((d) => ({ ...d, [key]: Number(e.target.value) }))}
      />
      <p className="text-xs text-muted-foreground">{help}</p>
    </div>
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-3xl">Security &amp; access review</h1>
        <p className="text-muted-foreground">
          Who can reach what, how long we keep records, and proof that somebody checked. Everything
          on this page is written to the change record.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { label: "Administrators", value: data.counts.admins },
          { label: "Managers", value: data.counts.managers },
          { label: "Employees", value: data.counts.employees },
          { label: "Not signed in for 90 days", value: data.counts.staleNinetyDays },
        ].map((c) => (
          <Card key={c.label}>
            <CardHeader className="pb-2">
              <CardDescription>{c.label}</CardDescription>
              <CardTitle className="font-display text-3xl">{c.value}</CardTitle>
            </CardHeader>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Rules</CardTitle>
          <CardDescription>These apply to everyone in the building.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {field(
              "sessionTimeoutMinutes",
              "Sign out after (minutes idle)",
              "Protects shared station computers.",
              5,
              480,
            )}
            {field(
              "accessReviewDays",
              "Review access every (days)",
              "How often someone must check this list.",
              30,
              365,
            )}
            {field(
              "auditRetentionDays",
              "Keep the change record (days)",
              "7 years is the usual answer.",
              365,
              3650,
            )}
            {field(
              "messageRetentionDays",
              "Keep message history (days)",
              "Texts and email delivery records.",
              30,
              3650,
            )}
          </div>
          <div className="flex flex-wrap gap-3">
            <Button
              disabled={Object.keys(draft).length === 0 || settingsMutation.isPending}
              onClick={() => settingsMutation.mutate(draft)}
            >
              {settingsMutation.isPending ? "Saving…" : "Save rules"}
            </Button>
            <Button
              variant="outline"
              disabled={retentionMutation.isPending}
              onClick={() => retentionMutation.mutate()}
            >
              {retentionMutation.isPending ? "Working…" : "Remove expired records now"}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex-row flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle>Who can reach what</CardTitle>
            <CardDescription>
              {data.reviewOverdue ? (
                <span className="text-destructive">An access review is due.</span>
              ) : (
                <>Next review due {fmt(data.reviewDueOn)}.</>
              )}
            </CardDescription>
          </div>
          <Button variant="outline" onClick={downloadAccounts}>
            Download list
          </Button>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="divide-y rounded-lg border">
            {data.accounts.map((a) => (
              <div key={a.userId} className="flex flex-wrap items-center gap-3 p-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{a.name}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {a.email || "no email on file"} · last signed in {fmt(a.lastSignInAt)}
                  </p>
                </div>
                {!a.employeeName && <Badge variant="outline">No staff record</Badge>}
                {!a.active && <Badge variant="destructive">Inactive staff</Badge>}
                <Select
                  value={a.role}
                  onValueChange={(role) =>
                    roleMutation.mutate({
                      targetUserId: a.userId,
                      role: role as "employee" | "manager" | "admin",
                    })
                  }
                >
                  <SelectTrigger className="h-10 w-44">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="employee">Employee</SelectItem>
                    <SelectItem value="manager">Manager</SelectItem>
                    <SelectItem value="admin">Administrator</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            ))}
          </div>

          <div className="space-y-2 rounded-lg border bg-muted/40 p-4">
            <Label htmlFor="review-notes">Sign off on this review</Label>
            <Textarea
              id="review-notes"
              placeholder="Checked every account against the current roster. Removed manager access for two people who left."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              maxLength={1000}
            />
            <Button disabled={reviewMutation.isPending} onClick={() => reviewMutation.mutate()}>
              {reviewMutation.isPending
                ? "Recording…"
                : `Record review of ${data.accounts.length} accounts`}
            </Button>
          </div>

          {data.reviews.length > 0 && (
            <div className="space-y-1 text-sm text-muted-foreground">
              <p className="font-medium text-foreground">Past reviews</p>
              {data.reviews.map((r) => (
                <p key={r.id}>
                  {fmt(r.reviewedAt)} — {r.reviewedBy}, {r.accountsReviewed} accounts,{" "}
                  {r.changesMade} changes
                  {r.notes ? ` · ${r.notes}` : ""}
                </p>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Change record</CardTitle>
          <CardDescription>
            {data.auditEntries.toLocaleString()} entries kept, oldest {fmt(data.oldestAudit)}.
            Download it for an auditor or a customer security review.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-3">
          {[30, 90, 365].map((d) => (
            <Button key={d} variant="outline" onClick={() => void downloadTrail(d)}>
              Last {d} days
            </Button>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Sign-in trouble</CardTitle>
          <CardDescription>
            Wrong passwords and blocked tries from the last two days. Five misses in fifteen minutes
            puts an email on hold. Nothing here usually means nothing to worry about.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {data.signInFailures.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No failed sign-ins in the last two days.
            </p>
          ) : (
            <ul className="divide-y">
              {data.signInFailures.map((f, i) => (
                <li
                  key={`${f.at}-${i}`}
                  className="flex flex-wrap items-baseline justify-between gap-2 py-2 text-sm"
                >
                  <span className="font-medium">{f.email}</span>
                  <span className="text-muted-foreground">
                    {fmt(f.at)} · from {f.ip}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Security event log</CardTitle>
          <CardDescription>
            Anything that looked wrong — a lost phone, a shared password, an odd sign-in. Write it
            down, work it, close it out. Auditors ask for this first.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 rounded-lg border bg-muted/40 p-4 sm:grid-cols-2">
            <div className="space-y-1">
              <Label htmlFor="incident-title">What happened</Label>
              <Input
                id="incident-title"
                className="h-11"
                placeholder="Shared station left signed in overnight"
                value={incident.title}
                onChange={(e) => setIncident((v) => ({ ...v, title: e.target.value }))}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="incident-severity">How bad</Label>
              <Select
                value={incident.severity}
                onValueChange={(severity) => setIncident((v) => ({ ...v, severity }))}
              >
                <SelectTrigger id="incident-severity" className="h-11">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="low">Low</SelectItem>
                  <SelectItem value="medium">Medium</SelectItem>
                  <SelectItem value="high">High</SelectItem>
                  <SelectItem value="critical">Critical</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1 sm:col-span-2">
              <Label htmlFor="incident-summary">The story</Label>
              <Textarea
                id="incident-summary"
                placeholder="Night nurse found the med room computer signed in as a manager. Signed it out and shortened the idle timer."
                value={incident.summary}
                onChange={(e) => setIncident((v) => ({ ...v, summary: e.target.value }))}
                maxLength={4000}
              />
            </div>
            <div>
              <Button
                disabled={
                  incident.title.trim().length < 3 ||
                  incident.summary.trim().length < 3 ||
                  incidentCreateMutation.isPending
                }
                onClick={() => incidentCreateMutation.mutate()}
              >
                {incidentCreateMutation.isPending ? "Logging…" : "Log this event"}
              </Button>
            </div>
          </div>

          {(incidents.data?.incidents ?? []).length === 0 ? (
            <p className="text-sm text-muted-foreground">Nothing logged. That is the goal.</p>
          ) : (
            <div className="divide-y rounded-lg border">
              {(incidents.data?.incidents ?? []).map((it) => (
                <div key={it.id} className="flex flex-wrap items-start gap-3 p-3">
                  <div className="min-w-0 flex-1">
                    <p className="font-medium">{it.title}</p>
                    <p className="text-xs text-muted-foreground">
                      {fmt(it.detectedAt)} · found by {it.detectedBy}
                    </p>
                    <p className="mt-1 text-sm text-muted-foreground">{it.summary}</p>
                  </div>
                  <Badge
                    variant={
                      it.severity === "low"
                        ? "outline"
                        : it.severity === "medium"
                          ? "secondary"
                          : it.severity === "high"
                            ? "default"
                            : "destructive"
                    }
                  >
                    {it.severity}
                  </Badge>
                  <Select
                    value={it.status}
                    onValueChange={(status) =>
                      incidentUpdateMutation.mutate({
                        id: it.id,
                        status: status as "open" | "investigating" | "resolved",
                      })
                    }
                  >
                    <SelectTrigger className="h-10 w-40">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="open">Open</SelectItem>
                      <SelectItem value="investigating">Looking into it</SelectItem>
                      <SelectItem value="resolved">Closed out</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex-row flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle>Controls and outside services</CardTitle>
            <CardDescription>
              What the software enforces on its own, and every outside service that touches facility
              data. Hand this to a customer security review.
            </CardDescription>
          </div>
          <Button variant="outline" onClick={downloadControls}>
            Download
          </Button>
        </CardHeader>
        <CardContent className="grid gap-6 lg:grid-cols-2">
          <div className="space-y-2">
            <p className="text-sm font-medium">Controls in force</p>
            <ul className="space-y-2 text-sm text-muted-foreground">
              {CONTROLS.map((c) => (
                <li key={c.id} className="rounded-md border p-3">
                  <span className="font-medium text-foreground">{c.area}</span> — {c.control}
                  <span className="block text-xs">Proof: {c.evidence}</span>
                </li>
              ))}
            </ul>
          </div>
          <div className="space-y-2">
            <p className="text-sm font-medium">Outside services</p>
            <ul className="space-y-2 text-sm text-muted-foreground">
              {VENDORS.map((v) => (
                <li key={v.name} className="rounded-md border p-3">
                  <span className="font-medium text-foreground">{v.name}</span> — {v.purpose}
                  <span className="block text-xs">
                    Receives: {v.data} · {v.region}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
