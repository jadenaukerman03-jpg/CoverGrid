import { DEFAULT_BRAND, normalizeHex, type BrandTheme } from "./brand-theme";
import { db, loadActor, logAudit, requireAdmin } from "./staffing.server";

export async function readBrandTheme(): Promise<BrandTheme> {
  const { data } = await db.from("app_config").select("value").eq("key", "theme").maybeSingle();
  const value = (data?.value ?? {}) as Partial<BrandTheme>;
  return {
    primary: normalizeHex(String(value.primary ?? DEFAULT_BRAND.primary), DEFAULT_BRAND.primary),
    accent: normalizeHex(String(value.accent ?? DEFAULT_BRAND.accent), DEFAULT_BRAND.accent),
  };
}

export async function writeBrandTheme(userId: string, input: BrandTheme): Promise<BrandTheme> {
  const actor = await loadActor(userId);
  requireAdmin(actor);
  const theme: BrandTheme = {
    primary: normalizeHex(input.primary, DEFAULT_BRAND.primary),
    accent: normalizeHex(input.accent, DEFAULT_BRAND.accent),
  };
  const { error } = await db.from("app_config").upsert(
    {
      key: "theme",
      value: theme,
      label: "Company colors used across the whole app",
      updated_by: userId,
    },
    { onConflict: "key" },
  );
  if (error) throw new Error(error.message);
  await logAudit(
    "app_setting_changed",
    actor.profile?.full_name ?? actor.profile?.email ?? "administrator",
    "app_config",
    null,
    { key: "theme", value: theme },
  );
  return theme;
}
