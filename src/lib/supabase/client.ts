import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let browserClient: SupabaseClient | undefined;

function requiredBrowserEnvironment(name: "VITE_SUPABASE_URL" | "VITE_SUPABASE_PUBLISHABLE_KEY") {
  const value = import.meta.env[name];
  if (!value) throw new Error(`${name} is not configured.`);
  return value;
}

/** Browser-safe client. It never receives the Supabase secret key. */
export function createBrowserSupabaseClient() {
  browserClient ??= createClient(
    requiredBrowserEnvironment("VITE_SUPABASE_URL"),
    requiredBrowserEnvironment("VITE_SUPABASE_PUBLISHABLE_KEY"),
    {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
    },
  );
  return browserClient;
}
