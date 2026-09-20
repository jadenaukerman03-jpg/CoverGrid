import { Link } from "@tanstack/react-router";
import {
  CalendarDays,
  ClipboardList,
  Clock,
  LayoutDashboard,
  type LucideIcon,
  MessageSquare,
  Menu,
  Settings2,
  Users,
} from "lucide-react";

import { cn } from "@/lib/utils";

export type TabRole = "employee" | "manager" | "admin";

type Tab = { to: string; label: string; icon: LucideIcon };

const EMPLOYEE_TABS: Tab[] = [
  { to: "/my-shifts", label: "Shifts", icon: CalendarDays },
  { to: "/pickup", label: "Open", icon: ClipboardList },
  { to: "/timeclock", label: "Clock", icon: Clock },
  { to: "/assistant", label: "Ask", icon: MessageSquare },
];

const MANAGER_TABS: Tab[] = [
  { to: "/dashboard", label: "Home", icon: LayoutDashboard },
  { to: "/schedule", label: "Schedule", icon: CalendarDays },
  { to: "/team", label: "Team", icon: Users },
  { to: "/assistant", label: "Ask", icon: MessageSquare },
];

const ADMIN_TABS: Tab[] = [
  { to: "/dashboard", label: "Home", icon: LayoutDashboard },
  { to: "/schedule", label: "Schedule", icon: CalendarDays },
  { to: "/control-room", label: "Control", icon: Settings2 },
  { to: "/assistant", label: "Ask", icon: MessageSquare },
];

export function tabsForRole(role: TabRole): Tab[] {
  if (role === "admin") return ADMIN_TABS;
  if (role === "manager") return MANAGER_TABS;
  return EMPLOYEE_TABS;
}

/** Thumb-reach navigation for phones. Hidden once there's room for the full menu. */
export function MobileTabBar({
  role,
  pathname,
  onMore,
}: {
  role: TabRole;
  pathname: string;
  onMore: () => void;
}) {
  const tabs = tabsForRole(role);
  return (
    <nav
      aria-label="Main"
      className="fixed inset-x-0 bottom-0 z-40 border-t bg-sidebar text-sidebar-foreground pb-[env(safe-area-inset-bottom)] md:hidden"
    >
      <div className="grid grid-cols-5">
        {tabs.map((tab) => {
          const active = pathname === tab.to;
          const Icon = tab.icon;
          return (
            <Link
              key={tab.to}
              to={tab.to}
              className={cn(
                "flex min-h-14 flex-col items-center justify-center gap-1 px-1 py-2 text-[11px] font-medium transition-colors",
                active ? "text-sidebar-accent-foreground" : "text-sidebar-foreground/70",
              )}
            >
              <Icon className={cn("size-5 shrink-0", active && "scale-110")} />
              <span className="truncate">{tab.label}</span>
            </Link>
          );
        })}
        <button
          type="button"
          onClick={onMore}
          aria-label="Open the menu"
          className="flex min-h-14 flex-col items-center justify-center gap-1 px-1 py-2 text-[11px] font-medium text-sidebar-foreground/70"
        >
          <Menu className="size-5 shrink-0" />
          <span>More</span>
        </button>
      </div>
    </nav>
  );
}
