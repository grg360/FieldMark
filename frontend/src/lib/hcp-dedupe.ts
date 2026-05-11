/**
 * @example Same name + same institution (case-insensitive) → one row; higher `stored_pubs` wins.
 * ```ts
 * dedupeHCPs([
 *   { first_name: "Jane", last_name: "Doe", institution: "Mayo Clinic", stored_pubs: 3 },
 *   { first_name: "jane", last_name: "DOE ", institution: "mayo clinic", stored_pubs: 12 },
 * ]);
 * // → [{ first_name: "jane", last_name: "DOE ", institution: "mayo clinic", stored_pubs: 12 }]
 * ```
 *
 * @example Same name + different institutions → two rows (distinct identity keys).
 * ```ts
 * dedupeHCPs([
 *   { first_name: "Alex", last_name: "Rivera", institution: "Mayo Clinic" },
 *   { first_name: "Alex", last_name: "Rivera", institution: "Stanford" },
 * ]);
 * // → both records kept
 * ```
 *
 * @example Same name + both missing institution → merge to one row (shared “no institution” key).
 * ```ts
 * dedupeHCPs([
 *   { first_name: "Sam", last_name: "Lee", stored_pubs: 1 },
 *   { first_name: "Sam", last_name: "Lee", stored_pubs: 4 },
 * ]);
 * // → one canonical row (higher stored_pubs)
 * ```
 */

type HCPDedupeShape = {
  first_name: string;
  last_name: string;
  institution?: string;
  stored_pubs?: number;
  composite_score?: number;
};

function normName(value: string | undefined | null): string {
  return (value ?? "").trim().toLowerCase();
}

function normInstitution(value: string | undefined | null): string {
  const t = (value ?? "").trim().toLowerCase();
  return t === "" ? "" : t;
}

function hasUsableNames(first: string | undefined | null, last: string | undefined | null): boolean {
  return Boolean(String(first ?? "").trim() && String(last ?? "").trim());
}

function identityKey(first: string | undefined | null, last: string | undefined | null, institution: string | undefined | null): string {
  return `${normName(first)}|${normName(last)}|${normInstitution(institution)}`;
}

function countNonEmptyStringFields(record: Record<string, unknown>): number {
  let n = 0;
  for (const v of Object.values(record)) {
    if (typeof v === "string" && v.trim().length > 0) {
      n += 1;
    }
  }
  return n;
}

function pickCanonical<T extends HCPDedupeShape>(members: { item: T; index: number }[]): T {
  if (members.length === 1) {
    return members[0].item;
  }

  let best = members[0];
  for (let i = 1; i < members.length; i += 1) {
    const cur = members[i];
    const aPub = cur.item.stored_pubs ?? 0;
    const bPub = best.item.stored_pubs ?? 0;
    if (aPub !== bPub) {
      if (aPub > bPub) best = cur;
      continue;
    }
    const aScore = cur.item.composite_score ?? 0;
    const bScore = best.item.composite_score ?? 0;
    if (aScore !== bScore) {
      if (aScore > bScore) best = cur;
      continue;
    }
    const aCount = countNonEmptyStringFields(cur.item as Record<string, unknown>);
    const bCount = countNonEmptyStringFields(best.item as Record<string, unknown>);
    if (aCount !== bCount) {
      if (aCount > bCount) best = cur;
      continue;
    }
    if (cur.index < best.index) {
      best = cur;
    }
  }
  return best.item;
}

/**
 * Deduplicates HCP-like rows at the display layer using a normalized name+institution identity key.
 *
 * Use when API results may contain duplicate personas (e.g. historical ingestion); this does not
 * replace database fixes but avoids showing obvious duplicates in the UI.
 *
 * Records with empty `first_name` or `last_name` are never merged and pass through unchanged.
 * Output order follows the input order of **first occurrence** per identity group; each group emits
 * its **canonical** row (best pubs → score → string field count → earliest index).
 */
export function dedupeHCPs<
  T extends {
    first_name: string;
    last_name: string;
    institution?: string;
    stored_pubs?: number;
    composite_score?: number;
  },
>(hcps: T[]): T[] {
  if (hcps.length <= 1) {
    return hcps;
  }

  const invalidAt: boolean[] = hcps.map((r) => !hasUsableNames(r.first_name, r.last_name));

  type Group = { members: { item: T; index: number }[]; minIndex: number };
  const groups = new Map<string, Group>();

  for (let i = 0; i < hcps.length; i += 1) {
    if (invalidAt[i]) continue;
    const row = hcps[i];
    const key = identityKey(row.first_name, row.last_name, row.institution);
    const existing = groups.get(key);
    const member = { item: row, index: i };
    if (!existing) {
      groups.set(key, { members: [member], minIndex: i });
    } else {
      existing.members.push(member);
      if (i < existing.minIndex) {
        existing.minIndex = i;
      }
    }
  }

  const canonicalByKey = new Map<string, T>();
  for (const [key, g] of groups) {
    canonicalByKey.set(key, pickCanonical(g.members));
  }

  const out: T[] = [];
  for (let i = 0; i < hcps.length; i += 1) {
    if (invalidAt[i]) {
      out.push(hcps[i]);
      continue;
    }
    const row = hcps[i];
    const key = identityKey(row.first_name, row.last_name, row.institution);
    const g = groups.get(key);
    if (!g || g.minIndex !== i) continue;
    out.push(canonicalByKey.get(key) ?? hcps[i]);
  }

  return out;
}
