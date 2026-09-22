import { createFileRoute } from "@tanstack/react-router";

/**
 * One inbound endpoint per registered outside system.
 *
 * POST /api/public/hooks/integration/<slug>
 * Header: apikey: <the project's SUPABASE_SERVICE_ROLE_KEY - never the publishable key, which is public>
 * Body:   { "rows": [...] }  — or a raw CSV body with Content-Type: text/csv
 *
 * Every call is recorded as a sync, updates the connection's health, and stores a
 * last-known-good snapshot so a later outage degrades instead of breaking the schedule.
 */
export const Route = createFileRoute("/api/public/hooks/integration/$slug")({
  server: {
    handlers: {
      POST: async ({ request, params }) => {
        const headers = { "Content-Type": "application/json", "Cache-Control": "no-store" };
        // The publishable/anon key ships in every browser bundle, so it can't
        // gate a webhook that writes integration data - only the service-role
        // key is actually private.
        const key = request.headers.get("apikey");
        const secret = process.env["SUPABASE_SERVICE_ROLE_KEY"];
        if (!key || !secret || key !== secret) {
          return new Response(JSON.stringify({ ok: false, error: "Unauthorized" }), {
            status: 401,
            headers,
          });
        }

        try {
          const { ingest } = await import("@/lib/integrations.server");
          const contentType = request.headers.get("content-type") ?? "";

          if (contentType.includes("csv") || contentType.includes("text/plain")) {
            const csv = await request.text();
            const result = await ingest({
              slug: params.slug,
              csv,
              trigger: "webhook",
              actorLabel: "feed",
            });
            return new Response(JSON.stringify(result), { status: result.ok ? 200 : 400, headers });
          }

          const body = (await request.json().catch(() => ({}))) as {
            rows?: unknown;
            data?: unknown;
          };
          const rows = Array.isArray(body.rows)
            ? body.rows
            : Array.isArray(body.data)
              ? body.data
              : [];
          const result = await ingest({
            slug: params.slug,
            rows,
            trigger: "webhook",
            actorLabel: "feed",
          });
          return new Response(JSON.stringify(result), { status: result.ok ? 200 : 400, headers });
        } catch (err) {
          const message = err instanceof Error ? err.message : "Integration call failed";
          console.error("integration hook failed", params.slug, err);
          return new Response(JSON.stringify({ ok: false, error: message }), {
            status: 500,
            headers,
          });
        }
      },

      GET: async ({ params }) => {
        const headers = { "Content-Type": "application/json", "Cache-Control": "no-store" };
        return new Response(
          JSON.stringify({
            ok: true,
            endpoint: `/api/public/hooks/integration/${params.slug}`,
            method: "POST",
            auth: "apikey header, set to the project's service-role key",
            body: { rows: [] },
          }),
          { headers },
        );
      },
    },
  },
});
