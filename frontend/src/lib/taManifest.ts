import { supabase } from "./supabase";

/**
 * THE TA CAPABILITY MANIFEST — the single authority for what each therapeutic area has.
 *
 * One database read (ta_capability_manifest(), migrations/2026_09_21), fetched ONCE at
 * TAProvider mount and held for the life of the session. It replaces four independent
 * hand-maintained answers to the same question:
 *
 *   cohortLedger.ts   boardTaSlugs       which TAs have a Community board   (deleted)
 *   cohortLedger.ts   COM_TIER_MODELS    which tiers each TA's model emits  (re-keyed)
 *   PeopleNavStrip    domainLive         which domains are switchable       (deleted)
 *   IndicationFilter  INDICATIONS_BY_TA  live/planned + two TAs' taId       (deleted)
 *
 * Each was a copy of something the database already knew, each drifted independently, and
 * adding a TA to one and not the others was a defect that needed a warning comment three
 * separate times.
 *
 * AVAILABILITY IS "HAS ANY ROWS", NOT "HAS US ROWS". The RPC applies no scope predicate.
 * board_meta's RS arm counts only US rows (nsclc Rising is 149 globally and 40 in the US),
 * so a manifest keyed on that would call a TA unavailable while a healthy global board
 * stood behind it. Availability and board SIZE are different questions and only the first
 * one is asked here.
 *
 * AVAILABILITY IS ALSO "ADMITTED". Every flag is ANDed server-side with the TA's
 * therapeutic_area_ingestion_config being is_visible_in_ui AND is_active, so a TA
 * mid-build does not become offerable the moment its first scored row lands.
 *
 * TWO READ PATHS, ONE FETCH. React consumers read `manifest` off TAContext and re-render
 * when it arrives. The pure helpers in cohortLedger.ts (comTierFilters, cohortServesTa,
 * …) are not hooks and cannot; they read the module-level cache below, which the provider
 * fills. That is safe because every one of them is reached from a surface that already
 * required the manifest to decide to mount — the ledger does not mount COM without
 * com_available, and com_available comes from here.
 *
 * NO SURFACE CALLS SUPABASE FOR THIS. This file is the only caller.
 */

export type ComTierModel = "nsclc_v1" | "partb_practice_v1";

export interface TaCapability {
  slug: string;
  label: string;
  parentSlug: string | null;
  parentLabel: string | null;
  taId: string;
  est: boolean;
  rs: boolean;
  com: boolean;
  /** The Community tier model, or null when Community is unavailable for this TA. */
  comTierModel: ComTierModel | null;
  /** Reserved slot for per-surface capabilities. Server returns {} and nothing reads it. */
  surfaces: Record<string, unknown>;
}

export type CohortTag = "EST" | "RS" | "COM";

interface ManifestRow {
  slug: string | null;
  label: string | null;
  parent_slug: string | null;
  parent_label: string | null;
  ta_id: string | null;
  est_available: boolean | null;
  rs_available: boolean | null;
  com_available: boolean | null;
  com_tier_model: string | null;
  surfaces: Record<string, unknown> | null;
}

let cache: TaCapability[] | null = null;
let inflight: Promise<TaCapability[]> | null = null;

/** Cleared on error only; the TA registry does not change within a session. */
export function clearTaManifestCache(): void {
  cache = null;
  inflight = null;
}

export async function loadTaManifest(): Promise<TaCapability[]> {
  if (cache) return cache;
  if (!inflight) {
    inflight = (async () => {
      const { data, error } = await supabase.rpc("ta_capability_manifest");
      if (error) throw error;
      const rows = ((data as ManifestRow[] | null) ?? [])
        .filter((r) => r.slug && r.ta_id)
        .map<TaCapability>((r) => ({
          slug: String(r.slug),
          label: r.label ?? String(r.slug),
          parentSlug: r.parent_slug ?? null,
          parentLabel: r.parent_label ?? null,
          taId: String(r.ta_id),
          est: r.est_available === true,
          rs: r.rs_available === true,
          com: r.com_available === true,
          comTierModel: (r.com_tier_model as ComTierModel | null) ?? null,
          surfaces: r.surfaces ?? {},
        }));
      cache = rows;
      return rows;
    })();
    inflight.catch(() => {
      inflight = null;
    });
  }
  return inflight;
}

/**
 * The manifest if it has landed, else null. For the pure helpers that cannot await.
 *
 * NULL IS NOT "NOTHING IS AVAILABLE". A caller must treat null as "not yet known" and say
 * nothing, rather than render an absence — claiming a TA lacks a cohort because a fetch
 * has not returned is the same class of lie as claiming it has one.
 */
export function taManifestSync(): TaCapability[] | null {
  return cache;
}

export function capabilityFor(slug: string | null | undefined): TaCapability | null {
  if (!slug || !cache) return null;
  return cache.find((c) => c.slug === slug) ?? null;
}

export function cohortAvailable(tag: CohortTag, slug: string | null | undefined): boolean {
  const cap = capabilityFor(slug);
  if (!cap) return false;
  return tag === "EST" ? cap.est : tag === "RS" ? cap.rs : cap.com;
}

/** Every cohort this TA can answer for, in ledger display order. */
export function availableCohortTags(slug: string | null | undefined): CohortTag[] {
  const cap = capabilityFor(slug);
  if (!cap) return [];
  const out: CohortTag[] = [];
  if (cap.est) out.push("EST");
  if (cap.rs) out.push("RS");
  if (cap.com) out.push("COM");
  return out;
}

/** The TAs worth offering: a leaf TA with at least one cohort behind it. */
export function offerableTas(manifest: TaCapability[] | null): TaCapability[] {
  return (manifest ?? []).filter((c) => c.est || c.rs || c.com);
}

/** Offerable TAs grouped under their parent domain label, for the nav strip. */
export function offerableByDomain(
  manifest: TaCapability[] | null,
): { domainSlug: string; domainLabel: string; tas: TaCapability[] }[] {
  const out: { domainSlug: string; domainLabel: string; tas: TaCapability[] }[] = [];
  for (const cap of offerableTas(manifest)) {
    // A TA that parents nothing and has no parent is its own domain (hepatology's shape).
    const slug = cap.parentSlug ?? cap.slug;
    const label = cap.parentLabel ?? cap.label;
    let row = out.find((d) => d.domainSlug === slug);
    if (!row) {
      row = { domainSlug: slug, domainLabel: label, tas: [] };
      out.push(row);
    }
    row.tas.push(cap);
  }
  return out;
}

/** Is this domain switchable at all? Replaces domainLive's `d === "Oncology"`. */
export function domainIsLive(manifest: TaCapability[] | null, domainLabel: string): boolean {
  return offerableByDomain(manifest).some((d) => d.domainLabel === domainLabel);
}
