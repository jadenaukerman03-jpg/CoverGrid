import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useRef, useState } from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { getCensusIntake, importCensusFile, previewCensusFile } from "@/lib/census.functions";
import { formatDate } from "@/lib/facility";

export const Route = createFileRoute("/_authenticated/census")({
  head: () => ({
    meta: [
      { title: "Census feed — CoverGrid" },
      {
        name: "description",
        content:
          "Bring daily census straight in from PointClickCare so hours per patient day stay accurate without anyone typing numbers each morning.",
      },
      { property: "og:title", content: "Census feed — CoverGrid" },
      {
        property: "og:description",
        content: "Automatic daily census import for accurate PPD, unit by unit.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: CensusPage,
});

const SAMPLE = `Census Date,Unit,Census
2026-08-18,Birch,41
2026-08-18,Cedar,38
2026-08-18,Dogwood,35`;

function CensusPage() {
  const qc = useQueryClient();
  const load = useServerFn(getCensusIntake);
  const preview = useServerFn(previewCensusFile);
  const runImport = useServerFn(importCensusFile);
  const fileRef = useRef<HTMLInputElement>(null);
  const [text, setText] = useState("");
  const [fileName, setFileName] = useState("");

  const { data, error } = useQuery({ queryKey: ["census-intake"], queryFn: () => load() });

  const previewMutation = useMutation({
    mutationFn: () => preview({ data: { text } }),
    onError: (e: Error) => toast.error(e.message),
  });

  const importMutation = useMutation({
    mutationFn: () => runImport({ data: { text, fileName, source: "pointclickcare" as const } }),
    onSuccess: (res) => {
      if (res.ok)
        toast.success(`${res.applied} census day${res.applied === 1 ? "" : "s"} brought in.`);
      else toast.error(res.errors[0] ?? "Nothing was imported.");
      void qc.invalidateQueries({ queryKey: ["census-intake"] });
      void qc.invalidateQueries({ queryKey: ["labor"] });
      void qc.invalidateQueries({ queryKey: ["dashboard"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (error)
    return <p className="text-muted-foreground">The census feed is available to managers only.</p>;

  const status = data?.status;
  const parsed = previewMutation.data;
  const endpoint =
    typeof window !== "undefined"
      ? `${window.location.origin}/api/public/hooks/census`
      : "/api/public/hooks/census";

  async function onFile(file: File) {
    const content = await file.text();
    setText(content);
    setFileName(file.name);
    previewMutation.reset();
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-3xl">Census feed</h1>
        <p className="text-muted-foreground">
          Daily census comes in from PointClickCare instead of being typed in every morning — that
          is what makes hours per patient day trustworthy.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Days from the feed</CardDescription>
            <CardTitle className="text-3xl">{status?.importedDays ?? 0}</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">Last 14 days</CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Days still estimated</CardDescription>
            <CardTitle className="text-3xl">{status?.estimatedDays ?? 0}</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            Filled in automatically until real numbers arrive
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Newest census day</CardDescription>
            <CardTitle className="text-xl">
              {status?.lastImportedDate ? formatDate(status.lastImportedDate) : "None yet"}
            </CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">From the last import</CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Units mapped</CardDescription>
            <CardTitle className="text-3xl">{status?.units.length ?? 0}</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            {status?.units.map((u) => u.name).join(", ")}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Bring in a census export</CardTitle>
          <CardDescription>
            Upload or paste the PointClickCare census export. Any file with a date, a unit and a
            census number works — column names are matched for you.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-center gap-3">
            <input
              ref={fileRef}
              type="file"
              accept=".csv,.tsv,.txt,text/csv"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void onFile(f);
              }}
            />
            <Button type="button" variant="outline" onClick={() => fileRef.current?.click()}>
              Choose file
            </Button>
            {fileName ? <span className="text-sm text-muted-foreground">{fileName}</span> : null}
            <Button
              type="button"
              variant="ghost"
              onClick={() => {
                setText(SAMPLE);
                setFileName("example.csv");
                previewMutation.reset();
              }}
            >
              Use an example
            </Button>
          </div>
          <Textarea
            rows={8}
            value={text}
            onChange={(e) => {
              setText(e.target.value);
              previewMutation.reset();
            }}
            placeholder={SAMPLE}
            className="font-mono text-xs"
          />
          <div className="flex flex-wrap gap-3">
            <Button
              type="button"
              variant="outline"
              disabled={!text.trim() || previewMutation.isPending}
              onClick={() => previewMutation.mutate()}
            >
              {previewMutation.isPending ? "Checking..." : "Check the file"}
            </Button>
            <Button
              type="button"
              disabled={!text.trim() || importMutation.isPending}
              onClick={() => importMutation.mutate()}
            >
              {importMutation.isPending ? "Importing..." : "Import census"}
            </Button>
          </div>

          {parsed ? (
            <div className="space-y-3 rounded-lg border p-4">
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <Badge variant="secondary">{parsed.total} rows found</Badge>
                {parsed.periodStart ? (
                  <Badge variant="outline">
                    {formatDate(parsed.periodStart)} –{" "}
                    {formatDate(parsed.periodEnd ?? parsed.periodStart)}
                  </Badge>
                ) : null}
                {parsed.unmatchedUnits.length > 0 ? (
                  <Badge variant="destructive">
                    Unknown units: {parsed.unmatchedUnits.join(", ")}
                  </Badge>
                ) : null}
              </div>
              {parsed.errors.length > 0 ? (
                <ul className="list-disc pl-5 text-sm text-muted-foreground">
                  {parsed.errors.map((e) => (
                    <li key={e}>{e}</li>
                  ))}
                </ul>
              ) : null}
              <div className="max-h-64 overflow-auto">
                <table className="w-full min-w-[560px] text-sm">
                  <thead className="text-left text-muted-foreground">
                    <tr>
                      <th className="py-1">Date</th>
                      <th>Unit in file</th>
                      <th>Census</th>
                      <th>Match</th>
                    </tr>
                  </thead>
                  <tbody>
                    {parsed.preview.map((r, i) => (
                      <tr key={`${r.date}-${r.unitName}-${i}`} className="border-t">
                        <td className="py-1">{formatDate(r.date)}</td>
                        <td>{r.unitName}</td>
                        <td>{r.census}</td>
                        <td className={r.unitId ? "text-muted-foreground" : "text-destructive"}>
                          {r.note}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Nightly automatic feed</CardTitle>
          <CardDescription>
            Point your PointClickCare export job at this address and nobody ever touches census
            again.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <pre className="overflow-auto rounded-lg bg-muted p-4 text-xs">{`POST ${endpoint}
apikey: <your project key>
Content-Type: application/json

{
  "source": "pointclickcare",
  "rows": [
    { "date": "2026-08-18", "unit": "Birch", "census": 41 },
    { "date": "2026-08-18", "unit": "Cedar", "census": 38 }
  ]
}`}</pre>
          <p className="text-muted-foreground">
            A plain CSV body works too — send it with Content-Type: text/csv. Every send is written
            to the history below, so you can always see where a census number came from.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Import history</CardTitle>
          <CardDescription>Every census file and feed delivery, newest first.</CardDescription>
        </CardHeader>
        <CardContent>
          {(data?.history.length ?? 0) === 0 ? (
            <p className="text-sm text-muted-foreground">No census imports yet.</p>
          ) : (
            <div className="overflow-auto">
              <table className="w-full min-w-[560px] text-sm">
                <thead className="text-left text-muted-foreground">
                  <tr>
                    <th className="py-1">When</th>
                    <th>Source</th>
                    <th>Covering</th>
                    <th>Applied</th>
                    <th>Skipped</th>
                    <th>Result</th>
                  </tr>
                </thead>
                <tbody>
                  {(data?.history ?? []).map((h) => (
                    <tr key={h.id} className="border-t">
                      <td className="py-1">{new Date(h.created_at).toLocaleString()}</td>
                      <td>{h.file_name || h.source}</td>
                      <td>
                        {h.period_start
                          ? `${formatDate(h.period_start)} – ${formatDate(h.period_end ?? h.period_start)}`
                          : "—"}
                      </td>
                      <td>{h.rows_applied}</td>
                      <td>{h.rows_skipped}</td>
                      <td>
                        <Badge
                          variant={
                            h.status === "applied"
                              ? "secondary"
                              : h.status === "partial"
                                ? "outline"
                                : "destructive"
                          }
                        >
                          {h.message || h.status}
                        </Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
