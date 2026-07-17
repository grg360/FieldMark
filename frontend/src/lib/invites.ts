import { supabase } from "./supabase";

export interface RedeemResult {
  ok: boolean;
  allowed_ta_slugs: string[];
  invite_code: string;
}

export interface MyInvite {
  code: string;
  uses_remaining: number;
  is_active: boolean;
  note: string | null;
  created_at: string;
}

/**
 * sessionStorage key that carries the invite code minted for a brand-new user
 * (returned by redeem_invite() at signup, which SignupScreen would otherwise
 * discard). Its PRESENCE is the one-time "just signed up" signal the /me welcome
 * share banner keys off; it is cleared once that banner is dismissed.
 */
export const FRESH_INVITE_KEY = "fieldmark_fresh_invite_code";

/** The full shareable link a user pastes into Slack/text/email. */
export function inviteUrl(code: string): string {
  return `${window.location.origin}/join/${code}`;
}

/**
 * The caller's OWN invite rows. Relies on the Stage 1 `invites_select_own` RLS
 * policy (inviter_id = auth.uid()) plus the SELECT grant added by
 * 2026_07_17_invite_link_sharing_grant_select_own.sql — so a plain SELECT
 * returns only the caller's own invite(s), no RPC needed. Never throws; a
 * failure (e.g. the grant not yet applied → 42501) resolves to []. Newest first.
 */
export async function getMyInvites(): Promise<MyInvite[]> {
  const { data, error } = await supabase
    .from("invites")
    .select("code, uses_remaining, is_active, note, created_at")
    .order("created_at", { ascending: false });
  if (error) {
    console.warn("getMyInvites: select error", error);
    return [];
  }
  return (data ?? []) as MyInvite[];
}

/** The user's primary shareable invite: newest still-active one, else newest. */
export function primaryInvite(invites: MyInvite[]): MyInvite | null {
  if (invites.length === 0) return null;
  return invites.find((i) => i.is_active && i.uses_remaining > 0) ?? invites[0];
}

/**
 * Email the caller's OWN invite to a colleague via the send-invite-email Edge
 * Function. The client supplies only the recipient (+ optional note) — the server
 * picks the caller's code (never trust the client for whose invite). Never throws;
 * returns the server's error message on failure so the UI can show it.
 */
export async function sendInviteEmail(
  recipientEmail: string,
  note?: string | null,
): Promise<{ ok: boolean; error: string | null }> {
  const { data, error } = await supabase.functions.invoke("send-invite-email", {
    body: { recipientEmail, note: note?.trim() || undefined },
  });
  if (error) {
    // Edge errors (4xx/5xx) surface the JSON { error } body via context when available.
    let message = error.message;
    try {
      const parsed = await (error as { context?: Response }).context?.json?.();
      if (parsed?.error) message = parsed.error as string;
    } catch {
      // keep the generic message
    }
    return { ok: false, error: message };
  }
  if (data && (data as { ok?: boolean }).ok) return { ok: true, error: null };
  return { ok: false, error: (data as { error?: string })?.error ?? "Send failed" };
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
