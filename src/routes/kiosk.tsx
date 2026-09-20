import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export const Route = createFileRoute("/kiosk")({
  head: () => ({
    meta: [
      { title: "Time clock — CoverGrid" },
      {
        name: "description",
        content:
          "Wall time clock for nursing staff: punch in and out with a clock-in number and PIN.",
      },
      { property: "og:title", content: "Time clock — CoverGrid" },
      {
        property: "og:description",
        content: "Badge-and-PIN punching from any tablet on the unit.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: KioskPage,
});

const KEY_STORAGE = "CoverGrid.clock.key";

type Result = { ok: boolean; message: string; name?: string; detail?: string };

function KioskPage() {
  const [deviceKey, setDeviceKey] = useState("");
  const [keyInput, setKeyInput] = useState("");
  const [keyError, setKeyError] = useState("");
  const [pairing, setPairing] = useState(false);
  const [badge, setBadge] = useState("");
  const [pin, setPin] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const [clock, setClock] = useState("");

  async function pair() {
    const key = keyInput.trim();
    if (!key) return;
    setPairing(true);
    setKeyError("");
    try {
      const res = await fetch("/api/public/hooks/clock-check", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ deviceKey: key }),
      });
      const json = (await res.json()) as { ok: boolean; message: string };
      if (!json.ok) {
        setKeyError(json.message || "That key isn't right.");
        return;
      }
      window.localStorage.setItem(KEY_STORAGE, key);
      setDeviceKey(key);
    } catch {
      setKeyError("The clock could not reach the system. Check the internet and try again.");
    } finally {
      setPairing(false);
    }
  }

  useEffect(() => {
    setDeviceKey(window.localStorage.getItem(KEY_STORAGE) ?? "");
    const tick = () =>
      setClock(new Date().toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }));
    tick();
    const id = window.setInterval(tick, 15_000);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    if (!result) return;
    const id = window.setTimeout(() => setResult(null), 6000);
    return () => window.clearTimeout(id);
  }, [result]);

  async function submit() {
    setBusy(true);
    try {
      const res = await fetch("/api/public/hooks/punch", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-device-key": deviceKey },
        body: JSON.stringify({ deviceKey, clockInNumber: badge, pin }),
      });
      const json = (await res.json()) as Result;
      setResult(json);
      if (json.ok) {
        setBadge("");
        setPin("");
      }
    } catch {
      setResult({ ok: false, message: "The clock could not reach the system. Try again." });
    } finally {
      setBusy(false);
    }
  }

  if (!deviceKey) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-sidebar p-6 text-sidebar-foreground">
        <div className="w-full max-w-md space-y-4 rounded-2xl bg-background p-8 text-foreground shadow-xl">
          <h1 className="font-display text-2xl">Set up this clock</h1>
          <p className="text-sm text-muted-foreground">
            Paste the key your manager copied from Text alerts &amp; time clocks. This device will
            remember it.
          </p>
          <Input
            placeholder="Device key"
            value={keyInput}
            maxLength={200}
            onChange={(e) => {
              setKeyInput(e.target.value);
              setKeyError("");
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") void pair();
            }}
          />
          {keyError && (
            <p role="alert" className="rounded-lg bg-destructive/15 p-3 text-sm text-destructive">
              {keyError}
            </p>
          )}
          <Button
            className="w-full"
            disabled={!keyInput.trim() || pairing}
            onClick={() => void pair()}
          >
            {pairing ? "Checking…" : "Save and start"}
          </Button>
        </div>
      </main>
    );
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-sidebar p-6 text-sidebar-foreground">
      <div className="w-full max-w-md space-y-5 rounded-2xl bg-background p-8 text-foreground shadow-xl">
        <div className="flex items-baseline justify-between">
          <h1 className="font-display text-3xl">Time clock</h1>
          <span className="text-lg text-muted-foreground">{clock}</span>
        </div>
        <p className="text-sm text-muted-foreground">
          Enter your clock-in number and PIN. The clock knows whether you are starting or finishing.
        </p>
        <Input
          inputMode="numeric"
          placeholder="Clock-in number"
          value={badge}
          onChange={(e) => setBadge(e.target.value)}
          className="h-14 text-xl"
        />
        <Input
          inputMode="numeric"
          type="password"
          placeholder="PIN"
          value={pin}
          onChange={(e) => setPin(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && badge && pin) void submit();
          }}
          className="h-14 text-xl"
        />
        <Button
          className="h-14 w-full text-lg"
          disabled={!badge || !pin || busy}
          onClick={() => void submit()}
        >
          {busy ? "One moment…" : "Punch"}
        </Button>

        {result && (
          <div
            className={
              result.ok
                ? "rounded-lg bg-emerald-500/15 p-4 text-emerald-800 dark:text-emerald-300"
                : "rounded-lg bg-destructive/15 p-4 text-destructive"
            }
          >
            {result.name && <p className="font-display text-xl">{result.name}</p>}
            <p>{result.message}</p>
            {result.detail && <p className="text-sm opacity-80">{result.detail}</p>}
          </div>
        )}

        <button
          type="button"
          className="w-full text-xs text-muted-foreground underline"
          onClick={() => {
            window.localStorage.removeItem(KEY_STORAGE);
            setDeviceKey("");
          }}
        >
          Unpair this clock
        </button>
      </div>
    </main>
  );
}
