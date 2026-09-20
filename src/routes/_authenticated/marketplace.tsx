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
import { Textarea } from "@/components/ui/textarea";
import {
  acceptOfferFn,
  declineOfferFn,
  deleteMarketplaceWorkerFn,
  getMarketplaceBoard,
  offerShiftFn,
  saveMarketplaceWorkerFn,
  setWorkerStatusFn,
} from "@/lib/marketplace.functions";

export const Route = createFileRoute("/_authenticated/marketplace")({
  head: () => ({
    meta: [
      { title: "Per-diem pool — CoverGrid" },
      {
        name: "description",
        content:
          "Fill the shifts your own people cannot cover with a vetted per-diem pool, at a fraction of agency cost, offered automatically the moment a hole appears.",
      },
      { property: "og:title", content: "Per-diem pool — CoverGrid" },
      {
        property: "og:description",
        content: "Vetted per-diem workers, offered automatically, cheaper than agency.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: MarketplacePage,
});

const POSITIONS = [
  ["cna", "CNA"],
  ["qma", "QMA"],
  ["nurse", "Nurse"],
] as const;

const selectClass =
  "h-10 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

type Form = Record<string, string>;

function statusTone(status: string) {
  if (status === "approved" || status === "claimed")
    return "bg-primary/10 text-primary border-primary/30";
  if (status === "declined" || status === "suspended" || status === "expired")
    return "bg-destructive/10 text-destructive border-destructive/30";
  return "bg-muted text-muted-foreground";
}

function MarketplacePage() {
  const qc = useQueryClient();
  const load = useServerFn(getMarketplaceBoard);
  const save = useServerFn(saveMarketplaceWorkerFn);
  const setStatus = useServerFn(setWorkerStatusFn);
  const remove = useServerFn(deleteMarketplaceWorkerFn);
  const offer = useServerFn(offerShiftFn);
  const accept = useServerFn(acceptOfferFn);
  const decline = useServerFn(declineOfferFn);
  const [form, setForm] = useState<Form | null>(null);

  const { data, isLoading, error } = useQuery({ queryKey: ["marketplace"], queryFn: () => load() });
  const invalidate = () => void qc.invalidateQueries({ queryKey: ["marketplace"] });
  const fail = (e: Error) => toast.error(e.message);

  const saveMut = useMutation({
    mutationFn: (f: Form) =>
      save({
        data: {
          id: f["id"] || null,
          fullName: f["fullName"] ?? "",
          position: (f["position"] ?? "cna") as "cna" | "qma" | "nurse",
          phone: f["phone"] ?? "",
          email: f["email"] ?? "",
          city: f["city"] ?? "",
          hourlyRate: Number(f["hourlyRate"] ?? 0) || 0,
          licenseNumber: f["licenseNumber"] ?? "",
          licenseExpiresOn: f["licenseExpiresOn"] || null,
          notes: f["notes"] ?? "",
        },
      }),
    onSuccess: () => {
      toast.success("Per-diem worker saved.");
      setForm(null);
      invalidate();
    },
    onError: fail,
  });

  const statusMut = useMutation({
    mutationFn: (v: { id: string; status: string }) => setStatus({ data: v }),
    onSuccess: invalidate,
    onError: fail,
  });
  const removeMut = useMutation({
    mutationFn: (id: string) => remove({ data: { id } }),
    onSuccess: () => {
      toast.success("Removed from the pool.");
      invalidate();
    },
    onError: fail,
  });
  const offerMut = useMutation({
    mutationFn: (assignmentId: string) => offer({ data: { assignmentId } }),
    onSuccess: (r) => {
      toast.success(r.message);
      invalidate();
    },
    onError: fail,
  });
  const acceptMut = useMutation({
    mutationFn: (offerId: string) => accept({ data: { offerId } }),
    onSuccess: (r) => {
      toast.success(r.message);
      invalidate();
    },
    onError: fail,
  });
  const declineMut = useMutation({
    mutationFn: (v: { offerId: string; noShow: boolean }) => decline({ data: v }),
    onSuccess: invalidate,
    onError: fail,
  });

  if (isLoading) return <p className="p-6 text-muted-foreground">Loading the per-diem pool…</p>;
  if (error) return <p className="p-6 text-destructive">{(error as Error).message}</p>;
  if (!data) return null;

  const set = (key: string, value: string) => setForm((f) => ({ ...(f ?? {}), [key]: value }));

  return (
    <div className="space-y-6 p-4 md:p-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Per-diem pool</h1>
          <p className="text-sm text-muted-foreground">
            When nobody on your roster can take a shift, it goes out here first — vetted people,
            your rate, no agency markup.
          </p>
        </div>
        <Button onClick={() => setForm({ position: "cna" })}>Add a per-diem worker</Button>
      </header>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        {[
          ["Approved & ready", data.counts.approved],
          ["Waiting on approval", data.counts.pending],
          ["Offers out now", data.counts.openOffers],
          ["Shifts claimed", data.counts.claimed],
          ["Saved vs agency", `$${data.counts.savings.toLocaleString()}`],
        ].map(([label, value]) => (
          <Card key={String(label)}>
            <CardContent className="p-4">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
              <p className="mt-1 text-2xl font-semibold">{value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Open shifts you can send out</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {data.openShifts.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Nothing open right now. Everything is covered.
            </p>
          ) : (
            data.openShifts.map((s) => (
              <div
                key={s.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-md border p-3 text-sm"
              >
                <div>
                  <p className="font-medium">
                    {s.shift_date} · {s.shiftLabel} · {s.unitName}
                  </p>
                  <p className="text-muted-foreground">{s.positionLabel}</p>
                </div>
                {s.alreadyOffered ? (
                  <Badge variant="outline">Already out to the pool</Badge>
                ) : (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => offerMut.mutate(s.id)}
                    disabled={offerMut.isPending}
                  >
                    Offer to the pool
                  </Button>
                )}
              </div>
            ))
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Offers</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {data.offers.length === 0 ? (
            <p className="text-sm text-muted-foreground">No offers have gone out yet.</p>
          ) : (
            data.offers.map((o) => (
              <div
                key={o.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-md border p-3 text-sm"
              >
                <div>
                  <p className="font-medium">
                    {o.workerName} — {o.shift_date} · {o.shiftLabel} · {o.unitName}
                  </p>
                  <p className="text-muted-foreground">
                    {o.positionLabel} · ${Number(o.offered_rate).toFixed(2)}/hr
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className={statusTone(o.status)}>
                    {o.status}
                  </Badge>
                  {o.status === "offered" && (
                    <>
                      <Button
                        size="sm"
                        onClick={() => acceptMut.mutate(o.id)}
                        disabled={acceptMut.isPending}
                      >
                        Confirm
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => declineMut.mutate({ offerId: o.id, noShow: false })}
                      >
                        Declined
                      </Button>
                    </>
                  )}
                  {o.status === "claimed" && (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => declineMut.mutate({ offerId: o.id, noShow: true })}
                    >
                      Mark no-show
                    </Button>
                  )}
                </div>
              </div>
            ))
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">The pool</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {data.workers.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No per-diem workers yet. Add your first one above.
            </p>
          ) : (
            data.workers.map((w) => (
              <div
                key={w.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-md border p-3 text-sm"
              >
                <div>
                  <p className="font-medium">
                    {w.full_name}{" "}
                    <span className="text-muted-foreground">
                      · {w.position.toUpperCase()} · ${Number(w.hourly_rate).toFixed(2)}/hr
                    </span>
                  </p>
                  <p className="text-muted-foreground">
                    {w.shifts_worked} shift{w.shifts_worked === 1 ? "" : "s"} worked · {w.no_shows}{" "}
                    no-show
                    {w.no_shows === 1 ? "" : "s"} · reliability {w.reliability}%
                    {w.licenseExpiring ? ` · license expires ${w.licenseExpiring}` : ""}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className={statusTone(w.status)}>
                    {w.status}
                  </Badge>
                  {w.status !== "approved" && (
                    <Button
                      size="sm"
                      onClick={() => statusMut.mutate({ id: w.id, status: "approved" })}
                    >
                      Approve
                    </Button>
                  )}
                  {w.status === "approved" && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => statusMut.mutate({ id: w.id, status: "suspended" })}
                    >
                      Suspend
                    </Button>
                  )}
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() =>
                      setForm({
                        id: w.id,
                        fullName: w.full_name,
                        position: w.position,
                        phone: w.phone ?? "",
                        email: w.email ?? "",
                        city: w.city ?? "",
                        hourlyRate: String(w.hourly_rate ?? ""),
                        licenseNumber: w.license_number ?? "",
                        licenseExpiresOn: w.license_expires_on ?? "",
                        notes: w.notes ?? "",
                      })
                    }
                  >
                    Edit
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => removeMut.mutate(w.id)}>
                    Remove
                  </Button>
                </div>
              </div>
            ))
          )}
        </CardContent>
      </Card>

      <Dialog open={!!form} onOpenChange={(open) => !open && setForm(null)}>
        <DialogContent className="max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {form?.["id"] ? "Edit per-diem worker" : "Add a per-diem worker"}
            </DialogTitle>
          </DialogHeader>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <Label htmlFor="fullName">Full name</Label>
              <Input
                id="fullName"
                value={form?.["fullName"] ?? ""}
                onChange={(e) => set("fullName", e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="position">Position</Label>
              <select
                id="position"
                className={selectClass}
                value={form?.["position"] ?? "cna"}
                onChange={(e) => set("position", e.target.value)}
              >
                {POSITIONS.map(([v, l]) => (
                  <option key={v} value={v}>
                    {l}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <Label htmlFor="hourlyRate">Hourly rate</Label>
              <Input
                id="hourlyRate"
                inputMode="decimal"
                value={form?.["hourlyRate"] ?? ""}
                onChange={(e) => set("hourlyRate", e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="phone">Phone</Label>
              <Input
                id="phone"
                value={form?.["phone"] ?? ""}
                onChange={(e) => set("phone", e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                value={form?.["email"] ?? ""}
                onChange={(e) => set("email", e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="city">City</Label>
              <Input
                id="city"
                value={form?.["city"] ?? ""}
                onChange={(e) => set("city", e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="licenseNumber">License / certification #</Label>
              <Input
                id="licenseNumber"
                value={form?.["licenseNumber"] ?? ""}
                onChange={(e) => set("licenseNumber", e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="licenseExpiresOn">License expires</Label>
              <Input
                id="licenseExpiresOn"
                type="date"
                value={form?.["licenseExpiresOn"] ?? ""}
                onChange={(e) => set("licenseExpiresOn", e.target.value)}
              />
            </div>
            <div className="sm:col-span-2">
              <Label htmlFor="notes">Notes</Label>
              <Textarea
                id="notes"
                value={form?.["notes"] ?? ""}
                onChange={(e) => set("notes", e.target.value)}
              />
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setForm(null)}>
              Cancel
            </Button>
            <Button onClick={() => form && saveMut.mutate(form)} disabled={saveMut.isPending}>
              {saveMut.isPending ? "Saving…" : "Save"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
