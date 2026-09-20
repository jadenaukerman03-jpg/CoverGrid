export const PAYROLL_FORMATS = [
  {
    id: "standard",
    label: "Standard (readable)",
    note: "Plain columns for review or a spreadsheet.",
  },
  {
    id: "adp",
    label: "ADP Workforce Now",
    note: "Paydata batch layout: Co Code, File #, Reg Hours, O/T Hours.",
  },
  { id: "paycom", label: "Paycom", note: "Employee Code, Punch Type, Hours, Pay Period End." },
  { id: "ukg", label: "UKG / Kronos", note: "Person Number, Pay Code, Amount, Apply Date." },
  { id: "paylocity", label: "Paylocity", note: "Company ID, Employee ID, Earning Code, Hours." },
  { id: "pbj", label: "CMS PBJ hours", note: "Hours by job title for Payroll-Based Journal." },
] as const;

export type PayrollFormat = (typeof PAYROLL_FORMATS)[number]["id"];
