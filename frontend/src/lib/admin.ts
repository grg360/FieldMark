import { supabase } from "./supabase";

/**
 * Client wrappers for the Stage 3a admin RPCs.
 *
 * Every call here goes through a SECURITY DEFINER RPC whose first statement is an
 * is_admin() check. None of this data is reachable via .from(): app_config and
 * invite_redemptions are client-locked, invites is SELECT-own, msl_profiles is
 * own-row RLS, and email lives in auth.users. So there is no non-RPC path and no
 * .from() call belongs in the admin page.
 *
 * The is_admin() mount-gate on the page is VISIBILITY only. These RPCs are the
 * actual fence — a non-admin calling any of them gets 'not authorized' from the
 * server (verified over the real authenticated path, Stage 3a).
 */

export interface AppConfig {
  signups_enabled: boolean;
  global_signup_cap: number | null;
  updated_at: string;
}

export interface InviteRow {
  code: string;
  inviter_id: string | null;
  inviter_name: string | null;
  uses_remaining: number;
  is_active: boolean;
  note: string | null;
  created_at: string;
  redemption_count: number;
}

export interface ReferralEdge {
  redeemed_by: string;
  inviter_id: string | null;
  inviter_name: string | null;
  inviter_company: string | null;
  invitee_name: string | null;
  invitee_company: string | null;
  job_function: string | null;
  invite_code: string | null;
  redeemed_at: string;
}

export interface AdminUserRow {
  user_id: string;
  email: string | null;
  first_name: string | null;
  last_name: string | null;
  company: string | null;
  job_function: string | null;
  allowed_ta_slugs: string[] | null;
  invited_by: string | null;
  invited_by_name: string | null;
  is_admin: boolean;
  deactivated_at: string | null;
  created_at: string | null;
}

export type AdminResult<T> = { data: T | null; error: string | null };

/**
 * True only if the server says the caller is an admin. Never throws; any failure
 * resolves to false (fail-closed — an error must not be mistaken for admin).
 */
export async function isAdmin(): Promise<boolean> {
  const { data, error } = await supabase.rpc("is_admin");
  if (error) return false;
  return data === true;
}

/**
 * 'not authorized' is what every admin RPC raises for a non-admin. Surfaced as-is
 * so the page can render it plainly rather than as an opaque failure.
 */
function toResult<T>(data: unknown, error: { message: string } | null): AdminResult<T> {
  if (error) return { data: null, error: error.message };
  return { data: data as T, error: null };
}

/** Read the kill-switch state. Read-only: never moves the switch. */
export async function getAppConfig(): Promise<AdminResult<AppConfig>> {
  const { data, error } = await supabase.rpc("get_app_config");
  return toResult<AppConfig>(data, error);
}

/** Flip the signup kill-switch. Returns the resulting server config. */
export async function toggleSignups(enabled: boolean): Promise<AdminResult<AppConfig>> {
  const { data, error } = await supabase.rpc("toggle_signups", { p_enabled: enabled });
  return toResult<AppConfig>(data, error);
}

/** Set the global signup cap. null means uncapped. Returns the resulting config. */
export async function setSignupCap(cap: number | null): Promise<AdminResult<AppConfig>> {
  const { data, error } = await supabase.rpc("set_signup_cap", { p_cap: cap });
  return toResult<AppConfig>(data, error);
}

/**
 * Mint an invite in the calling admin's own name. There is deliberately no
 * inviter argument — the server attributes it to auth.uid(). Returns the code.
 */
export async function mintInvite(
  quota: number,
  note: string | null,
): Promise<AdminResult<string>> {
  const { data, error } = await supabase.rpc("mint_invite", {
    p_quota: quota,
    p_note: note,
  });
  return toResult<string>(data, error);
}

/** All invites (not just own) with redemption counts. */
export async function listInvites(): Promise<AdminResult<InviteRow[]>> {
  const { data, error } = await supabase.rpc("list_invites");
  return toResult<InviteRow[]>(data ?? [], error);
}

/** Referral edges: inviter -> invitee, with company/job_function. */
export async function referralGraph(): Promise<AdminResult<ReferralEdge[]>> {
  const { data, error } = await supabase.rpc("referral_graph");
  return toResult<ReferralEdge[]>(data ?? [], error);
}

/** All profiles, with email resolved from auth.users. */
export async function listUsers(): Promise<AdminResult<AdminUserRow[]>> {
  const { data, error } = await supabase.rpc("list_users");
  return toResult<AdminUserRow[]>(data ?? [], error);
}

/**
 * Deactivate (active=false) or reactivate (active=true) a user. Reversible.
 * The server rejects an admin deactivating their own account. Returns the row's
 * resulting { user_id, deactivated_at } so the caller renders server truth.
 */
export async function setUserActive(
  userId: string,
  active: boolean,
): Promise<AdminResult<{ user_id: string; deactivated_at: string | null }>> {
  const { data, error } = await supabase.rpc("set_user_active", {
    p_user: userId,
    p_active: active,
  });
  return toResult<{ user_id: string; deactivated_at: string | null }>(data, error);
}

/**
 * Revoke (active=false) or reactivate (active=true) an invite. Reversible. A
 * revoked invite stops redeeming immediately (redeem_invite filters is_active).
 */
export async function setInviteActive(
  code: string,
  active: boolean,
): Promise<AdminResult<{ code: string; is_active: boolean }>> {
  const { data, error } = await supabase.rpc("set_invite_active", {
    p_code: code,
    p_active: active,
  });
  return toResult<{ code: string; is_active: boolean }>(data, error);
}
