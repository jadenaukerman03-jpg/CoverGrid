import { createFileRoute } from "@tanstack/react-router";

/**
 * Census feed. PointClickCare (or any census system / middleware job) posts the
 * midnight census here every night and hours-per-patient-day stays real with
 * nobody typing anything.
 *
 * POST { "source": "pointclickcare", "rows": [{ "date": "2026-08-18", "unit": "Birch", "census": 41 }] }
 * Header: apikey: <the project's SUPABASE_SERVICE_ROLE_KEY - never the publishable key, which is public>
 * A raw CSV body (Content-Type: text/csv) is accepted too.
 */
export const Route = createFileRoute("/api/public/hooks/census")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const headers = { "Content-Type": "application/json", "Cache-Control": "no-store" };
        // The publishable/anon key ships in every browser bundle, so it can't
        // gate a webhook that writes census data - only the service-role key
        // is actually private. Give the outside system this key as its own
        // "apikey" credential, separate from anything used client-side.
        const key = request.headers.get("apikey");
        const secret = process.env["SUPABASE_SERVICE_ROLE_KEY"];
        if (!key || !secret || key !== secret) {
          return new Response(JSON.stringify({ ok: false, error: "Unauthorized" }), {
            status: 401,
            headers,
          });
        }

        try {
          const contentType = request.headers.get("content-type") ?? "";
          const { applyCensusPayload } = await import("@/lib/census-import.server");

          if (contentType.includes("csv") || contentType.includes("text/plain")) {
            const text = await request.text();
            const { parseCensusFile, applyCensusRows } = await import("@/lib/census-import.server");
            const parsed = await parseCensusFile(text);
            const result = await applyCensusRows({
              rows: parsed.rows,
              source: "pointclickcare",
              connector: "census feed",
              fileName: "feed.csv",
              actorLabel: "census feed",
              errors: parsed.errors,
              unmatchedUnits: parsed.unmatchedUnits,
            });
            return new Response(JSON.stringify(result), { status: result.ok ? 200 : 400, headers });
          }

          const body = (await request.json().catch(() => ({}))) as {
            source?: string;
            connector?: string;
            rows?: Array<{ date: string; unit: string; census: number }>;
          };
          const rows = Array.isArray(body.rows) ? body.rows : [];
          if (rows.length === 0) {
            return new Response(JSON.stringify({ ok: false, error: "No census rows were sent." }), {
              status: 400,
              headers,
            });
          }
          const source = (["pointclickcare", "matrixcare", "csv", "api"] as const).includes(
            body.source as never,
          )
            ? (body.source as "pointclickcare" | "matrixcare" | "csv" | "api")
            : "pointclickcare";
          const result = await applyCensusPayload({
            rows,
            source,
            connector: String(body.connector ?? "census feed"),
            actorLabel: "census feed",
          });
          return new Response(JSON.stringify(result), { status: result.ok ? 200 : 400, headers });
        } catch (err) {
          console.error("census feed failed", err);
          return new Response(JSON.stringify({ ok: false, error: "Census import failed." }), {
            status: 500,
            headers,
          });
        }
      },
    },
  },
});
