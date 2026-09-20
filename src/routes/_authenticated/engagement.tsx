import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { getEngagement, getMessages, giveRecognitionFn } from "@/lib/workforce.functions";

export const Route = createFileRoute("/_authenticated/engagement")({
  head: () => ({
    meta: [
      { title: "Recognition & retention — CoverGrid" },
      {
        name: "description",
        content:
          "Kudos feed, reward points leaderboard and turnover metrics that surface retention risk early.",
      },
      { property: "og:title", content: "Recognition & retention — CoverGrid" },
      {
        property: "og:description",
        content: "Celebrate reliable staff and watch turnover before it happens.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: EngagementPage,
});

const BADGES = [
  "Above and beyond",
  "Picked up a shift",
  "Great teammate",
  "Perfect attendance",
  "Resident favorite",
];

function EngagementPage() {
  const qc = useQueryClient();
  const load = useServerFn(getEngagement);
  const loadPeople = useServerFn(getMessages);
  const give = useServerFn(giveRecognitionFn);
  const [employeeId, setEmployeeId] = useState("");
  const [badge, setBadge] = useState(BADGES[0]!);
  const [message, setMessage] = useState("");

  const { data } = useQuery({ queryKey: ["engagement"], queryFn: () => load() });
  const people = useQuery({ queryKey: ["messages"], queryFn: () => loadPeople() });

  const recognise = useMutation({
    mutationFn: () => give({ data: { employeeId, badge, message } }),
    onSuccess: () => {
      toast.success("Recognition sent — points added.");
      setMessage("");
      void qc.invalidateQueries({ queryKey: ["engagement"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const m = data?.metrics;

  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-display text-3xl">Recognition & retention</h1>
        <p className="text-muted-foreground">
          Reliability earns points automatically — perfect weeks and picked-up shifts are rewarded
          without anyone remembering to do it.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <Metric label="Headcount" value={String(m?.headcount ?? 0)} />
        <Metric label="New hires (90d)" value={String(m?.newHires90 ?? 0)} />
        <Metric label="Departures (90d)" value={String(m?.departures90 ?? 0)} />
        <Metric label="Turnover" value={`${m?.turnoverRate ?? 0}%`} />
        <Metric label="My points" value={String(data?.myPoints ?? 0)} />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Send recognition</CardTitle>
            <CardDescription>Managers award 25 points, teammates 10.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <select
              className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
              value={employeeId}
              onChange={(e) => setEmployeeId(e.target.value)}
            >
              <option value="">Choose a teammate…</option>
              {(people.data?.employees ?? []).map((e) => (
                <option key={e.id} value={e.id}>
                  {e.full_name}
                </option>
              ))}
            </select>
            <div className="flex flex-wrap gap-2">
              {BADGES.map((b) => (
                <Button
                  key={b}
                  size="sm"
                  variant={badge === b ? "default" : "outline"}
                  onClick={() => setBadge(b)}
                >
                  {b}
                </Button>
              ))}
            </div>
            <Input
              placeholder="Say why"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
            />
            <Button
              disabled={!employeeId || !message || recognise.isPending}
              onClick={() => recognise.mutate()}
            >
              Send kudos
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Leaderboard</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            {(data?.leaderboard ?? []).map((l, i) => (
              <div
                key={l.id}
                className="flex items-center justify-between rounded-md bg-muted/50 px-3 py-2"
              >
                <span>
                  <span className="mr-2 text-muted-foreground">#{i + 1}</span>
                  {l.name}
                </span>
                <Badge className="bg-accent text-accent-foreground">{l.points} pts</Badge>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Kudos feed</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            {(data?.feed ?? []).length === 0 && (
              <p className="text-muted-foreground">No recognition yet.</p>
            )}
            {(data?.feed ?? []).map((f) => (
              <div key={f.id} className="rounded-md border p-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium">{f.to}</span>
                  <Badge variant="secondary">{f.badge}</Badge>
                </div>
                <p className="text-muted-foreground">{f.message}</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  from {f.from} · +{f.points} pts
                </p>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">My reward history</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          {(data?.myLedger ?? []).length === 0 && (
            <p className="text-muted-foreground">No points earned yet.</p>
          )}
          {(data?.myLedger ?? []).map((l) => (
            <div
              key={l.id}
              className="flex items-center justify-between border-b py-1 last:border-0"
            >
              <span>{l.reason}</span>
              <span className="font-medium">+{l.points}</span>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <Card>
      <CardContent className="space-y-1 p-5">
        <p className="text-sm text-muted-foreground">{label}</p>
        <p className="font-display text-3xl">{value}</p>
      </CardContent>
    </Card>
  );
}
