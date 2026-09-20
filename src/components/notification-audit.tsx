import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { getNotificationAudit } from "@/lib/notifications.functions";

type Filters = {
  role: "any" | "employee" | "manager" | "admin";
  category: "any" | "onboarding" | "schedule" | "reminders" | "delivery_failures" | "other";
  channel: "any" | "in_app" | "text";
  status: "any" | "sent" | "failed" | "queued" | "unread" | "read";
  employeeId: string;
  search: string;
  from: string;
  to: string;
};

const EMPTY: Filters = {
  role: "any",
  category: "any",
  channel: "any",
  status: "any",
  employeeId: "any",
  search: "",
  from: "",
  to: "",
};

function stamp(value: string | null) {
  if (!value) return "";
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? value : d.toLocaleString();
}

type Preset = { id: string; name: string; filters: Filters; builtIn?: boolean };

const PRESET_KEY = "notification-audit-presets";

const BUILT_IN: Preset[] = [
  {
    id: "builtin-failed-texts",
    name: "Texts that failed",
    builtIn: true,
    filters: { ...EMPTY, channel: "text", status: "failed" },
  },
  {
    id: "builtin-onboarding",
    name: "Onboarding messages",
    builtIn: true,
    filters: { ...EMPTY, category: "onboarding" },
  },
  {
    id: "builtin-schedule-employees",
    name: "Schedule updates to employees",
    builtIn: true,
    filters: { ...EMPTY, category: "schedule", role: "employee" },
  },
  {
    id: "builtin-still-trying",
    name: "Still trying to send",
    builtIn: true,
    filters: { ...EMPTY, channel: "text", status: "queued" },
  },
];

function loadPresets(): Preset[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(PRESET_KEY);
    const parsed = raw ? (JSON.parse(raw) as Preset[]) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function savePresets(list: Preset[]) {
  try {
    window.localStorage.setItem(PRESET_KEY, JSON.stringify(list));
  } catch {
    /* storage full or blocked — presets just will not stick */
  }
}

function sameFilters(a: Filters, b: Filters) {
  return (Object.keys(EMPTY) as Array<keyof Filters>).every((k) => a[k] === b[k]);
}

function csvCell(value: string | number) {
  const s = String(value ?? "").replace(/"/g, '""');
  return `"${s}"`;
}

export function NotificationAudit() {
  const [filters, setFilters] = useState<Filters>(EMPTY);
  const [mine, setMine] = useState<Preset[]>([]);
  const [presetName, setPresetName] = useState("");
  const load = useServerFn(getNotificationAudit);

  useEffect(() => {
    setMine(loadPresets());
  }, []);

  const presets = [...BUILT_IN, ...mine];
  const activePreset = presets.find((p) => sameFilters(p.filters, filters)) ?? null;

  const applyPreset = (id: string) => {
    const found = presets.find((p) => p.id === id);
    if (found) setFilters({ ...found.filters });
  };

  const saveCurrent = () => {
    const name = presetName.trim();
    if (!name) {
      toast.error("Give the saved audit a name first.");
      return;
    }
    const next = [
      ...mine.filter((p) => p.name.toLowerCase() !== name.toLowerCase()),
      { id: `p-${Date.now()}`, name, filters },
    ];
    setMine(next);
    savePresets(next);
    setPresetName("");
    toast.success(`Saved "${name}".`);
  };

  const deletePreset = (id: string) => {
    const next = mine.filter((p) => p.id !== id);
    setMine(next);
    savePresets(next);
    toast.success("Removed that saved audit.");
  };

  const { data, isFetching } = useQuery({
    queryKey: ["notification-audit", filters],
    queryFn: () =>
      load({
        data: {
          role: filters.role,
          category: filters.category,
          channel: filters.channel,
          status: filters.status,
          employeeId: filters.employeeId === "any" ? null : filters.employeeId,
          search: filters.search,
          from: filters.from || null,
          to: filters.to || null,
        },
      }),
  });

  const rows = useMemo(() => data?.rows ?? [], [data]);

  const exportCsv = () => {
    if (!rows.length) {
      toast.error("Nothing to export with these filters.");
      return;
    }
    const header = [
      "Sent at",
      "Person",
      "Role",
      "Channel",
      "Category",
      "To",
      "Title",
      "Message",
      "Status",
      "Error code",
      "Why it failed",
      "Tries",
      "Last try",
      "Next retry",
      "Retry status",
    ];
    const lines = [
      header.map(csvCell).join(","),
      ...rows.map((r) =>
        [
          stamp(r.at),
          r.person,
          r.personRole,
          r.channel === "text" ? "Text" : "In app",
          r.category,
          r.to,
          r.title,
          r.body,
          r.statusNote,
          r.code,
          r.reason,
          r.attemptsUsed,
          stamp(r.lastAttemptAt),
          stamp(r.nextRetryAt),
          r.retryNote,
        ]
          .map(csvCell)
          .join(","),
      ),
    ];
    const blob = new Blob([`\uFEFF${lines.join("\n")}`], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `notification-history-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success(`Exported ${rows.length} messages.`);
  };

  const set = (patch: Partial<Filters>) => setFilters((f) => ({ ...f, ...patch }));

  return (
    <Card>
      <CardHeader>
        <CardTitle className="font-display text-xl">Audit everything that was sent</CardTitle>
        <CardDescription>
          Narrow it down by who, what, how, and when — then download it as a spreadsheet for your
          records.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2 rounded-md border p-3">
          <p className="text-sm font-medium">Saved audits</p>
          <div className="flex flex-wrap gap-2">
            {presets.map((p) => (
              <span key={p.id} className="flex items-center gap-1">
                <Button
                  size="sm"
                  variant={activePreset?.id === p.id ? "default" : "outline"}
                  onClick={() => applyPreset(p.id)}
                >
                  {p.name}
                </Button>
                {!p.builtIn && (
                  <Button
                    size="sm"
                    variant="ghost"
                    aria-label={`Remove ${p.name}`}
                    onClick={() => deletePreset(p.id)}
                  >
                    ×
                  </Button>
                )}
              </span>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Input
              className="max-w-xs"
              placeholder="Name these filters to save them"
              value={presetName}
              onChange={(e) => setPresetName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") saveCurrent();
              }}
            />
            <Button size="sm" variant="secondary" onClick={saveCurrent}>
              Save current filters
            </Button>
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="space-y-1">
            <Label className="text-xs">Role</Label>
            <Select value={filters.role} onValueChange={(v) => set({ role: v as Filters["role"] })}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="any">Everyone</SelectItem>
                <SelectItem value="employee">Employees</SelectItem>
                <SelectItem value="manager">Managers</SelectItem>
                <SelectItem value="admin">Administrators</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Kind of message</Label>
            <Select
              value={filters.category}
              onValueChange={(v) => set({ category: v as Filters["category"] })}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="any">All kinds</SelectItem>
                <SelectItem value="onboarding">Onboarding handoff</SelectItem>
                <SelectItem value="schedule">Schedule updates</SelectItem>
                <SelectItem value="reminders">Reminders and due dates</SelectItem>
                <SelectItem value="delivery_failures">Delivery problems</SelectItem>
                <SelectItem value="other">Everything else</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">How it was sent</Label>
            <Select
              value={filters.channel}
              onValueChange={(v) => set({ channel: v as Filters["channel"] })}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="any">In app and text</SelectItem>
                <SelectItem value="text">Text only</SelectItem>
                <SelectItem value="in_app">In app only</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Delivery</Label>
            <Select
              value={filters.status}
              onValueChange={(v) => set({ status: v as Filters["status"] })}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="any">Any status</SelectItem>
                <SelectItem value="sent">Delivered</SelectItem>
                <SelectItem value="failed">Failed</SelectItem>
                <SelectItem value="queued">Still going out</SelectItem>
                <SelectItem value="unread">Unread in app</SelectItem>
                <SelectItem value="read">Read in app</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Person</Label>
            <Select value={filters.employeeId} onValueChange={(v) => set({ employeeId: v })}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="max-h-72">
                <SelectItem value="any">Anyone</SelectItem>
                {(data?.people ?? []).map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">From</Label>
            <Input
              type="date"
              value={filters.from}
              onChange={(e) => set({ from: e.target.value })}
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">To</Label>
            <Input type="date" value={filters.to} onChange={(e) => set({ to: e.target.value })} />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Search wording</Label>
            <Input
              placeholder="Name, number, or words in the message"
              value={filters.search}
              onChange={(e) => set({ search: e.target.value })}
            />
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button onClick={exportCsv} disabled={isFetching}>
            Export {rows.length} to spreadsheet
          </Button>
          <Button variant="ghost" onClick={() => setFilters(EMPTY)}>
            Clear filters
          </Button>
          <span className="text-sm text-muted-foreground">
            {isFetching
              ? "Looking…"
              : `${data?.counts.total ?? 0} messages · ${data?.counts.failed ?? 0} failed · ${data?.counts.pending ?? 0} still trying`}
          </span>
        </div>

        <div className="space-y-2">
          {!isFetching && rows.length === 0 && (
            <p className="text-muted-foreground">Nothing matches those filters.</p>
          )}
          {rows.slice(0, 100).map((r) => (
            <div key={r.id} className="rounded-md border p-3 text-sm">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="font-medium">
                    {r.person} <span className="text-muted-foreground">· {r.personRole}</span>
                  </p>
                  <p className="text-muted-foreground">{r.title}</p>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant="outline">{r.channel === "text" ? "Text" : "In app"}</Badge>
                  <Badge
                    variant={
                      r.status === "failed"
                        ? "destructive"
                        : r.status === "sent"
                          ? "secondary"
                          : "outline"
                    }
                  >
                    {r.statusNote}
                  </Badge>
                </div>
              </div>
              <p className="mt-1 text-muted-foreground">{r.body}</p>
              <p className="mt-1 text-xs text-muted-foreground">
                {stamp(r.at)}
                {r.to ? ` · ${r.to}` : ""}
              </p>
              {(r.reason || r.retryState !== "delivered") && (
                <p
                  className={`mt-1 text-xs ${r.status === "failed" ? "text-destructive" : "text-muted-foreground"}`}
                >
                  {r.code ? `Code ${r.code} · ` : ""}
                  {r.reason ? `${r.reason} ` : ""}
                  {r.retryNote}
                  {r.hint ? ` ${r.hint}` : ""}
                </p>
              )}
            </div>
          ))}
          {rows.length > 100 && (
            <p className="text-xs text-muted-foreground">
              Showing the newest 100 on screen — the export includes all {rows.length}.
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
