import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { formatDate } from "@/lib/facility";
import { getHandoff } from "@/lib/oversight.functions";

export const Route = createFileRoute("/_authenticated/handoff")({
  head: () => ({
    meta: [
      { title: "Shift handoff report — CoverGrid" },
      {
        name: "description",
        content:
          "A printable, one-page shift-to-shift handoff: who is working each unit and shift, call-offs, open slots, floats and shift notes.",
      },
      { property: "og:title", content: "Shift handoff report — CoverGrid" },
      {
        property: "og:description",
        content: "Print the day's assignments, call-offs, open slots and notes.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: HandoffPage,
});

function HandoffPage() {
  const load = useServerFn(getHandoff);
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const { data, isLoading, error } = useQuery({
    queryKey: ["handoff", date],
    queryFn: () => load({ data: { date } }),
  });

  if (error)
    return (
      <p className="text-muted-foreground">The handoff report is available to managers only.</p>
    );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4 print:hidden">
        <div>
          <h1 className="font-display text-3xl">Shift handoff</h1>
          <p className="text-muted-foreground">
            One page to print and hand to the next shift: who is on each unit, call-offs, open
            slots, floats and notes.
          </p>
        </div>
        <div className="flex items-end gap-2">
          <Input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="w-44"
          />
          <Button onClick={() => window.print()}>Print</Button>
        </div>
      </div>

      {isLoading && <p className="text-muted-foreground">Loading…</p>}

      {data && (
        <>
          <p className="text-sm text-muted-foreground print:hidden">
            {formatDate(data.date)} ·{" "}
            {data.totalGaps === 0
              ? "Fully covered"
              : `${data.totalGaps} open position${data.totalGaps === 1 ? "" : "s"}`}{" "}
            · printed {new Date(data.generatedAt).toLocaleString()}
          </p>
          {data.shifts.flatMap((s) =>
            s.units.map((u) => (
              <Card key={`${s.shift}-${u.unitId}`} className="print-page">
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">
                    {u.unitName} — {s.shiftLabel}
                  </CardTitle>
                  <p className="text-xs text-muted-foreground">
                    {formatDate(data.date)} · printed {new Date(data.generatedAt).toLocaleString()}
                  </p>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2 rounded-md border p-3">
                    <div className="flex flex-wrap items-center gap-2">
                      {u.required.map((r) => (
                        <Badge key={r.position} variant={r.gap > 0 ? "destructive" : "secondary"}>
                          {r.label} {r.filled}/{r.required}
                        </Badge>
                      ))}
                    </div>
                    {u.people.length === 0 && (
                      <p className="text-xs text-muted-foreground">Nobody scheduled.</p>
                    )}
                    <ul className="space-y-1 text-sm">
                      {u.people.map((p) => (
                        <li key={p.id} className="border-b pb-1 last:border-0">
                          <span className="font-medium">{p.name}</span>{" "}
                          <span className="text-muted-foreground">
                            · {p.position} · {p.window}
                          </span>
                          {p.isFloat && (
                            <span className="ml-1 text-xs text-amber-700">
                              (floated{p.homeUnit ? ` from ${p.homeUnit}` : ""})
                            </span>
                          )}
                          {p.note && <div className="text-xs italic">Note: {p.note}</div>}
                          {p.floatReason && (
                            <div className="text-xs text-muted-foreground">
                              Why floated: {p.floatReason}
                            </div>
                          )}
                        </li>
                      ))}
                    </ul>
                    {u.callOffs.length > 0 && (
                      <p className="text-xs text-destructive">
                        Call-offs: {u.callOffs.map((c) => `${c.name} (${c.position})`).join(", ")}
                      </p>
                    )}
                    {u.openSlots.length > 0 && (
                      <p className="text-xs text-destructive">
                        Open: {u.openSlots.map((o) => `${o.position} ${o.window}`).join(", ")}
                      </p>
                    )}
                  </div>
                </CardContent>
              </Card>
            )),
          )}
        </>
      )}
    </div>
  );
}
