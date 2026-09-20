// Plain-English reasons a text did not make it, plus what happens next.
// Pure helpers — safe on the server and in the browser.

export const MAX_ATTEMPTS = 3;
export const RETRY_GAP_MINUTES = 15;

const CODE_MEANING: Record<string, string> = {
  "21211": "The phone number on file is not a real number.",
  "21212": "The sending number is not valid — check the texting setup.",
  "21408": "Texting to that region is turned off on the account.",
  "21610": "This person replied STOP, so the carrier blocks our texts.",
  "21614": "That number cannot receive texts (it is not a mobile line).",
  "30003": "The phone was off, dead, or out of service area.",
  "30004": "The carrier blocked the message.",
  "30005": "The carrier does not know that number — likely disconnected.",
  "30006": "That is a landline, so it cannot get a text.",
  "30007": "The carrier filtered the message as spam.",
  "30008": "The carrier could not deliver it and did not say why.",
  "401": "The texting account credentials were rejected.",
  "403": "The texting account is not allowed to send this message.",
  "429": "We sent too fast and the carrier throttled us.",
  "500": "The texting provider had an error on their end.",
  "503": "The texting provider was temporarily unavailable.",
};

/** Pull a provider code out of whatever the provider handed back. */
export function providerCode(error: string): string {
  const text = String(error ?? "");
  const explicit = /(?:code|error)[^0-9]{0,6}(\d{3,5})/i.exec(text);
  if (explicit?.[1]) return explicit[1];
  const twilio = /\b(2\d{4}|3\d{4})\b/.exec(text);
  if (twilio?.[1]) return twilio[1];
  const http = /\b(4\d{2}|5\d{2})\b/.exec(text);
  if (http?.[1]) return http[1];
  if (/no phone|missing number|no number/i.test(text)) return "NO_NUMBER";
  if (/opt|stop|unsubscrib/i.test(text)) return "OPTED_OUT";
  if (/not configured|no credentials|twilio/i.test(text)) return "NOT_SET_UP";
  return "";
}

export function codeMeaning(code: string): string {
  if (!code) return "";
  if (code === "NO_NUMBER") return "There is no phone number on this person's record.";
  if (code === "OPTED_OUT") return "This person has texting turned off.";
  if (code === "NOT_SET_UP") return "Text messaging is not finished being set up.";
  return CODE_MEANING[code] ?? "";
}

export function fixHint(code: string): string {
  if (code === "NO_NUMBER" || code === "21211" || code === "30005")
    return "Update the phone number in Team, then send again.";
  if (code === "OPTED_OUT" || code === "21610")
    return "They have to text START back before we can reach them.";
  if (code === "21614" || code === "30006")
    return "Get a mobile number for this person — this line cannot take texts.";
  if (code === "30007" || code === "30004")
    return "Shorten the wording or try again later; the carrier filtered it.";
  if (code === "NOT_SET_UP" || code === "401" || code === "403")
    return "Check the texting setup in Settings.";
  if (code === "429" || code === "500" || code === "503")
    return "Provider problem — try again in a few minutes.";
  return "Check the number, then send it again.";
}

export type Diagnosis = {
  code: string;
  reason: string;
  hint: string;
  attemptsUsed: number;
  maxAttempts: number;
  lastAttemptAt: string | null;
  nextRetryAt: string | null;
  retryState: "delivered" | "waiting" | "scheduled" | "exhausted" | "cancelled";
  retryNote: string;
};

export function diagnoseDelivery(input: {
  status: string;
  error?: string | null;
  attempts?: number | null;
  scheduledFor?: string | null;
  sentAt?: string | null;
  lastAttemptAt?: string | null;
}): Diagnosis {
  const status = String(input.status ?? "queued");
  const raw = String(input.error ?? "");
  const code = raw ? providerCode(raw) : "";
  const meaning = codeMeaning(code);
  const attemptsUsed = Number(input.attempts ?? 0);
  const lastAttemptAt = input.lastAttemptAt ?? input.sentAt ?? null;

  if (status === "sent") {
    return {
      code: "",
      reason: "",
      hint: "",
      attemptsUsed,
      maxAttempts: MAX_ATTEMPTS,
      lastAttemptAt: input.sentAt ?? lastAttemptAt,
      nextRetryAt: null,
      retryState: "delivered",
      retryNote: "Delivered — nothing else to do.",
    };
  }

  if (status === "cancelled") {
    return {
      code,
      reason: meaning || raw,
      hint: "",
      attemptsUsed,
      maxAttempts: MAX_ATTEMPTS,
      lastAttemptAt,
      nextRetryAt: null,
      retryState: "cancelled",
      retryNote: "Cancelled before it went out.",
    };
  }

  if (status === "failed") {
    return {
      code,
      reason: meaning || raw || "The provider rejected the message.",
      hint: fixHint(code),
      attemptsUsed: attemptsUsed || MAX_ATTEMPTS,
      maxAttempts: MAX_ATTEMPTS,
      lastAttemptAt,
      nextRetryAt: null,
      retryState: "exhausted",
      retryNote: `Gave up after ${attemptsUsed || MAX_ATTEMPTS} of ${MAX_ATTEMPTS} tries — it will not retry on its own.`,
    };
  }

  // queued: either brand new or waiting out the gap after a failed try
  const next = input.scheduledFor ?? null;
  const dueLater = next ? new Date(next).getTime() > Date.now() : false;
  return {
    code,
    reason: raw ? meaning || raw : "",
    hint: raw ? fixHint(code) : "",
    attemptsUsed,
    maxAttempts: MAX_ATTEMPTS,
    lastAttemptAt,
    nextRetryAt: next,
    retryState: attemptsUsed > 0 ? "scheduled" : "waiting",
    retryNote:
      attemptsUsed > 0
        ? `Try ${attemptsUsed} of ${MAX_ATTEMPTS} did not go through. Trying again ${dueLater ? `around ${new Date(next!).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}` : "on the next sweep"}.`
        : dueLater
          ? `Scheduled to go out around ${new Date(next!).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}.`
          : "Waiting in line to go out.",
  };
}
