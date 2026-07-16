import { supabase } from "./supabase";
import { resetIdentification } from "./analytics";

export interface MslProfile {
  user_id: string;
  first_name: string | null;
  last_name: string | null;
  company: string | null;
  role: string | null;
  region: string | null;
  states_covered: string[] | null;
  default_ta_slug: string | null;
  default_indication_slug: string | null;
  // Per-user TA entitlement (PARENT slugs, e.g. ["oncology","immunology"]).
  // Auto-fetched by getMslProfile's select("*"). Resolve visibility through
  // entitledTASlugs() in api.ts (fail-open when empty/null). Mirrors the
  // states_covered text[] pattern.
  allowed_ta_slugs: string[] | null;
  onboarded_at: string | null;
  last_active_at: string | null;
  notify_new_rising_stars?: boolean;
  notify_score_changes?: boolean;
  notify_field_notes?: boolean;
  linkedin_verified_at?: string | null;
}

let mslProfileCache: { userId: string; promise: Promise<MslProfile | null> } | null = null;

export async function getCurrentUser() {
  const { data: { user } } = await supabase.auth.getUser();
  return user;
}

export async function getMslProfile(userId: string): Promise<MslProfile | null> {
  if (mslProfileCache && mslProfileCache.userId === userId) {
    return mslProfileCache.promise;
  }

  const promise = (async () => {
    const { data } = await supabase
      .from("msl_profiles")
      .select("*")
      .eq("user_id", userId)
      .maybeSingle();
    return data as MslProfile | null;
  })();

  mslProfileCache = { userId, promise };

  promise.catch(() => {
    if (mslProfileCache?.userId === userId) {
      mslProfileCache = null;
    }
  });

  return promise;
}

export function clearMslProfileCache() {
  mslProfileCache = null;
}

export async function updateLastActive(userId: string) {
  await supabase
    .from("msl_profiles")
    .update({ last_active_at: new Date().toISOString() })
    .eq("user_id", userId);
}

export async function signOut() {
  resetIdentification();
  await supabase.auth.signOut();
  mslProfileCache = null;
  window.location.href = "/landing";
}
