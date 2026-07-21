# INCREMENTAL PUB-REINGEST SEQUENCE (v1 — NSCLC)
Derived from TA_NEW_PLAYBOOK §1 (full-build order) + §3b (inventory) + the ordering rules in
§§193-214, 279-297. This is the INCREMENTAL cycle (weekly pub refresh), NOT the full TA build.
Difference from build: same stages, but (a) build-only stages dropped, (b) scope is the new pubs
/ affected TA rather than a from-scratch corpus. Ordering dependencies are IDENTICAL to build and
NON-NEGOTIABLE (violating them = the documented "ran out of sequence" bugs).

## NON-NEGOTIABLE ORDERING RULES (from ROADMAP)
- R1: career-metric derivation MUST run AFTER dedup (§214, §294 — de-inflating total_career_pubs
      before identity resolution harms fragmented KOLs).
- R2: cohort classification AFTER career metrics, BEFORE scoring (§297 "classify before cohort-scoring").
- R3: Step F scopes to ALL TA hcp_ids via --hcp-ids-file, NEVER --only-new-hcps (§283 — the latter
      buried 34% of AD's established cohort). Frozen-safe: only writes links for scoped HCPs to pubs
      their own OpenAlex ids appear on.
- R4: Step F BEFORE dedup; dedup's merger repoints publication_authors_v2 FKs (fixed today, §31i) so
      Step F links follow HCPs through merges. Consistent by construction.
- R5: openalex_pipeline must populate authorships BEFORE inventory Stage-1 flatten (author_pub_flat is
      what Step C reads).

## THE SEQUENCE
1. ✅ ingest_publications.py --ta nsclc --target-version v2   [DONE: 33 pubs, pubmed_authorships JSONB]
2. openalex_pipeline.py --target-version v2
   → enrich the new pubs → publications_v2.authorships. Idempotent via openalex_enriched_at scoping
     (§558) so it should only hit the 33 un-enriched. VERIFY it scopes to enriched_at IS NULL.
3. INVENTORY §3b Stage 1 — refresh author_pub_flat to include the 33 new pubs' authorships.
   (CREATE TABLE ... AS is a full rebuild of the derived flat table; or append the new pubs' rows.
    Must include new pubs before Step C, which reads author_pub_flat.)
4. INVENTORY §3b Stage 2 — upsert NSCLC authors into openalex_author_inventory.
   - corpus_pub_count = COUNT over author's FULL cross-TA flat footprint (no clobber).
   - scope WRITE to authors with source_ta_id = NSCLC, HAVING count>=3.
   - INSERT ... ON CONFLICT (openalex_author_id) DO UPDATE (insert new, update existing to full count).
   - DO NOT touch has_matching_hcp/matching_hcp_id in DO UPDATE (preserve Step B/C linkage).
   - DISCIPLINE: snapshot inventory (_pre_reingest_backup) FIRST; dry-run the scope as a COUNT; writes
     via terminal run_sql.py, not dashboard.
5. create_hcps_v2.py --incremental --target-version v2   [Step C — proven idempotent §31n]
   → creates only genuinely-new HCPs; emits provisional_new_hcps (= dedup candidates). Backfilled
     identity_hash (§31r) now makes layer-2 idempotency real → catches new-fragment-of-existing.
6. Step F: rebuild_publication_authors_v2.py --hcp-ids-file <ALL NSCLC hcp_ids> --execute   [R3!]
   → export: SELECT hcp_id FROM hcp_therapeutic_areas_v2 WHERE therapeutic_area_id=NSCLC → file.
   6b. Derive authorship position (is_first/is_senior) into publication_authors_v2 (§9b — REQUIRED,
       scorer signals dead without it).
7. DEDUP (10b): dedup_detect.py (read-only CSV) → review high-confidence → dedup_merge.py --dry-run
   → --execute. The enforced Step-C coupling. [R4: after Step F]
8. CAREER re-derivation (11): total_career_pubs (join-table COUNT --ta nsclc) + career_first_pub_year_v2
   on MERGED identities. [R1: after dedup]
9. cohort_classification_v2.py --ta nsclc --execute (11b). [R2: after career, before scoring]
10. scoring_pipeline.py + publication_leadership/network/pharma --ta nsclc (12). This is what the diff
    measures.
11. AFTER-SNAPSHOT + DIFF: reingest_diff.py --ta nsclc --snapshot (after) → --diff --before <8c7244a1...>
    --after <new>. = the "what changed" feed.

## DROPPED FROM BUILD (not needed for a pub-only incremental cycle)
- Stage 5 career_enrichment_from_clusters: folded into step 8 (career re-derivation post-dedup).
- Stage 7 step_b_matching: NPPES community only, not pub-driven.
- Stage 10 NPPES/OpenPayments/Medicare aggregators: different data sources; their own reingest cadence.
- Stage 13 narratives: nice-to-have, not needed to compute the diff (run later for new/changed HCPs).

## OPEN SCOPE QUESTION (v1 decision: whole-TA)
Stages 6/8/9/10 run --ta nsclc = WHOLE-TA scope (~80K HCPs), not affected-HCPs-only. This is what the
scripts natively support (flags are --ta, not --hcp-ids for scoring). Correct + consistent, just not
minimal. Affected-HCP-only scoping = a later optimization requiring script changes. v1 = whole-TA.

## STILL-UNVERIFIED BEFORE RUNNING (check each script, don't assume)
- Step 2: does openalex_pipeline scope to un-enriched pubs, or re-enrich all? (enriched_at IS NULL?)
- Step 3: rebuild author_pub_flat fully, or append? (full rebuild simplest; confirm Step C reads it fresh)
- Step 6: Step F's --hcp-ids-file flag exists + --execute semantics (per §283 it does)
- Step 8/9: exact script names/flags for career re-derivation + cohort_classification_v2 (--ta/--execute)
- Each: --target-version v2 routing present
