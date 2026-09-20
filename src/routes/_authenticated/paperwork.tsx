import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { getPaperwork, savePaperworkFn, setPaperworkStatusFn } from "@/lib/platform.functions";

export const Route = createFileRoute("/_authenticated/paperwork")({
  head: () => ({
    meta: [
      { title: "Paperwork & security — CoverGrid" },
      {
        name: "description",
        content:
          "Track the signed agreements, privacy training and security reviews a corporate office asks for before go-live.",
      },
      { property: "og:title", content: "Paperwork & security — CoverGrid" },
      {
        property: "og:description",
        content: "Agreements, privacy training and reviews, tracked and never overdue.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: PaperworkPage,
});

const STATUS_LABEL: Record<string, string> = {
  not_started: "Not started",
  in_progress: "Working on it",
  complete: "Done",
};

const NEXT: Record<string, "not_started" | "in_progress" | "complete"> = {
  not_started: "in_progress",
  in_progress: "complete",
  complete: "not_started",
};

function PaperworkPage() {
  const qc = useQueryClient();
  const load = useServerFn(getPaperwork);
  const save = useServerFn(savePaperworkFn);
  const setStatus = useServerFn(setPaperworkStatusFn);

  const [title, setTitle] = useState("");
  const [owner, setOwner] = useState("");

  const { data, error } = useQuery({ queryKey: ["paperwork"], queryFn: () => load() });
  const refresh = () => void qc.invalidateQueries({ queryKey: ["paperwork"] });

  const add = useMutation({
    mutationFn: () => save({ data: { title, owner, category: "Facility" } }),
    onSuccess: () => {
      setTitle("");
      setOwner("");
      refresh();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const cycle = useMutation({
    mutationFn: (v: { id: string; status: "not_started" | "in_progress" | "complete" }) =>
      setStatus({ data: v }),
    onSuccess: refresh,
    onError: (e: Error) => toast.error(e.message),
  });

  if (error)
    return <p className="text-muted-foreground">Paperwork is available to managers only.</p>;

  const s = data?.summary;
  const groups = new Map<string, NonNullable<typeof data>["rows"]>();
  for (const row of data?.rows ?? []) {
    const list = groups.get(row.category) ?? [];
    list.push(row);
    groups.set(row.category, list);
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-3xl">Paperwork & security</h1>
        <p className="text-muted-foreground">
          The list a corporate compliance officer works through before signing. The system reminds
          you when a review comes due, so nothing lapses quietly.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Metric label="Ready" value={`${s?.percent ?? 0}%`} />
        <Metric label="Done" value={String(s?.complete ?? 0)} />
        <Metric label="In progress" value={String(s?.inProgress ?? 0)} />
        <Metric label="Overdue review" value={String(s?.overdue ?? 0)} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Add an item</CardTitle>
          <CardDescription>Anything your facility or corporate office requires.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          <Input
            className="max-w-sm"
            placeholder="What needs doing"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
          <Input
            className="max-w-xs"
            placeholder="Who owns it"
            value={owner}
            onChange={(e) => setOwner(e.target.value)}
          />
          <Button disabled={!title || add.isPending} onClick={() => add.mutate()}>
            Add
          </Button>
        </CardContent>
      </Card>

      {[...groups.entries()].map(([category, rows]) => (
        <Card key={category}>
          <CardHeader>
            <CardTitle className="text-base">{category}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {rows.map((r) => (
              <div
                key={r.id}
                className="flex flex-wrap items-start justify-between gap-3 rounded-lg border p-3"
              >
                <div className="min-w-0">
                  <p className="font-medium">{r.title}</p>
                  {r.detail && <p className="text-sm text-muted-foreground">{r.detail}</p>}
                  <p className="text-xs text-muted-foreground">
                    {r.owner || "Unassigned"}
                    {r.nextReviewOn ? ` · review due ${r.nextReviewOn}` : ""}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  {r.overdue && (
                    <Badge variant="secondary" className="bg-destructive/15 text-destructive">
                      Overdue
                    </Badge>
                  )}
                  <Button
                    size="sm"
                    variant={r.status === "complete" ? "default" : "outline"}
                    onClick={() =>
                      cycle.mutate({ id: r.id, status: NEXT[r.status] ?? "in_progress" })
                    }
                  >
                    {STATUS_LABEL[r.status] ?? r.status}
                  </Button>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <Card>
      <CardContent className="space-y-1 p-5">
        <p className="text-sm text-muted-foreground">{label}</p>
        <p className="font-display text-2xl">{value}</p>
      </CardContent>
    </Card>
  );
}
