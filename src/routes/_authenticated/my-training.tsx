import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getMyTraining } from "@/lib/hr.functions";

export const Route = createFileRoute("/_authenticated/my-training")({
  head: () => ({
    meta: [
      { title: "My training — CoverGrid" },
      {
        name: "description",
        content:
          "See every in-service you have to keep current, when it was last done, and when it comes due again.",
      },
      { property: "og:title", content: "My training — CoverGrid" },
      { property: "og:description", content: "Your in-service training, always up to date." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: TrainingPage,
});

function TrainingPage() {
  const load = useServerFn(getMyTraining);
  const { data, isLoading, error } = useQuery({ queryKey: ["my-training"], queryFn: () => load() });

  if (isLoading) return <p className="p-6 text-muted-foreground">Loading your training…</p>;
  if (error) return <p className="p-6 text-destructive">{(error as Error).message}</p>;
  if (!data) return null;

  return (
    <div className="space-y-6 p-4 md:p-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">My training</h1>
        <p className="text-sm text-muted-foreground">
          {data.overdue === 0
            ? "You're current on everything. Nothing to do."
            : `You have ${data.overdue} class${data.overdue === 1 ? "" : "es"} to take care of.`}
        </p>
      </header>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Required in-services</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {data.rows.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nothing assigned to you right now.</p>
          ) : (
            data.rows.map((r) => (
              <div
                key={r.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-md border p-3 text-sm"
              >
                <div>
                  <p className="font-medium">{r.title}</p>
                  <p className="text-muted-foreground">
                    {r.description || "Annual requirement"} · about {r.minutes} minutes
                  </p>
                </div>
                <div className="text-right">
                  <Badge
                    variant="outline"
                    className={
                      r.status === "current"
                        ? "bg-primary/10 text-primary border-primary/30"
                        : "bg-destructive/10 text-destructive border-destructive/30"
                    }
                  >
                    {r.status === "current"
                      ? "Current"
                      : r.status === "overdue"
                        ? "Overdue"
                        : "Not done yet"}
                  </Badge>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {r.completedOn ? `Last done ${r.completedOn}` : "No record yet"}
                    {r.dueOn ? ` · due ${r.dueOn}` : ""}
                  </p>
                </div>
              </div>
            ))
          )}
        </CardContent>
      </Card>

      <p className="text-xs text-muted-foreground">
        Once you finish a class, your manager records it here and the due date resets on its own.
      </p>
    </div>
  );
}
