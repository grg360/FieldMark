# TA_BUILD_DEBT.md — What the Platform Owes Itself

**Status:** FOUNDATIONAL — CANONICAL. The honest ledger of what is still hardcoded, broken, worked-around,
or un-parameterized. This is the backlog that, when retired, makes `TA_NEW_PLAYBOOK.md` turnkey and the
automation orchestrator writable.
**Created:** July 3, 2026 (Atopic Dermatitis / TA #2 build)
**Companion:** `TA_NEW_PLAYBOOK.md` (the forward runbook)

Debt is grouped by the three automation blockers (parameterization, resumability, verification-gates),
then specific bugs/anti-patterns, then the AD-build post-mortem.

---

## 1. POST-MORTEM — how the AD corpus got contaminated (the cautionary tale)

The AD corpus (~47,850 pubs) was contaminated by **two independent, compounding mechanisms**:

**Mechanism A — over-broad retrieval query.** The AD query (`config/therapeutic_areas/atopic-dermatitis.json`,
used by the detour `pubmed_pipeline.py`) appended ~12 **bare, unanchored drug names**
(dupilumab, tralokinumab, upadacitinib, abrocitinib, baricitinib, ...) and broad terms
(`Eczema[Mesh]`, `eczematous`). Because these drugs are pan-indication, the ESearch itself returned
asthma / RA / COVID / UC / alopecia / other-eczema papers. This is the LARGER share of the
contamination (the query legitimately returned ~31,776, far above a clean ~24K).

**Mechanism B — co-author tagging backfill (worse, because circular).** The backfill
`sql/backfill/ad_pubmed_source_ta_and_pub_ta_20260610.sql` used its **METHOD B** fallback (the canonical
PMID-list METHOD A was left commented out — nobody pasted the checkpoint PMIDs). METHOD B tagged a
publication as AD **if ANY of its authors was already an AD-tagged HCP**. This is guilt-by-association:
- HCPs were AD because they authored (query-contaminated) AD pubs;
- then EVERY OTHER paper those HCPs ever wrote got back-tagged AD — including diesel-exhaust toxicology,
  porcine Japanese-encephalitis, colorectal cancer, hemoglobin/hemolysis papers.
- This self-reinforcing loop tagged ~16,000 papers that the query never even returned.

**How it was caught:** a "21,779 authors in both AD and NSCLC" overlap looked outlandish → decomposition
showed 14,764 were single-AD-paper incidental → reading actual titles of the AD∩NSCLC slice showed
diesel-exhaust and lung-cancer papers wearing AD tags → traced to the two mechanisms above.

**The fix (shipped this session):** corrected disease-centric query authored into the
`therapeutic_area_ingestion_config` table; contaminated 47,850 pubs deleted (snapshot:
`publications_v2_ad_contaminated_backup`); re-ingested via canonical `ingest_publications.py`
(PMID-driven tagging, no co-author backfill).

**PERMANENT RULES (now in Playbook §0):** retrieval = disease identity only; tag only from ESearch PMIDs,
never author graph.

---

## 2. PARAMETERIZATION debt (blocks automation blocker #1)

- **`config/therapeutic_areas/*.json` vs `therapeutic_area_ingestion_config` table split.** Two config
  locations exist. The detour read JSON; the canonical script reads the table. The JSON files are
  effectively dead for the canonical path but still on disk (confusing). DECIDE: table is canonical;
  either delete the JSONs or make them the source that a compiler loads INTO the table.
- **Ontology + query compiler (advisor-recommended, high value).** Retrieval queries are hand-written
  Boolean strings (~30 clauses, error-prone, unreviewable). Build: a structured per-TA ontology
  (synonyms/variants/tiers as YAML/JSON) + a compiler that generates the PubMed query. Makes queries
  reviewable, versionable, per-TA-templatable, and is a piece of the automation orchestrator.
  Per-clause ablation (Playbook §2f) becomes a compiler feature.
- **AD query not yet ablation-optimized.** ~30 clauses; likely compressible to ~15–18 with negligible
  recall loss. Suspected zero-contributors in the 10-yr window: `constitutional eczema`, `Besnier prurigo`.
  Do during the compiler pass, evidence-based (remove → recount → record unique PMIDs).
- **Enrichment tag-lists are unbuilt.** The mechanisms/drugs removed from retrieval (IL-4, IL-13, IL-31,
  TSLP, filaggrin, Th2; dupilumab, tralokinumab, lebrikizumab, nemolizumab, rocatinlimab, upadacitinib,
  abrocitinib, baricitinib, ruxolitinib, delgocitinib, crisaborole, roflumilast) must live SOMEWHERE as
  post-ingestion enrichment tags, or FieldMark loses "which AD KOLs work on IL-13 / JAK / dupilumab."
  Likely `openalex_concept_ids` / `indication_keyword_filters` / a new enrichment-tag config. Preserved
  here verbatim so they are not lost.
- **Inventory has no `--ta` / incremental mode** (see §6). Global truncate-rebuild only.
- **`--target-version` defaults to `v1`** across scripts. In a v2 world this is a footgun — forget the flag,
  silently read/write legacy tables. DECIDE: flip default to v2, or make v1 an explicit opt-in.

---

## 3. RESUMABILITY / IDEMPOTENCY debt (blocks automation blocker #2)

- **ingest_publications.py transport is the Supabase client (PostgREST/HTTP), not direct psycopg.** Fine
  for the ingest itself, but the same HTTP layer that fails large dashboard deletes. Long runs can hit
  `ChunkedEncodingError` on a window (observed once in the AD dry-run). The script logs and continues,
  so a flaky window can MISS papers. Re-running is safe (per-batch existence check skips existing), but
  there is no automatic per-window retry-until-clean. Add: end-of-run failed-window report + auto re-run.
- **inventory `--truncate` deletes 239K rows via a single PostgREST `.delete()`** — the exact operation
  class that times out over HTTP. Workaround: `TRUNCATE` via `run_sql.py` (direct), then build without
  `--truncate`. Bake this into the runbook or the script.
- **Checkpoints exist but are per-detour.** `pubmed_checkpoint_atopic-dermatitis_v2.json` was from the
  contaminated run. A clean re-ingest should start from a fresh checkpoint; stale checkpoints can cause
  a resume to skip/misbehave. Orchestrator must manage checkpoint lifecycle per run.

---

## 4. VERIFICATION-GATES-AS-CODE debt (blocks automation blocker #3)

- **All verification this session was human-in-the-loop SQL** ("paste the count, must read X"). For
  unattended automation these must become coded assertions that HALT on failure. Examples to encode:
  post-delete `172/0/172`-style checks; post-ingest `inserted ≈ validated_count`; contamination-shed
  probes as automated tests; snapshot-intact checks before/after destructive steps.
- **`ta_tagging_rebuild.py` — VERIFY IT EXISTS.** The Day-2 doc listed it as "NOT YET WRITTEN." Step C
  does NOT tag TAs, so without this, Step-C-created HCPs get no TA tags. This is a HARD BLOCKER for AD
  HCP tagging and must be confirmed-or-written before AD reaches step 6 of the pipeline.

---

## 5. AD-SPECIFIC config debt (must clear before later pipeline stages)

The AD `therapeutic_area_ingestion_config` row was authored this session with ONLY the PubMed fields set:
`pubmed_query` (validated disease-centric query), `pubmed_days_back=3650`, `pubmed_max_results=60000`,
`is_active=true`, `is_visible_in_ui=true`.

**Left at column defaults, MUST be authored before the relevant stage runs:**
- `openalex_concept_ids` = `{}`  → needed by OpenAlex enrichment/inventory. Empty may change behavior.
- `openalex_min_works_count` = 5 (default) → confirm appropriate for AD.
- `openalex_max_authors_to_fetch` = 15000 (default) → AD has ~235,981 raw distinct authors; confirm ceiling.
- `nppes_taxonomy_codes` = `{}` → AD should be Dermatology (`207N00000X`) + allergy/immunology-derm
  (`207NI0002X`) per the old JSON. Needed for Workstream B community HCPs.
- `ctgov_condition_filters` = `{}` → needed for clinical-trials ingestion.
- `scoring_weights` = `{}` → needed by scoring_pipeline. Empty likely = wrong/blank scores.
- `indication_keyword_filters` = `{}` → possible home for enrichment tag-lists.

---

## 6. The shared-inventory extension problem (RESOLVED — see Playbook §0b)

**RESOLVED July 3, 2026.** The resolution came from settling the HCP data model (Playbook §0b):
single canonical identity row per person + per-(HCP, TA) intelligence + query-time firewall +
future Unified Investigator Dossier. Because identity is unified and the Dossier depends on it, the
inventory MUST stay unified/cross-TA (one row per author, `corpus_pub_count` = total cross-TA corpus).

**Resolved approach:** incremental, identity-preserving inventory build. Scan the new TA's pubs; insert
new authors; for already-present authors recompute `corpus_pub_count` from their FULL cross-TA footprint
(read-only across all `publications_v2`). Reads across frozen TAs are permitted; writes/modifications are
not (and are not needed).

**Remaining build task (moved to parameterization debt §2):** the inventory script does not YET support
this incremental identity-preserving mode — it only does global truncate-rebuild. Build the incremental
mode (with correct cross-TA recount) as part of the parameterization/compiler pass. Until then, the AD
inventory step needs a manual/scripted incremental build that does NOT clobber cross-TA counts and does
NOT truncate (which would touch frozen NSCLC).

--- ORIGINAL PROBLEM STATEMENT (kept for context) ---

The central multi-TA architecture question, surfaced by AD:

**The central multi-TA architecture question, surfaced by AD and NOT yet solved.** The
`openalex_author_inventory` is one shared, TA-agnostic table keyed on `openalex_author_id` (one row per
author). When a new TA is added:
- Full `--truncate` rebuild = regenerates ALL TAs' authors → touches frozen/under-review TAs (NSCLC was
  under advisor review during the AD build — must not be touched). REJECTED for that reason.
- Naive incremental (AD-only scan + plain upsert) = for an author already in the inventory from another
  TA, an AD-only scan sees only their AD pubs and OVERWRITES `corpus_pub_count` with the AD-only count,
  corrupting cross-TA authors (21,779 AD authors were already in the inventory). REJECTED.
- Correct incremental needs MERGE semantics (`corpus_pub_count += AD_count`, `first_seen = min`,
  `last_seen = max`) AND idempotency (re-run must not double-count). Not built.
- Alternative: make the inventory `(openalex_author_id, therapeutic_area_id)`-keyed (one row per
  author-per-TA). Cleaner long-term, but a schema migration on a shared table + a Step C change, and the
  existing 239K rows have no TA stamp (backfilling them touches NSCLC → back to the frozen-TA problem).

**DECISION DEFERRED.** For the AD build the plan is to resolve this before the inventory step. The
user's stated intent: *"If an author appears in NSCLC already, a duplicate row should be created for AD"*
→ points toward the per-(author,TA) model, to be designed deliberately (not patched mid-build).

---

## 7. Specific bugs / anti-patterns / infra notes

- **`run_sql.py` does not strip a leading UTF-8 BOM.** A SQL file written by PowerShell
  `Out-File -Encoding utf8` gets a BOM → psycopg throws `syntax error at or near "INSERT"`. Workaround:
  write files as UTF-8-no-BOM (`New-Object System.Text.UTF8Encoding($false)`). FIX: strip BOM in run_sql.py.
- **Missing FK index caused delete timeouts.** `hcp_top_collaborators_v2.collaborator_hcp_id` had NO index;
  its FK is `NO ACTION`, so deleting HCPs ran a seq-scan FK check per row (191K seq-scans → 10-min timeout).
  FIXED this session: `CREATE INDEX idx_hcp_top_collaborators_v2_collaborator_hcp_id ...`. Keep it. AUDIT
  other `NO ACTION`/`RESTRICT` FKs into high-volume tables for the same missing-index footgun.
- **Dashboard (`api.supabase.com`) vs direct (`run_sql.py`/`DATABASE_URL`).** Dashboard has a short HTTP
  timeout that rolls back large ops ("Failed to fetch"). Use `run_sql.py` for anything large. `SET
  statement_timeout='10min'` works on the direct connection but is per-connection (must ride in the SAME
  `--file` as the statement it governs).
- **Windowed ESearch double-counts.** ingest_publications sums per-90-day-window counts (not deduped);
  "PMIDs found" >> true distinct count. AD: 33,771 windowed sum vs 24,318 distinct. The insert path dedups
  via `fetch_publication_state_by_pmid`. Dry-run does NOT dedup (that branch is `not args.dry_run`), so
  dry-run inflates. Don't mistake the windowed sum for corpus size.
- **JSONB author path is nested:** `authorships[i].author.id` (a URL like `https://openalex.org/A...`),
  NOT a flat `author_id`. The inventory script parses this correctly; ad-hoc queries must too.
- **`hcps_v2.openalex_author_id` is NOT the source of truth** for HCP↔OpenAlex; join through
  `hcp_openalex_authors_v2` (composite PK, no `id` column — breaks `table_exists()` checks that
  `select("id")`). One OpenAlex ID → multiple HCPs (~4.6% misattribution) and one HCP → multiple IDs
  (shard fragmentation). Do not add a UNIQUE constraint on `hcps_v2.openalex_author_id`.
- **Case-insensitive lookups:** use `last_name_lower`/`state_lower` generated columns with `.eq()`, never
  `ILIKE` on raw columns (Supabase statement timeouts, ~220x slower).

---

## 8. Deletion records this session (for audit / rollback)

- **HCP cleanup:** deleted 191,551 detour-created AD HCPs (created 2026-07-02, AD-only, zero OpenAlex
  linkage, zero enrichment). Preserved 172 real HCPs (created 2026-05-22, OpenAlex-linked; 133 Hep,
  23 NSCLC, 16 other/none by tag). Snapshots: `hcps_v2_ad_july_detour_backup`,
  `pub_authors_v2_ad_july_detour_backup`, delete-list `hcps_v2_ad_july_delete_list`.
  Cleared `publication_authors_v2` for those HCPs (223,745 rows).
- **Publication cleanup:** deleted 47,850 contaminated AD pubs + children (49,038 TA-tags incl. Immunology
  parent; 21,410 author-links touching 3,952 surviving HCPs — HCPs NOT deleted, only their links to the
  contaminated pubs; 75 `hcp_scientific_positions_v1` rows). Snapshot:
  `publications_v2_ad_contaminated_backup` (47,850 rows, 46,279 with OpenAlex enrichment).
  Delete-list: `ad_pubs_delete_list`. Total pubs after: 391,502 (Hep+NSCLC, untouched).
- **Cleanup tables to DROP after AD build is validated** (Guttman-Yassky et al. surface correctly):
  `hcps_v2_ad_july_detour_backup`, `pub_authors_v2_ad_july_detour_backup`, `hcps_v2_ad_july_delete_list`,
  `publications_v2_ad_contaminated_backup`, `ad_pubs_delete_list`.
- **The 172 survivors still carry a detour-assigned AD tag** (spurious). Handle AFTER Step C /
  ta_tagging_rebuild re-derives AD tags from clean publication evidence — likely strip the detour tags
  and let proper tagging reassign. Do NOT delete the HCP rows.

---

## 9. Tagging-layer enhancements (surfaced during AD concept curation, July 3)

`ta_tagging_rebuild_v2.py` works (concept-based, reads `curated_ta_concepts`, scores pub
`openalex_concepts` with `CONCEPT_SCORE_THRESHOLD=0.4`, `WEIGHTED_RELEVANT_THRESHOLD=5.0`,
`FRACTION_THRESHOLD=0.30`, recency weighting). Two enhancements make it tunable/observable:

- **Per-concept curated weights.** `curated_ta_concepts` has NO weight column; the script weights each
  concept only by its per-paper OpenAlex score. To implement diagnostic weighting (Dupilumab 4.0 vs
  keratinocyte 0.75), add a `weight` column + multiply by it in scoring. Advisor's proposed weights are
  preserved with the AD concept tiers (Tier1/2/3 in the `notes` field map to high/med/low weight).
- **Matched-concept observability (HIGHEST VALUE).** The script emits only
  `{hcp_id, therapeutic_area_id, publication_count, assigned_at}` — it DISCARDS which concepts fired and
  their contributions. Store `{score, matched_concepts:[...]}` per tag so weight calibration after the
  first run is data-driven (look at a false positive → see which concepts fired → adjust their weight)
  rather than guesswork. Without this, weight calibration is blind.

**Doctrine (see Playbook §2g):** `curated_ta_concepts` is the optimized tagging vocabulary for the
CURRENT classifier, NOT the disease ontology. Three statuses: Tagging / Enrichment / Dormant.
Allowlist-curate; denylist semantic collisions ("Type 2 X" family); verify effectiveness by score
DISTRIBUTION not mean. Membership stable, weights are the tuning knob.

## 10. Enrichment ontology / mechanism allowlist (unbuilt)

The mechanisms/drugs/cytokines removed from BOTH retrieval and tagging must live as an enrichment
allowlist (advisor's `accepted_mechanisms`), extracted from paper CONTENT post-ingestion (not dependent
on OpenAlex's weak concept scores). AD accepted_mechanisms should include: IL-4, IL-13, IL-31, TSLP,
Type 2 inflammation, Type 2 immunity, filaggrin, skin barrier, JAK; and drugs: dupilumab, tralokinumab,
lebrikizumab, nemolizumab, rocatinlimab, upadacitinib, abrocitinib, baricitinib, ruxolitinib,
delgocitinib, crisaborole, roflumilast. Home: likely config `openalex_concept_ids` /
`indication_keyword_filters` / a new enrichment-tag table. This is where "which AD KOLs work on IL-13"
gets answered.

## 11. AD concept-tagging validation (after first tagging run)

The 23-concept AD tagging set is a well-reasoned HYPOTHESIS, not proven. It can only be validated after
Step C creates AD HCPs and tagging runs. Acceptance test: validation-target KOLs (Guttman-Yassky,
Silverberg, Simpson, Eichenfield, Paller, Blauvelt, Bissonnette, Thaci, Deleuran) get tagged AD, AND
non-AD researchers (psoriasis/asthma/oncology KOLs) do NOT. If noisy, trim Tier 3 (keratinocyte, stratum
corneum, itching, erythema) first. Requires §9 observability to diagnose efficiently.

---

## SESSION-END STATE (July 3, 2026) — resume here

**AD build status: data-prep COMPLETE, HCP-building NOT STARTED.**

DONE and verified:
- Contaminated AD corpus (47,850) deleted; clean corpus re-ingested: 23,390 publications
  (source='pubmed_v2_ingest', corrected disease-centric query in therapeutic_area_ingestion_config).
- OpenAlex enrichment complete: 22,575 pubs with authorships + openalex_concepts + citations.
- 23 curated AD concepts in curated_ta_concepts (full-URL ids, tiered notes).
- Inventory extended incrementally: openalex_author_inventory 239,306 -> 253,011 (21,014 AD authors
  written: 7,309 cross-TA updates + 13,705 new; NSCLC-only rows untouched).
- author_pub_flat staging table built + indexed (3,168,001 rows) — reused by Step C.

NEXT TASK: Step C rewrite (create_hcps_v2.py) — spec in STEP_C_REWRITE_SPEC.md, Cursor prompt issued.
Then: career enrichment -> ta_tagging_rebuild_v2.py -> scoring -> validate KOLs.

CRITICAL EDGE CASE for Step C: hcps_v2 already contains 172 real HCPs from the May Hep/NSCLC build
(created 2026-05-22, OpenAlex-linked). Step C is NOT a clean-slate create. Must handle idempotency:
do not duplicate HCPs for authors already linked via hcp_openalex_authors_v2. The 172 also carry a
spurious detour AD tag (strip after tagging re-derives).

BACKUP/CLEANUP TABLES (drop only after AD validated — Guttman-Yassky surfaces as top AD Established):
hcps_v2_ad_july_detour_backup, pub_authors_v2_ad_july_detour_backup, hcps_v2_ad_july_delete_list,
publications_v2_ad_contaminated_backup, ad_pubs_delete_list, openalex_author_inventory_pre_ad_backup.

BLOCKERS CLEARED this session: ta_tagging_rebuild_v2.py EXISTS (concept-based); inventory extension
RESOLVED (§6); shared-inventory architecture DECIDED (§0b playbook).

---

## SESSION-END UPDATE (July 3, 2026 — later) — Step C COMPLETE

Step C rewrite (`create_hcps_v2.py`, written in Cursor from STEP_C_REWRITE_SPEC.md) is DONE and validated.

- **CORRECTION to earlier "172 HCPs" belief:** `hcps_v2` actually contained 269,392 HCPs before this
  run (not 172 — the handoff's figure was wrong; verified directly against the DB). The link table had
  239,306 linked authors. Step C's idempotency guard correctly skipped all already-linked authors and
  processed only the ~13,700 NEW AD-specific authors. LESSON: verify population counts against the DB,
  don't trust handoff figures (we caught this via a surprising "239,300 already linked" dry-run number).
- **Step C runs:** limited (--limit 500) then full. Total 13,659 AD-specific HCPs created, all with
  unique non-null identity_hash, 0 errors. Clustering: ~86% ORCID, ~14% name+institution, 32 name-only
  singletons; ~58 conservative multi-shard merges. Full run 70.7s.
- **KOL validation PASSED:** Silverberg (465 pubs), Eichenfield (143), Weidinger (2-shard ORCID merge,
  correct), Flohr, Lio, Irvine, Bieber, de Bruin-Weller — all resolved to single correctly-attributed
  HCPs. No conflation, no mega-clusters. Anti-conflation algorithm preserved from the original.
- **New gotcha (documented):** tables created via direct `run_sql.py`/psycopg (e.g. author_pub_flat)
  are NOT readable by the Supabase-client (service_role) path until granted. Fix:
  `GRANT SELECT ON public.<table> TO service_role, authenticated, anon;`. Any new staging table a
  SCRIPT reads needs this grant. author_pub_flat has been granted.
- **Step C ingestion_run_ids:** 617de6ff-19a7-4ecb-9e3c-c9af45df3eef (500),
  dc4f2938-3056-4013-be27-f680dc6e7bdb (13,159).

**NEXT (fresh session — the multi-hour stretch):** career_enrichment_from_clusters.py →
ta_tagging_rebuild_v2.py (FIRST use of the 23 curated AD concepts — tags these HCPs + existing cross-TA
HCPs as AD) → scoring → ACCEPTANCE TEST: Guttman-Yassky + the 9 named KOLs surface as top AD Established.
Note: some AD KOLs may already exist in the 269,392 prior HCPs and get AD-tagged rather than newly
created — validate across BOTH the new 13,659 and the tagged-existing population.

---

## SESSION-END UPDATE #2 (July 3) — TAGGING BLOCKED ON MISSING STEP F

Career enrichment ran (13,659 AD HCPs got true career pub counts, e.g. Silverberg 1,223). Then tried
ta_tagging_rebuild_v2.py (with new --ta atopic-dermatitis scoping added via Cursor — scoping VERIFIED
airtight, NSCLC-safe: filters at concept-load + 2 assertions + additive upsert). Dry-run revealed a
PIPELINE-ORDER BUG (caught before --execute, no bad writes):

**Every AD canonical KOL tagged=false with weighted_relevant=NULL, total_pubs=NULL.** Not a scoring
miss — a linkage gap. Confirmed via SQL: Silverberg has publication_authors_v2 rows = 0,
hcp_openalex_authors_v2 rows = 1, total_career_pubs = 1223. i.e. the new Step C HCPs have OpenAlex
author links + career data but NO publication_authors_v2 rows.

ROOT CAUSE: ta_tagging_rebuild_v2.py aggregates over publication_authors_v2 (HCP<->pub links). Step C
only wrote hcps_v2 + hcp_openalex_authors_v2 (HCP<->author-shard). The HCP<->publication links are
built by **run_step_f_rebuild_publication_authors.py** (Day-2 pipeline step F), which we SKIPPED. The
4,170 HCPs that did tag were PRE-EXISTING HCPs with old pub-links; ALL new AD HCPs were invisible to
tagging.

CORRECT PIPELINE ORDER: Step C -> career enrichment -> **Step F (rebuild publication_authors_v2)** ->
ta_tagging_rebuild_v2 -> scoring -> narratives. We jumped from career enrichment straight to tagging.

NEXT SESSION — resume here:
1. Read run_step_f_rebuild_publication_authors.py (confirm: writes publication_authors_v2 for new HCPs
   by joining hcp_openalex_authors_v2 -> author's pubs via authorships/author_pub_flat; confirm
   NSCLC-safe / scopeable to new HCPs; confirm --target-version v2).
2. Run Step F (dry-run, verify Silverberg gets pub links, then execute).
3. Re-run ta_tagging_rebuild_v2.py --ta atopic-dermatitis (dry-run) — canonicals should now tag=true.
4. Verify KOLs tagged, then --execute.
5. Then scoring, narratives, acceptance test.

NOTE: playbook §1 pipeline list DID include step F ("run_step_f_rebuild_publication_authors.py rebuilds
publication_authors_v2 linking pubs to the new HCPs") — we just missed running it. Follow the list.

---

## SESSION-END UPDATE #3 (July 3) — STEP F + TAGGING COMPLETE

Resolved the tagging blocker and completed tagging:

- **Step F (publication_authors_v2 links):** rewrote as scripts/classify/rebuild_publication_authors_v2.py
  via Cursor (original was wipe-all-and-rebuild; new version is scoped/additive). Scoping VERIFIED
  airtight: --only-new-hcps (linked_at >= today), NO delete, ON CONFLICT DO NOTHING on composite PK
  (publication_id, hcp_id), emit-gate skips any winner not in scoped set. Wrote 80,177 links for the
  13,659 new AD HCPs, 0 errors, NSCLC untouched. Silverberg pub-links 0 -> 465. Orphan rate 81/80,581
  (0.1%). Match methods ~100% step_f_unique_hcp (new HCPs are clean single-shard, little disambiguation
  needed).
- **CORRECTED PIPELINE ORDER (confirmed):** Step C -> career enrichment -> **Step F** -> tagging.
  Tagging aggregates over publication_authors_v2; without Step F the new HCPs had no pub-links and
  tagged as null. This is now fixed in the pipeline understanding.
- **Tagging (ta_tagging_rebuild_v2.py --ta atopic-dermatitis --execute):** 15,902 AD tags written.
  ALL canonical KOLs tagged=true: Silverberg (weighted 669.9, 431/465 pubs), Wollenberg (301), Irvine
  (228), Eichenfield (207), Bieber (204), Lio (193), Flohr (182), Guttman-Yassky (7.9, but only 6
  pubs linked - see note). The 23 curated concepts correctly identify AD KOLs. Hand-verified Silverberg
  in SQL before the run (669.9 vs 5.0 gate).
- **Stale detour tag cleanup:** upsert left 165 pre-existing detour AD tags (assigned_at < today) that
  the clean run didn't re-derive. Snapshotted (ad_stale_detour_tags_backup) and deleted. Final AD tag
  count: exactly 15,902 evidence-based tags. Contamination residue eliminated.
- **NSCLC tags = 80,017, untouched** (tagging scoped to AD concepts only; delete scoped to AD + old-date).

**KNOWN LIMITATION (note for scoring):** Guttman-Yassky (arguably #1 AD KOL) shows only 6 linked pubs
because she is a PRE-EXISTING HCP (from the 269K), and Step F was scoped to only NEW HCPs (--only-new-hcps)
to protect frozen NSCLC. So pre-existing cross-TA HCPs who are AD-relevant have INCOMPLETE AD pub-links
and will be UNDER-COUNTED in scoring. Fix when NSCLC unfreezes: a full (unscoped) Step F rebuild would
complete everyone's links. For now, they tag correctly but rank lower than they should on pub-volume.

**NEXT (fresh session): SCORING.** scoring_pipeline.py / established_scoring.py / community_scoring.py
-> ranked Established / Rising Star / Community cohorts. Read first (confirm NSCLC-safe scoping, --target-version
v2), dry-run, validate that Silverberg/Wollenberg/Eichenfield surface as top AD Established. Then
narratives (generate_narratives_v2.py --target-version v2). Then drop backup tables once validated.
