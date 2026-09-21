import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { listBuildings } from "@/lib/auth-public.functions";
import { signInGuarded } from "@/lib/login-guard.functions";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "Sign in — CoverGrid Staffing" },
      {
        name: "description",
        content: "Sign in to view your schedule, request time off and manage unit staffing.",
      },
      { property: "og:title", content: "Sign in — CoverGrid Staffing" },
      {
        property: "og:description",
        content: "Staff and manager access to the CoverGrid scheduling system.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: AuthPage,
});

const BUILDING_STORAGE = "CoverGrid.building";

/**
 * Plain-language check so automated scripts can't hammer the sign-in form.
 * The numbers are randomized only after mount (never during the initial
 * render), since that render runs on both the server and the client and
 * must produce identical output or React's hydration fails.
 */
function useHumanCheck() {
  const [a, setA] = useState(2);
  const [b, setB] = useState(1);
  const [answer, setAnswer] = useState("");
  const [confirmed, setConfirmed] = useState(false);

  useEffect(() => {
    setA(2 + Math.floor(Math.random() * 7));
    setB(1 + Math.floor(Math.random() * 5));
  }, []);

  const passed = confirmed && answer.trim() === String(a + b);
  return { a, b, answer, setAnswer, confirmed, setConfirmed, passed };
}

function friendlyAuthError(message: string) {
  const m = message.toLowerCase();
  if (m.includes("invalid login")) return "That email and password don't match. Try again.";
  if (m.includes("email not confirmed")) return "Check your email and confirm the account first.";
  if (m.includes("rate limit") || m.includes("too many"))
    return "Too many tries. Wait a minute and try again.";
  if (m.includes("already registered"))
    return "That email already has an account. Sign in instead.";
  return message;
}

function AuthPage() {
  const navigate = useNavigate();
  const { session, loading } = useAuth();
  const [busy, setBusy] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [building, setBuilding] = useState("");
  const [lockNotice, setLockNotice] = useState<string | null>(null);
  const human = useHumanCheck();

  const signIn_ = useServerFn(signInGuarded);

  const loadBuildings = useServerFn(listBuildings);
  const { data: buildings = [] } = useQuery({
    queryKey: ["public-buildings"],
    queryFn: () => loadBuildings(),
    staleTime: 300_000,
  });

  const buildingName = useMemo(
    () => buildings.find((b) => b.id === building)?.name ?? "",
    [buildings, building],
  );

  useEffect(() => {
    const saved = window.localStorage.getItem(BUILDING_STORAGE);
    if (saved) setBuilding(saved);
  }, []);

  useEffect(() => {
    if (!loading && session) void navigate({ to: "/dashboard" });
  }, [loading, session, navigate]);

  function guard() {
    if (!building) {
      toast.error("Choose the building you work at first.");
      return false;
    }
    if (!human.passed) {
      toast.error("Please finish the quick check that says you're not a robot.");
      return false;
    }
    return true;
  }

  async function signIn(e: React.FormEvent) {
    e.preventDefault();
    if (!guard()) return;
    const cleanEmail = email.trim();
    setBusy(true);

    const result = await signIn_({ data: { email: cleanEmail, password } }).catch(() => ({
      ok: false as const,
      message: "Sign-in failed. Try again.",
      gate: null,
    }));
    setBusy(false);

    if (!result.ok) {
      if (result.gate && !result.gate.allowed) {
        setLockNotice(result.message);
        toast.error(result.message);
        return;
      }
      const left = result.gate?.triesLeft ?? null;
      setLockNotice(
        left !== null && left <= 2
          ? `${left} ${left === 1 ? "try" : "tries"} left before sign-in is put on hold. Use "Forgot password" if you're stuck.`
          : null,
      );
      toast.error(friendlyAuthError(result.message));
      return;
    }

    const { error } = await supabase.auth.setSession(result.session);
    if (error) {
      toast.error("Signed in, but couldn't start the session. Try again.");
      return;
    }

    setLockNotice(null);
    window.localStorage.setItem(BUILDING_STORAGE, building);
    void navigate({ to: "/dashboard" });
  }

  async function signUp(e: React.FormEvent) {
    e.preventDefault();
    if (!guard()) return;
    if (password.length < 8) {
      toast.error("Use at least 8 characters for your password.");
      return;
    }
    setBusy(true);
    const { error } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: {
        emailRedirectTo: `${window.location.origin}/dashboard`,
        data: { full_name: fullName, facility_id: building, facility_name: buildingName },
      },
    });
    setBusy(false);
    if (error) {
      toast.error(friendlyAuthError(error.message));
      return;
    }
    window.localStorage.setItem(BUILDING_STORAGE, building);
    toast.success("Account created. You can sign in now.");
  }

  async function google() {
    if (!guard()) return;
    window.localStorage.setItem(BUILDING_STORAGE, building);
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${window.location.origin}/dashboard` },
    });
    if (error) {
      toast.error("Google sign-in failed. Try email instead.");
    }
  }

  const buildingAndHuman = (
    <div className="space-y-4 rounded-lg border bg-muted/40 p-4">
      <div className="space-y-2">
        <Label htmlFor="building">Which building are you from?</Label>
        <Select value={building} onValueChange={setBuilding}>
          <SelectTrigger id="building" className="h-11">
            <SelectValue placeholder="Choose your building" />
          </SelectTrigger>
          <SelectContent>
            {buildings.map((b) => (
              <SelectItem key={b.id} value={b.id}>
                {b.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-2">
        <Label htmlFor="human">
          Quick check: what is {human.a} + {human.b}?
        </Label>
        <Input
          id="human"
          inputMode="numeric"
          autoComplete="off"
          className="h-11 max-w-28"
          value={human.answer}
          onChange={(e) => human.setAnswer(e.target.value)}
        />
      </div>
      <div className="flex items-start gap-3">
        <Checkbox
          id="not-robot"
          checked={human.confirmed}
          onCheckedChange={(v) => human.setConfirmed(v === true)}
          className="mt-0.5 size-5"
        />
        <Label htmlFor="not-robot" className="text-sm font-normal leading-snug">
          I'm not a robot
        </Label>
      </div>
    </div>
  );

  return (
    <main className="grid min-h-screen lg:grid-cols-2">
      <section className="hidden flex-col justify-between bg-sidebar p-12 text-sidebar-foreground lg:flex">
        <Link to="/" className="font-display text-lg font-semibold">
          CoverGrid
        </Link>
        <div className="space-y-4">
          <h1 className="font-display text-4xl leading-tight">Staffing that runs itself.</h1>
          <p className="max-w-md text-sidebar-foreground/75">
            Coverage across Birch, Cedar and Dogwood is monitored continuously. Call-offs trigger an
            instant replacement search, overtime stays fair, and every employee gets straight
            answers about their own schedule.
          </p>
        </div>
        <p className="text-xs text-sidebar-foreground/60">
          Employee, manager and administrator access.
        </p>
      </section>

      <section className="flex items-center justify-center p-6">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle className="font-display text-2xl">Welcome back</CardTitle>
            <CardDescription>
              Use the work email on file so your employee record links automatically.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <Button variant="outline" className="w-full" onClick={google} type="button">
              Continue with Google
            </Button>
            <div className="flex items-center gap-3 text-xs text-muted-foreground">
              <span className="h-px flex-1 bg-border" /> or{" "}
              <span className="h-px flex-1 bg-border" />
            </div>
            <Tabs defaultValue="signin">
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="signin">Sign in</TabsTrigger>
                <TabsTrigger value="signup">Create account</TabsTrigger>
              </TabsList>
              <TabsContent value="signin">
                <form className="space-y-4 pt-4" onSubmit={signIn}>
                  <div className="space-y-2">
                    <Label htmlFor="email">Work email</Label>
                    <Input
                      id="email"
                      type="email"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <div className="flex items-center justify-between gap-3">
                      <Label htmlFor="password">Password</Label>
                      <Link
                        to="/forgot-password"
                        className="text-sm text-muted-foreground underline underline-offset-4 hover:text-foreground"
                      >
                        Forgot password?
                      </Link>
                    </div>
                    <Input
                      id="password"
                      type="password"
                      autoComplete="current-password"
                      required
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                    />
                  </div>
                  {buildingAndHuman}

                  {lockNotice && (
                    <p
                      role="alert"
                      className="rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm"
                    >
                      {lockNotice}
                    </p>
                  )}

                  <Button className="w-full" disabled={busy} type="submit">
                    {busy ? "Signing in…" : "Sign in"}
                  </Button>
                </form>
              </TabsContent>
              <TabsContent value="signup">
                <form className="space-y-4 pt-4" onSubmit={signUp}>
                  <div className="space-y-2">
                    <Label htmlFor="name">Full name</Label>
                    <Input
                      id="name"
                      required
                      value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="email2">Work email</Label>
                    <Input
                      id="email2"
                      type="email"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="password2">Password</Label>
                    <Input
                      id="password2"
                      type="password"
                      autoComplete="new-password"
                      required
                      minLength={8}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                    />
                    <p className="text-xs text-muted-foreground">At least 8 characters.</p>
                  </div>
                  {buildingAndHuman}
                  <Button className="w-full" disabled={busy} type="submit">
                    {busy ? "Creating…" : "Create account"}
                  </Button>
                </form>
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      </section>
    </main>
  );
}
