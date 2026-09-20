import { createFileRoute } from "@tanstack/react-router";

/** Wall clocks and tablets post punches here using their own device key. */
export const Route = createFileRoute("/api/public/hooks/punch")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const json = (headers: Record<string, string> = {}) => ({
          "Content-Type": "application/json",
          "Cache-Control": "no-store",
          ...headers,
        });
        try {
          const body = (await request.json().catch(() => ({}))) as {
            deviceKey?: string;
            clockInNumber?: string;
            pin?: string;
          };
          const deviceKey = (request.headers.get("x-device-key") ?? body.deviceKey ?? "").trim();
          if (!deviceKey) {
            return new Response(
              JSON.stringify({ ok: false, message: "This clock is not set up yet." }),
              {
                status: 401,
                headers: json(),
              },
            );
          }
          const { kioskPunch } = await import("@/lib/timeclock.server");
          const result = await kioskPunch({
            deviceKey,
            clockInNumber: String(body.clockInNumber ?? ""),
            pin: String(body.pin ?? ""),
          });
          return new Response(JSON.stringify(result), {
            status: result.ok ? 200 : 400,
            headers: json(),
          });
        } catch (err) {
          console.error("kiosk punch failed", err);
          return new Response(JSON.stringify({ ok: false, message: "Punch failed. Try again." }), {
            status: 500,
            headers: json(),
          });
        }
      },
    },
  },
});
