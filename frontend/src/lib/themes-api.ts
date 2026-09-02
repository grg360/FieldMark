import { supabase } from "./supabase";
import { themesTagForApiSlug } from "./api";

export interface CanonicalTheme {
  id: string;
  canonical_name: string;
  description: string;
  therapeutic_area: string;
  display_order: number;
}

/**
 * FIFTH READ SITE, same class as the four in the profile/institution fix (2026-09-02).
 *
 * theme_canonical_v1 is keyed by the same tag as hcp_research_themes_v2 — bucket_themes.py
 * carries it across. This read computed `ta.toUpperCase()`, which is right for NSCLC and
 * COLORECTAL-CANCER and wrong for atopic-dermatitis, whose tag is 'Atopic Dermatitis'.
 *
 * Behaviour-neutral TODAY: theme_canonical_v1 holds only NSCLC and COLORECTAL-CANCER, and AD
 * has zero canonical rows (the known bucketing defect), so both derivations return the same
 * thing. It stops being neutral the moment bucket_themes.py reads themes_tag and AD is
 * bucketed — which is exactly when a computed key here would start returning nothing.
 *
 * The slug-to-tag resolution is the app-wide memoised registry, not a lookup of its own.
 */
export async function getCanonicalThemes(taSlug: string): Promise<CanonicalTheme[]> {
  const themesTag = await themesTagForApiSlug(taSlug);
  if (!themesTag) return [];
  const { data, error } = await supabase
    .from("theme_canonical_v1")
    .select("id, canonical_name, description, therapeutic_area, display_order")
    .eq("therapeutic_area", themesTag)
    .order("display_order", { ascending: true });
  if (error) {
    console.error("Failed to load canonical themes:", error);
    return [];
  }
  return data ?? [];
}
