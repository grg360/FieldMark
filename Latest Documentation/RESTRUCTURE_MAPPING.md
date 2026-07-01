# FieldMark Repo Root Restructure — Mapping

**Generated:** 2026-06-30
**Source inventory:** `script_inventory.txt` (168 files at repo root)
**Purpose:** Every root-level file mapped to a target directory. Review the confidence column, mark up disagreements, then we generate the Cursor prompt from the confirmed set.

---

## Proposed Directory Structure

```
FieldMark/
├── scripts/
│   ├── ingest/           # raw data pulls from external sources
│   ├── enrich/           # add data to existing HCPs via APIs
│   ├── aggregate/        # HCP-level rollups from raw data
│   ├── classify/         # label/tag HCPs, trials, themes
│   ├── score/            # scoring + ranking
│   ├── narrative/        # Claude API text generation
│   ├── social/           # social media / web presence
│   ├── dedup/            # duplicate detection + merge
│   ├── seed/             # demo/mentor data generators
│   ├── config/           # (Phase 0 target: per-TA JSON configs)
│   ├── utilities/        # audits, diagnostics, orchestration, backfills
│   └── archive/
│       ├── npm_shims/                        # empty .ps1 placeholders
│       ├── hepatology_workstream_2026_05/    # run_step_* one-shot
│       ├── superseded/                       # older versions of active scripts
│       ├── one_shot_backfills/               # completed backfill sequences
│       └── tests_and_scratch/                # test.py, flatted.py, ad-hoc tests
├── sql/
│   ├── migrations/       # date-prefixed schema evolution
│   └── schema/           # base schema, RLS policies, RPCs
```

**Confidence key:** ✅ confirmed · ❓ confirm-please · 🗄️ archive?

---

## `scripts/ingest/` — raw data pulls

| Script | Confidence | Notes |
|---|---|---|
| pubmed_pipeline.py | ✅ | Catalog entry |
| pubmed_backfill_rebuild.py | ✅ | Catalog entry |
| ingest_publications.py | ✅ | Helper for pubmed_pipeline |
| trials_pipeline.py | ✅ | Catalog entry |
| nppes_workstream_b_ingest.py | ✅ | Catalog entry |
| nppes_workstream_b_dryrun.py | ✅ | Dry-run of above |
| ingest_nih_grants.py | ❓ | New since catalog — NIH RePORTER ingest, mentioned in roadmap |
| open_payments_filter.py | ❓ | Raw CMS Open Payments filter/prep — could be aggregate/ but feels like ingest prep |
| medicare_filter.py | ❓ | Same reasoning as above |

## `scripts/enrich/` — add data via APIs

| Script | Confidence | Notes |
|---|---|---|
| openalex_pipeline.py | ✅ | Catalog entry |
| openalex_author_enrichment.py | ✅ | Catalog addendum — writes hcp_author_metrics_v2 |
| openalex_multi_shard_linker_rebuild.py | ✅ | Catalog entry |
| career_enrichment_from_clusters.py | ✅ | Catalog says active (replacement for career_enrichment.py) |
| targeted_nppes_enrichment.py | ✅ | Catalog entry |
| nppes_api_backfill.py | ✅ | Catalog entry |
| community_nppes_backfill.py | ✅ | Catalog entry |
| match_nih_investigators.py | ❓ | New since catalog — NIH match |
| backfill_trial_investigators.py | ❓ | New since catalog — could also be utilities |
| institution_geo_backfill_openalex.py | ✅ | Institution enrichment |
| institution_geo_backfill_ror.py | ✅ | Institution enrichment |
| map_nppes_to_ror.py | ✅ | Catalog entry |
| enrich_ror_to_country.py | ✅ | Catalog entry |
| institution_cleaner.py | ❓ | Older (April), could be utilities |
| inventory_openalex_authors.py | ❓ | Could also be utilities/audit — depends on whether it writes back |

## `scripts/aggregate/` — HCP-level rollups

| Script | Confidence | Notes |
|---|---|---|
| open_payments_aggregator.py | ✅ | Catalog entry — writes 4 tables |
| medicare_aggregator.py | ✅ | Catalog entry |
| compute_top_collaborators.py | ❓ | Aggregates collaborator counts — could be score/ |

## `scripts/classify/` — label/tag entities

| Script | Confidence | Notes |
|---|---|---|
| community_classification.py | ✅ | Catalog entry |
| trial_ta_mapping.py | ✅ | Classifies trials into TAs |
| trial_investigator_matcher.py | ✅ | Links investigators to HCPs |
| hcp_institution_linker.py | ✅ | Catalog entry |
| hcp_industry_classifier.py | ❓ | New since catalog |
| ta_tagging_rebuild_v2.py | ✅ | Rebuilds hcp_therapeutic_areas |
| bucket_themes.py | ❓ | Theme classification |
| extract_research_themes.py | ❓ | Could be classify/ or narrative/ — depends on output |

## `scripts/score/` — scoring + ranking

| Script | Confidence | Notes |
|---|---|---|
| scoring_pipeline.py | ✅ | Rising Star engine — catalog entry |
| established_scoring.py | ✅ | Catalog entry |
| community_scoring.py | ✅ | Catalog entry |
| rising_star_scoring.py | ❓ | **Question:** how does this relate to `scoring_pipeline.py`? Same thing renamed, or additional? |
| network_momentum_scoring.py | ✅ | Component score |
| scientific_momentum_scoring.py | ✅ | Component score |
| network_centrality_scoring.py | ✅ | Component score |
| pharma_engagement_scoring.py | ✅ | Component score |
| publication_leadership_scoring.py | ✅ | Component score |
| score_ranking.py | ❓ | Ranks after scoring? |
| recompute_established_ranks_v3.py | ✅ | Rank recomputation for Established |
| rerun_ranks.py | ❓ | Small (0.8KB) — helper or ad-hoc? |

## `scripts/narrative/` — Claude API text generation

| Script | Confidence | Notes |
|---|---|---|
| generate_narratives_v2.py | ✅ | Catalog addendum — the live narrative generator |
| generate_community_narratives.py | ✅ | Community-specific, worked heavily today |
| generate_scientific_position_synthesis.py | ✅ | Belief Profile synthesis |
| extract_scientific_positions.py | ❓ | Could be narrative/ or classify/ — extracts positions from pubs |

## `scripts/social/` — social + web presence

| Script | Confidence | Notes |
|---|---|---|
| twitter_capture.py | ✅ | Twitter capture |
| twitter_enrichment.py | ✅ | Catalog entry |
| bluesky_capture.py | ✅ | Bluesky capture |
| bluesky_enrichment.py | ✅ | Catalog entry |
| scholar_enrichment.py | ✅ | Catalog entry |
| dol_matching.py | ❓ | New since catalog — DOL identification |
| social_daily.py | ❓ | Orchestration for daily runs — could be utilities |
| social_update.py | ❓ | Purpose unclear |
| social_cleanup_stage1.py | ❓ | Older (May 5) — active or archive? |
| social_cleanup_stage2.py | ❓ | Same question |
| extract_web_signals.py | ✅ | Web signal extraction |
| extract_external_links.py | ✅ | Link extraction |
| scrape_leadership_signals.py | ✅ | Leadership scraping |

## `scripts/dedup/` — duplicate detection + merge

| Script | Confidence | Notes |
|---|---|---|
| dedup_detect.py | ✅ | Catalog entry — May 26 strict-criteria version |
| dedup_merge.py | ✅ | Catalog entry — Approach A smart merge |

## `scripts/seed/` — demo/mentor data

| Script | Confidence | Notes |
|---|---|---|
| generate_seed_insights.py | ✅ | Demo insights generator |
| generate_seed_followups.py | ✅ | Demo follow-ups generator |

## `scripts/config/` — (Phase 0 target)

Currently empty. This is where the config refactor produces `therapeutic_areas/nsclc.json`, `therapeutic_areas/atopic_dermatitis.json`, and `settings.py` with the `load_ta_config()` function.

| Script | Confidence | Notes |
|---|---|---|
| pubmed_queries.py | ❓ | Currently holds `PUBMED_QUERY_NSCLC_US` etc. as Python constants. Will be **replaced** by JSON config in refactor. Move to config/ now as landing spot, or leave in ingest/ as helper until refactor lands? |

## `scripts/utilities/` — audits, diagnostics, orchestration

| Script | Confidence | Notes |
|---|---|---|
| ta_audit.py | ✅ | TA data audits |
| audit_ta.ps1 | ✅ | The audit script used today |
| quick_commit.ps1 | ✅ | Git helper |
| backup_supabase.ps1 | ✅ | DB backup |
| find_block.ps1 | ✅ | Grep helper |
| take_weekly_snapshot.py | ✅ | Weekly snapshot orchestration |
| export_telescope_data.py | ✅ | Data export |
| backfill_publication_titles.py | ✅ | One-off backfill (June 24) |
| backfill_belief_claim_titles.py | ✅ | One-off backfill (June 23) |
| npi_gap_audit.py | ✅ | Audit |
| nppes_diagnostic.py | ✅ | Catalog entry |
| diagnostic_provider_types.py | ✅ | Diagnostic |
| parquet_sanity_check.py | ✅ | Sanity check |
| quick_csv_tail_check.py | ✅ | Utility |
| inspect_medicare_headers.py | ✅ | Utility |
| inspect_op_headers.py | ✅ | Utility |
| nppes_matcher.py | ❓ | Catalog says match logic — enrich helper or utility? |
| nppes_filter.py | ❓ | Same question |
| nppes_organizations_filter.py | ❓ | Same |
| nppes_org_dryrun.py | ❓ | Same |
| institution_openalex_validation.py | ✅ | Institution QA |
| institution_nppes_validation.py | ✅ | Institution QA |
| institution_ror_validation.py | ✅ | Institution QA |
| spot_check_narratives.py | ✅ | QA |
| validate_leadership_scraping.py | ✅ | QA |
| social_quality_audit.py | ✅ | QA |
| dedup_dryrun_spotcheck.py | ✅ | Dedup QA |
| verify_dedup_state.py | ✅ | Dedup QA |
| categorize_dedup_failures.py | ✅ | Dedup QA |

---

## `scripts/archive/`

### `archive/npm_shims/` — the empty .ps1 files

All ~30 files at 0.8KB dated 2026-04-29 with npm-tool names. Get-Content returned empty for spot-checked samples (vite.ps1, tsc.ps1). Not scripts you wrote — some npm install artifact. Archive rather than delete for safety.

```
acorn.ps1, autoprefixer.ps1, browserslist.ps1, cssesc.ps1, esbuild.ps1,
eslint.ps1, glob.ps1, jiti.ps1, js-yaml.ps1, jsesc.ps1, json5.ps1,
loose-envify.ps1, nanoid.ps1, node-which.ps1, parser.ps1, resolve.ps1,
rollup.ps1, semver.ps1 (×2), sucrase-node.ps1, sucrase.ps1, tailwind.ps1,
tailwindcss.ps1, tsc.ps1, tsserver.ps1, update-browserslist-db.ps1,
vite.ps1, yaml.ps1
```

### `archive/hepatology_workstream_2026_05/` — completed one-shot

The `run_step_*` family. Explicitly Hepatology-tagged, contains destructive Step D wipe. Already ran.

```
preview_step_b_matching.py, run_step_b_matching.py, run_step_b_plus_reconcile.py,
run_step_c_create_hcps.py, reconcile_step_c_duplicates_diagnostic.py,
reconcile_step_c_duplicates_apply.py, run_step_d_wipe.py,
run_step_f_rebuild_publication_authors.py
```

### `archive/superseded/` — older versions with named replacements

| Script | Superseded by | Source |
|---|---|---|
| career_enrichment.py | career_enrichment_from_clusters.py | Catalog |
| npi_enrichment.py | targeted_nppes_enrichment.py | Catalog |
| nppes_enrichment.py | targeted_nppes_enrichment + nppes_api_backfill + community_nppes_backfill | Catalog |
| claude_layer.py | generate_narratives_v2.py | Catalog addendum |
| narrative_pipeline.py | generate_narratives_v2.py | Inferred |
| dedup_detection.py | dedup_detect.py | Catalog |
| hcp_dedup_merge.py | dedup_merge.py | ❓ Best guess — confirm |
| hcp_dedup_remediation.py | dedup_merge.py | ❓ Same |
| hcp_merge_pipeline.py | dedup_merge.py | ❓ Same |
| dedupe_audit.py | dedup_detect.py? | ❓ Same |
| scholar_overnight.py | scholar_enrichment.py | ❓ Best guess |
| openalex_publications.py | openalex_pipeline.py + openalex_author_enrichment.py | ❓ Best guess |
| scoring_pipeline_v1_3_backup.py | scoring_pipeline.py (current) | Name says "backup" |
| affiliation_profiler.py | Nothing — column doesn't exist in v2 | Catalog says v1-era |

### `archive/one_shot_backfills/` — completed backfills

```
publication_backfill_phase1.py
publication_backfill_phase2.py
publication_backfill_phase3.py
enrich_chunks.ps1              # handover: "DO NOT chunk this via offset"
```

### `archive/tests_and_scratch/`

```
test.py                # 2.1KB scratch
flatted.py             # JS library name — leaked in somehow
test_credentials.py    # small, one-off
test_rank_batch.py     # ad-hoc test
test_rank_write.py     # ad-hoc test
test_nih_reporter.py   # ad-hoc test
```

---

## `sql/migrations/` — date-prefixed schema evolution

```
20260611220554_add_category_and_pub_metadata_to_hcp_scientific_positions_v1.sql
20260611210458_create_hcp_scientific_positions_v1.sql
2026-05-28_create_hcp_author_metrics_v2.sql
2026-05-27_create_hcp_score_ranks_v2.sql
2026_05_28_get_established_filtered_v3.sql
2026_05_31_backfill_conversation_id.sql
2026_05_31_reply_capture_schema.sql
2026_06_01_hcps_v2_add_nih_profile_id.sql
2026_06_01_nih_reporter_schema.sql
2026_06_03_hcp_research_themes_v2.sql
```

Plus the `phase1_addendum_*` files, which are effectively migrations:

```
phase1_addendum_2_publications_ta.sql
phase1_addendum_3_publications_v2_correction.sql
phase1_addendum_4_authorships_column.sql
phase1_addendum_4_schema_reconciliation.sql
phase1_addendum_5_openalex_enrichment_columns.sql
phase1_addendum_5_trial_investigator_proposals.sql
phase1_addendum_6_clinical_trials_and_investigators.sql
phase1_addendum_6_medicare_and_affiliation.sql
phase1_addendum_7_dol_social.sql
phase1_addendum_8_hcps_v2_nullability.sql
phase1_addendum_9_publication_count_constraint.sql
```

Plus:

```
add_npi_taxonomy_specialty.sql
backfill_progress_schema.sql
extend_rpcs_themes.sql
theme_canonical_schema.sql
```

## `sql/schema/` — base schema, RLS, reference data

```
schema.sql
schema2.sql
phase1_schema.sql
phase1_rls_policies.sql
regions_config_load.sql
us_institution_state_lookup.sql
```

---

## Summary Counts

| Destination | Files |
|---|---:|
| scripts/ingest/ | 9 |
| scripts/enrich/ | 15 |
| scripts/aggregate/ | 3 |
| scripts/classify/ | 8 |
| scripts/score/ | 12 |
| scripts/narrative/ | 4 |
| scripts/social/ | 13 |
| scripts/dedup/ | 2 |
| scripts/seed/ | 2 |
| scripts/config/ | 0–1 |
| scripts/utilities/ | 29 |
| scripts/archive/ | ~60 |
| sql/migrations/ | 25 |
| sql/schema/ | 6 |
| **Total** | **~168** |

---

## Questions Needing Your Call Before Cursor Prompt

1. **`rising_star_scoring.py` vs `scoring_pipeline.py`** — same thing renamed, additional, or one supersedes the other?
2. **`nppes_matcher.py`, `nppes_filter.py`, `nppes_organizations_filter.py`, `nppes_org_dryrun.py`** — enrich helpers or utilities?
3. **`open_payments_filter.py`, `medicare_filter.py`** — ingest or aggregate?
4. **`extract_research_themes.py`** — classify or narrative?
5. **`extract_scientific_positions.py`** — narrative or classify?
6. **`compute_top_collaborators.py`** — aggregate or score?
7. **`pubmed_queries.py`** — move to config/ now or leave until refactor?
8. **Superseded confirmations:** `hcp_dedup_merge.py`, `hcp_dedup_remediation.py`, `hcp_merge_pipeline.py`, `dedupe_audit.py`, `scholar_overnight.py`, `openalex_publications.py`, `inventory_openalex_authors.py`, `institution_cleaner.py`, `social_cleanup_stage1/2.py`, `social_update.py`, `social_daily.py` — active or archive?

Once these are called, the Cursor prompt writes itself: create the directory tree, then a batched `git mv` for each destination.
