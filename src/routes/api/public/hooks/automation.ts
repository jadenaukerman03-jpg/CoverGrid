import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/hooks/automation")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        // The publishable/anon key ships in every browser bundle, so it can't
        // gate a webhook that mutates data - only the service-role key is
        // actually private.
        const key = request.headers.get("apikey");
        const secret = process.env["SUPABASE_SERVICE_ROLE_KEY"];
        if (!key || !secret || key !== secret) {
          return new Response(JSON.stringify({ error: "Unauthorized" }), {
            status: 401,
            headers: { "Content-Type": "application/json" },
          });
        }
        try {
          const { runAutomationCycle } = await import("@/lib/automation.server");
          const res = await runAutomationCycle({ source: "autopilot" });
          return new Response(JSON.stringify(res), {
            headers: { "Content-Type": "application/json" },
          });
        } catch (err) {
          const message = err instanceof Error ? err.message : "Automation failed";
          console.error("automation cycle failed", err);
          return new Response(JSON.stringify({ ok: false, error: message }), {
            status: 500,
            headers: { "Content-Type": "application/json" },
          });
        }
      },
    },
  },
});
