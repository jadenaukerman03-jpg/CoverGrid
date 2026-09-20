import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

export const getScheduleWeek = createServerFn({ method: "GET" })
  .validator((data: unknown) => z.object({ weekStart: z.string().min(1) }).parse(data))
  .handler(async ({ data }) => {
    const { loadScheduleWeek } = await import("./schedule.server");
    return loadScheduleWeek(data.weekStart);
  });

export const getRankedCandidates = createServerFn({ method: "GET" })
  .validator((data: unknown) => z.object({ shiftInstanceId: z.string().uuid() }).parse(data))
  .handler(async ({ data }) => {
    const { rankCandidatesForShift } = await import("./schedule.server");
    return rankCandidatesForShift(data.shiftInstanceId);
  });

export const reassignShiftAction = createServerFn({ method: "POST" })
  .validator((data: unknown) =>
    z.object({ shiftInstanceId: z.string().uuid(), employeeId: z.string().uuid() }).parse(data),
  )
  .handler(async ({ data }) => {
    const { reassignShift } = await import("./schedule.server");
    return reassignShift(data.shiftInstanceId, data.employeeId);
  });

export const reportCallOffAction = createServerFn({ method: "POST" })
  .validator((data: unknown) => z.object({ shiftInstanceId: z.string().uuid() }).parse(data))
  .handler(async ({ data }) => {
    const { reportCallOff } = await import("./schedule.server");
    await reportCallOff(data.shiftInstanceId);
    return { success: true };
  });

export const getActivityLog = createServerFn({ method: "GET" })
  .validator((data: unknown) => z.object({ weekStart: z.string().min(1) }).parse(data))
  .handler(async ({ data }) => {
    const { loadActivityLog } = await import("./schedule.server");
    return loadActivityLog(data.weekStart);
  });
