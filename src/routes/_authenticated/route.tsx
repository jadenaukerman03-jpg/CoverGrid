import { useQuery } from "@tanstack/react-query";
import { Link, Outlet, createFileRoute, useNavigate, useRouterState } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { Menu } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { MobileTabBar } from "@/components/mobile-tabbar";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { signOut, useAuth } from "@/hooks/useAuth";
import { useIdleSignOut } from "@/hooks/useIdleSignOut";
import { applyBrandTheme } from "@/lib/brand-theme";
import { getBrandTheme } from "@/lib/branding.functions";
import { secondStepState } from "@/lib/mfa";
import { getSessionTimeout } from "@/lib/security.functions";
import { getFacilityConfig } from "@/lib/staffing.functions";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated")({
  component: AppLayout,
});

type NavGroup = { title: string; items: Array<{ to: string; label: string }> };

const EMPLOYEE_NAV: NavGroup[] = [
  {
    title: "My work",
    items: [
      { to: "/my-shifts", label: "My shifts" },
      { to: "/schedule", label: "Schedule" },
      { to: "/pickup", label: "Open shifts" },
      { to: "/requests", label: "Requests" },
    ],
  },
  {
    title: "Time & attendance",
    items: [
      { to: "/timeclock", label: "Time clock" },
      { to: "/points", label: "My points" },
      { to: "/credentials", label: "My licenses" },
      { to: "/my-training", label: "My training" },
    ],
  },
  {
    title: "Help & extras",
    items: [
      { to: "/assistant", label: "Scheduling assistant" },
      { to: "/messages", label: "Messages" },
      { to: "/notifications", label: "Notifications" },
      { to: "/engagement", label: "Rewards" },
    ],
  },
];

const MANAGER_NAV: NavGroup[] = [
  {
    title: "Overview",
    items: [
      { to: "/dashboard", label: "Dashboard" },
      { to: "/rollup", label: "Corporate rollup" },

      { to: "/schedule", label: "Schedule" },
      { to: "/labor", label: "Labor & HPPD" },
      { to: "/low-census", label: "Low census" },
      { to: "/census", label: "Census feed" },
      { to: "/handoff", label: "Handoff" },
    ],
  },
  {
    title: "Staffing",
    items: [
      { to: "/pickup", label: "Open shifts" },
      { to: "/shift-texts", label: "Fill shifts by text" },
      { to: "/agencies", label: "Agencies" },

      { to: "/marketplace", label: "Per-diem pool" },
      { to: "/risk", label: "Call-off risk" },
      { to: "/fairness", label: "Fairness & cost" },
      { to: "/buildings", label: "Buildings" },
    ],
  },
  {
    title: "People",
    items: [
      { to: "/team", label: "Team" },
      { to: "/hiring", label: "Hiring" },
      { to: "/new-hires", label: "New hires" },
      { to: "/training", label: "Orientation" },
      { to: "/hr-compliance", label: "Paperwork & training" },
      { to: "/my-training", label: "My training" },
      { to: "/credentials", label: "Licenses" },
      { to: "/points", label: "My points" },
    ],
  },
  {
    title: "Time & pay",
    items: [
      { to: "/timeclock", label: "Time clock" },
      { to: "/payroll", label: "Payroll" },
      { to: "/engagement", label: "Rewards" },
    ],
  },
  {
    title: "Compliance",
    items: [
      { to: "/compliance", label: "Compliance" },
      { to: "/paperwork", label: "Paperwork" },
      { to: "/activity", label: "Activity" },
    ],
  },
  {
    title: "Communication & setup",
    items: [
      { to: "/messages", label: "Messages" },
      { to: "/notifications", label: "Notifications" },
      { to: "/alerts", label: "Alerts & time clocks" },
      { to: "/requests", label: "Requests" },
      { to: "/automation", label: "Automation" },
      { to: "/integrations", label: "Integrations" },
      { to: "/setup", label: "Go-live setup" },
      { to: "/assistant", label: "Scheduling assistant" },
    ],
  },
];

function AppLayout() {
  const { session, loading } = useAuth();
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const loadConfig = useServerFn(getFacilityConfig);
  const loadTheme = useServerFn(getBrandTheme);
  const loadTimeout = useServerFn(getSessionTimeout);

  useEffect(() => {
    if (!loading && !session) void navigate({ to: "/auth" });
  }, [loading, session, navigate]);

  const { data: config } = useQuery({
    queryKey: ["facility-config"],
    queryFn: () => loadConfig(),
    enabled: Boolean(session),
  });

  const { data: brand } = useQuery({
    queryKey: ["brand-theme"],
    queryFn: () => loadTheme(),
    enabled: Boolean(session),
    staleTime: 60_000,
  });

  const { data: timeout } = useQuery({
    queryKey: ["session-timeout"],
    queryFn: () => loadTimeout(),
    enabled: Boolean(session),
    staleTime: 300_000,
  });

  useIdleSignOut(
    timeout?.minutes,
    () => {
      void signOut().then(() => {
        toast.info("Signed out after a stretch of no activity.");
        void navigate({ to: "/auth" });
      });
    },
    Boolean(session),
  );

  useEffect(() => {
    applyBrandTheme(brand);
  }, [brand]);

  const isManager = config?.isManager ?? false;
  const isAdmin = Boolean((config as { isAdmin?: boolean } | undefined)?.isAdmin);

  // Administrator accounts must clear the second sign-in step before seeing anything.
  // Set VITE_REQUIRE_ADMIN_MFA=true to turn this back on before real staff data is involved.
  const requireAdminMfa = import.meta.env["VITE_REQUIRE_ADMIN_MFA"] === "true";
  const { data: secondStep } = useQuery({
    queryKey: ["second-step-state"],
    queryFn: () => secondStepState(),
    enabled: Boolean(session) && isAdmin && requireAdminMfa,
    staleTime: 30_000,
  });

  useEffect(() => {
    if (requireAdminMfa && isAdmin && secondStep && !secondStep.satisfied)
      void navigate({ to: "/mfa" });
  }, [requireAdminMfa, isAdmin, secondStep, navigate]);

  const baseGroups = isManager ? MANAGER_NAV : EMPLOYEE_NAV;
  const groups: NavGroup[] = isAdmin
    ? [
        {
          title: "Administrator",
          items: [
            { to: "/control-room", label: "Control room" },
            { to: "/security", label: "Security & access" },
          ],
        },
        ...baseGroups,
      ]
    : baseGroups;

  const [open, setOpen] = useState(false);

  if (loading || !session || (isAdmin && secondStep && !secondStep.satisfied)) {
    return (
      <div className="flex min-h-screen items-center justify-center text-muted-foreground">
        Loading…
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-30 border-b bg-sidebar text-sidebar-foreground">
        <div className="mx-auto flex max-w-7xl items-center gap-3 px-4 py-3 sm:px-6">
          <Sheet open={open} onOpenChange={setOpen}>
            <SheetTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                aria-label="Open the menu"
                className="text-sidebar-foreground hover:bg-sidebar-accent/60"
              >
                <Menu className="size-6" />
              </Button>
            </SheetTrigger>
            <SheetContent
              side="left"
              className="flex w-72 flex-col overflow-y-auto bg-sidebar p-0 text-sidebar-foreground"
            >
              <SheetHeader className="border-b border-sidebar-foreground/10 p-4 text-left">
                <SheetTitle className="font-display text-lg text-sidebar-foreground">
                  CoverGrid
                </SheetTitle>
                <p className="text-xs text-sidebar-foreground/70">
                  {config?.profile?.full_name ?? session.user.email} ·{" "}
                  {isAdmin ? "administrator" : isManager ? "manager" : "employee"}
                </p>
              </SheetHeader>
              <nav className="flex flex-col gap-5 p-4">
                {groups.map((group) => (
                  <div key={group.title} className="space-y-1">
                    <p className="px-3 text-xs font-semibold uppercase tracking-wide text-sidebar-foreground/50">
                      {group.title}
                    </p>
                    {group.items.map((item) => (
                      <Link
                        key={item.to}
                        to={item.to}
                        onClick={() => setOpen(false)}
                        className={cn(
                          "block rounded-md px-3 py-2 text-sm transition-colors",
                          pathname === item.to
                            ? "bg-sidebar-accent text-sidebar-accent-foreground"
                            : "text-sidebar-foreground/80 hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground",
                        )}
                      >
                        {item.label}
                      </Link>
                    ))}
                  </div>
                ))}
              </nav>
              <div className="mt-auto border-t border-sidebar-foreground/10 p-4">
                <p className="px-3 pb-1 text-xs font-semibold uppercase tracking-wide text-sidebar-foreground/50">
                  Settings
                </p>
                {[
                  { to: "/settings", label: "Settings" },
                  { to: "/policies", label: "Policy & information" },
                ].map((item) => (
                  <Link
                    key={item.to}
                    to={item.to}
                    onClick={() => setOpen(false)}
                    className={cn(
                      "block rounded-md px-3 py-2 text-sm transition-colors",
                      pathname === item.to
                        ? "bg-sidebar-accent text-sidebar-accent-foreground"
                        : "text-sidebar-foreground/80 hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground",
                    )}
                  >
                    {item.label}
                  </Link>
                ))}
              </div>
            </SheetContent>
          </Sheet>

          <Link to="/" className="min-w-0 truncate font-display text-lg font-semibold">
            CoverGrid
          </Link>

          <div className="ml-auto flex shrink-0 items-center gap-3 text-sm">
            <span className="hidden text-sidebar-foreground/70 sm:inline">
              {config?.profile?.full_name ?? session.user.email} · {config?.role ?? "employee"}
            </span>
            <Button size="sm" variant="secondary" onClick={() => void signOut()}>
              Sign out
            </Button>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-7xl px-4 py-6 pb-28 sm:px-6 sm:py-8 md:pb-10">
        <Outlet />
      </main>
      <MobileTabBar
        role={isAdmin ? "admin" : isManager ? "manager" : "employee"}
        pathname={pathname}
        onMore={() => setOpen(true)}
      />
    </div>
  );
}
