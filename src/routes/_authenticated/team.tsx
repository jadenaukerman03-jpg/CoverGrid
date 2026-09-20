import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";

import { EmployeeProfileDialog } from "@/components/employee-profile-dialog";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { getEmployees } from "@/lib/staffing.functions";

export const Route = createFileRoute("/_authenticated/team")({
  head: () => ({
    meta: [
      { title: "Team — CoverGrid" },
      {
        name: "description",
        content: "Roster of CNAs and nurses with unit, shift, weekly hours and attendance points.",
      },
      { property: "og:title", content: "Team — CoverGrid" },
      {
        property: "og:description",
        content: "Roster with unit, shift, weekly hours and attendance standing.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: TeamPage,
});

function TeamPage() {
  const load = useServerFn(getEmployees);
  const [q, setQ] = useState("");
  const { data, isLoading } = useQuery({ queryKey: ["employees"], queryFn: () => load() });

  const [profileId, setProfileId] = useState<string | null>(null);
  const rows = (data?.employees ?? []).filter((e) =>
    e.name.toLowerCase().includes(q.toLowerCase()),
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl">Team</h1>
          <p className="text-muted-foreground">{rows.length} active employees</p>
        </div>
        <Input
          className="max-w-xs"
          placeholder="Search by name"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
      </div>

      {isLoading && <p className="text-muted-foreground">Loading roster…</p>}

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Position</TableHead>
                <TableHead>Home unit</TableHead>
                <TableHead>Shift</TableHead>
                <TableHead className="text-right">Hours this week</TableHead>
                {data?.isManager && <TableHead className="text-right">Points</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((e) => (
                <TableRow key={e.id}>
                  <TableCell className="font-medium">
                    <button
                      type="button"
                      className="text-left underline-offset-2 hover:underline"
                      onClick={() => setProfileId(e.id)}
                    >
                      {e.name}
                    </button>
                  </TableCell>
                  <TableCell>{e.positionLabel}</TableCell>
                  <TableCell>{e.homeUnit}</TableCell>
                  <TableCell>{e.shiftLabel}</TableCell>
                  <TableCell className="text-right">
                    {e.weeklyHours}h{" "}
                    {e.overtime && (
                      <Badge className="ml-1 bg-warning text-warning-foreground">OT</Badge>
                    )}
                  </TableCell>
                  {data?.isManager && (
                    <TableCell className="text-right">
                      <span className={e.points && e.points >= 3 ? "text-destructive" : ""}>
                        {e.points ?? 0}
                      </span>
                    </TableCell>
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
      <EmployeeProfileDialog
        employeeId={profileId}
        onOpenChange={(open) => !open && setProfileId(null)}
      />
    </div>
  );
}
