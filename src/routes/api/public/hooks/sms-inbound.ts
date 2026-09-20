import { createFileRoute } from "@tanstack/react-router";
import { createHmac, timingSafeEqual } from "crypto";

/**
 * Staff text the facility number back to claim an open shift.
 * Twilio posts a form here; we verify Twilio's signature before doing anything.
 */
function twiml(message: string) {
  const escaped = message.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const body = message
    ? `<?xml version="1.0" encoding="UTF-8"?><Response><Message>${escaped}</Message></Response>`
    : `<?xml version="1.0" encoding="UTF-8"?><Response></Response>`;
  return new Response(body, {
    status: 200,
    headers: { "Content-Type": "text/xml", "Cache-Control": "no-store" },
  });
}

function signatureMatches(
  url: string,
  params: Record<string, string>,
  header: string,
  authToken: string,
) {
  const data = Object.keys(params)
    .sort()
    .reduce((acc, key) => acc + key + params[key], url);
  const expected = createHmac("sha1", authToken)
    .update(Buffer.from(data, "utf-8"))
    .digest("base64");
  const a = Buffer.from(expected);
  const b = Buffer.from(header);
  return a.length === b.length && timingSafeEqual(a, b);
}

export const Route = createFileRoute("/api/public/hooks/sms-inbound")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const authToken = process.env["TWILIO_AUTH_TOKEN"];
          if (!authToken) return new Response("Texting is not connected.", { status: 503 });

          const raw = await request.text();
          const form = new URLSearchParams(raw);
          const params: Record<string, string> = {};
          form.forEach((value, key) => {
            params[key] = value;
          });

          const signature = request.headers.get("x-twilio-signature") ?? "";
          if (!signature || !signatureMatches(request.url, params, signature, authToken)) {
            return new Response("Invalid signature", { status: 401 });
          }

          const from = params["From"] ?? "";
          const body = params["Body"] ?? "";
          const { handleInboundText } = await import("@/lib/claims.server");
          const result = await handleInboundText(from, body);
          return twiml(result.reply);
        } catch (err) {
          console.error("inbound sms failed", err);
          return twiml("Sorry — something went wrong on our end. Please call the scheduler.");
        }
      },
    },
  },
});
