import { supabase } from "./supabase";

export interface RedeemResult {
  ok: boolean;
  allowed_ta_slugs: string[];
  invite_code: string;
}

/**
 * Read-only validity pre-check for an invite code (calls the check_invite RPC).
 * Returns true only if the code exists, is active, and has uses remaining.
 * Safe to call pre-auth (anon). Never throws; a failure resolves to false.
 */
export async function checkInvite(code: string): Promise<boolean> {
  const { data, error } = await supabase.rpc("check_invite", { p_code: code });
  if (error) return false;
  return data === true;
}

/**
 * Redeem an invite (calls the server-authoritative redeem_invite RPC). Requires
 * an authenticated session. On success the server has created the caller's
 * msl_profiles row (with server-set allowed_ta_slugs + invited_by), logged the
 * referral, and minted the caller's own invite. Returns the raw error message on
 * failure so the caller can map it to UX (invalid/exhausted, paused, cap reached,
 * profile already exists, own-invite).
 */
export async function redeemInvite(
  code: string,
): Promise<{ data: RedeemResult | null; error: string | null }> {
  const { data, error } = await supabase.rpc("redeem_invite", { p_code: code });
  if (error) return { data: null, error: error.message };
  return { data: data as RedeemResult, error: null };
}
