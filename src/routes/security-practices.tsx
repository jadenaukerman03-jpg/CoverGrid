import { Link, createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/security-practices")({
  head: () => ({
    meta: [
      { title: "Security practices — CoverGrid" },
      {
        name: "description",
        content:
          "How CoverGrid protects staffing and employee records: access levels, automatic sign-out, a full change record, and how long data is kept.",
      },
      { property: "og:title", content: "Security practices — CoverGrid" },
      {
        property: "og:description",
        content:
          "Access levels, automatic sign-out, change records and data retention in plain language.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: SecurityPractices,
});

const CONTROLS: Array<{ title: string; body: string }> = [
  {
    title: "Three levels of access, nothing shared",
    body: "Every person signs in as an employee, a manager, or an administrator. Employees see their own schedule, points and requests. Manager tools and the administrator area are not reachable from an employee account — the rules are enforced by the database itself, not just hidden in the screen.",
  },
  {
    title: "The database enforces the rules",
    body: "Row-level security is switched on for every table that holds staffing or employee information, and each rule is written against the signed-in person. A request for someone else's record comes back empty, whichever screen or device it came from.",
  },
  {
    title: "Encrypted on the way in and at rest",
    body: "The site is served only over HTTPS, and the managed database stores data encrypted on disk. Passwords are never stored by the application; sign-in is handled by the managed authentication service.",
  },
  {
    title: "Automatic sign-out on shared computers",
    body: "Nurses' station computers get used by whoever is standing there. An administrator sets an idle limit, and the app signs the person out on its own once that time passes with no activity.",
  },
  {
    title: "A change record for everything that matters",
    body: "Schedule changes, call-offs, point adjustments, access changes and settings changes are written to a change record with who did it and when — including the ones the system makes for itself. An administrator can download it for any window.",
  },
  {
    title: "Access reviews on a schedule",
    body: "Administrators review the full account list on a set cadence, adjust anyone who no longer needs their level, and sign off. Accounts that have not signed in for 90 days and accounts with no matching staff record are flagged on that list.",
  },
  {
    title: "Records are kept only as long as they are needed",
    body: "Keep-until windows for the change record, message history and notifications are set by an administrator, and anything past its window is removed.",
  },
  {
    title: "Kiosks and public endpoints are verified",
    body: "Time-clock kiosks pair with a device key and are rejected without a valid one. Endpoints that outside systems call — census feeds and message delivery callbacks — verify the caller's signature before anything is written.",
  },
];

export default function SecurityPractices() {
  return (
    <div className="min-h-screen bg-cream text-ink">
      <header className="border-b border-taupe/20 px-5 py-5 sm:px-6">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-4">
          <Link to="/" className="font-marketing-display text-lg font-bold">
            CoverGrid
          </Link>
          <Link
            to="/"
            className="text-sm text-taupe-ink underline underline-offset-4 hover:text-ink"
          >
            Back to home
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-5 py-12 sm:px-6 sm:py-16">
        <h1 className="font-marketing-display text-3xl font-bold sm:text-4xl">
          Security practices
        </h1>
        <p className="mt-4 text-lg text-taupe-ink">
          CoverGrid holds schedules, attendance and employee records for long-term care buildings.
          This page describes the protections built into the product, in plain language, so your IT
          and compliance people can read it without a call.
        </p>

        <div className="mt-10 space-y-8">
          {CONTROLS.map((c) => (
            <section key={c.title}>
              <h2 className="font-marketing-display text-xl font-bold">{c.title}</h2>
              <p className="mt-2 text-taupe-ink">{c.body}</p>
            </section>
          ))}
        </div>

        <section className="mt-12 rounded-xl border border-taupe/30 bg-white/60 p-6">
          <h2 className="font-marketing-display text-xl font-bold">Reporting a problem</h2>
          <p className="mt-2 text-taupe-ink">
            If you believe you have found a security problem, contact your CoverGrid account owner
            directly and describe what you saw and how to reproduce it. Please do not test against a
            live building's data.
          </p>
        </section>

        <p className="mt-10 text-sm text-taupe-ink">
          This page describes product controls only. It is not a certification, an audit result, or
          a legal commitment.
        </p>
      </main>
    </div>
  );
}
