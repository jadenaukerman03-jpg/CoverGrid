import { useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Check } from "lucide-react";

import heroImage from "@/assets/hero-facility.jpg";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/hooks/useAuth";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "CoverGrid — Staffing That Runs Itself for Nursing Homes" },
      {
        name: "description",
        content:
          "Coverage held on every unit, agency and overtime cut, call-offs replaced in seconds, PBJ and HPPD survey-ready. Built for skilled nursing, ready for hospitals.",
      },
      { property: "og:title", content: "CoverGrid — Staffing That Runs Itself" },
      {
        property: "og:description",
        content:
          "The schedule builds itself, fills itself and documents itself. Less agency, less overtime, no gaps — for nursing homes and hospitals.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Landing,
});

const PAINS = [
  {
    title: "The 5 a.m. scramble",
    body: "Two CNAs call off before day shift. Somebody starts working the phone tree, and the building runs short until someone says yes.",
  },
  {
    title: "Agency invoices nobody planned",
    body: "An unfilled hole becomes a premium agency hour at two to three times your own staff's rate — booked in a panic, not in a plan.",
  },
  {
    title: "Overtime that lands on the same people",
    body: "The reliable ones get asked first, every time. They burn out, then they leave, and the hole gets bigger.",
  },
  {
    title: "PBJ and survey scramble",
    body: "Quarter close turns into a spreadsheet archaeology project, and staffing questions on survey day get answered from memory.",
  },
];

type StoryRow = {
  eyebrow: string;
  title: string;
  body: string;
  points: string[];
  panel: "board" | "ppd" | "phone" | "ledger";
};

const STORY: StoryRow[] = [
  {
    eyebrow: "Scheduling & coverage",
    title: "The hole is filled before anyone picks up a phone.",
    body: "Required counts are held unit by unit, shift by shift, Sunday through Saturday. When someone calls off, the best-ranked qualified, rested person is offered the shift and confirmed — with a plain-English reason on every fill.",
    points: [
      "Schedules generated weeks out and balanced automatically",
      "Drag-and-drop floating with seniority-weighted fair rotation",
      "A call-off cushion so you're covered before the phone rings",
    ],
    panel: "board",
  },
  {
    eyebrow: "Labor & cost control",
    title: "Overtime is prevented, not reported.",
    body: "Live HPPD against your target, by unit and by day, driven off real census. Agency is flagged as a last resort with the cheaper in-house option shown beside it, and payroll-ready exports come out of the same data you scheduled.",
    points: [
      "Overtime forecast before the week starts",
      "Census-driven staffing targets and hourly cost visibility",
      "Agency budgets and per-week shift caps enforced automatically",
    ],
    panel: "ppd",
  },
  {
    eyebrow: "People & retention",
    title: "Your staff carry the schedule in their pocket.",
    body: "Floor staff see their shifts, claim open ones by text, punch in on the wall tablet and check their own attendance points — privately. Managers get a phone-sized command center instead of a spreadsheet.",
    points: [
      "Open shifts offered and claimed by text message",
      "Earned wage access on hours already worked",
      "Recognition, reward points and a shift buy-back program",
    ],
    panel: "phone",
  },
  {
    eyebrow: "Time, attendance & compliance",
    title: "Survey day answers itself.",
    body: "Punch-based time clock with early and late exceptions, automatic attendance points with private notices, license expirations flagged a week out, and CMS PBJ built continuously from the live schedule and punches.",
    points: [
      "Licenses and credentials watched with expiration warnings",
      "Full activity log with one-click undo on every action",
      "PBJ and HPPD ready before anyone asks for them",
    ],
    panel: "ledger",
  },
];

const COMPARISON = [
  {
    feature: "Builds the schedule for you",
    them: "You build it, it stores it",
    us: "Generated, balanced and published for you",
  },
  {
    feature: "Call-off at 5 a.m.",
    them: "You post an open shift and wait",
    us: "Replacement ranked, invited and filled automatically",
  },
  { feature: "Overtime", them: "Reported after it happens", us: "Prevented before it's scheduled" },
  {
    feature: "Why this person?",
    them: "No explanation",
    us: "Plain-English reason on every fill, with runner-ups",
  },
  {
    feature: "PBJ / HPPD",
    them: "Separate module or export",
    us: "Continuous, from the live schedule and punches",
  },
  {
    feature: "After hours",
    them: "Nobody's watching",
    us: "Runs itself hourly, all night, every night",
  },
  { feature: "Mistakes", them: "Fix it by hand", us: "One-click undo on any recorded action" },
];

const FAQS = [
  {
    q: "Do we have to change how our building works?",
    a: "No. Your units, shift times, required counts, point system and PTO rules are configured to match what you already do. The system enforces your policy, not a generic one.",
  },
  {
    q: "What if the schedulers don't like technology?",
    a: 'They can talk to it in plain English. "Sarah called off for second shift on Cedar" is enough — the system records the point, opens the slot and finds the replacement.',
  },
  {
    q: "Can we watch it before we trust it?",
    a: "Yes. Watch-only mode runs the full cycle every hour and shows exactly what it would have done and why, without changing anything. Turn it live when you're comfortable.",
  },
  {
    q: "Is anyone's attendance record visible to coworkers?",
    a: "Never. Points and notices are private to the employee and their manager, enforced at the database level.",
  },
  {
    q: "Will this work in a hospital?",
    a: "The same engine handles departments, roles and skill mixes instead of units and positions. Nursing homes are supported today; hospital departments, ratios and float pools are next on the roadmap.",
  },
];

function currency(n: number) {
  return n.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  });
}

/* ---------------------------------- panels --------------------------------- */

function BoardPanel() {
  const rows = [
    { unit: "Birch · 1st", name: "K. Alvarez", state: "filled" },
    { unit: "Cedar · 2nd", name: "M. Ortiz", state: "just-filled" },
    { unit: "Dogwood · 2nd", name: "T. Whitfield", state: "filled" },
    { unit: "Cedar · 3rd", name: "R. Boone", state: "filled" },
  ];
  return (
    <div className="w-full rounded-2xl bg-white p-4 shadow-xl ring-1 ring-taupe/15 sm:p-6">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-taupe-ink">
          Coverage board
        </p>
        <span className="rounded-full bg-brand/10 px-3 py-1 text-xs font-semibold text-brand-ink">
          3:12 a.m.
        </span>
      </div>
      <div className="mt-5 space-y-3">
        {rows.map((r) => (
          <div
            key={r.unit}
            className={
              r.state === "just-filled"
                ? "flex items-center justify-between rounded-xl border border-brand/30 bg-brand/5 px-4 py-3"
                : "flex items-center justify-between rounded-xl border border-taupe/15 bg-cream px-4 py-3"
            }
          >
            <div>
              <p className="text-sm font-semibold text-ink">{r.name}</p>
              <p className="text-xs text-taupe-ink">{r.unit}</p>
            </div>
            {r.state === "just-filled" ? (
              <span className="rounded-full bg-brand-ink px-3 py-1 text-xs font-semibold text-white">
                Filled
              </span>
            ) : (
              <Check className="size-4 text-taupe-ink" aria-hidden />
            )}
          </div>
        ))}
      </div>
      <p className="mt-5 border-t border-taupe/15 pt-4 text-sm text-ink/70">
        Cedar 2nd shift CNA called off. <span className="font-semibold text-ink">M. Ortiz</span>{" "}
        offered and confirmed — rested, home unit, stays under 40 hours.
      </p>
    </div>
  );
}

function PpdPanel() {
  const bars = [
    { d: "Sun", v: 62 },
    { d: "Mon", v: 78 },
    { d: "Tue", v: 71 },
    { d: "Wed", v: 96 },
    { d: "Thu", v: 68 },
    { d: "Fri", v: 74 },
    { d: "Sat", v: 58 },
  ];
  return (
    <div className="w-full rounded-2xl bg-white p-4 shadow-xl ring-1 ring-taupe/15 sm:p-6">
      <div className="flex items-baseline justify-between">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-taupe-ink">
          PPD this week
        </p>
        <p className="font-marketing-display text-sm font-bold text-ink">Goal 3.60</p>
      </div>
      <div
        className="relative mt-6 flex h-40 items-end gap-2 sm:gap-3"
        role="img"
        aria-label="Hours per patient day, Sunday through Saturday, against a goal of 3.60. Wednesday is the only day over goal."
      >
        <div
          className="absolute inset-x-0 border-t-2 border-dashed border-ink/30"
          style={{ bottom: "80%" }}
        />
        {bars.map((b) => (
          <div key={b.d} className="flex flex-1 flex-col items-center gap-2">
            <div
              className={
                b.v > 80 ? "w-full rounded-t-md bg-destructive/80" : "w-full rounded-t-md bg-brand"
              }
              style={{ height: `${b.v}%` }}
            />
            <span className="text-[11px] font-medium text-taupe-ink">{b.d}</span>
          </div>
        ))}
      </div>
      <p className="mt-4 border-t border-taupe/15 pt-4 text-sm text-ink/70">
        Wednesday is running over goal. Two people are already flagged for a low-census
        recommendation.
      </p>
    </div>
  );
}

function PhonePanel() {
  return (
    <div
      role="img"
      aria-label="Phone showing open shifts: Cedar second shift tomorrow with a claim button, Birch third shift Friday, Dogwood first shift Sunday"
      className="relative mx-auto h-[26rem] w-56 overflow-hidden rounded-[2.5rem] border-[6px] border-ink bg-white shadow-2xl"
    >
      <div className="absolute left-1/2 top-0 h-4 w-1/2 -translate-x-1/2 rounded-b-xl bg-ink" />
      <div className="space-y-3 p-4 pt-9">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-taupe-ink">
          Open shifts
        </p>
        <div className="rounded-xl bg-brand-ink p-4 text-white">
          <p className="text-sm font-semibold">Cedar · 2nd shift</p>
          <p className="text-xs text-white/80">Tomorrow · 2p–10p · CNA</p>
          <div className="mt-3 rounded-lg bg-white/20 py-2 text-center text-xs font-bold">
            Claim this shift
          </div>
        </div>
        <div className="rounded-xl border border-taupe/20 bg-cream p-3">
          <p className="text-sm font-semibold text-ink">Birch · 3rd shift</p>
          <p className="text-xs text-taupe-ink">Friday · 10p–6a · QMA</p>
        </div>
        <div className="rounded-xl border border-taupe/20 bg-cream p-3">
          <p className="text-sm font-semibold text-ink">Dogwood · 1st shift</p>
          <p className="text-xs text-taupe-ink">Sunday · 6a–2p · CNA</p>
        </div>
      </div>
    </div>
  );
}

function LedgerPanel() {
  const rows = [
    { label: "Punch in — Birch 1st", meta: "On time", tone: "ok" },
    { label: "License renewal due", meta: "In 7 days", tone: "warn" },
    { label: "Attendance point removed", meta: "Shift buy-back", tone: "ok" },
    { label: "PBJ quarter export", meta: "Ready", tone: "ok" },
  ];
  return (
    <div className="w-full rounded-2xl bg-white p-4 shadow-xl ring-1 ring-taupe/15 sm:p-6">
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-taupe-ink">
        Activity log
      </p>
      <div className="mt-5 divide-y divide-taupe/15">
        {rows.map((r) => (
          <div key={r.label} className="flex items-center justify-between py-3">
            <p className="text-sm font-medium text-ink">{r.label}</p>
            <span
              className={
                r.tone === "warn"
                  ? "rounded-full bg-warning/20 px-3 py-1 text-xs font-semibold text-ink"
                  : "rounded-full bg-brand/10 px-3 py-1 text-xs font-semibold text-brand-ink"
              }
            >
              {r.meta}
            </span>
          </div>
        ))}
      </div>
      <p className="mt-4 border-t border-taupe/15 pt-4 text-sm text-ink/70">
        Every action is recorded with who, when and why — and any of it can be undone in one click.
      </p>
    </div>
  );
}

const PANELS = { board: BoardPanel, ppd: PpdPanel, phone: PhonePanel, ledger: LedgerPanel };

/* -------------------------------- estimator -------------------------------- */

function SavingsEstimator() {
  const [agencyHours, setAgencyHours] = useState(180);
  const [agencyRate, setAgencyRate] = useState(62);
  const [staffRate, setStaffRate] = useState(22);
  const [otHours, setOtHours] = useState(240);
  const [adminHours, setAdminHours] = useState(25);

  const result = useMemo(() => {
    const agencySwap = Math.max(0, agencyHours * 0.4) * Math.max(0, agencyRate - staffRate * 1.5);
    const otSaved = Math.max(0, otHours * 0.25) * (staffRate * 0.5);
    const adminSaved = Math.max(0, adminHours) * 4.33 * 30;
    const monthly = agencySwap + otSaved + adminSaved;
    return { agencySwap, otSaved, adminSaved, monthly, annual: monthly * 12 };
  }, [agencyHours, agencyRate, staffRate, otHours, adminHours]);

  const fields = [
    { id: "agencyHours", label: "Agency hours per month", value: agencyHours, set: setAgencyHours },
    { id: "agencyRate", label: "Agency bill rate ($/hr)", value: agencyRate, set: setAgencyRate },
    {
      id: "staffRate",
      label: "Your average staff rate ($/hr)",
      value: staffRate,
      set: setStaffRate,
    },
    { id: "otHours", label: "Overtime hours per month", value: otHours, set: setOtHours },
    {
      id: "adminHours",
      label: "Scheduler hours spent per week",
      value: adminHours,
      set: setAdminHours,
    },
  ];

  return (
    <div className="flex flex-col gap-10 rounded-2xl bg-ink p-6 text-cream shadow-2xl sm:rounded-3xl sm:p-8 lg:flex-row lg:gap-12 lg:p-16">
      <div className="lg:w-1/2">
        <h2
          id="estimator-heading"
          className="font-marketing-display text-2xl font-bold sm:text-4xl"
        >
          Put your own numbers in.
        </h2>
        <p className="mt-4 text-base text-cream/80 sm:text-lg">
          See what your building could recover by moving agency hours in-house, preventing overtime
          before it's scheduled, and giving your scheduler their week back. Nothing is sent anywhere
          — the math happens right here.
        </p>
        <ul className="mt-6 space-y-3 sm:mt-8 sm:space-y-4">
          {[
            "Agency shifts offered to your own staff first",
            "Overtime forecast and headed off before the week starts",
            "Coverage checked every hour, day and night",
          ].map((line) => (
            <li key={line} className="flex items-start gap-3">
              <span className="mt-2 size-2 shrink-0 rounded-full bg-brand-ink" />
              <span className="text-cream/90">{line}</span>
            </li>
          ))}
        </ul>
      </div>

      <div className="w-full rounded-2xl border border-cream/10 bg-cream/5 p-4 sm:p-8 lg:w-1/2">
        <div className="grid gap-4 sm:grid-cols-2">
          {fields.map((f) => (
            <div key={f.id} className="space-y-1.5">
              <Label htmlFor={f.id} className="text-xs text-cream/80">
                {f.label}
              </Label>
              <Input
                id={f.id}
                type="number"
                min={0}
                value={f.value}
                onChange={(e) => f.set(Number(e.target.value) || 0)}
                inputMode="numeric"
                className="min-h-11 border-cream/30 bg-cream/10 text-cream placeholder:text-cream/60 focus-visible:ring-brand"
              />
            </div>
          ))}
        </div>

        <div
          aria-live="polite"
          className="mt-6 rounded-xl border border-cream/10 bg-cream/5 p-5 text-center sm:p-6"
        >
          <span className="block text-xs uppercase tracking-[0.18em] text-cream/80">
            Estimated annual recapture
          </span>
          <span className="mt-2 block font-marketing-display text-4xl font-bold text-brand sm:text-5xl">
            {currency(result.annual)}
          </span>
          <span className="mt-1 block text-sm text-cream/80">
            {currency(result.monthly)} per month
          </span>
        </div>

        <dl className="mt-6 space-y-3 text-sm">
          <div className="flex justify-between border-b border-cream/10 pb-2">
            <dt className="text-cream/80">Agency shifts filled in-house</dt>
            <dd className="font-semibold">{currency(result.agencySwap)}/mo</dd>
          </div>
          <div className="flex justify-between border-b border-cream/10 pb-2">
            <dt className="text-cream/80">Avoidable overtime prevented</dt>
            <dd className="font-semibold">{currency(result.otSaved)}/mo</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-cream/80">Scheduler time returned to the floor</dt>
            <dd className="font-semibold">{currency(result.adminSaved)}/mo</dd>
          </div>
        </dl>
        <p className="mt-5 text-xs leading-relaxed text-cream/70">
          An estimate from the numbers you entered: 40% of agency hours moved to your own staff, a
          quarter of overtime avoided, and scheduler hours valued at $30. Your results depend on
          your roster.
        </p>
      </div>
    </div>
  );
}

/* --------------------------------- landing --------------------------------- */

function Landing() {
  const { session } = useAuth();
  const startTo = session ? "/dashboard" : "/auth";

  return (
    <div className="min-h-dvh bg-cream font-marketing text-ink">
      <a
        href="#main"
        className="sr-only rounded-full bg-ink px-4 py-2 text-sm font-semibold text-cream focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50"
      >
        Skip to main content
      </a>
      <header className="sticky top-0 z-30 border-b border-taupe/15 bg-cream/95 backdrop-blur">
        <div className="mx-auto grid max-w-7xl grid-cols-[minmax(0,1fr)_auto] items-center gap-3 px-4 py-3 sm:px-6 sm:py-4">
          <span className="truncate font-marketing-display text-lg font-bold tracking-tight">
            CoverGrid
          </span>
          <nav aria-label="Front page sections" className="flex items-center gap-1 sm:gap-2">
            {[
              { href: "#savings", label: "Savings", cls: "hidden sm:inline-flex" },
              { href: "#included", label: "What's included", cls: "hidden md:inline-flex" },
              { href: "#compare", label: "Compare", cls: "hidden md:inline-flex" },
            ].map((l) => (
              <a
                key={l.href}
                href={l.href}
                className={`${l.cls} min-h-11 items-center rounded-full px-3 text-sm font-medium text-taupe-ink transition-colors hover:bg-taupe/10 hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-ink`}
              >
                {l.label}
              </a>
            ))}
            <Button
              asChild
              className="min-h-11 rounded-full bg-brand-ink px-5 text-sm text-white shadow-lg shadow-brand/20 hover:bg-brand-ink/90 focus-visible:ring-brand-ink sm:px-6 sm:text-base"
            >
              <Link to={startTo}>{session ? "Open dashboard" : "Sign in"}</Link>
            </Button>
          </nav>
        </div>
      </header>

      <main id="main">
        {/* Hero */}
        <section
          aria-labelledby="hero-heading"
          className="mx-auto flex max-w-5xl flex-col items-center px-5 py-14 text-center sm:px-6 sm:py-20 lg:py-32"
        >
          <span className="mb-5 font-marketing-display text-[11px] font-semibold uppercase tracking-[0.2em] text-taupe-ink sm:mb-6 sm:text-xs">
            Staffing built for skilled nursing, ready for hospitals
          </span>
          <h1
            id="hero-heading"
            className="font-marketing-display text-[2.15rem] font-bold leading-[1.1] sm:text-5xl lg:text-7xl"
          >
            Your building stays staffed{" "}
            <span className="text-brand-deep">while everyone sleeps.</span>
          </h1>
          <p className="mt-6 max-w-2xl text-base leading-relaxed text-taupe-ink sm:mt-8 sm:text-lg lg:text-xl">
            CoverGrid doesn't just hold the schedule. It builds it, watches it every hour, fills the
            holes with the right person, keeps overtime and agency down, and has your PBJ and HPPD
            ready before anyone asks.
          </p>
          <div className="mt-9 flex w-full flex-col gap-3 sm:mt-12 sm:w-auto sm:flex-row sm:gap-4">
            <Button
              asChild
              size="lg"
              className="min-h-13 w-full rounded-full bg-brand-ink px-8 py-6 text-base text-white shadow-lg shadow-brand/20 hover:bg-brand-ink/90 focus-visible:ring-brand-ink sm:w-auto sm:text-lg"
            >
              <Link to={startTo}>{session ? "Go to dashboard" : "See it running"}</Link>
            </Button>
            <Button
              asChild
              size="lg"
              variant="outline"
              className="min-h-13 w-full rounded-full border-taupe-ink/50 bg-transparent px-8 py-6 text-base text-ink hover:bg-taupe/10 hover:text-ink focus-visible:ring-brand-ink sm:w-auto sm:text-lg"
            >
              <a href="#savings">Estimate our savings</a>
            </Button>
          </div>

          <dl className="mt-12 grid w-full grid-cols-1 gap-6 border-t border-taupe/20 pt-8 sm:mt-16 sm:grid-cols-3 sm:gap-8 sm:pt-10">
            {[
              { k: "Every hour", v: "Coverage checked, day and night" },
              { k: "Seconds", v: "From call-off to replacement offer" },
              { k: "Zero", v: "Spreadsheets at quarter close" },
            ].map((s) => (
              <div key={s.k}>
                <dt className="font-marketing-display text-2xl font-bold text-ink sm:text-3xl">
                  {s.k}
                </dt>
                <dd className="mt-1 text-sm text-taupe-ink">{s.v}</dd>
              </div>
            ))}
          </dl>
        </section>

        {/* Proof image */}
        <section
          aria-label="A call-off handled overnight"
          className="mx-auto max-w-7xl px-5 pb-16 sm:px-6 sm:pb-24"
        >
          <div className="relative overflow-hidden rounded-2xl ring-1 ring-taupe/20 sm:rounded-3xl">
            <img
              src={heroImage}
              alt="Care team reviewing a digital staffing board at shift change"
              width={1600}
              height={1008}
              loading="lazy"
              className="h-56 w-full object-cover sm:h-[22rem] lg:h-[30rem]"
            />
            <div className="bg-cream/95 p-4 sm:absolute sm:bottom-6 sm:left-6 sm:right-6 sm:max-w-md sm:rounded-2xl sm:p-5 sm:shadow-xl sm:backdrop-blur">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-taupe-ink sm:text-xs">
                3:12 a.m. — handled
              </p>
              <p className="mt-2 text-sm leading-relaxed text-ink">
                Cedar 2nd shift CNA called off. <span className="font-semibold">M. Ortiz</span>{" "}
                offered and confirmed — rested, home unit, stays under 40 hours. Nobody was woken
                up.
              </p>
            </div>
          </div>
        </section>

        {/* Pain */}
        <section
          aria-labelledby="pain-heading"
          className="border-y border-taupe/15 bg-white/60 px-5 py-16 sm:px-6 sm:py-24"
        >
          <div className="mx-auto max-w-7xl">
            <div className="mb-10 max-w-2xl sm:mb-16">
              <h2
                id="pain-heading"
                className="font-marketing-display text-2xl font-bold sm:text-4xl"
              >
                The cost of business as usual
              </h2>
              <p className="mt-3 text-base text-taupe-ink sm:mt-4 sm:text-lg">
                Every one of these is a hole somebody has to plug by hand. That's where the money
                and the good employees go.
              </p>
            </div>
            <ul className="grid gap-5 sm:grid-cols-2 sm:gap-8 lg:grid-cols-4">
              {PAINS.map((p) => (
                <li
                  key={p.title}
                  className="rounded-2xl border border-taupe/20 bg-white p-6 sm:p-8"
                >
                  <h3 className="font-marketing-display text-lg font-bold sm:text-xl">{p.title}</h3>
                  <p className="mt-3 leading-relaxed text-taupe-ink">{p.body}</p>
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* Savings */}
        <section
          id="savings"
          aria-labelledby="estimator-heading"
          className="mx-auto max-w-7xl scroll-mt-24 px-5 py-16 sm:px-6 sm:py-24"
        >
          <SavingsEstimator />
        </section>

        {/* Alternating story */}
        <section
          id="included"
          aria-label="What's included"
          className="mx-auto max-w-7xl scroll-mt-24 space-y-16 px-5 py-12 sm:space-y-24 sm:px-6 sm:py-16 lg:space-y-32"
        >
          {STORY.map((row, i) => {
            const Panel = PANELS[row.panel];
            return (
              <div
                key={row.title}
                className={`flex flex-col items-center gap-8 sm:gap-12 lg:gap-16 ${i % 2 === 1 ? "lg:flex-row-reverse" : "lg:flex-row"}`}
              >
                <div className="w-full lg:w-1/2">
                  <span className="font-marketing-display text-[11px] font-bold uppercase tracking-[0.18em] text-brand-ink sm:text-xs">
                    {row.eyebrow}
                  </span>
                  <h2 className="mt-3 font-marketing-display text-2xl font-bold leading-tight sm:mt-4 sm:text-4xl">
                    {row.title}
                  </h2>
                  <p className="mt-4 text-base leading-relaxed text-taupe-ink sm:mt-6 sm:text-lg">
                    {row.body}
                  </p>
                  <ul className="mt-6 space-y-3 sm:mt-8">
                    {row.points.map((pt) => (
                      <li key={pt} className="flex items-start gap-3">
                        <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-brand-ink">
                          <Check className="size-3 text-white" aria-hidden="true" />
                        </span>
                        <span className="font-medium text-ink">{pt}</span>
                      </li>
                    ))}
                  </ul>
                </div>
                <div className="flex w-full items-center justify-center rounded-2xl border border-taupe/20 bg-taupe/10 p-4 sm:p-8 lg:w-1/2">
                  <Panel />
                </div>
              </div>
            );
          })}
        </section>

        {/* Comparison */}
        <section
          id="compare"
          aria-labelledby="compare-heading"
          className="scroll-mt-24 bg-taupe/10 px-5 py-16 sm:px-6 sm:py-24"
        >
          <div className="mx-auto max-w-5xl">
            <div className="mb-9 text-center sm:mb-14">
              <h2
                id="compare-heading"
                className="font-marketing-display text-2xl font-bold sm:text-4xl"
              >
                Built for how a building actually runs
              </h2>
              <p className="mt-3 text-base text-taupe-ink sm:text-lg">
                Side by side with the scheduling software you already know.
              </p>
            </div>

            {/* Phones and small tablets: one card per capability */}
            <ul className="space-y-4 md:hidden">
              {COMPARISON.map((r) => (
                <li
                  key={r.feature}
                  className="overflow-hidden rounded-2xl border border-taupe/20 bg-white shadow-sm"
                >
                  <p className="bg-ink px-4 py-3 font-marketing-display text-sm font-semibold text-cream">
                    {r.feature}
                  </p>
                  <div className="space-y-3 p-4">
                    <div>
                      <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-brand-ink">
                        CoverGrid
                      </p>
                      <p className="mt-1 text-sm font-semibold text-brand-ink">{r.us}</p>
                    </div>
                    <div className="border-t border-taupe/15 pt-3">
                      <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-taupe-ink">
                        Traditional scheduling software
                      </p>
                      <p className="mt-1 text-sm text-taupe-ink">{r.them}</p>
                    </div>
                  </div>
                </li>
              ))}
            </ul>

            <div className="hidden overflow-hidden rounded-2xl border border-taupe/20 bg-white shadow-sm md:block">
              <table className="w-full border-collapse text-left">
                <caption className="sr-only">
                  CoverGrid compared with traditional scheduling software, capability by capability
                </caption>
                <thead>
                  <tr className="bg-ink text-cream">
                    <th scope="col" className="p-5 font-marketing-display text-sm font-semibold">
                      Capability
                    </th>
                    <th
                      scope="col"
                      className="bg-brand-ink p-5 font-marketing-display text-sm font-semibold text-white"
                    >
                      CoverGrid
                    </th>
                    <th
                      scope="col"
                      className="p-5 font-marketing-display text-sm font-semibold text-cream/80"
                    >
                      Traditional scheduling software
                    </th>
                  </tr>
                </thead>
                <tbody className="text-sm">
                  {COMPARISON.map((r) => (
                    <tr key={r.feature} className="border-b border-taupe/15 last:border-0">
                      <th scope="row" className="p-5 text-left font-semibold text-ink">
                        {r.feature}
                      </th>
                      <td className="bg-brand/5 p-5 font-semibold text-brand-ink">{r.us}</td>
                      <td className="p-5 text-taupe-ink">{r.them}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </section>

        {/* FAQ */}
        <section
          aria-labelledby="faq-heading"
          className="mx-auto max-w-3xl px-5 py-16 sm:px-6 sm:py-24"
        >
          <h2
            id="faq-heading"
            className="text-center font-marketing-display text-2xl font-bold sm:text-3xl"
          >
            Common questions
          </h2>
          <Accordion type="single" collapsible className="mt-8 sm:mt-12">
            {FAQS.map((f) => (
              <AccordionItem key={f.q} value={f.q} className="border-b border-taupe/20">
                <AccordionTrigger className="min-h-14 py-5 text-left font-marketing-display text-base font-semibold hover:no-underline focus-visible:ring-brand-ink sm:py-6 sm:text-lg">
                  {f.q}
                </AccordionTrigger>
                <AccordionContent className="pb-6 text-base leading-relaxed text-taupe-ink">
                  {f.a}
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </section>

        {/* Final CTA */}
        <section
          aria-labelledby="cta-heading"
          className="flex flex-col items-center bg-brand-ink px-5 py-16 text-center text-white sm:px-6 sm:py-24"
        >
          <h2
            id="cta-heading"
            className="font-marketing-display text-3xl font-bold sm:text-4xl lg:text-5xl"
          >
            Ready to stop working the phone tree?
          </h2>
          <p className="mt-5 max-w-2xl text-base text-white/90 sm:mt-6 sm:text-lg">
            Turn it on in watch-only mode, see exactly what it would have done all week, and go live
            when your team is comfortable.
          </p>
          <Button
            asChild
            size="lg"
            className="mt-8 min-h-13 w-full max-w-sm rounded-full bg-cream px-10 py-6 text-base font-bold text-ink shadow-xl hover:bg-white focus-visible:ring-cream sm:mt-10 sm:w-auto sm:text-lg"
          >
            <Link to={startTo}>{session ? "Go to dashboard" : "See it running"}</Link>
          </Button>
        </section>
      </main>

      <footer className="border-t border-taupe/20 bg-cream px-5 py-8 sm:px-6 sm:py-10">
        <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-3 text-center text-sm text-taupe-ink sm:flex-row sm:gap-4 sm:text-left">
          <span className="font-marketing-display font-bold text-ink">CoverGrid</span>
          <span>Staffing and scheduling that runs itself, for long-term care.</span>
          <Link to="/security-practices" className="underline underline-offset-4 hover:text-ink">
            Security practices
          </Link>
        </div>
      </footer>
    </div>
  );
}
