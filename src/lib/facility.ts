export const SHIFTS = ["first", "second", "third"] as const;
export type ShiftType = (typeof SHIFTS)[number];
export type PositionType = "nurse" | "qma" | "cna";
export const POSITIONS = ["nurse", "qma", "cna"] as const;

export const UNIT_NAMES = ["Birch", "Cedar", "Dogwood"] as const;

export const SHIFT_LABEL: Record<ShiftType, string> = {
  first: "First shift",
  second: "Second shift",
  third: "Third shift",
};

export const SHIFT_ORDER: Record<ShiftType, number> = { first: 1, second: 2, third: 3 };

/** CNA shifts are 8h; nurses work 30 minutes longer on the same shift. */
export const SHIFT_WINDOW: Record<ShiftType, Record<PositionType, [string, string]>> = {
  first: {
    cna: ["6:00 AM", "2:00 PM"],
    qma: ["6:00 AM", "2:00 PM"],
    nurse: ["6:00 AM", "2:30 PM"],
  },
  second: {
    cna: ["2:00 PM", "10:00 PM"],
    qma: ["2:00 PM", "10:00 PM"],
    nurse: ["2:00 PM", "10:30 PM"],
  },
  third: {
    cna: ["10:00 PM", "6:00 AM"],
    qma: ["10:00 PM", "6:00 AM"],
    nurse: ["10:00 PM", "6:30 AM"],
  },
};

/** Shift start in minutes from midnight; third shift crosses midnight but is one continuous shift. */
export const SHIFT_START_MINUTES: Record<ShiftType, number> = {
  first: 6 * 60,
  second: 14 * 60,
  third: 22 * 60,
};

export const POSITION_LABEL: Record<PositionType, string> = {
  nurse: "Nurse",
  qma: "QMA",
  cna: "CNA",
};

export function shiftHours(position: PositionType): number {
  return position === "nurse" ? 8.5 : 8;
}

export function shiftWindowLabel(shift: ShiftType, position: PositionType): string {
  const [a, b] = SHIFT_WINDOW[shift][position];
  return `${a} – ${b}`;
}

// ---- Attendance policy ----
export const LATE_GRACE_MINUTES = 7;
export const CALL_OFF_MINUTES = 120;
export const LATE_POINTS = 0.5;
export const CALL_OFF_POINTS = 1;

/** Points fall off after a rolling twelve months. */
export const POINT_ROLLING_MONTHS = 12;

/** The point total at which employment is reviewed for termination. */
export const TERMINATION_POINTS = 8;

/** Progressive attendance steps. Employees are notified as they reach each one. */
export const ATTENDANCE_LEVELS: { points: number; label: string; detail: string }[] = [
  {
    points: 3,
    label: "Verbal coaching",
    detail: "A supervisor will check in with you about attendance.",
  },
  {
    points: 5,
    label: "Written warning",
    detail: "A written attendance warning is placed in your file.",
  },
  {
    points: 7,
    label: "Final warning",
    detail: "One more occurrence puts your employment under review.",
  },
  {
    points: TERMINATION_POINTS,
    label: "Determination point",
    detail: "Employment is reviewed at this total.",
  },
];

export function attendanceStatus(total: number) {
  const reached = [...ATTENDANCE_LEVELS].reverse().find((l) => total >= l.points) ?? null;
  const next = ATTENDANCE_LEVELS.find((l) => total < l.points) ?? null;
  const remaining = Number(Math.max(0, TERMINATION_POINTS - total).toFixed(1));
  const tone: "good" | "watch" | "warning" | "critical" =
    total >= TERMINATION_POINTS
      ? "critical"
      : total >= 5
        ? "warning"
        : total >= 2.5
          ? "watch"
          : "good";
  return {
    total: Number(total.toFixed(1)),
    reached,
    next,
    remainingToTermination: remaining,
    percentToTermination: Math.min(100, Math.round((total / TERMINATION_POINTS) * 100)),
    tone,
  };
}

/** More than one month of notice is required for PTO. */
export const PTO_MIN_NOTICE_DAYS = 31;

/** Minimum rest between the end of one shift and the start of the next. */
export const MIN_REST_HOURS = 8;
export const OVERTIME_THRESHOLD_HOURS = 40;

export function classifyArrival(minutesAfterStart: number): "on_time" | "late" | "call_off" {
  if (minutesAfterStart > CALL_OFF_MINUTES) return "call_off";
  if (minutesAfterStart > LATE_GRACE_MINUTES) return "late";
  return "on_time";
}

// ---- Date helpers (all dates are plain YYYY-MM-DD strings) ----
export function toISODate(d: Date | string): string {
  if (typeof d === "string") return d.slice(0, 10);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function addDays(date: string, days: number): string {
  const d = new Date(`${date}T12:00:00`);
  d.setDate(d.getDate() + days);
  return toISODate(d);
}

/** Scheduling weeks run Sunday through Saturday. */
export function startOfWeek(date: string): string {
  const d = new Date(`${date}T12:00:00`);
  return addDays(date, -d.getDay());
}

export function dayOfWeek(date: string): number {
  return new Date(`${date}T12:00:00`).getDay();
}

export const DAY_LABEL = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;

// ---- Two-week rotation ----
/** Anchor Sunday: weeks are grouped in repeating A/B pairs from this date. */
export const ROTATION_ANCHOR = "2026-01-04";
export const DEFAULT_DAYS_PER_WEEK = 4;

/** 0 = week A, 1 = week B of the two-week rotation. */
export function rotationWeekIndex(date: string): 0 | 1 {
  const ws = startOfWeek(date);
  const diff = Math.round(
    (new Date(`${ws}T12:00:00`).getTime() - new Date(`${ROTATION_ANCHOR}T12:00:00`).getTime()) /
      86400000,
  );
  const weeks = Math.floor(diff / 7);
  return (((weeks % 2) + 2) % 2) as 0 | 1;
}

export function rotationLabel(date: string): "A" | "B" {
  return rotationWeekIndex(date) === 0 ? "A" : "B";
}

/** Days (0=Sun..6=Sat) the employee's rotation puts them on shift for the given date's week. */
export function rotationDaysFor(
  emp: {
    rotation_week_a_days?: number[] | null;
    rotation_week_b_days?: number[] | null;
    scheduled_days?: number[] | null;
  },
  date: string,
): number[] {
  const a = emp.rotation_week_a_days ?? [];
  const b = emp.rotation_week_b_days ?? [];
  if (a.length === 0 && b.length === 0) return emp.scheduled_days ?? [];
  return rotationWeekIndex(date) === 0 ? a : b;
}

/** Build a default two-week rotation: 4 weekdays each week + every other weekend. */
export function defaultRotation(weekendGroup: "A" | "B", daysPerWeek = DEFAULT_DAYS_PER_WEEK) {
  const weekdays = [1, 2, 3, 4, 5];
  const base = weekdays.slice(0, Math.max(0, Math.min(daysPerWeek, 5)));
  const weekendOn = [0, 6];
  const withWeekend = [...base.slice(0, Math.max(0, base.length - 2)), ...weekendOn].sort(
    (x, y) => x - y,
  );
  return weekendGroup === "A"
    ? { weekA: withWeekend, weekB: base }
    : { weekA: base, weekB: withWeekend };
}

export function dateRange(from: string, to: string): string[] {
  const out: string[] = [];
  let cur = from;
  let guard = 0;
  while (cur <= to && guard++ < 400) {
    out.push(cur);
    cur = addDays(cur, 1);
  }
  return out;
}

export function formatDate(date: string, opts?: Intl.DateTimeFormatOptions): string {
  return new Date(`${date}T12:00:00`).toLocaleDateString(
    "en-US",
    opts ?? { weekday: "short", month: "short", day: "numeric" },
  );
}

export function isWeekend(date: string): boolean {
  const dow = new Date(`${date}T12:00:00`).getDay();
  return dow === 0 || dow === 6;
}

export type CoverageRow = {
  date: string;
  shift: ShiftType;
  unitId: string;
  unitName: string;
  position: PositionType;
  required: number;
  filled: number;
  gap: number;
  /** Required plus the call-off safety buffer the autopilot tries to keep on the floor. */
  target?: number;
  /** How many more people are needed to reach the buffered target. */
  bufferGap?: number;
  state: "understaffed" | "staffed" | "overstaffed";
};

export function coverageState(required: number, filled: number): CoverageRow["state"] {
  if (filled < required) return "understaffed";
  if (filled > required) return "overstaffed";
  return "staffed";
}
