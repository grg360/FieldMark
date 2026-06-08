import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Convert an institution_normalized string into a URL slug.
 * Lowercased, special chars stripped, spaces replaced with hyphens.
 * Deterministic -- same input always produces same slug.
 */
export function institutionToSlug(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .substring(0, 100);
}

type InstitutionRow = {
  institution_normalized: string | null;
};

/**
 * Reverse lookup: given a slug, find the matching institution_normalized.
 * Used when resolving /institution/{slug} routes.
 */
export async function slugToInstitution(
  slug: string,
  supabase: SupabaseClient,
): Promise<string | null> {
  const { data } = await supabase
    .from("hcps_v2")
    .select("institution_normalized")
    .not("institution_normalized", "is", null);
  if (!data) return null;

  const uniqueInstitutions = Array.from(
    new Set(
      (data as InstitutionRow[])
        .map((r) => r.institution_normalized)
        .filter((v): v is string => Boolean(v)),
    ),
  );

  for (const inst of uniqueInstitutions) {
    if (institutionToSlug(inst) === slug) {
      return inst;
    }
  }
  return null;
}
