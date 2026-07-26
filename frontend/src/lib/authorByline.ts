// Shared author-byline formatting for publication surfaces.
//
// Reads pubmed_authorships (the JSON array stored on publications_v2). Renders
// a citation-style byline in author-position order, INCLUDING the subject HCP
// (no self-exclusion) and INCLUDING collective/consortium authors (which carry
// their name in collective_name, with no last_name — a trial paper's most
// recognizable byline entry, e.g. "Beamion LUNG-1 Investigators").

interface AuthorshipEntry {
  position?: number | null;
  fore_name?: string | null;
  last_name?: string | null;
  initials?: string | null;
  collective_name?: string | null;
}

/** Ordered display names: "Last Initials" for people, collective_name for groups. */
export function authorDisplayNames(pubmedAuthorships: unknown): string[] {
  if (!Array.isArray(pubmedAuthorships)) return [];
  const entries = (pubmedAuthorships as AuthorshipEntry[])
    .filter((e) => e && typeof e === "object")
    .slice()
    .sort((a, b) => (a.position ?? Number.MAX_SAFE_INTEGER) - (b.position ?? Number.MAX_SAFE_INTEGER));

  const names: string[] = [];
  for (const entry of entries) {
    const last = (entry.last_name ?? "").trim();
    const initials = (entry.initials ?? "").trim();
    const collective = (entry.collective_name ?? "").trim();
    if (last) {
      names.push(initials ? `${last} ${initials}` : last);
    } else if (collective) {
      names.push(collective);
    }
  }
  return names;
}

/**
 * Citation-style byline. With a cap, shows the first `cap` names then
 * "+ N more"; without a cap, shows the complete byline. Empty string when
 * there are no renderable authors.
 */
export function formatByline(pubmedAuthorships: unknown, cap?: number): string {
  const names = authorDisplayNames(pubmedAuthorships);
  if (names.length === 0) return "";
  if (cap != null && names.length > cap) {
    return `${names.slice(0, cap).join(", ")}, + ${names.length - cap} more`;
  }
  return names.join(", ");
}
