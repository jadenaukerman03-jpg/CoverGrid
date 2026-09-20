export interface Employee {
  id: string;
  fullName: string;
  homeUnitId: string;
  primaryRoleId: string;
  floatEligible: boolean;
  active: boolean;
  certifications: string[];
  /** Rolling attendance-point total. Higher = worse standing. */
  attendancePoints: number;
  maxWeeklyHours: number;
  hoursScheduledThisWeek: number;
  /** ISO timestamp of the last time this employee was offered a pickup shift. */
  lastOfferedAt: string | null;
  /** Employee ids this person cannot be scheduled alongside. */
  conflictsWith: string[];
  /** Employee ids of unit/shift-type combos this person has said they prefer. */
  preferredUnitIds: string[];
}

export interface AssignedShift {
  employeeId: string;
  shiftDate: string; // YYYY-MM-DD
  startTime: string; // HH:mm
  endTime: string; // HH:mm
}

export interface OpenShift {
  id: string;
  unitId: string;
  roleId: string;
  shiftDate: string; // YYYY-MM-DD
  startTime: string; // HH:mm
  endTime: string; // HH:mm
  requiredCertifications: string[];
}

export interface RankCandidatesInput {
  shift: OpenShift;
  employees: Employee[];
  /** Every other assignment on the books, across all units, for conflict/double-booking/rest checks. */
  existingAssignments: AssignedShift[];
  /** Employees already assigned to this exact shift's unit + date (for conflict-pair checks). */
  coAssignedEmployeeIds: string[];
  /** Employees who already called off this exact shift instance — never re-offer it to them. */
  calledOffEmployeeIds?: string[];
  now?: string;
  policy?: Partial<RankingPolicy>;
}

export interface RankingPolicy {
  /** Minimum rest hours required between the end of one shift and the start of the next. */
  minRestHours: number;
  /** Weekly hours beyond which a fill would require overtime approval. */
  overtimeThresholdHours: number;
  scoreWeights: {
    homeUnit: number;
    floatEligible: number;
    preferredUnit: number;
    attendanceStanding: number;
    fairnessRecency: number;
    overtimePenalty: number;
  };
}

export const DEFAULT_RANKING_POLICY: RankingPolicy = {
  minRestHours: 8,
  overtimeThresholdHours: 40,
  scoreWeights: {
    homeUnit: 50,
    floatEligible: 20,
    preferredUnit: 15,
    attendanceStanding: 10,
    fairnessRecency: 15,
    overtimePenalty: 25,
  },
};

export type ExclusionReason =
  | "inactive"
  | "role_mismatch"
  | "missing_certification"
  | "conflict_pair"
  | "double_booked"
  | "insufficient_rest"
  | "not_home_unit_and_not_float_eligible"
  | "weekly_hours_exceeded"
  | "called_off_this_shift";

export interface ExcludedCandidate {
  employee: Employee;
  reason: ExclusionReason;
  detail: string;
}

export interface RankedCandidate {
  employee: Employee;
  score: number;
  wouldRequireOvertime: boolean;
  reasons: string[];
}

export interface RankCandidatesResult {
  shift: OpenShift;
  ranked: RankedCandidate[];
  excluded: ExcludedCandidate[];
}
