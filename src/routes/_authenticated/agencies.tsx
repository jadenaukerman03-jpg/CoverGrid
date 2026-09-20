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
import { Progress } from "@/components/ui/progress";
import { Textarea } from "@/components/ui/textarea";
import {
  getAgencyBoard,
  getAgencyStaff,
  saveAgencyFn,
  saveAgencyStaffFn,
} from "@/lib/ops.functions";
import { POSITIONS, POSITION_LABEL, type PositionType } from "@/lib/facility";

export const Route = createFileRoute("/_authenticated/agencies")({
  head: () => ({
    meta: [
      { title: "Agency staffing & budget — CoverGrid" },
      {
        name: "description",
        content:
          "Track every staffing agency you use, how many shifts and dollars they have left this week, and each agency worker's charting login, clock-in number, unit and shift.",
      },
      { property: "og:title", content: "Agency staffing & budget — CoverGrid" },
      {
        property: "og:description",
        content: "Agency usage, weekly budgets, shift limits and worker details in one place.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: AgenciesPage,
});

const money = (n: number) => `$${n.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;

function AgenciesPage() {
  const qc = useQueryClient();
  const load = useServerFn(getAgencyBoard);
  const loadStaff = useServerFn(getAgencyStaff);
  const saveAgency = useServerFn(saveAgencyFn);
  const saveStaff = useServerFn(saveAgencyStaffFn);

  const [agencyForm, setAgencyForm] = useState<Record<string, string> | null>(null);
  const [staffForm, setStaffForm] = useState<Record<string, string> | null>(null);
  const [detailId, setDetailId] = useState<string | null>(null);

  const { data, isLoading, error } = useQuery({
    queryKey: ["agency-board"],
    queryFn: () => load({ data: {} }),
  });
  const detail = useQuery({
    queryKey: ["agency-staff", detailId],
    queryFn: () => loadStaff({ data: { agencyStaffId: detailId! } }),
    enabled: Boolean(detailId),
  });

  const agencyMut = useMutation({
    mutationFn: (f: Record<string, string>) =>
      saveAgency({
        data: {
          id: f["id"] || null,
          name: f["name"] ?? "",
          contactName: f["contactName"] ?? "",
          contactEmail: f["contactEmail"] ?? "",
          contactPhone: f["contactPhone"] ?? "",
          weeklyBudget: Number(f["weeklyBudget"] ?? 0),
          maxShiftsPerWeek: Number(f["maxShiftsPerWeek"] ?? 0),
          rateNurse: Number(f["rateNurse"] ?? 0),
          rateQma: Number(f["rateQma"] ?? 0),
          rateCna: Number(f["rateCna"] ?? 0),
          notes: f["notes"] ?? "",
        },
      }),
    onSuccess: () => {
      toast.success("Agency saved.");
      setAgencyForm(null);
      void qc.invalidateQueries({ queryKey: ["agency-board"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const staffMut = useMutation({
    mutationFn: (f: Record<string, string>) =>
      saveStaff({
        data: {
          id: f["id"] || null,
          agencyId: f["agencyId"] ?? "",
          fullName: f["fullName"] ?? "",
          position: (f["position"] ?? "cna") as PositionType,
          phone: f["phone"] ?? "",
          email: f["email"] ?? "",
          chartingUsername: f["chartingUsername"] ?? "",
          chartingPassword: f["chartingPassword"] ?? "",
          clockInNumber: f["clockInNumber"] ?? "",
          notes: f["notes"] ?? "",
        },
      }),
    onSuccess: () => {
      toast.success("Agency worker saved.");
      setStaffForm(null);
      void qc.invalidateQueries({ queryKey: ["agency-board"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (error)
    return (
      <p className="text-muted-foreground">Agency information is available to managers only.</p>
    );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl">Agency staffing</h1>
          <p className="text-muted-foreground">
            Every agency you use, what they have left this week, and everything their people need to
            work the floor.
          </p>
        </div>
        <Button onClick={() => setAgencyForm({ id: "" })}>Add an agency</Button>
      </div>

      {isLoading && <p className="text-muted-foreground">Loading…</p>}

      {(data?.agencies ?? []).map((a) => (
        <Card key={a.id}>
          <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3">
            <div>
              <CardTitle className="flex items-center gap-2">
                {a.name}
                <Badge
                  variant={
                    a.status === "over"
                      ? "destructive"
                      : a.status === "close"
                        ? "secondary"
                        : "outline"
                  }
                >
                  {a.status === "over"
                    ? "Over limit"
                    : a.status === "close"
                      ? "Close to limit"
                      : "Within limits"}
                </Badge>
              </CardTitle>
              <p className="text-sm text-muted-foreground">
                {a.contactName || "No contact on file"} {a.contactPhone && `· ${a.contactPhone}`}{" "}
                {a.contactEmail && `· ${a.contactEmail}`}
              </p>
            </div>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setStaffForm({ id: "", agencyId: a.id, position: "cna" })}
              >
                Add worker
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() =>
                  setAgencyForm({
                    id: a.id,
                    name: a.name,
                    contactName: a.contactName,
                    contactEmail: a.contactEmail,
                    contactPhone: a.contactPhone,
                    weeklyBudget: String(a.weeklyBudget),
                    maxShiftsPerWeek: String(a.maxShiftsPerWeek),
                    rateNurse: String(a.rates.nurse),
                    rateQma: String(a.rates.qma),
                    rateCna: String(a.rates.cna),
                    notes: a.notes,
                  })
                }
              >
                Edit
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {a.warning && (
              <p className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
                {a.warning}
              </p>
            )}

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <div className="flex justify-between text-sm">
                  <span>Money spent this week</span>
                  <span className="font-medium">
                    {money(a.spend)} {a.weeklyBudget > 0 && `of ${money(a.weeklyBudget)}`}
                  </span>
                </div>
                <Progress value={Math.min(100, a.budgetPercent)} className="mt-2" />
                <p className="mt-1 text-xs text-muted-foreground">
                  {a.budgetLeft === null
                    ? "No dollar limit set."
                    : `${money(Math.max(0, a.budgetLeft))} left.`}
                </p>
              </div>
              <div>
                <div className="flex justify-between text-sm">
                  <span>Shifts used this week</span>
                  <span className="font-medium">
                    {a.shiftsUsed} {a.maxShiftsPerWeek > 0 && `of ${a.maxShiftsPerWeek}`}
                  </span>
                </div>
                <Progress
                  value={
                    a.maxShiftsPerWeek
                      ? Math.min(100, (a.shiftsUsed / a.maxShiftsPerWeek) * 100)
                      : 0
                  }
                  className="mt-2"
                />
                <p className="mt-1 text-xs text-muted-foreground">
                  {a.shiftsLeft === null
                    ? "No shift limit set."
                    : `${a.shiftsLeft} shift(s) left this week.`}
                </p>
              </div>
            </div>

            <p className="text-xs text-muted-foreground">
              Rates: nurse {money(a.rates.nurse)}/hr · QMA {money(a.rates.qma)}/hr · CNA{" "}
              {money(a.rates.cna)}/hr
            </p>

            <div className="grid gap-3 md:grid-cols-2">
              {a.staff.length === 0 && (
                <p className="text-sm text-muted-foreground">
                  No workers entered for this agency yet.
                </p>
              )}
              {a.staff.map((s) => (
                <div key={s.id} className="rounded-lg border p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <button
                        className="font-medium underline-offset-2 hover:underline"
                        onClick={() => setDetailId(s.id)}
                      >
                        {s.name}
                      </button>
                      <p className="text-xs text-muted-foreground">
                        {s.positionLabel} · {s.phone || "no phone"}
                      </p>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() =>
                        setStaffForm({
                          id: s.id,
                          agencyId: a.id,
                          fullName: s.name,
                          position: s.position,
                          phone: s.phone,
                          email: s.email,
                          chartingUsername: s.chartingUsername,
                          chartingPassword: s.chartingPassword,
                          clockInNumber: s.clockInNumber,
                          notes: s.notes,
                        })
                      }
                    >
                      Edit
                    </Button>
                  </div>
                  <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
                    <dt className="text-muted-foreground">Charting login</dt>
                    <dd className="font-mono">{s.chartingUsername || "—"}</dd>
                    <dt className="text-muted-foreground">Charting password</dt>
                    <dd className="font-mono">{s.chartingPassword || "—"}</dd>
                    <dt className="text-muted-foreground">Clock-in number</dt>
                    <dd className="font-mono">{s.clockInNumber || "—"}</dd>
                  </dl>
                  {s.upcoming.length > 0 ? (
                    <ul className="mt-2 space-y-1 text-xs">
                      {s.upcoming.slice(0, 3).map((u) => (
                        <li key={u.assignmentId}>
                          {u.date} · {u.unit} · {u.shiftLabel} ({u.window})
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="mt-2 text-xs text-muted-foreground">
                      Not on the schedule this week.
                    </p>
                  )}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      ))}

      <Dialog open={Boolean(agencyForm)} onOpenChange={(o) => !o && setAgencyForm(null)}>
        <DialogContent className="max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{agencyForm?.["id"] ? "Edit agency" : "Add an agency"}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3">
            {[
              ["name", "Agency name"],
              ["contactName", "Contact person"],
              ["contactPhone", "Contact phone"],
              ["contactEmail", "Contact email"],
              ["weeklyBudget", "Weekly dollar budget"],
              ["maxShiftsPerWeek", "Shifts allowed per week"],
              ["rateNurse", "Nurse rate per hour"],
              ["rateQma", "QMA rate per hour"],
              ["rateCna", "CNA rate per hour"],
            ].map(([key, label]) => (
              <div key={key} className="grid gap-1">
                <Label htmlFor={key}>{label}</Label>
                <Input
                  id={key}
                  value={agencyForm?.[key!] ?? ""}
                  onChange={(e) => setAgencyForm({ ...(agencyForm ?? {}), [key!]: e.target.value })}
                />
              </div>
            ))}
            <div className="grid gap-1">
              <Label htmlFor="agency-notes">Notes</Label>
              <Textarea
                id="agency-notes"
                value={agencyForm?.["notes"] ?? ""}
                onChange={(e) => setAgencyForm({ ...(agencyForm ?? {}), notes: e.target.value })}
              />
            </div>
            <Button
              onClick={() => agencyForm && agencyMut.mutate(agencyForm)}
              disabled={agencyMut.isPending}
            >
              Save agency
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(staffForm)} onOpenChange={(o) => !o && setStaffForm(null)}>
        <DialogContent className="max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {staffForm?.["id"] ? "Edit agency worker" : "Add agency worker"}
            </DialogTitle>
          </DialogHeader>
          <div className="grid gap-3">
            <div className="grid gap-1">
              <Label>Position</Label>
              <div className="flex gap-2">
                {POSITIONS.map((p) => (
                  <Button
                    key={p}
                    type="button"
                    variant={staffForm?.["position"] === p ? "default" : "outline"}
                    size="sm"
                    onClick={() => setStaffForm({ ...(staffForm ?? {}), position: p })}
                  >
                    {POSITION_LABEL[p]}
                  </Button>
                ))}
              </div>
            </div>
            {[
              ["fullName", "Full name"],
              ["phone", "Phone"],
              ["email", "Email"],
              ["chartingUsername", "Charting username"],
              ["chartingPassword", "Charting password"],
              ["clockInNumber", "Clock-in number"],
            ].map(([key, label]) => (
              <div key={key} className="grid gap-1">
                <Label htmlFor={`s-${key}`}>{label}</Label>
                <Input
                  id={`s-${key}`}
                  value={staffForm?.[key!] ?? ""}
                  onChange={(e) => setStaffForm({ ...(staffForm ?? {}), [key!]: e.target.value })}
                />
              </div>
            ))}
            <Button
              onClick={() => staffForm && staffMut.mutate(staffForm)}
              disabled={staffMut.isPending}
            >
              Save worker
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(detailId)} onOpenChange={(o) => !o && setDetailId(null)}>
        <DialogContent className="max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{detail.data?.name ?? "Agency worker"}</DialogTitle>
          </DialogHeader>
          {detail.data && (
            <div className="space-y-4 text-sm">
              <p className="text-muted-foreground">
                {detail.data.agency} · {detail.data.positionLabel}
              </p>
              <dl className="grid grid-cols-2 gap-x-3 gap-y-1">
                <dt className="text-muted-foreground">Charting login</dt>
                <dd className="font-mono">{detail.data.chartingUsername || "—"}</dd>
                <dt className="text-muted-foreground">Charting password</dt>
                <dd className="font-mono">{detail.data.chartingPassword || "—"}</dd>
                <dt className="text-muted-foreground">Clock-in number</dt>
                <dd className="font-mono">{detail.data.clockInNumber || "—"}</dd>
              </dl>
              <div className="space-y-3">
                {detail.data.shifts.length === 0 && (
                  <p className="text-muted-foreground">No upcoming shifts.</p>
                )}
                {detail.data.shifts.map((s) => (
                  <div key={s.assignmentId} className="rounded-lg border p-3">
                    <p className="font-medium">
                      {s.date} · {s.unit} · {s.shiftLabel}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {s.window} · working as {s.position}
                    </p>
                    <p className="mt-2 text-xs">
                      <span className="text-muted-foreground">Working with: </span>
                      {s.workingWith.length
                        ? s.workingWith
                            .map(
                              (w) =>
                                `${w.name} (${w.position}${w.training ? ", in orientation" : ""})`,
                            )
                            .join(", ")
                        : "No one else scheduled yet."}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
