export interface ShiftInterval {
  start: Date;
  end: Date;
}

function minutesSinceMidnight(time: string): number {
  const [hoursRaw, minutesRaw] = time.split(":");
  const hours = Number(hoursRaw);
  const minutes = Number(minutesRaw);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) {
    throw new Error(`Invalid time value: "${time}"`);
  }
  return hours * 60 + minutes;
}

/**
 * Resolves a shift's date + start/end time strings into concrete instants,
 * rolling the end time to the next day when it's not after the start time
 * (an overnight shift, e.g. 19:00 -> 07:00).
 */
export function getShiftInterval(
  shiftDate: string,
  startTime: string,
  endTime: string,
): ShiftInterval {
  const start = new Date(`${shiftDate}T00:00:00`);
  start.setMinutes(minutesSinceMidnight(startTime));

  const end = new Date(`${shiftDate}T00:00:00`);
  end.setMinutes(minutesSinceMidnight(endTime));
  if (end.getTime() <= start.getTime()) {
    end.setDate(end.getDate() + 1);
  }

  return { start, end };
}

export function shiftDurationHours(interval: ShiftInterval): number {
  return (interval.end.getTime() - interval.start.getTime()) / (1000 * 60 * 60);
}

export function intervalsOverlap(a: ShiftInterval, b: ShiftInterval): boolean {
  return a.start.getTime() < b.end.getTime() && b.start.getTime() < a.end.getTime();
}

/** Gap in hours between two non-overlapping intervals. Negative if they overlap. */
export function gapHours(a: ShiftInterval, b: ShiftInterval): number {
  const gapMs =
    a.start.getTime() >= b.end.getTime()
      ? a.start.getTime() - b.end.getTime()
      : b.start.getTime() - a.end.getTime();
  return gapMs / (1000 * 60 * 60);
}
