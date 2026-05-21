# FieldMark Foundation Rebuild Specification

**Version:** 1.0
**Date:** May 21, 2026
**Author:** Garrett + Claude
**Target completion:** May 28, 2026 (before ASCO conference week begins May 29)
**Demo target:** Mid-June 2026 with clean ASCO data

---

## Why this document exists

Three weeks of FieldMark development have produced a working frontend, a comprehensive scoring methodology, a functional social/DOL capture pipeline, and substantial demo-grade UI. The HCP data foundation underneath this work has accumulated systematic issues that downstream features keep tripping over:

- 80,118 HCPs (76%) have `first_pub_year` >= 2024 due to truncated PubMed ingestion windows
- HCPs are fragmented across multiple OpenAlex author shards but only linked to one
- The `hcps` table contains known duplicates (Hwu × 2, Planchard × 4, Yang × 5, Younossi × 5)
- TA tagging is too loose — single co-authored papers create false TA assignments
- Institution string variants prevent exact-match joins
- Career enrichment scripts treat each HCP as having one OpenAlex match when most have 2-5

The result: scoring is broken for the majority of HCPs, narratives parrot bad inputs, and patching individual cases produces inconsistent fixes that re-surface in different forms.

This document specifies a foundation rebuild that addresses these issues systemically. The rebuild uses a strangler-fig pattern: existing data stays untouched while new clean tables (`hcps_v2`, etc.) are populated alongside. When new tables cover all visible surfaces, the frontend switches over. Old tables are eventually dropped.

The goal is a clean data foundation by May 28, ready to capture clean ASCO 2026 data into a clean schema, with a polished demo-ready state by mid-June.

---

## What stays untouched

These components have been validated and do NOT need rebuilding:

- **Frontend** (entire `frontend/` directory) — works against any conformant data
- **Social capture pipeline** (`twitter_capture.py`, `social_capture_config.json`) — data captured in social_users/social_posts tables is correct
- **DOL matching architecture** (`dol_matching.py`) — methodology is sound, will re-run against new hcps
- **Scoring methodology design** — formulas and weights are correct; only their INPUTS are broken
- **Schema design** for hcps, publications, hcp_therapeutic_areas, etc. — column structures are fine
- **Bolt frontend, Cursor IDE, Supabase, Cloudflare deploy flow** — operational infrastructure
- **Configuration patterns** — env vars, .env structure, polite mailto for APIs

---

## What gets rebuilt

New tables created during rebuild:

- `hcps_v2` — clean canonical HCP records
- `publications_v2` — complete publication history per HCP
- `hcp_therapeutic_areas_v2` — strict TA tagging
- `hcp_scores_v2` — scores computed from clean inputs
- `hcp_narratives_v2` — narratives generated against clean inputs
- `trial_investigators_v2` — clean trial-HCP linkages
- `hcp_openalex_authors_v2` — multi-shard OpenAlex linkages
- (other supporting tables as needed)

Existing tables that survive:

- `social_users`, `social_posts`, `dol_matches` — re-link to hcps_v2 IDs at end of rebuild
- `therapeutic_areas` — taxonomy stays
- `clinical_trials` (parent table for trial metadata) — only the join table rebuilds
- `openalex_author_inventory` — already-ingested data is reusable

Tables to drop AFTER rebuild succeeds:

- `hcps`, `publications`, `hcp_therapeutic_areas`, `hcp_scores`, `hcp_narratives`, `trial_investigators`, `hcp_openalex_authors`
- Various dedupe-related cleanup tables

---

## Core principles for the rebuild

These principles informed every decision below. They derive directly from problems encountered in the original ingestion.

### Principle 1: Disambiguation is a first-class concern, not a cleanup task

In the original pipeline, deduplication ran AFTER ingestion as a remediation step. The result: duplicates persisted in production data, and downstream features were built against them, locking in bad assumptions.

In the rebuild, disambiguation happens AT INGESTION TIME. Every record being written is checked against existing records using a deterministic identity hierarchy. Conflicts are resolved or flagged before the row is saved.

### Principle 2: Author identity is multi-shard, not single

OpenAlex disambiguates authors imperfectly. James L. Gulley exists as 4 separate author records in OpenAlex due to name variations, co-author network changes, and institution affiliations across time. Treating these as 4 different people, OR linking only the "best match" shard, both produce wrong career data.

The rebuild assumes every HCP has 1-N OpenAlex author shards, all of which should be linked, with career data aggregated across them (MIN first_seen, SUM corpus_pub_count).

### Principle 3: NPI is the cleanest identity signal we have

The original pipeline relied heavily on name + institution matching, which fails when institutions vary in string form ("UCSD" vs "University of California San Diego" vs "NAFLD Research Center"). NPI is a unique federal identifier for US healthcare providers and resolves identity unambiguously when present.

The rebuild uses NPI as the primary identity key when available. ORCID is secondary. Name + institution + coauthor cluster is tertiary, with explicit confidence scoring.

### Principle 4: TA tagging requires evidence, not single occurrences

The original pipeline tagged an HCP with a TA based on a single co-authored paper carrying that TA tag. This produced false TA assignments: Pemmaraju tagged Rare Disease because BPDCN counts as rare; Gandara tagged Hepatology because of one liver-cancer paper.

The rebuild requires AT LEAST 3 publications tagged with a TA before assigning that TA to an HCP. This dramatically reduces false-tagging without excluding genuinely focused researchers.

### Principle 5: Quality gates flag suspicious data instead of silently saving

The original pipeline saved whatever came out of enrichment scripts, including obvious errors like `first_pub_year = 2025` for a senior researcher with 600+ career publications. Downstream features then displayed those errors as truth.

The rebuild flags suspect records with `quality_flag` values and refuses to score/narrate them without manual review. Examples:
- `first_pub_year >= current_year AND total_career_pubs > 30` → suspect
- TA tag count = 1 → defer assignment until threshold met
- Institution string differs from all OpenAlex shard institutions → check for affiliation change vs misalignment

### Principle 6: Institution strings need normalization, not exact-matching

In the rebuild, institution strings flow through a normalization function that handles known aliases (UCSD, NAFLD Research Center → University of California San Diego) and casing/punctuation variants. Storage retains both raw and normalized forms.

### Principle 7: Pilot before scale

Every script gets tested against a known-good 50-HCP set BEFORE running against 100K. If the pilot produces wrong data for known seniors (Sanyal, Loomba, Chalasani, Younossi, Gulley, etc.), the methodology is wrong and gets fixed before scaling.

### Principle 8: Observability is built in, not added later

Every ingestion script writes to a `pipeline_runs` table on start/completion. Metrics tracked: rows processed, rows successfully written, rows flagged, errors, runtime, API cost. This data answers operational questions ("when did career enrichment last run successfully?") without requiring log archaeology.

---

## Identity model

This section specifies how a "person" is identified across data sources.

### Primary identity: NPI (National Provider Identifier)

When NPI is available:
- NPI is the unique identifier for an HCP in the United States
- A single NPI → single hcps_v2 row
- NPI links to NPPES data (specialty, address, practice setting)

### Secondary identity: ORCID

When NPI is unavailable but ORCID is:
- ORCID is researcher-asserted identity, used heavily in publications
- ORCID conflicts with NPI are unusual but resolvable case-by-case

### Tertiary identity: Name + primary institution + publication co-author cluster

When neither NPI nor ORCID is available:
- Match by normalized first name + last name + primary institution
- Use OpenAlex co-author networks to confirm same-person across time
- Confidence score: 1.0 (NPI), 0.95 (ORCID), 0.85 (strict name+inst+coauthor), 0.70 (loose name+inst), <0.70 (rejected/manual)

### Identity hash

Each hcps_v2 row gets an `identity_hash` field — a deterministic hash of the canonical identity (NPI or ORCID or name+inst). This is the JOIN target for everything else in the schema.

### What does NOT identify a person

Explicitly not relying on:
- Twitter/social handles (these belong to social_users, not to HCP identity)
- Email addresses (rare, often outdated)
- ResearcherID, Scopus author ID (proprietary, paid databases)
- Display name strings (vary by context)

---

## Source data plan

### PubMed (primary source for publication history)

**Goal:** Complete publication history per HCP, not date-bounded.

**Method:** For each HCP, query PubMed via E-utilities:
- Primary query: `(LastName Initial[AU]) AND (Institution[AD])`
- Fallback queries: with author + ORCID, with author + city, etc.
- No date filter
- Pull all matching PMIDs

**Disambiguation:** Use NPPES affiliation + OpenAlex coauthor signal to filter. "Loomba R" matches Rohit Loomba (UCSD), Rohan Loomba (UCSD), and ~5 other Loombas globally. Affiliation narrows; coauthor patterns confirm.

**Rate limit:** NCBI E-utilities = 3 req/sec without API key, 10 with key. We have an API key configured in `.env`.

**Estimated runtime:** 100K HCPs × ~3 queries each × 10 req/sec = ~8.3 hours minimum. With safety margin: plan for 12-15 hours runtime, broken into resumable chunks.

**Quality gate:** Reject publications where co-authors don't overlap with the HCP's OpenAlex author shards. This catches obvious wrong-person matches.

### OpenAlex (career data + citation enrichment)

**Goal:** Career start year, total publication count, citation trajectory.

**Method:** Multi-shard linking per HCP.

For each HCP:
1. Search `openalex_author_inventory` for all records matching:
   - Last name (substring match, case-insensitive)
   - First name first 3-4 characters (substring match, case-insensitive)
   - Institution string overlap (use normalized institution names)
2. Link ALL matching shards via `hcp_openalex_authors_v2` (not just highest-confidence)
3. Aggregate:
   - `career_first_pub_year` = MIN(first_seen_pub_year) across linked shards
   - `total_career_pubs` = SUM(corpus_pub_count) across linked shards
   - `latest_pub_year` = MAX(last_seen_pub_year) across linked shards

**Quality gate:** If shard's first_name doesn't substring-match (e.g., "Elena Younossi" doesn't match "Zobair"), exclude even if last name + institution match.

### ClinicalTrials.gov (trial investigator data)

**Goal:** Trial investigator role per HCP.

**Method:** Use existing `clinical_trials_ingest.py` patterns, but with NPI/ORCID disambiguation where available.

**Quality gate:** Match trial investigator name to HCP via NPI when present. Without NPI, require exact name match + affiliation overlap.

### NPPES (US clinician registry)

**Goal:** NPI-based identity, specialty, practice setting, address.

**Method:** Already exists in existing pipeline. Re-run for completeness; populate `hcps_v2` directly.

### Open Payments (CMS industry payment data)

**Goal:** Sponsor relationship signal for scoring.

**Method:** Already exists. Re-aggregate against hcps_v2 NPIs.

---

## Schema specifications

### hcps_v2 (canonical HCP table)

```sql
CREATE TABLE hcps_v2 (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  identity_hash TEXT UNIQUE NOT NULL,

  -- Identity signals (in order of preference)
  npi_number TEXT UNIQUE,
  orcid TEXT UNIQUE,

  -- Names
  first_name TEXT NOT NULL,
  middle_name TEXT,
  last_name TEXT NOT NULL,
  name_suffix TEXT,
  preferred_display_name TEXT,

  -- Institution (normalized)
  institution_normalized TEXT,
  institution_raw TEXT,
  institution_secondary TEXT,
  institution_history JSONB,
  country TEXT NOT NULL DEFAULT 'USA',

  -- Career data (from OpenAlex multi-shard aggregation)
  career_first_pub_year INTEGER,
  total_career_pubs INTEGER,
  latest_pub_year INTEGER,
  career_age_years INTEGER GENERATED ALWAYS AS (latest_pub_year - career_first_pub_year + 1) STORED,

  -- Identity confidence
  identity_confidence_score NUMERIC,
  identity_method TEXT,

  -- Quality flags
  quality_flags TEXT[],

  -- Cohort classification (filled by scoring pipeline)
  cohort_classification TEXT,
  cohort_score NUMERIC,

  -- DOL flag
  is_verified_dol BOOLEAN DEFAULT false,
  verified_dol_at TIMESTAMPTZ,

  -- NPPES enrichment
  npi_specialty TEXT,
  nppes_practice_city TEXT,
  nppes_practice_state TEXT,
  nppes_practice_setting TEXT,
  nppes_career_stage_years INTEGER,

  -- Audit
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  ingestion_run_id UUID
);

CREATE INDEX idx_hcps_v2_npi ON hcps_v2(npi_number) WHERE npi_number IS NOT NULL;
CREATE INDEX idx_hcps_v2_orcid ON hcps_v2(orcid) WHERE orcid IS NOT NULL;
CREATE INDEX idx_hcps_v2_country ON hcps_v2(country);
CREATE INDEX idx_hcps_v2_is_verified_dol ON hcps_v2(is_verified_dol) WHERE is_verified_dol = true;
CREATE INDEX idx_hcps_v2_cohort ON hcps_v2(cohort_classification) WHERE cohort_classification IS NOT NULL;
```

### publications_v2

```sql
CREATE TABLE publications_v2 (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  hcp_id UUID NOT NULL REFERENCES hcps_v2(id) ON DELETE CASCADE,
  pmid TEXT,
  doi TEXT,
  openalex_work_id TEXT,
  title TEXT,
  pub_year INTEGER NOT NULL,
  journal TEXT,
  abstract TEXT,
  author_position TEXT,
  is_first_author BOOLEAN,
  is_senior_author BOOLEAN,
  total_authors INTEGER,
  citation_count INTEGER,
  source TEXT NOT NULL,
  ingested_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(hcp_id, pmid),
  UNIQUE(hcp_id, doi)
);

CREATE INDEX idx_publications_v2_hcp_year ON publications_v2(hcp_id, pub_year);
CREATE INDEX idx_publications_v2_year ON publications_v2(pub_year);
```

### hcp_therapeutic_areas_v2

```sql
CREATE TABLE hcp_therapeutic_areas_v2 (
  hcp_id UUID NOT NULL REFERENCES hcps_v2(id) ON DELETE CASCADE,
  therapeutic_area_id UUID NOT NULL REFERENCES therapeutic_areas(id),
  publication_count INTEGER NOT NULL DEFAULT 0,
  assigned_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (hcp_id, therapeutic_area_id),
  CHECK (publication_count >= 3)
);
```

Note the CHECK constraint: a row cannot exist in this table unless the HCP has at least 3 publications in that TA. This enforces principle 4 at the database level.

### hcp_openalex_authors_v2 (multi-shard linkage)

```sql
CREATE TABLE hcp_openalex_authors_v2 (
  hcp_id UUID NOT NULL REFERENCES hcps_v2(id) ON DELETE CASCADE,
  openalex_author_id TEXT NOT NULL,
  is_primary BOOLEAN DEFAULT false,
  match_confidence NUMERIC NOT NULL,
  match_method TEXT NOT NULL,
  first_seen_pub_year INTEGER,
  last_seen_pub_year INTEGER,
  corpus_pub_count INTEGER,
  linked_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (hcp_id, openalex_author_id)
);

CREATE INDEX idx_hcp_openalex_v2_primary ON hcp_openalex_authors_v2(hcp_id) WHERE is_primary = true;
```

### pipeline_runs (observability)

```sql
CREATE TABLE pipeline_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pipeline_name TEXT NOT NULL,
  started_at TIMESTAMPTZ NOT NULL,
  completed_at TIMESTAMPTZ,
  status TEXT NOT NULL,
  rows_processed INTEGER DEFAULT 0,
  rows_succeeded INTEGER DEFAULT 0,
  rows_flagged INTEGER DEFAULT 0,
  rows_failed INTEGER DEFAULT 0,
  metrics JSONB,
  error_message TEXT,
  triggered_by TEXT
);

CREATE INDEX idx_pipeline_runs_name_started ON pipeline_runs(pipeline_name, started_at DESC);
```

### dol_canonical_overrides (manual linking)

```sql
CREATE TABLE dol_canonical_overrides (
  hcp_id UUID NOT NULL REFERENCES hcps_v2(id) ON DELETE CASCADE,
  social_user_id UUID NOT NULL,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  created_by TEXT,
  PRIMARY KEY (hcp_id, social_user_id)
);
```

### tracked_conferences (conference-agnostic active indicator)

```sql
CREATE TABLE tracked_conferences (
  slug TEXT PRIMARY KEY,
  display_name TEXT NOT NULL,
  hashtag_patterns TEXT[] NOT NULL,
  start_date DATE,
  end_date DATE,
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

INSERT INTO tracked_conferences VALUES
  ('asco', 'ASCO', ARRAY['#asco', '#asco26', '#asco2026'], '2026-05-29', '2026-06-02', true),
  ('easl', 'EASL', ARRAY['#easl', '#easl26', '#easl2026'], '2026-06-17', '2026-06-20', true),
  ('esmo', 'ESMO', ARRAY['#esmo', '#esmo26', '#esmo2026'], '2026-09-19', '2026-09-23', true),
  ('aasld', 'AASLD', ARRAY['#aasld', '#aasld26', '#aasld2026'], '2026-11-13', '2026-11-17', true);
```

---

## Rebuild execution plan

### Phase 0: Specification approval (Today, May 21)

Garrett reviews this document. Decides whether to proceed, push back, or modify.

### Phase 1: Schema creation (Day 1, May 22)

- Create all `_v2` tables alongside existing
- Create supporting tables (pipeline_runs, dol_canonical_overrides, tracked_conferences)
- Index strategy
- Backup current production state before any further work

**Acceptance:** All new tables exist and are queryable.

### Phase 2: Pilot ingestion (Days 1-2, May 22-23)

Identify 50 known-good HCPs across all TAs:

**Hepatology pilot set (10):**
- Arun J. Sanyal (VCU)
- Rohit Loomba (UCSD/NAFLD Research Center)
- Naga Chalasani (Indiana University)
- Zobair M. Younossi (Inova)
- Vlad Ratziu (Sorbonne University)
- Stephen A. Harrison (Pinnacle Clinical Research)
- Mary Rinella (UChicago)
- Gyorgy Baffy (VA Boston)
- Nikki Duong (Stanford)
- Akash Roy (Apollo)

**Oncology/NSCLC pilot set (15):**
- Toni K. Choueiri (Dana-Farber)
- Vivek Subbiah (Sarah Cannon)
- Stephen V. Liu (Georgetown)
- Narjust Florez (Dana-Farber)
- David R. Gandara (UC Davis)
- John V. Heymach (MD Anderson)
- Patrick M. Forde (Johns Hopkins)
- Heinz-Josef Lenz (USC)
- Alexander Spira (NEXT Oncology)
- Mark Awad (Dana-Farber)
- Catherine A. Shu (Columbia)
- Mark Pegram (Stanford)
- Christine Lovly (Vanderbilt)
- Jhanelle Gray (Moffitt)
- Geoffrey Liu (Princess Margaret)

**Rare Disease pilot set (10):**
- Naveen Pemmaraju (MD Anderson, BPDCN)
- Aman Chauhan (Sylvester, NETs)
- Christine Lovly (Vanderbilt, NSCLC rare drivers)
- Anoop Misra (Fortis CDOC, metabolic)
- Suthat Liangpunsakul (Indiana, alcoholic liver)
- Pamela Vohra (Mass General, Rare cancers)
- Adam Petrich (CMO Beam Therapeutics)
- Edward Neilan (Boston Children's, lysosomal)
- Mary Rinella (UChicago, NASH/MASLD)
- Jordan Berlin (Vanderbilt, GI cancer rare types)

**Immunology pilot set (5):**
- Iain B. McInnes (Glasgow)
- Vibeke Strand (Stanford)
- Eric Ruderman (Northwestern)
- Joseph Markenson (HSS)
- Daniel Aletaha (Vienna)

**General/Other pilot set (10):**
- Stephen V. Liu, Toni K. Choueiri (already counted but here for cross-TA verification)
- Add 8 more from the Verified DOL list

For each pilot HCP, manually verify (from public sources):
- Actual career start year
- Approximate total publication count (within ±10%)
- Current institution
- Primary therapeutic area focus
- NPI when retrievable
- ORCID when retrievable

This ground-truth set becomes the validation oracle for ALL subsequent pipeline runs.

**Acceptance:** Pilot HCPs are documented in a `pilot_validation.md` file with their ground-truth career data.

### Phase 3: Identity resolution pipeline (Day 2-3, May 23-24)

Write `identity_resolution_v2.py` that:
1. Pulls all NPPES records for US providers in target specialties
2. Pulls all ORCID-linked researchers
3. Pulls all OpenAlex author records
4. Resolves identity per the model above (NPI → ORCID → name+inst+coauthor)
5. Writes hcps_v2 rows with appropriate identity_confidence_score
6. Writes hcp_openalex_authors_v2 with multi-shard linking

Run against pilot 50 first. Verify outputs match ground truth.

Then scale: run against full HCP universe.

**Quality gates:**
- Reject any row with identity_confidence_score < 0.70
- Flag any row where multiple OpenAlex shards have non-overlapping coauthors
- Flag any row where NPI matches multiple names

**Acceptance:** Pilot 50 produces hcps_v2 rows with correct names, institutions, and OpenAlex linkings. Scale run completes without errors.

### Phase 4: Publication backfill (Day 3-4, May 24-25)

Write `pubmed_backfill_v2.py` that:
1. For each hcps_v2 row, queries PubMed for complete publication history
2. Uses NPI/ORCID where available for disambiguation
3. Falls back to name + institution + coauthor verification
4. Writes publications_v2 rows
5. Updates hcps_v2 career fields (career_first_pub_year, total_career_pubs, latest_pub_year)

**Rate limit handling:**
- 10 req/sec with NCBI API key
- Exponential backoff on 429
- Resumable via checkpoint table

**Estimated runtime:** 12-15 hours. Run overnight.

**Quality gates:**
- Flag publications where coauthor overlap with OpenAlex shards is zero
- Flag HCPs whose new total_career_pubs differs from OpenAlex sum by > 50%

**Acceptance:** Pilot 50 HCPs have publications going back to documented career start. Sanyal's earliest pub year drops to 1995-2000 range. Loomba's to 2003-2005 range. Etc.

### Phase 5: TA tagging (Day 4, May 25)

Write `ta_tagging_v2.py` that:
1. For each publication in publications_v2, identifies TA based on:
   - MeSH headings (PubMed)
   - Journal scope
   - OpenAlex concepts
2. Aggregates per HCP
3. Writes hcp_therapeutic_areas_v2 entries ONLY for TAs with ≥3 publications

**Quality gate:** The 3-publication threshold is enforced at the DB level (CHECK constraint).

**Acceptance:** Pemmaraju does NOT appear in Rare Disease (he's leukemia/MPN focus, may not have 3+ true Rare Disease pubs). Sanyal appears in Hepatology with strong pub count. Heinz-Josef Lenz appears in NSCLC/Oncology, NOT in Hepatology.

### Phase 6: Scoring (Day 5, May 26)

Write `scoring_v2.py` that runs scoring against hcps_v2 + publications_v2 + hcp_therapeutic_areas_v2.

Methodology stays the same as v1.0 (composite_score, normalized_score, etc.).

**Quality gate:** Reject scoring for HCPs flagged in identity resolution or publication backfill.

**Acceptance:** Gulley scored as Established (not Rising Star). Sanyal scored as Established. Vivek Subbiah scored as Established. Rising Star cohort contains genuinely emerging researchers.

### Phase 7: NPPES + Open Payments enrichment (Day 5, May 26)

Re-run existing NPPES and Open Payments pipelines against hcps_v2. Existing scripts work as-is, only the target table changes.

**Acceptance:** Counts roughly match existing prod table.

### Phase 8: Social/DOL re-linking (Day 6, May 27)

Re-run `dol_matching.py` against hcps_v2. Update social_users and dol_matches to reference hcps_v2 IDs.

Apply manual dol_canonical_overrides for HCPs we know about (Gulley, Hwu, Planchard, etc.).

**Acceptance:** All 33 current verified DOLs successfully re-linked. No drop in DOL count.

### Phase 9: Narrative regeneration (Day 6-7, May 27-28)

Write `narrative_generation_v2.py` with corrected prompt template:
- Pre-rounds percentiles in Python (e.g., "97th percentile" not "97.63rd percentile")
- Includes sanity-check instruction to Claude
- Receives clean career data as inputs

Generate narratives for visible HCPs first (DOLs, Established, top Rising Stars). Then bulk-generate for everyone else.

**Acceptance:** Gulley's narrative correctly reflects his career as senior NCI immuno-oncology researcher. Rounded percentiles. No "50 pubs in one year" artifacts.

### Phase 10: Frontend switchover (Day 7, May 28)

Update frontend API functions to read from v2 tables. This is a coordinated atomic change — `getVerifiedDOLs`, `getTACounts`, `getHCPDetail`, etc. all switch over at once.

**Rollback plan:** Keep v1 tables intact for 7 days after switchover. If issues surface, revert frontend to v1.

**Acceptance:** Frontend loads cleanly from v2 data. Visible surfaces show corrected scores, narratives, cohorts.

### Phase 11: ASCO capture and cleanup (Day 8 onward, May 29+)

ASCO begins. Capture runs against the now-clean schema. New social_users/social_posts linked to clean hcps_v2 IDs.

NO architectural changes during ASCO week. Bug fixes only.

### Phase 12: Decommission v1 tables (After June 4)

After v2 has been stable for one week post-switchover, drop v1 tables.

---

## Risks and mitigations

### Risk 1: Pilot identifies methodology problems requiring redesign

**Likelihood:** Moderate
**Impact:** High — could blow up timeline

**Mitigation:** Pilot is intentionally small (50 HCPs) so problems surface fast. Each phase has explicit acceptance criteria. If acceptance fails, stop and fix before proceeding.

### Risk 2: PubMed disambiguation produces false positives at scale

**Likelihood:** Moderate-High — this is genuinely hard
**Impact:** Medium — affects publication counts and dates

**Mitigation:**
- Coauthor verification gate (publication's coauthors must overlap with HCP's OpenAlex shards)
- Quality flags for ambiguous cases
- Manual review queue for flagged HCPs (visible MSL-grade names)

### Risk 3: ASCO capture issues during rebuild week

**Likelihood:** Low if we lock foundation by May 28
**Impact:** High — ASCO is the demo data we need

**Mitigation:**
- Foundation rebuild MUST complete by May 28
- No architectural changes May 29 - June 2
- Daily monitoring of capture runs

### Risk 4: hcp_id references break in social_users/dol_matches

**Likelihood:** Moderate
**Impact:** Medium — broken DOL surface

**Mitigation:**
- Re-linking script (Phase 8) handles this explicitly
- All 33 verified DOLs validated post-link
- Keep v1 hcp_id values stored in social_users.legacy_hcp_id for rollback

### Risk 5: Frontend switchover causes user-facing breakage

**Likelihood:** Low (one person uses the app)
**Impact:** Low (no production users yet)

**Mitigation:** Test in dev mode first. Document v1 → v2 API function diff.

### Risk 6: We discover the rebuild itself has problems after ASCO

**Likelihood:** Possible
**Impact:** Variable

**Mitigation:** v1 tables stay for 7+ days post-switchover. Rollback always possible.

### Risk 7: Garrett's time runs short during rebuild week

**Likelihood:** Moderate — this is one person doing a foundation rebuild
**Impact:** Medium-High

**Mitigation:**
- Each phase is designed to be 1-day scope
- Acceptance criteria are explicit, so progress is verifiable
- Scripts are checkpointed/resumable so partial runs aren't wasted

---

## What success looks like

By May 28:
- hcps_v2 contains clean canonical records with multi-source identity resolution
- publications_v2 contains complete publication history
- Senior researchers (Sanyal, Loomba, Gulley, etc.) have career start years in their actual founding decades
- TA tagging is precise (no rare-cancer leaking into Rare Disease)
- DOLs are correctly linked
- Narratives are accurate and well-formatted
- Frontend switched over and rendering clean data

By June 11:
- ASCO data captured into clean schema
- Real DOL activity visible
- Narrative quality validated against ground-truth pilot
- Foundation issues no longer surfacing in feature work

By June 18 (demo-ready):
- Polish complete
- Confidence in showing the platform to external stakeholders
- Clear story for v1.1 (LinkedIn OAuth, MSL community verification, etc.)

---

## Open questions for Garrett

1. **Are the pilot 50 HCPs the right validation set?** Want to add or swap any?

2. **NPPES re-ingestion: complete refresh or incremental?** Full refresh is simpler but takes longer.

3. **Trial investigator linking strategy?** Same disambiguation hierarchy or different rules for trials?

4. **What happens to bluesky_capture.py?** Repurpose for handle discovery as a separate feature, or retire?

5. **MSL verification (v1.1)?** Specification implies this is parked. Confirming.

6. **Rollback policy beyond 7 days?** Drop v1 tables after one week of v2 stability, or longer?

---

## Notes for future iterations

This specification documents what we KNOW now. Some things may not be discoverable until execution. The right mindset:

- The specification is a working document, not a contract
- Phases can be expanded or compressed based on findings
- Quality gates can be tightened if quality is unexpectedly bad, or relaxed if unexpectedly good
- The strangler-fig pattern means we always have a rollback path
- The pilot validation set is the ground truth — when in doubt, check against it

The single most important principle is: validate against the pilot 50 before scaling anything. Most failure modes from the original ingestion would have been caught with this discipline. We're applying it consistently this time.

---

## Approval

Specification reviewed and approved for execution.

| Role | Name | Date | Notes |
|------|------|------|-------|
| Product/Engineering | Garrett | __________ | __________ |

Once approved, execution begins with Phase 1 (schema creation) on May 22.
