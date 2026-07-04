# Step C Rewrite Specification — `create_hcps_v2.py`

**Purpose:** Clean v2 rewrite of `run_step_c_create_hcps.py` (archived, v1-shaped). Creates canonical HCP
identities from the OpenAlex author inventory via multi-shard clustering. **PRESERVE THE CLUSTERING
ALGORITHM EXACTLY** (it encodes hard-won anti-conflation knowledge — Shoji/Zhang-Wei problem). Rewrite
only the *implementation* for clean v2 code and known-clean inputs.

**This is the platform's identity-resolution engine. Getting clustering wrong = conflation (distinct
researchers merged) or fragmentation (one person split into many). Both are unacceptable.**

---

## Inputs (already built, verified July 3 2026)

1. **`openalex_author_inventory`** (shared table, one row per OpenAlex author id):
   `openalex_author_id (text, full URL), display_name, last_known_institution,
    last_known_institution_ror, orcid, corpus_pub_count, first_seen_pub_year, last_seen_pub_year,
    has_matching_hcp (bool), matching_hcp_id (uuid)`.
   Only authors with `corpus_pub_count >= 3` are present. ~253k rows.

2. **`author_pub_flat`** (staging table, one row per author-publication appearance — USE THIS instead of
   re-parsing JSONB): `author_id (full URL), pub_id, pub_year, source_ta_id, display_name, orcid,
   institution, institution_ror`. Indexed on `author_id` and `source_ta_id`. ~3.17M rows.

## Outputs (v2 schema — exact columns)

1. **`hcps_v2`** — ONE row per canonical person. Key columns the script MUST populate:
   `id (uuid, gen_random_uuid), identity_hash (text, UNIQUE NOT NULL — MUST be written),
    first_name, middle_name, last_name, preferred_display_name, orcid,
    institution_normalized, institution_raw, institution_canonical, country,
    career_first_pub_year, total_career_pubs, latest_pub_year,
    identity_confidence_score, identity_method, created_at, updated_at, ingestion_run_id`.
   Do NOT rely on `hcps_v2.openalex_author_id` (truth lives in the link table below).

2. **`hcp_openalex_authors_v2`** — N shard links per HCP (composite PK `(hcp_id, openalex_author_id)`,
   NO `id` column): `hcp_id, openalex_author_id, is_primary (bool), match_confidence (numeric),
    match_method (text), first_seen_pub_year, last_seen_pub_year, corpus_pub_count, linked_at`.

## CLUSTERING ALGORITHM — PRESERVE EXACTLY (this is the IP)

Group OpenAlex author-id shards into canonical people using these rules, in priority order:

1. **ORCID match (highest confidence).** Shards sharing a non-null ORCID → same person. `match_method =
   'orcid'`, `match_confidence = 1.0`. ORCID is authoritative; never split shards with the same ORCID.

2. **Normalized-name + institution match.** For shards WITHOUT a shared ORCID: cluster when
   `normalized_name` matches AND they share an institution (same ROR) OR institution-name similarity is
   high. `match_method = 'name_institution'`, confidence per the similarity score.
   - `normalized_name`: lowercase, strip non-alpha except spaces/hyphens/apostrophes, collapse whitespace.
   - Name similarity via `SequenceMatcher` ratio; institution via ROR exact-match preferred, else name similarity.

3. **ANTI-CONFLATION GUARD (critical — this prevents Shoji/Zhang-Wei).** Do NOT merge shards on name
   alone. A shared common name (e.g. many distinct "Wei Zhang" / "Shoji" researchers) with DIFFERENT
   institutions and NO shared ORCID → KEEP SEPARATE as distinct people. Require institutional or ORCID
   corroboration for any merge. When in doubt, DO NOT merge (fragmentation is recoverable; conflation
   corrupts scoring irreversibly).

4. **Confidence threshold.** Only merge above the confidence threshold (preserve the original's value —
   name+institution merges need a high combined score). Below threshold → separate HCPs.

## identity_hash (UNIQUE NOT NULL — must be written or every insert fails)

Compute a stable hash for each canonical person:
- If the cluster has an ORCID: hash the ORCID (canonical form).
- Else: hash `normalized_name || '|' || institution_ror` (or normalized institution name if no ROR).
- Must be deterministic and unique per person. Use sha256 hex. **Every hcps_v2 insert MUST set this.**

## Per-HCP field derivation

- `total_career_pubs` = sum of the cluster's shards' `corpus_pub_count` (from inventory), OR distinct
  pub_id count across the cluster's shards in `author_pub_flat` (prefer the latter — avoids double-count
  if shards share pubs). **Decide and document which; distinct-pub-count is more correct.**
- `career_first_pub_year` / `latest_pub_year` = min / max pub_year across the cluster's flat rows.
- `first_name`/`last_name` = parsed from the most-frequent display_name in the cluster.
- `institution_*` = most-frequent institution/ROR across the cluster.
- `identity_confidence_score` = the clustering confidence; `identity_method` = how it was clustered.
- `preferred_display_name` = most-frequent display_name.

## Link-table rows

For each shard in a cluster, one `hcp_openalex_authors_v2` row: `hcp_id` (the new HCP),
`openalex_author_id` (the shard), `is_primary` (true for the highest-corpus shard), `match_confidence`,
`match_method`, `first_seen_pub_year`/`last_seen_pub_year`/`corpus_pub_count` (from that shard).

## Flags / CLI

- `--target-version v2` (route to `_v2` tables; shared tables — inventory — stay hardcoded).
- `--dry-run` (compute clusters, print stats, WRITE NOTHING).
- `--limit N` (process only N inventory authors — for testing).
- `--ta <slug>` (OPTIONAL scoping: only cluster authors appearing in that TA — but compute
  total_career_pubs from FULL cross-TA footprint, per the single-identity architecture). If omitted,
  cluster the whole inventory.

## v2 GOTCHAS (do not reintroduce v1 bugs)

- `hcp_openalex_authors_v2` has composite PK, NO `id` column. Existence checks must not `select("id")`.
- Do NOT add a UNIQUE constraint on `hcps_v2.openalex_author_id` (one OpenAlex id can map to multiple
  HCPs ~4.6% misattribution; one HCP can have multiple ids). Truth is the link table.
- Case-insensitive lookups: use `last_name_lower`/`state_lower` generated columns with `.eq()`, never
  `ILIKE` on raw columns (Supabase timeouts).
- Partial updates: `.update().eq()`, not `.upsert()`.
- Writes via direct connection / batched; not one giant transaction (see delete-timeout lessons).
- NPPES enrichment is a SEPARATE later step — Step C creates HCPs + OpenAlex links ONLY. Do NOT
  interleave NPPES matching into Step C (the v1 script did; it's a separate workstream). Step C does
  NOT tag TAs either (that's ta_tagging_rebuild_v2.py).

## VALIDATION (run after dry-run, before trusting)

1. **No conflation:** no single HCP should aggregate an implausible pub count from name-collision. Spot-
   check the highest-`total_career_pubs` HCPs — are they real prolific researchers or merged distinct people?
2. **No fragmentation of known KOLs:** Guttman-Yassky, Silverberg, Simpson, Eichenfield, Paller, Blauvelt,
   Bissonnette, Thaci, Deleuran should each resolve to ONE HCP (or a small, correct number of shards under
   one HCP), not be split across many HCP rows.
3. **The 172 preserved HCPs:** if re-clustered, they should reproduce sensibly (they're real Hep/NSCLC
   researchers). Cross-check.
4. **Counts:** number of HCPs created should be well below the number of inventory authors (clustering
   reduces shards→people). If HCPs ≈ authors, clustering isn't merging (bug). If HCPs ≪ authors by too
   much, over-merging (conflation — worse).
