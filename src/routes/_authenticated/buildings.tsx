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
import { getFloatPool, saveFacilityFn, setFloatOptinFn } from "@/lib/ops.functions";

export const Route = createFileRoute("/_authenticated/buildings")({
  head: () => ({
    meta: [
      { title: "Buildings & shared float pool — CoverGrid" },
      {
        name: "description",
        content:
          "Manage every building you run and the shared float pool that lets staff help across buildings, balanced by how often each person has already floated.",
      },
      { property: "og:title", content: "Buildings & shared float pool — CoverGrid" },
      {
        property: "og:description",
        content: "One float pool across every building, balanced automatically.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: BuildingsPage,
});

function BuildingsPage() {
  const qc = useQueryClient();
  const load = useServerFn(getFloatPool);
  const saveFacility = useServerFn(saveFacilityFn);
  const setOptin = useServerFn(setFloatOptinFn);
  const [form, setForm] = useState<Record<string, string> | null>(null);

  const { data, isLoading, error } = useQuery({ queryKey: ["float-pool"], queryFn: () => load() });

  const saveMut = useMutation({
    mutationFn: (f: Record<string, string>) =>
      saveFacility({
        data: {
          id: f["id"] || null,
          name: f["name"] ?? "",
          address: f["address"] ?? "",
          weeklyLaborBudget: Number(f["weeklyLaborBudget"] ?? 0),
        },
      }),
    onSuccess: () => {
      toast.success("Building saved.");
      setForm(null);
      void qc.invalidateQueries({ queryKey: ["float-pool"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const optinMut = useMutation({
    mutationFn: (v: { employeeId: string; optin: boolean }) => setOptin({ data: v }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["float-pool"] }),
    onError: (e: Error) => toast.error(e.message),
  });

  if (error)
    return <p className="text-muted-foreground">This page is available to managers only.</p>;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl">Buildings & the float pool</h1>
          <p className="text-muted-foreground">
            Staff who opt in can help out in any building. Whoever has floated the least, with the
            most years in, goes last — so the same people are not always the ones sent away from
            their unit.
          </p>
        </div>
        <Button onClick={() => setForm({ id: "" })}>Add a building</Button>
      </div>

      {isLoading && <p className="text-muted-foreground">Loading…</p>}

      <div className="grid gap-4 md:grid-cols-2">
        {(data?.facilities ?? []).map((f) => (
          <Card key={f.id}>
            <CardHeader className="flex flex-row items-start justify-between gap-2">
              <div>
                <CardTitle>{f.name}</CardTitle>
                <p className="text-sm text-muted-foreground">{f.address || "No address on file"}</p>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() =>
                  setForm({
                    id: f.id,
                    name: f.name,
                    address: f.address,
                    weeklyLaborBudget: String(f.weeklyLaborBudget),
                  })
                }
              >
                Edit
              </Button>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <p>
                Units:{" "}
                {f.units.length ? f.units.map((u) => u.name).join(", ") : "none assigned yet"}
              </p>
              <p className="text-muted-foreground">
                Weekly labor budget ${f.weeklyLaborBudget.toLocaleString()} · {f.poolMembers} in the
                float pool
              </p>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Float pool — next up first</CardTitle>
          <p className="text-sm text-muted-foreground">
            {data?.optedOut ?? 0} staff have not opted in. Only people on this list get sent to
            another unit or building.
          </p>
        </CardHeader>
        <CardContent className="space-y-2">
          {(data?.members ?? []).length === 0 && (
            <p className="text-muted-foreground">Nobody has opted in yet.</p>
          )}
          {(data?.members ?? []).map((m, i) => (
            <div
              key={m.id}
              className="flex flex-wrap items-center justify-between gap-2 rounded-lg border p-3"
            >
              <div>
                <p className="font-medium">
                  <span className="mr-2 text-muted-foreground">#{i + 1}</span>
                  {m.name} <span className="text-xs text-muted-foreground">{m.positionLabel}</span>
                </p>
                <p className="text-sm text-muted-foreground">
                  Floated {m.floatCount} time(s) · last {m.lastFloatedOn ?? "never"} · {m.years}{" "}
                  year(s) of service
                </p>
              </div>
              <div className="flex items-center gap-2">
                {i === 0 && <Badge>Next up</Badge>}
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => optinMut.mutate({ employeeId: m.id, optin: false })}
                >
                  Take out of pool
                </Button>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      <Dialog open={Boolean(form)} onOpenChange={(o) => !o && setForm(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{form?.["id"] ? "Edit building" : "Add a building"}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3">
            {[
              ["name", "Building name"],
              ["address", "Address"],
              ["weeklyLaborBudget", "Weekly labor budget"],
            ].map(([key, label]) => (
              <div key={key} className="grid gap-1">
                <Label htmlFor={`b-${key}`}>{label}</Label>
                <Input
                  id={`b-${key}`}
                  value={form?.[key!] ?? ""}
                  onChange={(e) => setForm({ ...(form ?? {}), [key!]: e.target.value })}
                />
              </div>
            ))}
            <Button onClick={() => form && saveMut.mutate(form)} disabled={saveMut.isPending}>
              Save building
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
