import { supabase } from "./supabase";

export interface PinnedInstitution {
  id: string;
  institution_name: string;
  pinned_at: string;
}

export async function getPinnedInstitutionsForUser(userId: string): Promise<PinnedInstitution[]> {
  try {
    const { data, error } = await supabase
      .from("msl_pinned_institutions")
      .select("id, institution_name, pinned_at")
      .eq("user_id", userId)
      .order("pinned_at", { ascending: false });
    if (error) {
      console.warn("getPinnedInstitutionsForUser: error", error);
      return [];
    }
    return (data ?? []) as PinnedInstitution[];
  } catch (err) {
    console.warn("getPinnedInstitutionsForUser: error", err);
    return [];
  }
}

export async function pinInstitution(userId: string, institutionName: string): Promise<void> {
  try {
    const { error } = await supabase
      .from("msl_pinned_institutions")
      .insert({ user_id: userId, institution_name: institutionName });
    if (error && error.code !== "23505") {
      // 23505 = unique violation = already pinned = silent success
      console.warn("pinInstitution: error", error);
      throw error;
    }
  } catch (err) {
    // re-throw if not a unique violation
    const code = (err as { code?: string })?.code;
    if (code !== "23505") {
      console.warn("pinInstitution: error", err);
      throw err;
    }
  }
}

export async function unpinInstitution(userId: string, institutionName: string): Promise<void> {
  try {
    const { error } = await supabase
      .from("msl_pinned_institutions")
      .delete()
      .eq("user_id", userId)
      .eq("institution_name", institutionName);
    if (error) {
      console.warn("unpinInstitution: error", error);
      throw error;
    }
  } catch (err) {
    console.warn("unpinInstitution: error", err);
    throw err;
  }
}

export async function isInstitutionPinned(userId: string, institutionName: string): Promise<boolean> {
  try {
    const { data, error } = await supabase
      .from("msl_pinned_institutions")
      .select("id")
      .eq("user_id", userId)
      .eq("institution_name", institutionName)
      .maybeSingle();
    if (error) {
      console.warn("isInstitutionPinned: error", error);
      return false;
    }
    return data !== null;
  } catch (err) {
    console.warn("isInstitutionPinned: error", err);
    return false;
  }
}
