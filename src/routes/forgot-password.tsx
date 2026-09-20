import { Link, createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/forgot-password")({
  head: () => ({
    meta: [
      { title: "Reset your password — CoverGrid" },
      {
        name: "description",
        content:
          "Staff can reset their own CoverGrid password by email — no call to the scheduler required.",
      },
      { property: "og:title", content: "Reset your password — CoverGrid" },
      { property: "og:description", content: "Send yourself a password reset link for CoverGrid." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: ForgotPassword,
});

function ForgotPassword() {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    setBusy(false);
    if (error && /rate limit|too many/i.test(error.message)) {
      toast.error("Too many reset emails for now. Wait a few minutes and try again.");
      return;
    }
    // Always show the same result so nobody can use this form to learn who has an account.
    setSent(true);
  }

  return (
    <main className="flex min-h-screen items-center justify-center p-6">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle className="font-display text-2xl">Forgot your password</CardTitle>
          <CardDescription>
            Put in your work email and we'll send you a link to set a new password. You don't need
            to call anyone.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          {sent ? (
            <div className="space-y-4">
              <p className="rounded-lg border bg-muted/40 p-4 text-sm">
                If <span className="font-medium">{email.trim()}</span> has an account, a reset link
                is on its way. It works for one hour. Check your junk folder if you don't see it.
              </p>
              <Button asChild variant="outline" className="w-full">
                <Link to="/auth">Back to sign in</Link>
              </Button>
            </div>
          ) : (
            <form className="space-y-4" onSubmit={submit}>
              <div className="space-y-2">
                <Label htmlFor="reset-email">Work email</Label>
                <Input
                  id="reset-email"
                  type="email"
                  autoComplete="email"
                  required
                  className="h-11"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>
              <Button className="w-full" type="submit" disabled={busy}>
                {busy ? "Sending…" : "Send reset link"}
              </Button>
              <Button asChild variant="ghost" className="w-full">
                <Link to="/auth">Back to sign in</Link>
              </Button>
            </form>
          )}
        </CardContent>
      </Card>
    </main>
  );
}
