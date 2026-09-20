import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";

import { OnboardingTimelineDialog } from "@/components/onboarding-timeline";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  convertNewHireFn,
  deleteNewHireFn,
  getNewHires,
  saveNewHireFn,
  toggleNewHireStepFn,
} from "@/lib/onboarding.functions";

export const Route = createFileRoute("/_authenticated/new-hires")({
  head: () => ({
    meta: [
      { title: "New hires & onboarding — CoverGrid" },
      {
        name: "description",
        content:
          "Keep everything about people coming onboard in one place: offer and start dates, orientation, badge and charting logins, and every onboarding step until they hit the floor.",
      },
      { property: "og:title", content: "New hires & onboarding — CoverGrid" },
      {
        property: "og:description",
        content: "Every new person, every step, all the way to their first shift.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: NewHiresPage,
});

const STEPS: Array<[string, string]> = [
  ["offer_accepted", "Offer accepted"],
  ["background_check_done", "Background check"],
  ["drug_screen_done", "Drug screen"],
  ["physical_tb_done", "Physical / TB test"],
  ["license_verified", "License verified"],
  ["paperwork_done", "Paperwork & I-9"],
  ["badge_issued", "Badge & clock-in number"],
  ["charting_login_created", "Charting login created"],
  ["orientation_scheduled", "Orientation scheduled"],
  ["added_to_schedule", "Added to the schedule"],
];

const POSITIONS: Array<[string, string]> = [
  ["cna", "CNA"],
  ["qma", "QMA"],
  ["nurse", "Nurse"],
];
const SHIFTS: Array<[string, string]> = [
  ["first", "1st shift"],
  ["second", "2nd shift"],
  ["third", "3rd shift"],
];

type Form = Record<string, string>;

function NewHiresPage() {
  const qc = useQueryClient();
  const load = useServerFn(getNewHires);
  const save = useServerFn(saveNewHireFn);
  const toggle = useServerFn(toggleNewHireStepFn);
  const remove = useServerFn(deleteNewHireFn);
  const convert = useServerFn(convertNewHireFn);
  const [form, setForm] = useState<Form | null>(null);
  const [timelineId, setTimelineId] = useState<string | null>(null);

  const { data, isLoading, error } = useQuery({ queryKey: ["new-hires"], queryFn: () => load() });

  const invalidate = () => void qc.invalidateQueries({ queryKey: ["new-hires"] });

  const saveMut = useMutation({
    mutationFn: (f: Form) =>
      save({
        data: {
          id: f["id"] || null,
          fullName: f["fullName"] ?? "",
          email: f["email"] ?? "",
          phone: f["phone"] ?? "",
          position: (f["position"] ?? "cna") as "cna" | "qma" | "nurse",
          unitId: f["unitId"] || null,
          shift: (f["shift"] || null) as "first" | "second" | "third" | null,
          daysPerWeek: Number(f["daysPerWeek"] ?? 4) || 4,
          hourlyRate: Number(f["hourlyRate"] ?? 0) || 0,
          employmentType: f["employmentType"] ?? "full_time",
          source: f["source"] ?? "",
          recruiter: f["recruiter"] ?? "",
          offerDate: f["offerDate"] || null,
          startDate: f["startDate"] || null,
          orientationStart: f["orientationStart"] || null,
          orientationEnd: f["orientationEnd"] || null,
          preceptorId: f["preceptorId"] || null,
          clockInNumber: f["clockInNumber"] ?? "",
          chartingUsername: f["chartingUsername"] ?? "",
          payrollId: f["payrollId"] ?? "",
          emergencyContactName: f["emergencyContactName"] ?? "",
          emergencyContactPhone: f["emergencyContactPhone"] ?? "",
          licenseNumber: f["licenseNumber"] ?? "",
          licenseExpiresOn: f["licenseExpiresOn"] || null,
          notes: f["notes"] ?? "",
        },
      }),
    onSuccess: () => {
      toast.success("New hire saved.");
      setForm(null);
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const stepMut = useMutation({
    mutationFn: (v: { id: string; key: string; value: boolean }) => toggle({ data: v }),
    onSuccess: invalidate,
    onError: (e: Error) => toast.error(e.message),
  });

  const removeMut = useMutation({
    mutationFn: (id: string) => remove({ data: { id } }),
    onSuccess: () => {
      toast.success("Removed.");
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const convertMut = useMutation({
    mutationFn: (id: string) => convert({ data: { id } }),
    onSuccess: (res) => {
      const p = (res as { payroll?: { message: string } | null } | undefined)?.payroll;
      toast.success(
        "Added to the roster in orientation mode.",
        p ? { description: p.message, duration: 8000 } : undefined,
      );
      void qc.invalidateQueries();
    },

    onError: (e: Error) => toast.error(e.message),
  });

  if (error) {
    return <p className="text-muted-foreground">New hires are only visible to managers.</p>;
  }

  const rows = data?.rows ?? [];
  const units = data?.units ?? [];
  const staff = data?.staff ?? [];
  const unitName = (id: string | null) =>
    units.find((u) => u.id === id)?.name ?? "Unit not set yet";

  const field = (key: string, label: string, type = "text") => (
    <div className="space-y-1.5">
      <Label htmlFor={key}>{label}</Label>
      <Input
        id={key}
        type={type}
        value={form?.[key] ?? ""}
        onChange={(e) => setForm((f) => ({ ...(f ?? {}), [key]: e.target.value }))}
      />
    </div>
  );

  const select = (
    key: string,
    label: string,
    options: Array<[string, string]>,
    placeholder: string,
  ) => (
    <div className="space-y-1.5">
      <Label htmlFor={key}>{label}</Label>
      <select
        id={key}
        className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
        value={form?.[key] ?? ""}
        onChange={(e) => setForm((f) => ({ ...(f ?? {}), [key]: e.target.value }))}
      >
        <option value="">{placeholder}</option>
        {options.map(([v, l]) => (
          <option key={v} value={v}>
            {l}
          </option>
        ))}
      </select>
    </div>
  );

  return (
    <div className="space-y-6">
      <OnboardingTimelineDialog hireId={timelineId} onClose={() => setTimelineId(null)} />
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl">New hires</h1>
          <p className="max-w-2xl text-muted-foreground">
            Everything about the people coming onboard — offer and start dates, orientation week,
            badge and charting logins, and every step that has to be finished before their first
            shift. When the checklist is done, put them on the roster in orientation mode with one
            click.
          </p>
        </div>
        <Button onClick={() => setForm({ id: "", position: "cna", daysPerWeek: "4" })}>
          Add a new hire
        </Button>
      </div>

      <div className="grid gap-4 sm:grid-cols-4">
        {[
          ["Onboarding now", data?.counts.onboarding ?? 0, "Not on the floor yet"],
          ["Start date coming up", data?.counts.startingSoon ?? 0, "Scheduled to start"],
          ["Still missing steps", data?.counts.needsAttention ?? 0, "Checklist not finished"],
          ["Hired & on the roster", data?.counts.hired ?? 0, "Working in orientation"],
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

      {isLoading && <p className="text-muted-foreground">Loading new hires…</p>}
      {!isLoading && rows.length === 0 && (
        <Card>
          <CardContent className="py-10 text-center text-muted-foreground">
            No one is onboarding right now. Add the first new hire to start tracking them.
          </CardContent>
        </Card>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        {rows.map((r) => (
          <Card key={r.id}>
            <CardHeader className="pb-3">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <CardTitle className="font-display text-xl">{r.full_name}</CardTitle>
                  <p className="text-sm text-muted-foreground">
                    {POSITIONS.find(([v]) => v === r.position)?.[1]} · {unitName(r.unit_id)} ·{" "}
                    {SHIFTS.find(([v]) => v === r.shift)?.[1] ?? "Shift not set yet"}
                  </p>
                </div>
                <Badge
                  variant={
                    r.status === "hired" ? "outline" : r.progress === 100 ? "default" : "secondary"
                  }
                >
                  {r.status === "hired" ? "On the roster" : `${r.progress}% ready`}
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-2 text-sm">
                <p className="text-muted-foreground">Starts</p>
                <p>{r.start_date ?? "Not set"}</p>
                <p className="text-muted-foreground">Orientation</p>
                <p>
                  {r.orientation_start
                    ? `${r.orientation_start} → ${r.orientation_end ?? "?"}`
                    : "Not scheduled"}
                </p>
                <p className="text-muted-foreground">Preceptor</p>
                <p>{staff.find((s) => s.id === r.preceptor_id)?.full_name ?? "Not assigned"}</p>
                <p className="text-muted-foreground">Phone</p>
                <p>{r.phone || "—"}</p>
                <p className="text-muted-foreground">Clock-in number</p>
                <p>{r.clock_in_number || "Not issued"}</p>
                <p className="text-muted-foreground">Charting login</p>
                <p>{r.charting_username || "Not created"}</p>
                <p className="text-muted-foreground">Pay</p>
                <p>
                  ${Number(r.hourly_rate).toFixed(2)}/hr · {r.days_per_week} days/week
                </p>
              </div>

              <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                <div className="h-full bg-primary" style={{ width: `${r.progress}%` }} />
              </div>

              <div className="grid gap-2 sm:grid-cols-2">
                {STEPS.map(([key, label]) => (
                  <label key={key} className="flex items-center gap-2 text-sm">
                    <Checkbox
                      checked={Boolean((r as unknown as Record<string, boolean>)[key])}
                      onCheckedChange={(v) => stepMut.mutate({ id: r.id, key, value: Boolean(v) })}
                    />
                    <span>{label}</span>
                  </label>
                ))}
              </div>

              {r.notes && <p className="rounded-md bg-muted/50 p-3 text-sm">{r.notes}</p>}

              <div className="flex flex-wrap gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    setForm({
                      id: r.id,
                      fullName: r.full_name,
                      email: r.email ?? "",
                      phone: r.phone ?? "",
                      position: r.position,
                      unitId: r.unit_id ?? "",
                      shift: r.shift ?? "",
                      daysPerWeek: String(r.days_per_week),
                      hourlyRate: String(r.hourly_rate),
                      employmentType: r.employment_type,
                      source: r.source,
                      recruiter: r.recruiter,
                      offerDate: r.offer_date ?? "",
                      startDate: r.start_date ?? "",
                      orientationStart: r.orientation_start ?? "",
                      orientationEnd: r.orientation_end ?? "",
                      preceptorId: r.preceptor_id ?? "",
                      clockInNumber: r.clock_in_number,
                      chartingUsername: r.charting_username,
                      payrollId: r.payroll_id,
                      emergencyContactName: r.emergency_contact_name,
                      emergencyContactPhone: r.emergency_contact_phone,
                      licenseNumber: r.license_number,
                      licenseExpiresOn: r.license_expires_on ?? "",
                      notes: r.notes,
                    })
                  }
                >
                  Edit
                </Button>
                <Button variant="outline" size="sm" onClick={() => setTimelineId(r.id)}>
                  Timeline
                </Button>
                {r.status !== "hired" && (
                  <Button
                    size="sm"
                    onClick={() => convertMut.mutate(r.id)}
                    disabled={convertMut.isPending}
                  >
                    Add to the roster
                  </Button>
                )}
                <Button variant="ghost" size="sm" onClick={() => removeMut.mutate(r.id)}>
                  Remove
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Dialog open={Boolean(form)} onOpenChange={(o) => !o && setForm(null)}>
        <DialogContent className="max-h-[85vh] max-w-3xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{form?.["id"] ? "Edit new hire" : "Add a new hire"}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 sm:grid-cols-2">
            {field("fullName", "Full name")}
            {select("position", "Position", POSITIONS, "Pick a position")}
            {field("phone", "Phone")}
            {field("email", "Email", "email")}
            {select(
              "unitId",
              "Unit",
              units.map((u) => [u.id, u.name] as [string, string]),
              "Not decided yet",
            )}
            {select("shift", "Shift", SHIFTS, "Not decided yet")}
            {field("daysPerWeek", "Days per week", "number")}
            {field("hourlyRate", "Hourly rate", "number")}
            {select(
              "employmentType",
              "Employment type",
              [
                ["full_time", "Full time"],
                ["part_time", "Part time"],
                ["prn", "PRN"],
              ],
              "Pick one",
            )}
            {field("source", "Where they came from")}
            {field("recruiter", "Recruiter / hiring manager")}
            {field("offerDate", "Offer date", "date")}
            {field("startDate", "Start date", "date")}
            {field("orientationStart", "Orientation starts", "date")}
            {field("orientationEnd", "Orientation ends", "date")}
            {select(
              "preceptorId",
              "Preceptor",
              staff.map((s) => [s.id, s.full_name] as [string, string]),
              "Not assigned",
            )}
            {field("clockInNumber", "Clock-in number")}
            {field("chartingUsername", "Charting username")}
            {field("payrollId", "Payroll ID")}
            {field("licenseNumber", "License / certification number")}
            {field("licenseExpiresOn", "License expires", "date")}
            {field("emergencyContactName", "Emergency contact")}
            {field("emergencyContactPhone", "Emergency contact phone")}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="notes">Notes</Label>
            <Textarea
              id="notes"
              rows={3}
              value={form?.["notes"] ?? ""}
              onChange={(e) => setForm((f) => ({ ...(f ?? {}), notes: e.target.value }))}
            />
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setForm(null)}>
              Cancel
            </Button>
            <Button
              onClick={() => form && saveMut.mutate(form)}
              disabled={saveMut.isPending || !(form?.["fullName"] ?? "").trim()}
            >
              Save
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
