import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getMyAttendance } from "@/lib/staffing.functions";

export const Route = createFileRoute("/_authenticated/points")({
  head: () => ({
    meta: [
      { title: "My attendance points — CoverGrid" },
      {
        name: "description",
        content:
          "See your own attendance point total, every occurrence behind it, and how close you are to the determination point.",
      },
      { property: "og:title", content: "My attendance points — CoverGrid" },
      {
        property: "og:description",
        content: "Private attendance point tracking with progressive-step notices.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: PointsPage,
});

const TONE: Record<string, string> = {
  good: "bg-emerald-500",
  watch: "bg-amber-400",
  warning: "bg-orange-500",
  critical: "bg-destructive",
};

function PointsPage() {
  const load = useServerFn(getMyAttendance);
  const { data, isLoading } = useQuery({ queryKey: ["my-attendance"], queryFn: () => load() });

  if (isLoading) return <p className="text-muted-foreground">Loading your attendance record…</p>;
  if (!data?.linked)
    return (
      <Card>
        <CardContent className="p-6">
          <p className="text-muted-foreground">
            Your login is not linked to an employee record yet, so there are no attendance points to
            show.
          </p>
        </CardContent>
      </Card>
    );

  const s = data.status;

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="font-display text-3xl">My attendance points</h1>
        <p className="text-muted-foreground">
          Private to you and management. Late arrival {data.latePoints} · call-off{" "}
          {data.callOffPoints} · points fall off after 12 months.
        </p>
      </div>

      <Card>
        <CardContent className="space-y-4 p-6">
          <div className="flex items-end justify-between gap-4">
            <div>
              <p className="text-sm text-muted-foreground">Current total</p>
              <p className="font-display text-5xl">{s.total}</p>
            </div>
            <div className="text-right">
              <p className="text-sm text-muted-foreground">Determination point</p>
              <p className="font-display text-2xl">{data.terminationPoints}</p>
              <p className="text-xs text-muted-foreground">{s.remainingToTermination} to go</p>
            </div>
          </div>
          <div className="h-3 w-full overflow-hidden rounded-full bg-muted">
            <div
              className={`h-full ${TONE[s.tone]}`}
              style={{ width: `${s.percentToTermination}%` }}
            />
          </div>
          <p className="text-sm">
            {s.reached ? (
              <>
                <span className="font-medium">{s.reached.label}:</span> {s.reached.detail}
              </>
            ) : (
              "You are in good standing — no attendance step has been reached."
            )}
            {s.next && ` Next step at ${s.next.points} points (${s.next.label.toLowerCase()}).`}
          </p>
          <p className="text-xs text-muted-foreground">
            {data.last90Days} points earned in the last 90 days.
          </p>
        </CardContent>
      </Card>

      {data.buyback?.enabled && (
        <Card className="border-primary/40">
          <CardHeader>
            <CardTitle>Earn points back</CardTitle>
            <CardDescription>
              Pick up {data.buyback.shiftsRequired} extra open shift(s) and{" "}
              {data.buyback.pointsRemoved} attendance point(s) come off your record automatically —
              up to {data.buyback.maxPointsPerYear} a year.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-end justify-between gap-4">
              <div>
                <p className="text-sm text-muted-foreground">Progress to your next point back</p>
                <p className="font-display text-3xl">
                  {data.buyback.pickupsTowardNext} / {data.buyback.shiftsRequired}
                </p>
              </div>
              <div className="text-right text-sm">
                <p className="text-muted-foreground">Earned back this year</p>
                <p className="font-display text-2xl">{data.buyback.pointsRemovedThisYear}</p>
                <p className="text-xs text-muted-foreground">
                  {data.buyback.remainingCap} still available
                </p>
              </div>
            </div>
            <div className="h-3 w-full overflow-hidden rounded-full bg-muted">
              <div
                className="h-full bg-primary"
                style={{
                  width: `${Math.min(100, (data.buyback.pickupsTowardNext / Math.max(1, data.buyback.shiftsRequired)) * 100)}%`,
                }}
              />
            </div>
            <p className="text-sm text-muted-foreground">
              {data.buyback.shiftsToNext} more picked-up shift(s) to go. You've picked up{" "}
              {data.buyback.pickupsThisYear} this year.
            </p>
            {data.buyback.history.length > 0 && (
              <div className="space-y-1 pt-1">
                {data.buyback.history.slice(0, 5).map((h) => (
                  <p key={h.id} className="text-xs text-muted-foreground">
                    {new Date(h.createdAt).toLocaleDateString()} · −{h.points} point(s) · {h.reason}
                  </p>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Progressive steps</CardTitle>
          <CardDescription>You are notified automatically as you reach each level.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {data.levels.map((l) => (
            <div
              key={l.points}
              className={`flex items-start justify-between gap-4 rounded-md border px-3 py-2 text-sm ${
                s.total >= l.points ? "border-destructive/40 bg-destructive/5" : ""
              }`}
            >
              <div>
                <p className="font-medium">
                  {l.points} points · {l.label}
                </p>
                <p className="text-xs text-muted-foreground">{l.detail}</p>
              </div>
              {s.total >= l.points && <Badge variant="secondary">Reached</Badge>}
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Your point statement</CardTitle>
          <CardDescription>
            Every occurrence, every point earned back and every point that fell off — newest first,
            with the total after each one.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {(data.ledger ?? []).length === 0 && (
            <p className="text-muted-foreground">Nothing on your record yet.</p>
          )}
          {(data.ledger ?? []).map((l) => (
            <div
              key={l.id}
              className="flex items-start justify-between gap-4 rounded-md border px-3 py-2 text-sm"
            >
              <div className="min-w-0">
                <p className="font-medium">{l.label}</p>
                <p className="text-xs text-muted-foreground">
                  {new Date(l.at).toLocaleDateString()}
                  {l.detail ? ` · ${l.detail}` : ""}
                </p>
              </div>
              <div className="shrink-0 text-right">
                <p
                  className={
                    l.delta > 0 ? "font-medium text-destructive" : "font-medium text-emerald-600"
                  }
                >
                  {l.delta > 0 ? `+${l.delta}` : l.delta}
                </p>
                <p className="text-xs text-muted-foreground">total {l.balance}</p>
              </div>
            </div>
          ))}
          {(data.upcomingRollOffs ?? []).length > 0 && (
            <div className="rounded-md bg-muted/50 p-3 text-xs text-muted-foreground">
              <p className="mb-1 font-medium text-foreground">Coming off your record</p>
              {(data.upcomingRollOffs ?? []).map((r) => (
                <p key={r.id}>
                  {r.label} · −{r.points} on {new Date(r.fallsOffOn).toLocaleDateString()}
                </p>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Occurrences</CardTitle>
          <CardDescription>Every event that added points to your total.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {data.events.length === 0 && (
            <p className="text-muted-foreground">No attendance occurrences on record. Nice work.</p>
          )}
          {data.events.map((e) => (
            <div
              key={e.id}
              className="flex items-center justify-between gap-4 rounded-md border px-3 py-2 text-sm"
            >
              <div>
                <p className="font-medium">
                  {e.kind === "late"
                    ? `Late${e.minutesLate ? ` by ${e.minutesLate} min` : ""}`
                    : "Call-off"}
                </p>
                <p className="text-xs text-muted-foreground">
                  {new Date(e.occurredAt).toLocaleString()}
                  {e.note ? ` · ${e.note}` : ""}
                </p>
              </div>
              <Badge variant="outline">+{e.points}</Badge>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Attendance notices sent to you</CardTitle>
          <CardDescription>
            Automatic alerts as you approach the determination point.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {data.notices.length === 0 && (
            <p className="text-muted-foreground">No attendance notices yet.</p>
          )}
          {data.notices.map((n) => (
            <div key={n.id} className="rounded-md border px-3 py-2 text-sm">
              <p className="font-medium">{n.title}</p>
              <p className="text-xs text-muted-foreground">{n.body}</p>
              <p className="mt-1 text-[11px] text-muted-foreground">
                {new Date(n.created_at).toLocaleString()}
              </p>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
