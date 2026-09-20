import { gapHours, getShiftInterval, intervalsOverlap, shiftDurationHours } from "./time";
import {
  DEFAULT_RANKING_POLICY,
  type Employee,
  type ExcludedCandidate,
  type ExclusionReason,
  type RankCandidatesInput,
  type RankCandidatesResult,
  type RankedCandidate,
  type RankingPolicy,
} from "./types";

/**
 * Ranks every employee eligible to fill an open shift.
 *
 * Hard eligibility (role, certifications, conflicts, double-booking, rest,
 * and weekly-hour caps) is enforced as exclusion, not scoring, because those
 * are ratio/labor-law constraints, not preferences — a facility needs to be
 * able to show a surveyor exactly why an excluded employee was excluded.
 * Everything that passes is then scored on soft preferences (home unit,
 * fairness, attendance standing) so the best-fit candidate is texted first.
 */
export function rankCandidates(input: RankCandidatesInput): RankCandidatesResult {
  const policy: RankingPolicy = {
    ...DEFAULT_RANKING_POLICY,
    ...input.policy,
    scoreWeights: {
      ...DEFAULT_RANKING_POLICY.scoreWeights,
      ...input.policy?.scoreWeights,
    },
  };
  const now = input.now ? new Date(input.now) : new Date();
  const shiftInterval = getShiftInterval(
    input.shift.shiftDate,
    input.shift.startTime,
    input.shift.endTime,
  );
  const shiftHours = shiftDurationHours(shiftInterval);

  const ranked: RankedCandidate[] = [];
  const excluded: ExcludedCandidate[] = [];

  const exclude = (employee: Employee, reason: ExclusionReason, detail: string) => {
    excluded.push({ employee, reason, detail });
  };

  for (const employee of input.employees) {
    if (!employee.active) {
      exclude(employee, "inactive", "Employee is marked inactive.");
      continue;
    }

    if (input.calledOffEmployeeIds?.includes(employee.id)) {
      exclude(
        employee,
        "called_off_this_shift",
        "This employee already called off this exact shift.",
      );
      continue;
    }

    if (employee.primaryRoleId !== input.shift.roleId) {
      exclude(
        employee,
        "role_mismatch",
        "Employee's role does not match the shift's required role.",
      );
      continue;
    }

    const isHomeUnit = employee.homeUnitId === input.shift.unitId;
    if (!isHomeUnit && !employee.floatEligible) {
      exclude(
        employee,
        "not_home_unit_and_not_float_eligible",
        "Not this employee's home unit, and they are not marked float-eligible.",
      );
      continue;
    }

    const missingCertifications = input.shift.requiredCertifications.filter(
      (cert) => !employee.certifications.includes(cert),
    );
    if (missingCertifications.length > 0) {
      exclude(
        employee,
        "missing_certification",
        `Missing required certification(s): ${missingCertifications.join(", ")}.`,
      );
      continue;
    }

    if (employee.conflictsWith.some((id) => input.coAssignedEmployeeIds.includes(id))) {
      exclude(
        employee,
        "conflict_pair",
        "A co-worker already assigned to this shift is on this employee's conflict list.",
      );
      continue;
    }

    const employeeAssignments = input.existingAssignments.filter(
      (a) => a.employeeId === employee.id,
    );
    const employeeIntervals = employeeAssignments.map((a) =>
      getShiftInterval(a.shiftDate, a.startTime, a.endTime),
    );

    const overlapping = employeeIntervals.some((interval) =>
      intervalsOverlap(interval, shiftInterval),
    );
    if (overlapping) {
      exclude(
        employee,
        "double_booked",
        "Employee is already scheduled during an overlapping window.",
      );
      continue;
    }

    const restViolation = employeeIntervals.some(
      (interval) => gapHours(interval, shiftInterval) < policy.minRestHours,
    );
    if (restViolation) {
      exclude(
        employee,
        "insufficient_rest",
        `Filling this shift would leave less than ${policy.minRestHours}h rest against another scheduled shift.`,
      );
      continue;
    }

    const projectedWeeklyHours = employee.hoursScheduledThisWeek + shiftHours;
    if (projectedWeeklyHours > employee.maxWeeklyHours) {
      exclude(
        employee,
        "weekly_hours_exceeded",
        `Would bring the employee to ${projectedWeeklyHours.toFixed(1)}h this week, over their ${employee.maxWeeklyHours}h cap.`,
      );
      continue;
    }

    const wouldRequireOvertime = projectedWeeklyHours > policy.overtimeThresholdHours;

    const { score, reasons } = scoreCandidate({
      employee,
      isHomeUnit,
      wouldRequireOvertime,
      projectedWeeklyHours,
      shift: input.shift,
      now,
      weights: policy.scoreWeights,
    });

    ranked.push({ employee, score, wouldRequireOvertime, reasons });
  }

  ranked.sort((a, b) => b.score - a.score);

  return { shift: input.shift, ranked, excluded };
}

function scoreCandidate(args: {
  employee: Employee;
  isHomeUnit: boolean;
  wouldRequireOvertime: boolean;
  projectedWeeklyHours: number;
  shift: RankCandidatesInput["shift"];
  now: Date;
  weights: RankingPolicy["scoreWeights"];
}): { score: number; reasons: string[] } {
  const { employee, isHomeUnit, wouldRequireOvertime, projectedWeeklyHours, shift, now, weights } =
    args;
  let score = 0;
  const reasons: string[] = [];

  if (isHomeUnit) {
    score += weights.homeUnit;
    reasons.push("Home unit match.");
  } else {
    score += weights.floatEligible;
    reasons.push("Float-eligible for this unit.");
  }

  if (employee.preferredUnitIds.includes(shift.unitId)) {
    score += weights.preferredUnit;
    reasons.push("Matches this employee's stated unit preference.");
  }

  const attendanceScore = Math.max(0, weights.attendanceStanding - employee.attendancePoints * 2);
  score += attendanceScore;
  reasons.push(
    employee.attendancePoints === 0
      ? "Clean attendance record."
      : `Attendance standing: ${employee.attendancePoints} point(s) on file.`,
  );

  const daysSinceLastOffered = employee.lastOfferedAt
    ? (now.getTime() - new Date(employee.lastOfferedAt).getTime()) / (1000 * 60 * 60 * 24)
    : Number.POSITIVE_INFINITY;
  const fairnessScore = Math.min(
    weights.fairnessRecency,
    (daysSinceLastOffered / 14) * weights.fairnessRecency,
  );
  score += fairnessScore;
  reasons.push(
    employee.lastOfferedAt === null
      ? "Has not been offered a pickup shift before — fairness priority."
      : `Last offered a pickup shift ${daysSinceLastOffered.toFixed(1)} day(s) ago.`,
  );

  if (wouldRequireOvertime) {
    score -= weights.overtimePenalty;
    reasons.push(
      `Would require overtime (${projectedWeeklyHours.toFixed(1)}h projected this week).`,
    );
  }

  return { score, reasons };
}
