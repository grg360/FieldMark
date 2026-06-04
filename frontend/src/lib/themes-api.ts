import { supabase } from "./supabase";

export interface CanonicalTheme {
  id: string;
  canonical_name: string;
  description: string;
  therapeutic_area: string;
  display_order: number;
}

export async function getCanonicalThemes(ta: string): Promise<CanonicalTheme[]> {
  const { data, error } = await supabase
    .from("theme_canonical_v1")
    .select("id, canonical_name, description, therapeutic_area, display_order")
    .eq("therapeutic_area", ta.toUpperCase())
    .order("display_order", { ascending: true });
  if (error) {
    console.error("Failed to load canonical themes:", error);
    return [];
  }
  return data ?? [];
}
