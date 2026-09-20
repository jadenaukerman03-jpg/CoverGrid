import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { getActivity, undoActivityFn } from "@/lib/oversight.functions";

export const Route = createFileRoute("/_authenticated/activity")({
  head: () => ({
    meta: [
      { title: "What the system did — CoverGrid" },
      {
        name: "description",
        content:
          "A plain-English record of every scheduling action — call-offs, floats, assignments and notes — with one-click reversal.",
      },
      { property: "og:title", content: "What the system did — CoverGrid" },
      {
        property: "og:description",
        content: "Every action recorded in plain English, reversible in one click.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: ActivityPage,
});

function ActivityPage() {
  const qc = useQueryClient();
  const load = useServerFn(getActivity);
  const undo = useServerFn(undoActivityFn);
  const [onlyUndoable, setOnlyUndoable] = useState(false);

  const { data, isLoading, error } = useQuery({
    queryKey: ["activity", onlyUndoable],
    queryFn: () => load({ data: { limit: 80, onlyUndoable } }),
  });

  const reverse = useMutation({
    mutationFn: (auditId: string) => undo({ data: { auditId } }),
    onSuccess: (res) => {
      toast.success(res.outcome);
      void qc.invalidateQueries();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (error)
    return <p className="text-muted-foreground">This record is available to managers only.</p>;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl">What the system did</h1>
          <p className="text-muted-foreground">
            Every change to the schedule, in plain English — whether a person made it or the system
            did. Anything the system decided can be put back the way it was.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Switch id="undoable" checked={onlyUndoable} onCheckedChange={setOnlyUndoable} />
          <Label htmlFor="undoable">Only show reversible actions</Label>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Recent activity</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {isLoading && <p className="text-muted-foreground">Loading…</p>}
          {!isLoading && (data?.entries.length ?? 0) === 0 && (
            <p className="text-sm text-muted-foreground">Nothing recorded yet.</p>
          )}
          {(data?.entries ?? []).map((e) => (
            <div
              key={e.id}
              className={`flex flex-wrap items-start justify-between gap-3 rounded-md border p-3 text-sm ${
                e.undoneAt ? "opacity-60" : ""
              }`}
            >
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium">{e.label}</span>
                  <Badge variant={e.automatic ? "secondary" : "outline"}>
                    {e.automatic ? "by the system" : e.actor}
                  </Badge>
                  {e.undoneAt && <Badge variant="destructive">reversed by {e.undoneBy}</Badge>}
                </div>
                {e.details && (
                  <p className="mt-1 break-words text-xs text-muted-foreground">{e.details}</p>
                )}
                <p className="text-xs text-muted-foreground">
                  {new Date(e.createdAt).toLocaleString()}
                </p>
              </div>
              {e.canUndo && (
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={reverse.isPending}
                  onClick={() => reverse.mutate(e.id)}
                >
                  Undo
                </Button>
              )}
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
