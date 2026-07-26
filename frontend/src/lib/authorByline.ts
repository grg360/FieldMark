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

interface OrderedAuthor {
  position: number | null;
  name: string;
}

/** Ordered {position, name} entries: people as "Last Initials", groups as collective_name. */
function orderedAuthors(pubmedAuthorships: unknown): OrderedAuthor[] {
  if (!Array.isArray(pubmedAuthorships)) return [];
  const entries = (pubmedAuthorships as AuthorshipEntry[])
    .filter((e) => e && typeof e === "object")
    .slice()
    .sort((a, b) => (a.position ?? Number.MAX_SAFE_INTEGER) - (b.position ?? Number.MAX_SAFE_INTEGER));

  const authors: OrderedAuthor[] = [];
  for (const entry of entries) {
    const last = (entry.last_name ?? "").trim();
    const initials = (entry.initials ?? "").trim();
    const collective = (entry.collective_name ?? "").trim();
    if (last) {
      authors.push({ position: entry.position ?? null, name: initials ? `${last} ${initials}` : last });
    } else if (collective) {
      authors.push({ position: entry.position ?? null, name: collective });
    }
  }
  return authors;
}

/** Ordered display names: "Last Initials" for people, collective_name for groups. */
export function authorDisplayNames(pubmedAuthorships: unknown): string[] {
  return orderedAuthors(pubmedAuthorships).map((a) => a.name);
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

/**
 * Bibliography byline: a ~2-line, subject-anchored line that ALWAYS includes the
 * subject HCP regardless of position (plain truncation would re-drop mid-list
 * authors — the bug we just fixed). Shape: first 3 … subject … + N more. If the
 * subject falls within the first 3, no ellipsis is needed. subjectPosition is the
 * subject's 1-indexed author position; when it can't be located, falls back to a
 * plain "first 3 + N more" truncation.
 */
export function formatBibliographyByline(
  pubmedAuthorships: unknown,
  subjectPosition: number | null,
): string {
  const authors = orderedAuthors(pubmedAuthorships);
  const total = authors.length;
  if (total === 0) return "";
  const names = authors.map((a) => a.name);
  const HEAD = 3;
  if (total <= HEAD) return names.join(", ");

  const subjectIdx =
    subjectPosition != null ? authors.findIndex((a) => a.position === subjectPosition) : -1;

  // Subject within the first 3 (or not locatable): plain truncation.
  if (subjectIdx < HEAD) {
    return `${names.slice(0, HEAD).join(", ")}, + ${total - HEAD} more`;
  }

  const head = names.slice(0, HEAD).join(", ");
  const between = subjectIdx - HEAD; // hidden authors between the head and the subject
  const trailing = total - 1 - subjectIdx; // hidden authors after the subject
  const lead = between > 0 ? " … " : ", ";
  const tail = trailing > 0 ? ` … + ${trailing} more` : "";
  return `${head}${lead}${names[subjectIdx]}${tail}`;
}
