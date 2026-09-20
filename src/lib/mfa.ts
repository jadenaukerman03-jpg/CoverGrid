import { supabase } from "@/integrations/supabase/client";

/** Two-step sign-in helpers. Wraps the authenticator-app (TOTP) support in the backend. */

export type FactorSummary = {
  id: string;
  friendlyName: string | null;
  verified: boolean;
};

export async function listSecondStepFactors(): Promise<FactorSummary[]> {
  const { data, error } = await supabase.auth.mfa.listFactors();
  if (error) throw error;
  const all = [...(data.totp ?? []), ...(data.all ?? [])];
  const seen = new Set<string>();
  const out: FactorSummary[] = [];
  for (const f of all) {
    if (seen.has(f.id)) continue;
    seen.add(f.id);
    out.push({
      id: f.id,
      friendlyName: f.friendly_name ?? null,
      verified: f.status === "verified",
    });
  }
  return out;
}

/** currentLevel is "aal2" once the second step has been completed for this session. */
export async function secondStepState() {
  const { data, error } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  if (error) throw error;
  const factors = await listSecondStepFactors();
  const verified = factors.filter((f) => f.verified);
  return {
    currentLevel: data.currentLevel,
    nextLevel: data.nextLevel,
    enrolled: verified.length > 0,
    satisfied: data.currentLevel === "aal2",
    factors,
    verifiedFactorId: verified[0]?.id ?? null,
  };
}

/** Starts enrollment and returns the QR image plus the typed-in secret. */
export async function startEnrollment(friendlyName: string) {
  // Clear a half-finished enrollment so a retry never trips the duplicate-name error.
  const existing = await listSecondStepFactors();
  for (const f of existing.filter((x) => !x.verified)) {
    await supabase.auth.mfa.unenroll({ factorId: f.id });
  }
  const { data, error } = await supabase.auth.mfa.enroll({
    factorType: "totp",
    friendlyName: `${friendlyName}-${Date.now()}`,
  });
  if (error) throw error;
  return { factorId: data.id, qrCode: data.totp.qr_code, secret: data.totp.secret };
}

export async function submitCode(factorId: string, code: string) {
  const challenge = await supabase.auth.mfa.challenge({ factorId });
  if (challenge.error) throw challenge.error;
  const { error } = await supabase.auth.mfa.verify({
    factorId,
    challengeId: challenge.data.id,
    code: code.replace(/\s/g, ""),
  });
  if (error) throw error;
  return true;
}

export async function removeFactor(factorId: string) {
  const { error } = await supabase.auth.mfa.unenroll({ factorId });
  if (error) throw error;
}
