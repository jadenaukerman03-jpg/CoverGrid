import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  getHrBoard,
  recordCompletionFn,
  setDocumentStatusFn,
  signDocumentFn,
  startPacketFn,
  updateScreeningFn,
} from "@/lib/hr.functions";

export const Route = createFileRoute("/_authenticated/hr-compliance")({
  head: () => ({
    meta: [
      { title: "Hiring paperwork & training — CoverGrid" },
      {
        name: "description",
        content:
          "I-9, W-4, handbook signatures, background and registry checks, and every annual in-service — tracked in one place so nobody hits the floor unqualified.",
      },
      { property: "og:title", content: "Hiring paperwork & training — CoverGrid" },
      {
        property: "og:description",
        content: "Signatures, screenings and in-service training, all tracked.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: HrCompliancePage,
});

const selectClass =
  "h-10 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

function tone(status: string) {
  if (["signed", "passed", "completed"].includes(status))
    return "bg-primary/10 text-primary border-primary/30";
  if (["failed", "expired"].includes(status))
    return "bg-destructive/10 text-destructive border-destructive/30";
  return "bg-muted text-muted-foreground";
}

function HrCompliancePage() {
  const qc = useQueryClient();
  const load = useServerFn(getHrBoard);
  const startPacket = useServerFn(startPacketFn);
  const sign = useServerFn(signDocumentFn);
  const setDocStatus = useServerFn(setDocumentStatusFn);
  const updateScreening = useServerFn(updateScreeningFn);
  const recordCompletion = useServerFn(recordCompletionFn);

  const [packetHire, setPacketHire] = useState("");
  const [signing, setSigning] = useState<{ id: string; name: string } | null>(null);
  const [training, setTraining] = useState({ courseId: "", employeeId: "" });

  const { data, isLoading, error } = useQuery({ queryKey: ["hr-board"], queryFn: () => load() });
  const invalidate = () => void qc.invalidateQueries({ queryKey: ["hr-board"] });
  const fail = (e: Error) => toast.error(e.message);

  const packetMut = useMutation({
    mutationFn: (newHireId: string) => startPacket({ data: { newHireId } }),
    onSuccess: (r) => {
      toast.success(`Packet ready: ${r.documents} document(s), ${r.checks} screening(s).`);
      invalidate();
    },
    onError: fail,
  });
  const signMut = useMutation({
    mutationFn: (v: { id: string; signedName: string }) => sign({ data: v }),
    onSuccess: () => {
      toast.success("Signature recorded.");
      setSigning(null);
      invalidate();
    },
    onError: fail,
  });
  const docStatusMut = useMutation({
    mutationFn: (v: { id: string; status: string }) => setDocStatus({ data: v }),
    onSuccess: invalidate,
    onError: fail,
  });
  const screeningMut = useMutation({
    mutationFn: (v: { id: string; status: string }) => updateScreening({ data: v }),
    onSuccess: invalidate,
    onError: fail,
  });
  const completionMut = useMutation({
    mutationFn: (v: { courseId: string; employeeId: string }) =>
      recordCompletion({ data: { courseId: v.courseId, employeeId: v.employeeId } }),
    onSuccess: (r) => {
      toast.success(r.message);
      setTraining({ courseId: "", employeeId: "" });
      invalidate();
    },
    onError: fail,
  });

  if (isLoading)
    return <p className="p-6 text-muted-foreground">Loading paperwork and training…</p>;
  if (error) return <p className="p-6 text-destructive">{(error as Error).message}</p>;
  if (!data) return null;

  return (
    <div className="space-y-6 p-4 md:p-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Paperwork, screenings & training</h1>
        <p className="text-sm text-muted-foreground">
          Everything a person has to sign, pass and complete before and after they hit the floor.
        </p>
      </header>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        {[
          ["Waiting on a signature", data.counts.awaitingSignature],
          ["Signed", data.counts.signed],
          ["Screenings pending", data.counts.screeningsPending],
          ["Training overdue", data.counts.trainingOverdue],
          ["Training due in 30 days", data.counts.trainingDueSoon],
        ].map(([label, value]) => (
          <Card key={String(label)}>
            <CardContent className="p-4">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
              <p className="mt-1 text-2xl font-semibold">{value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <Tabs defaultValue="documents">
        <TabsList>
          <TabsTrigger value="documents">Paperwork</TabsTrigger>
          <TabsTrigger value="screenings">Screenings</TabsTrigger>
          <TabsTrigger value="training">In-service training</TabsTrigger>
        </TabsList>

        <TabsContent value="documents" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Start a new hire's packet</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-wrap items-end gap-3">
              <div className="min-w-56 flex-1">
                <Label htmlFor="packetHire">New hire</Label>
                <select
                  id="packetHire"
                  className={selectClass}
                  value={packetHire}
                  onChange={(e) => setPacketHire(e.target.value)}
                >
                  <option value="">Pick someone…</option>
                  {data.hires.map((h) => (
                    <option key={h.id} value={h.id}>
                      {h.full_name}
                    </option>
                  ))}
                </select>
              </div>
              <Button
                disabled={!packetHire || packetMut.isPending}
                onClick={() => packetMut.mutate(packetHire)}
              >
                Send the whole packet
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Documents</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {data.documents.length === 0 ? (
                <p className="text-sm text-muted-foreground">No paperwork out yet.</p>
              ) : (
                data.documents.map((d) => (
                  <div
                    key={d.id}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-md border p-3 text-sm"
                  >
                    <div>
                      <p className="font-medium">{d.title}</p>
                      <p className="text-muted-foreground">
                        {d.personName}
                        {d.signed_at
                          ? ` · signed ${new Date(d.signed_at).toLocaleDateString()}`
                          : ""}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className={tone(d.status)}>
                        {d.status}
                      </Badge>
                      {d.status !== "signed" && (
                        <>
                          {signing?.id === d.id ? (
                            <>
                              <Input
                                className="h-9 w-44"
                                placeholder="Type their full name"
                                value={signing.name}
                                onChange={(e) => setSigning({ id: d.id, name: e.target.value })}
                              />
                              <Button
                                size="sm"
                                disabled={!signing.name.trim() || signMut.isPending}
                                onClick={() =>
                                  signMut.mutate({ id: d.id, signedName: signing.name.trim() })
                                }
                              >
                                Save signature
                              </Button>
                              <Button size="sm" variant="ghost" onClick={() => setSigning(null)}>
                                Cancel
                              </Button>
                            </>
                          ) : (
                            <>
                              <Button size="sm" onClick={() => setSigning({ id: d.id, name: "" })}>
                                Record signature
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => docStatusMut.mutate({ id: d.id, status: "waived" })}
                              >
                                Waive
                              </Button>
                            </>
                          )}
                        </>
                      )}
                    </div>
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="screenings">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">
                Background, registry and health screenings
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {data.checks.length === 0 ? (
                <p className="text-sm text-muted-foreground">No screenings ordered yet.</p>
              ) : (
                data.checks.map((c) => (
                  <div
                    key={c.id}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-md border p-3 text-sm"
                  >
                    <div>
                      <p className="font-medium">
                        {data.screeningKinds.find((k) => k.kind === c.kind)?.title ?? c.kind}
                      </p>
                      <p className="text-muted-foreground">
                        {c.personName}
                        {c.completed_on ? ` · completed ${c.completed_on}` : ""}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className={tone(c.status)}>
                        {c.status}
                      </Badge>
                      <select
                        className="h-9 rounded-md border border-input bg-background px-2 text-sm"
                        value={c.status}
                        onChange={(e) => screeningMut.mutate({ id: c.id, status: e.target.value })}
                      >
                        {["not_started", "ordered", "passed", "failed", "waived"].map((s) => (
                          <option key={s} value={s}>
                            {s.replace("_", " ")}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="training" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Record a completion</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-wrap items-end gap-3">
              <div className="min-w-48 flex-1">
                <Label htmlFor="course">Course</Label>
                <select
                  id="course"
                  className={selectClass}
                  value={training.courseId}
                  onChange={(e) => setTraining((t) => ({ ...t, courseId: e.target.value }))}
                >
                  <option value="">Pick a course…</option>
                  {data.courses.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.title}
                    </option>
                  ))}
                </select>
              </div>
              <div className="min-w-48 flex-1">
                <Label htmlFor="person">Person</Label>
                <select
                  id="person"
                  className={selectClass}
                  value={training.employeeId}
                  onChange={(e) => setTraining((t) => ({ ...t, employeeId: e.target.value }))}
                >
                  <option value="">Pick someone…</option>
                  {data.staff.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.full_name} ({s.positionLabel})
                    </option>
                  ))}
                </select>
              </div>
              <Button
                disabled={!training.courseId || !training.employeeId || completionMut.isPending}
                onClick={() => completionMut.mutate(training)}
              >
                Mark complete
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Overdue or never done</CardTitle>
            </CardHeader>
            <CardContent className="space-y-1">
              {data.overdue.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Everyone is current. Nothing to chase.
                </p>
              ) : (
                data.overdue.map((o, i) => (
                  <div
                    key={i}
                    className="flex items-center justify-between rounded-md border p-2 text-sm"
                  >
                    <span>
                      <span className="font-medium">{o.name}</span> — {o.course}
                    </span>
                    <span className="text-muted-foreground">
                      {o.dueOn ? `due ${o.dueOn}` : "never completed"}
                    </span>
                  </div>
                ))
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Recent completions</CardTitle>
            </CardHeader>
            <CardContent className="space-y-1">
              {data.completions.slice(0, 25).map((c) => (
                <div
                  key={c.id}
                  className="flex items-center justify-between rounded-md border p-2 text-sm"
                >
                  <span>
                    <span className="font-medium">{c.personName}</span> — {c.courseTitle}
                  </span>
                  <span className="text-muted-foreground">
                    {c.completed_on}
                    {c.due_on ? ` · due again ${c.due_on}` : ""}
                  </span>
                </div>
              ))}
              {data.completions.length === 0 && (
                <p className="text-sm text-muted-foreground">Nothing recorded yet.</p>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
