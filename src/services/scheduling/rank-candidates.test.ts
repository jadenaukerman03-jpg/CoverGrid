import { describe, expect, it } from "vitest";

import { rankCandidates } from "./rank-candidates";
import type { AssignedShift, Employee, OpenShift } from "./types";

const UNIT_A = "unit-a";
const UNIT_B = "unit-b";
const ROLE_CNA = "role-cna";
const ROLE_RN = "role-rn";

function makeEmployee(overrides: Partial<Employee> = {}): Employee {
  return {
    id: "emp-1",
    fullName: "Test Employee",
    homeUnitId: UNIT_A,
    primaryRoleId: ROLE_CNA,
    floatEligible: false,
    active: true,
    certifications: [],
    attendancePoints: 0,
    maxWeeklyHours: 40,
    hoursScheduledThisWeek: 0,
    lastOfferedAt: null,
    conflictsWith: [],
    preferredUnitIds: [],
    ...overrides,
  };
}

function makeShift(overrides: Partial<OpenShift> = {}): OpenShift {
  return {
    id: "shift-1",
    unitId: UNIT_A,
    roleId: ROLE_CNA,
    shiftDate: "2026-09-20",
    startTime: "07:00",
    endTime: "15:00",
    requiredCertifications: [],
    ...overrides,
  };
}

describe("rankCandidates - hard exclusions", () => {
  it("excludes inactive employees", () => {
    const result = rankCandidates({
      shift: makeShift(),
      employees: [makeEmployee({ active: false })],
      existingAssignments: [],
      coAssignedEmployeeIds: [],
    });
    expect(result.ranked).toHaveLength(0);
    expect(result.excluded[0]?.reason).toBe("inactive");
  });

  it("excludes an employee who already called off this exact shift", () => {
    const result = rankCandidates({
      shift: makeShift(),
      employees: [makeEmployee({ id: "emp-1" })],
      existingAssignments: [],
      coAssignedEmployeeIds: [],
      calledOffEmployeeIds: ["emp-1"],
    });
    expect(result.excluded[0]?.reason).toBe("called_off_this_shift");
  });

  it("excludes role mismatches", () => {
    const result = rankCandidates({
      shift: makeShift({ roleId: ROLE_RN }),
      employees: [makeEmployee({ primaryRoleId: ROLE_CNA })],
      existingAssignments: [],
      coAssignedEmployeeIds: [],
    });
    expect(result.excluded[0]?.reason).toBe("role_mismatch");
  });

  it("excludes non-home-unit employees who are not float-eligible", () => {
    const result = rankCandidates({
      shift: makeShift({ unitId: UNIT_B }),
      employees: [makeEmployee({ homeUnitId: UNIT_A, floatEligible: false })],
      existingAssignments: [],
      coAssignedEmployeeIds: [],
    });
    expect(result.excluded[0]?.reason).toBe("not_home_unit_and_not_float_eligible");
  });

  it("includes float-eligible employees on a non-home unit", () => {
    const result = rankCandidates({
      shift: makeShift({ unitId: UNIT_B }),
      employees: [makeEmployee({ homeUnitId: UNIT_A, floatEligible: true })],
      existingAssignments: [],
      coAssignedEmployeeIds: [],
    });
    expect(result.ranked).toHaveLength(1);
    expect(result.ranked[0]?.reasons).toContain("Float-eligible for this unit.");
  });

  it("excludes employees missing a required certification", () => {
    const result = rankCandidates({
      shift: makeShift({ requiredCertifications: ["BLS"] }),
      employees: [makeEmployee({ certifications: [] })],
      existingAssignments: [],
      coAssignedEmployeeIds: [],
    });
    expect(result.excluded[0]?.reason).toBe("missing_certification");
  });

  it("excludes employees on a co-assigned employee's conflict list", () => {
    const result = rankCandidates({
      shift: makeShift(),
      employees: [makeEmployee({ id: "emp-1", conflictsWith: ["emp-2"] })],
      existingAssignments: [],
      coAssignedEmployeeIds: ["emp-2"],
    });
    expect(result.excluded[0]?.reason).toBe("conflict_pair");
  });

  it("excludes employees with an overlapping shift", () => {
    const existingAssignments: AssignedShift[] = [
      { employeeId: "emp-1", shiftDate: "2026-09-20", startTime: "06:00", endTime: "14:00" },
    ];
    const result = rankCandidates({
      shift: makeShift({ startTime: "07:00", endTime: "15:00" }),
      employees: [makeEmployee()],
      existingAssignments,
      coAssignedEmployeeIds: [],
    });
    expect(result.excluded[0]?.reason).toBe("double_booked");
  });

  it("excludes employees who would not get minimum rest", () => {
    const existingAssignments: AssignedShift[] = [
      { employeeId: "emp-1", shiftDate: "2026-09-19", startTime: "23:00", endTime: "23:59" },
    ];
    const result = rankCandidates({
      shift: makeShift({ shiftDate: "2026-09-20", startTime: "05:00", endTime: "13:00" }),
      employees: [makeEmployee()],
      existingAssignments,
      coAssignedEmployeeIds: [],
    });
    expect(result.excluded[0]?.reason).toBe("insufficient_rest");
  });

  it("allows a shift with exactly the minimum rest gap", () => {
    // Prior shift ends 23:00 on 9/19; new shift starts 07:00 on 9/20 -> 8h gap exactly.
    const existingAssignments: AssignedShift[] = [
      { employeeId: "emp-1", shiftDate: "2026-09-19", startTime: "15:00", endTime: "23:00" },
    ];
    const result = rankCandidates({
      shift: makeShift({ shiftDate: "2026-09-20", startTime: "07:00", endTime: "15:00" }),
      employees: [makeEmployee()],
      existingAssignments,
      coAssignedEmployeeIds: [],
    });
    expect(result.excluded).toHaveLength(0);
    expect(result.ranked).toHaveLength(1);
  });

  it("excludes employees who would exceed their weekly hour cap", () => {
    const result = rankCandidates({
      shift: makeShift({ startTime: "07:00", endTime: "15:00" }), // 8h shift
      employees: [makeEmployee({ maxWeeklyHours: 40, hoursScheduledThisWeek: 35 })],
      existingAssignments: [],
      coAssignedEmployeeIds: [],
    });
    expect(result.excluded[0]?.reason).toBe("weekly_hours_exceeded");
  });

  it("flags overtime instead of excluding when under the hard cap but over the OT threshold", () => {
    const result = rankCandidates({
      shift: makeShift({ startTime: "07:00", endTime: "15:00" }), // 8h shift
      employees: [makeEmployee({ maxWeeklyHours: 60, hoursScheduledThisWeek: 35 })],
      existingAssignments: [],
      coAssignedEmployeeIds: [],
    });
    expect(result.excluded).toHaveLength(0);
    expect(result.ranked[0]?.wouldRequireOvertime).toBe(true);
  });
});

describe("rankCandidates - scoring order", () => {
  it("ranks a home-unit employee above an equally clean float-eligible one", () => {
    const homeUnitEmployee = makeEmployee({ id: "home", homeUnitId: UNIT_A });
    const floatEmployee = makeEmployee({ id: "float", homeUnitId: UNIT_B, floatEligible: true });

    const result = rankCandidates({
      shift: makeShift({ unitId: UNIT_A }),
      employees: [floatEmployee, homeUnitEmployee],
      existingAssignments: [],
      coAssignedEmployeeIds: [],
    });

    expect(result.ranked.map((r) => r.employee.id)).toEqual(["home", "float"]);
  });

  it("ranks employees with fewer attendance points above chronic offenders, all else equal", () => {
    const clean = makeEmployee({ id: "clean", attendancePoints: 0 });
    const flagged = makeEmployee({ id: "flagged", attendancePoints: 6 });

    const result = rankCandidates({
      shift: makeShift(),
      employees: [flagged, clean],
      existingAssignments: [],
      coAssignedEmployeeIds: [],
    });

    expect(result.ranked.map((r) => r.employee.id)).toEqual(["clean", "flagged"]);
  });

  it("boosts employees who have never been offered a pickup over recently-offered ones", () => {
    const neverOffered = makeEmployee({ id: "never", lastOfferedAt: null });
    const recentlyOffered = makeEmployee({
      id: "recent",
      lastOfferedAt: new Date().toISOString(),
    });

    const result = rankCandidates({
      shift: makeShift(),
      employees: [recentlyOffered, neverOffered],
      existingAssignments: [],
      coAssignedEmployeeIds: [],
    });

    expect(result.ranked.map((r) => r.employee.id)).toEqual(["never", "recent"]);
  });

  it("penalizes a candidate who would require overtime against one who would not", () => {
    const noOvertime = makeEmployee({ id: "no-ot", hoursScheduledThisWeek: 10 });
    const overtime = makeEmployee({ id: "ot", hoursScheduledThisWeek: 35, maxWeeklyHours: 60 });

    const result = rankCandidates({
      shift: makeShift({ startTime: "07:00", endTime: "15:00" }),
      employees: [overtime, noOvertime],
      existingAssignments: [],
      coAssignedEmployeeIds: [],
    });

    expect(result.ranked.map((r) => r.employee.id)).toEqual(["no-ot", "ot"]);
  });
});
