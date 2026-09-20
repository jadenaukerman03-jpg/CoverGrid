import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getFacilityConfig } from "@/lib/staffing.functions";

export const Route = createFileRoute("/_authenticated/policies")({
  head: () => ({
    meta: [
      { title: "Policy & information — CoverGrid" },
      {
        name: "description",
        content:
          "Attendance points, call-off and late rules, time-off notice, shift switches, floating, orientation and privacy — written out plainly for staff and schedulers.",
      },
      { property: "og:title", content: "Policy & information — CoverGrid" },
      {
        property: "og:description",
        content: "The house rules the schedule runs on, in plain language.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: PoliciesPage,
});

type Section = { title: string; blurb: string; points: string[] };

const SHARED: Section[] = [
  {
    title: "Attendance points",
    blurb: "Every late arrival and call-off is recorded the same way for everyone.",
    points: [
      "Showing up late is half a point (0.5).",
      "Calling off a scheduled shift is a full point (1.0).",
      "You get a notice each time a point is added, with the date and the reason.",
      "Your point total is private. Only you and management can see it — never your coworkers.",
    ],
  },
  {
    title: "Calling off",
    blurb: "Call as early as you can so the shift can be covered.",
    points: [
      "Call the facility directly — a call-off is not official until it is recorded here.",
      "Once it is entered, your name comes off that shift and the shift is opened to qualified staff automatically.",
      "The system texts the people who can legally work that shift; first to accept gets it.",
    ],
  },
  {
    title: "Time off and vacation",
    blurb: "Requests need at least one month of notice.",
    points: [
      "Anything submitted with less than one month of notice is turned down automatically.",
      "Approved time off blocks the schedule from putting you on those days.",
      "Requests are answered in the order they come in for the same days.",
    ],
  },
  {
    title: "Switching shifts",
    blurb: "You can trade with anyone qualified for that shift.",
    points: [
      "Both people have to confirm the trade before it goes to management.",
      "A trade is checked for overtime, rest between shifts and licensing before it can be approved.",
      "Until a manager approves it, the original person still owns the shift.",
    ],
  },
  {
    title: "Floating to another unit",
    blurb: "Floating is spread out as fairly as the building allows.",
    points: [
      "Who floats is decided by how often you have floated, how long you have worked here and how recently you last floated.",
      "Every float is recorded with a reason so you can see why it was you.",
      "You can opt in to float more often in Settings if you prefer the variety.",
    ],
  },
  {
    title: "Licenses and certifications",
    blurb: "Nobody works on an expired credential.",
    points: [
      "You get a reminder one week before anything expires.",
      "If it lapses, you come off the schedule until it is current again.",
      "Send renewals to your scheduler as soon as you have them.",
    ],
  },
  {
    title: "New hires and orientation",
    blurb: "New staff shadow before they carry an assignment.",
    points: [
      "New hires are scheduled with a preceptor and do not count as coverage during orientation.",
      "Orientation dates, badge numbers and charting logins are set up before the first shift.",
      "Full-time new hires work four days a week with every other weekend.",
    ],
  },
  {
    title: "Privacy",
    blurb: "Personal information stays between you and management.",
    points: [
      "Attendance points, pay, phone numbers and notes are never shown to coworkers.",
      "The schedule shows who is working, the unit and the shift — nothing else.",
      "Every change made in the system is logged with who made it and when.",
    ],
  },
];

const MANAGER_ONLY: Section[] = [
  {
    title: "How the system fills shifts",
    blurb: "The order it works through when a hole opens up.",
    points: [
      "Required coverage comes first — the unit gets staffed before anything else is optimized.",
      "It prefers people who will not go into overtime, then the person with the fewest recent extra shifts.",
      "If nobody in-house fits, it moves to floating, then the float pool, then agency.",
      "Agency bookings stop at the weekly shift cap and dollar budget for that agency.",
    ],
  },
  {
    title: "Overtime and budget",
    blurb: "Guardrails the system will not quietly cross.",
    points: [
      "Overtime is used only when required coverage cannot be met another way, and it is flagged on the schedule.",
      "Weekly labor budget and target hours per resident day are tracked per building.",
      "Anything that would blow a budget is surfaced as a recommendation instead of being booked silently.",
    ],
  },
  {
    title: "Records and reporting",
    blurb: "What is kept and for how long.",
    points: [
      "Punches, schedules, attendance and messages are retained for the number of days set in Settings.",
      "Payroll exports are available in ADP, Paycom, UKG, Paylocity and CMS PBJ layouts.",
      "Every automatic action can be reviewed — and undone — on the Activity page.",
    ],
  },
];

function PoliciesPage() {
  const loadConfig = useServerFn(getFacilityConfig);
  const { data } = useQuery({ queryKey: ["facility-config"], queryFn: () => loadConfig() });
  const isManager = data?.isManager ?? false;
  const sections = isManager ? [...SHARED, ...MANAGER_ONLY] : SHARED;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-3xl">Policy & information</h1>
        <p className="max-w-2xl text-muted-foreground">
          The house rules the schedule runs on, written out plainly. If something here does not
          match how your building works, tell your scheduler — the settings behind these rules can
          be changed.
        </p>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {sections.map((section) => (
          <Card key={section.title}>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">{section.title}</CardTitle>
              <CardDescription>{section.blurb}</CardDescription>
            </CardHeader>
            <CardContent>
              <ul className="list-disc space-y-2 pl-5 text-sm text-muted-foreground">
                {section.points.map((p) => (
                  <li key={p}>{p}</li>
                ))}
              </ul>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
