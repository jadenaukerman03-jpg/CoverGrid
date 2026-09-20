import { createFileRoute } from "@tanstack/react-router";

import { ScheduleBoard } from "@/components/schedule/ScheduleBoard";

export const Route = createFileRoute("/schedule")({ component: ScheduleBoard });
