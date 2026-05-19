# FieldMark Data Ingestion Architecture v2.0

**Status**: Design draft, pending review
**Author**: Claude + Garrett, May 13, 2026
**Replaces**: Current ad-hoc ingestion (pubmed_pipeline.py, nppes_workstream_b_ingest.py, publication_backfill_phase1/2/3.py, career_enrichment.py, openalex_pipeline.py)

---

## Why we're rebuilding

The current architecture has structural problems that surfaced over multiple methodology iterations:

1. **`pubmed_pipeline.py` creates HCP rows from PubMed authorship data using `(first_name, last_name, institution)` as the dedup key.** PubMed's free-text affiliations vary across every paper. Empirically: "Jing Wang" produced 31 HCP rows with 24 distinct institutions; "Li Zhang" produced 22 rows with 22 distinct institutions. The dedup key is fundamentally insufficient.

2. **TA-specific configuration is hardcoded in Python.** Adding a new therapeutic area requires editing multiple files. The current pubmed_pipeline.py only queries Hepatology and NSCLC — Rare Disease is never queried via this script despite being a launch TA. Schizophrenia, Diabetes, or any future TA addition requires a multi-file code change.

3. **No clean identity primitive for HCPs.** NPPES provides NPI for US clinicians. PubMed doesn't provide stable author IDs. OpenAlex provides author IDs but the resolution happens AFTER HCP creation, allowing duplicates to be created first and inconsistently cleaned up later.

4. **Coverage is uneven across TAs.** Hepatology has 17% trajectory data coverage; NSCLC has 1.6%; Rare Disease has 0.9%. This isn't a methodology problem — it's an ingestion gap. NSCLC and Rare Disease researchers were never ingested at scale because the pipeline didn't extend to them.

The fix is structural, not surgical. This document describes the replacement architecture.

---

## Data sources and their roles

The architecture uses four external data sources, each with a defined role. None get dropped in the rebuild — what changes is how they relate to each other.

| Source | Role | Why we use it |
|---|---|---|
| **PubMed** | Publication discovery by topic | Best biomedical literature search via E-utilities; authoritative for clinically-indexed papers |
| **OpenAlex** | HCP identity + citation enrichment + authorship | Stable author IDs that resolve common-name ambiguity; year-by-year citation data for trajectory analysis |
| **NPPES** | US clinician identity | Government-issued NPI registry; authoritative for US clinicians |
| **ClinicalTrials.gov** | Trial activity + investigator discovery | Authoritative for clinical trials and their named investigators |

The critical change from the current architecture: **PubMed is demoted from "identity source for HCPs" to "publication discovery only."** PubMed tells us WHICH papers exist; OpenAlex tells us WHO authored them with stable IDs. PubMed authorship strings (with their varying affiliations) never create HCP rows in the new pipeline.

ClinicalTrials.gov and NPPES continue to operate independently of the PubMed/OpenAlex pipeline. Trial data and NPPES clinician data are not affected by the HCP rebuild.

---

## Design principles

**1. OpenAlex author ID is the primary identity primitive for researchers.** Not names. Not affiliation strings. OpenAlex resolves ambiguous names using co-authorship networks, ORCID linkages, institutional patterns, and publication metadata. Two different "Jing Wang" researchers get two different OpenAlex IDs.

**2. NPI is the primary identity primitive for US clinicians.** From the NPPES NPI registry. Unique by definition.

**3. HCPs come from two populations**, identified by different keys:
   - **Clinicians**: discovered via NPPES taxonomy matching. Primary key: NPI.
   - **Researchers**: discovered via OpenAlex author search. Primary key: OpenAlex author ID.
   - Some HCPs are both. Reconciliation links them as a separate step, not an inline operation.

**4. PubMed ingestion populates publications only, never HCPs.** PubMed's value is paper metadata, not author identity. Author identity comes from OpenAlex's authorship arrays on the same papers.

**5. Therapeutic areas are data, not code.** A `therapeutic_area_ingestion_config` table holds all per-TA configuration (queries, taxonomies, concepts, weights). Adding a TA is one row insert plus running the pipeline.

**6. Every ingestion script is idempotent and TA-aware.** Scripts read active TAs from configuration and process them uniformly. Re-running a script doesn't create duplicates.

**7. Two-level taxonomy: broad TAs contain specific indications.** Hepatology (broad TA) contains PBC, MASH, PSC, HCC, viral hepatitis, etc. (indications). Oncology (broad TA) contains NSCLC, breast cancer, multiple myeloma, etc. (indications). Ingestion happens at the broad-TA level for efficiency; tagging and scoring happen at the indication level for product accuracy. HCPs can be tagged at both levels: an HCP in "Oncology" with specific tagging to "NSCLC."

---

## Therapeutic area taxonomy: broad TAs and indications

This is a structural addition to the architecture that addresses a real product distinction.

### The problem with flat TAs

The current `therapeutic_areas` table has Hepatology and NSCLC at the same level. But these aren't comparable concepts:
- **Hepatology** is a broad medical specialty encompassing many liver diseases
- **NSCLC** is a specific indication within Oncology (or Lung Cancer)

A hepatologist working exclusively on PBC and a hepatologist working exclusively on viral hepatitis are both "Hepatology HCPs" in our current schema. They address completely different MSL needs.

### The two-level structure

The new schema introduces parent-child relationships in `therapeutic_areas`:

```sql
ALTER TABLE therapeutic_areas
  ADD COLUMN parent_ta_id UUID REFERENCES therapeutic_areas(id),
  ADD COLUMN ta_level TEXT NOT NULL CHECK (ta_level IN ('broad_ta', 'indication'));

-- Broad TAs have parent_ta_id = NULL and ta_level = 'broad_ta'
-- Indications have parent_ta_id pointing to broad TA and ta_level = 'indication'
```

Example structure:

| TA | parent_ta_id | ta_level |
|---|---|---|
| Hepatology | NULL | broad_ta |
| PBC | (Hepatology UUID) | indication |
| MASH | (Hepatology UUID) | indication |
| PSC | (Hepatology UUID) | indication |
| HCC | (Hepatology UUID) | indication |
| Viral Hepatitis | (Hepatology UUID) | indication |
| Oncology | NULL | broad_ta |
| NSCLC | (Oncology UUID) | indication |
| Breast Cancer | (Oncology UUID) | indication |
| Multiple Myeloma | (Oncology UUID) | indication |
| Rare Disease | NULL | broad_ta |
| Sickle Cell | (Rare Disease UUID) | indication |
| Cystic Fibrosis | (Rare Disease UUID) | indication |
| Spinal Muscular Atrophy | (Rare Disease UUID) | indication |

### How ingestion uses this

**Ingestion happens at the broad-TA level.** A broad PubMed query for Hepatology pulls all liver-disease papers; a broad query for Oncology pulls all oncology papers. This is efficient — one ingestion run captures the full literature for the broad area.

**Indication tagging happens via filtering of already-ingested data.** Once we have all Hepatology papers, we tag each paper with specific indications based on:
- OpenAlex concept IDs at the indication level (e.g., MASH has different OpenAlex concepts than PBC)
- Keyword presence in title/abstract
- Author co-publication patterns (researchers who consistently publish in one indication area)

HCPs get tagged with both the broad TA AND the indications their work touches. A researcher publishing on PBC and PSC gets tagged: Hepatology (broad), PBC (indication), PSC (indication).

**Scoring runs per-indication.** Rising Stars in MASH is a different cohort than Rising Stars in PBC, even though both researchers are tagged Hepatology. The UI shows broad-TA navigation with indication drill-down.

### Schema update for ingestion config

The `therapeutic_area_ingestion_config` table now operates at two levels:

```sql
CREATE TABLE therapeutic_area_ingestion_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  therapeutic_area_id UUID NOT NULL REFERENCES therapeutic_areas(id),
  
  -- Only required for broad_ta level (indication level inherits from parent)
  pubmed_query TEXT,
  pubmed_max_results INT DEFAULT 30000,  -- larger than before, see coverage notes
  pubmed_days_back INT DEFAULT 1460,
  nppes_taxonomy_codes TEXT[] DEFAULT '{}',
  
  -- OpenAlex concepts may be defined at either level
  -- Broad TA: high-level concepts; Indication: more specific concepts
  openalex_concept_ids TEXT[] NOT NULL DEFAULT '{}',
  openalex_min_works_count INT NOT NULL DEFAULT 5,
  openalex_max_authors_to_fetch INT NOT NULL DEFAULT 15000,
  
  -- ClinicalTrials.gov filters can be at either level
  ctgov_condition_filters TEXT[] NOT NULL DEFAULT '{}',
  
  -- Per-TA/indication scoring overrides
  scoring_weights JSONB NOT NULL DEFAULT '{}',
  
  -- Indication-specific keyword filters (for tagging papers already pulled at broad-TA level)
  indication_keyword_filters TEXT[] DEFAULT '{}',
  
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  is_visible_in_ui BOOLEAN NOT NULL DEFAULT TRUE,  -- for "coming soon" indications
  
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  UNIQUE(therapeutic_area_id)
);
```

The `is_visible_in_ui` flag supports your product vision: ingest Oncology broadly (so Breast Cancer, MM, etc. data exists in the database), but only mark NSCLC as `is_visible_in_ui = TRUE` for v1.0. Other indications show as "coming soon" placeholders until you're ready to activate them.

### Example config rows

**Broad TA: Hepatology** (parent_ta_id NULL, ta_level 'broad_ta')

```sql
INSERT INTO therapeutic_area_ingestion_config (
  therapeutic_area_id,
  pubmed_query,
  pubmed_max_results,
  nppes_taxonomy_codes,
  openalex_concept_ids,
  ctgov_condition_filters,
  scoring_weights,
  is_visible_in_ui
) VALUES (
  '<hepatology_ta_uuid>',
  '("liver disease"[Title/Abstract] OR "hepatology"[Title/Abstract] OR "hepatitis"[Title/Abstract] OR "cirrhosis"[Title/Abstract] OR "NASH"[Title/Abstract] OR "MASH"[Title/Abstract] OR "cholangitis"[Title/Abstract] OR "hepatocellular carcinoma"[Title/Abstract])',
  30000,
  ARRAY['207RG0100X', '207RI0008X'],  -- Gastroenterology, Hepatology
  ARRAY['C2779134', 'C2778198'],  -- OpenAlex concept IDs for hepatology/liver disease
  ARRAY['liver', 'hepatitis', 'cirrhosis'],
  '{"pub_velocity": 0.15, "citation_trajectory": 0.35, "trial_investigator": 0.25, "msl_signal": 0.10, "congress": 0.10, "institution_tier": 0.05}'::jsonb,
  TRUE
);
```

**Indication: MASH** (parent_ta_id = Hepatology UUID, ta_level 'indication')

```sql
INSERT INTO therapeutic_area_ingestion_config (
  therapeutic_area_id,
  openalex_concept_ids,
  ctgov_condition_filters,
  indication_keyword_filters,
  scoring_weights,
  is_visible_in_ui
) VALUES (
  '<mash_indication_uuid>',
  ARRAY['<mash_specific_concept_id>'],
  ARRAY['MASH', 'NASH', 'non-alcoholic steatohepatitis', 'metabolic dysfunction-associated steatohepatitis'],
  ARRAY['MASH', 'NASH', 'steatohepatitis', 'fatty liver'],  -- for filtering pulled papers
  '{}'::jsonb,  -- inherits broad-TA weights unless overridden
  TRUE
);
```

**Broad TA: Oncology**

```sql
INSERT INTO therapeutic_area_ingestion_config (
  therapeutic_area_id,
  pubmed_query,
  pubmed_max_results,
  nppes_taxonomy_codes,
  scoring_weights,
  is_visible_in_ui
) VALUES (
  '<oncology_ta_uuid>',
  '("cancer"[Title/Abstract] OR "oncology"[Title/Abstract] OR "tumor"[Title/Abstract] OR "neoplasm"[Title/Abstract] OR "carcinoma"[Title/Abstract] OR "leukemia"[Title/Abstract] OR "lymphoma"[Title/Abstract])',
  100000,  -- oncology literature is huge
  ARRAY['207RH0000X', '207RX0202X', '207RO0000X'],  -- Heme/Onc, Radiation Onc, Surgical Onc
  '{"pub_velocity": 0.15, "citation_trajectory": 0.35, "trial_investigator": 0.25, "msl_signal": 0.10, "congress": 0.10, "institution_tier": 0.05}'::jsonb,
  TRUE
);
```

**Indication: NSCLC** (visible in v1.0)

```sql
INSERT INTO therapeutic_area_ingestion_config (
  therapeutic_area_id,
  openalex_concept_ids,
  ctgov_condition_filters,
  indication_keyword_filters,
  scoring_weights,
  is_visible_in_ui
) VALUES (
  '<nsclc_indication_uuid>',
  ARRAY['<nsclc_specific_concept_id>'],
  ARRAY['non-small cell lung cancer', 'NSCLC', 'lung adenocarcinoma'],
  ARRAY['NSCLC', 'non-small cell', 'lung adenocarcinoma', 'lung squamous'],
  '{}'::jsonb,
  TRUE
);
```

**Indication: Breast Cancer** (coming soon — ingested but not visible)

```sql
INSERT INTO therapeutic_area_ingestion_config (
  therapeutic_area_id,
  openalex_concept_ids,
  indication_keyword_filters,
  is_visible_in_ui
) VALUES (
  '<breast_cancer_indication_uuid>',
  ARRAY['<breast_cancer_specific_concept_id>'],
  ARRAY['breast cancer', 'mammary carcinoma'],
  FALSE  -- ingest the data, don't show in UI yet
);
```

Adding Schizophrenia later becomes one INSERT for the broad TA + one INSERT per indication + one pipeline run.

---

## The 8-step pipeline

### Step 1: TA configuration validation

**Script**: `validate_ta_config.py`

For each active TA, verify the config row is complete and the referenced queries/taxonomies are well-formed. Dry-run friendly. Fails fast if a TA is misconfigured.

### Step 2: Publication discovery

**Script**: `ingest_publications.py`

For each active TA, runs the configured PubMed query, fetches PMIDs, fetches article metadata via efetch, stores in `publications` table.

**Critical change from current state**: Does NOT create HCP rows. Stores `authorships` as JSONB array exactly as PubMed returns it (or as a normalized format we define). Never touches the `hcps` table.

Deduplication: PMID is the unique key. Re-running the script for the same TA doesn't create duplicate publication rows.

### Step 3: OpenAlex publication enrichment

**Script**: `enrich_publications_openalex.py`

For publications with a DOI but no OpenAlex enrichment, fetch the OpenAlex `work` record. Capture:
- `citation_count`
- `citation_counts_by_year` (the year-by-year array we depend on for trajectory)
- `authorships` (with OpenAlex author IDs for every author on the paper)
- `primary_location`, `publication_type`, `concepts`, `open_access`

Critical: this is where we get OpenAlex author IDs for every author. These become the identity primitive for HCP discovery.

### Step 4a: NPPES clinician discovery

**Script**: `ingest_nppes_clinicians.py`

For each active TA, reads the configured `nppes_taxonomy_codes`, filters the NPPES Parquet file, inserts new HCPs with NPI as the dedup key.

**Improved from current**: Properly populates `total_career_pubs` as NULL (not 0) so career_enrichment can later resolve them via OpenAlex.

Handles multi-TA clinicians (an HCP appearing in multiple TA taxonomies gets one HCP row + multiple `hcp_therapeutic_areas` rows).

### Step 4b: OpenAlex researcher discovery

**Script**: `ingest_openalex_researchers.py`

For each active TA, queries OpenAlex authors by:
- `concepts` filter using the TA's configured concept IDs
- `works_count` >= configured minimum
- Sorted by relevance or works_count

For each returned author, upserts an HCP row with `openalex_author_id` as the dedup key (with proper unique constraint). Captures display name, last_known_institutions, ORCID if present.

Tags HCPs with the TA via `hcp_therapeutic_areas`.

This step is what closes the NSCLC and Rare Disease coverage gaps we identified this morning.

### Step 5: HCP reconciliation (NPPES ↔ OpenAlex)

**Script**: `reconcile_hcps.py`

For HCPs discovered via NPPES (have NPI but no OpenAlex ID), attempts to find their OpenAlex counterpart via:
- Name match
- Institution match (NPPES institution string vs OpenAlex last_known_institutions)
- Specialty/concept match (NPPES taxonomy vs OpenAlex concepts)

When confident match found: updates the NPPES-originated HCP row with the OpenAlex author ID. Does NOT create a new row.

When ambiguous: logs the candidate pairs to a review table (`hcp_reconciliation_candidates`) for manual review. Never makes uncertain merges automatically.

**This is the riskiest step in the architecture.** Common-name researchers will have many candidates. Conservative defaults: require institution + name match for auto-link, otherwise flag for review.

### Step 6: Publication-author linking

**Script**: `link_publication_authors.py`

For each publication with OpenAlex enrichment, walks the `authorships` JSONB array. For each author whose OpenAlex ID matches an existing HCP, creates a `publication_authors` row.

**Critical**: Only links to existing HCPs. Does not create new HCP rows for authors we don't have. Authors we don't have are either:
- Researchers in TAs we don't cover yet (expected — they'll appear when those TAs are added)
- Researchers below our discovery thresholds (expected — we set thresholds intentionally)
- Edge cases we can investigate separately

Phase 3 already does this correctly. The new script generalizes the pattern.

### Step 7: HCP enrichment

**Scripts**: `enrich_career_pubs.py`, `enrich_trajectory_data.py`, `enrich_trials.py`, `enrich_institutions.py`

Runs the existing enrichment logic (career publication counts, first_pub_year, citation trajectory data, trial investigator matching, institution standardization) against the cleanly-identified HCP population.

**Improved from current**: Reads HCPs via `openalex_author_id` (clean primary key) instead of `(first_name, last_name)` matching. No more ambiguity.

### Step 8: Scoring

**Script**: `scoring_pipeline.py` (the one we've been iterating on)

Reads per-TA `scoring_weights` from `therapeutic_area_ingestion_config`. Computes composite scores per HCP per TA using TA-specific weights.

**Improved from current**: Per-TA weights mean Schizophrenia can use different weights than Hepatology. Reflects the reality that different TAs have different signal patterns.

---

## Identity key strategy

Three identity primitives:

| Primitive | Use | Source | Stable? |
|---|---|---|---|
| `npi_number` | US clinicians | NPPES registry | Yes (gov-issued) |
| `openalex_author_id` | Researchers | OpenAlex | Yes (algorithmic, but very stable) |
| `id` (UUID) | Internal | Generated | Yes (our system) |

Dedup constraints:
- `hcps.npi_number` UNIQUE (when not null)
- `hcps.openalex_author_id` UNIQUE (when not null)
- HCPs can have one, the other, or both. Never neither (or row should not exist).

Free-text fields (first_name, last_name, institution, etc.) are display data, never used for dedup.

---

## Data migration: what to preserve, what to wipe

The wipe criterion is more nuanced than "no NPI and no OpenAlex ID." Any HCP we've invested effort in connecting to external data has earned preservation, even if their identity primitives are weak. We'd resolve them to OpenAlex IDs in a separate pass rather than wiping them.

### Preservation rule (general principle)

**Preserve any HCP that meets ANY of the following:**

1. **Has a clean identity primitive**: `npi_number` IS NOT NULL OR `openalex_author_id` IS NOT NULL
2. **Is a verified canonical**: appears in our hardcoded canonical list (Loomba, Trauner, Harrison, Francque, Wong, Seung Up Kim, etc.)
3. **Has external data references**: any row in any of the following tables points to this HCP:
   - `trial_investigators` (this HCP runs/ran a clinical trial)
   - `hcp_open_payments_summary` or `hcp_open_payments_by_ta` (we have CMS Open Payments data)
   - `hcp_medicare_summary` or `hcp_medicare_by_ta` (we have Medicare claims data)
   - `dol_matches` (we've matched this HCP to social/DOL data)
   - `hcp_narratives` (we've generated Claude profile descriptions worth keeping)
   - `npi_match_proposals` with status='confirmed' (manual NPI matching work)

The preservation rule is an OR, not an AND. Any single qualifying condition keeps the HCP.

### Wipe scope (after preservation)

After applying the preservation rule, wipe any remaining HCPs. These are by definition:
- No NPI
- No OpenAlex author ID
- No external data references in any table
- Not on the canonical list

These are pure noise — PubMed-pipeline-created rows with varying affiliations that never got connected to anything else. They have no value to retain.

### Tables affected during wipe

**Wiped fully (rebuilt clean by new pipeline):**
- `hcp_scores` — stale, will rebuild in Step 8
- `hcp_narratives` for wiped HCPs — Claude-generated profiles tied to wiped HCPs only
- `publication_authors` — point to HCPs that may be wiped; rebuilt cleanly in Step 6 against the post-wipe HCP table

**Wiped selectively (only rows pointing to wiped HCPs):**
- `hcps` itself — wipe rows that fail the preservation rule

**Preserved entirely (untouched by wipe):**
- `publications` — paper-level data, identified by PMID/DOI, no HCP dependency
- `trials` — trial-level data from ClinicalTrials.gov
- `trial_investigators` — preserved because their HCP references are preserved (preservation rule ensures every trial investigator HCP survives)
- `hcp_open_payments_summary`, `hcp_open_payments_by_ta` — preserved because their HCP references are preserved
- `hcp_medicare_summary`, `hcp_medicare_by_ta` — preserved because their HCP references are preserved
- `dol_matches` — preserved because their HCP references are preserved
- `npi_match_proposals` — preserved as audit trail
- `therapeutic_areas` — TA definitions
- All NPPES, Open Payments, Medicare reference data

### Pre-wipe diagnostic queries

Before executing any wipe, run these queries to know exactly what's going to happen. The wipe should never be a leap of faith.

```sql
-- Count HCPs by preservation category
WITH preservation AS (
  SELECT 
    h.id,
    CASE
      WHEN h.npi_number IS NOT NULL THEN 'has_npi'
      WHEN h.openalex_author_id IS NOT NULL THEN 'has_openalex'
      WHEN EXISTS (SELECT 1 FROM trial_investigators ti WHERE ti.hcp_id = h.id) THEN 'has_trials'
      WHEN EXISTS (SELECT 1 FROM hcp_open_payments_summary ops WHERE ops.hcp_id = h.id) THEN 'has_open_payments'
      WHEN EXISTS (SELECT 1 FROM hcp_medicare_summary ms WHERE ms.hcp_id = h.id) THEN 'has_medicare'
      WHEN EXISTS (SELECT 1 FROM dol_matches dm WHERE dm.hcp_id = h.id) THEN 'has_dol_match'
      WHEN h.id = ANY(ARRAY['canonical_uuid_1', 'canonical_uuid_2', ...]::uuid[]) THEN 'is_canonical'
      ELSE 'no_identity_no_references'
    END AS category
  FROM hcps h
)
SELECT category, COUNT(*) AS hcp_count
FROM preservation
GROUP BY category
ORDER BY hcp_count DESC;
```

This shows exactly how many HCPs fall into each category. Expected output:
- `has_npi`: large (NPPES-discovered clinicians)
- `has_openalex`: moderate (phase 2 resolved researchers)
- `has_trials`: small but important (trial investigators)
- `has_open_payments`, `has_medicare`, `has_dol_match`: small overlap with above
- `is_canonical`: tiny (manually-validated)
- `no_identity_no_references`: the wipe target — pure noise

Only proceed with the wipe if the `no_identity_no_references` count matches expectations. If it's surprisingly small, our preservation rule may be too generous. If it's surprisingly large, we should investigate before wiping.

### Estimated database state changes

Before: ~109,000 HCPs (mostly noisy)
After preservation rule applied: estimated 50,000-70,000 HCPs survive (NPPES + OpenAlex + trial investigators + payments + medicare + canonicals + their union)
After Step 4b broader OpenAlex discovery: estimated 100,000-200,000 HCPs (broader coverage, clean identity)

Net: similar size, dramatically better data quality, no trial/payments/medicare/social data lost, properly TA-tagged.

The pre-wipe diagnostic will give exact numbers before any deletion happens.

---

## Coverage projections: what the rebuild actually delivers

The original doc framed expected NSCLC coverage as "1.6% → 10-15%." That was misleading because it used the wrong denominator (all NSCLC-tagged HCPs, most of whom are community oncologists, not researchers). Here's the corrected projection.

### Hepatology (broad TA)

**Current state:**
- Publications: ~30,000 in our DB
- HCPs tagged Hepatology: ~25,000
- HCPs with trajectory data: ~4,344 (17% of tagged)

**Post-rebuild projection:**
- Publications: ~50,000-70,000 (broader PubMed query for the full liver-disease space)
- HCPs tagged Hepatology (research-active): ~10,000-20,000 (after OpenAlex discovery)
- HCPs with trajectory data: ~8,000-15,000

**Indication-level breakdown** (post-rebuild, estimates):
- MASH/NASH: 3,000-5,000 research-active HCPs with trajectory data
- PBC: 800-1,500 research-active HCPs with trajectory data
- HCC: 2,000-3,500
- PSC: 500-1,000
- Viral hepatitis: 2,000-3,000

This is the level where Rising Stars becomes meaningful — by indication, not by broad TA.

### NSCLC (Oncology indication)

**Current state:**
- Publications: ~7,000-10,000 NSCLC papers in our DB
- HCPs tagged NSCLC: 43,610 (mostly community oncologists)
- HCPs with trajectory data: 695 (1.6%)

**Post-rebuild projection:**
- Publications: ~30,000-50,000 NSCLC papers (broader Oncology query + indication filtering)
- HCPs tagged NSCLC (research-active): 5,000-15,000 (after Oncology-broad OpenAlex discovery + NSCLC indication filtering)
- HCPs with trajectory data: 4,000-12,000

The jump is from ~700 research-active NSCLC HCPs to ~5,000-12,000. That's the difference between NSCLC being a broken product and NSCLC being a functional product.

Note: total NSCLC-tagged HCP count goes UP from 43,610 because we preserve NPPES community oncologists AND add OpenAlex-discovered researchers. Most of the NPPES community oncologists won't have trajectory data — they're clinicians, not researchers — and that's fine. They appear in the database for trial/payments/Medicare overlap purposes, not Rising Stars cohort.

### Rare Disease (broad TA)

**Current state:**
- Publications: ~5,000 in our DB
- HCPs tagged Rare Disease: 40,432 (mostly NPPES-tagged clinicians)
- HCPs with trajectory data: 371 (0.9%)

**Post-rebuild projection:**
- Publications: ~15,000-25,000 (broader rare disease query — Rare Disease is fragmented across many specific conditions)
- HCPs tagged Rare Disease (research-active): 3,000-8,000
- HCPs with trajectory data: 2,000-6,000

Rare Disease is the hardest TA structurally because it's a collection of many small fields (each rare disease has a small research community). The architecture handles this correctly via indication-level tagging — Sickle Cell, CF, SMA, etc. each become their own indication with focused scoring. Aggregating across Rare Disease as a broad TA gives misleading numbers; the indication-level view is what matters.

### Why the projections are wide ranges

Three uncertainties:

1. **OpenAlex `min_works_count` threshold** — setting 5 vs 10 changes researcher discovery counts significantly
2. **OpenAlex concept coverage** — how comprehensively OpenAlex has tagged papers with the concepts we use for filtering
3. **NPPES↔OpenAlex reconciliation rates** — how many NPPES clinicians turn out to be OpenAlex-discoverable researchers

We'll have actual numbers after Step 4b runs against Hepatology in the validation phase. Then we calibrate thresholds for Oncology and Rare Disease.

---

## Order of operations

Recommended sequence: **Hepatology first as architecture validation, then Oncology/NSCLC for v1.0, Rare Disease deferred to "coming soon."**

The "first then" sequencing is for architecture validation, not for shipping. Once the pipeline works end-to-end on Hepatology, adding Oncology is a configuration + run exercise (3-5 days), not a build exercise. NSCLC ships in v1.0 alongside Hepatology.

### Week 1: Schema, foundation scripts, Hepatology test bed

- **Day 1**: Schema changes. Add `parent_ta_id` and `ta_level` to `therapeutic_areas`. Create `therapeutic_area_ingestion_config` table. Add UNIQUE constraints on `hcps.openalex_author_id` and `hcps.npi_number`. Create `canonical_hcps_snapshot` table. Populate config rows for Hepatology (broad TA + indications). Run FK enumeration query to finalize preservation rule.
- **Day 2-3**: Build `ingest_publications.py` (Step 2). Test on Hepatology only. Verify no HCP creation. Verify PMID dedup works.
- **Day 4-5**: Build `enrich_publications_openalex.py` (Step 3). Run on Hepatology publications. Verify authorship JSONB with OpenAlex author IDs is captured.

### Week 2: HCP discovery and reconciliation on Hepatology

- **Day 6**: Build `ingest_nppes_clinicians.py` (Step 4a). Generalize from `nppes_workstream_b_ingest.py`. Run on Hepatology taxonomies only.
- **Day 7-8**: Build `ingest_openalex_researchers.py` (Step 4b). The biggest new piece. Test against Hepatology with `min_works_count = 5`. Examine output. Tune threshold if needed.
- **Day 9**: Build `reconcile_hcps.py` (Step 5). Conservative defaults: require institution + name match for auto-link. Run on Hepatology population. Manually review the candidate table.
- **Day 10**: Snapshot existing canonicals. Run pre-wipe diagnostic. Verify preservation counts. Execute wipe in transaction with verification steps. Confirm canonicals survived via snapshot comparison.

### Week 3: Link, enrich, score, validate Hepatology

- **Day 11**: Build `link_publication_authors.py` (Step 6). Run on Hepatology publications.
- **Day 12-13**: Re-run enrichment scripts (Step 7) against clean Hepatology HCP population. Includes career_pubs, first_pub_year (with the corroborated-min logic from May 12), citation_counts_by_year, trial investigator matching.
- **Day 14**: Re-run scoring (Step 8) with Hepatology weights. Compare Rising Stars top 100 against canonical knowledge. This is the validation moment.
- **Day 15**: Iterate on threshold tuning if scoring output looks wrong. Adjust `openalex_min_works_count` or scoring weights as needed.

### Week 4: Extend to Oncology and NSCLC

- **Day 16**: Add Oncology broad TA config + NSCLC indication config + other oncology indications (Breast, MM, etc.) with `is_visible_in_ui = FALSE`.
- **Day 17-18**: Run the pipeline end-to-end against Oncology. All scripts already exist from Hepatology work. Adjust thresholds based on Oncology-specific data shape.
- **Day 19**: Validate NSCLC Rising Stars output. Cross-check against any known oncology canonicals.
- **Day 20**: Document the configuration process for adding future TAs. This is the "playbook" — when you decide to add Schizophrenia or Cardiology, the steps are documented.

### Deferred: Rare Disease

Rare Disease enters as a "coming soon" placeholder in v1.0. The architecture supports it but we don't run discovery until after launch. Rationale:
- Rare Disease research communities are fragmented (each rare disease is its own small field)
- Indication-level configuration takes more time per indication
- v1.0 ships sooner with Hepatology + NSCLC than with all three

Post-launch (~Week 6-8 from start): Add Rare Disease broad TA + ~10 indication configs (SCD, CF, SMA, DMD, hemophilia, etc.), run pipeline, ship as a v1.1 update.

### Wipe sequence

Before any new ingestion runs, execute the wipe in a transaction. The sequence below assumes the pre-wipe diagnostic has been run and the `no_identity_no_references` count looks correct.

```sql
BEGIN;

-- Step 1: Snapshot canonicals (do this BEFORE the wipe runs, even before the transaction)
-- (See "Canonical snapshot" section below for the snapshot script)

-- Step 2: Identify HCPs to preserve (build temp table)
CREATE TEMP TABLE hcps_to_preserve AS
SELECT DISTINCT h.id
FROM hcps h
WHERE h.npi_number IS NOT NULL
   OR h.openalex_author_id IS NOT NULL
   OR h.id IN (SELECT id FROM canonical_hcps_snapshot)
   OR EXISTS (SELECT 1 FROM trial_investigators ti WHERE ti.hcp_id = h.id)
   OR EXISTS (SELECT 1 FROM hcp_open_payments_summary ops WHERE ops.hcp_id = h.id)
   OR EXISTS (SELECT 1 FROM hcp_open_payments_by_ta opt WHERE opt.hcp_id = h.id)
   OR EXISTS (SELECT 1 FROM hcp_medicare_summary ms WHERE ms.hcp_id = h.id)
   OR EXISTS (SELECT 1 FROM hcp_medicare_by_ta mt WHERE mt.hcp_id = h.id)
   OR EXISTS (SELECT 1 FROM dol_matches dm WHERE dm.hcp_id = h.id);

-- (additional preservation conditions added based on FK enumeration query result)

-- Verify preservation count before continuing
SELECT COUNT(*) AS preserved_hcp_count FROM hcps_to_preserve;
SELECT COUNT(*) AS wipe_target_count FROM hcps WHERE id NOT IN (SELECT id FROM hcps_to_preserve);

-- If counts look wrong, ROLLBACK here. Otherwise continue.

-- Step 2: Wipe dependent data first (foreign key order)
DELETE FROM hcp_scores;  -- always full wipe, will rebuild in Step 8
DELETE FROM publication_authors WHERE hcp_id NOT IN (SELECT id FROM hcps_to_preserve);
DELETE FROM hcp_narratives WHERE hcp_id NOT IN (SELECT id FROM hcps_to_preserve);
DELETE FROM hcp_therapeutic_areas WHERE hcp_id NOT IN (SELECT id FROM hcps_to_preserve);

-- Step 3: Wipe HCPs themselves
DELETE FROM hcps WHERE id NOT IN (SELECT id FROM hcps_to_preserve);

-- Step 4: Verify expected counts
SELECT 
  (SELECT COUNT(*) FROM hcps) AS hcps_remaining,
  (SELECT COUNT(*) FROM trial_investigators) AS trial_investigators_remaining,
  (SELECT COUNT(*) FROM hcp_open_payments_summary) AS open_payments_remaining,
  (SELECT COUNT(*) FROM publication_authors) AS publication_authors_remaining;

-- If counts match expectations, COMMIT. Otherwise ROLLBACK.
COMMIT;
```

The transaction wrapper means we can always ROLLBACK if any verification step shows unexpected numbers. The wipe is reversible until the COMMIT.

### Canonical snapshot (run BEFORE wipe)

The wipe references `canonical_hcps_snapshot` as a source of truth for which HCPs are protected canonicals. Create this table and populate it before the wipe.

```sql
CREATE TABLE canonical_hcps_snapshot AS
SELECT 
  h.*,
  NOW() AS snapshotted_at,
  '<reason>' AS preservation_reason
FROM hcps h
WHERE h.id IN (
  -- Hepatology canonicals (from May 11 dedup work + this session)
  '664b62e9-dbf5-4476-ada4-be08c3e34e6a',  -- Stephen A. Harrison
  '34897812-10c5-4807-9123-347a93997b68',  -- Michael Trauner
  'f53ce08e-8c9a-4e8c-a624-b2bd991da0f3',  -- Sven Francque
  '18f2ca41-8533-4b86-837f-d2ecbab77422',  -- Vincent Wai-Sun Wong
  '9b88c999-8133-4904-88af-40aa412d4af3',  -- Seung Up Kim
  '9339ead6-2023-4e69-9eda-2914553a2e20',  -- Rohit Loomba
  -- Add other canonical UUIDs from our running list
  ...
);

-- Verify snapshot count matches expected canonical count
SELECT COUNT(*) FROM canonical_hcps_snapshot;
```

If anything goes wrong during the wipe, canonicals can be restored from this snapshot via `INSERT INTO hcps SELECT * FROM canonical_hcps_snapshot WHERE id NOT IN (SELECT id FROM hcps)`.

Keep the snapshot table around indefinitely as audit trail.

---

## What this architecture does NOT solve

Honest acknowledgments:

**1. OpenAlex author resolution itself is imperfect.** Common names like "Jing Wang" still get 5-10% misattribution at OpenAlex's level. We can't fix what's wrong upstream. We can only avoid making it worse.

**2. The validation cohort still needs to be built.** Clean data doesn't automatically produce confident rankings. We still need 30-50 hand-curated rising stars per TA as ground truth.

**3. NPPES↔OpenAlex reconciliation will have edge cases.** Some researchers have multiple NPIs (rare but possible). Some have ORCID-linked OpenAlex IDs that don't match their NPI institution. The `hcp_reconciliation_candidates` table is designed to surface these for manual review, not auto-resolve them.

**4. Per-TA scoring weight calibration is separate work.** This architecture supports it but doesn't automatically derive correct weights. That comes from validation cohort feedback.

**5. Future ingestion paths (Sermo, conference data, social signals) need to follow the same identity primitives.** This is design discipline, not architecture-enforced.

**6. Indication-level tagging accuracy depends on OpenAlex concept quality.** If OpenAlex hasn't comprehensively tagged a paper with the right concepts, indication filtering will miss it. Fallback to keyword filters helps but isn't perfect.

---

## Decisions resolved

These were the open decisions from the first draft, with Garrett's calls:

**1. Preservation rule's external-data tables list** → Resolved: enumerate FKs to `hcps` via information_schema query before finalizing. The query is in the "Pre-wipe diagnostic queries" section. Run it, paste output, we add any missing tables to the preservation rule.

**2. OpenAlex discovery thresholds** → Resolved: `openalex_min_works_count = 5` as default. TA-specific overrides possible. We start there, examine output, adjust as needed. The threshold isn't permanent — it's a config row.

**3. Reconciliation auto-link threshold** → Resolved: conservative. Require name match + institution match for auto-link. Otherwise to manual review table. False negatives are recoverable; false positives corrupt the database.

**4. Sequencing of TAs** → Resolved: Hepatology first as architecture validation, then Oncology/NSCLC for v1.0 (3-5 day extension), Rare Disease deferred to "coming soon" / v1.1. The "first" sequencing validates the architecture; the "extension" sequencing ships v1.0.

**5. Canonical preservation method** → Resolved: snapshot table (`canonical_hcps_snapshot`). Safer than hardcoded UUIDs in the wipe script. Reversible.

**6. Two-level TA taxonomy** → Resolved (new in this revision): broad TAs contain indications. Ingestion happens at broad-TA level; tagging and scoring happen at indication level. UI shows broad-TA navigation with indication drill-down. `is_visible_in_ui` flag supports "coming soon" indications.

---

## What this gets us

When this is done:

**For Garrett**:
- Adding a new TA = one broad-TA config row + N indication config rows + one pipeline run
- Adding "Schizophrenia" or "Diabetes" or any other TA scales to the same effort as adding the first
- TA-specific and indication-specific scoring weights reflect real differences between fields
- Database has reliable identity primitives, no more dedup nightmare

**For the platform**:
- NSCLC research-active HCP count goes from ~700 to ~5,000-12,000 with trajectory data
- Hepatology indication-level Rising Stars (MASH, PBC, PSC, HCC) become differentiable
- Per-indication scoring methodology is defensible
- Methodology iteration produces clean signal instead of noisy signal

**For v1.0 launch**:
- **Hepatology** (broad TA) with indication drill-down: MASH, PBC, PSC, HCC, viral hepatitis all visible
- **Oncology** (broad TA) with NSCLC active; Breast Cancer, MM, etc. marked "Coming Soon"
- **Rare Disease** marked "Coming Soon" entirely at the broad-TA level
- Defensible Rising Stars cohorts for visible indications

**For v1.1 (post-launch)**:
- Activate additional Oncology indications (Breast, MM, RCC, etc.) — data already ingested, flip `is_visible_in_ui`
- Add Rare Disease broad TA + indication configs (SCD, CF, SMA, DMD, hemophilia, etc.)
- Run pipeline, ship as v1.1 update

---

## Next steps if this design is approved

1. Garrett reviews this revised doc, pushes back on anything that doesn't land
2. Run the FK enumeration query, add any missing tables to preservation rule
3. Schema changes go in (the new config table, the TA parent_ta_id/ta_level columns, UNIQUE constraints, canonical_hcps_snapshot table)
4. Populate canonical_hcps_snapshot with all currently-validated canonicals
5. We start building Step 2 (`ingest_publications.py`)
6. We test end-to-end on Hepatology before extending to Oncology/NSCLC

Ready to start.
