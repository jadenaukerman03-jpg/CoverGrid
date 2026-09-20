import { Link, createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/reset-password")({
  head: () => ({
    meta: [
      { title: "Set a new password — CoverGrid" },
      { name: "description", content: "Choose a new password for your CoverGrid account." },
      { property: "og:title", content: "Set a new password — CoverGrid" },
      { property: "og:description", content: "Finish resetting your CoverGrid password." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: ResetPassword,
});

type Stage = "checking" | "ready" | "invalid" | "done";

function ResetPassword() {
  const navigate = useNavigate();
  const [stage, setStage] = useState<Stage>("checking");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let settled = false;
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "PASSWORD_RECOVERY" || session) {
        settled = true;
        setStage((s) => (s === "done" ? s : "ready"));
      }
    });

    void supabase.auth.getSession().then(({ data }) => {
      if (settled) return;
      const hash = window.location.hash;
      if (data.session || hash.includes("type=recovery")) setStage("ready");
      else setStage("invalid");
    });

    return () => sub.subscription.unsubscribe();
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (password.length < 8) {
      toast.error("Use at least 8 characters.");
      return;
    }
    if (password !== confirm) {
      toast.error("The two passwords don't match.");
      return;
    }
    setBusy(true);
    const { error } = await supabase.auth.updateUser({ password });
    setBusy(false);
    if (error) {
      toast.error(
        /same/i.test(error.message)
          ? "That's your current password. Pick a different one."
          : error.message,
      );
      return;
    }
    setStage("done");
    toast.success("Password updated.");
    setTimeout(() => void navigate({ to: "/dashboard" }), 1200);
  }

  return (
    <main className="flex min-h-screen items-center justify-center p-6">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle className="font-display text-2xl">Set a new password</CardTitle>
          <CardDescription>
            {stage === "invalid"
              ? "This link is no longer good."
              : "Pick something you'll remember. At least 8 characters."}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          {stage === "checking" && (
            <p className="text-sm text-muted-foreground">Checking your link…</p>
          )}

          {stage === "invalid" && (
            <div className="space-y-4">
              <p className="rounded-lg border bg-muted/40 p-4 text-sm">
                Reset links work for one hour and only once. Ask for a fresh one and try again.
              </p>
              <Button asChild className="w-full">
                <Link to="/forgot-password">Send a new link</Link>
              </Button>
            </div>
          )}

          {stage === "ready" && (
            <form className="space-y-4" onSubmit={submit}>
              <div className="space-y-2">
                <Label htmlFor="new-password">New password</Label>
                <Input
                  id="new-password"
                  type="password"
                  autoComplete="new-password"
                  minLength={8}
                  required
                  className="h-11"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="confirm-password">Type it again</Label>
                <Input
                  id="confirm-password"
                  type="password"
                  autoComplete="new-password"
                  minLength={8}
                  required
                  className="h-11"
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                />
              </div>
              <Button className="w-full" type="submit" disabled={busy}>
                {busy ? "Saving…" : "Save new password"}
              </Button>
            </form>
          )}

          {stage === "done" && (
            <p className="rounded-lg border bg-muted/40 p-4 text-sm">
              Your password is updated. Taking you to your dashboard…
            </p>
          )}
        </CardContent>
      </Card>
    </main>
  );
}
