// Vendor and control catalog. Client-safe reference data.
/** Outside services that touch facility data. Shown to auditors and customers. */
export type Vendor = { name: string; purpose: string; data: string; region: string };

export const VENDORS: Vendor[] = [
  {
    name: "Lovable Cloud (Supabase)",
    purpose: "Database, sign-in and file storage for the whole product",
    data: "Staff records, schedules, punches, messages, change record",
    region: "United States",
  },
  {
    name: "Twilio",
    purpose: "Text messages for call-offs, open shifts and reminders",
    data: "Mobile number, message text",
    region: "United States",
  },
  {
    name: "Resend",
    purpose: "Email delivery for reminders, password resets and reports",
    data: "Email address, message text",
    region: "United States",
  },
  {
    name: "Lovable AI Gateway",
    purpose: "The assistant and the background scheduler",
    data: "Schedule and staffing details needed to answer a request",
    region: "United States",
  },
  {
    name: "Payroll and census systems (PointClickCare, ADP, Paycom, UKG, Paylocity)",
    purpose: "Census in, hours out — only where the facility turns the connection on",
    data: "Census counts, worked hours, employee identifiers",
    region: "Per vendor agreement",
  },
];

/** Plain-language list of the controls this product enforces in software. */
export type Control = { id: string; area: string; control: string; evidence: string };

export const CONTROLS: Control[] = [
  {
    id: "CC6.1",
    area: "Access",
    control:
      "Every account has one role: employee, manager or administrator. Rules are enforced in the database, not just the screens.",
    evidence: "Account list on this page",
  },
  {
    id: "CC6.2",
    area: "Access",
    control:
      "Accounts are created only through sign-up with a work email and matched to a staff record.",
    evidence: "Account list, staff record column",
  },
  {
    id: "CC6.3",
    area: "Access",
    control: "Access is reviewed on a set schedule and signed off by an administrator.",
    evidence: "Past reviews on this page",
  },
  {
    id: "CC6.6",
    area: "Access",
    control:
      "Passwords are checked against known breached passwords, must be at least eight characters, and repeated failures lock the email for fifteen minutes.",
    evidence: "Sign-in trouble panel",
  },
  {
    id: "CC6.7",
    area: "Access",
    control: "Idle sessions sign out automatically on the administrator's timer.",
    evidence: "Rules card on this page",
  },
  {
    id: "CC7.2",
    area: "Monitoring",
    control:
      "Every change to schedules, staff and settings is written to a change record that cannot be edited or deleted for ninety days.",
    evidence: "Change record download",
  },
  {
    id: "CC7.3",
    area: "Incidents",
    control: "Security events are logged, rated, worked and closed with a written follow-up.",
    evidence: "Incident log on this page",
  },
  {
    id: "CC7.4",
    area: "Incidents",
    control: "Failed sign-ins are visible to administrators for two days and kept for ninety.",
    evidence: "Sign-in trouble panel",
  },
  {
    id: "C1.1",
    area: "Records",
    control: "Records are removed automatically once past their keep-until date.",
    evidence: "Retention settings and the change record",
  },
  {
    id: "CC9.2",
    area: "Vendors",
    control: "Outside services that touch facility data are listed with what they receive.",
    evidence: "Vendor list on this page",
  },
];
