import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useRef, useState } from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { getSetupBoard, runImportFn, setStepStatusFn } from "@/lib/setup.functions";

export const Route = createFileRoute("/_authenticated/setup")({
  head: () => ({
    meta: [
      { title: "Go-live setup — CoverGrid" },
      {
        name: "description",
        content:
          "Bring your roster, your existing schedule and your attendance history over in minutes, and work a guided checklist all the way to go-live.",
      },
      { property: "og:title", content: "Go-live setup — CoverGrid" },
      {
        property: "og:description",
        content: "Bulk imports and a guided checklist from empty building to go-live.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: SetupPage,
});

type Kind = "roster" | "schedule" | "attendance";
const KINDS: Array<[Kind, string]> = [
  ["roster", "Employee roster"],
  ["schedule", "Existing schedule"],
  ["attendance", "Attendance history"],
];

function SetupPage() {
  const qc = useQueryClient();
  const load = useServerFn(getSetupBoard);
  const setStep = useServerFn(setStepStatusFn);
  const runImport = useServerFn(runImportFn);
  const fileRef = useRef<HTMLInputElement>(null);

  const [kind, setKind] = useState<Kind>("roster");
  const [text, setText] = useState("");
  const [fileName, setFileName] = useState("");
  const [result, setResult] = useState<{
    applied: number;
    skipped: number;
    errors: string[];
    message: string;
    status: string;
  } | null>(null);

  const { data, isLoading, error } = useQuery({ queryKey: ["setup-board"], queryFn: () => load() });
  const invalidate = () => void qc.invalidateQueries({ queryKey: ["setup-board"] });
  const fail = (e: Error) => toast.error(e.message);

  const stepMut = useMutation({
    mutationFn: (v: { id: string; status: string }) => setStep({ data: v }),
    onSuccess: invalidate,
    onError: fail,
  });
  const importMut = useMutation({
    mutationFn: (apply: boolean) => runImport({ data: { kind, fileName, text, apply } }),
    onSuccess: (r) => {
      setResult(r);
      if (r.status === "applied") {
        toast.success(r.message);
        setText("");
        setFileName("");
      }
      invalidate();
    },
    onError: fail,
  });

  if (isLoading) return <p className="p-6 text-muted-foreground">Loading your setup…</p>;
  if (error) return <p className="p-6 text-destructive">{(error as Error).message}</p>;
  if (!data) return null;

  const template = data.templates[kind]!;

  return (
    <div className="space-y-6 p-4 md:p-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Go-live setup</h1>
        <p className="text-sm text-muted-foreground">
          Bring your building over in an afternoon: paste or upload what you already have, check it
          before anything saves, then work the list to go-live.
        </p>
      </header>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {[
          ["Setup complete", `${data.readiness.percent}%`],
          ["Units set up", data.readiness.units],
          ["Roster loaded", data.readiness.hasRoster ? "Yes" : "Not yet"],
          [
            "Connections healthy",
            `${data.readiness.healthyConnections}/${data.readiness.connections}`,
          ],
        ].map(([label, value]) => (
          <Card key={String(label)}>
            <CardContent className="p-4">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
              <p className="mt-1 text-2xl font-semibold">{value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Bring your data over</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap gap-2">
            {KINDS.map(([k, l]) => (
              <Button
                key={k}
                size="sm"
                variant={kind === k ? "default" : "outline"}
                onClick={() => {
                  setKind(k);
                  setResult(null);
                }}
              >
                {l}
              </Button>
            ))}
          </div>

          <div className="rounded-md border bg-muted/40 p-3 text-sm">
            <p className="text-muted-foreground">{template.help}</p>
            <p className="mt-2 font-mono text-xs">{template.headers.join(",")}</p>
            <p className="font-mono text-xs text-muted-foreground">{template.sample.join(",")}</p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <input
              ref={fileRef}
              type="file"
              accept=".csv,.tsv,.txt"
              className="hidden"
              onChange={async (e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                setFileName(file.name);
                setText(await file.text());
                setResult(null);
              }}
            />
            <Button variant="outline" size="sm" onClick={() => fileRef.current?.click()}>
              Choose a file
            </Button>
            {fileName && <span className="text-sm text-muted-foreground">{fileName}</span>}
          </div>

          <div>
            <Label htmlFor="paste">Or paste it straight from your spreadsheet</Label>
            <Textarea
              id="paste"
              rows={8}
              className="font-mono text-xs"
              value={text}
              onChange={(e) => {
                setText(e.target.value);
                setResult(null);
              }}
              placeholder={`${template.headers.join(",")}\n${template.sample.join(",")}`}
            />
          </div>

          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              disabled={!text.trim() || importMut.isPending}
              onClick={() => importMut.mutate(false)}
            >
              Check it first
            </Button>
            <Button
              disabled={!text.trim() || importMut.isPending}
              onClick={() => importMut.mutate(true)}
            >
              {importMut.isPending ? "Working…" : "Bring it in"}
            </Button>
          </div>

          {result && (
            <div className="rounded-md border p-3 text-sm">
              <p className="font-medium">{result.message}</p>
              {result.errors.length > 0 && (
                <ul className="mt-2 space-y-1 text-destructive">
                  {result.errors.map((e, i) => (
                    <li key={i}>{e}</li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Your go-live checklist</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {data.steps.map((s) => (
            <div
              key={s.id}
              className="flex flex-wrap items-center justify-between gap-2 rounded-md border p-3 text-sm"
            >
              <div>
                <p className="font-medium">{s.title}</p>
                <p className="text-muted-foreground">{s.detail}</p>
                {s.status === "done" && s.completed_by && (
                  <p className="text-xs text-muted-foreground">Marked done by {s.completed_by}</p>
                )}
              </div>
              <div className="flex items-center gap-2">
                <Badge
                  variant="outline"
                  className={
                    s.status === "done"
                      ? "bg-primary/10 text-primary border-primary/30"
                      : s.status === "in_progress"
                        ? "bg-muted text-muted-foreground"
                        : ""
                  }
                >
                  {s.status.replace("_", " ")}
                </Badge>
                {s.status !== "done" ? (
                  <>
                    {s.status !== "in_progress" && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => stepMut.mutate({ id: s.id, status: "in_progress" })}
                      >
                        Start
                      </Button>
                    )}
                    <Button size="sm" onClick={() => stepMut.mutate({ id: s.id, status: "done" })}>
                      Done
                    </Button>
                  </>
                ) : (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => stepMut.mutate({ id: s.id, status: "todo" })}
                  >
                    Reopen
                  </Button>
                )}
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Recent imports</CardTitle>
        </CardHeader>
        <CardContent className="space-y-1">
          {data.batches.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nothing imported yet.</p>
          ) : (
            data.batches.map((b) => (
              <div
                key={b.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-md border p-2 text-sm"
              >
                <span>
                  <span className="font-medium">{b.kind}</span>{" "}
                  {b.file_name ? `· ${b.file_name}` : ""} · {b.message}
                </span>
                <span className="text-muted-foreground">
                  {new Date(b.created_at).toLocaleString()} · {b.created_by}
                </span>
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}
