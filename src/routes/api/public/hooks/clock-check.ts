import { createFileRoute } from "@tanstack/react-router";

/** A tablet checks its device key here before it starts taking punches. */
export const Route = createFileRoute("/api/public/hooks/clock-check")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const headers = { "Content-Type": "application/json", "Cache-Control": "no-store" };
        try {
          const body = (await request.json().catch(() => ({}))) as { deviceKey?: string };
          const deviceKey = (request.headers.get("x-device-key") ?? body.deviceKey ?? "").trim();
          if (!deviceKey || deviceKey.length > 200) {
            return new Response(
              JSON.stringify({ ok: false, message: "Enter the key from your manager." }),
              {
                status: 400,
                headers,
              },
            );
          }
          const { verifyDeviceKey } = await import("@/lib/timeclock.server");
          const result = await verifyDeviceKey(deviceKey);
          return new Response(JSON.stringify(result), { status: result.ok ? 200 : 401, headers });
        } catch (err) {
          console.error("clock check failed", err);
          return new Response(
            JSON.stringify({
              ok: false,
              message: "The clock could not reach the system. Try again.",
            }),
            { status: 500, headers },
          );
        }
      },
    },
  },
});
