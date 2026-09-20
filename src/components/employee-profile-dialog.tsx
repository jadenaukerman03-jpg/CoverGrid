import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { addEmployeeNote, deleteEmployeeNote, getEmployeeProfile } from "@/lib/staffing.functions";

export function EmployeeProfileDialog({
  employeeId,
  onOpenChange,
}: {
  employeeId: string | null;
  onOpenChange: (open: boolean) => void;
}) {
  const qc = useQueryClient();
  const load = useServerFn(getEmployeeProfile);
  const addNote = useServerFn(addEmployeeNote);
  const removeNote = useServerFn(deleteEmployeeNote);
  const [note, setNote] = useState("");

  const { data, isLoading } = useQuery({
    queryKey: ["employee-profile", employeeId],
    queryFn: () => load({ data: { employeeId: employeeId! } }),
    enabled: Boolean(employeeId),
  });

  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: ["employee-profile", employeeId] });
    void qc.invalidateQueries({ queryKey: ["schedule"] });
  };

  const save = useMutation({
    mutationFn: () => addNote({ data: { employeeId: employeeId!, body: note.trim() } }),
    onSuccess: () => {
      setNote("");
      invalidate();
      toast.success("Note added");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const del = useMutation({
    mutationFn: (noteId: string) => removeNote({ data: { noteId } }),
    onSuccess: invalidate,
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={Boolean(employeeId)} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] max-w-2xl overflow-y-auto">
        {isLoading || !data ? (
          <p className="text-muted-foreground">Loading profile…</p>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle className="font-display text-2xl">{data.name}</DialogTitle>
              <DialogDescription>
                {data.positionLabel} · home unit {data.homeUnit} · {data.shiftLabel} · weekend group{" "}
                {data.weekendGroup ?? "—"}
              </DialogDescription>
            </DialogHeader>

            <div className="grid gap-3 sm:grid-cols-3">
              <Stat label="Hours this week" value={`${data.weeklyHours}h`} />
              <Stat
                label="Times floated"
                value={String(data.floatCount)}
                hint={data.lastFloatedOn ? `Last ${data.lastFloatedOn}` : "Never floated"}
              />
              <Stat
                label="Attendance points"
                value={data.attendance ? String(data.attendance.total) : "Private"}
                hint={
                  data.attendance
                    ? `${data.attendance.remainingToTermination} from determination`
                    : "Visible to the employee and management"
                }
              />
            </div>

            <div className="space-y-1 text-sm">
              <p className="text-muted-foreground">
                Hired {data.hireDate} · {data.employmentType} · {data.daysPerWeek} days/week ·{" "}
                {data.rewardPoints} reward points
              </p>
              <p className="text-muted-foreground">
                Qualified units: {data.qualifiedUnits.join(", ") || data.homeUnit}
              </p>
              {data.email && (
                <p className="text-muted-foreground">
                  {data.email}
                  {data.phone ? ` · ${data.phone}` : ""}
                </p>
              )}
            </div>

            <section className="space-y-2">
              <h3 className="font-medium">Notes</h3>
              {data.notes.length === 0 && (
                <p className="text-sm text-muted-foreground">No notes on file.</p>
              )}
              {data.notes.map((n) => (
                <div
                  key={n.id}
                  className="flex items-start justify-between gap-3 rounded-md border px-3 py-2 text-sm"
                >
                  <div>
                    <p>{n.body}</p>
                    <p className="text-xs text-muted-foreground">
                      {n.author} · {new Date(n.createdAt).toLocaleDateString()}
                      {n.pinned ? " · pinned" : ""}
                    </p>
                  </div>
                  {data.canEdit && (
                    <Button variant="ghost" size="sm" onClick={() => del.mutate(n.id)}>
                      Remove
                    </Button>
                  )}
                </div>
              ))}
              {data.canEdit && (
                <div className="flex gap-2">
                  <Textarea
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    placeholder="Add a note about this employee…"
                    rows={2}
                  />
                  <Button disabled={!note.trim() || save.isPending} onClick={() => save.mutate()}>
                    Add
                  </Button>
                </div>
              )}
            </section>

            <section className="space-y-2">
              <h3 className="font-medium">Upcoming shifts</h3>
              {data.upcoming.length === 0 && (
                <p className="text-sm text-muted-foreground">Nothing scheduled.</p>
              )}
              <div className="grid gap-2 sm:grid-cols-2">
                {data.upcoming.slice(0, 10).map((s) => (
                  <div key={s.id} className="rounded-md border px-3 py-2 text-sm">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-medium">{s.date}</span>
                      {s.isFloat && <Badge variant="secondary">Float</Badge>}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {s.unit} · {s.shiftLabel} · {s.window}
                    </p>
                  </div>
                ))}
              </div>
            </section>

            <section className="space-y-2">
              <h3 className="font-medium">Recent history</h3>
              {data.recent.length === 0 && (
                <p className="text-sm text-muted-foreground">No recent shifts.</p>
              )}
              <div className="grid gap-2 sm:grid-cols-2">
                {data.recent.map((s) => (
                  <div key={s.id} className="rounded-md border px-3 py-2 text-sm">
                    <div className="flex items-center justify-between gap-2">
                      <span>{s.date}</span>
                      <Badge variant="outline" className="capitalize">
                        {s.status.replace("_", " ")}
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {s.unit} · {s.shiftLabel}
                    </p>
                  </div>
                ))}
              </div>
            </section>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-lg border p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="font-display text-2xl">{value}</p>
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}
