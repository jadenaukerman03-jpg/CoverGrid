import { createClient } from "@supabase/supabase-js";

function requiredServerEnvironment(
  name: "SUPABASE_URL" | "SUPABASE_PUBLISHABLE_KEY" | "SUPABASE_SECRET_KEY",
) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not configured on the server.`);
  return value;
}

/**
 * Server client scoped to a verified user's access token. Database RLS
 * policies remain active and are the authorization boundary for every query.
 */
export function createUserSupabaseClient(accessToken: string) {
  return createClient(
    requiredServerEnvironment("SUPABASE_URL"),
    requiredServerEnvironment("SUPABASE_PUBLISHABLE_KEY"),
    {
      auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
      global: { headers: { Authorization: `Bearer ${accessToken}` } },
    },
  );
}

/**
 * Reserved for trusted server-only provisioning/webhook work (e.g. inbound
 * Twilio replies). Never import this from browser code.
 */
export function createSupabaseAdminClient() {
  return createClient(
    requiredServerEnvironment("SUPABASE_URL"),
    requiredServerEnvironment("SUPABASE_SECRET_KEY"),
    { auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false } },
  );
}

export async function requireAuthenticatedUser(accessToken: string) {
  if (!accessToken) throw new Error("Sign in is required.");

  const client = createUserSupabaseClient(accessToken);
  const { data, error } = await client.auth.getUser(accessToken);
  if (error || !data.user) throw new Error("Your sign-in session is invalid or has expired.");
  return { client, user: data.user };
}
