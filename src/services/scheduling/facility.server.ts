import { createSupabaseAdminClient } from "@/lib/supabase/server";

let cachedFacilityId: string | undefined;

/**
 * There's no auth/multi-tenant login yet, so every request operates against
 * whichever facility exists first. This is a deliberate demo-mode shortcut,
 * not the long-term model — real auth resolves the facility from the signed-in
 * user's `facility_members` row instead. Remove this once that lands.
 */
export async function getDemoFacilityId(): Promise<string> {
  if (cachedFacilityId) return cachedFacilityId;
  const { data, error } = await createSupabaseAdminClient()
    .from("facilities")
    .select("id")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (error || !data) throw new Error("No facility exists yet.");
  cachedFacilityId = data.id;
  return data.id;
}
