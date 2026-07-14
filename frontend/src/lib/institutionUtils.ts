import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Convert an institution_canonical string into a URL slug.
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

/**
 * Reverse lookup: given a slug, find the matching institution name.
 * Used when resolving /institution/{slug} routes. Scans institution_canonical
 * first (NSCLC path, unchanged); if no match, falls back to institution_normalized
 * so AD-only institutions — whose members carry only institution_normalized — are
 * still resolvable (Piece 3).
 */
async function findInstitutionBySlug(
  slug: string,
  supabase: SupabaseClient,
  column: "institution_canonical" | "institution_normalized",
): Promise<string | null> {
  const PAGE_SIZE = 1000;
  const seen = new Set<string>();
  let from = 0;

  while (true) {
    const { data, error } = await supabase
      .from("hcps_v2")
      .select(column)
      .not(column, "is", null)
      .range(from, from + PAGE_SIZE - 1);

    if (error || !data || data.length === 0) break;

    for (const row of data) {
      const inst = (row as Record<string, unknown>)[column] as string;
      if (!inst || seen.has(inst)) continue;
      seen.add(inst);
      if (institutionToSlug(inst) === slug) {
        return inst;
      }
    }

    if (data.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }

  return null;
}

export async function slugToInstitution(
  slug: string,
  supabase: SupabaseClient,
): Promise<string | null> {
  const canonical = await findInstitutionBySlug(slug, supabase, "institution_canonical");
  if (canonical) return canonical;
  return findInstitutionBySlug(slug, supabase, "institution_normalized");
}
