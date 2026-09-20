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
import { getCredentials, runCredentialSweepFn, saveCredentialFn } from "@/lib/ops.functions";
import { getEmployees } from "@/lib/staffing.functions";

export const Route = createFileRoute("/_authenticated/credentials")({
  head: () => ({
    meta: [
      { title: "License & certification countdown — CoverGrid" },
      {
        name: "description",
        content:
          "Every license, CPR card, TB test and vaccine with a countdown. Staff are warned a week ahead and taken off the schedule automatically if a credential lapses.",
      },
      { property: "og:title", content: "License & certification countdown — CoverGrid" },
      {
        property: "og:description",
        content: "Warned a week ahead, off the schedule the day it lapses.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: CredentialsPage,
});

const KINDS = [
  "Nursing license",
  "QMA certification",
  "CNA certification",
  "CPR",
  "TB test",
  "Flu vaccine",
  "Background check",
];

function CredentialsPage() {
  const qc = useQueryClient();
  const load = useServerFn(getCredentials);
  const loadTeam = useServerFn(getEmployees);
  const save = useServerFn(saveCredentialFn);
  const sweep = useServerFn(runCredentialSweepFn);
  const [form, setForm] = useState<Record<string, string> | null>(null);

  const { data, isLoading } = useQuery({ queryKey: ["credentials"], queryFn: () => load() });
  const team = useQuery({
    queryKey: ["team-lite"],
    queryFn: () => loadTeam(),
    enabled: Boolean(form),
  });

  const saveMut = useMutation({
    mutationFn: (f: Record<string, string>) =>
      save({
        data: {
          id: f["id"] || null,
          employeeId: f["employeeId"] ?? "",
          kind: f["kind"] ?? "CPR",
          identifier: f["identifier"] ?? "",
          expiresOn: f["expiresOn"] ?? "",
          notes: f["notes"] ?? "",
        },
      }),
    onSuccess: () => {
      toast.success("Credential saved.");
      setForm(null);
      void qc.invalidateQueries({ queryKey: ["credentials"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const sweepMut = useMutation({
    mutationFn: () => sweep(),
    onSuccess: (r) => {
      toast.success(
        `${r.warned.length} renewal reminder(s) sent, ${r.removed.length} person(s) pulled from the schedule.`,
      );
      void qc.invalidateQueries();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const rows = data?.rows ?? [];
  const isMine = data?.mine ?? false;
  const badge = (state: string) =>
    state === "expired"
      ? "destructive"
      : state === "expiring"
        ? "destructive"
        : state === "soon"
          ? "secondary"
          : "outline";

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl">
            {isMine ? "My licenses & certifications" : "Licenses & certifications"}
          </h1>
          <p className="text-muted-foreground">
            Everyone gets a reminder a week before anything expires. If it lapses, that person comes
            off the schedule until it is current again — no one works unlicensed.
          </p>
        </div>
        {!isMine && (
          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={() => sweepMut.mutate()}
              disabled={sweepMut.isPending}
            >
              Run the check now
            </Button>
            <Button onClick={() => setForm({ id: "", kind: "CPR" })}>Add a credential</Button>
          </div>
        )}
      </div>

      {!isMine && (
        <div className="grid gap-4 sm:grid-cols-3">
          {[
            ["Expired", data?.expired.length ?? 0, "Off the schedule until renewed"],
            ["Expiring within a week", data?.expiring.length ?? 0, "Reminders already sent"],
            ["Expiring within a month", data?.soon.length ?? 0, "Plenty of time to renew"],
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
      )}

      <Card>
        <CardHeader>
          <CardTitle>Countdown</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {isLoading && <p className="text-muted-foreground">Loading…</p>}
          {!isLoading && rows.length === 0 && (
            <p className="text-muted-foreground">Nothing on file yet.</p>
          )}
          {rows.map((r) => (
            <div
              key={r.id}
              className="flex flex-wrap items-center justify-between gap-2 rounded-lg border p-3"
            >
              <div>
                <p className="font-medium">
                  {r.employee}{" "}
                  <span className="text-xs text-muted-foreground">{r.positionLabel}</span>
                </p>
                <p className="text-sm text-muted-foreground">
                  {r.kind}
                  {r.identifier && ` · ${r.identifier}`} · expires {r.expiresOn}
                </p>
              </div>
              <div className="flex items-center gap-2">
                {r.removedFromSchedule && <Badge variant="destructive">Off the schedule</Badge>}
                <Badge variant={badge(r.state)}>
                  {r.daysLeft < 0
                    ? `Expired ${Math.abs(r.daysLeft)} day(s) ago`
                    : `${r.daysLeft} day(s) left`}
                </Badge>
                {!isMine && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() =>
                      setForm({
                        id: r.id,
                        employeeId: r.employeeId,
                        kind: r.kind,
                        identifier: r.identifier,
                        expiresOn: r.expiresOn,
                        notes: r.notes,
                      })
                    }
                  >
                    Update
                  </Button>
                )}
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      <Dialog open={Boolean(form)} onOpenChange={(o) => !o && setForm(null)}>
        <DialogContent className="max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{form?.["id"] ? "Update credential" : "Add a credential"}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3">
            <div className="grid gap-1">
              <Label htmlFor="cred-emp">Employee</Label>
              <select
                id="cred-emp"
                className="h-9 rounded-md border bg-background px-2 text-sm"
                value={form?.["employeeId"] ?? ""}
                onChange={(e) => setForm({ ...(form ?? {}), employeeId: e.target.value })}
              >
                <option value="">Choose a person…</option>
                {(team.data?.employees ?? []).map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="grid gap-1">
              <Label htmlFor="cred-kind">What kind</Label>
              <select
                id="cred-kind"
                className="h-9 rounded-md border bg-background px-2 text-sm"
                value={form?.["kind"] ?? "CPR"}
                onChange={(e) => setForm({ ...(form ?? {}), kind: e.target.value })}
              >
                {KINDS.map((k) => (
                  <option key={k}>{k}</option>
                ))}
              </select>
            </div>
            <div className="grid gap-1">
              <Label htmlFor="cred-id">License or certificate number</Label>
              <Input
                id="cred-id"
                value={form?.["identifier"] ?? ""}
                onChange={(e) => setForm({ ...(form ?? {}), identifier: e.target.value })}
              />
            </div>
            <div className="grid gap-1">
              <Label htmlFor="cred-exp">Expires on</Label>
              <Input
                id="cred-exp"
                type="date"
                value={form?.["expiresOn"] ?? ""}
                onChange={(e) => setForm({ ...(form ?? {}), expiresOn: e.target.value })}
              />
            </div>
            <Button onClick={() => form && saveMut.mutate(form)} disabled={saveMut.isPending}>
              Save
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
