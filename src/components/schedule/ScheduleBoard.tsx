import { DndContext, useDraggable, useDroppable, type DragEndEvent } from "@dnd-kit/core";
import { useServerFn } from "@tanstack/react-start";
import { useCallback, useEffect, useMemo, useState } from "react";

import {
  getActivityLog,
  getRankedCandidates,
  getScheduleWeek,
  reassignShiftAction,
  reportCallOffAction,
} from "@/services/scheduling/schedule-actions";
import type {
  ActivityLogEntry,
  ScheduleGridData,
  ScheduleGridShift,
} from "@/services/scheduling/schedule.server";
import type { RankCandidatesResult } from "@/services/scheduling/types";

const ROLE_COLORS = [
  { bg: "bg-teal-100", text: "text-teal-800", dot: "bg-teal-500" },
  { bg: "bg-purple-100", text: "text-purple-800", dot: "bg-purple-500" },
  { bg: "bg-amber-100", text: "text-amber-800", dot: "bg-amber-500" },
  { bg: "bg-blue-100", text: "text-blue-800", dot: "bg-blue-500" },
];

function roleColor(roleId: string, roleIds: string[]) {
  const index = roleIds.indexOf(roleId);
  return ROLE_COLORS[index % ROLE_COLORS.length]!;
}

function mondayIso(date = new Date()): string {
  const day = date.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  const monday = new Date(date);
  monday.setDate(date.getDate() + diff);
  return monday.toISOString().slice(0, 10);
}

function weekDates(weekStart: string): string[] {
  const start = new Date(`${weekStart}T00:00:00`);
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    return d.toISOString().slice(0, 10);
  });
}

const WEEKDAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

interface Row {
  key: string;
  label: string;
  roleId: string;
  isOpenRow: boolean;
  employeeId: string | null;
}

function ShiftChip({
  shift,
  color,
  draggable,
  onClick,
}: {
  shift: ScheduleGridShift;
  color: { bg: string; text: string };
  draggable: boolean;
  onClick: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: shift.id,
    disabled: !draggable,
    data: { shift },
  });

  return (
    <button
      ref={setNodeRef}
      type="button"
      onClick={onClick}
      {...(draggable ? { ...listeners, ...attributes } : {})}
      style={
        transform
          ? {
              transform: `translate3d(${transform.x}px, ${transform.y}px, 0)`,
              zIndex: isDragging ? 10 : undefined,
            }
          : undefined
      }
      className={`w-full rounded-md px-2 py-1.5 text-left text-xs ${color.bg} ${color.text} ${
        draggable ? "cursor-grab active:cursor-grabbing" : "cursor-pointer"
      } ${isDragging ? "opacity-50" : ""}`}
    >
      {shift.assignedEmployeeName ?? "Shift"}
    </button>
  );
}

function OpenChip({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full rounded-md border border-dashed border-red-400 bg-red-50 px-2 py-1.5 text-left text-xs font-medium text-red-700"
    >
      OPEN
    </button>
  );
}

function Cell({ id, children }: { id: string; children: React.ReactNode }) {
  const { setNodeRef, isOver } = useDroppable({ id });
  return (
    <div ref={setNodeRef} className={`min-h-[42px] rounded-md p-0.5 ${isOver ? "bg-accent" : ""}`}>
      {children}
    </div>
  );
}

export function ScheduleBoard() {
  const loadWeek = useServerFn(getScheduleWeek);
  const loadActivity = useServerFn(getActivityLog);
  const loadCandidates = useServerFn(getRankedCandidates);
  const reassign = useServerFn(reassignShiftAction);
  const reportCallOff = useServerFn(reportCallOffAction);

  const [weekStart, setWeekStart] = useState(() => mondayIso());
  const [grid, setGrid] = useState<ScheduleGridData>();
  const [activity, setActivity] = useState<ActivityLogEntry[]>([]);
  const [error, setError] = useState("");
  const [openShiftId, setOpenShiftId] = useState<string>();
  const [candidates, setCandidates] = useState<RankCandidatesResult>();
  const [candidatesLoading, setCandidatesLoading] = useState(false);

  const refresh = useCallback(async () => {
    const [weekResult, activityResult] = await Promise.all([
      loadWeek({ data: { weekStart } }),
      loadActivity({ data: { weekStart } }),
    ]);
    setGrid(weekResult as ScheduleGridData);
    setActivity(activityResult as ActivityLogEntry[]);
  }, [loadWeek, loadActivity, weekStart]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  function shiftWeek(deltaDays: number) {
    const next = new Date(`${weekStart}T00:00:00`);
    next.setDate(next.getDate() + deltaDays);
    setWeekStart(next.toISOString().slice(0, 10));
  }

  const unit = grid?.units[0];
  const roleIds = useMemo(() => grid?.roles.map((r) => r.id) ?? [], [grid]);
  const dates = useMemo(() => weekDates(weekStart), [weekStart]);

  const unitShifts = useMemo(
    () => (grid && unit ? grid.shifts.filter((s) => s.unitId === unit.id) : []),
    [grid, unit],
  );

  const rows = useMemo<Row[]>(() => {
    if (!unit) return [];
    const employees = new Map<string, string>();
    const openRoles = new Set<string>();
    for (const shift of unitShifts) {
      if (shift.assignedEmployeeId && shift.assignedEmployeeName) {
        employees.set(shift.assignedEmployeeId, shift.assignedEmployeeName);
      }
      if (shift.status === "open") openRoles.add(shift.roleId);
    }
    const employeeRows: Row[] = Array.from(employees.entries()).map(([id, label]) => ({
      key: `employee:${id}`,
      label,
      roleId: unitShifts.find((s) => s.assignedEmployeeId === id)?.roleId ?? "",
      isOpenRow: false,
      employeeId: id,
    }));
    const openRows: Row[] = Array.from(openRoles).map((roleId) => ({
      key: `open:${roleId}`,
      label: `Open — ${grid?.roles.find((r) => r.id === roleId)?.name ?? "shift"}`,
      roleId,
      isOpenRow: true,
      employeeId: null,
    }));
    return [...employeeRows, ...openRows];
  }, [unit, unitShifts, grid]);

  function shiftFor(row: Row, date: string): ScheduleGridShift | undefined {
    if (row.isOpenRow) {
      return unitShifts.find(
        (s) => s.shiftDate === date && s.roleId === row.roleId && s.status === "open",
      );
    }
    return unitShifts.find((s) => s.shiftDate === date && s.assignedEmployeeId === row.employeeId);
  }

  async function openCandidatePanel(shiftId: string) {
    setOpenShiftId(shiftId);
    setCandidates(undefined);
    setCandidatesLoading(true);
    try {
      const result = await loadCandidates({ data: { shiftInstanceId: shiftId } });
      setCandidates(result as RankCandidatesResult);
    } finally {
      setCandidatesLoading(false);
    }
  }

  async function assignCandidate(employeeId: string) {
    if (!openShiftId) return;
    const result = await reassign({ data: { shiftInstanceId: openShiftId, employeeId } });
    if (!result.success) {
      setError(result.reason ?? "Unable to assign this employee.");
      return;
    }
    setError("");
    setOpenShiftId(undefined);
    await refresh();
  }

  async function handleCallOff(shiftId: string) {
    await reportCallOff({ data: { shiftInstanceId: shiftId } });
    await refresh();
  }

  async function handleDragEnd(event: DragEndEvent) {
    const shift = event.active.data.current?.["shift"] as ScheduleGridShift | undefined;
    const over = event.over;
    if (!shift || !over) return;
    const [, targetDate, targetEmployeeId] = String(over.id).split("|");
    if (!targetDate || targetDate !== shift.shiftDate) {
      setError("Shifts can only be reassigned within the same day here.");
      return;
    }
    if (!targetEmployeeId || targetEmployeeId === shift.assignedEmployeeId) return;
    const result = await reassign({
      data: { shiftInstanceId: shift.id, employeeId: targetEmployeeId },
    });
    if (!result.success) {
      setError(result.reason ?? "That reassignment isn't allowed.");
      return;
    }
    setError("");
    await refresh();
  }

  if (!grid) {
    return <div className="p-6 text-sm text-muted-foreground">Loading schedule…</div>;
  }
  if (!unit) {
    return (
      <div className="p-6 text-sm text-muted-foreground">No units exist for this facility yet.</div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl p-6">
      <div className="mb-4 flex items-center gap-4">
        <h1 className="text-xl font-semibold text-foreground">{unit.name}</h1>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => shiftWeek(-7)}
            className="rounded-md border border-input px-2 py-1 text-xs hover:bg-accent"
          >
            ← Prev
          </button>
          <span className="text-sm text-muted-foreground">
            {grid.weekStart} – {grid.weekEnd}
          </span>
          <button
            type="button"
            onClick={() => shiftWeek(7)}
            className="rounded-md border border-input px-2 py-1 text-xs hover:bg-accent"
          >
            Next →
          </button>
        </div>
      </div>

      {error && (
        <div className="mb-4 rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="mb-4 flex items-center gap-4 text-xs text-muted-foreground">
        {grid.roles.map((role) => {
          const color = roleColor(role.id, roleIds);
          return (
            <span key={role.id} className="flex items-center gap-1.5">
              <span className={`inline-block h-2.5 w-2.5 rounded-sm ${color.dot}`} />
              {role.name}
            </span>
          );
        })}
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-2.5 w-2.5 rounded-sm border border-dashed border-red-400" />
          Open shift
        </span>
      </div>

      <DndContext onDragEnd={(event) => void handleDragEnd(event)}>
        <div
          className="grid gap-1.5 text-sm"
          style={{ gridTemplateColumns: `120px repeat(${dates.length}, minmax(0, 1fr))` }}
        >
          <div />
          {dates.map((date, i) => (
            <div key={date} className="text-center text-xs text-muted-foreground">
              {WEEKDAY_LABELS[i]}
            </div>
          ))}

          {rows.map((row) => (
            <div key={row.key} className="contents">
              <div className="flex items-center text-xs text-muted-foreground">{row.label}</div>
              {dates.map((date) => {
                const shift = shiftFor(row, date);
                const cellId = `cell|${date}|${row.employeeId ?? ""}`;
                return (
                  <Cell key={cellId} id={cellId}>
                    {shift ? (
                      shift.status === "open" ? (
                        <OpenChip onClick={() => void openCandidatePanel(shift.id)} />
                      ) : (
                        <div className="group relative">
                          <ShiftChip
                            shift={shift}
                            color={roleColor(shift.roleId, roleIds)}
                            draggable
                            onClick={() => void handleCallOff(shift.id)}
                          />
                        </div>
                      )
                    ) : null}
                  </Cell>
                );
              })}
            </div>
          ))}
        </div>
      </DndContext>

      {openShiftId && (
        <div className="mt-4 rounded-md bg-muted p-3">
          <div className="mb-2 flex items-center justify-between">
            <p className="text-xs text-muted-foreground">Ranked by the fill engine</p>
            <button
              type="button"
              onClick={() => setOpenShiftId(undefined)}
              className="text-xs text-muted-foreground hover:text-foreground"
            >
              Close
            </button>
          </div>
          {candidatesLoading && (
            <p className="text-xs text-muted-foreground">Ranking candidates…</p>
          )}
          {candidates?.ranked.map((candidate) => (
            <div
              key={candidate.employee.id}
              className="flex items-center justify-between border-t border-border py-2 first:border-t-0"
            >
              <div>
                <p className="text-sm text-foreground">{candidate.employee.fullName}</p>
                <p className="text-xs text-muted-foreground">{candidate.reasons.join(" ")}</p>
              </div>
              <button
                type="button"
                onClick={() => void assignCandidate(candidate.employee.id)}
                className="rounded-md border border-input px-2 py-1 text-xs hover:bg-accent"
              >
                Assign
              </button>
            </div>
          ))}
          {candidates && candidates.ranked.length === 0 && (
            <p className="text-xs text-muted-foreground">No eligible candidates found.</p>
          )}
        </div>
      )}

      <div className="mt-6">
        <p className="mb-2 text-xs font-medium text-muted-foreground">Activity — tracked</p>
        <div className="flex flex-col gap-1.5">
          {activity.map((entry) => (
            <div
              key={entry.id}
              className="rounded-md bg-muted px-3 py-1.5 text-xs text-muted-foreground"
            >
              {new Date(entry.timestamp).toLocaleString()} — {entry.description}
            </div>
          ))}
          {activity.length === 0 && (
            <p className="text-xs text-muted-foreground">Nothing logged yet this week.</p>
          )}
        </div>
      </div>
    </div>
  );
}
