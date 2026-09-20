import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { claimShiftFn, getPickupBoard } from "@/lib/ops.functions";

export const Route = createFileRoute("/_authenticated/pickup")({
  head: () => ({
    meta: [
      { title: "Open shifts to pick up — CoverGrid" },
      {
        name: "description",
        content:
          "Every open shift you are cleared to work, with the hours, the unit and whether it pays overtime. Take one and you are on the schedule right away.",
      },
      { property: "og:title", content: "Open shifts to pick up — CoverGrid" },
      { property: "og:description", content: "Pick up an open shift in one tap — no phone tag." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: PickupPage,
});

function PickupPage() {
  const qc = useQueryClient();
  const load = useServerFn(getPickupBoard);
  const claim = useServerFn(claimShiftFn);

  const { data, isLoading, error } = useQuery({
    queryKey: ["pickup-board"],
    queryFn: () => load({ data: {} }),
  });

  const claimMut = useMutation({
    mutationFn: (v: { assignmentId: string | null; key: string }) => claim({ data: v }),
    onSuccess: (r) => {
      toast.success(r.message);
      void qc.invalidateQueries();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (error) return <p className="text-muted-foreground">{(error as Error).message}</p>;

  const shifts = data?.shifts ?? [];
  const open = shifts.filter((s) => s.eligible);
  const blocked = shifts.filter((s) => !s.eligible);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-3xl">Open shifts</h1>
        <p className="text-muted-foreground">
          {data ? `${data.openForMe} shift(s) you can work` : "Loading…"} — take one and you are on
          the schedule. No phone calls, no waiting for a callback.
        </p>
      </div>

      {isLoading && <p className="text-muted-foreground">Loading…</p>}

      <div className="grid gap-3 md:grid-cols-2">
        {open.map((s) => (
          <Card key={s.key}>
            <CardHeader className="pb-2">
              <CardTitle className="flex flex-wrap items-center gap-2 text-base">
                {s.unit} · {s.shiftLabel}
                {s.urgency === "critical" && <Badge variant="destructive">Badly needed</Badge>}
                {s.wouldBeOvertime && <Badge variant="secondary">Overtime pay</Badge>}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="text-sm">
                {s.dayLabel} · {s.window} · {s.hours} hours · {s.positionLabel}
              </p>
              <p className="text-sm text-muted-foreground">{s.why}</p>
              <Button
                className="w-full"
                disabled={claimMut.isPending}
                onClick={() => claimMut.mutate({ assignmentId: s.assignmentId, key: s.key })}
              >
                I'll take it
              </Button>
            </CardContent>
          </Card>
        ))}
        {!isLoading && open.length === 0 && (
          <p className="text-muted-foreground">
            Nothing open that you are cleared for right now. Check back tomorrow.
          </p>
        )}
      </div>

      {blocked.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Other open shifts (not a fit for you)</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {blocked.slice(0, 15).map((s) => (
              <div key={s.key} className="rounded-lg border p-3 text-sm">
                <p className="font-medium">
                  {s.dayLabel} · {s.unit} · {s.shiftLabel} · {s.positionLabel}
                </p>
                <p className="text-muted-foreground">{s.why}</p>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
