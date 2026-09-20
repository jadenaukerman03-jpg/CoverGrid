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
import { Textarea } from "@/components/ui/textarea";
import {
  approveSwitchFn,
  decidePtoFn,
  getDashboard,
  getFacilityConfig,
  getMeOverview,
  respondSwitchFn,
  submitPtoFn,
} from "@/lib/staffing.functions";

export const Route = createFileRoute("/_authenticated/requests")({
  head: () => ({
    meta: [
      { title: "Requests — CoverGrid" },
      {
        name: "description",
        content:
          "Submit vacation requests, respond to shift switches and review pending approvals.",
      },
      { property: "og:title", content: "Requests — CoverGrid" },
      {
        property: "og:description",
        content: "Vacation requests and shift switches in one workflow.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: RequestsPage,
});

function RequestsPage() {
  const qc = useQueryClient();
  const loadConfig = useServerFn(getFacilityConfig);
  const loadMe = useServerFn(getMeOverview);
  const loadDashboard = useServerFn(getDashboard);
  const submitPto = useServerFn(submitPtoFn);
  const decidePto = useServerFn(decidePtoFn);
  const respondSwitch = useServerFn(respondSwitchFn);
  const approveSwitch = useServerFn(approveSwitchFn);

  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [reason, setReason] = useState("");

  const { data: config } = useQuery({ queryKey: ["facility-config"], queryFn: () => loadConfig() });
  const me = useQuery({ queryKey: ["me"], queryFn: () => loadMe() });
  const manager = useQuery({
    queryKey: ["dashboard"],
    queryFn: () => loadDashboard({ data: {} }),
    enabled: config?.isManager === true,
  });

  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: ["me"] });
    void qc.invalidateQueries({ queryKey: ["dashboard"] });
  };

  const ptoMutation = useMutation({
    mutationFn: () => submitPto({ data: { startDate: start, endDate: end, reason } }),
    onSuccess: (res) => {
      if (res.accepted) toast.success(res.message);
      else toast.error(res.message);
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const respondMutation = useMutation({
    mutationFn: (v: { id: string; accept: boolean }) => respondSwitch({ data: v }),
    onSuccess: () => {
      toast.success("Response recorded.");
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const ptoDecision = useMutation({
    mutationFn: (v: { id: string; approve: boolean }) => decidePto({ data: v }),
    onSuccess: () => {
      toast.success("Decision saved.");
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const switchDecision = useMutation({
    mutationFn: (v: { id: string; approve: boolean }) => approveSwitch({ data: v }),
    onSuccess: () => {
      toast.success("Switch updated.");
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-display text-3xl">Requests</h1>
        <p className="text-muted-foreground">
          Vacation must be requested more than one month in advance.
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Request vacation</CardTitle>
            <CardDescription>
              Requests inside one month are declined automatically by policy.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label htmlFor="start">First day off</Label>
                <Input
                  id="start"
                  type="date"
                  value={start}
                  onChange={(e) => setStart(e.target.value)}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="end">Last day off</Label>
                <Input id="end" type="date" value={end} onChange={(e) => setEnd(e.target.value)} />
              </div>
            </div>
            <Textarea
              placeholder="Reason (optional)"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
            <Button
              disabled={!start || !end || ptoMutation.isPending}
              onClick={() => ptoMutation.mutate()}
            >
              Submit request
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>My requests</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            {(me.data?.pto ?? []).length === 0 && (
              <p className="text-muted-foreground">No vacation requests yet.</p>
            )}
            {(me.data?.pto ?? []).map((p) => (
              <div
                key={p.id}
                className="flex items-center justify-between rounded-md bg-muted/60 px-3 py-2"
              >
                <span>
                  {p.start_date} – {p.end_date}
                </span>
                <Badge variant="secondary" className="capitalize">
                  {p.status}
                </Badge>
              </div>
            ))}
            <h4 className="pt-3 font-medium">Shift switches</h4>
            {(me.data?.switches ?? []).length === 0 && (
              <p className="text-muted-foreground">No switch requests.</p>
            )}
            {(me.data?.switches ?? []).map((s) => (
              <div key={s.id} className="space-y-2 rounded-md bg-muted/60 px-3 py-2">
                <div className="flex items-center justify-between">
                  <span className="capitalize">{s.status}</span>
                  <span className="text-xs text-muted-foreground">{s.validation_notes}</span>
                </div>
                {s.status === "pending" && s.covering_id === me.data?.employee?.id && (
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      onClick={() => respondMutation.mutate({ id: s.id, accept: true })}
                    >
                      Accept shift
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => respondMutation.mutate({ id: s.id, accept: false })}
                    >
                      Decline
                    </Button>
                  </div>
                )}
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      {config?.isManager && (
        <div className="grid gap-6 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Vacation approvals</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              {(manager.data?.pto ?? []).map((p) => (
                <div
                  key={p.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-md border px-3 py-2"
                >
                  <span>
                    {p.employee}: {p.start_date} – {p.end_date}{" "}
                    <Badge variant="secondary" className="capitalize">
                      {p.status}
                    </Badge>
                  </span>
                  {p.status === "pending" && (
                    <span className="flex gap-2">
                      <Button
                        size="sm"
                        onClick={() => ptoDecision.mutate({ id: p.id, approve: true })}
                      >
                        Approve
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => ptoDecision.mutate({ id: p.id, approve: false })}
                      >
                        Decline
                      </Button>
                    </span>
                  )}
                </div>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Shift switch approvals</CardTitle>
              <CardDescription>Both employees confirm, then management signs off.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              {(manager.data?.switches ?? []).map((s) => (
                <div
                  key={s.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-md border px-3 py-2"
                >
                  <span>
                    {s.requester} → {s.covering}{" "}
                    <Badge variant="secondary" className="capitalize">
                      {s.status}
                    </Badge>
                  </span>
                  {s.status === "pending" && (
                    <span className="flex gap-2">
                      <Button
                        size="sm"
                        onClick={() => switchDecision.mutate({ id: s.id, approve: true })}
                      >
                        Approve
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => switchDecision.mutate({ id: s.id, approve: false })}
                      >
                        Decline
                      </Button>
                    </span>
                  )}
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
