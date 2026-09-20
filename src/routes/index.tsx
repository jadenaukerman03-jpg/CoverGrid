import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/")({
  component: HomePage,
});

function HomePage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-background px-4 text-center">
      <h1 className="text-4xl font-bold tracking-tight text-foreground">CoverGrid</h1>
      <p className="max-w-md text-muted-foreground">
        Scheduling that runs itself. This is the project skeleton — the schedule grid, call-off
        outreach, and attendance points modules land in Phase 1.
      </p>
    </div>
  );
}
