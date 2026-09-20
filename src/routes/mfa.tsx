import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { signOut, useAuth } from "@/hooks/useAuth";
import { secondStepState, startEnrollment, submitCode } from "@/lib/mfa";

export const Route = createFileRoute("/mfa")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Second step sign-in — CoverGrid" },
      {
        name: "description",
        content:
          "Administrators confirm a six-digit code from their authenticator app to finish signing in.",
      },
      { property: "og:title", content: "Second step sign-in — CoverGrid" },
      { property: "og:description", content: "Extra sign-in check for administrator accounts." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: MfaPage,
});

function MfaPage() {
  const navigate = useNavigate();
  const { session, loading } = useAuth();
  const [mode, setMode] = useState<"loading" | "enroll" | "verify">("loading");
  const [factorId, setFactorId] = useState<string | null>(null);
  const [qr, setQr] = useState<string | null>(null);
  const [secret, setSecret] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!loading && !session) void navigate({ to: "/auth" });
  }, [loading, session, navigate]);

  useEffect(() => {
    if (!session) return;
    let cancelled = false;
    void (async () => {
      try {
        const state = await secondStepState();
        if (cancelled) return;
        if (state.satisfied) {
          void navigate({ to: "/dashboard" });
          return;
        }
        if (state.enrolled && state.verifiedFactorId) {
          setFactorId(state.verifiedFactorId);
          setMode("verify");
          return;
        }
        const started = await startEnrollment("CoverGrid");
        if (cancelled) return;
        setFactorId(started.factorId);
        setQr(started.qrCode);
        setSecret(started.secret);
        setMode("enroll");
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Could not start the second step.");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [session, navigate]);

  async function confirm(e: React.FormEvent) {
    e.preventDefault();
    if (!factorId) return;
    if (code.replace(/\s/g, "").length !== 6) {
      toast.error("Enter the six-digit code from your authenticator app.");
      return;
    }
    setBusy(true);
    try {
      await submitCode(factorId, code);
      toast.success("Second step confirmed.");
      void navigate({ to: "/dashboard" });
    } catch (error) {
      const message = error instanceof Error ? error.message : "That code didn't work.";
      toast.error(
        /invalid|incorrect/i.test(message)
          ? "That code didn't work. Wait for the next one and retry."
          : message,
      );
    } finally {
      setBusy(false);
      setCode("");
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-background p-6">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle className="font-display text-2xl">
            {mode === "enroll" ? "Set up your second step" : "Confirm it's you"}
          </CardTitle>
          <CardDescription>
            {mode === "enroll"
              ? "Administrator accounts need a code from a phone app every time they sign in. Scan this once with Google Authenticator, Microsoft Authenticator or Authy."
              : "Open your authenticator app and type the six-digit code shown for CoverGrid."}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          {mode === "loading" && <p className="text-sm text-muted-foreground">Loading…</p>}

          {mode === "enroll" && qr && (
            <div className="space-y-3">
              <img
                src={qr}
                alt="Setup code for your authenticator app"
                className="mx-auto size-48 rounded-md border bg-white p-2"
              />
              {secret && (
                <p className="break-all text-center text-xs text-muted-foreground">
                  Can't scan? Type this key in instead: <span className="font-mono">{secret}</span>
                </p>
              )}
            </div>
          )}

          {mode !== "loading" && (
            <form className="space-y-4" onSubmit={confirm}>
              <div className="space-y-2">
                <Label htmlFor="code">Six-digit code</Label>
                <Input
                  id="code"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  maxLength={7}
                  className="h-12 text-center font-mono text-xl tracking-[0.4em]"
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                />
              </div>
              <Button type="submit" className="h-11 w-full" disabled={busy}>
                {busy ? "Checking…" : mode === "enroll" ? "Finish setup" : "Confirm and continue"}
              </Button>
            </form>
          )}

          <Button variant="ghost" className="w-full" onClick={() => void signOut()} type="button">
            Sign out instead
          </Button>
        </CardContent>
      </Card>
    </main>
  );
}
