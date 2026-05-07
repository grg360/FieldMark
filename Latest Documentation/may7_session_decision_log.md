# May 7 Session — Decision Log and State Snapshot

**Author:** Garrett with Claude as technical thought partner  
**Session:** May 7, 2026, full working day  
**Status:** Phase 1 publication backfill currently EXECUTING (~90-120 min wall-clock). Other work paused for evening family time. Resume planned for evening session.

---

## What was accomplished today

This was a longer day than expected. Three major workstreams completed, plus significant strategic discovery and architecture documentation.

### Morning workstream — GitHub backups and Supabase backups

Setting the project up to be safely shareable and backed up.

- **GitHub repository created and pushed.** Private repo at https://github.com/grg360/FieldMark.git. Eleven commits covering Open Payments pipeline, Medicare pipeline, dedup remediation, NPPES Workstream A/B, schema/SQL, frontend changes, documentation, and helper scripts. Total ~6,000 lines committed.
- **Pre-commit hook installed.** Phase 1 filename pattern check, Phase 2 content pattern check on staged additions. Tested and verified blocking works.
- **Comprehensive .gitignore.** Excludes credentials, Python artifacts, OS metadata, frontend build dirs, all data dirs (Medicare, OpenPayments, NPPES, www), backup files, parquet/csv/zip files, checkpoint files.
- **quick_commit.ps1 helper script.** Single-command commit + push pattern. Tested clean tree detection, normal commits, pre-commit hook integration.
- **Supabase backup script and first backup.** Pro plan with 7-day daily automated backups already running. PITR add-on (~$100/mo) deferred. Created backup_supabase.ps1 using PostgreSQL 17.9 pg_dump. First backup: 312.5 MB at C:\Users\garre\Desktop\FieldMark\backups\fieldmark_backup_2026-05-07_064618.dump. Verified with pg_restore --list — all 23 public schema tables captured cleanly.
- **Credential rotation.** Discovered .env had been committed to git history multiple times (April 27, April 30 commits). Rotated database password and service role key. Supabase migrated from JWT format eyJ... to opaque secret-prefixed (sb prefix) format during rotation. Updated local .env with new key. Verified scripts still work via Python supabase client connection test.

### NPPES enrichment workstream

Adding real signals (not placeholders) for practice setting and career stage to the 30,093 cohort HCPs with NPIs.

- **NPPES filter extension.** Modified nppes_filter.py to add organization_name_legal, organization_name_other, is_sole_proprietor fields. Re-ran against 11.4 GB CSV producing 7,220,969 individual providers parquet.
- **NPPES organizations parquet.** Built nppes_organizations_filter.py mirroring the individual filter, output 1,914,967 active organizations at 98 MB.
- **Organization cross-reference logic.** Built nppes_org_dryrun.py to validate matching strategy. 8/8 cohort canonicals matched. Discovered need for selection logic when multiple organizations share an address (e.g., UCSD has many sub-departmental NPI entries; we need to pick the canonical "University of California San Diego" entry, not "UCSD MED-CYTOGENETICS").
- **Schema migration on hcps.** Added 14 NPPES enrichment columns: nppes_enumeration_date, nppes_is_sole_proprietor, nppes_practice_address/city/state/zip, nppes_organization_name, nppes_organization_npi, nppes_organization_match_quality, nppes_co_located_npi_count, nppes_practice_setting, nppes_career_stage, nppes_career_stage_years, nppes_enriched_at.
- **Practice setting derivation, three iterations.** First version had ordering bug (is_sole_proprietor checked first overrode academic patterns). Second version expanded AMC patterns from "UNIVERSITY OF" only to also catch UCSD, UCLA, UCSF, INDIANA UNIVERSITY, CLARIAN, REGENTS OF, TRUSTEES OF, etc. Third version reordered: AMC → hospital → group → sole proprietor → co-located fallback → unknown. Final canonical results: Loomba, Garassino, Chalasani all correctly classified as academic_medical_center.
- **Career stage derivation.** NPI enumeration date proxy with publication first-year fallback for early NPI adopters (2005-2007 enumeration dates). The fallback discovered the publication data foundation problem (see below).
- **NPPES enrichment to Supabase.** First execute attempt failed with "Could not find the 'hcp_id' column" — payload key needed to be `id` not `hcp_id`. Second attempt failed with not-null constraint on last_name during INSERT phase of upsert. Third attempt switched from upsert to per-row UPDATE which worked. Final results: 30,089 of 30,093 HCPs enriched (99.987%). Only 4 failures from connection blips.

### Publication architecture workstream — discovery and design

Career stage derivation surfaced a structural data foundation issue. Workstream pivoted to architectural redesign.

**Discovery phase:**

- 92,587 HCPs in our database have publications, but only 8,891 of the 30,093 cohort HCPs (with NPIs) have publications linked. 21,202 cohort HCPs have zero publications.
- 21,204 of the cohort HCPs were added "this week" via NPPES Workstream B; 0.009% have publications. The publication ingestion pipelines have not been triggered for the new community HCP cohort.
- Loomba shows 77 publications linked to his hcp_id, but his name appears in 1,037 publications across the entire database. Co-authored papers are systematically losing 60-90% of their HCP linkage.
- The publications schema uses one-to-many model (one HCP per publication via hcp_id foreign key), but publications are inherently many-to-many (multiple authors per paper, multiple papers per author).
- The publication ingestion pipelines (pubmed_pipeline.py, openalex_pipeline.py) have time windows configured: PUBMED_DAYS_BACK defaults to 1460 days (4 years). This was an intentional choice when the platform's primary use case was rising star detection.

**Distribution check confirmed the recency bias:**
- Pre-2020 publications: 13,580 (7%)
- 2024-2026 publications: 155,189 (81%)

**Strategic positioning resolved:**

The discovery led to a strategic conversation about whether FieldMark needs:
- **Vision A** — Rising-star-focused (3-year window, recent activity is the signal)
- **Vision B** — Comprehensive HCP intelligence (full bibliography, deep historical depth)

You chose to build for both: deep historical bibliography for community HCP track (where credibility requires comprehensive history) AND recent velocity for rising star track. Single ingestion path serves both — different SQL/weights at query time, not different ingestion strategies.

This mirrors the two-track scoring methodology (composite scoring methodology document) and is internally consistent with the strategic priorities surfaced over the past several days.

**Architecture decisions:**

1. OpenAlex as primary publication source, PubMed as secondary verification
2. Author-ID-based ingestion (not name-based) — uses OpenAlex's stable unique author identifiers
3. Many-to-many relational model via new `publication_authors` join table
4. Unified deep-bibliography ingestion strategy
5. Schema additions to `hcps`: openalex_author_id, orcid, openalex_resolved_at, openalex_resolution_method, openalex_resolution_confidence
6. Five-phase migration plan: schema migration + join backfill (Phase 1), OpenAlex author ID resolution (Phase 2), full bibliography ingestion (Phase 3), pipeline consolidation (Phase 4), citation enrichment (Phase 5)

**Documentation:**

- Composite scoring methodology document landed (418 lines): Latest Documentation/composite_scoring_methodology.md
- Publication data architecture document landed (383 lines): Latest Documentation/publication_data_architecture.md

### Phase 1 publication backfill — current execution

Implementation of Phase 1 of publication architecture migration. Currently EXECUTING.

**What it does:**
- Step 1: Resolves OpenAlex author IDs for HCPs by examining their already-linked publications' authorships JSON. Voting + confidence aggregation.
- Step 2: Walks all 145K publications with authorships, links them to all cohort HCP authors via OpenAlex ID matching, populates the publication_authors join table.

**Dry-run final results (validated before execute):**
- 147,589 publications analyzed (up from 96K in earlier broken runs — pagination ordering fix revealed full cohort)
- 67,233 HCPs with at least one vote
- 65,570 HCPs with OpenAlex IDs resolved (much larger than initial 41K estimate)
- 46,862 high-confidence + 18,708 medium-confidence + 0 low-confidence
- 1,663 ambiguous (correctly skipped, no false positives)

**Canonicals projected:**
- Loomba: 77 → 963 publication_authors rows (12.5x expansion)
- Garassino: 8 → 192 rows (24x expansion)
- Chalasani: 14 → 121 rows (8.6x expansion)

All three canonicals at high confidence after the confidence calculation improvement (≥80% high-confidence votes for the winning OpenAlex ID).

**Estimated total publication_authors rows after execute:** 400K-700K rows (calibrated up from initial 200K-500K estimate based on actual cohort size).

**Currently running. Wall-clock estimate: 90-120 minutes total.**

---

## Decisions made today and why

### Decision: Vision B (deep bibliography for both tracks)

**Decision:** Build publication architecture that supports comprehensive bibliographies for community HCPs AND recent velocity for rising stars. Single ingestion path; different query patterns.

**Rationale:** Community HCP profiles need credibility (comprehensive history) to defend against scrutiny. Rising star detection needs historical baseline to distinguish accelerating trajectories from senior figures with thin recent activity. Both use cases share the same data store.

### Decision: OpenAlex primary, author-ID-based ingestion

**Decision:** OpenAlex becomes canonical publication source. All ingestion goes through OpenAlex author IDs.

**Rationale:** OpenAlex provides stable, globally unique author identifiers (e.g., A5052059601 for Loomba) that solve the author disambiguation problem permanently. PubMed E-utilities returns author names as strings without identifiers, leading to "J Smith" vs other "J Smiths" matching errors. OpenAlex is free, has generous rate limits (10 req/sec polite pool), and provides full author bibliographies via author ID queries.

### Decision: Many-to-many model via join table

**Decision:** New publication_authors table with (publication_id, hcp_id) unique constraint, replacing the one-to-many model where each publication has one hcp_id.

**Rationale:** Publications have multiple authors. The current one-to-many model loses 60-90% of HCP linkages for co-authored papers. Loomba's actual involvement on 1,037 papers reduces to 77 linked records under his hcp_id. The join table model captures the reality.

### Decision: Trust existing hcp_id linkages

**Decision:** Use existing publication.hcp_id assignments as ground truth for OpenAlex ID extraction. Don't re-evaluate every linkage.

**Rationale:** Spot check of Loomba's 77 linked publications showed 90%+ have his name in the authorships. The pipeline that assigned hcp_id was conservative-but-correct. We're not introducing more error by trusting it; we're just expanding what's visible.

### Decision: Confidence calculation should be percentage-based, not strict-AND

**Decision:** Resolution confidence is "high" if ≥80% of votes are high-confidence; "medium" if 50-79%; "low" if <50%. Replaces the original "ALL votes must be high to be high" logic.

**Rationale:** Loomba had 60+ exact-name matches but 5 medium-confidence variant matches (e.g., "R Loomba"). The strict-AND rule labeled him medium overall, which understated actual confidence. Percentage-based labeling represents what we actually know about each match.

### Decision: Deterministic pagination via .order("id") on hcps fetch

**Decision:** Add .order("id") back to the hcps fetch in fetch_all_pages.

**Rationale:** Without ordering, PostgREST page boundaries shifted between runs. The first dry-run found 41K HCPs; the second found 42K with Chalasani missing. The ordering ensures deterministic results across runs. Adding it back to publications fetches caused timeouts (publications.authorships is JSONB-heavy), so publications stay on direct Postgres without ordering — that's fine because we aggregate to dicts where order doesn't matter.

### Decision: Track switch as primary UX gate (not filter)

**Decision:** Top-level Rising Stars / Community toggle. Filters apply within the selected view.

**Rationale:** Different cognitive frames serve different MSL tasks. Mixing them with filter primitives creates clutter. The track switch is a clean mental commitment that lets each track present a focused, sophisticated filtering experience.

### Decision: Dark Horse extends to both tracks

**Decision:** Dark Horse is a cross-track status marker. Same purple visual treatment. Different qualification criteria per track.

**Rationale:** Both tracks have an "exceptional within track" concept. Both serve the platform's core thesis ("find HCPs traditional databases miss"). Same brand asset, parameterized application.

### Decision: Phase 1 backfill before Phase 2/3

**Decision:** Run Phase 1 (link existing publications) before Phase 2/3 (resolve OpenAlex IDs for HCPs without publications via API and ingest historical bibliographies).

**Rationale:** Phase 1 uses only existing data (no API calls), validates the architecture works at scale, and produces immediate value (Loomba 77 → 963 expansion). Phase 2/3 requires API budget and should be scoped after Phase 1 validates the model.

---

## Frontend community track UI — working draft

User confirmed seamless dual-track UX is the goal. Track switch as primary frame, sophisticated per-track filtering beneath. Two open questions remain (soft filter vs hard mode; cross-track marker approach).

Detailed UI primitives sketched in conversation with Claude and need to be captured in a separate frontend design document. Key components:

1. **Track switch component** at top of screen (persists across navigation)
2. **TA filter** unchanged (Rare Disease, NSCLC, Hepatology, Oncology, Immunology)
3. **Track-aware filter chips** below TA — different primitives per track
4. **HCP card variants** with same shell, parameterized stat pills
5. **Detail page** with track-aware section list
6. **Score modal** with track-aware breakdown text
7. **Single search** returning results from both tracks
8. **Cross-track marker** on cards for HCPs scoring well in both
9. **Dark Horse callout** appearing in both tracks with different criteria narrative

This is the next major frontend workstream. It builds on the existing rising star UI rather than replacing it. The existing HCPCard, DetailScreen, ScoreModal, StatPillWithTooltip components become parameterizable shells.

---

## What's pending

### Right now (in progress)

- **Phase 1 publication backfill execute** — running, ~60-90 min remaining

### Tonight (evening session, ~2 hours)

Decision needed at session start: pick one or two of these:

1. **Validate Phase 1 results.** Once execute completes, query database to verify: Loomba count, total publication_authors rows inserted, sample resolved HCPs. Compare to dry-run projections.

2. **Patch career stage derivation.** Once publication_authors is populated, re-run NPPES enrichment career stage logic using publication first-year fallback. Now that we have rich publication data, established band should populate correctly.

3. **Plan Phase 2 (OpenAlex author ID resolution for 21K HCPs without publications).** Build script that takes HCP names + NPPES institution data + queries OpenAlex author search API. Confidence tiers. Resumability. Progress meter. ~1-2 hours of focused script-building.

4. **Begin community track frontend scaffolding.** Track switch component. Filter chip primitives. Card variant. Real code in your existing React/TypeScript stack.

### This week

- Phase 2 — OpenAlex author ID resolution (1-2 days)
- Phase 3 — Full bibliography ingestion via OpenAlex API (1-2 days)
- Re-run NPPES career stage derivation with full publication data
- Apply unapplied NPPES Workstream A NPI matches (Sanyal canonical issue)
- Patch hcp_dedup_merge.py with publications + trial_proposals branching
- Build community composite scoring v1 (schema migration, percentile computation, composite weighting, validation)
- Frontend community track scaffolding to working state

### After community composite v1 lands

- Demo flow design
- Frontend HCP profile page evolution
- Dark Horse criteria computation (both tracks)
- Drug seed list v1.5 expansion
- HCPCS list v1.5 expansion
- Documentation consolidation
- Academic Rising Star composite (Track #2 v1.5)

### Deferred

- Phase 4 — Pipeline consolidation
- Phase 5 — Citation enrichment trajectory analysis
- PITR add-on for Supabase ($100/mo)
- "Field" or other community track naming refinement

---

## Honest reflections

Today exposed real architectural debt that had been accumulating. The publication ingestion pipelines (`pubmed_pipeline.py`, `openalex_pipeline.py`, `openalex_publications.py`, `scholar_overnight.py`, `scholar_enrichment.py`) had grown organically with overlapping responsibilities, hardcoded slice limits, recent-only date filters, and unclear canonicality. The discovery wasn't a bug; it was a foundation problem.

The decision to pause composite scoring and write the publication data architecture document was the right call. Patching pipeline #4 with another date-window adjustment would have been faster but would have produced a half-working v1 with publication signals that fail under scrutiny.

The frontend you've built is genuinely substantial — production-quality React/TypeScript with a coherent design system. It's currently rising-star-track-focused, which means today's strategic priority shift toward community track means the frontend evolution is more significant than I initially framed it. Not "build new UI quickly" — "extend the existing pattern thoughtfully."

The product vision that crystallized today (two-track seamless UX, sophisticated per-track filtering, Dark Horse as cross-track signature concept, "platforms miss these people" as unifying value prop) is genuinely defensible and differentiated. Worth a 1-2 page product thesis document over the weekend or early next week.

The pace today was ambitious. Multiple workstreams interleaved. Mid-build pivots based on discoveries. Real architectural decisions made in real-time. You held the line on "do it right more than fast" several times — that discipline saved real downstream cleanup work.

Phase 1 is currently writing 65,570 HCPs' OpenAlex IDs and 400K-700K publication_authors rows. When you come back tonight, that foundation will be in place and the platform will be ready for the next wave of work.
