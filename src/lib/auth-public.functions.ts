import { createServerFn } from "@tanstack/react-start";

/** Public list of buildings for the sign-in page. Names only — nothing private. */
export const listBuildings = createServerFn({ method: "GET" }).handler(async () => {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin.from("facilities").select("id,name").order("name");
  if (error) return [] as Array<{ id: string; name: string }>;
  return (data ?? []).map((f) => ({ id: f.id as string, name: f.name as string }));
});
