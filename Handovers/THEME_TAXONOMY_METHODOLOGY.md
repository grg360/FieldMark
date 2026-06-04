# Canonical Theme Taxonomy — Methodology

**Status:** active build, Jun 4, 2026
**Scope:** NSCLC themes only for first pass; extends to other indications/TAs subsequently.
**Sister document:** `FILTER_SYSTEM_SPEC.md` (Tier 2 themes filter depends on this work).

---

## Problem

`hcp_research_themes_v2` contains 9,482 distinct theme strings for NSCLC alone. Themes are LLM-extracted per-HCP from their publication footprint, so similar concepts get expressed many ways:

- EGFR TKI resistance mechanisms
- EGFR-mutant resistance mechanisms
- Osimertinib resistance mechanisms
- Osimertinib acquired resistance mechanisms
- EGFR exon 20 insertion mutations
- EGFR exon 20 insertion targeted therapy

A themes filter in the feed drawer can't show 9,482 options. Even substring-match typeahead is noisy ("egfr" returns 80+ near-duplicates).

## Decision

Build a canonical taxonomy: ~20-25 buckets per TA, each containing the raw themes that semantically belong together. Raw themes map to exactly one canonical bucket (exclusive assignment). User filters by canonical bucket; the system expands to all raw-theme members behind the scenes.

## Bucket count rationale

20-25 buckets is the discoverability-vs-granularity sweet spot:
- A user can scan the list in ~5 seconds
- Each bucket covers a meaningful slice of NSCLC research (EGFR program, KRAS program, immunotherapy, ADCs, resistance research, real-world evidence, etc.)
- Granular enough to differentiate "EGFR researcher" from "KRAS researcher" from "immunotherapy researcher"
- Average ~400 raw themes per bucket — large, but raw themes stay queryable for future sub-filtering

Going broader (5-8 buckets) loses MSL targeting power. Going narrower (50+ buckets) overwhelms the drawer UI.

## Process

Three-pass hybrid:

**Pass 1 — taxonomy generation:** Send Claude the top ~500 most common raw themes (by HCP count) for NSCLC. Ask it to propose 20-25 canonical buckets with descriptions. This becomes the locked taxonomy. Validate by hand before proceeding.

**Pass 2 — assignment:** Send remaining ~9,000 raw themes to Claude in batches. For each raw theme, ask it to assign to exactly one of the locked canonical buckets (or flag "no fit, propose new").

**Pass 3 — reconciliation:** Review flagged no-fit themes. Either expand taxonomy (rare) or assign to closest match (most). Final cleanup.

## Storage

Two new tables in Supabase:

```sql
-- canonical bucket definitions
CREATE TABLE theme_canonical_v1 (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  canonical_name text NOT NULL,
  description text,
  therapeutic_area text NOT NULL,
  display_order int,
  created_at timestamptz DEFAULT now()
);

-- mapping from raw themes to canonical buckets
CREATE TABLE theme_to_canonical_v1 (
  raw_theme_name text NOT NULL,
  therapeutic_area text NOT NULL,
  canonical_id uuid NOT NULL REFERENCES theme_canonical_v1(id),
  confidence text,  -- 'high' | 'medium' | 'low' | 'manual'
  assigned_at timestamptz DEFAULT now(),
  PRIMARY KEY (raw_theme_name, therapeutic_area)
);
```

The frontend reads from `theme_canonical_v1` to populate the filter drawer. When a user picks "EGFR resistance," the RPC joins `hcp_research_themes_v2 → theme_to_canonical_v1 → theme_canonical_v1` and returns HCPs whose raw themes belong to the chosen canonical bucket(s).

## Validation criteria

Before the taxonomy is locked from Pass 1:
- Bucket count: 20-25, no more no less
- Each bucket has a clear name and 1-2 sentence description
- No two buckets describe the same research area
- Top ~10 expected categories (EGFR, KRAS, immunotherapy combos, ADCs, surgical, radiation, perioperative, resistance mechanisms, biomarkers, real-world evidence) all appear as distinct buckets

After Pass 2:
- Spot-check 50 random raw themes — do their canonical assignments make sense?
- Top 30 most common raw themes are all assigned (no skipped)
- No more than 5% of themes flagged as "no fit"

## Cost & timing

Estimated API spend: $3-8 total. Pass 1 ~$1, Pass 2 ~$3-5 across batches, Pass 3 minimal.

Wall clock: 1.5-2.5 hours including validation. Claude API responses run sequentially; batching helps but rate limits constrain pace.

## What this enables

- Themes filter in the v2.0 filter drawer (Stage 2 work)
- Drug Constellation context ("this HCP's main canonical themes")
- Future: theme-based search ("find me KRAS researchers"), theme co-occurrence (Collaborative Orbit signal)
- TA portability: same pattern works for Hepatology, Immunology, Rare Disease

## Out of scope for this build

- Theme clusters that span TAs (KRAS appears in both NSCLC and colorectal — we treat them separately per TA for now)
- Hierarchy / nested buckets ("EGFR" parent → "exon 20" / "resistance" / "combinations" children) — flat list only
- Bucket weights or scoring — every bucket assignment is equal
- Bucketing for centrality (`peripheral` themes get bucketed same as `core`; filter logic can later choose to weight by centrality)
