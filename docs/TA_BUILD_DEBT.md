# TA_BUILD_DEBT.md — What the Platform Owes Itself

> ## ⚠️ SUPERSEDED — NOT CANONICAL. Read `docs/canonical/` instead.
>
> Marked 2026-08-31 during the canonical carve-out. This is a **session log**, correct as a record
> of what was believed while it was written and wrong as guidance today. It was left out of
> `docs/canonical/` deliberately.
>
> **The specific known-stale claim, not corrected inline** (the file is a chronological log and
> rewriting its history would make it a worse record, not a better one): it describes
> `established_scoring.py` as a live scoring step. That script is **dead** — nothing under
> `scripts/` invokes it; the only surviving reference is a comment in
> `scripts/utilities/export_telescope_data.py`. The Established board comes from
> `recompute_established_ranks_v3.py`, which takes `--ta`. See
> `docs/canonical/TA_GENERATION_LAYER.md` (§ "established_scoring.py is not the Established
> board"), which carries the corrected account.


**Status:** SUPERSEDED 2026-08-31 (this line read "FOUNDATIONAL — CANONICAL"). The honest ledger of what is still hardcoded, broken, worked-around,
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

---

## MONDAY MIDDAY CHECKPOINT (July 6, 2026) — SCORING ARCHITECTURE MAPPED + NPPES/PHARMA LEG

Session goal was to test whether the scoring methodology generalizes to AD. Instead spent the morning
establishing GROUND TRUTH about what the scoring system actually is (the repo has multiple superseded
scoring scripts mixed with the real one), and discovered the pharma-enrichment leg is unbuilt for AD.
No scoring was run. Key findings below.

### 12. REAL SCORING ARCHITECTURE (established this morning — supersedes prior confusion)

The Established cohort is scored by a THREE-DIMENSION V3 model, NOT the six-component trials-based model.
- **Real script: `recompute_established_ranks_v3.py`** (uses DATABASE_URL/psycopg2, has --ta scoping).
  Formula (verbatim):
    cohort_score = 0.50*scientific_influence_pctile
                 + 0.35*network_influence_pctile
                 + 0.15*pharma_engagement_pctile
  Writes `hcp_established_ranks_v3` (the table the frontend ScoreBreakdownV3.tsx reads).
  Percentiles computed WITHIN scope (per-TA, and per country/region/global via scope_type/scope_value).
- **Input tables (each must be populated per-TA before recompute):**
    scientific  <- hcp_publication_leadership_v2  (via publication_leadership_scoring.py)
    network     <- hcp_network_centrality_v2 (window_type='10yr')  (via network_centrality_scoring.py)
    pharma      <- hcp_pharma_engagement_v2  (via pharma_engagement_scoring.py, needs Open Payments)
  It REORDERS an existing cohort in `hcp_established_ranks_v2` -> so a cohort-classification step must
  populate that first.
- **SUPERSEDED (move to archive/superseded/ — they caused this morning's confusion):**
    - `scoring_pipeline.py` (v1.4) — trials-based 4-signal composite. Trials were DROPPED from scoring.
    - `established_scoring.py` — six-component (incl. trial 15%, pharma_breadth 10%), hardcoded to
      HEP+NSCLC only, writes hcp_established_scores_v2. NOT what powers the demo.
- **CRITICAL FLAW (the July 3 Janne->#30 landmine, confirmed in docstring):** "Missing signal data is
  treated as percentile 0 (penalizing)." So an HCP with no pharma data gets pharma_pctile=0, which
  penalizes them vs. HCPs who happen to have pharma. Docstring itself flags the fix: "We may revisit
  later (e.g., impute median or weight only available signals)." SEE OPEN DECISION #14 below.

### 13. FULL AD SCORING PIPELINE (5 stages, AD has completed ~0)

  1. Cohort classification -> hcp_established_ranks_v2 (who is Established in AD)  [NOT DONE]
  2. publication_leadership_scoring -> hcp_publication_leadership_v2 (scientific)  [NOT DONE]
  3. network_centrality_scoring -> hcp_network_centrality_v2 (network)             [NOT DONE]
  4. NPPES -> Open Payments -> pharma_engagement_scoring -> hcp_pharma_engagement_v2 [IN PROGRESS]
  5. recompute_established_ranks_v3 --ta atopic-dermatitis -> hcp_established_ranks_v3 [NOT DONE]
  (Stages 1-3 are pharma-independent and could run before/parallel to the NPPES leg. Rising Star and
   Community cohorts are parallel chains with their own scripts — not yet examined.)
  Each component script must be verified as current (not superseded) and likely needs --ta/v2 retrofit.

### 14. OPEN METHODOLOGY DECISION — how to treat legitimately-missing pharma  [NEEDS DELIBERATE DECISION]

The recompute formula penalizes missing pharma as percentile 0. AD surfaces TWO populations where this
is questionable:
  (a) International academic HCPs — no US Open Payments data by nature (~82% of AD HCPs are non-US).
  (b) Industry/NIH-affiliated HCPs (Pfizer, Lilly, Regeneron, AbbVie, Sanofi, NIH, Rockefeller) — they
      legitimately have no Open Payments *receipts* (they're the paying side / non-clinicians).
Penalizing both to pharma-pctile-0 mis-ranks them. Options: (i) keep penalizing-0, (ii) impute median,
(iii) weight only available signals (renormalize 0.50/0.35 over sci+net when pharma absent). This is a
core methodology call, recurs every TA, and was made IMPLICITLY (never documented) for NSCLC/Hep. MUST
be decided deliberately before AD scoring is trusted. NOT YET DECIDED.

### 15. INDUSTRY/NIH HCP TREATMENT (reconstructed from NSCLC data, was undocumented)

Observed NSCLC/Hep behavior for industry/NIH-affiliated HCPs (Pfizer 275, NIH 463, AbbVie 192, etc.):
  - was_nppes_processed = 0 across ALL -> NSCLC did NOT attempt NPPES matching on industry HCPs.
  - has_npi ~0-2% -> correctly, they're not practicing clinicians.
  - has_cohort_class 12-34% -> they WERE kept in the population and cohort-classified (scored on
    scientific/network, which industry scientists legitimately have).
RECONSTRUCTED RULE: industry/NIH HCPs are KEPT + cohort-classified, but NOT NPPES-matched. Their pharma
is legitimately null. -> NPPES runs should EXCLUDE industry/basic-science institutions (they self-exclude
by not being in staging_us_institution_to_state, but should be explicitly scoped out to avoid wasted
API calls + accidental mis-matches).

### 16. STATE-DERIVATION STEP MISSING FOR AD (blocks NPPES matching quality)

NPPES name->NPI matching needs a US state to disambiguate. Publication-derived AD HCPs have country='US'
but nppes_practice_state IS NULL (that field is populated BY NPPES). The v1/NSCLC flow derived a
`derived_state` from institution via `staging_us_institution_to_state` (institution_normalized -> state).
The v2 hcps_v2 table has NO derived_state / institution_state columns -> the derivation step was never
ported to v2. Result: all 2,379 US AD HCPs hit NPPES with an empty state -> ~30% match, ~60% no_match
(artificially low). 
  - staging_us_institution_to_state coverage for AD US HCPs: 1,256 / 2,379 (53%).
  - The ~47% unmapped are MOSTLY industry/NIH (correctly unmapped, see #15) PLUS genuine clinical centers
    missing from the oncology-seeded mapping: George Washington University (14, = Silverberg!),
    National Jewish Health (37), Univ Rochester Med Center (18), Children's Hospital Colorado (17),
    Henry Ford, Tufts, Rush, etc.
  - THE MAPPING IS TA-DEPENDENT: seeded from oncology/hep institutions; each new clinical domain (derm)
    brings clinical centers it lacks. -> "extend staging_us_institution_to_state with the new TA's
    clinical institutions" is a REPEATABLE TA-PIPELINE STEP (belongs in playbook).
  - NEXT: (1) extend mapping with AD clinical centers, (2) derive states for AD HCPs, (3) re-run NPPES
    dry-run (match rate should jump), (4) validate Silverberg matches correct NPI (GWU->DC).

### 17. NPPES SCRIPT RETROFIT (done this morning, ready pending state-derivation)

`targeted_nppes_enrichment.py` retrofitted via Cursor to v2 + multi-TA:
  - Schema fixes: derived_state (gone) -> country='US' filter; removed openalex_author_id column ref
    (lives in hcp_openalex_authors_v2). Available hcps_v2 cols confirmed.
  - Scoping: --ta <slug> (via hcp_therapeutic_areas_v2) AND/OR --ingestion-run-id (repeatable). v2
    REFUSES to run unscoped. Candidate filter + write guard + post-load assertion. Provably AD-only.
  - Matcher UNCHANGED (good): score_nppes_match ladder (exact name+taxonomy verify -> institution
    tiebreak -> skip ambiguous), NPI-collision guard (dup NPI on another hcp_id -> ambiguous, skip).
  - GOTCHA: default --min-career-pubs is 500 (excludes almost all AD HCPs) -> must pass low value (5).
  - GOTCHA: script loads .env from its own dir (scripts/enrich/.env) not project root -> either export
    env vars in shell or fix to load_dotenv() root-search. (Minor, for standardization pass.)


### 18. INSTITUTION_MASTER reference table (ADVISOR-PROPOSED — designed, DEFERRED, high-leverage)

Advisor (July 6) flagged that institution identity is re-solved every TA (confirmed: staging_us_institution_to_state
was oncology-seeded; AD needed derm/allergy centers added; every future TA repeats this). Proposed a
reusable `institution_master` reference table instead of per-TA state lookups. This maps DIRECTLY onto the
planned Institution Scientist agent (org chart #5: "Institution Graph"). Independently-arrived-at same
abstraction = strong signal it's right.

Proposed schema (advisor):
  canonical_name, state, institution_type, is_clinical, is_childrens_hospital,
  is_academic_medical_center, is_multi_state, canonical_health_system
  institution_type enum: Academic Medical Center | Children's Hospital | VA Medical Center |
    Private Health System | Specialty Clinic | Research Institute | Government | Industry

Triage RULE (advisor, better than "has med school"): include institutions that "produce physician faculty
who are realistic MSL engagement targets." Excludes strong research universities w/o clinical derm faculty
(NC State, Kansas State, Purdue, U Georgia, Iowa State); includes those operating major academic medical
centers (Michigan, Wisconsin, UVA, Ohio State, Florida, Iowa).

STATUS: DEFERRED — do NOT build now (would derail AD scoring). Build as a deliberate project, ideally as
the Institution Scientist agent's foundation. Populate from ROR + NPPES org data (not hand-entry). Migrate
staging_us_institution_to_state into it and rewire the state-derivation step to read it. For NOW: extend
the existing staging_us_institution_to_state to unblock AD (see #16).

Multi-state handling (Nemours DE/FL, Kaiser NorCal/SoCal/CO/WA): don't force one state; is_multi_state flag
+ canonical_health_system, resolve to regional entity. For AD now: SKIP multi-state/ambiguous ones (a wrong
state causes bad NPPES matches; no-state is safer — name+institution disambiguation handles them).

---

## MONDAY EOD CHECKPOINT (July 6) — NPPES DONE, OPEN PAYMENTS GATE SCOPED

### 19. NPPES LEG COMPLETE (AD)
- targeted_nppes_enrichment.py (retrofitted: --ta scoping, country='US' filter, derived_state).
- State-derivation prerequisite solved: added derived_state column to hcps_v2, populated for AD from
  staging_us_institution_to_state (extended with ~32 AD clinical centers, advisor-validated). 1,490/2,379
  US AD HCPs got a state.
- Encoding gotcha: script crashes on Windows cp1252 with Unicode chars in names -> run with
  `$env:PYTHONIOENCODING="utf-8"` (or fix script to reconfigure stdout, as open_payments_aggregator.py
  already does). Add to multi-TA standard.
- Dry-run: 31.7% high-confidence (709/2239), matches NSCLC baseline 33.0% -> PASS (see GATE_BASELINES #6).
  Silverberg -> npi 1831325521 (GWU/DC) CORRECT; Nanette Silverberg -> different NPI, cleanly disambiguated.
- EXECUTED (write in progress at checkpoint) -> ~709 AD HCPs get NPIs. VERIFY on resume:
  SELECT COUNT(*) FILTER (WHERE npi_number IS NOT NULL) FROM hcps_v2 WHERE ingestion_run_id IN (<2 AD runs>);
  expect ~709; Silverberg npi 1831325521; non-AD enriched-today = 0.

### 20. OPEN PAYMENTS GATE — fully scoped, NOT yet run. 3 prerequisites.
Script: scripts/aggregate/open_payments_aggregator.py. Reads 3yr Open Payments Parquet (2022-24) via
DuckDB. Well-built (handles UTF-8, has canonicals w/ NPIs, --target-version). Computes per-(hcp,ta):
total $, payment count, distinct drugs/companies, and split speaker_bureau/consulting/honoraria; plus
top-10 companies and by-drug. 3yr window. Matches frontend card ($/companies/drugs/contracts).

ATTRIBUTION MECHANISM (critical): INNER JOIN drug_keywords ON ta_id AND (payment.drug = dk.drug_name OR
payment.drug LIKE %dk.brand%). So a payment counts for a TA only if HCP is in that TA AND the drug is in
ta_drug_keywords for that TA. Brand-substring match handles alias recall (mostly obviates a separate
alias table for now).

**PREREQUISITE 1 — ta_drug_keywords EMPTY for AD** (has NSCLC 21, Hep 23, Rare 47, AD 0). INNER JOIN =>
zero AD pharma until populated. ADVISOR-VALIDATED list to insert (payment-matching set = 12 drugs):
  approved_core (10): Dupilumab/Dupixent, Tralokinumab/Adbry, Lebrikizumab/Ebglyss, Nemolizumab/Nemluvio,
    Upadacitinib/Rinvoq, Abrocitinib/Cibinqo, Ruxolitinib/Opzelura, Crisaborole/Eucrisa,
    Tacrolimus/Protopic, Pimecrolimus/Elidel
  late_pipeline (2): Rocatinlimab, Amlitelimab (Phase 3; already drive advisory boards/congress)
  EXCLUDE from payment table: legacy systemics (cyclosporine, methotrexate, azathioprine, MMF) — advisor
  says these are SCIENTIFICALLY relevant (pre-biologic AD investigators) but must NOT drive pharma-payment
  mapping (methotrexate etc. used across many conditions -> would contaminate AD pharma signal). They
  belong to a separate PUBLICATION-ENRICHMENT set, not ta_drug_keywords.
  Schema (existing): drug_name, drug_brand_name, drug_generic_name, is_primary_signal, notes(=mechanism).

**PREREQUISITE 2 — aggregator is NOT --ta scoped.** It GROUP BYs (hcp_id, ta_id) across ALL TAs and writes
pharma for all -> would recompute/rewrite NSCLC's pharma rows. Pharma is THE dimension that broke the
July 3 NSCLC recompute. MUST retrofit --ta scoping so it writes ONLY AD's pharma rows, leaving frozen
NSCLC untouched. (Write/delete WHERE clause was not fully read — confirm on resume; DELETE_GUARD_ID
constant exists.) THIS IS THE NSCLC-SAFETY GATE for this step.

**PREREQUISITE 3 — add Silverberg as AD canonical** (npi 1831325521) for validation. Existing canonicals
are Hep/NSCLC only.

THEN: dry-run -> validate Silverberg shows real Dupixent/Rinvoq engagement (tests the "US AD HCPs will
show strong pharma engagement" hypothesis) -> execute -> pharma dimension populated -> percentile-rank ->
feeds recompute_established_ranks_v3.

### 21. DEFERRED — Advisor's drug-dimension redesign (good, build deliberately later, like institution_master)
Advisor proposed richer model than flat drug table:
  - commercial_status enum: approved_core | approved_legacy | late_pipeline | early_pipeline
    (enables "show KOLs on late-pipeline agents" queries AND lets aggregator filter payment-matching
     drugs (core+late_pipeline) vs enrichment-only (legacy)).
  - Separate the two PURPOSES: payment-matching drugs vs publication-enrichment drugs (legacy systemics).
  - Separate brand-alias table for Open Payments recall (deferred — existing brand-substring match covers
    most of it).
For NOW: use existing schema + just omit legacy systemics from ta_drug_keywords (implements the
"don't drive payments off legacy" rule by omission). Capture richer model as deliberate future build.

### 19b. NPPES write — VERIFIED with 2 minor discrepancies to reconcile next session
- ad_with_npi = 672 (run summary said updated=678; ~6-row gap). Silverberg npi 1831325521 CORRECT.
  non-AD enriched today = 0 (NSCLC untouched — scope held). Data integrity PASSES.
- Discrepancy 1: updated=678 vs 672 persisted NPIs. Likely collision-guard write-time skips or tally
  double-count. Benign (guard skipping dup-NPI writes is correct/safe) but reconcile via
  nppes_enrichment_log_v2.
- Discrepancy 2: enriched_today=0 despite today's writes -> almost certainly UTC-date vs local CURRENT_DATE
  timezone artifact (payloads DID set nppes_enriched_at). Not a data problem; query with proper tz handling.
- NOTE: nppes_enrichment_log_v2 timestamp column is NOT 'created_at' (query errored) — find real column
  name next session to inspect the 254 ambiguous + the write outcomes.

### 21b. ta_drug_keywords AD — INSERTED (12 drugs), advisor-approved with 2 refinements
- 10 approved_core (is_primary_signal=true) + 2 late_pipeline (Rocatinlimab anti-OX40, Amlitelimab
  anti-OX40L; is_primary_signal=FALSE per advisor — "primary signal" should mean routine MA/commercial
  use; flip to true on approval). Legacy systemics EXCLUDED (cross-indication noise).
- Advisor longer-term (folds into §21 redesign): add typed `drug_status` column
  (approved | late_pipeline | discontinued | withdrawn) rather than encoding status in free-text notes.
  For now status lives in notes as approved_core/late_pipeline tag.
- Tacrolimus/Pimecrolimus watch: generic 'tacrolimus' could match systemic Prograf payments (transplant),
  not just topical Protopic (AD). Check in dry-run by-drug diagnostic; if contaminating, switch these two
  to brand-only matching.

### 21c. AD drug list — refined via unmatched diagnostic (now 14 drugs)
- Dry-run "top unmatched for AD" diagnostic surfaced high-$ drugs paid to AD HCPs but not in list.
  Advisor triaged by rule: "US FDA AD indication (or intentionally-tracked late-stage AD pipeline) =>
  include; paid to AD physicians for OTHER conditions (pso/asthma/alopecia/acne) => exclude."
- ADDED 2 (both now US AD-approved, is_primary_signal=true): Tapinarof/VTAMA (AhR agonist topical),
  Roflumilast/Zoryve (PDE4 topical). Both brand+generic populated (OP records them under both).
- EXCLUDED (other-indication payments to same physicians — would inflate AD signal): TREMFYA/SKYRIZI/
  STELARA/COSENTYX/TALTZ/ILUMYA/Otezla/ZEPOSIA (pso/PsA/IBD/MS), Sotyktu (pso), Olumiant (not US-AD),
  Litfulo (alopecia), asthma biologics (NUCALA/TEZSPIRE/FASENRA/AIRSUPRA/BREZTRI/Xolair), acne
  (Winlevi/AKLIEF/Cabtreo/Absorica). This is the attribution correctly isolating AD-specific engagement.
- POST-EXECUTION VALIDATION (advisor): approved AD drugs should DOMINATE the payment records over time —
  Dupixent, Rinvoq, Cibinqo, Adbry, Ebglyss, Nemluvio, Opzelura, Eucrisa. If one is essentially ABSENT,
  investigate (data-integration bug vs commercial timeline). Predicted: Dupixent dominates (market leader);
  newer agents smaller (recent launch). Add this as a pharma-gate baseline check.

### 21d. drug_status field — advisor recommended TWICE (prioritize in §21 redesign)
Advisor independently re-raised: replace free-text status-in-notes with a typed field
`drug_status` / `commercial_scope`: approved_ad | late_pipeline_ad | other_indication. Aggregator then
filters on approved_ad (+ optionally late_pipeline_ad) instead of parsing notes. Two independent advisor
passes converging = strong signal. Still DEFERRED (no mid-execution schema migration) but promote to
top of the drug-dimension redesign priority.

### 21e. REUSABLE PLAYBOOK STEP surfaced: drug-list refinement loop
For every new TA's Open Payments gate: (1) populate ta_drug_keywords conservatively (advisor core list),
(2) run aggregator DRY-RUN, (3) triage the "top unmatched for <TA>" diagnostic with advisor (add genuine
TA-indicated drugs, exclude other-indication noise), (4) re-run dry-run to confirm adds match + remaining
unmatched is all legit other-indication, (5) execute. The unmatched diagnostic is the drug-list QA tool.
Belongs in TA_NEW_PLAYBOOK next to the aggregator step.

### 21f. Aggregator log-line cleanup (agent-safety, minor) + 49298 reconciled
- The "Loaded 49298 FieldMark NPIs" line prints the FULL platform NPI count BEFORE the TA scoping is
  applied (next line: "[SCOPE] NPI cohort scoped to TA HCPs: 783 NPIs"). It is a logging-ORDER artifact,
  NOT a scoping failure. Confirmed by 3 signals: scoped count 783, AD-sized output (474 summary/275 by_ta),
  pre-write assertion passed.
- AGENT-SAFETY FIX (minor, do next time script is open): reword so it can't be misread as unscoped, e.g.
  "Loaded 49,298 platform NPIs; scoped to 783 for <TA>." Prevents agent false-alarm/abort.
- 783 vs today's 672 NPPES matches: gap is AD HCPs who already had NPIs from being in another TA first
  (cross-TA HCPs). Expected; they correctly contribute AD-drug payments. (Optional confirm:
  783 ~= 672 + pre-existing.)
- Re-run after adding tapinarof/roflumilast: both dropped off unmatched (now matched); Silverberg AD
  total 1,706,352 -> 1,738,236 (+32K = his VTAMA/Zoryve). Remaining unmatched all other-indication. Drug
  list validated COMPLETE. Cleared to execute.

### 14b. §14 REFRAME (user insight) — pharma-0 may be a COHORT question, not just a scoring one
User insight: "if they don't have industry engagement yet, maybe they're a Rising Star, not Established."
I.e., pharma engagement partly proxies career stage -> low/no pharma may mean the HCP belongs in Rising
Star, scored differently, rather than being penalized in Established scoring. If cohort classification
correctly routes low-engagement HCPs to Rising Star, the Established cohort would be mostly pharma-having
and the penalizing-0 problem shrinks.
CAVEAT (why it's only ~half the answer): pharma-0 has (at least) 3 causes needing different treatment:
  (a) early-career US clinician -> insight applies; route to Rising Star; pharma-0 in Established is moot.
  (b) ESTABLISHED INTERNATIONAL KOL -> pharma-0 is a US-data COVERAGE GAP, not junior-ness. AD is ~82%
      international, so potentially large. Penalizing is wrong (the "missing data" view). NOT solved by
      the Rising Star reframe.
  (c) established non-consulting academic/NIH -> pharma-0 arguably a real low score. Judgment.
ACTION: (1) check whether cohort_classification USES pharma/industry engagement as a signal (if yes, the
insight is already operative; if no, it's a proposal). (2) After AD cohort classification runs, inspect
the Established cohort: how many pharma-0, and are they intl KOLs (data gap) vs should-be-Rising-Stars?
(3) THEN decide §14 empirically — likely splits into "reclassify juniors" + "handle intl pharma-0 as
missing-not-zero". Also: run recompute both ways (penalizing-0 vs weight-available) and compare top-30.

### 22. Pharma scoring — WORKS; breadth-vs-dollars weighting is a review item (not a blocker)
pharma_engagement_scoring.py verified: --ta scoped, NSCLC-safe upsert (ON CONFLICT hcp_id,ta_id), reads
hcp_open_payments_by_ta_v2, writes hcp_pharma_engagement_v2. Weights: payments 0.30, companies 0.35,
drugs 0.25, count 0.10 -> breadth (companies+drugs=60%) dominates dollars (30%).
AD dry-run: 275 HCPs. Top-20 are all real engaged US derm KOLs (Eichenfield #14, Silverberg #15,
Chovatiya, Craiglow, Shahriari, Strober, Zeichner, Alexis, Friedman...). Marquee KOLs confirmed pharma-rich.
OBSERVATION (advisor review item, not a bug): because breadth saturates (most top HCPs = 9 companies/9
drugs), ranking among them is driven by count + the 9-vs-8 breadth edge, producing counterintuitive
dollar ordering: Serrao #1 at $538K outranks Silverberg ($1.74M, #15) and Zirwas ($1.89M, #16). Defensible
(broad landscape engagement = central KOL) but "person with 3.5x the money ranked lower" may look wrong to
users. Whether breadth or dollars SHOULD dominate the pharma dimension is a product/advisor decision.
Leave AS-IS for now (matches NSCLC pharma scoring = cross-TA consistency; only 15% of composite).
Reconfirms §14 framing: top-20 are pharma-RICH US clinicians; the pharma-0 problem is entirely about the
~15,600 NOT in the 275 (intl KOLs + juniors) -> a cohort-classification question.

### 22b. Pharma breadth weighting — RATIONALE (user), reclassify from "review item" to "deliberate/correct"
User reframe: breadth (companies+drugs, 60% of pharma score) measures an HCP's WILLINGNESS TO TAKE ON NEW
PARTNERSHIPS / partnership receptivity — which is the MSL-relevant signal (who is an engaged, approachable,
broadly-trusted KOL that companies successfully partner with), NOT "who made the most money." So Serrao
(9 companies/9 drugs, $538K) ranking above Zirwas ($1.89M, 8/8) is CORRECT by design: broad engager =
more receptive to a new company's outreach; high-dollar/narrow = deeper but committed to fewer players.
=> The breadth-over-dollars weighting is DELIBERATE and defensible, not a quirk to fix. Downgrade the
"advisor review item" (22) to "documented rationale; leave as-is." (Could still confirm w/ advisor, low
priority.)
Combined model of the pharma dimension (from this session's two insights): it measures REALIZED, DEMONSTRATED
US industry-partnership activity. High = engaged US KOL; low/absent = early-career (Rising Star, §14b-a) OR
international (US-data coverage gap, §14b-b). This model sharpens §14: penalizing pharma-0 penalizes "no
demonstrated US partnership yet/visibly" — arguably fair-ish for juniors, unfair for established intl KOLs.

### 23. FOUNDATIONAL GAP FOUND — Established/Rising Star cohort classifiers DO NOT EXIST as scripts
The scoring pipeline is a CLASSIFY-then-SCORE pattern per cohort. Community has BOTH:
  community_classification.py (SETS hcps_v2.cohort_classification='community') -> community_scoring.py.
But Established and Rising Star have ONLY scorers, NO classifiers:
  - established_scoring.py READS `where cohort_classification='established'` (superseded anyway: 6-component
    w/ trial+pharma_breadth, hardcoded HEP+NSCLC, writes hcp_established_scores_v2 — NOT the v3 model).
  - rising_star_scoring.py READS `where cohort_classification='rising_star'` (Momentum 70% + Visibility 30%,
    academic-only; trajectory/velocity based).
  - NO established_classification.py, NO rising_star_classification.py anywhere. No cohort SQL migration
    either (only phase1_schema.sql, us_institution_state_lookup.sql reference nothing relevant).
=> Whatever SET cohort_classification='established'/'rising_star' for NSCLC/Hep (22,364 each — note
   IDENTICAL counts, suggests a FIXED CAP not criteria-based) is a LOST/MANUAL/one-off process, never
   committed as a reusable classifier. This is the deepest undocumented NSCLC-era step.

IMPACT: AD cohort_classification = 168 established / 1,594 rising_star / 14,140 NULL. The non-null values
are of UNCERTAIN provenance (partial run? or global-column bleed from other TAs — see below). To classify
AD's 14,140 NULL HCPs there is NO SCRIPT TO RUN. The Established classifier must be RECONSTRUCTED or
DESIGNED, then written as a proper --ta-scoped established_classification.py (following the community
pattern). This BLOCKS all Established scoring for AD (publication_leadership/network/pharma scorers all
read the Established cohort; recompute reorders it).

ALSO — architectural issue: cohort_classification is a SINGLE GLOBAL column on hcps_v2 (not per-TA). An
HCP established in NSCLC but a nobody in AD would still read 'established'. So AD's 168 'established' may be
polluted by established-elsewhere HCPs. The cohort model likely NEEDS to become per-(hcp,ta) — big design
question. (hcp_established_ranks_v2 IS per-TA, but the upstream classification column is not.)

RISING STAR INSIGHT RESOLUTION (user's §14b hypothesis): the Established-vs-Rising split is
SENIORITY/STOCK (accumulated leadership) vs TRAJECTORY/FLOW (recent momentum/velocity), NOT engagement.
So pharma-0 does NOT route someone to Rising Star. A pharma-0 established international KOL = high stock,
low velocity = stays Established. Therefore §14 (pharma-0 penalized in Established) REMAINS REAL and is
NOT rescued by cohort classification. Fix §14 at the recompute (weight-available-signals), not via cohorts.

NEXT-SESSION PRIORITY (foundational, do fresh): (1) determine what defined NSCLC/Hep Established (the
22,364 — fixed cap? threshold on what?) via inspecting those HCPs' shared properties; (2) decide the
Established definition (and the per-TA column question); (3) write established_classification.py
(--ta-scoped, community-pattern) + rising_star_classification.py; (4) run for AD; (5) THEN the component
scorers + recompute. This is real methodology/design work, not execution.

### 23b. RESOLVED diagnosis — Established/Rising classifier was NEVER scripted (ad-hoc), but RECONSTRUCTIBLE
Exhaustive grep (.py/.sql/.ipynb) for any WRITE to cohort_classification: ONLY community_classification.py
(line 201, sets 'community'). NO writer for 'established'/'rising_star' exists anywhere. generate_narratives_v2.py
lines 964/996 are RED HERRINGS — they set cohort_classification on in-memory HCPContext objects (labels for
narrative templates), iterating already-scored *_v3_by_pair; they never UPDATE hcps_v2.
CONCLUSION: NSCLC/Hep Established+Rising classification (4,394 NSCLC established) was done by a HAND-RUN
SQL UPDATE or uncommitted notebook — never captured as a reusable script. Community got a proper classifier;
Established/Rising did not.
RECONSTRUCTION IS FEASIBLE: hcps_v2.cohort_score (numeric) still holds the score the lost classifier computed
and thresholded. So we can recover (a) the THRESHOLD from the cohort_score distribution by classification,
and (b) likely the FORMULA by correlating cohort_score with pubs/senior-authorship/etc.
PLAN (next focused session — this is the foundational project): 
  1. Recover threshold from cohort_score distribution (established min vs rising max = the cutoff).
  2. Recover/decide the cohort_score formula (what it's computed from).
  3. Resolve the per-TA architecture Q (§23): cohort_classification is a GLOBAL column; needs to be per-(hcp,ta)
     or the classifier must be TA-aware. This is a real design decision.
  4. WRITE established_classification.py + rising_star_classification.py (--ta scoped, community pattern).
  5. Run for AD -> classify the 14,140 NULL AD HCPs.
  6. THEN component scorers (publication_leadership/network/pharma[done]) + recompute_established_ranks_v3.
Also check: sql/rebuild/us_institution_state_lookup.sql line 158 "Only updates publication HCPs
(cohort_classification IS NULL)" — may be related to how publication HCPs get a default; inspect.

### 23c. THRESHOLD RECOVERED — Established = cohort_score >= 85; split is 2-DIMENSIONAL
NSCLC cohort_score distribution by classification:
  established:  n=4394,  cohort_score 85.0-100 (avg 90.8, median 88)  -> THRESHOLD: cohort_score >= 85
  rising_star: n=26720, cohort_score 0-100 (avg 26.8, median 26.5)   -> OVERLAPS established range!
  community:   n=6479,  cohort_score NULL (NPPES-sourced, community_classification.py)
  null:        n=42424, unclassified publication base
KEY INSIGHT: rising_star spans 0-100 INCLUDING >85, overlapping established. So cohort_score alone does
NOT determine cohort -> classification is 2-DIMENSIONAL:
  - Established = high accumulated-leadership STOCK (cohort_score >= 85).
  - Rising Star = high MOMENTUM/velocity (separate score; rising_star_scoring.py = Momentum 70% +
    Visibility 30%). A rising star can also have a high established cohort_score.
So the lost classifier: computed cohort_score (established/leadership score), flagged >=85 established, and
SEPARATELY flagged high-momentum HCPs rising_star.
STILL UNKNOWN: how cohort_score (0-100, looks like a percentile) is COMPUTED. Likely from
publication_leadership_scoring.py (scientific dim) or a dedicated establishment score. NEED to reproduce
this formula for AD unless AD already has cohort_score values (checking next).

### 23d. cohort_score writer ALSO not in committed code; recovering from prior chat history
Grep for cohort_score writers: all are READS (generate_narratives_v2, spot_check) or the recompute
computing hcp_established_ranks_v3.cohort_score (NOT hcps_v2.cohort_score). So hcps_v2.cohort_score (the
column thresholded >=85 for Established) is ALSO written by the lost/ad-hoc process, same as
cohort_classification. Neither the score nor the classification writer is in the repo.
Partial AD run (the 1,762 scored): 270 US + 1,371 non-US, avg 9.2 pubs (below established avg 32.8) —
looks like an early/test batch or specific sub-scope, NOT US-only or elite-only.
USER ACTION: recovering the classifier method from a prior project chat (few weeks ago). Need: (1) how
hcps_v2.cohort_score is computed (formula/inputs, script vs notebook vs manual SQL); (2) the established
(>=85) vs rising_star (momentum-based) split logic; (3) whether it was ever committed or must be rebuilt.
Once recovered -> rebuild as proper --ta classifier(s), run for AD's 14,140 unscored, then scorers+recompute.

### 23e. RECOVERED (from "Working with Cursor Pt.12", May 29 2026) — full cohort classification methodology
THE WHOLE LOST METHODOLOGY (all ad-hoc SQL, never committed — this IS the missing artifact):

STEP 1 — normalized_score: produced by scoring_pipeline.py per TA -> writes hcp_scores_v2
  (normalized_score, composite_score). NOTE: scoring_pipeline.py is the v1.4 TRIALS-BASED script we earlier
  flagged as superseded (§12)!! Must verify whether current model still uses it for normalized_score, or
  if that's stale. THIS IS A CONFLICT TO RESOLVE.

STEP 2 — tier CASE (recovered May 5 "Pt.5", also never scripted). Applied as manual SQL to hcp_scores_v2:
  WHEN normalized_score >= 95 AND pub_velocity > 0 AND citation_trajectory > 0
       AND COALESCE(career_pubs,0) < 250            -> 'dark_horse'
  WHEN normalized_score >= 85
       AND (first_pub_year < 2008 OR career_pubs >= 250) -> 'established'
  WHEN normalized_score >= 85                        -> 'rising_star'
  WHEN normalized_score >= 30                        -> 'emerging'
  ELSE 'unranked'
  => ESTABLISHED IS NOT JUST score>=85. It's score>=85 AND (first_pub_year<2008 OR career_pubs>=250).
     The career_pubs>=250 fallback exists b/c OpenAlex first_pub_year was unreliable (career-enrichment
     inflation bug). So Established = high score AND (senior by career-start OR very high pub volume).
     Rising Star = high score (>=85) but NOT senior (recent start, moderate pubs) = high stock, early career.
     [This partly VALIDATES user's §14b Rising Star intuition: rising_star ARE high-scorers who are earlier-
      career. But split is career-age/volume, NOT pharma engagement.]

STEP 3 — May 29 backfill (ad-hoc SQL, backed up as hcps_v2_cohortscore_backup_20260529):
  hcps_v2.cohort_score = MAX(normalized_score) across all that HCP's hcp_scores_v2 rows (GLOBAL max across
  TAs — NOT per-TA! confirms the global-column problem §23).
  hcps_v2.cohort_classification = tier from the HCP's top-scoring row.

COMMITTED SCRIPTS: only scoring_pipeline.py (normalized_score). Tier CASE + both backfills = never scripted.

TO REPRODUCE FOR AD:
  1. Run scoring_pipeline.py for AD -> normalized_score in hcp_scores_v2. (BUT verify scoring_pipeline.py
     isn't the superseded trials-based one, or reconcile.)
  2. Apply tier CASE (SQL) to AD's hcp_scores_v2 rows.
  3. Backfill hcps_v2 cohort_score + cohort_classification for AD (WHERE cohort_classification IS NULL).
  4. THEN publication_leadership/network/pharma scorers read the Established cohort; recompute_ranks_v3.

ADVICE (from recovery + today): BUILD cohort_classification_backfill.py as a committed --ta script so the
next TA never needs this archaeology again. This is THE gap that cost today.

### 23f. TWO COMPLICATIONS to resolve BEFORE running the recovered SQL (do NOT run as-is)
COMPLICATION 1 — scoring_pipeline.py is SUPERSEDED (trials-based, §12). The recovered method uses its
normalized_score for COHORT ASSIGNMENT, while recompute_ranks_v3 uses the NEW 3-dim model (0.50/0.35/0.15)
for WITHIN-cohort RANKING. So classification and ranking use DIFFERENT models. DECIDE: is trials-based
normalized_score still the right basis for deciding WHO is Established? (Trials were dropped as unreliable
-> using a trials-based score to gate cohorts is questionable.) May be intentional (classify vs rank are
different jobs) or debt. Resolve before running.

COMPLICATION 2 — classification is GLOBAL not per-TA (recovered SQL confirms: cohort_score = MAX(normalized_
score) across ALL TAs; cohort_classification = tier of top-scoring row across ALL TAs). So an HCP Established
in NSCLC reads 'established' globally -> would show Established in AD even if a nobody in AD. The recovered
AD backfill (WHERE cohort_classification IS NULL) SKIPS already-classified cross-TA HCPs AND could classify
AD HCPs by their NSCLC score. WRONG for a per-TA product. DO NOT run as-is.

=> NEXT-SESSION FOUNDATIONAL TASK (fresh, deliberate): design + build committed cohort_classification_backfill.py
   that is (a) --ta scoped, (b) classifies by the HCP's standing IN THAT TA (per-TA, not global max),
   (c) uses the correct/decided normalized_score basis, (d) applies the recovered tier CASE, (e) NSCLC-safe.
   Then run for AD -> classify 14,140 -> component scorers -> recompute_ranks_v3 -> THE generalization verdict.
   Building this committed script is the permanent fix for the gap that cost this whole afternoon.

SESSION STATUS at this point: enrichment legs DONE (NPPES 672, Open Payments 275+scored pharma). Cohort
classification FULLY DIAGNOSED + methodology RECOVERED, but correct application needs the 2 decisions above.
Clean checkpoint — foundational build is next session's focused work.

### 14c. §14 RESOLVED (from Cursor Pt.19, July 3) — recompute REWEIGHTS, does NOT penalize missing pharma
CRITICAL CORRECTION: recompute_established_ranks_v3 does NOT treat missing pharma as penalizing-0, DESPITE
its docstring saying so. The DOCSTRING IS MISLEADING. Actual behavior (confirmed in July 3 analysis):
"missing signals get reweighted proportionally (w/total_w), not zeroed out. An HCP with no Pharma isn't
penalized — their Scientific and Network percentiles re-normalize to fill 100%."
So an AD HCP with no pharma: Sci*(0.50/0.85) + Net*(0.35/0.85). NOT penalized.
=> §14 (and §14b intl-KOL concern, §22 pharma-0 worry) LARGELY DISSOLVES. The "weight-available-signals"
fix was ALREADY IMPLEMENTED. No methodology change needed for missing pharma.
REMAINING perverse property (opposite of what we feared): a no-pharma HCP can slightly OUTRANK a
modest-pharma HCP (no-pharma fills 100% on Sci+Net; modest pharma drags the weighted avg down). This is
the real Janne->#30 story: he GAINED moderate pharma data and it LOWERED him ~2pts. Not a missing-data
penalty — a modest-data drag. Worth naming as a methodology critique but it's by-design, not a bug.
ACTION: fix the misleading docstring in recompute_established_ranks_v3.py (says "penalizing", actually
reweights). Minor, agent-safety (an agent reading the docstring would misunderstand).

### 12b. TWO scoring systems coexist (from Cursor Pt.19) — resolves the trials question partially
Confirmed July 3: TWO scoring systems coexist by design/debt:
  - hcp_scores_v2 (normalized_score): OLDER "Option C" weights = 50% pubs / 10% years / 25% engagement /
    15% companies. This is what scoring_pipeline.py (v1.4) produces. (Note: this desc DIFFERS from the
    v1.4 docstring's 15% pubvel/35% cittraj/25% trial — need to reconcile which is actually live; the
    "Option C" may be a later revision. BUT both are the CLASSIFICATION-basis score.)
  - hcp_established_ranks_v3 (cohort_score): NEWER 50% Sci / 35% Net / 15% Pharma (trials-free) = the
    RANKING within Established.
So: CLASSIFICATION uses the old scoring_pipeline.py normalized_score; RANKING uses the new 3-dim model.
Trials were dropped from the RANKING (ranks_v3 is trials-free) but scoring_pipeline.py (classification)
still has trial lineage. The divergence is real and predates AD. STILL TO CONFIRM via more chat history:
when trials were "dropped 3-4 wks ago," did it include the classification normalized_score or only ranking?

### 23g. TRIALS QUESTION RESOLVED (from chat recovery) — NO CONFLICT; scoring_pipeline.py correct as-is
Complication 1 (§23f) is RESOLVED and was a FALSE alarm. Full timeline recovered:
- Trials were dropped from ESTABLISHED RANKING (recompute_ranks_v3) on June 6 (Pt.14), advisor-validated:
  trial activity was noisy AS A RANKING signal + CT.gov data ceiling. Ranking went 60/40 -> later 50/35/15.
- Trials were NEVER removed from COHORT CLASSIFICATION (scoring_pipeline.py, trial_investigator_score 25%),
  and this is INTENTIONAL/correct, not an oversight. The two uses legitimately diverge:
    CLASSIFICATION (scoring_pipeline.py, trials 25%): "is this HCP Established/Rising/Community?" — trials
      help IDENTIFY research-active HCPs (200 pubs + 30 trials is more clearly Established than 200 + 0).
      A CATEGORY distinction.
    RANKING (recompute_ranks_v3, no trials): "among Established, who's higher?" — Sci+Net+Pharma cleaner
      WITHIN-category. A RANKING distinction.
=> scoring_pipeline.py is CORRECT AS-IS for cohort classification. NO rewrite needed. Trials belong here.
   Use it for AD as-is (re: trials). The docstring/weights (15% pubvel, 35% cittraj, 25% trial, 10%
   congress, 10% msl, x cross/career multipliers) are the live, intended classification composite.
NOTE: no evidence of a June CT.gov re-ingestion. Trial data last built ~late May (Pt.8 full re-ingest
--reset-checkpoint; Pt.10 matching 3.1%->19.5%). Verify via: SELECT MAX(created_at),MAX(updated_at),COUNT(*)
FROM trial_investigators_v2; (late-May timestamps = no June re-run).

REMAINING classification complications (NOT the trials one): (a) global-vs-per-TA column (§23f #2 — still
real); (b) threshold calibration (85 v1 -> 65 v2 recalibration -> AD 82%-intl may need its own); (c) does
AD even HAVE trial data? (if AD trial_investigators sparse, the 25% trial weight is ~dormant for AD anyway
-- check). §14/§14c (missing-pharma reweight) already resolved.

### 24. THIRD MISSING ENRICHMENT LEG FOUND — AD trials are UNDER-INGESTED (blocks correct classification)
AD trial coverage vs NSCLC:
  NSCLC: 7,542 HCPs-with-trials, 21,253 links.
  AD:      194 HCPs-with-trials,    515 links  (1.2% of ~15,902 AD HCPs).
39x gap. AD is a heavily-trialed space (dupilumab/JAK/biologic Phase 2/3 programs enroll globally) — 194
investigators is IMPLAUSIBLY low. => AD trials were NEVER properly ingested/matched (same pattern as NPPES
and Open Payments — pipeline run for NSCLC/Hep, not AD). This is the THIRD missing AD enrichment leg.
WHY IT MATTERS: trials = 25% of the cohort-CLASSIFICATION composite (scoring_pipeline.py). At 1.2% coverage,
research-active AD investigators who SHOULD get the trial signal don't -> classifying AD now would UNDERCOUNT
genuine AD researchers -> mis-classify some who should be Established. So trials ingestion must precede
AD classification.
TRIALS PIPELINE SCRIPTS: ingest/trials_pipeline.py (CT.gov ingest), classify/trial_investigator_matcher.py
(match investigators->HCPs, historically 3.1%->19.5%), classify/trial_ta_mapping.py (trial->TA), 
enrich/backfill_trial_investigators.py. All likely need --ta/verify + run for AD. Potentially a BIG leg
(CT.gov API pulls, checkpointed full run, hard matching). NOT a quick fill.

REVISED ROAD TO AD SCORING (dependency order):
  1. [BIG] Trials ingestion for AD (trials_pipeline -> matcher -> ta_mapping). Verify each --ta-safe first.
  2. [FOUNDATION] Build cohort_classification_backfill.py (--ta, per-TA fix for global-column, recovered
     tier CASE) -> run scoring_pipeline.py for AD (all-TA, needs --ta scoping too!) -> apply tiers -> backfill.
  3. Component scorers: pharma DONE; publication_leadership + network_centrality for AD.
  4. recompute_established_ranks_v3 --ta atopic-dermatitis -> AD Established rankings (generalization verdict).
Note: scoring_pipeline.py is ALSO all-TA (no --ta), loads full HCP set -> needs --ta scoping before any
real (non-dry-run) run, else it rewrites NSCLC/Hep normalized_scores (frozen-TA risk).

SESSION END STATE: 3 enrichment legs identified for AD; NPPES + Open Payments DONE; TRIALS not started.
Cohort classifier methodology fully recovered (§23e), trials-in-classification confirmed correct (§23g),
§14 pharma reweight resolved (§14c). Two big legs remain (trials ingestion, cohort classifier build) before
the recompute. This is multi-session foundational work — appropriately so.

### 25. INCIDENT (July 6) — trials_pipeline.py write bug DEGRADED matched trial links across ALL TAs
WHAT HAPPENED: ran trials_pipeline.py (v2, --ta atopic-dermatitis) at --limit 5 and --limit 100 (live
writes, NO dry-run — process failure, see below). A bug in the write path (insert_links upsert conflict
logic, ~lines 588-690, esp. 624/679) OVERWROTE existing matched links (hcp_id set) with RAW rows
(hcp_id NULL) when re-ingesting SHARED trials. Damage crossed TA boundaries via shared trial rows.

DAMAGE (matched links, hcp_id NOT NULL):
  NSCLC:  21,253 -> 18,209  (-3,044 links, -845 HCPs)
  Hep:    (was higher) -> 20,961
  Rare:   -> 5,240
  AD:        514 -> 440     (-74)
ALL FOUR TAs degraded, INCLUDING FROZEN NSCLC (under advisor review). --ta scoping did NOT protect frozen
TAs because the damage vector is SHARED TRIAL ROWS, not HCP selection. KEY LESSON: scoping the INPUT
(which HCPs are processed) does NOT protect shared OUTPUT rows.

ROOT CAUSE: insert_links() upsert conflict resolution downgrades matched->raw. When a trial already
matched to HCP-X is re-ingested while processing HCP-Y, the raw investigator roster write overwrites
HCP-X's matched row, nulling hcp_id.

RECOVERABLE: YES. Matches are deterministically recomputable from intact source (trials, investigator
names, HCP names/affiliations). Dry-run proved matcher works (Paller NCT00817219 score 100). Lost links
regenerate on a FIXED re-run per TA. Nothing permanently lost.

RECOVERY PLAN (in order, next session, deliberate):
  1. FIX the bug: insert_links() conflict logic must NEVER downgrade a matched row (hcp_id set) to raw
     (hcp_id NULL). Matched rows win over raw on conflict. Add a guard/test.
  2. Add a REAL --dry-run gate (done this session) + take a backup of trial_investigators_v2 BEFORE re-run.
  3. Re-run fixed pipeline per TA to RESTORE: NSCLC (->=21,253), Hep, Rare, AD, then finish AD ingestion.
  4. Verify each TA returns to >= prior matched-link count.

PROCESS FAILURES (own them, fix the standard):
  - Ran a write pipeline with NO --dry-run; first run should ALWAYS be dry-run (now in playbook standard).
  - No backup taken before running an unvalidated write pipeline against production/frozen-TA data.
  - Assumed --ta scoping = frozen-TA-safe without reasoning about shared-row write vectors.
  - Only caught via SQL verification (user insisted) BEFORE the full 15,800-HCP run — which would have
    been catastrophic (platform-wide wipe). SQL-verify-before-scaling is why damage was bounded.
NEW STANDARD RULE: for any pipeline that writes SHARED rows (trials, institutions, publications), --ta
scoping is NOT sufficient for frozen-TA safety. Must verify shared-row write behavior + back up first.

### 25b. FIX CONFIRMED WORKING (July 6, same session) — RPC preserves matches; restore underway
Root cause (§25): v2 path used blanket Supabase .upsert(on_conflict=...) which does ON CONFLICT DO UPDATE
SET (all cols), overwriting existing hcp_id with incoming NULL when re-ingesting shared trials. v1 path
had a match-preserving RPC (upsert_trial_investigators_preserving_match, hcp_id=COALESCE(EXCLUDED.hcp_id,
existing)) but it targets the v1 table only; v2 rewrite dropped this protection.
FIX: created v2 RPC upsert_trial_investigators_v2_preserving_match (same COALESCE-preserve logic, v2 table;
match_confidence=GREATEST; source preserved when existing is matched). Deployed via run_sql.py. insert_links()
v2 path now calls this RPC instead of .upsert(). Unique constraint trial_investigators_v2_natural_key
(trial_id, raw_first, raw_last, role, source) confirmed present (RPC ON CONFLICT depends on it).
VERIFICATION (go/no-go PASSED): NSCLC baseline 18,209 links / 6,697 HCPs. Ran fixed pipeline
--ta nsclc --limit 50 --reset-checkpoint (live). After: 18,223 / 6,700 -> count went UP (+14/+3), not down.
Pre-fix a live run DROPPED the count; now it RESTORES. Fix confirmed. Matches (Creelan score 100, Newton,
Udelsman) correct. Backup floor: trial_investigators_v2_backup_20260706.
RESTORE PLAN (in progress): full re-run per TA to recover to >= prior counts, in order:
  NSCLC (target >=21,253) -> Hep (>=~24,005? was higher, now 20,961) -> Rare (prior?) -> AD (finish full
  ingestion, was 514 pre-incident, will exceed once fully run). Each --ta scoped, --reset-checkpoint for a
  clean full pass, verify count after each. scoring downstream waits until trials restored.

### 25c. NSCLC RESTORE COMPLETE — incident closed for NSCLC
Full fixed re-run (--ta nsclc --reset-checkpoint, all 14,386 HCPs) done. DB verification:
  NSCLC matched links: 24,014 (pre-incident 21,253; +2,761) | HCPs: 7,541 (pre-incident 7,542; =).
Same trialist set, MORE links each = new CT.gov trials since the May ingestion, captured by the fixed
pipeline. NSCLC not just restored but enriched. Damage (had dropped to 18,209) fully reversed.
Table health: trial_investigators_v2 now 330,321 rows (49,908 matched / 280,413 raw). Growth is expected
trial-roster metadata; RPC dedup kept it sane. No pathological bloat.
INCIDENT STATUS: CLOSED for NSCLC (frozen TA restored + enriched). Fix (§25b) proven at full scale.
Remaining: Hep + Rare still degraded (user deprioritized for now — restore later with same
--ta <slug> --reset-checkpoint pattern, verify >= prior). AD next: full ingestion (finally).

### 26. MAJOR FINDING — AD HCP membership is ~28% CROSS-CONTAMINATED (blocks scoring)
Discovered while validating AD trial ingestion: AD's trial-linked HCPs are mostly NON-dermatologists.
Top AD-tagged HCPs by trial links include Sanyal, Loomba, Bajaj, Sterling, Allegretti, McClain
(HEPATOLOGY giants), Odunsi, Chatta, A. Miller (ONCOLOGY), Zhaoping Li, Gardner (nutrition), Safdar,
Hohmann, Khoruts, Kashyap (ID/microbiome). Only Paller, Guttman-Yassky, (Silverberg) are real AD KOLs.
QUANTIFIED: of 15,902 AD-tagged HCPs, 3,409 (21.4%) also tagged Hepatology, 985 (6.2%) also NSCLC.
>= ~28% cross-tagged to another TA. Systematic over-tagging, not a small tail.
LIKELY MECHANISM: HCP-TA membership tags an author to AD if they appear on ANY paper in the AD corpus,
with NO threshold on how much of their work is actually AD. Comorbidity/microbiome/immunology/review
papers that mention AD alongside other diseases pull in non-AD authors (e.g. a NASH paper mentioning AD
comorbidity -> Sanyal tagged AD). The corpus rebuild (23,390 MeSH-anchored pubs) may be clean at the
PUBLICATION level but the AUTHOR->TA membership is over-inclusive.
IMPACT: this is UPSTREAM of everything. Classifying/scoring AD now would put hepatologists (Sanyal/Loomba)
into AD's Established cohort -> corrupts the generalization verdict, the pharma scoring (275 may include
contaminants), and any rankings. CANNOT build cohort classification on a 28%-contaminated membership.
BLOCKS: AD cohort classification, AD scoring, the generalization test. Must be fixed FIRST.
CANDIDATE FIXES: (1) membership relevance THRESHOLD (HCP is AD only if >=N AD papers, or AD >=X% of output,
or senior-author on AD papers); (2) primary-TA assignment (score HCP in their dominant TA, not every tagged
TA); (3) assess degree (how many AD pubs each cross-tagged HCP truly has). Need to check pub->TA linkage
schema to quantify degree.
ALSO REVISIT: does NSCLC/Hep membership have the same contamination? (They may — same tagging mechanism.
If so, prior cohorts are also affected. Check.)
NEXT SESSION PRIORITY: diagnose + fix AD membership contamination BEFORE classification/scoring. This is
the new top blocker, above finishing trials ingestion (clean trials on a dirty cohort = dirty cohort).

### 25d. AD trials run INTERRUPTED at 466/15,902 (resume later, AFTER membership fix)
AD trials run (--ta atopic-dermatitis --reset-checkpoint) was interrupted at 466 HCPs (checkpoint=466).
AD links 451/171 (~flat vs pre 514/194); Silverberg still 0 (not reached). Resume via --ta
atopic-dermatitis (NO --reset-checkpoint) -> continues from 466. BUT: hold until membership contamination
(§26) is resolved, since re-ingesting trials for contaminant HCPs (Sanyal etc.) just adds more non-AD
trial data. NSCLC confirmed HELD at 24,014 after AD partial run (fix working across shared trials).

### 26b. CORRECTION to §26 — NOT contamination. Membership is SOUND. Cross-TA HCPs are legitimate.
§26's "28% contamination" alarm was WRONG (I pattern-matched hepatology names without checking their AD
pub records). Actual AD-pub distribution for the 15,902 AD HCPs:
  just 1 AD pub:   13   (thirteen!)
  2-4 AD pubs:  10,590
  5+ AD pubs:    5,299
=> Essentially EVERY AD-tagged HCP has MULTIPLE AD publications. If membership were contaminated by
incidental one-paper tagging, the "1 AD pub" bucket would be in the thousands. It's 13. Membership is CLEAN.
The 3,409 also-Hep HCPs (Sanyal, Loomba, etc.) are LEGITIMATE multi-TA researchers with real AD pub
records (2-4+ AD pubs each) - NASH/metabolic-immunology genuinely overlaps AD immunology. This is the
v2 multi-TA architecture WORKING AS DESIGNED: one canonical hcps_v2 row, tagged to every TA with genuine
pub presence, intelligence scoped per-(HCP, TA). We addressed/expected this before.
Why hepatology names topped AD's TRIAL list: they're prolific trialists overall (hundreds of trials), so
even their AD-adjacent trial activity is high-volume. Not mis-tagging - just high baseline activity.
REAL question (not contamination): when SCORING/RANKING AD, ensure per-(HCP,TA) scoping so a multi-TA HCP's
AD rank reflects their AD-SPECIFIC work, not total output - so a hepatologist who genuinely dabbles in AD
doesn't outrank a pure AD dermatologist on the strength of non-AD activity. The architecture already scopes
per-TA; just verify the scorers honor it. This is the normal per-TA scoring discipline, NOT a data fix.
§26 "must fix membership before scoring" is RETRACTED. No membership fix needed. Proceed to classification/
scoring with normal per-TA scoping. AD trials run can resume (§25d) - the cross-TA HCPs' AD trials are fine.

### 25e. WHY AD TRIALS ONLY DID 466 — get_hcps requires non-null nppes_practice_state (US-first filter)
The AD trials run did NOT crash or get interrupted — it COMPLETED normally over 466 HCPs. Reason: get_hcps()
filters `.not_.is_(nppes_practice_state, "null")` — only loads HCPs WITH a US NPPES practice state. Then
--ta scoping intersects with AD-tagged. Result: (HCPs with non-null state) INTERSECT (AD-tagged) = 466.
AD is ~82% international / publication-derived OpenAlex HCPs with NO US NPPES state -> ~15,400 AD HCPs were
excluded by get_hcps BEFORE scoping. RPC writes all succeeded (204 No Content); +885 net rows; NSCLC held.
KEY: the CT.gov search does NOT require location (ct(s, name, None) passes locn=None); state is only a
confidence SIGNAL in matching, not required. So the get_hcps state filter is OVERLY RESTRICTIVE for
international TAs. Also: our earlier derived_state work (~1,490 AD HCPs) doesn't help because get_hcps
filters on nppes_practice_state, not derived_state.
FIX (retrofit, before completing AD trials): relax get_hcps so international/stateless HCPs are included,
e.g. load HCPs where nppes_practice_state IS NOT NULL OR derived_state IS NOT NULL OR country IS NOT NULL
(or drop the state filter and rely on name+institution+country matching). Then re-run AD trials to cover
the full ~15,902 (Silverberg etc. will finally be reached). This is the same "pipeline is US-first, AD is
international" theme as the NPPES leg. NSCLC/Hep were less affected (more US NPPES coverage), which is why
NSCLC loaded 14,386 but AD only surfaced 466.
STATUS: AD trials INCOMPLETE (466/15,902, only the US-state-having AD HCPs). Needs get_hcps relaxed + re-run.

### 25f. AD trials leg LARGELY SUCCEEDED but has a KOL RECALL GAP (Silverberg=0)
Full AD run (15,902 HCPs, get_hcps relaxed) completed. BIG WIN: AD HCPs-with-trial-links 171 -> 7,782.
743 high-conf + 466 medium matches. Yosipovitch matched 3 trials @100; international KOLs (Ali, Cranswick)
matched -> the get_hcps relaxation (25e) worked, internationals now covered. Matcher PRECISION good: all
the WRONG Silverbergs (Mark/IBD, Shonni/endocrine, Nanette, etc. from CT.gov) correctly left hcp_id=NULL,
conf=0 -> no false-positive collision onto Jonathan.
BUT: Jonathan Silverberg (our AD KOL benchmark, GWU/DC, npi 1831325521) = 0 trial links. His trials are
NOT in trial_investigators_v2 at all (not even as raw/unmatched) -> not an affiliation-confidence rejection
(those would show his name w/ NULL hcp_id). Absent entirely => upstream miss: likely (a) CT.gov search for
"Jonathan Silverberg" name string missed him (he trials as "Jonathan I. Silverberg"?), (b) his trial roles
were CONTACT-only (filtered by ROLES set = PI/sub-I/chair/director), or (c) name-format/middle-initial.
IMPACT: recall gap on a SUBSET of KOLs (name-format / role / institution-change cases). NOT systemic —
7,782 matched incl most AD KOLs. But in MSL intelligence, missing moved-institution / format-variant KOLs
matters (they're often the highest value). 
INVESTIGATE (future, not blocking): instrument ct() search for "Jonathan Silverberg" + read raw CT.gov
return; consider (1) searching with middle initial variants, (2) broadening ROLES or handling CONTACT-as-PI,
(3) name-variant/institution-history matching. Compare why Yosipovitch matched but Silverberg didn't.
STATUS: AD trials leg FUNCTIONALLY COMPLETE (7,782 HCPs). Silverberg-class recall gap noted for follow-up.
ALSO UNRESOLVED: the "23934" value from verification was not identified (NSCLC? if so, -80 from 24,014 -
check drift vs bug). Confirm next session.

### 25g. ROOT CAUSE of Silverberg=0 — CT.gov query.term is FULL-TEXT, swamps common/collision names
Reproduced ct() search for "Jonathan Silverberg" (query.term, the pipeline's method). Returned trials are
IBD / ankylosing spondylitis / Crohn's (Humira, Vedolizumab/VICTRIVA, Upadacitinib) containing OTHER
Silverbergs (Samuel K Silverberg, Mark Silverberg) + the token "Jonathan" elsewhere (e.g. facility
"Jonathan Stein Med Prof Corp"). His ACTUAL AD/dupilumab trials are NOT in the top results.
=> query.term is a FULL-TEXT search, not a structured investigator-name lookup. It returns any trial where
the tokens appear ANYWHERE (facilities, sponsors, DIFFERENT people). For DISTINCTIVE names (Yosipovitch)
this is fine -> clean results -> matches. For COMMON/COLLISION-prone names (Silverberg: Mark/IBD famous,
Samuel, etc. + ubiquitous "Jonathan") the real KOL's trials get SWAMPED/crowded out -> matcher correctly
rejects the noise (conf 0, hcp_id NULL) -> KOL ends with 0 links. Roles are present/varied, so ROLES filter
is NOT the primary cause; the SEARCH PRECISION is.
=> SYSTEMATIC RECALL GAP: any AD (or other-TA) KOL with a common-ish surname is under-recalled. This is a
real product problem for KOL coverage (the high-value KOLs are exactly who must not be missed).
CANDIDATE FIXES (future): (1) use CT.gov's STRUCTURED investigator field if the API supports it
(query on official/investigator name rather than full-text query.term); (2) add middle initial to the
search term ("Jonathan I Silverberg"); (3) post-filter returned studies to those where a Silverberg appears
in an OFFICIAL/investigator ROLE with matching first name/initial before scoring; (4) require the
first+last to co-occur on the SAME investigator record, not just anywhere in the trial. Likely (1)+(3)+(4).
Compare: this also explains why matcher PRECISION looked good (it rejected wrong-Silverbergs) while RECALL
was 0 for Jonathan - garbage in from search, correctly rejected, but his real trials never fetched.
STATUS: AD trials leg = 7,782 HCPs matched (good for distinctive names); common-name KOLs under-recalled.
Search-precision fix needed for full KOL coverage. Not tonight - characterized for a focused fix.

### 25h. Silverberg gap is a CT.gov DATA CEILING, not a search bug — NOT fixable by better queries
Probe (ctgov_silverberg_probe.py) overturns the §25g "search precision" theory. Findings:
- "Jonathan Silverberg" query.term: totalCount=5 IN ALL OF CT.GOV, and all 5 are MARK Silverberg's IBD
  trials. Jonathan I. Silverberg's AD/dupilumab/JAK trials are NOT in CT.gov under a name search AT ALL —
  absent, not buried.
- Control Yosipovitch: totalCount=11, 10 real derm trials, all name him "Gil Yosipovitch, MD" as
  PRINCIPAL_INVESTIGATOR (Wake Forest/Miami/Temple — many investigator-initiated/academic trials).
- AREA[OfficialName] Essie syntax -> HTTP 400 (not supported via this API param). Field-qualified search
  is not available. Middle-initial / quoted-phrase / condition-narrowed strategies all still return 0 real
  Silverberg derm trials (because the data isn't there to return).
ROOT CAUSE (real): CT.gov under-names SITE investigators on large INDUSTRY-sponsored trials. Dupilumab/JAK
AD megatrials list the sponsor medical director or a single global PI as "overallOfficial" + generic
"Site Contact" per location - NOT the individual site PIs like Silverberg. So Silverberg genuinely isn't a
named, searchable investigator in CT.gov for the trials he ran. Yosipovitch is findable because he has many
academic/investigator-initiated trials where he's the named PI.
=> The "recall gap" is a CT.gov DATA CEILING, not a pipeline bug. NO search fix can retrieve a name the
registry doesn't record. This is EXACTLY the "CT.gov data ceiling" the advisor cited when dropping trials
from the Established RANKING in June (§23g/§12b) - now concretely demonstrated.
IMPLICATIONS:
- Do NOT rebuild ct() search for this; it can't work. The overnight-rerun-to-fix-Silverberg plan is moot.
- Trials remain useful for CLASSIFICATION (identifying research-active HCPs who ARE named) but systematically
  MISS industry-site-PI KOLs. This is a known, accepted limitation - and validates keeping trials OUT of
  ranking.
- The 7,782 AD HCPs matched skew toward academic/named-PI investigators (like Yosipovitch), under-representing
  pure industry-site KOLs (like Silverberg). Fine for classification signal; not a KOL census.
- Silverberg will still be captured as an AD KOL via PUBLICATIONS + PHARMA (Open Payments $1.74M) + network -
  the other dimensions. Trials being 0 for him is OK; the composite doesn't depend on trials for ranking.
ACTION: none on search. Keep the get_hcps fix (25e, real - international coverage). Note trials data ceiling
as accepted. Move on to cohort classification / scoring (Silverberg surfaces via pubs+pharma+network).

### 27. COHORT CLASSIFICATION REBUILD — Option A (dedicated per-TA table). DECISIONS LOCKED.
Decided (user: right/future-proof/no-fix-later): build a dedicated per-TA cohort classification layer.
Four-step build; steps 1-2 first (table + classifier), 3-4 next session (migrate consumers, deprecate col).

SCHEMA (step 1) hcp_cohort_classification_v2:
  hcp_id uuid, therapeutic_area_id uuid, cohort text, cohort_score numeric, tier_inputs jsonb,
  threshold_version text, classified_at timestamptz, classification_run_id uuid.
  PK (hcp_id, therapeutic_area_id)  <- makes it per-TA (Sanyal: established in Hep AND rising in AD = 2 rows).
  tier_inputs jsonb = the exact values the CASE saw (auditability, so classification logic is never "lost" again).
  threshold_version = which ruleset/threshold produced the row (per-TA calibration coexists unambiguously).

CLASSIFIER (step 2) scripts/classify/cohort_classification_v2.py:
  Reads hcp_scores_v2 (per-(hcp,ta): normalized_score, tier, component scores) + hcps_v2
  (career_first_pub_year_v2, total_career_pubs) scoped to --ta. RE-APPLIES the recovered tier CASE itself
  (owns the logic; does NOT copy hcp_scores_v2.tier -> decoupled from scoring_pipeline). Writes new table.
  Flags: --ta (req), --cohort (optional filter), --threshold (default 85), --dry-run | --execute.
  Recovered tier CASE (normalized_score based):
    >=95 AND pub_velocity>0 AND citation_trajectory>0 AND career_pubs<250 -> dark_horse
    >=threshold(85) AND (first_pub_year<2008 OR career_pubs>=250)        -> established
    >=threshold(85)                                                       -> rising_star
    >=30                                                                  -> emerging
    else                                                                  -> unranked
  Frozen-TA safe: PK-scoped (diff ta_id can't be touched) + pre-write assertion all rows in-scope.
  Threshold: default 85, run AD, INSPECT who lands Established (Yosipovitch/Guttman-Yassky/Paller/Silverberg?),
  calibrate from evidence; choice recorded in threshold_version on every row.

STEP 3 (next): migrate consumers (recompute_established_ranks_v3, established_scoring, rising_star_scoring,
narrative scripts) to read cohort from new table scoped by ta_id, NOT hcps_v2.cohort_classification.
STEP 4 (next): deprecate hcps_v2.cohort_classification (stop writing; drop/tombstone once unread).
NO DUAL-WRITING (one source of truth - the explicit anti-"fix-later" decision).

### 27b. PREREQUISITE for classification — AD career data (career_first_pub_year_v2 + corrected total_career_pubs) is INCOMPLETE
From Cursor Pt.19 (July 3) recovery + schema check:
- career_first_pub_year_v2 is the CANONICAL column (narrative/system reads _v2, not v1). BUT for AD it's only
  4,170/15,902 populated (26%). v1 (career_first_pub_year) is 100% populated but has GARBAGE (min=1661) from
  the OpenAlex conflation bug.
- total_career_pubs has a known INFLATION/CONFLATION bug: OpenAlex author-cluster enrichment conflates
  multiple people -> inflated pub counts (e.g. Heymach 2431, "conflation_suspected":true, pubs_per_year 67.5).
  Pt.19 remediation: recompute total_career_pubs from actual publication_authors_v2 join-table count.
- The v2 columns are computed by scripts/enrich/career_enrichment_from_clusters.py ("Recompute total_career_pubs
  and first_pub_year from hcp_openalex_authors clusters via OpenAlex author GET by ID"). Flags: --dry-run,
  --limit, --hcp-ids-file, --only-changed-today, --include-null-only, --target-version. v2 is only 26%
  populated for AD => this recompute was NOT run across all AD HCPs.
IMPLICATION: cohort classification's established-vs-rising split needs first_pub_year (<2008 senior test) AND
career_pubs (>=250 fallback, <250 dark_horse gate). BOTH are currently unreliable/incomplete for AD. Classifying
now = wrong Established cohort (garbage v1 years, or 74% NULL v2 years, plus inflated pub counts).
=> NEW PREREQUISITE (before §27 classifier is meaningful): run career_enrichment_from_clusters.py for AD to
populate career_first_pub_year_v2 + corrected total_career_pubs across all 15,902 AD HCPs. Same "per-TA
enrichment leg not yet run for AD" pattern as NPPES/OpenPayments/trials.
REVISED SEQUENCE: (1) career enrichment for AD (populate v2 first-pub-year + fix pub counts) -> (2) THEN build/run
cohort classifier (§27, uses career_first_pub_year_v2) -> (3) migrate consumers -> (4) component scorers + recompute.
Also: the classifier CASE should use career_first_pub_year_v2 (canonical), with career_pubs>=250 fallback for any
still-null; store both in tier_inputs jsonb for audit.

### 27c. career_enrichment_from_clusters.py RE-IMPORTS the conflation bug — do NOT run as-is for AD
Read the method: it recomputes total_career_pubs = SUM(works_count) across all linked OpenAlex author IDs in
the cluster, and first_pub_year = MIN(earliest year) across the cluster. Fetched via OpenAlex author GET by ID.
PROBLEM: this is the SAME conflation-prone method that CREATED the inflation bug:
- SUM(works_count): if any linked OpenAlex author ID is a conflated profile (multiple real people merged, e.g.
  Heymach works_count=2431, conflation_suspected=true), the SUM imports that inflation directly. Does NOT
  cross-check the reliable publication_authors_v2 join-table count.
- MIN(year): extremely vulnerable to conflation - a conflated profile's stray old/garbage paper (or a bad
  OpenAlex record) makes MIN grab an ancient year -> HCP wrongly flagged senior/established. THIS is how v1 got
  min=1661.
Pt.19 remediation deliberately did the OPPOSITE: recompute total_career_pubs from publication_authors_v2 COUNT
(actually-linked pubs), not OpenAlex works_count. So the committed script CONFLICTS with the validated fix.
=> Running this script as-is for AD would populate career_first_pub_year_v2 + total_career_pubs with
conflation-prone values (inflated pubs, ancient MIN years) -> corrupt the established/rising split. DO NOT run
as-is.
CORRECT APPROACH (design fresh, next session): populate AD career data from the JOIN TABLE, not raw OpenAlex:
- total_career_pubs = COUNT(DISTINCT publication_id) from publication_authors_v2 (Pt.19 method, reliable).
- first_pub_year = MIN(pub_year) over ACTUALLY-LINKED publications_v2 (via join), NOT raw OpenAlex cluster,
  so a conflated author's stray paper can't poison it. Optionally guard with a sane floor (>=1940).
- Use hcp_author_metrics_v2.data_quality_flags (conflation_suspected, pubs_per_year_excessive) to skip/flag
  bad clusters.
This is a real methodology task (OpenAlex-cluster vs join-table; conflation handling) - deserves fresh design,
NOT an end-of-session run. career_enrichment_from_clusters.py may need a rewrite or a --source=join-table mode.

### 27d. NSCLC career_first_pub_year_v2 is POPULATED (92%) but still garbage-TAILED (min 1837) — guard needed
Empirical check of NSCLC (the supposed "corrected in May" template):
  80,017 NSCLC HCPs | v2 populated 73,538 (92%) | v2_min=1837 (GARBAGE) | v2_median=2013 (sane) | v1_min=1500.
So "career_first_pub_year_v2 corrected in May" (per Pt.19) meant POPULATED + median-improved, NOT fully cleaned.
Even NSCLC's canonical v2 column has garbage floor values (1837) in the tail from OpenAlex conflation (a
conflated cluster's stray/ancient paper -> MIN grabs it).
IMPACT on classifier: tier CASE uses (first_pub_year < 2008 OR career_pubs >= 250) for the senior/established
test. A garbage 1837 passes "< 2008" on the year alone -> HCP wrongly reads senior/Established even with few
pubs. This latent mis-classification exists in NSCLC too (its cohort classification never guarded it).
=> REVISED "same as NSCLC" plan for AD:
  (1) POPULATE AD's career_first_pub_year_v2 to ~NSCLC coverage (26% -> ~92%) using the same method that
      populated NSCLC (still need to confirm exact method - the committed career_enrichment_from_clusters.py
      uses conflation-prone SUM/MIN per 27c, so verify whether May used that or a better join-table method).
  (2) The §27 classifier CASE MUST add a sanity guard: treat career_first_pub_year_v2 as valid only if
      BETWEEN 1940 AND 2026; else fall through to career_pubs>=250. This is a correctness fix needed for ALL
      TAs (NSCLC included), not AD-specific. Store raw + guarded value + which path used in tier_inputs jsonb.
  (3) total_career_pubs still needs join-table recompute (27c) to avoid inflation feeding the >=250 fallback
      and the <250 dark_horse gate.
NET: the guard (BETWEEN 1940 AND 2026) is validated as necessary by NSCLC's own garbage tail. Option-1
garbage-guard confirmed correct. AD needs BOTH population (to 92%) AND the classifier guard.

### 27e. CRITICAL nuance — join-table first_pub_year = "earliest INGESTED pub", NOT "career start"
Live check on Silverberg (AD KOL): current total_career_pubs=1223 (INFLATED, OpenAlex conflation) vs
join-table method=465 (de-inflated, correct - method works for pub COUNTS). BUT current_first_year=NULL ->
method_first_year=2016. Silverberg has published since ~mid-2000s; 2016 is WRONG as a career start.
ROOT: MIN(pub_year) over publication_authors_v2 = earliest pub OF HIS THAT WE INGESTED (AD/TA corpus), NOT
his lifetime first pub. Pre-corpus and other-TA early papers aren't linked -> MIN only sees ingested years.
=> career_first_pub_year_v2 via this method means "earliest ingested pub year," which for the classifier's
seniority test (first_pub_year < 2008 -> established) UNDERSTATES seniority for KOLs whose early/other-TA work
predates the corpus. A senior KOL reads as recent -> risk of wrongly classifying Established KOLs as Rising Star.
MITIGATION already in CASE: (first_pub_year<2008 OR career_pubs>=250). Silverberg: 2016<2008=F OR 465>=250=T
-> qualifies senior via pub-count fallback. SAVED by being prolific. BUT a senior-but-modest KOL (e.g. 120
ingested pubs, 30yr career) fails BOTH -> wrongly Rising Star. Real residual risk.
IMPLICATIONS / OPTIONS (decide before classifying):
  (a) Accept the method (correct pub counts; first_year = earliest-ingested) + lean on career_pubs>=250
      fallback, ACCEPT that senior-modest KOLs may be mis-tiered. Simplest, imperfect.
  (b) Get true career-start from a cleaner source: hcp_author_metrics_v2 / OpenAlex author record's first
      publication year GATED on conflation_suspected=false (use OpenAlex year only when the cluster is NOT
      flagged conflated). Hybrid: join-table for COUNTS, guarded-OpenAlex for career-start year.
  (c) Lower the seniority pub-fallback (e.g. >=150) to catch more senior-modest KOLs - but risks pulling in
      prolific juniors. Needs validation.
NOTE: this ALSO means NSCLC's career_first_pub_year_v2 (min 1837 garbage) had the OPPOSITE problem (OpenAlex
MIN grabbed too-early); join-table gives too-late. Neither is "true career start" cleanly. The honest answer
is probably (b) - guarded OpenAlex year for career-start, join-table for counts.
DO NOT run the population UPDATE yet - decide (a)/(b)/(c) first. The pub-COUNT correction (1223->465) is
clearly right and safe; the first-YEAR semantics need the decision above.

### 27f. RESOLVED — NSCLC method confirmed empirically; my §27c/§27e caution was OVERCOMPLICATED
User was right: this WAS solved for NSCLC. Evidence:
- Conflation is RARE: 1,300/458,476 metrics rows flagged conflation_suspected (0.28%). 99.7% clean.
  So conflation is a narrow EXCEPTION, not the rule. My "don't use cluster method, it re-imports conflation"
  (§27c) over-weighted a 0.28% tail.
- NSCLC career_first_pub_year_v2 distribution spreads across ALL decades (1949/1958/1966/1975/1983/1992/
  2001/2009/2018) = REAL career-start years = OpenAlex cluster-derived MIN. NOT earliest-ingested (which
  would bunch in 2010s). So NSCLC used the OPENALEX CAREER-START method, and it's correct.
- The "we ignored publications beyond 19XX" the user remembered = a YEAR FLOOR (>=1940). Bucket 0 (1837-1939)
  holds only 26 HCPs (the garbage/conflation stragglers); the floor kills the 1661/1837 nonsense. This IS
  the user's solution.
CORRECTED RECIPE (mirror for AD): career_first_pub_year_v2 = OpenAlex cluster-derived first year (real
career start, correct for 99.7%), with (a) year FLOOR >= 1940 to kill garbage, (b) gate/skip the 0.28%
conflation_suspected=true clusters. total_career_pubs: the join-table COUNT de-inflation (1223->465 for
Silverberg) is still correct and safe for pub COUNTS - keep that. So: COUNTS from join table, YEAR from
OpenAlex cluster (floored + conflation-gated). This resolves §27e (join-table year understated Silverberg
to 2016; OpenAlex year gives his true ~mid-2000s start).
=> career_enrichment_from_clusters.py is NOT to be discarded wholesale - its OpenAlex first-year logic is
right for the 99.7%; it needs the >=1940 floor + conflation gating (may already have partial). VERIFY the
script has the floor + conflation gate; if yes, run it for AD (scoped); if no, add them. Retract the blanket
"do not use" from §27c - it's "use it WITH the floor + conflation gate," which is what NSCLC did.

### 27g. RESOLVED excavation + REAL prerequisite found — AD author metrics only 26% populated
Recovered the EXACT career_first_pub_year_v2 method (saved: sql_recovered/career_first_pub_year_v2_method.sql):
"sustained productivity onset" heuristic off hcp_author_metrics_v2.counts_by_year. 3-tier COALESCE
(sustained 3yr run of >=2 papers / two_paper / earliest). This is the deconfliction; ~14.5yr later than v1,
correct for 99.5%. NOT the cluster script, NOT join-table. Authoritative, committable.
BUT the REAL prerequisite is upstream: AD author-metrics coverage = only 4,170/15,902 HCPs (26%) have
counts_by_year in hcp_author_metrics_v2 (snapshots 2026-05-27 AND 2026-07-02, same 4,170 HCPs). This EXACTLY
matches AD's 26% career_first_pub_year_v2 coverage -> proves v2 was only computable for the 4,170 with metrics.
Silverberg (benchmark AD KOL) v2_would_be = NULL -> he's NOT in the 4,170, has no counts_by_year -> the
sustained-onset method is a NO-OP for him and the other ~11,732 AD HCPs (74%).
=> ACTUAL NEXT PREREQUISITE (the real "not run for AD" leg): FETCH AUTHOR METRICS for AD's HCPs (populate
hcp_author_metrics_v2.counts_by_year for the missing ~11,732). THEN run the sustained-onset SQL (scoped to
AD, current snapshot / per-HCP MAX) -> THEN cohort classification -> scorers -> recompute.
Need to find the script that populates hcp_author_metrics_v2 (fetches OpenAlex author counts_by_year). Likely
an author-metrics/OpenAlex-enrichment script; check if --ta scoped and run for AD. This is another OpenAlex
API leg (~11,732 authors), dry-run first.
DEPENDENCY CHAIN (updated): author-metrics fetch for AD -> career_first_pub_year_v2 sustained-onset SQL ->
total_career_pubs join-table de-inflation -> cohort classifier (§27) -> migrate consumers -> component
scorers -> recompute -> AD Established ranking (generalization verdict).

### 27h. DONE — AD career_first_pub_year_v2 populated via sustained-onset method. Silverberg=2008.
AD author-metrics fetch complete (openalex_author_enrichment.py --ta atopic-dermatitis --workers 8):
15,876 fetched_ok / 15,902, 0 errors, 26 conflation-flagged (~0.16%), 15min. All 15,902 AD HCPs now have
counts_by_year at snapshot 2026-07-07.
Sustained-onset SQL run (AD-scoped). Silverberg validated: tiers were sustained=2008, two_paper=2003,
earliest=1960(garbage) -> resolved=2008 (COALESCE picks sustained). 2008 is his correct real career start.
Method discarded the 1960 conflation straggler exactly as designed.
EXECUTION NOTE (perf): the monolithic CTE+UPDATE timed out repeatedly (interface, run_sql.py, and Supabase
UI even at statement_timeout=600s). ROOT CAUSE: hcp_author_metrics_v2 had index on snapshot_date ONLY, so
per-HCP lookups scanned all 15,902 snapshot rows and filtered (Rows Removed by Filter: 15901) -> cohort query
~250M row ops. Added compound index (snapshot_date, hcp_id) but still slow due to CTE re-scanning the LATERAL
unnest 3x + window sort. WINNING PATTERN: materialize ad_yearly (the unnest+cohort-join) into a persistent
(NON-temp) table once + index (hcp_id, year), THEN run resolve+UPDATE in ONE statement reading from ad_yearly.
CAUTION: Supabase UI runs statements on different connections -> TEMP tables / cross-statement table deps get
LOST between runs (we lost ad_resolved_starts this way, update silently didn't happen first attempt). Use
persistent tables + do the final resolve+UPDATE atomically in one statement.
FOR FUTURE TAs: commit (1) the compound index as schema, (2) the materialize-then-atomic-update pattern in
sql/backfill/. Don't run the monolith directly - it times out.
TODO cleanup: DROP TABLE ad_yearly (leftover staging).
NEXT: verify AD distribution (has_v2 ~15,902, median 2000s-2010s, small pre-1970 residual). Then
total_career_pubs join-table de-inflation (Silverberg 1223->465). Then the cohort classifier build (§27).

### 27h-verify. AD career-year distribution CONFIRMED sane (parity with NSCLC)
has_v2=15,902 (full, up from 4,170) | v2_median=2013 (= NSCLC's median, sane) | v2_min=1905 (straggler) |
pre_1970_residual=93 (0.58%, the known common-name-merge tail, ~as predicted for international AD).
Silverberg=2008 (validated). AD career-year now at parity with NSCLC. Staging table dropped.
The 93 pre-1970 residuals will read "senior" in the classifier -> handled by the BETWEEN 1940 AND 2026 guard
baked into the classifier CASE (§27d). No action needed now; confirms the guard's value.
PREREQUISITE CLEARED: AD career_first_pub_year_v2 done. Blocked classification since last night; now unblocked.

### 27i. DONE — AD total_career_pubs de-inflated (join-table COUNT). Silverberg 1223->465.
Confirmed NSCLC total_career_pubs already de-inflated (max 692, over_1000=0) => running AD de-inflation is
idempotent-safe on shared cross-TA HCPs (same join-table count). AD UPDATE run (COUNT(DISTINCT publication_id)
from publication_authors_v2, scoped to AD). Result: AD max_pubs=465 (=Silverberg), over_1000=0, median=3,
Silverberg 1223->465. Parity with NSCLC. Ran in one shot (grouped COUNT, no jsonb unnest -> no timeout).
BOTH AD career-data inputs now CLEAN + validated:
  - career_first_pub_year_v2: full coverage, median 2013, Silverberg 2008, 93 pre-1970 residual (guarded).
  - total_career_pubs: de-inflated, max 465, Silverberg 465, NSCLC parity.
=> The classification prerequisites are FULLY MET. AD data is classification-ready for the first time.
COMMIT: sql/backfill/ad_total_career_pubs_deinflate.sql (the join-table UPDATE) alongside the career-year SQL.
NEXT: build the §27 Option-A cohort classifier (dedicated per-TA table hcp_cohort_classification_v2 +
scripts/classify/cohort_classification_v2.py) on these now-reliable inputs. Then dry-run for AD, inspect the
Established preview (Yosipovitch/Guttman-Yassky/Paller/Silverberg?), calibrate threshold, execute.

### 28. FUTURE-PROOFING TODO — scope the LOADS in scoring_pipeline.py --ta, not just the compute
The --ta retrofit filters to AD AFTER loading all 283,051 HCPs (and presumably full platform publications/
trials). Correct results, but wasteful/slow -- loads the whole corpus to score ~15,800 AD HCPs. For TA #3+
this is minutes wasted every run.
FIX (small Cursor prompt, after current run): push the --ta scope UP into the data loads. When scoped_ta_id
is set, load only:
  - HCPs tagged to the TA (join hcp_therapeutic_areas_v2 at the hcps load, or load the TA's hcp_id set first
    and filter the hcps query by .in_ chunks).
  - publications/trials/etc. restricted to those HCPs where the loaders support it.
Keep the post-load compute filter as a belt-and-suspenders safety, but the heavy loads should be scoped so a
--ta run only pulls what it needs. Same pattern applied to author-metrics fetch (scoped candidate load) and
trials (scoped get_hcps). This is a "make TA #3 smoother" item -- the loads are the last unscoped part.

### 28b. Pagination guard bug found + scope-the-loads promoted to REQUIRED (option B)
Running scoring --ta atopic-dermatitis --dry-run FAILED: "Pagination safety bail for table
'hcp_therapeutic_areas_v2': offset=280000 expected_count=278652". ROOT CAUSE: fetch_all_rows() (and
fetch_all_hcps, fetch_all_publication_authors - same pattern) does count='exact' -> expected_count, then
paginates, and HARD-BAILS if offset > expected_count + page_size. hcp_therapeutic_areas_v2 has MORE rows
than the count returned (grew past ~279K as AD/trials tagging added rows; count vs actual mismatch), so
pagination correctly kept going and tripped the too-tight guard. Pre-existing LATENT bug, surfaced now that
the table crossed the threshold. NOT caused by the --ta retrofit (the hcp_tas load is unscoped -> full 280K).
This blocks AD scoring entirely. Decision: OPTION B - do the §28 load-scoping AND fix the brittle guard:
  (1) Scope ALL heavy loads (incl. hcp_tas / hcp_therapeutic_areas_v2 itself) to the TA -> the scoped
      hcp_tas load is ~15,902 rows, never approaches the guard, and the run is fast.
  (2) Fix the pagination guard in fetch_all_rows/fetch_all_hcps/fetch_all_publication_authors: paginate
      UNTIL an empty/short batch (the correct termination), and treat expected_count as a WARNING sanity
      check (log if final count deviates >5%), NOT a hard mid-load bail. The empty-batch break is the
      real terminator; the offset>expected_count bail is wrong when the count is stale/underestimated.
This is required-to-run, not just an optimization. Fixes AD now + removes a latent bug that would bite every
growing table.

### 28c. AD scoring dry-run SUCCESS — load-scoping + career-data both validated
scoring_pipeline.py --ta atopic-dermatitis --dry-run: RAN CLEAN, FAST, no crash.
Load-scoping (§28 fix) worked: "TA-scoped load: 15902 HCPs, 40540 pubs, 3100 trials, 102003 pub-author links,
3939 trial-inv links" (vs full-platform 283K/415K/134K before). Scoring computed in <1s (258K pairs/s).
Pagination bail GONE.
CAREER-DATA FIX VALIDATED via the cohort gate line:
  [cohort gate] Rising-star eligibility: in-band=5944, excluded null_career=0, too_young=484, established=9474
  - null_career=0 -> full career_first_pub_year_v2 coverage (this morning's fix; was 74% null before).
  - established=9474 -> seniority split working off career_first_pub_year_v2 (correctly excludes senior KOLs
    from rising-star scoring).
Tier distribution (rising cohort): emerging=279, unranked=5658, rising_star=5, dark_horse=2. 443 above zero.
Top rising stars = plausible early-career AD researchers (Parsa Abdi Norm=100 14pubs PubVel49; Yang Li,
Liming Wu, Nina Magnolo, etc.), several international (fits AD 82% intl). NOT the famous KOLs - CORRECT,
because Silverberg/Guttman-Yassky/Paller are in the established=9474 bucket, excluded from RISING-star list.
This is the whole morning's data work paying off. AD scoring is validated on clean data.
NEXT: real run (drop --dry-run) -> verify NSCLC untouched (still 32,593 rows / 2026-05-29). Then the §27
Option-A cohort classifier, which surfaces the ESTABLISHED cohort (where the famous KOLs live).

### 28d. ORDER RESOLVED — CLASSIFY FIRST (career-based), then cohort-score. User was right.
Diagnostic on NSCLC established cohort: ALL established HCPs (Heymach, Paz-Ares, Ramalingam, Reck, Felip,
Galle, Yi-Long Wu, etc. - the real KOLs) have career_age 17-65yr, pubs 221-692, and norm_score=NULL,
score_tier=NULL. PROVES: established classification is CAREER-BASED (career_first_pub_year_v2 + total_career_pubs),
completely INDEPENDENT of normalized_score. Established HCPs are never scored by the rising-star pipeline
(gated out: the established=9474 exclusion). Community HCPs: null career/0 pubs -> community by ABSENCE of
pub footprint, also no score needed.
CORRECT ARCHITECTURE (user's model, confirmed):
  1. CLASSIFY FIRST (career structure): Established gate (long career/high pubs) -> established.
     Rising gate (in-band career age + enough pubs) -> rising-eligible. Community = the LEFTOVERS (didn't
     clear Established or Rising gates).
  2. THEN score each cohort with ITS OWN methodology, within-cohort:
     - Established -> established scorer (publication leadership 50% / network 35% / pharma 15%) -> KOL ranks.
     - Rising-eligible -> rising scorer (normalized_score/momentum - the scoring_pipeline.py run) -> rising tiers.
     - Community (leftovers) -> community scorer (patient volume / pharma / group signal - community_scoring.py).
=> The §27 classifier's job: assign the top-level cohort from CAREER data (est/rising-eligible/community),
persist to hcp_cohort_classification_v2. Does NOT need normalized_score for the est/community split. Score
only matters for rising_star sub-tiers WITHIN the rising-eligible pool.
CORRECTION: I earlier had the order muddled (implied score-then-classify). User correctly insisted you can't
cohort-score an uncohorted HCP. The base scoring_pipeline.py run scores the rising-eligible band only; the
established KOLs surface via the SEPARATE established scorer AFTER classification. 
REVISED SEQUENCE: build §27 classifier (career-based cohort assignment) -> run it for AD -> then run the
three cohort scorers (established/rising/community) each scoped to their cohort -> recompute -> KOL rankings.

### 28e. CONFIRMED cohort-gate logic (the exact rules the §27 classifier must apply)
From scoring_pipeline.py constants + first_pub_year_override_multiplier + the eligibility loop:
CAREER-AGE BAND: RISING_STAR_MIN_CAREER_AGE=3, RISING_STAR_MAX_CAREER_AGE=10.
  career_age = current_year - career_first_pub_year_v2.
ESTABLISHED (career-based, no score; checked first). An HCP is established if ANY:
  - total_career_pubs >= 500 (volume alone, regardless of first_pub_year), OR
  - total_career_pubs >= 200 AND career_first_pub_year_v2 < 2020 (volume + documented length), OR
  - career_age > 10  (i.e. career_first_pub_year_v2 <= current_year-10; for 2026 -> <= 2016).
  (This is the "establishment override" - two-signal logic to catch seniors whose first_pub_year is
   coverage-limited. It's the safety net for the earlier Silverberg "earliest-ingested" concern.)
RISING-ELIGIBLE (if NOT established): career_age in [3,10]. Then scored:
  TIER_RISING_STAR_THRESHOLD=65.0 (NOT 85 - recalibrated for v2 global corpus; docstring comments saying 85
  are STALE, the constant 65 is truth), TIER_DARK_HORSE_THRESHOLD=80.0, TIER_EMERGING_THRESHOLD=30.0.
  normalized>=80 AND (pub_vel>0 or trial>0) -> dark_horse; >=65 -> rising_star; >=30 -> emerging; else unranked.
TOO_YOUNG (excluded from rising, not established): career_age < 3.
COMMUNITY: the LEFTOVERS - null career_first_pub_year_v2 / no pub footprint / didn't qualify est or rising.
OTHER RANKING CONSTS: MIN_TOTAL_CAREER_PUBS_FOR_RANKINGS=10, MIN_STORED_PUBLICATIONS_FALLBACK=6,
MAX_STORED_PUBLICATIONS_FOR_RANKINGS=200 (exclude >200 STORED pubs from rising rankings - note this is
STORED-pub count, different from total_career_pubs).
=> §27 CLASSIFIER applies: established gate (3-way OR) FIRST -> else rising-eligible if career_age in [3,10]
-> else too_young if <3 -> else community. Persist to hcp_cohort_classification_v2. The BETWEEN 1940 AND 2026
guard on career_first_pub_year_v2 still applies (garbage years -> treat as null -> fall to pub-count paths).
Established/community need NO score; rising sub-tier needs normalized_score (from the rising scorer, run AFTER).

### 28f. §27 CLASSIFIER BUILT + AD DRY-RUN VALIDATED. Silverberg -> established.
Table hcp_cohort_classification_v2 created (Option A per-TA, cohort_reason, tier_inputs jsonb, threshold_version,
write-scope assertion). Classifier scripts/classify/cohort_classification_v2.py built to the confirmed §28e gates.
AD DRY-RUN (15,902 HCPs):
  established 9,466 (59.5%) | rising_eligible 5,944 (37.4%) | too_young 484 (3.0%) | community 8 (0.1%).
CONSISTENCY CHECK vs scoring gate: rising_eligible 5,944 == scoring in-band 5944 EXACTLY; too_young 484 ==
scoring 484 EXACTLY; established 9,466 ~= scoring 9,474. Classifier reproduces the scoring gate precisely ->
logic validated.
Established-rule breakdown: pubs>=500: 0 (nobody hits it post-de-inflation, Silverberg tops at 465 - the 500
threshold was calibrated on INFLATED counts; the other two rules cover establishment fine) | pubs>=200_and_
pre2020: 16 | career_age>10: 9,450 (the bulk - AD median first-pub 2013).
ESTABLISHED PREVIEW: Silverberg (465) -> established; Simpson (219) -> established. Benchmark KOLs land
correctly. Community=8, all no_career_data.
Frozen-safe (assert_scoped_ta_writes). Reads only therapeutic_areas/hcp_therapeutic_areas_v2/hcps_v2, writes
only hcp_cohort_classification_v2. No normalized_score dependency (classification is career-based, confirmed).
NEXT: --execute for AD (persist classification) -> then the three cohort scorers each scoped to their cohort
(established scorer = pub-leadership 50/network 35/pharma 15 -> KOL ranks; rising scorer already run;
community scorer) -> recompute -> AD Established KOL ranking = the generalization verdict.
NOTE: pubs>=500 rule is now a no-op for de-inflated TAs; consider lowering or noting it's legacy-inflated-count
calibration. Not blocking (career_age>10 + pubs>=200_pre2020 cover it).

### 28g. DRY-RUN CAUGHT A REAL ISSUE — global total_career_pubs pollutes per-TA established ranking
AD classification dry-run established preview: the TOP of AD's established cohort is dominated by HEPATOLOGISTS,
not dermatologists. Top 25 by pubs: Sanyal(412), Wedemeyer(378), Zheng(375), Sarin(371), Loomba(358),
Trebicka(325), Tacke(314), Bajaj(248), Hirschfield, Lohse, Trautwein, Gores, V.Shah - ALL hepatology. Only
Silverberg(465), Simpson(219), de Bruin-Weller(182), Wollenberg(173) are real AD dermatology KOLs.
ROOT: the classifier (and the establishment gates) use GLOBAL total_career_pubs (all pubs across all fields).
For a PER-TA cohort, Sanyal is "established in AD" and ranks #2 on the strength of 412 LIVER papers, not AD
work. He may have only ~3-4 actual AD pubs. Global pub count pollutes the per-TA established ranking.
These hepatologists ARE legitimately AD-tagged (2+ AD-adjacent pubs, membership is clean per 26b) - the issue
is NOT contamination of membership, it's that ESTABLISHMENT + RANKING use global rather than AD-SPECIFIC counts.
This is the concrete form of the user's "score per-TA" instinct: cohort assignment and ranking for AD should
reflect AD-SPECIFIC body of work, not global career output.
IMPLICATION: DO NOT --execute yet. Need to decide: should establishment (pubs>=500 / pubs>=200_and_pre2020)
and the ranking use AD-SPECIFIC pub count (count of the HCP's pubs that are AD-relevant, from
publication_authors_v2 joined to AD-relevant publications) instead of global total_career_pubs?
  - career_age>10 rule is fine (career length is career length regardless of field).
  - But the pub-VOLUME establishment rules (>=500, >=200) and especially the top-by-pubs RANKING should use
    AD-specific counts, or hepatologists dominate AD's KOL list.
QUESTION FOR NSCLC PRECEDENT: did NSCLC's established cohort have this same cross-TA pollution? Its diagnostic
(28d) showed NSCLC/hep names (Kudo, Aldrighetti = liver) mixed into NSCLC established too - so this may be a
pre-existing system issue, not AD-specific. Worth checking whether the established SCORER (pub-leadership,
which we haven't run yet) already scopes to TA-specific pubs and fixes the ranking even if classification uses
global counts. The classifier decides WHO is established; the established SCORER decides their RANK - and the
scorer may already be TA-scoped (publication_leadership_scoring counts TA-relevant senior-authorships).
DECISION NEEDED before execute: (a) is global-count establishment acceptable because the established SCORER
re-ranks by AD-specific pubs anyway? or (b) must the classifier itself use AD-specific counts?

### 28h. RESOLVED (28g) — established SCORER is TA-scoped; global-count classification is harmless. Execute OK.
publication_leadership_scoring.py is FULLY TA-scoped: ta_pubs CTE = publications_v2 JOIN
publication_therapeutic_areas_v2 WHERE therapeutic_area_id = ta_id. ALL signals (senior_pub_count,
first_pub_count, citations, guideline/editorial/review counts) computed over AD-ONLY pubs. Writes
hcp_publication_leadership_v2 with percentile_rank per (hcp_id, ta_id).
=> The classifier using GLOBAL total_career_pubs to decide WHO is established is a generous, HARMLESS
over-inclusion. The TA-scoped SCORER then ranks by AD-SPECIFIC leadership: Sanyal/Loomba (few AD pubs, ~0 AD
senior-authorship) sink to the bottom; Silverberg/Simpson/de Bruin-Weller/Wollenberg (heavy AD authorship)
rise to the top. Ranking self-corrects. The 28g hepatologist-heavy preview was a COSMETIC artifact of the
preview sorting by GLOBAL total_career_pubs - NOT the real established ranking.
ARCHITECTURE CONFIRMED (matches user's per-TA instinct): establishment = generous/career-based (global-ish
ok); RANKING = TA-specific (the scorer enforces it). Both correct.
DECISION: 28g resolved as (a) - global-count establishment is acceptable because the established scorer
re-ranks by AD-specific pubs. SAFE TO EXECUTE the classifier. Then run publication_leadership_scoring
--ta atopic-dermatitis: the percentile_rank output is where we verify Silverberg/Simpson rank top and
Sanyal/Loomba rank bottom (the real generalization verdict).
NOTE: publication_leadership_scoring reads scoped_hcp_ids from hcp_established_ranks_v2 (not the new
hcp_cohort_classification_v2). Need to confirm how established HCPs feed the scorer - it currently pulls the
established set from hcp_established_ranks_v2. May need to wire the new classification table -> established
ranks, OR the scorer's fetch_established_hcp_ids needs to read the new cohort table. CHECK before running the
scorer (the §27 step-3 consumer migration).

### 28i. CONFIRMED BUG (28g escalated) — establishment uses GLOBAL pub count; 73% of AD "established" are passengers
User pushed back correctly: --ta IS working (all classified HCPs are AD-tagged), but the ESTABLISHMENT TEST
uses GLOBAL total_career_pubs (all fields), not AD-specific pubs. So an AD-tagged HCP is "established in AD"
based on their total (mostly non-AD) output. Distribution of the 9,474 established-AD HCPs by AD-SPECIFIC pubs:
  zero_ad_pubs: 2,379 (!!)  -- established in AD with ZERO AD publications
  ad_pubs_1_4: 4,549
  ad_pubs_5_9: 1,535
  ad_pubs_10plus: 1,011     -- the real AD KOLs (~11%)
=> 6,928 / 9,474 (73%) of "established" AD HCPs have <=4 AD pubs. 2,379 have ZERO. This is NOT harmless
over-inclusion (my 28h "self-corrects" take was too lenient) - the cohort table is 73% wrong and confusing
to future builds. 2,379 zero-AD-pub HCPs cannot be "established in AD".
ROOT: establishment gates (pubs>=500, pubs>=200_and_pre2020, career_age>10) all use GLOBAL total_career_pubs
and global career_first_pub_year_v2 - not AD-scoped. career_age>10 especially: a 34-yr-career hepatologist
with 0 AD pubs passes "career_age>10" -> established in AD. Wrong.
FIX NEEDED (before execute): establishment must require a meaningful AD-SPECIFIC body of work. Gate on
AD-specific pub count (from publication_authors_v2 JOIN publication_therapeutic_areas_v2 WHERE ta). Clean cut
in the data: real AD KOLs have 10+ AD pubs (1,011); passengers have <=4 (6,928). A threshold around AD-pubs>=5
(keeps 2,546) or >=10 (keeps 1,011) is defensible - inspect where the real KOLs sit.
BROADER: does NSCLC established have the same pollution? The 28d NSCLC diagnostic showed liver names
(Kudo/Aldrighetti) in NSCLC established -> LIKELY the same global-count bug system-wide. Fixing AD's classifier
to use TA-specific establishment should become the pattern for all TAs (and NSCLC may need reclassification).
This is a real pre-existing architectural bug, surfaced by AD, caught at dry-run before persisting. DO NOT
execute until establishment is AD-scoped.

### 28j. AD-specific pub count: great discriminator for passengers, BUT under-counts some real KOLs
Real AD KOLs have ad_pubs ~= global_pubs (they SPECIALIZE in AD): Silverberg 465/464, Simpson 219/219,
Wollenberg 173/173, Weidinger 154/153, Eichenfield 143/143, Bissonnette 98/98. The RATIO (ad_pubs/global)
is the clean discriminator: real AD KOL ~1.0; hepatologist passenger (Sanyal 412 global / ~4 AD) ~0.01.
PROBLEM 1: Emma Guttman-Yassky shows ad_pubs=6, Amy Paller ad_pubs=0. These are TOP-TIER AD KOLs (Guttman-
Yassky = world-leading translational AD; Paller = pediatric AD giant). 6 and 0 are WRONG - they should have
100s. Cause: likely (a) identity/author fragmentation (their pubs split across variant HCP records) or (b)
their pubs not tagged AD in publication_therapeutic_areas_v2. MUST diagnose before setting an establishment
threshold - gating on ad_pubs>=10 would correctly drop Sanyal BUT wrongly drop Guttman-Yassky/Paller.
PROBLEM 2: homonym explosion - dozens of distinct "Simpson"/"Silverberg" HCP records (different real people),
most 0 AD pubs. Fine (distinct people) but hints real KOLs' pubs may be fragmented across records.
=> Do NOT set the AD-specific establishment threshold until we know why Guttman-Yassky=6 and Paller=0. If it's
fragmentation/tagging, the AD-pub count is unreliable for SOME KOLs and we need a more robust establishment
signal (or fix the underlying count). NSCLC comparison pending (user asked).

### 28k. REAL ROOT CAUSE — AD publication corpus is severely UNDER-INGESTED (not a classifier bug)
Two decisive results:
(1) NSCLC established: 4,394, only 130 zero-NSCLC-pub (3%). AD established: 9,474, 2,379 zero-AD-pub (25%).
    => The passenger problem is NOT systemic. NSCLC established is mostly CLEAN. AD is uniquely polluted.
    So it's NOT purely the global-count bug (that would hit NSCLC equally). Something is wrong with AD's data.
(2) Guttman-Yassky: total_career_pubs=6, linked_pubs=6 (!). Amy S. Paller: total=3, linked=3. These are
    WORLD-TOP AD KOLs who should have 100s of pubs. Their records have SINGLE DIGITS. Also identity
    fragmentation: two Guttman-Yassky records ("Guttman-Yassky" hyphen vs "Guttman-Yassky" different hyphen
    char), 6+2 pubs.
=> REAL ROOT CAUSE: AD's PUBLICATION CORPUS IS SEVERELY UNDER-INGESTED. AD has only 40,540 pubs total; top
KOLs have single-digit linked pubs. The classifier's "zero AD pubs" established HCPs mostly have zero because
their AD pubs were NEVER INGESTED, not because they don't do AD work. total_career_pubs (Silverberg 465) looks
right because it comes from OpenAlex author METRICS (counts_by_year), but the actual LINKED PUBLICATIONS in
publication_authors_v2 / the AD corpus are sparse.
This is UPSTREAM of the classifier. The establishment gate isn't the core bug - the missing publication data
is. Can't gate establishment on AD-specific pub count when the AD pub count is broken for real KOLs.
IMPLICATIONS:
- The AD corpus build (pubmed/openalex publication ingestion for AD) is incomplete. This likely traces to the
  AD corpus issues noted earlier (the pubmed_pipeline violating v2 arch, the corpus rebuild). AD pub ingestion
  needs to be completed/verified BEFORE cohort classification and scoring can be trusted.
- Guttman-Yassky/Paller identity fragmentation (multiple records, hyphen variants) is a SECOND issue - author
  disambiguation - compounding the under-ingestion.
- This reframes the whole afternoon: we've been building classification/scoring on an incomplete AD publication
  corpus. The career metrics (author-level counts_by_year) are complete, but the publication-author LINKS are not.
DO NOT execute the classifier. The AD established cohort cannot be correct while the AD pub corpus is missing
most KOL publications. Need to diagnose AD corpus completeness next.

### 28l. REFRAME — not "under-ingested vs career total"; the career total ITSELF reflects the thin corpus
Sizing query: zero_linked=0, prolific_but_few_linked=0, median_linked=3 (of 15,902 AD HCPs).
prolific_but_few_linked=0 is the key: NO AD HCP has high total_career_pubs but low linked pubs -> the linked
count and total_career_pubs are CONSISTENT (we de-inflated total_career_pubs FROM the join table this morning,
so of course they match now). So Guttman-Yassky total_career_pubs=6 means she has 6 pubs IN THE AD CORPUS,
not 6 real career pubs.
THE REAL QUESTION (user: "how did we miss so much?"): why does Silverberg have 465 linked AD pubs but
Guttman-Yassky only 6, when both are top AD KOLs? median_linked=3 across AD is very thin for a KOL corpus.
LEADING HYPOTHESIS: author-disambiguation FRAGMENTATION. We already saw TWO Guttman-Yassky records (hyphen
variant "Guttman-Yassky" vs "Guttman-Yassky" different unicode hyphen), 6 + 2 pubs. Her ~500 real papers are
likely split across multiple OpenAlex author IDs / HCP records, only a 6-pub fragment linked to the main record.
Silverberg resolved cleanly to one author ID -> all 465 linked. So the corpus may CONTAIN her papers, but they're
attached to fragmented/variant author records, not her canonical HCP.
NOTE: this morning's de-inflation (total_career_pubs from join-table COUNT) may have HARMED KOLs like
Guttman-Yassky - it replaced her OpenAlex works_count (which might have been ~500, correct) with her
linked-pub count (6, fragmented). For clean-identity HCPs (Silverberg) de-inflation was right (1223 inflated
-> 465 real). For fragmented-identity KOLs it may have REPLACED a roughly-right number with a fragment count.
This is a real tension: de-inflation fixes conflation but exposes fragmentation.
NEXT: trace Guttman-Yassky's actual publication footprint across OpenAlex author IDs / HCP records to see if
it's fragmentation (papers exist, wrong records) vs corpus gap (papers never pulled). This determines the fix:
identity merge vs corpus re-pull. This is the crux of AD data quality and blocks trustworthy classification.

### 28m. ROOT CAUSE FOUND — author identity FRAGMENTATION via Unicode hyphen variants
Guttman-Yassky author metrics reveal TWO records / two OpenAlex author IDs:
  b7f8...(hyphen '-' U+002D): OpenAlex A5123951378, works_count=37, cited=12, 4yr data. FRAGMENT.
  eb13...(hyphen '‐' U+2010): OpenAlex A5024365532, works_count=764, cited=46,804, 26yr. THE REAL HER.
=> Her identity is SPLIT across two HCP records because the surname uses two DIFFERENT hyphen characters
(ASCII hyphen-minus U+002D vs Unicode hyphen U+2010) that look identical but don't byte-match. Author
disambiguation treated them as different people. Her real 764-work / 46,804-citation profile exists in the
data (record eb13, author A5024365532) but is DISCONNECTED from the record the classifier/scoring surfaces.
This is why "how did we miss so much": we didn't miss her data - it's present under the variant-hyphen record.
The canonical/primary record points at a 37-work fragment; the linked pubs (6, 2) are each fragment's sliver.
IMPLICATIONS:
- median_linked=3 across AD is likely inflated-downward by widespread fragmentation like this (Unicode
  variants, accented names, hyphen/space variants - AD is 82% international -> MANY such cases).
- This is an AUTHOR-DISAMBIGUATION / IDENTITY-MERGE problem, NOT a corpus re-pull problem. The papers ARE in
  OpenAlex (764 works) and likely in/available to the corpus; they're attached to a variant author ID.
- This morning's total_career_pubs de-inflation HARMED fragmented KOLs: Guttman-Yassky's real works_count is
  764 (or her true linked count if merged), but de-inflation set total_career_pubs=6 from the fragment's links.
- NSCLC being clean (3% zero-pub) vs AD (25%) now makes sense: AD's international/diacritic/hyphen-heavy names
  fragment far more than NSCLC's more US/ASCII names.
FIX DIRECTION: author identity merge/normalization. Normalize name variants (Unicode NFKC, hyphen folding,
diacritics) when clustering hcp_openalex_authors_v2, and MERGE fragmented HCP records (b7f8 + eb13 -> one
Guttman-Yassky with author A5024365532 as primary). Then re-link pubs, re-derive career metrics. This is a real
identity-resolution leg, upstream of classification. AD cannot be classified/scored correctly until KOL
identities are merged.
DO NOT execute classifier. Next: assess fragmentation SCALE across AD (how many HCPs are variant-duplicates),
then design the merge.

### 28n. Fragmentation SCALE + the two sub-problems (safe merges vs unsafe homonyms)
Normalized-name collision scan (folding unicode hyphens) on AD HCPs: MANY multi-record collisions, dominant
signature = one substantial record + tiny 3-8 pub slivers of the SAME person. Real AD KOLs affected:
  Eric Simpson [219,78], Thomas Werfel [111,25,8], Donald Leung [121,4], Thomas Luger [32,3], Raif Geha [31,3],
  Norito Katoh [90,7], Silvia Ferrucci [124,4], Calzavara-Pinton [36,3], Gimenez-Arnau, Elena Goleva [39,6]...
VISIBLE CAUSES in the variant strings: unicode hyphen U+2010 vs ASCII '-' (Calzavara‐Pinton, Sang‐Hyun Kim,
Gimenez‐Arnau, Guttman‐Yassky); diacritics (Niccolo Gori, Ake Svensson, Gimenez); + homonym noise.
TWO SUB-PROBLEMS:
  (A) TRUE FRAGMENTS - same person, variant spelling (unicode hyphen / diacritic artifacts). SAFE high-conf
      merges. This is the Guttman-Yassky class.
  (B) AMBIGUOUS HOMONYMS - common names (Hye Kim x6, Tae Kim x6, Xiao Xu, Jun Li, Hua Wang, Zhen Chen x4)
      that may be genuinely DIFFERENT people. UNSAFE to auto-merge on name alone - would corrupt data.
=> CANNOT merge on normalized-name alone (would fuse distinct humans). Need a STRONGER signal.
SAFE-MERGE CRITERION (the key design decision): merge two records only when they are provably the same person:
  - Same OpenAlex author ID across records (definitive - it's literally the same OpenAlex entity), OR
  - Name-variant (unicode/diacritic fold) AND shared institution AND/OR overlapping co-authors/concepts.
The unicode-hyphen/diacritic cases where the two records point to the SAME or clearly-linked OpenAlex authors
are the safe, high-value first pass. Homonyms without corroborating signal stay separate.
NOTE: many "big" records themselves may be incomplete (Guttman-Yassky's real 764-work profile was the
SECOND record eb13, not the primary). So merging must pick the RICHEST OpenAlex author id (max works_count)
as canonical, not just the highest local pub count.
NEXT: design the safe merge - start with the definitive signal (same/variant name + corroboration), pick
richest OpenAlex profile as canonical, re-link pubs, re-derive metrics. Scope the first pass to high-confidence
fragments (unicode/diacritic variants) affecting KOLs; leave ambiguous homonyms for a careful second pass.

### 28o. CRITICAL merge-design refinement — THREE patterns, must not conflate. Leung is the cautionary tale.
OpenAlex-id-level view of fragmented AD KOLs reveals THREE distinct patterns:
PATTERN 1 - duplicate OpenAlex entity, IDENTICAL works_count (safest merge):
  Ferrucci A5126183040(261) + A5081303333(261) [+5 sliver]; Katoh A5030364184(494)+A5124455125(494)[+14].
  Same works_count = literally the same OpenAlex author duplicated. Definitive merge.
PATTERN 2 - same FULL name, one rich profile + small slivers (safe merge, pick richest):
  Geha 765+17; Luger 3908+11; Donald Leung 1213+106; Werfel 513+365+74+48 (513/365 both big - needs care,
  could be two real facets or two people - verify).
PATTERN 3 - same SURNAME, DIFFERENT first names = DIFFERENT PEOPLE. MUST NOT MERGE:
  "Leung" cluster: Alexander(13568), Donald(1213), Ting(499), Patrick S.C.(326), Karen(191), Agnes(147),
  T.(49), F.(38), Andrea(18)... these are DISTINCT humans. My earlier normalized first|last key was OK here
  (it keyed on first+last so Donald vs Alexander separate) BUT the surname-only intuition would fuse them.
KEY LESSON: merge key must require FIRST + LAST match (normalized), NEVER surname alone. Even then, distinguish:
  - identical works_count -> same entity (merge).
  - same full name, rich+sliver -> fragment (merge, canonical = max works_count profile).
  - initials-only variants (T. Werfel, T. Leung) -> likely same person as the full-name record IF works
    corroborate, but lower confidence.
  - DIFFERENT first names, same surname -> different people (do NOT merge).
CAUTION FLAGS for the merge:
  - Werfel 513 AND 365 both large: could be two real people or a split profile - verify co-authors/institution
    before merging the two big ones (merging slivers 74/48 is safer).
  - Initials vs full first name (T. Werfel vs Thomas Werfel): probably same, but corroborate.
SAFE FIRST PASS: merge only (1) identical-works_count duplicates and (2) same-full-name rich+sliver pairs
where first names match exactly (post-unicode/diacritic normalization). Defer initials-only and both-big cases
to a verified second pass. NEVER merge on surname alone.

### 28p. Dedup subsystem EXISTS but doesn't fold Unicode/diacritics -> misses AD's fragmentation
User was right - there IS a dedup subsystem: scripts/dedup/dedup_detect.py + dedup_merge.py, plus utilities
dedup_dryrun_spotcheck.py, verify_dedup_state.py, categorize_dedup_failures.py (and superseded earlier attempts
in archive/). So this is a known problem with existing tooling.
BUT dedup_detect.py's normalization is INSUFFICIENT for AD:
  norm() = whitespace collapse only. lower() = lowercase. strip_initials() = "Kris V."->"kris".
  NO Unicode NFKC, NO hyphen folding (U+2010 vs U+002D), NO diacritic stripping.
=> It would NOT catch Guttman-Yassky(-) vs Guttman-Yassky(unicode hyphen), Niccolo/Niccolò, Calzavara-Pinton,
Gimenez-Arnau, Sang-Hyun Kim, etc. It catches whitespace/case/initials dupes only.
CONFIRMING EVIDENCE: CANONICAL_KOL_LAST_NAMES hardcoded = {loomba, sanyal, chalasani, kowdley, garassino,
wakelee, heymach} - ALL NSCLC/Hep KOLs. The detector was built/tuned for the EARLIER TAs. AD KOLs absent.
THIS EXPLAINS EVERYTHING: NSCLC clean (3% zero-pub) because its dupes were whitespace/initials kind the
detector CATCHES. AD polluted (25%, fragmented KOLs) because AD is 82% international -> its dupes are the
Unicode-hyphen/diacritic kind the detector MISSES. dedup was effectively run for NSCLC/Hep but is a no-op for
AD's actual duplicate patterns.
FIX: extend dedup_detect.py normalization with Unicode NFKC + hyphen-fold + diacritic-strip (a stronger
name-key), so it catches AD's international-name fragments. Then run the EXISTING detect -> spotcheck -> merge
pipeline for AD. This reuses the proven merge machinery (canonical selection, link re-pointing) - we only need
to upgrade the NAME NORMALIZATION so detection catches the variants. Much smaller than building new.
NEXT: read dedup_detect.py's clustering/pairing logic + dedup_merge.py's merge/canonical/safety model to see
(a) where to inject better normalization, (b) how it picks canonical + re-points links, (c) its safety against
merging different people (the Leung problem - must keep first+last distinct). Then extend normalization, dry-run
for AD, spotcheck Guttman-Yassky/Werfel/Leung, merge.

### 28q. Dedup detector logic is SOUND - fix is a surgical normalization injection (+ maybe --ta)
dedup_detect.py full logic reviewed:
- BLOCKING: block_key = strip_initials(last_name) -> clusters candidates by last name.
- PAIRING within block: strict_name_match requires strip_initials(first)==strip_initials(first) AND
  lower(last)==lower(last). So FIRST+LAST must match -> Leung safety ALREADY correct (Alexander != Donald).
- CORROBORATION: uses same_openalex_author_id, same_npi, same_institution to tier candidate confidence.
  Not name-alone. Sound safety model.
THE GAP (confirmed): strip_initials/lower/norm do whitespace+case+initials only, NO unicode NFKC / hyphen-fold
/ diacritic-strip. So variant-hyphen names (Guttman-Yassky U+002D vs U+2010) get DIFFERENT BLOCK KEYS -> never
compared -> never detected. The failure is at BLOCKING (they never meet), compounded at matching.
THE FIX (surgical): add a name_key() normalization = unicode NFKC + fold hyphen variants (U+2010/2011/2013/
2014 -> '-') + strip diacritics (unicodedata) + existing lower/strip_initials. Use name_key() for BOTH the
block_key AND the strict_name_match. Everything else (pairing, corroboration via openalex/npi/institution,
tiering, output CSV, and the whole dedup_merge.py canonical/link-repoint machinery) stays UNCHANGED - it's
correct. We only make the name key robust to unicode so international fragments land in the same block.
Also: check if detect/merge are --ta scopeable or global (global is fine for detection since it's read-only,
but we'd want to review/merge AD candidates specifically).
STILL TO VERIFY in dedup_merge.py: canonical selection must pick the RICHEST openalex profile (max works_count),
NOT is_primary or highest-local-pubs - because Guttman-Yassky's real 764-work record is NOT the primary (the
37-work fragment is primary). If merge picks by is_primary or local pub count it would keep the wrong record.
This is the one thing to confirm/fix in the merger.
NEXT: (1) extend normalization in dedup_detect.py (name_key). (2) confirm dedup_merge.py canonical = max
works_count. (3) run detect for AD -> spotcheck Guttman-Yassky/Werfel/Ferrucci/Leung in the CSV -> merge ->
re-derive metrics -> re-run career-year + classification. THEN score.

### 28r. CRITICAL - merger's canonical selection uses total_career_pubs, which de-inflation INVERTED for fragments
dedup_merge.py choose_survivor(): (1) prefer NPI, (2) prefer higher total_career_pubs, (3) is_primary/lower id.
PROBLEM: total_career_pubs was de-inflated THIS MORNING from join-table linked-pub COUNT. For fragmented KOLs
the real OpenAlex profile often has FEWER linked pubs than a fragment:
  Guttman-Yassky: fragment b7f8 (OpenAlex 37 works) linked_pubs=6 -> total_career_pubs=6.
                  REAL eb13 (OpenAlex 764 works) linked_pubs=2 -> total_career_pubs=2.
=> choose_survivor would pick the 6-pub FRAGMENT as survivor and merge the REAL 764-work profile INTO it.
BACKWARDS - would destroy the KOL's real identity. The de-inflation inverted the very signal the merger trusts.
ROOT: total_career_pubs (post-de-inflation) reflects LINKED-pub count, not OpenAlex profile size. For clean
records they agree; for fragmented records the real profile may have few LINKED pubs (its pubs are under the
fragment or unlinked) while OpenAlex works_count is huge.
FIX: canonical selection must use OpenAlex works_count (from hcp_author_metrics_v2, latest snapshot) as the
richness signal, NOT total_career_pubs. Survivor = record whose primary OpenAlex author has MAX works_count.
Keep NPI preference only as a tiebreak AFTER works_count, or corroborate. So choose_survivor order should be:
  (1) max OpenAlex works_count (the real richness), (2) NPI presence, (3) is_primary, (4) lower id.
CAVEAT: after merging, RE-DERIVE total_career_pubs from the UNION of both records' links (+ ideally re-link
the real OpenAlex author's pubs). Guttman-Yassky merged should end with her real pub set, not 6 or 2.
SEQUENCE now: (1) extend dedup_detect name_key (unicode/diacritic). (2) FIX dedup_merge choose_survivor to
rank by OpenAlex works_count. (3) detect for AD -> spotcheck (verify Guttman-Yassky survivor = the 764 record,
Leungs stay separate). (4) merge. (5) re-derive total_career_pubs + career-year on merged identities. (6)
re-classify. THEN score. NOTE: may also want to re-check whether de-inflation should run AFTER dedup, not
before - order matters (dedup first, then de-inflate on merged identities).

### 28s. Detection caught only 17 candidates - MISSES the known AD KOL fragments (corroboration too strict)
After the Unicode/diacritic name_key fix, dedup_detect found only 17 candidate clusters platform-wide, almost
all HEPATOLOGY names (El-Serag, Abou-Alfa, Neuschwander-Tetri, Tzeng, Debes, Dagogo-Jack, Gurakar, Syn...).
"Canonical KOLs found in candidates: (none)". Guttman-Yassky NOT among them despite the name fix.
The name_key fix WORKS (it's catching unicode-hyphen/diacritic hepatology names now). But the KNOWN AD KOL
fragments (Guttman-Yassky 2 recs, Werfel 4, Ferrucci 3, Katoh 3, Donald Leung 2, Luger 2) are NOT surfacing.
LIKELY CAUSE: the CORROBORATION/tiering gate is too strict for genuine fragments. Guttman-Yassky's two records
have DIFFERENT OpenAlex author IDs (A5123951378 vs A5024365532), likely no shared NPI, and possibly
missing/mismatched institution -> so after name matches, the detector requires same_openalex OR same_npi OR
same_institution to promote to a merge candidate, and she has NONE of those (her corroborating data is ALSO
fragmented). Also seeing skip_geographic_mismatch on real single-person cases -> geographic gate produces
FALSE SKIPS when a fragment has sparse/missing institution.
THE TENSION: corroboration protects against merging different people (Leung), but genuine fragments have
fragmented corroboration too (different OpenAlex IDs, sparse institution) -> they fail the gate -> not detected.
Name-match-only would over-merge (homonyms); name+corroboration under-merges (fragments). Need a middle signal.
CANDIDATE SIGNALS for genuine same-person fragments that DON'T rely on shared OpenAlex/NPI/institution:
  - shared PUBLICATIONS/co-authorship overlap (if both records link to overlapping papers or co-authors).
  - OpenAlex author ALTERNATIVE names / the fact that OpenAlex sometimes lists both IDs as related.
  - high name specificity: an uncommon full name (Guttman-Yassky, Neuschwander-Tetri) matching is itself
    strong evidence - a rare hyphenated name colliding is almost certainly the same person, unlike "Hye Kim".
    Consider a name-RARITY signal: rare full-name match -> higher merge confidence even w/o institution.
NEXT: read the detector's tiering/action logic (what promotes to merge_high_confidence vs skip) to see exactly
why Guttman-Yassky is excluded, then relax appropriately (e.g. rare-name-match as sufficient corroboration, or
fix the geographic gate to not skip when institution is MISSING vs actually-conflicting). Verify against the
known KOL fragment list.

### 28t. Real cause of "only 17" — likely a STUB-vs-PRIMARY pairing model, not fragment-vs-fragment
geographic_recommendation is ONLY country-based (skip if US-vs-nonUS; merge if same country; else merge_review).
It does NOT gate on OpenAlex/NPI - so corroboration wasn't the filter (28s hypothesis partly wrong). The real
filter is UPSTREAM: only 17 candidate PAIRS were generated at all. The function compares 'primary' vs 'stub',
and there are helpers is_npi_stub_record / is_publication_record.
LIKELY CAUSE: the detector pairs a substantive PRIMARY record against thin STUB records (NPI-only or
publication-only stubs) - it's designed to catch "stub duplicate of a real HCP", NOT "two substantive
fragments of the same person". Guttman-Yassky's two records are BOTH substantive (both have OpenAlex authors +
pubs), so NEITHER is a stub -> they never get paired -> she's invisible to this detector. The 17 found are the
stub-type dupes (and note they're all hepatology/earlier-TA names, consistent with stub dupes from those builds).
=> This detector solves a DIFFERENT dedup problem (stub absorption) than the one AD KOLs have (substantive
fragment merging). The Unicode name_key fix was necessary but not sufficient - the PAIRING MODEL itself
excludes fragment-vs-fragment.
NEXT: read the pairing loop + is_npi_stub_record/is_publication_record to confirm the stub-only pairing. Then
decide: (a) extend the detector to also pair two substantive same-(name_key) records (fragment-vs-fragment),
using name-rarity + shared OpenAlex-author-cluster / co-author overlap as the merge signal, or (b) a separate
fragment-merge pass. Either way survivor = max works_count (already fixed in merge). Keep the Leung safety
(first+last name_key must match; rare-name adds confidence; common names need corroboration).
This is the crux: AD KOL fragmentation is fragment-vs-fragment, which the current stub-oriented detector does
not handle.

### 28u. CONFIRMED - detector is stub-absorption only; structurally cannot catch fragment-vs-fragment
Pairing model confirmed: candidate = is_publication_record (career_pubs>=100 OR pub_author_count>=50) as
PRIMARY, paired against is_npi_stub_record (has_npi AND pub_author_count<20) as STUB. It ONLY catches "real
researcher + thin NPI-only stub duplicate". 
Guttman-Yassky's two SUBSTANTIVE fragments (37-work + 764-work, both non-stub) don't fit primary-vs-stub ->
no pair generated. WORSE: de-inflation dropped her real record's total_career_pubs to ~2, so it no longer
passes is_publication_record's >=100 -> her real record isn't even recognized as a primary.
=> The 17 found are genuine stub-absorption cases (thin NPI stubs of real HCPs). The detector STRUCTURALLY
cannot solve AD KOL fragmentation, which is fragment-vs-fragment (two substantive records). This is why it's
a NEW capability, not a normalization tweak. The name_key + survivor fixes remain correct/necessary but
insufficient.
CONCLUSION FOR NEXT SESSION - build a FRAGMENT-MERGE capability (extend detector or new pass):
  - PAIR two records in the same name_key block where BOTH are substantive (not just primary-vs-stub).
  - SAFE merge signal for fragments (they lack shared OpenAlex-id/NPI): 
      * name-RARITY: rare full name_key match (e.g. hyphenated/diacritic, low last_name_freq) = high confidence
        same person. last_name_freq is ALREADY computed in the detector - use it.
      * corroboration where available: shared institution (missing != conflicting), co-author/publication
        overlap, same OpenAlex author cluster.
      * KEEP first+last name_key BOTH-match (Leung safety); common names (high last_name_freq) require
        corroboration, rare names can merge on name alone.
  - survivor = max OpenAlex works_count (already fixed in dedup_merge).
  - AFTER merge: re-derive total_career_pubs + career_first_pub_year_v2 on merged identities (and reconsider
    de-inflation ORDER: dedup BEFORE de-inflation next time).
This is a real new dedup capability. Substantial + destructive -> build + dry-run + KOL spotcheck + Leung-safety
verify with FRESH eyes. Good stopping point: full diagnosis complete, 2 fixes banked, next task crisply defined.

### 28v. Rarity threshold - CLEAN separation in the data. Fragment-pairing design finalized.
Surname-frequency (normalized) for AD: homonym fields kim=280, wang=269, li=259, chen=206 vs fragment KOLs
guttman-yassky=2, ferrucci=2, katoh=2, luger=2, geha=2, silverberg=2, werfel=4, simpson=5, leung=12. HUGE gap
(<=12 vs >=206), nothing between 13-200. Rare/common cutoff is easy + safe.
REFINEMENTS from the data:
- silverberg=2 but includes Jonathan/Nanette/Mark/Michael Silverberg (DIFFERENT people, rare shared surname)
  -> FIRST+LAST name_key BOTH-match is MANDATORY even for rare surnames. Rarity raises confidence only AFTER
  first name matches.
- leung=12: mix of distinct people (Alexander/Donald/Ting/Patrick/Karen) + the Donald Leung fragment pair.
  First-name match separates them. So even "semi-rare" surnames need first+last match; then merge.
FINAL FRAGMENT-PAIRING DESIGN:
  1. Pair two records only if first_name name_key AND last_name name_key BOTH match (Leung/Silverberg safety).
  2. Given a first+last match, confidence by surname rarity (use existing last_name_freq):
     - surname_freq <= RARE_THRESHOLD (set 50; margin is huge, KOL max is leung=12) -> HIGH confidence,
       merge candidate on name alone.
     - surname_freq > 50 -> require CORROBORATION (shared institution [missing != conflicting], OR co-author/
       publication overlap, OR same OpenAlex author cluster) before proposing merge.
  3. Both records SUBSTANTIVE (this is the new path - not primary-vs-stub). Pair any two same-name records
     in a block regardless of stub/publication status.
  4. Survivor = max OpenAlex works_count (already fixed in dedup_merge).
  5. Geographic: skip only on CONFLICTING country (US vs non-US), NOT on missing.
Threshold 50 cleanly includes all KOL fragments, excludes kim/wang/li/chen homonym fields. Safe.
NEXT: Cursor prompt to add fragment-pairing path to dedup_detect.py, then dry-run + KOL spotcheck + Leung-safety
verify, then merge.

### 28w. Fragment detection: KOLs CAUGHT correctly, but 111,711 needs_corroboration noise + 3,552 high-conf to vet
Fragment-pairing run results:
  merge_fragment_high_confidence: 3,552
  fragment_needs_corroboration: 111,711  (97% of fragment candidates - the review bucket, NOT auto-merged)
  (old stub path: 17, unchanged)
GOOD: KOL fragments now caught as fragment/merge_fragment_high_confidence: Guttman-Yassky, Katoh, Ferrucci,
Geha, Luger, Werfel. Rarity gate worked. (Guttman-Yassky shows primary_career_pubs=2 - de-inflation artifact;
merger's works_count survivor logic will still pick her 764-work record as canonical.)
CONCERN 1: 111,711 needs_corroboration = all-pairs explosion in common-surname blocks (kim=280, wang=269,
li=259, chen=206 -> tens of thousands of chance first+last matches among DIFFERENT people). NOT a merge risk
(review bucket, not auto-merged) but far too many to review and signals noisy pairing. Should suppress/park
these - they're mostly distinct people. Consider: don't even EMIT needs_corroboration for high-freq surnames
unless real corroboration exists (institution/coauthor/openalex), rather than emitting 111k for review.
CONCERN 2: 3,552 merge_fragment_high_confidence is MORE than expected for KOL fragments alone. Must VET this
bucket before any merge: are all 3,552 genuinely rare-surname (<=50 freq) same-person fragments, or is common-
name noise leaking into high-confidence? Need to check the freq distribution + first-name-match quality of the
3,552.
NEXT: (1) vet the 3,552 high-confidence set (surname freq distribution, spot-check for false pairs). (2) decide
handling for the 111k (suppress high-freq needs_corroboration). Do NOT merge until the 3,552 is confirmed clean.
The KOL detection working is the win; the volume needs vetting before the destructive step.

### 28x. STOP - high-confidence fragment bucket is UNSAFE. Both safety mechanisms failed. DO NOT MERGE.
Vetting the 3,552 merge_fragment_high_confidence revealed TWO critical failures:
FAILURE 1: 1,082 of 3,552 (30%) high-confidence pairs have DIFFERENT FIRST NAMES. Must be ZERO. The first+last
name_key both-match safety is NOT holding in the fragment high-confidence path. Merging would fuse ~1,082 pairs
of potentially DIFFERENT PEOPLE (the Leung/Silverberg catastrophe).
FAILURE 2: high-confidence bucket is DOMINATED BY COMMON SURNAMES: Chen(39), Li(34), Wang(29), Lee(28),
Yang(20), Lin(20), Liu(19), Kim(17), Zhang(16), Huang(16)... These are the high-freq homonym fields
(chen=206, li=259, wang=269 records) that should be gated to needs_corroboration. The RARITY GATE (freq<=50)
is LEAKING - common surnames are landing in auto-merge.
DIAGNOSIS: the fragment path's strict_name_match and/or rarity-frequency lookup is broken. Likely causes:
  - strict_name_match not actually applied in the fragment loop (or applied to the wrong fields), OR
  - the by_first sub-grouping key differs from the pair-match key so different first names slip through, OR
  - surname_freq is computed on a DIFFERENT normalization than the block, so common surnames read as rare, OR
  - the corroboration check is passing spuriously (e.g. shared empty/null institution treated as match, or
    shared null NPI).
The Chen/Li/Wang dominance + different-first-names strongly suggests corroboration is firing on NULL matches
(two records with empty institution or null openalex treated as "same") AND/OR first-name enforcement is off.
DO NOT MERGE anything. The KOL detection working (28w) is real, but the bucket is contaminated with unsafe
pairs. Must fix the fragment path's safety (enforce first+last name_key on the actual pair; fix rarity lookup;
make corroboration require NON-NULL matching values) and re-vet until different-first-names=0 and common
surnames are absent from high-confidence, BEFORE any merge.
NEXT: read the fragment path (detect_fragment_candidates, strict_name_match usage, has_fragment_corroboration,
surname_freq source) to find why first-name and rarity gates leak. This is the safety-critical fix.

### 28y. RESOLVED via NSCLC precedent - common Asia-Pac names are LEFT SEPARATE, never merged. That's correct.
NSCLC vs AD record counts for common surnames: NSCLC has FAR MORE (wang 2,476 vs AD 269; li 2,279 vs 259;
zhang 2,155 vs 231; chen 1,563 vs 206; kim 634 vs 280...). NSCLC NEVER merged/consolidated these - thousands
of separate Wang/Li/Zhang records coexist. AND NSCLC ships CLEAN (3% zero-pub established, correct KOL ranking).
=> THE RESOLUTION (what was done months ago): common Asia-Pac surnames are LEFT AS SEPARATE RECORDS, not
merged. They're mostly genuinely different people; merging would FUSE distinct humans. They don't pollute the
KOL cohort because real KOLs are rare-surname (Western or uncommon) records that resolve cleanly. The
common-name records sit harmlessly in the long tail, correctly separate.
IMPLICATION FOR THE FRAGMENT DETECTOR: the fragment auto-merge path must EXCLUDE high-frequency surnames
entirely - exactly what the rarity gate was SUPPOSED to do (freq<=50) but is currently LEAKING (28x: Chen/Li/
Wang landing in high-confidence + 1,082 different-first-name pairs). So the fix is NOT "make corroboration work
for Chen/Li/Wang" - it's "the rarity gate must actually exclude them, and first-name enforcement must hold."
The 111,711 needs_corroboration and the common-name high-confidence leakage should simply NOT be generated -
high-freq surnames are out of scope for fragment merging by design/precedent.
CORRECT FRAGMENT SCOPE: only auto-merge RARE-surname (freq <= 50) fragments with first+last name_key match -
the Guttman-Yassky/Werfel/Ferrucci/Katoh/Luger/Geha class. That's the entire actionable set. Everything in the
common-name blocks stays separate, per NSCLC precedent.
=> This should become a COMMITTED, DOCUMENTED RULE so TA#3 and the agent pipeline don't re-fight it: "HCP
dedup/fragment-merge applies only to rare surnames (freq<=threshold) with full first+last match; high-frequency
(Asia-Pac + common Western) surnames are never auto-merged - left as separate records."
NEXT: fix the fragment detector so the rarity gate + first-name enforcement actually hold (exclude high-freq
surnames, require first+last match), re-vet (different-first-names=0, no common surnames in high-confidence),
then the high-confidence set = just the rare KOL fragments -> review -> merge.

### 28z. COMMITTED RULE - the Asian/common-name cohort is NOT dedupable; do not try. (User's standing decision.)
User's explicit, experienced call: "Nobody is going to be able to dedupe the Asian cohort. No sense in trying."
This is now a STANDING RULE, not a per-session choice:
- Common/high-frequency surnames (Asia-Pac: Wang/Li/Zhang/Chen/Liu/Kim/Lee/Yang/Wu/Huang/Lin... AND common
  Western: Bernstein/Friedman/Goldstein/Levine/Butler/Hughes...) are NOT auto-merged, EVER. Left as separate
  records.
- Rationale: without richer identifiers, same-name common records cannot be distinguished (Wei Wang vs Wei
  Wang may be different people). A false merge FUSES two real physicians = corrupted data, worse than leaving
  them separate. NSCLC precedent: 2,476 un-deduped Wangs, ships CLEAN, because KOLs are rare-surname records.
- Fragment-merge SCOPE (permanent): rare surname (block freq <= 50) + full first+last name_key match only.
  This captures the fragmented KOLs (the ones that matter for the cohort) and nothing else.
ACTION ITEMS to make this durable (so TA#3 / agents / future-you don't re-fight it):
  1. Bake RARE_SURNAME_THRESHOLD gate + first+last enforcement into dedup_detect fragment path (in progress).
  2. Add a committed comment/docstring in dedup_detect.py stating this policy + the NSCLC rationale.
  3. Note in TA_NEW_PLAYBOOK / gate docs: "do not attempt common-name dedup; fragment-merge is rare-surname
     only." 
This closes the Asia-Pac question permanently. It was fought for days months ago; the answer is "leave it,"
now committed.

### 28aa. Fragment path FIXED + re-vetted clean. Root cause was an indentation bug.
ROOT CAUSE of 28x leaks: emission ran AFTER the inner combinations loop using leftover loop variables (last
combination only), so strict_name_match never applied to the emitted pair. Indentation bug -> unit test passed
(function correct) but real output was unguarded. Classic "vet real output, not the unit test" lesson.
FIX: emission moved INSIDE the combinations loop, guarded by strict_name_match(a,b) on the actual pair; rarity
lookup uses bk (same key the last_name_freq Counter was built on); high-freq blocks (>50) skipped entirely
before pairing (no high-confidence AND no needs_corroboration for them).
RE-VET (all four clean):
  (a) fragment high-confidence total: 3,058 (was 3,552 contaminated; needs_corroboration 111,711 -> 0)
  (b) different-first-name pairs in high-confidence: 0 (was 1,082) - SAFETY HOLDS
  (c) common surnames (chen/li/wang/kim/lee/zhang) in high-confidence: 0 - Asian cohort excluded per precedent
  (d) KOL fragments present: ferrucci, geha, guttman-yassky, katoh, luger, werfel - the ones that matter kept
  stub path unchanged (17); name_key + works_count survivor unchanged; read-only; ASCII-safe prints fixed.
The 3,058 high-confidence set = rare-surname fragments, validated first+last matches. This is the reviewable,
mergeable set.
NEXT: (1) human review the 3,058 (spot-check a sample + all KOLs; confirm they're genuine same-person rare-name
fragments). (2) merge dry-run -> watch [SURVIVOR SWAP] (Guttman-Yassky 764 wins over 37). (3) merge. (4)
re-derive total_career_pubs + career_first_pub_year_v2 on merged identities. (5) re-run classifier -> AD
established should now surface real dermatology KOLs.

### 28ab. Review of the 3,058 high-conf set - KOLs good, but common WESTERN names + transitive clusters need care
GOOD: Guttman-Yassky primary_hcp_id=eb133e58 (the 764-work record) - correct survivor despite showing pubs=2.
Katoh/Ferrucci/Geha/Luger have rich record as primary. Gil Yosipovitch (major AD itch KOL) also caught (8/11,
both low -> likely MORE fragments of him).
CONCERN 1 - common WESTERN surnames in high-confidence: Bernstein(15), Friedman(11), Levine(10), Goldstein(10),
Henry(10), Hughes(8), Butler(8), Ford(7), Hamilton(7), Clarke(7)... These are below the freq<=50 AD threshold
but are common enough that same-first-name collisions ("David Bernstein" x2) may be DIFFERENT PEOPLE - same
risk as the Asian names, just Western. The threshold of 50 is too loose for common Western names. 15 Bernstein
pairs is not KOL fragmentation - it's likely distinct people. These should NOT auto-merge.
CONCERN 2 - primary assignment sometimes wrong: Osborn primary=243 but stub=418 (stub richer!). The build_
candidate primary/stub by works_count is mis-assigning in some rows. Merger's choose_survivor (works_count)
should still flip via [SURVIVOR SWAP], but detection-side primary is unreliable -> rely on merge-side survivor.
CONCERN 3 - transitive fragmentation: Werfel appears as 3 pairs (111,25)(111,8)(25,8). He's split into 3+
records. Merge must collapse the whole cluster to the 111 record (transitive: A-B,A-C,B-C -> all to A), not
merge pairs independently (25-8 pair merges two non-primaries -> possible conflict/orphan). Need to confirm
dedup_merge does transitive cluster resolution, or process pairs in works_count order so everything folds into
the richest.
IMPLICATION: 3,058 is NOT all safe-to-merge. It's rare-surname + first+last match, but "rare in AD (<50)"
still includes common Western names where same-first collisions are different people. Need a TIGHTER gate or a
corroboration requirement for the moderately-common tail. The genuinely-safe merges are the VERY rare surnames
(freq 2-4: guttman-yassky, ferrucci, katoh, werfel...) - hyphenated/diacritic/uncommon names where a full-name
match is near-certainly the same person.
NEXT: (a) tighten - either lower threshold, or require corroboration for freq > ~5-10, OR restrict to
surnames that are genuinely rare (hyphenated/non-ASCII/low global freq). (b) confirm merger handles transitive
clusters. (c) re-vet, then merge only the confirmed-safe subset. Do NOT merge the Bernstein/Friedman tail
without corroboration.

### 28ac. ONTOLOGIST DOCTRINE ADOPTED - evidence-scoring identity resolution, not surname thresholds
Ontologist reframed the whole approach. ADOPTED as the identity-resolution design:
INVARIANT (in code, not philosophy): false_split > false_merge. Default = DO NOT MERGE. A false split
under-credits a KOL (recoverable: fewer pubs/centrality/authority). A false merge corrupts pub counts,
coauthor graph, institution history, Open Payments, scoring - IRREVERSIBLE and often undetectable. In KOL
intelligence, under-credit rather than invent a superhuman.
KILL the surname_frequency_threshold as the decider. Replace with minimum_merge_score (evidence accumulation).
EVIDENCE SCORING (ontologist's starting weights):
  same ORCID +100 | same OpenAlex author +100 | same email +80 | same full normalized name +25 |
  rare surname +20 | moderately rare +10 | same institution +20 | shared coauthors +15 |
  publication overlap +15 | same specialty +10 | career continuity +10. Merge if score >= X.
  Surname rarity is ONE FEATURE, never determines outcome alone.
GLOBAL rarity, not TA-cohort frequency: cohort freq is unstable (Guttman-Yassky freq-2 in AD -> freq-14 after
ingesting Immunology; mergeability didn't change, dataset did). Use OpenAlex/PubMed-wide surname frequency as
a stable prior.
DECISION BANDS: High conf (ORCID OR OpenAlex-author match OR strong evidence score) -> AUTO-MERGE. Medium ->
REVIEW QUEUE (not automatic). Low -> LEAVE SPLIT (default).
5-20 surname range: NEVER merge on name alone; require >=1 corroborating signal (institution / overlapping pub
years / ORCID / shared coauthors / specialty).
BLOCKING + SCORING is standard entity resolution: block (surname + first initial + specialty) -> score ->
band. Scales as corpus grows to 100Ks; explainable ("why merged?" -> the evidence).
ARCHITECTURAL RECOMMENDATION: treat identity resolution as its OWN SUBSYSTEM, not another ingestion heuristic.
Merge engine = Blocking -> Scoring -> Decision bands.
IMPLICATION FOR TODAY: the fixed dedup_detect fragment path (28aa) is still a THRESHOLD heuristic - the wrong
architecture per this doctrine. BUT: the very-rare KOL fragments (Guttman-Yassky et al., surname freq 2-4,
identical first name + same institution + same domain + pub continuity) score OVERWHELMINGLY under the evidence
model too - they're unambiguous high-confidence auto-merges by ANY reasonable model. So there's a defensible
narrow path: merge ONLY the handful where evidence is overwhelming (rare surname + full name + corroboration),
which is a strict subset of even the tightened threshold. But the RIGHT build is the scoring subsystem.

### 28ad. DECISION - Path B: implement the HIGH-CONFIDENCE BAND of the future resolver (strict subset, not throwaway)
Chosen: Path B, framed correctly (consistent with FieldMark's established pattern: global-ingest-then-refine,
high-recall-then-precision, ontology-config-then-framework). The milestone is NOT perfect identity resolution -
it's "FieldMark generalizes to a 2nd, different TA (AD) with credible, domain-recognizable rankings." Merging
a couple dozen obvious KOL fragments gets us there = high return.
CRITICAL FRAMING: today's merge is the HIGH-CONFIDENCE DECISION BAND of the eventual evidence-scoring resolver
(28ac), implemented first. NOT a temporary heuristic to throw away. It must be a STRICT SUBSET of the future
system: anything we auto-merge today, the future scorer would also auto-merge at high confidence.
TIGHTENED AUTO-MERGE CRITERIA (all required):
  1. Identical normalized full name (name_key first AND last).
  2. Rare surname / low ambiguity (rare enough that full-name match is strong; not a common-name field).
  3. >=1 CORROBORATING SIGNAL: same institution (or institution history) OR strong publication overlap /
     domain continuity OR shared coauthor network OR existing OpenAlex/ORCID linkage.
  NO corroboration -> NO merge. (Enforces the invariant: when in doubt, don't merge.)
  => This is STRICTER than the 28aa threshold set (which was name+rarity only). The 3,058 must be filtered to
     those with a corroborating signal. Expect a couple dozen to low-hundreds, dominated by the KOLs.
RECORD THE REASON per merge (store on the merge/mapping row):
  merge_reason: [identical_normalized_name, rare_surname, same_institution, same_pub_domain, ...],
  confidence: high. These become TRAINING EXAMPLES for the future scoring subsystem.
EXPLICITLY AVOID: a throwaway heuristic. Today's code = first decision band of Blocking->Scoring->Bands.
NEXT LEG (committed, after AD validated): build the full evidence-scoring identity-resolution SUBSYSTEM
(blocking + multi-signal scoring incl. global rarity + ORCID/OpenAlex primary keys + 3 decision bands +
review queue). That's the real infrastructure; today is its high-confidence slice.
IMMEDIATE: add corroboration filter to the fragment high-confidence set (institution / coauthor / pub-domain /
openalex), record merge_reason, dry-run, spotcheck KOLs + confirm no un-corroborated merges, merge, re-derive
metrics, re-classify. THEN AD established = real dermatology KOLs = the generalization verdict.

### 28ae. ADVISOR converges with ontologist + adds refinements. Reframe: AMBIGUITY not geography.
Advisor (independent) lands on the SAME doctrine as the ontologist (28ac) - strong convergence signal. Adds:
REFRAME (corrects 28z): it's NOT "don't dedupe Asia-Pac" - it's "don't auto-merge HIGH-AMBIGUITY names, any
origin." John Smith / David Brown / Michael Johnson are as unmergeable as Wei Li. Variable = name frequency/
ambiguity, NOT country. This is why our Bernstein/Friedman/Levine tail is the SAME problem as Wang/Li - common
Western names. Rule reframed: block auto-merge on ambiguity, not geography. (Avoids geographic rules entirely.)
ADOPT - identity_status field on every HCP: resolved / high_confidence / ambiguous / fragmented / reviewed.
Gives the resolver "somewhere to put uncertainty" instead of pretending certainty. A fragmented Wei Li is
MARKED fragmented, not silently left as 3 records. Substrate for the future resolver.
ADOPT - identity_confidence as a COMPUTED signal (ambiguity score), replacing any country/geographic flag.
KEY INSIGHT - time fixes many for free: ORCID adoption + OpenAlex author-clustering improve continuously.
Today's impossible Wei Li merge may be trivial next year when an ORCID appears. => Don't force merges now;
you'd permanently bake a bad merge to solve a self-resolving problem.
THE CLINCHER (why this is non-negotiable for a KOL product): fragmented Wei Li ranking #42/#57/#88 instead of
#1 hurts RECALL (under-credited, honest, recoverable). Three different Wei Lis fused into a monster #2 profile
destroys TRUST (fabricated superhuman KOL). Recall-loss is a limitation; false-merge is a credibility killer.
LONGER-TERM (advisor's vision, = the future subsystem): author resolution should barely rely on names. Build a
GRAPH from ORCID + institutional history + coauthor communities + pub topics + career timelines + grant history
+ ClinicalTrials.gov investigators + NPI. Names = one signal among many. Dedicated project, graph-based resolver,
NOT cleverer name heuristics.
NET: today's Path B (28ad) high-confidence-band merge is confirmed correct by BOTH experts. Add identity_status
as the uncertainty substrate. Reframe the committed rule from geography to ambiguity. Future = graph-based
identity subsystem.

### 28af. Corroboration too weak - both_have_openalex + pub_domain_overlap are near-universal (false signals). Tighten.
Cursor correctly flagged: both_have_openalex fired 773/774 (99.9%) -> corroboration requirement is a near no-op.
"Both have an OpenAlex id" = both publish, NOT evidence of same person. Admits false merges (Osborn: Sydney vs
UCL, plausibly 2 people, passed on both_have_openalex;pub_domain_overlap).
ALSO WEAK: pub_domain_overlap fired 739/774. Within a single TA (AD), EVERY HCP has AD-domain pubs, so
"both have AD pubs" is near-universal - two different Wei Lis both in AD both pass. Domain-overlap-within-same-TA
is NOT real corroboration.
GENUINELY STRONG signals (distinguish same-person from same-name-same-field):
  shared_openalex_id (identical author id) = dispositive (fired 1x - rare but gold).
  shared_coauthors (>=1 common coauthor hcp) = strong (fired 615).
  same_institution = strong (fired 132).
TIGHTEN: qualifying corroboration = shared_openalex_id OR shared_coauthors OR same_institution ONLY. DROP
both_have_openalex and pub_domain_overlap as qualifying signals (can still RECORD them in merge_reason as
context, but they don't qualify a merge alone). This makes the false-merge invariant actually bite.
KATOH note: dropped because surname freq >10 under the strict bar. Acceptable for now (conservative). If needed,
a corroboration-based exception for the 11-50 band (require STRONG corroboration: shared_coauthors or
same_institution or shared_openalex_id) would retrieve Katoh-class KOLs safely without opening common names -
but ONLY strong signals, and only if we want to widen. Defer unless a known KOL is missing.
EXPECTED AFTER TIGHTENING: high-confidence drops from 774 to the subset with a STRONG signal (roughly the
~615 shared_coauthors + ~132 same_institution union, minus overlap, likely a few hundred). KOLs should survive
(Guttman-Yassky has same_institution; Werfel has same_institution+shared_coauthors). Re-vet.

### 28ag. Fragment high-confidence band FINALIZED + clean. 631 corroborated merges. Osborn correctly demoted.
Tightened to STRONG signals only (shared_openalex_id OR shared_coauthors OR same_institution); both_have_openalex
+ pub_domain_overlap demoted to context:<signal> tokens (recorded, never qualify).
FINAL VETTING (all clean):
  high-confidence: 631 (was 774) | different-first-names: 0 | common surnames: NONE | demoted low_evidence: 868.
  KOLs all survive with STRONG signal: guttman-yassky (same_institution), werfel/ferrucci/geha/luger
  (same_institution+shared_coauthors), yosipovitch (same_institution).
  Osborn (Sydney vs UCL) DEMOTED: only weak signals -> fragment_low_evidence. False-merge invariant bites. 
  Strong-signal freq: shared_coauthors 615, same_institution 132, shared_openalex_id 1.
This IS the high-confidence decision band of the future resolver (28ad) - strict subset, corroborated,
explainable (merge_reason on every row). 631 is the reviewable, mergeable set.
NEXT: (1) human spot-check a sample of the 631 + all KOLs in the CSV (final gate). (2) confirm dedup_merge
handles TRANSITIVE clusters (Werfel 3 records -> all fold to richest; process by works_count desc). (3) merge
DRY-RUN -> watch [SURVIVOR SWAP] (Guttman-Yassky eb13/764 wins over b7f8/37). (4) execute merge. (5) re-derive
total_career_pubs + career_first_pub_year_v2 on merged identities (fixes de-inflation-order harm). (6) re-run
cohort classifier -> AD established should now surface real AD dermatology KOLs (Silverberg, Guttman-Yassky,
Simpson, Werfel, Yosipovitch, Eichenfield...) = THE GENERALIZATION VERDICT.
Still open (deferred, non-blocking): Katoh (freq 11, just over bar) left un-merged - revisit only if a known
KOL is conspicuously missing post-classification (would need 11-50 band w/ strong-signal-required exception).
identity_status field (28ae) = future subsystem. Update committed rule wording geography->ambiguity (28z).

### 28ah. Merge DRY-RUN validated - transitive components correct, KOLs resolve to rich survivor. Ready to execute.
dedup_merge.py now does union-find components + choose_survivor_many (highest works_count) + already-merged
tracking + survivor!=stub guard + global overlap assertion.
DRY-RUN (--tier merge_fragment_high_confidence): 593 components (from 631 pairs - transitive collapse working),
614 record merges, 0 failed, survivor/merged-away overlap=0.
  Werfel comp: survivor 3d228ade (513w) <- merges 365w, 74w, 25w. All fold to richest.
  Guttman-Yassky comp: survivor eb133e58 (764w) <- merges b7f8166d (37w). Real profile wins.
Single-pair FK-repoint/NPI-shuffle/field-merge machinery unchanged, now driven per component member.
This is a correct, safe merge plan. READY TO EXECUTE.
POST-MERGE SEQUENCE (the home stretch):
  1. execute merge: python scripts/dedup/dedup_merge.py --execute --tier merge_fragment_high_confidence
  2. re-derive total_career_pubs (join-table COUNT) on merged identities - Guttman-Yassky etc. jump to real
     counts. (This fixes the de-inflation-order harm; run dedup-THEN-deinflate now.)
  3. re-derive career_first_pub_year_v2 on merged identities (re-run the sustained-onset SQL, AD-scoped).
  4. re-fetch/confirm author metrics already cover survivors (works_count on survivor is the rich one).
  5. re-run cohort classifier (--execute) on corrected identities.
  6. inspect AD established preview -> real AD dermatology KOLs (Silverberg, Guttman-Yassky, Simpson, Werfel,
     Yosipovitch, Eichenfield, de Bruin-Weller, Wollenberg) should now surface. Hepatologist passengers with
     0 AD pubs should recede (still present via career_age>10 global rule, but out-ranked by the TA-scoped
     established SCORER which we still need to wire + run).
  7. THEN established scorer (publication_leadership TA-scoped) -> KOL ranking = generalization verdict.
NOTE: merge writes to hcps_v2 + re-points publication_authors_v2/hcp_therapeutic_areas_v2/etc. This is
platform-global (not AD-scoped) - it fixes fragments across ALL TAs (fine, correct - a person is a person).
Verify no NSCLC damage after (NSCLC was clean; these merges only touch fragmented records, mostly AD-int'l).

### 28ai. Merge EXECUTED - ~590 succeeded, ~55 failed cleanly on missing FK (hcp_top_collaborators_v2). Recoverable.
Ran --execute --tier merge_fragment_high_confidence. Result: majority of 593 components merged successfully;
~55 FAILED with FK violation: hcp_top_collaborators_v2_collaborator_hcp_id_fkey (the merged-away id still
referenced as a COLLABORATOR). The merger's FK re-point list is MISSING hcp_top_collaborators_v2 (which has
TWO hcps_v2 refs: hcp_id AND collaborator_hcp_id).
STATE IS CLEAN: verified the failed Paz-Ares component - all 4 records still exist (survivor 853f1e92 240pubs +
merge-aways 5190a810/557e4a62/8b3d5565). Per-component transaction rolled back the failures ENTIRELY. No
partial/half-merged state. The ~590 successful merges are committed; the ~55 failed simply didn't merge.
BONUS FINDING: Luis Paz-Ares (major NSCLC KOL) is fragmented 4 ways (240 + 6/3/5 pubs) via Paz-Ares hyphen
variant (U+002D vs U+2010). The merge correctly caught him; just failed to execute on the FK. Confirms merge
is platform-global + fixing NSCLC fragments too (correct - a person is a person). NSCLC had this fragmentation
too, just fewer (its 3% zero-pub tail).
FIX: add hcp_top_collaborators_v2 to dedup_merge FK re-point (BOTH hcp_id and collaborator_hcp_id), with
conflict-delete on dup (hcp_id,collaborator_hcp_id) rows AND self-reference delete (hcp_id==collaborator_hcp_id
post-merge). ALSO audit ALL FKs referencing hcps_v2.id to catch any OTHER missing tables in one pass (avoid
another round-trip). Then re-run --execute (idempotent: ~590 done components gone from graph, only ~55 failed
re-attempt).
POST: verify Paz-Ares + Guttman-Yassky consolidate to single survivor. Then re-derive metrics -> re-classify.

### 28ai-update. Real merge numbers: 482 succeeded, 132 failed (not ~55). Clean state, overlap 0.
Final summary of the --execute run: 593 components processed, 482 successful record merges, 132 FAILED (all on
hcp_top_collaborators_v2_collaborator_hcp_id_fkey), overlap=0 (safety holds). 482 merge-aways deleted
("Stubs deleted count: 482" - legacy counter name, = successful consolidations).
So 132 failed (21% of 614), more than the initial ~55 estimate - more records are collaborator-referenced than
thought. All rolled back cleanly (per-component txn; Paz-Ares 4 records verified intact). No partial state.
482 consolidations ARE committed (Guttman-Yassky likely among them - verify).
FIX pending: add hcp_top_collaborators_v2 (both hcp_id + collaborator_hcp_id) + audit ALL hcps_v2 FKs, then
re-run --execute for the 132 stragglers (idempotent). Expect Failed=0 on re-run.

### 28aj. Guttman-Yassky merge CONFIRMED correct - identity consolidated, other Guttmans correctly untouched.
Post-merge: ONE Emma Guttman-Yassky record (was 2: 37w b7f8 + 764w eb13), now linked_pubs=8 (6+2 combined).
Her component was among the 482 successes. SAFETY VALIDATED IN PRODUCTION: the 7 OTHER Guttmans (Orlee/Charles/
Sarah/Michael/Katherine/Harvey/Steven - DIFFERENT first names) stayed SEPARATE. First+last safety held on real
data - no wrong fusion.
IMPORTANT NUANCE - identity fixed but PUBLICATION LINKAGE still thin: Emma now points at the 764-work OpenAlex
author (survivor), but linked_pubs is only 8. Her actual ~764 pubs exist in OpenAlex but are NOT LINKED into
publication_authors_v2 (never ingested/linked into the AD corpus). So:
  - The MERGE fixed IDENTITY (one record, rich OpenAlex author profile, works_count 764).
  - But total_career_pubs re-derivation (from LINKED pubs) will give ~8, NOT 764, because the corpus lacks her
    actual publication rows.
=> Two SEPARATE problems, now disentangled: (1) identity fragmentation [FIXED by merge], (2) publication-corpus
under-linkage [still open - her real pubs aren't in publication_authors_v2].
This means: after re-derive + re-classify, Guttman-Yassky's ESTABLISHMENT should improve (she's now one record
with works_count 764 -> the establishment override pubs>=500-by-OpenAlex-works could catch her IF the classifier
reads OpenAlex works_count; but the current classifier reads total_career_pubs which will be ~8). NEED TO CHECK:
does establishment/ranking use OpenAlex works_count (rich) or linked total_career_pubs (thin)? If the latter,
merge alone won't fix her ranking - the corpus linkage gap remains. May need to also use OpenAlex works_count
as an establishment signal, OR complete the publication linkage (bigger job).
NEXT: finish the 132 stragglers (FK fix + re-run), then re-derive metrics, then RE-EXAMINE whether KOLs surface
- and if linked-pub thinness still buries them, decide: use OpenAlex works_count in establishment, or link pubs.

### 28ak. FK fix was 17 MISSING columns, not 1 - full audit prevented cascade of failures + silent score loss.
Catalog audit: 39 FKs reference hcps_v2.id; merger handled only 22 -> 17 MISSING (now added). hcp_top_
collaborators_v2 was just the FIRST missing FK to get hit; fixing only it would have hit the next, etc. Full
audit in one pass was the right call.
Critical among the 17: SCORE/RANK tables (hcp_established_ranks_v3, hcp_score_ranks_v2, hcp_network_centrality_v2,
hcp_publication_leadership_v2, hcp_pharma_engagement_v2, hcp_author_metrics_v2). Had these not been re-pointed,
merged-away KOLs' scores/metrics would be ORPHANED/LOST on merge. Audit prevented silent score-data loss, not
just the crash. Conflict keys derived from each table's ACTUAL pk/unique constraint (queried pg_constraint).
hcp_top_collaborators_v2: both hcp_id (conflict-delete on real unique key) + collaborator_hcp_id (plain
re-point) + self-collaboration delete (hcp_id==collaborator_hcp_id post-merge). Per-component txn intact.
OPERATIONAL NOTE for the re-run: 482 records were already merged-away+deleted by the first --execute. Re-running
--execute will emit "[FAILED] Primary or stub not found" for those stale-CSV rows - that's EXPECTED stale-CSV
residue (the record is gone), NOT an error, isolated per-component. Only the 132 previously-FK-failed components
will actually merge this time. So the re-run summary will show ~482 "failed" (stale/not-found) + ~132 success +
0 real FK failures. Don't be alarmed by the "failed" count - check that FK violations = 0 and overlap = 0.
NEXT: re-run --execute. Expect: 132 real merges succeed, ~482 "not found" (stale, harmless), 0 FK errors,
overlap 0. Then verify KOLs consolidated + no NSCLC damage, then re-derive metrics.

### 28al. FRAGMENT MERGE COMPLETE. Run 2: 104 more merged, 0 FK violations, overlap 0. Done.
Re-run after 17-FK fix: Successful=104, Failed=510 (all harmless "not found" stale-CSV - the already-merged
records from run 1), ForeignKeyViolation=0 (the real test - PASSED), overlap=0.
TOTAL across both runs: ~586 fragment records consolidated (482 run1 + 104 run2), 0 FK violations, 0 overlap,
no partial state. Identity fragmentation merge for the high-confidence corroborated band is DONE.
Guttman-Yassky consolidated (1 record), other Guttmans untouched (safety validated). Paz-Ares component was in
run 2's 104 - should now be consolidated to the 240-pub survivor (verify next session).
=== STOPPING POINT FOR THE DAY ===
STATE: clean. 586 corroborated KOL/name fragments merged. dedup_detect (Unicode name_key + fragment path +
rarity + strong-corroboration) and dedup_merge (works_count survivor + union-find transitive + 39-FK re-point)
are FIXED and committed-worthy. The merge_reason on each = training data for the future evidence-scoring resolver.
IMMEDIATE NEXT SESSION (the home stretch, in order):
  1. Verify: Guttman-Yassky + Paz-Ares single consolidated records; quick NSCLC sanity (no damage - it was clean,
     merges only touched true fragments).
  2. RE-DERIVE total_career_pubs (join-table COUNT, AD-scoped) on merged identities [dedup-then-deinflate, the
     corrected order]. Re-derive career_first_pub_year_v2 (sustained-onset SQL) on merged identities.
  3. RE-RUN cohort classifier --execute on corrected identities.
  4. Inspect AD established preview -> do real AD dermatology KOLs surface (Silverberg, Guttman-Yassky, Simpson,
     Werfel, Yosipovitch, Eichenfield, de Bruin-Weller, Wollenberg)?
  5. THE OPEN QUESTION (28aj): linked_pubs still thin for some KOLs (Guttman-Yassky 8 vs OpenAlex 764) because
     their real pubs aren't LINKED in publication_authors_v2 (corpus under-linkage, SEPARATE from identity).
     Check whether establishment/ranking uses OpenAlex works_count (rich -> KOLs surface) or linked
     total_career_pubs (thin -> KOLs still buried). If the latter, decide: add works_count as establishment
     signal, OR complete publication linkage. THIS is likely the last real blocker to a credible AD KOL ranking.
  6. Then established scorer (publication_leadership TA-scoped) -> AD KOL ranking = GENERALIZATION VERDICT.
DEFERRED: Katoh (freq 11, just over rarity bar); identity_status field + full evidence-scoring resolver
subsystem (the real future infra); reframe committed rule geography->ambiguity; scope-the-loads on other
pipelines; Hep/Rare trials restore; midday/EOD doc sweeps (do now).

## SESSION July 8 (morning) — post-merge verification + home stretch

### 29a. Merge landing CONFIRMED on both benchmarks. Identity vs corpus-linkage cleanly separated.
Post-merge state: Guttman-Yassky = 1 record (linked_pubs 8, tcp 6 stale); Paz-Ares = 1 record (tcp 240,
linked_pubs 253 - his 4 fragments folded to the 240 survivor). Both consolidated correctly.
KEY CONTRAST (makes §28aj concrete):
  - Paz-Ares consolidated WELL: linked 253 ~ tcp 240. His real pubs ARE linked (NSCLC's more-complete
    ingestion). Post-merge numbers correct.
  - Guttman-Yassky consolidated but THIN: linked 8 vs OpenAlex works_count 764. Identity fixed; corpus
    lacks her actual pub rows. total_career_pubs still 6 (stale - not yet re-derived).
=> Confirms: merge fixes IDENTITY for all; CORPUS LINKAGE is a separate problem, fine for well-ingested
KOLs (Paz-Ares/NSCLC) but thin for under-ingested ones (AD intl KOLs). The linked-pub-thinness question
(does scoring read works_count vs total_career_pubs) is the live one for AD KOL ranking.
NEXT: re-derive total_career_pubs + career_first_pub_year_v2 on merged identities -> re-classify -> inspect
established -> resolve the works_count-vs-linked question.

### 29b. total_career_pubs re-derived on merged identities (dedup-then-deinflate, correct order). 
Ran AD-scoped join-table COUNT UPDATE on merged identities. Guttman-Yassky tcp 6->8 (her linked count; still
thin vs works_count 764 - the corpus-linkage issue, not identity).
OPEN DECISION (settle after seeing established ranking): should establishment + the established SCORER read
OpenAlex works_count (rich, catches under-linked KOLs) instead of / in addition to total_career_pubs (linked,
thin)? Guttman-Yassky classifies established anyway via career_age>10, BUT the established SCORER
(publication_leadership) counts AD-specific LINKED senior-authorships -> with 8 linked pubs she'll RANK LOW
within established. career_age saves her INTO the cohort; thin linkage BURIES her ranking. Measure the burial
empirically (re-classify + inspect), THEN decide the works_count fix. User wants to settle works_count later.
NEXT: re-derive career_first_pub_year_v2 on merged identities -> re-run classifier -> inspect established.

### 29c. career_first_pub_year_v2 re-derived on merged identities. Guttman-Yassky 2003 (from rich survivor).
Both career inputs now clean on MERGED identities:
  has_v2=15,847 (full; down from 15,902 = ~55 merged away, expected), v2_median=2013 (NSCLC parity),
  pre_1970=92 (known residual, guarded). Silverberg=2008. 
  GUTTMAN-YASSKY = 2003 (was reading a fragment before; now computes from the 764-work survivor eb13's
  26-year history -> her REAL career start). career_age=23 >> 10 -> classifies ESTABLISHED. Merge fix
  propagated correctly into career data. ad_yearly metrics clean (no dup rows). Staging dropped.
Career inputs status: career_first_pub_year_v2 = rich/correct (reads OpenAlex counts_by_year, which is the
FULL profile even for under-linked KOLs). total_career_pubs = LINKED count (thin for under-linked KOLs).
=> NOTE the asymmetry: career-YEAR benefits from OpenAlex (rich even when pubs unlinked); pub-COUNT does
not (it's linked-only). This is exactly why the works_count question matters for the SCORER but NOT for
career-age-based establishment.
NEXT: re-run cohort classifier --dry-run on merged/clean identities -> inspect established preview -> do the
real AD dermatology KOLs surface (and do the hepatologist passengers recede)?

### 29d. Classifier re-run on merged identities - classification CORRECT; preview pub-sort still cosmetic-hepatologist.
Dry-run (15,847 merged HCPs): established 9,449 (59.6%) / rising_eligible 5,925 / too_young 465 / community 8.
Established-rule: pubs>=500: 0, pubs>=200_pre2020: 16, career_age>10: 9,433.
CLASSIFICATION IS CORRECT: all real AD KOLs established (Silverberg 465, Simpson 219, de Bruin-Weller 182,
Wollenberg 173; Guttman-Yassky established via 2003 career-year though not in top-25-by-GLOBAL-pubs since her
LINKED count is 8). 
Preview STILL shows hepatologists at top (Sanyal 412, Wedemeyer 378, Sarin 371...) - but this is the PREVIEW
sorting by total_career_pubs (GLOBAL linked count), NOT the established ranking. The preview can't see that
those pubs are hepatology. COSMETIC. The REAL ranking = publication_leadership_scoring (TA-scoped, AD-only
senior-authorships, verified §28h) where Sanyal's AD score ~0 -> sinks; Silverberg/Simpson/Wollenberg rise.
=> Classification unblocked. Next: --execute the classifier, then wire + run the established SCORER (the actual
ranking), which is where the KOL surfacing gets PROVEN and where the works_count question gets decided.
NOTE: could improve the preview to sort by AD-specific pub count (cosmetic-only, low priority) so future
dry-runs don't alarm. Not blocking.

### 29e. DECISION - hepatologists should NOT appear in AD established at all (not just rank low). TA-anchor establishment.
User: don't want hepatologists in the established output, even ranked low. Correct instinct - it's not merely
cosmetic. ROOT: establishment gate uses career_age>10 on a GLOBAL career with NO AD-specific requirement. Sanyal
(hepatology, ~3-4 AD pubs, 0 AD senior-authorship) passes purely on his liver career age. The 2,379 zero-AD-pub
"established" HCPs are all this pattern - senior in OTHER fields, brushed AD.
FIX: establishment in a TA must require MINIMUM AD-SPECIFIC engagement, not just a long global career. "Established
in AD" = real AD footprint, not "long career + happens to be AD-tagged".
DESIGN OPTIONS for the AD-specific establishment requirement:
  (a) Require AD-specific pub count >= threshold (e.g. AD_linked_pubs >= 5) as a GATE on establishment. But:
      this re-introduces the linked-pub-thinness problem - Guttman-Yassky has only 8 AD-LINKED pubs (rich
      OpenAlex but thin corpus). A threshold of 5 keeps her (8>=5) but a threshold of 10 would DROP her. Risky.
  (b) Require the AD-specific establishment SCORE (from publication_leadership, which is AD-scoped) to be
      non-trivial - i.e. classify established, then DROP from established-output anyone whose AD leadership
      score is ~0 (no AD senior-authorship at all). This uses the scorer's TA-scoped signal as the gate.
  (c) Two-tier: keep career-based "established" as an internal cohort, but the KOL-RANKING output only includes
      established HCPs with AD-specific evidence (>=1 AD senior/first-authored pub, or AD leadership score >0).
CONSIDERATION: the linked-pub thinness (Guttman-Yassky 8 AD-linked vs 764 global) means a raw AD-pub-count gate
is dangerous - it could drop real KOLs whose pubs are under-ingested. Safer: gate on AD-specific AUTHORSHIP
EVIDENCE (senior/first author on >=1 real AD pub) rather than a pub-count threshold, OR gate on the AD
leadership score being >0. Sanyal has 0 AD senior-authorships -> drops. Guttman-Yassky has some -> stays
(even with thin linkage, her few AD pubs include senior-authored ones).
=> Need to CHECK: do the hepatologists have 0 AD senior/first-authorships while real AD KOLs have >=1? If so,
"AD-specific authorship evidence" is the clean gate. This ALSO informs the works_count question. Verify before
choosing the fix.

### 29f. CRITICAL - is_senior_author / is_first_author are UNPOPULATED (all 0, even for Silverberg 464 AD pubs).
Authorship-evidence check: ad_senior_auth=0 and ad_first_auth=0 for EVERYONE - including Silverberg (464 AD
pubs), Simpson (219), Wollenberg (173), Eichenfield (143). Impossible as real signal (Silverberg is obviously
senior author on many). => is_senior_author/is_first_author columns in publication_authors_v2 are NOT POPULATED.
CONSEQUENCE: the proposed "require >=1 AD senior/first authorship" establishment gate (29e option b/c) would
EXCLUDE EVERY AD KOL. Dodged a bad fix by verifying first.
ALSO IMPORTANT: this means publication_leadership_scoring.py - which scores established HCPs on
COUNT(*) FILTER (WHERE pa.is_senior_author), senior_pub_recent_5yr, first_pub_count, etc. - is scoring on
UNPOPULATED columns. Its senior/first-author signals are all ZERO. So the established SCORER as written would
give near-zero scores to everyone on its primary signals (guideline_pub_count/editorial/review may still fire
if those publication_types are populated, but the authorship-position signals are dead). This is a BIGGER
finding: the established scorer may be largely non-functional for AD (and maybe NSCLC?) because it depends on
authorship-position data that isn't there.
NEED TO CHECK: (1) is is_senior_author populated for NSCLC (did the established scorer ever actually work)?
(2) where is authorship position SUPPOSED to come from - OpenAlex authorships (author_position: first/middle/
last) - was it never extracted into publication_authors_v2? (3) can we derive it from publications_v2.authorships
JSON (author_position field)?
REVISED establishment-anchor options (since authorship-position is dead):
  - Gate on AD-specific PUB COUNT (ad_pubs >= threshold) after all - but handle linkage thinness. Silverberg
    464, Simpson 219, Wollenberg 173, Eichenfield 143, Yosipovitch 11, Guttman-Yassky 8. A threshold ~5 keeps
    all real KOLs incl Guttman-Yassky(8)/Yosipovitch(11); hepatologists have ad_pubs=0 -> excluded. CLEAN.
  - The hepatologists (Sanyal/Loomba/Wedemeyer/Sarin/Tacke/Bajaj/Gores/Trebicka/Trautwein) ALL have ad_pubs=0!
    So a simple ad_pubs>=1 (let alone >=5) excludes every one of them. The zero-AD-pub establishment passengers
    are cleanly cut by ANY positive AD-pub requirement.
=> SIMPLEST CLEAN FIX: establishment in AD requires ad_pubs >= N (N=1 excludes all hepatologists; N=5 is safer
against 1-off tag noise and still keeps all real KOLs since lowest real KOL Guttman-Yassky=8). Verify no real
KOL sits below the chosen N first.
BUT separately flag the authorship-position gap - it breaks the established SCORER's ranking signal and needs
its own fix (derive author_position from OpenAlex authorships JSON).

### 29g. TA-anchored establishment WORKS. Hepatologists gone. Established 9,449 -> 2,547 (16.1%, credible KOL tier).
Added ta_pubs>=5 AND (career rule) to establishment. AD dry-run:
  established 2,547 (16.1%, was 59.5% - now a CREDIBLE KOL-tier size) | rising_eligible 5,925 | too_young 465 |
  community 6,910.
  6,902 former career-established -> community via ta_pubs<5 (2,373 zero-AD-pub + 4,529 with 1-4 AD pubs).
  HEPATOLOGISTS ALL COMMUNITY: Sanyal/Loomba/Wedemeyer/Sarin/Tacke/Bajaj/Gores/Trebicka/Trautwein (ta_pubs=0)
  -> none in established. USER'S REQUIREMENT MET.
  AD KOLs RETAINED established: Silverberg 464, Simpson 219, de Bruin-Weller 182, Wollenberg 173, Eichenfield
  143, Yosipovitch 11, Guttman-Yassky (cleared >=5).
cohort_reason audit trail: "established:career_age>10+ta_pubs=12" vs "community:career_age>10_but_ta_pubs=0" -
every decision explainable. ta_pubs + threshold in tier_inputs.
TA_ESTABLISHED_MIN_PUBS=5 constant (tunable). This is the TA-ANCHOR for establishment - "established in a TA"
now requires real TA output, not just a long global career. SHOULD BE STANDARD FOR ALL TAs (add to playbook).
NEXT: --execute the classifier. Then wire established scorer to hcp_cohort_classification_v2. BUT flag §29f:
the scorer depends on is_senior_author/is_first_author which are UNPOPULATED - scorer's ranking signal is dead,
needs author_position derived from OpenAlex authorships JSON before it can rank. That's the next real blocker
for the KOL RANKING (vs cohort membership, which is now correct).

### 29h. Classifier dry-run verified by user's own eyes - edge cases all correct. Execute.
User-run dry-run confirmed: established 2,547 / rising_eligible 5,925 / too_young 465 / community 6,910
(matches Cursor's report - accurate this time). Hepatologists all community w/ audit reason (...but_ta_pubs=0).
KOLs all established (J.Silverberg 464, E.Simpson 219, Wollenberg 173, L.Eichenfield 143, Yosipovitch 11).
EDGE CASES CORRECT (logic is genuinely sound, not just headline): Kavita Sarin(3)/Shiv Sarin(0) both community
- different people; Dawn Eichenfield(5)->rising vs Lawrence Eichenfield(143)->established; Andrew Simpson(3)->
rising vs Melanie Simpson(7)/Eric Simpson(219)->established. Same-surname different-people split correctly by
actual career+output. cohort_reason fully auditable.
EXECUTED (pending user confirm of persisted counts).

### 29i. *** GENERALIZATION VERDICT: YES *** AD established cohort = a real AD who's-who. Hepatologists gone.
Classifier EXECUTED. Established preview top 25 (by total_career_pubs) is now a genuine AD KOL list:
  Silverberg(464), Simpson(219), de Bruin-Weller(182), Wollenberg(173), Patruno(158), Weidinger(153),
  Werfel(143), L.Eichenfield(143), Flohr(141), Napolitano(139), Lio(134), Irvine(131), Ferrucci(128),
  Bieber(126), Donald Leung(121), Ohya(107), Drucker(104), Feldman(102), Deleuran(101), Schuttelaar(98),
  Bissonnette(98), Cork(95), Gooderham(96), Hywel Williams(93), Katoh(89).
ALL real AD dermatology KOLs. ZERO hepatologists. Every ta_pubs ~= global pubs (they SPECIALIZE in AD = the
KOL hallmark). Matches the playbook validation-target list (Silverberg/Simpson/Eichenfield/Bissonnette/Thaci/
Deleuran). MERGED KOLs are IN the list (Werfel/Ferrucci/Katoh/Leung - the dedup paid off, they're consolidated
+ established). 
This is the payoff of the entire dedup+reclassify arc (28g->29i): "why hepatologists" -> global-count est ->
fragmentation -> dedup subsystem -> 586 merges -> re-derive -> TA-anchored establishment -> THIS LIST.
=> The FieldMark methodology GENERALIZES to a 2nd, fundamentally different TA (AD, 82% intl, derm not onc) with
a credible, domain-recognizable established cohort. The core milestone this whole build was chasing. 
CAVEAT (honest): this preview is sorted by total_career_pubs (a reasonable proxy). The FINAL RANKING still comes
from the established SCORER (publication_leadership), which needs (a) wiring to hcp_cohort_classification_v2 and
(b) the is_senior_author/is_first_author populate fix (§29f - currently dead). So COHORT MEMBERSHIP is proven
correct; the within-cohort RANKING refinement is the remaining work. But membership being right - the KOLs are
IN, the passengers are OUT - is the hard part and it's done.
NEXT: (1) confirm persisted counts. (2) authorship-position diagnostic (does publications_v2.authorships JSON
have author_position to derive from?) -> determines the scorer-ranking fix size. (3) wire scorer to new cohort
table. (4) run scorer -> final ranking.

### 29j. hcp_cohort_classification_v2 needed GRANT (recurring new-table issue). Fixed.
Classifier --execute failed: "permission denied for table hcp_cohort_classification_v2" (code 42501).
Logic was fine (computed 15,847 rows); the NEW table (created yesterday) never got grants. Standard fix:
  GRANT SELECT,INSERT,UPDATE,DELETE ON public.hcp_cohort_classification_v2 TO service_role;
  GRANT SELECT,INSERT,UPDATE,DELETE ON public.hcp_cohort_classification_v2 TO anon, authenticated;
  NOTIFY pgrst, 'reload schema';
Then re-run --execute. REMINDER (already a known rule, reconfirmed): EVERY new table/view needs GRANT +
NOTIFY pgrst reload schema before API/script access. Add the CREATE TABLE DDL for cohort_classification_v2
to include these grants so future TA builds don't hit this. This is a committed checklist item.

### 29k. Cohort classification PERSISTED on merged/TA-anchored identities. AD cohorts DONE.
hcp_cohort_classification_v2 written: established 2,547 / community 6,910 / rising_eligible 5,925 /
too_young 465 (matches dry-run exactly). AD cohort classification is DONE and correct on merged identities.
State: identity fragmentation fixed (586 merges) -> career metrics re-derived on survivors -> cohorts
classified correctly (credible 16% established KOL tier, real AD who's-who, zero hepatologists).
REMAINING for the full KOL RANKING (not membership - that's done):
  1. Wire established scorer (publication_leadership_scoring) to read hcp_cohort_classification_v2 WHERE
     cohort='established' (currently reads hcp_established_ranks_v2). §27 consumer migration.
  2. §29f authorship-position gap: scorer ranks on is_senior_author/is_first_author which are UNPOPULATED.
     Diagnostic needed: does publications_v2.authorships JSON have author_position (first/middle/last) to
     derive into publication_authors_v2? Determines fix size.
  3. Run scorer + network + pharma -> composite -> final AD established ranking.

### 29l. author_position IS in the OpenAlex JSON -> scorer-ranking fix is a DERIVE (not re-enrich). Outcome #1.
publications_v2.authorships JSON has author_position ("first"/"middle"/"last") FULLY POPULATED, plus
is_corresponding (bonus). Data looks correct: Silverberg mix of first/last/middle (leads + supervises);
Guttman-Yassky several last (senior author), one last+corresponding (clearly leading).
=> The dead is_senior_author/is_first_author signals (§29f) are FIXABLE by SQL derivation:
  is_senior_author = (author_position = 'last')   [biomedical senior/supervising convention]
  is_first_author  = (author_position = 'first')
  (optionally capture is_corresponding as extra leadership signal)
Derive per (publication_id, hcp_id) link in publication_authors_v2 by matching the authorships array element
to the link. Since dedup already merged identities, the link's hcp_id points to the survivor -> derivation
attaches to consolidated KOL correctly (JSON name variants like Guttman-Yassky hyphen echoes don't matter,
we populate against the link's hcp_id).
MATCHING CHALLENGE to handle: the authorships array element must be matched to the correct publication_authors_v2
row. Match on (publication_id, openalex_author_id) if the link stores the OpenAlex author id, else on
(publication_id, normalized author name). Prefer openalex_author_id if available on the link/authorships.
NEXT: write the derivation (populate is_senior_author/is_first_author in publication_authors_v2 from
authorships.author_position), scoped to AD pubs first (or global - it's a correctness fix for all TAs).
Then wire scorer to hcp_cohort_classification_v2 + run -> the signals fire -> real KOL ranking.
This ALSO retroactively fixes NSCLC's scorer if it had the same dead-signal problem (check).

### 29m. Authorship-position DERIVED + populated. Signal ALIVE. Silverberg 198 senior/135 first.
Format issue resolved: publication_authors_v2.openalex_author_id stores FULL URL (69,633/69,650), not bare id
(my LIMIT 1 check hit one of 17 bare stragglers - misdiagnosed). Fix: normalize BOTH sides (strip
https://openalex.org/ prefix) in the join. Matched 69,633/69,650 (99.98%).
UPDATE run (AD-scoped): is_senior_author=(author_position='last'), is_first_author=(author_position='first')
from publications_v2.authorships JSON.
RESULT - signal alive:
  Silverberg: 198 senior, 135 first (of 495 links) - textbook KOL footprint (leads + supervises). 
  Simpson: 71 senior, 65 first (323). Wollenberg: 36 senior, 32 first (173). All correct/rich.
  Guttman-Yassky: 1 senior, 0 first (of 6 links) - CORPUS-LINKAGE issue: position derivation WORKS, but she
  only has 6 AD links to derive from (should be ~100+). Under-ingested KOL.
=> TWO PROBLEMS CLEANLY SEPARATED AND BOTH VISIBLE:
  (1) authorship-position signal [FIXED - Silverberg 198/135 proves it].
  (2) corpus under-linkage [still caps under-ingested KOLs - Guttman-Yassky 6 links].
The scorer can now RANK on real authorship signal for well-linked KOLs. Under-linked KOLs (Guttman-Yassky)
will rank lower than they should until corpus linkage is completed - THIS is the works_count question the user
wanted to settle: for under-linked KOLs, do we (a) accept they rank low until full Step F re-link, or (b) use
OpenAlex works_count/authorship as a supplementary signal? Now we have concrete data to decide.
CONSIDER: run this derivation GLOBALLY (all TAs, not just AD) - it's a correctness fix; NSCLC's scorer likely
had the same dead signal. And commit as a pipeline step (derive authorship position after Step F linking).
NEXT: wire established scorer to hcp_cohort_classification_v2, run it (dry-run) -> see the ranking with the
now-live authorship signal -> and SEE where Guttman-Yassky lands (quantifies the corpus-linkage cost) -> settle
the works_count question with real numbers.

### 29n. *** AD ESTABLISHED KOL RANKING PRODUCED *** Credible top-15. Scorer wired + authorship signal live.
publication_leadership_scoring wired to hcp_cohort_classification_v2 (cohort='established'); no other
hcp_established_ranks_v2 deps remain (clean migration). Dry-run scored 2,547 established.
TOP 15 (raw leadership score) - a REAL AD KOL leaderboard:
  1 Silverberg 582 (184 senior!) | 2 Wollenberg 484 | 3 Flohr 356 | 4 Drucker 298 | 5 L.Eichenfield 295 |
  6 Werfel 289 | 7 Katoh 284 | 8 Lio 264 | 9 Sidbury 264 | 10 E.Simpson 246 | 11 Vestergaard 244 |
  12 Gooderham 242 | 13 Calzavara-Pinton 226 | 14 de Bruin-Weller 224 | 15 Deleuran 221.
Domain-credible. DEDUP-MERGED KOLs correctly ranked: Werfel #6, Katoh #7, Calzavara-Pinton #13 (consolidated
from fragments yesterday). Authorship signal driving it correctly (Silverberg 184 senior >> field).
=> The full arc pays off: dedup -> re-derive -> TA-anchor establishment -> authorship-position derive -> scorer
= a credible ranked AD KOL list. GENERALIZATION VERDICT fully realized (membership AND ranking).

WORKS_COUNT QUESTION - NOW QUANTIFIED: Guttman-Yassky rank 1,732/2,547 (raw 9.5, pctl 33, 1 senior, 0 first,
6 links). A top-3 world AD KOL buried at #1,732 PURELY due to corpus under-linkage (6 AD pubs in corpus vs
~100s real). The authorship signal works; there's just nothing to score for under-ingested KOLs.
THE DECISION (now with data): under-linked KOLs rank far too low. Options:
  (a) Accept it until full unscoped Step F re-links their pubs (Guttman-Yassky's real papers ARE in OpenAlex,
      just not linked into publication_authors_v2 because AD's Step F was scoped to NEW HCPs to protect frozen
      NSCLC - GATE 3 caveat). Fixing linkage fixes her ranking properly. This is the RIGHT fix but bigger.
  (b) Supplement leadership score with an OpenAlex-level signal (works_count / OpenAlex-derived senior-author
      proxy) so under-linked KOLs aren't buried. Faster but adds a parallel signal source.
LEAN: (a) is correct long-term (complete the corpus linkage - it's a known GATE 3 debt), but (b) or an interim
flag may be needed for a credible demo NOW. Scope: how MANY established KOLs are under-linked? Check the
distribution of linked-pubs among the 2,547 established before deciding - if it's just a handful of intl KOLs
buried, (a) + a manual note may suffice; if widespread, (b) is needed. MEASURE before choosing.
NEXT: (1) measure under-linkage across the 2,547 established (how many KOLs buried by thin linkage?). (2) decide
works_count fix. (3) --execute the scorer. (4) network + pharma component scorers -> composite established rank.

### 29o. Under-linkage is SYSTEMIC, not a tail - 864/2,547 established (34%) are big-career/thin-linkage KOLs.
Measured across the 2,547 established:
  median_linked=8 (the TYPICAL established HCP has only 8 AD-linked pubs - very thin for a KOL tier).
  under_10_linked=1,538 (60% of established have <10 linked AD pubs).
  big_career_thin_linkage=864 (34%!) - OpenAlex works_count>=200 BUT <20 AD-linked pubs (the Guttman-Yassky
  signature - real KOLs capped at single-digit linkage).
  under_5_linked=0 (the ta_pubs>=5 TA-anchor floor works; it's the CEILING that's broken - KOLs capped low).
=> NOT a handful of intl KOLs. The AD publication corpus is BROADLY UNDER-LINKED for the established cohort.
The top-15 ranking is credible (well-linked KOLs like Silverberg 495 links rank right), but ~1/3 of the cohort
is BURIED below true rank by missing publication links. This is systemic corpus debt, not a scoring bug.
DECISION REFRAMED: option (a) "accept until Step F re-link" is now clearly the RIGHT fix but it's LOAD-BEARING,
not optional - 34% of KOLs are affected. The corpus linkage MUST be completed for a trustworthy AD ranking.
ROOT (GATE 3 caveat): AD's Step F (rebuild_publication_authors_v2) was scoped to NEW HCPs only, to protect
frozen NSCLC. So pre-existing cross-TA AD HCPs (many of the big-career KOLs, who also appear in other TAs) got
UNDER-LINKED - their AD pubs exist in publications_v2/authorships but were never linked into
publication_authors_v2 for their (already-existing) hcp_id. The authorships JSON HAS the data (that's how we
just derived positions); the LINKS are missing.
THE REAL FIX: run Step F (publication-author linking) for AD UNSCOPED (or scoped to AD's established/all HCPs
incl. pre-existing), so every AD HCP gets linked to ALL their AD pubs from the authorships JSON. This is the
same derive-from-authorships mechanism we just used for author_position - the data is right there. Guttman-Yassky
would jump from 6 links to ~100+ and rank correctly. This fixes the ranking for all 864 buried KOLs at once.
CAUTION: must stay frozen-NSCLC-safe - link only AD pubs to AD HCPs; don't touch NSCLC links. Scope carefully.
NEXT: this is the load-bearing fix. Scope + build the AD publication-author re-link (frozen-safe), run it,
re-derive linked counts, re-run the scorer. THEN the ranking is trustworthy across the whole cohort.

### 29p. Missing-link gap quantified + DERIVABLE via SQL (not full Step F re-run). 17,315 missing, 7,273 HCPs.
Diagnostic: for AD pubs, JSON-authorship pairs that map to a known AD HCP (via hcp_openalex_authors_v2 bridge):
  should_be_links=87,269 | existing=69,954 | MISSING=17,315 (20%) | hcps_gaining_links=7,273.
=> The missing links are DERIVABLE right now from publications_v2.authorships JSON + the openalex-author->hcp
bridge - same mechanism as the author_position derive. No need to run the full rebuild_publication_authors_v2.py
script. A targeted INSERT of the 17,315 missing (AD pub, AD HCP) links is:
  - inherently FROZEN-SAFE (only AD publications, only their AD-HCP authors - cannot touch NSCLC links).
  - surgical (adds exactly the missing links, idempotent via NOT EXISTS / ON CONFLICT).
7,273 HCPs gaining links = broad (not just the 864 established KOLs) - confirms the "Step F scoped to NEW HCPs,
pre-existing cross-TA HCPs under-linked" root cause. Fixes the whole cohort's linkage, not just the top.
BUILD: INSERT INTO publication_authors_v2 (publication_id, hcp_id, openalex_author_id, is_first_author,
is_senior_author, author_position?, disambiguation_method, linked_at) SELECT from the mapped JSON pairs WHERE
NOT EXISTS a link. Populate is_first/is_senior from author_position in the SAME insert (so new links get the
signal immediately). disambiguation_method = 'openalex_authorship_backfill' (traceable). Must handle
total_authors / author_position(int) columns if NOT NULL constrained - check the table's constraints first.
CAUTION: check for (publication_id, hcp_id) uniqueness constraint -> use ON CONFLICT DO NOTHING or NOT EXISTS.
A survivor HCP mapping to MULTIPLE openalex ids (merged KOL) could produce dup (pub,hcp) rows from different
oa_ids on the same paper -> dedup to one link per (pub,hcp) in the insert.
NEXT: check publication_authors_v2 NOT NULL constraints + unique key, then build the frozen-safe backfill INSERT.

### 29q. *** CORPUS RE-LINK DONE *** Guttman-Yassky 6->297 links (126 senior). NSCLC provably untouched.
Backfill INSERT ran (frozen-safe: source = AD-tagged pubs only; INSERT+ON CONFLICT DO NOTHING = no mutation).
RECEIPT: NSCLC links 481,944 before AND after - IDENTICAL. Frozen-safe PROVEN, not just asserted.
PAYOFF: Guttman-Yassky 6 -> 297 linked AD pubs, 1 -> 126 senior-authorships, 0 -> 39 first-authorships. That's
a real top-3-world AD KOL profile (126 last-author AD papers = she supervises a lab's worth of AD research).
The authorship signal (derived §29m) now has real volume. The two problems (identity §28, linkage §29) both
fully resolved for the benchmark KOL.
~17,315 missing links backfilled across 7,273 AD HCPs from publications_v2.authorships JSON via the
openalex-author->hcp bridge. disambiguation_method='openalex_authorship_backfill' (traceable).
NOTE: this is the interim SQL fix. The DURABLE fix is rebuild_publication_authors_v2.py (Step F) run unscoped/
all-AD-HCPs, committed as the pipeline step - so future TA builds link pre-existing cross-TA HCPs from the
start (don't scope Step F to NEW HCPs only). Add to playbook. But the SQL backfill achieves the same result now.
NEXT: re-derive total_career_pubs on the newly-linked identities (Guttman-Yassky tcp will jump 8->~297 AD... 
though tcp is global linked count - recompute), then RE-RUN the established scorer -> Guttman-Yassky should now
rank in the top tier (was #1732), and the 864 buried KOLs should surface. THAT is the trustworthy full ranking.

### 29r. *** LOOP CLOSED: TRUSTWORTHY AD KOL RANKING *** Guttman-Yassky #1732 -> #3. Full arc paid off.
Re-ran established scorer after corpus re-link. Guttman-Yassky: #1,732 -> #3 (raw 411.6, 126 senior-auth,
9,946 citations = HIGHEST in top 10). Exactly where a top-3-world AD KOL belongs.
FINAL AD ESTABLISHED TOP 10 (Scientific Influence):
  1 Silverberg (184 sr, 8216 cit) | 2 Wollenberg | 3 GUTTMAN-YASSKY (126 sr, 9946 cit) | 4 Flohr | 5 Drucker |
  6 L.Eichenfield | 7 Werfel | 8 Katoh | 9 Lio | 10 Sidbury.
Definitive AD leadership ranking. Every name a real KOL. Dedup-merged KOLs (Werfel #7, Katoh #8) correctly
ranked. Citations sensible. Domain-credible top to bottom.
=== THE COMPLETE ARC (28g -> 29r), all resolved ===
  "why hepatologists in AD established?" -> establishment ranked on GLOBAL pubs, no TA anchor
  -> real KOLs (Guttman-Yassky et al) under-ranked -> identity FRAGMENTATION (Unicode hyphens split them)
  -> built dedup subsystem (name_key, fragment path, evidence-corroboration, false_split>false_merge invariant)
  -> 586 fragments merged (0 false merges, NSCLC untouched)
  -> re-derived career metrics on merged identities
  -> TA-ANCHORED establishment (ta_pubs>=5) -> hepatologists -> community, established = credible 16% KOL tier
  -> derived authorship-position from OpenAlex JSON (dead is_senior/first signal -> alive)
  -> found systemic corpus UNDER-LINKAGE (864/2547 KOLs buried, Step F scoped to new-HCPs-only)
  -> frozen-safe SQL backfill of 17,315 missing links (NSCLC provably untouched: 481,944 before=after)
  -> re-ran scorer -> GUTTMAN-YASSKY #3, trustworthy full-cohort ranking.
=> GENERALIZATION VERDICT FULLY REALIZED: FieldMark's methodology produces a credible, domain-recognizable
established KOL ranking for a 2nd, fundamentally different TA (AD: derm, 82% intl, heavy fragmentation). Both
cohort MEMBERSHIP and within-cohort RANKING are correct. The core thing this entire 2-TA build was proving.
REMAINING (refinement, not blocking): --execute the scorer (persist); network + pharma component scorers ->
composite established rank; durable Step F fix (unscoped) baked into pipeline; run authorship-derive + link-
backfill globally (NSCLC, when unfrozen); build the evidence-scoring identity resolver subsystem (future infra).

### 29s. Script-hygiene note: publication_leadership_scoring.py DEFAULTS TO WRITING (--dry-run is opt-out).
Violates the playbook "dry-run by default, never write on first run" standard (MULTI-TA ADDENDUM pt 9). This
script writes unless --dry-run is passed. Safe here (already dry-run + reviewed), but the default is backwards.
DEBT: flip the default (write only with an explicit --execute/--write flag) when this script is next touched.
Same check needed on network_centrality_scoring / pharma_engagement_scoring before running them - confirm
their write-default before first run. Execute command for leadership scorer = drop --dry-run (no flag = writes).

### 29t. Network centrality scorer assessed - GOOD shape, benefits from re-link, likely no wiring fix needed.
network_centrality_scoring.py: builds co-authorship graph from publication_authors_v2 self-join, TA-scoped
(publications JOIN publication_therapeutic_areas_v2 WHERE ta_id). Computes degree/eigenvector/betweenness
centrality + percentiles -> hcp_network_centrality_v2 (window_type='10yr' default). ON CONFLICT (hcp_id,ta_id,
window_type) DO UPDATE.
ASSESSMENT vs today's concerns:
  - TA-scoped: YES (graph only from AD-tagged pubs). Frozen-safe for NSCLC (AD pubs only, writes AD ta_id only).
  - Old-table dependency: NOT seen in scan - computes over the edge GRAPH, not a pre-fetched established set.
    Likely NO wiring fix needed (unlike leadership scorer). CONFIRM it doesn't filter to hcp_established_ranks_v2
    somewhere.
  - BENEFITS FROM RE-LINK: the 17,315 backfilled links create real co-authorship edges for previously-buried
    KOLs. Guttman-Yassky's 297 links now generate her actual collaboration network (was ~nothing). Network
    scores will be meaningful now in a way impossible before the backfill. Good sequencing - re-link BEFORE
    network scoring.
  - write-default: --dry-run is explicit opt-out (same as leadership; same hygiene debt).
OPEN CHECK: does it score ALL AD co-authors (~15K) or just established (2,547)? Determines what the percentile
means for the composite. Checking fetch_nodes/scope.
NEXT: confirm scope, then dry-run network centrality for AD, inspect top (do the KOLs have high centrality?),
then execute. Then pharma (15%). Then composite recompute_established_ranks_v3.

### 29u. Pharma scorer assessed - clean EXCEPT the debt #14 missing-pharma question (must verify).
pharma_engagement_scoring.py: reads hcp_open_payments_by_ta_v2 (3yr rollup, §21) WHERE ta_id; scores on
log(payments)/companies/drugs/count percentiles -> raw_score -> final percentile -> hcp_pharma_engagement_v2.
ON CONFLICT (hcp_id, ta_id). No established-set dependency (scores all HCPs in the payments table; no
hcp_established_ranks_v2 -> NO wiring fix needed). TA-scoped, frozen-safe. Same --dry-run opt-out.
THE DEBT #14 CRUX (must verify before running): does hcp_open_payments_by_ta_v2 contain ONLY HCPs WITH
payments, or ALL AD HCPs with 0-filled? The COALESCE(...,0) in fetch_payment_data is a yellow flag.
  - If table = only-HCPs-with-payments: scorer percentile-ranks among the pharma-having subset only; missing-
    pharma HCPs get NO pharma row. CORRECT (weight-only-available; missing != penalized-0). ~2/3 of AD HCPs
    (no NPI, intl) legitimately absent - as intended.
  - If table = all-AD-HCPs 0-filled: the ~2/3 no-pharma HCPs pile at percentile 0 -> penalizes intl KOLs on
    the 15% component for a data-availability reason. WRONG. Would bury Wollenberg/Werfel/Deleuran/Katoh etc.
VERIFY: SELECT count(*) in hcp_open_payments_by_ta_v2 for AD + how many have total_payments=0/null. Compare to
established count (2,547) and total AD HCPs (15,847). If the table row count ~= only the matched/paying HCPs
(hundreds), scenario 1 (correct). If ~15,847, scenario 2 (fix needed).
THEN: the COMPOSITE (recompute_established_ranks_v3) must handle missing-pharma correctly too - an established
HCP with no pharma row should have the 15% reweighted onto sci+network (0.50/0.35 -> renormalized), NOT scored
0 on pharma. This is THE debt #14 decision, still open, must settle at composite time.

### 29v. Pharma table = scenario 1 (CORRECT). 275 rows, 0 zero-payment. Scorer ready as-is.
hcp_open_payments_by_ta_v2 for AD: 275 rows, all with real payments (0 zero-filled). Table holds ONLY the
matched/paying HCPs. So the pharma scorer percentile-ranks among the 275 payers; missing-pharma HCPs are
ABSENT from the pharma component, not penalized-0. Debt #14 correct at scorer level. Pharma scorer ready to
run, NO fix needed.
REMAINING debt #14 work is at COMPOSITE only: recompute_established_ranks_v3 combines 0.50*sci+0.35*net+0.15*
pharma. An established HCP with NO pharma row (most of them - only 275 of 2,547 established will have pharma)
must get the 15% REWEIGHTED onto sci+network (renormalize 0.50/0.35 -> 0.588/0.412), NOT pharma=0. Verify this
when we get to the composite - it's the last place a non-US KOL could be wrongly penalized.
NEXT: wait for network centrality to finish, run it (already running), then run pharma (fast - 275 rows), then
recompute_established_ranks_v3 with correct missing-pharma reweighting -> composite AD established rank.

### 29w. Network centrality DONE. 19,926 rows. Credible AD hubs; re-link flows into graph correctly.
network_centrality_scoring executed: graph 19,926 nodes / 197,782 edges (10yr window). Wrote 19,926 rows to
hcp_network_centrality_v2 (window_type='10yr'). Top-20 by network influence = real AD hubs: Girolomoni,
Patruno, Ferrucci, Wollenberg, Silverberg, Thyssen, Simpson, Flohr, Bieber, Deleuran, GUTTMAN-YASSKY(#13, 876
collabs), Werfel, de Bruin-Weller, Weidinger, Paller, Irvine.
SIGNAL 1 - re-link pays off AGAIN: Guttman-Yassky #13 network, 876 collaborators (pre-backfill she had ~6 links
-> ~no edges). Corpus fix flows into the collaboration graph. She's #3 sci + #13 net = genuine hub.
SIGNAL 2 - network skews European/Italian (Girolomoni/Patruno/Peris/Stingeni/Nettis at top). REAL signal not
error: European AD research is highly collaborative (large consortia, shared authorship) -> high degree/
betweenness. Network centrality rewards collaborative-research CULTURE, varies by region. Silverberg #6 net but
#1 sci shows the components measure DIFFERENT things -> why the composite blends 0.50 sci + 0.35 net + 0.15
pharma. Worth noting: the 35% net weight tilts toward collaborative ecosystems; the sci weight (senior-author
leadership) tilts toward individual research leadership. Blend balances them.
NEXT: run pharma scorer (fast, 275 rows), then recompute_established_ranks_v3 (composite) WITH debt#14 missing-
pharma reweighting. Then the final composite AD established KOL rank.

### 29x. PAUSE - user concern: pharma covers only 275/2,547 established (11%). Two distinct problems.
User flagged (correctly): scoring the established cohort on pharma when 89% have no pharma data is a real design
question. TWO problems to separate:
PROBLEM 1 - COVERAGE (is 275 right, or a pipeline gap?):
  (a) genuinely sparse: AD established is mostly international (Open Payments = US-only) + non-clinical -> they
      legitimately have no US pharma. 275 US-paid AD KOLs may be the TRUE number (matches the §Gate6 structural
      ceiling: ~2/3 of publication-derived HCPs have no NPI).
  (b) under-linkage gap: maybe Open Payments aggregation was scoped narrowly (like Step F pubs were) and more
      AD KOLs SHOULD have pharma but weren't matched. We JUST found exactly this with pub links (17,315 missing)
      -> fair to suspect the same. If (b), fix = complete linkage, not reweight.
  MUST DETERMINE WHICH before deciding weighting. Check: how many established HCPs have an NPI (pharma requires
  NPI match)? If ~275 have NPI, coverage is complete (a). If thousands have NPI but no pharma row, it's a gap (b).
PROBLEM 2 - WEIGHTING (even at correct coverage):
  - debt#14 reweight: HCPs w/o pharma need 15% redistributed to sci/net (0.588/0.412), NOT pharma=0. Else US-paid
    KOLs get a boost intl KOLs structurally can't earn -> measures "US commercial reach" not "KOL leadership".
  - deeper Q: is pharma the right signal AT ALL for KOL ranking when 11%-covered + US-biased? Options: keep at
    15% w/ reweight; drop pharma weight for AD (or intl-heavy TAs); make pharma a DISPLAYED attribute not a
    ranking input; or gate pharma weight on coverage.
DECISION DEFERRED - user paused to think. Do NOT run composite until this is settled. The sci(50%)+net(35%)
ranking is already credible and trustworthy on its own; pharma is the questionable 15%.
NEXT when resumed: (1) diagnose coverage - NPI count among established vs pharma-row count -> (a) vs (b).
(2) decide pharma's role in the composite.

### 29y. RESOLVED - pharma sparsity is STRUCTURAL (scenario a), not a gap. AD is 73% international.
Diagnostic: established=2,547. has_npi=169 (7%!). Geography: US 442 (17%), INTL 1,854 (73%), null 251 (10%).
=> AD is a 73%-INTERNATIONAL TA. Open Payments is US-only. So pharma data for ~73% of AD established KOLs
DOES NOT EXIST ANYWHERE - not a linkage gap (unlike pubs, where OpenAlex had the data). The 275 pharma rows are
essentially the CEILING. Cannot be "fixed" by better matching. Scenario (a) confirmed decisively.
IMPLICATION: pharma engagement as a 15% RANKING COMPONENT is fundamentally wrong for AD (and any intl-heavy TA).
It would rank a Verona/Copenhagen/Osaka dermatologist as structurally deficient vs a US one, measuring "US
commercial disclosure presence" not "KOL leadership". This is NOT the debt#14 reweight nuance - it's more basic:
the signal is absent for 3/4 of the cohort by the nature of the data source, not by chance.
DECISION (recommend): for AD, pharma should NOT be a ranking input at the current 15%. Options, best to worst:
  1. BEST: pharma = a DISPLAYED ATTRIBUTE, not a ranking weight. Show "$X Open Payments, N companies" on the US
     KOLs who have it (real, useful for MSL targeting), but rank on sci(0.50)+network(0.35) renormalized to
     0.588/0.412. Pharma informs, doesn't rank. Honest given the data.
  2. Reweight per-HCP (debt#14): keep 15% for the 169-275 who have pharma, redistribute for the rest. But this
     still gives US KOLs a 15% edge intl KOLs can't earn - measures commercial reach, contaminates the ranking.
  3. Coverage-gate the weight: pharma weight scales with cohort coverage. At 11% coverage -> ~0 weight anyway.
NSCLC CONTRAST worth checking: NSCLC is more US-centric (onc trials/pharma US-heavy) - pharma coverage there is
likely much higher, so 15% may be defensible for NSCLC but not AD. => pharma weight should be TA-DEPENDENT
(config-driven scoring_weights per TA), not a global 15%. This is a real playbook/config insight.
The sci+network composite is trustworthy NOW. Pharma as a ranking input is the questionable part - recommend
demoting it to a displayed attribute for AD.

### 29z. ADVISOR VERDICT - SEPARATE THE AXES. Remove commercial from KOL score entirely; profile not single score.
Advisor converged with + sharpened the pharma concern into a core product decision. Key moves:
1. REMOVE Open Payments from the Established KOL score ENTIRELY - not reduce, not dynamically weight, REMOVE.
   Rationale: "Established KOL" = scientific/clinical authority in a TA. That exists independently of nationality.
   Open Payments measures COMMERCIAL ENGAGEMENT - valuable but a DIFFERENT AXIS, not scientific authority.
2. SPLIT INTO TWO AXES (both TA-INDEPENDENT concepts):
   - SCIENTIFIC/CLINICAL AUTHORITY: publications, authorship, citations, guidelines, TRIALS, network.
   - COMMERCIAL ENGAGEMENT: Open Payments, advisory boards, consulting, speaker activity. (separate score.)
   This DISSOLVES the TA-dependent-weighting problem: concepts stay constant across TAs; you don't hack
   per-TA weights BECAUSE you're not jamming a US-biased commercial signal into a scientific ranking. The KOL
   ranking generalizes naturally AD->onc->hep->rare because it only measures (universal) scientific authority.
3. PRODUCT REFRAME: emit a multi-dimensional PROFILE, not one opaque number:
   Scientific Authority 97 | Network Influence 94 | Clinical Trial Leadership 88 | Guideline Leadership 91 |
   Commercial Engagement 14 (shown, not ranked) | Momentum 82. Answers WHY someone ranks where they do.
NEW SIGNALS advisor endorsed (priority order):
  1. CLINICAL TRIAL LEADERSHIP (PI / steering committee / global coordinating investigator) - "biggest missing
     signal, rank it ABOVE Open Payments." Internationally available. We HAVE trial data (ct.gov ingested).
  2. GUIDELINE AUTHORSHIP - increase weight; "cleanest authority signal" (peer recognition). Partially in sci.
  3. MOMENTUM (recent 3-5yr senior-authorship + citation velocity) - "Career Authority vs Recent Momentum" as
     two views. Advisor likes a lot.
  4. EDITORIAL LEADERSHIP - worth doing eventually, not immediately.
  5. SOCIETY LEADERSHIP - great signal, terrible data problem, POSTPONE.
ILLUSTRATIVE reweight (not prescriptive): Sci Output 45 / Network 25 / Trial Leadership 15 / Guideline 10 /
Momentum 5. (Down-weights network from 35 -> 25.)
NETWORK CAUTION (advisor agreed with our Euro-skew observation): consortium science inflates centrality;
someone central via many multicenter studies isn't necessarily the intellectual leader. Network belongs but
should NOT dominate. Consider CAPPING its influence or validating against known experts. (Matches §29w signal 2.)
=> This is a bigger architectural direction than "fix pharma". It's the scoring model maturing into a profile.
DECISION FOR NOW (unblock AD): drop pharma from the AD composite. Rank AD on Scientific + Network (renormalized).
Pharma scorer output (275 rows) becomes a DISPLAYED commercial-engagement attribute, not a rank input. Trial
leadership + guideline elevation + momentum = the next scoring-model build (post-AD-validation).

### 29aa. Trial-leadership data check - ROLE granularity EXISTS but MATCH RATE is the blocker (validates skepticism).
trial_investigators_v2 role distribution (ALL TAs, not AD-scoped): PRINCIPAL_INVESTIGATOR 311,204 (14% hcp-
matched) | SUB_INVESTIGATOR 43,041 (7%) | STUDY_DIRECTOR 36,137 (6%) | STUDY_CHAIR 24,951 (16%).
TWO findings:
1. ROLE GRANULARITY IS REAL: 4 clean distinct roles incl the leadership ones (STUDY_CHAIR, STUDY_DIRECTOR =
   ct.gov overall_official). So ct.gov DID give role data - the advisor's trial-leadership signal is capturable
   in principle. Skepticism about "does the data exist" = partly unfounded (role IS there).
2. BUT TWO REAL PROBLEMS (validate the skepticism about usability):
   a. PRINCIPAL_INVESTIGATOR (311K) is mostly SITE-PI not trial-leader - ct.gov lists a PI per site per trial,
      so a 200-site trial = 200 PI rows. PI volume means PI != leadership. Real leadership = STUDY_CHAIR/
      STUDY_DIRECTOR (rarer: 25K/36K, correct for genuine leadership).
   b. MATCH RATE IS THE BLOCKER: 86-94% of investigators UNMATCHED to an hcp_id. STUDY_DIRECTOR only 6% matched,
      STUDY_CHAIR 16%. So even with clean roles, we can't ATTRIBUTE most trial leadership to our KOL records.
      The investigator->HCP matching is the gap (note: trial_investigator_match_proposals_v2 exists = matching
      was in progress/incomplete). This is the SAME class of problem as the pub under-linkage, but harder
      (investigator names in ct.gov are messy, often just "Last F" + facility, no ORCID/OpenAlex id to bridge).
=> VERDICT: trial leadership is a GOOD signal conceptually + the role data exists, BUT it needs a real
investigator->HCP matching effort before it's usable. NOT plug-and-play. User's skepticism = justified on
USABILITY (not on existence). This is a next-build enrichment project, not a today-fix.
NEXT CHECK (to size it for AD specifically): how many AD ESTABLISHED KOLs match to a STUDY_CHAIR/STUDY_DIRECTOR/
PI role? If even the top AD KOLs (Silverberg/Guttman-Yassky - who chaired major AD trials) are matched, the
signal has value for the ones that matter even at low overall match rate. Check before dismissing.

### 29ab. VERDICT - trial leadership NOT usable now. Skepticism CONFIRMED. Fails on the KOLs that matter.
AD established (2,547) trial-role coverage: PI 302 (12%), STUDY_CHAIR 51 (2%), STUDY_DIRECTOR 41 (1.6%),
SUB_INV 29. Leadership roles (chair/director) cover ~2% of cohort - SPARSER than pharma (11%) which we just
removed. As a ranking signal, thinner than the thing we cut.
BENCHMARK CHECK = DAMNING:
  - Silverberg: matched to ZERO trial roles. A world-leading AD trialist, entirely absent. Matching FAILED to
    connect him to trials he led.
  - Guttman-Yassky: 6 PRINCIPAL_INVESTIGATOR, 0 chair/director. She's global coordinating investigator on
    pivotal dupilumab trials -> should be STUDY_CHAIR. Matched only as site-PI, 6x.
  - Simpson: 10 PI, 0 chair/director. Same pattern.
=> The investigator->HCP matching FAILS ON THE PEOPLE WHO MATTER MOST, and where it matches it catches the
wrong (site-participation) role, not leadership. This is not "the KOLs didn't lead trials" - it's a matching
failure. ct.gov investigator names are messy (often "Silverberg J" + facility, no ORCID/OpenAlex id), so the
name-only matching can't bridge to hcps_v2 reliably - the SAME hard problem as the common-name dedup, but worse
(no OpenAlex id on ct.gov investigators at all).
DECISION: trial leadership is NOT usable as a scoring signal now. Skepticism CONFIRMED on usability. It requires
a dedicated investigator->HCP resolution effort (harder than pub linkage - no bridge id; needs name+affiliation+
trial-topic matching, or the trial_investigator_match_proposals_v2 pipeline completed and validated). Defer to a
real enrichment project. Do NOT add it to the AD composite now.
IMPLICATION FOR THE ADVISOR'S ROADMAP: trial leadership is the #1 recommended new signal, but it's GATED on
solving investigator->HCP matching - a substantial project, not a quick add. The roadmap is right
directionally; the data readiness is not there. Sequence: (1) ship AD on sci+network now, (2) build investigator
matching as its own effort, (3) THEN add trial leadership. Guideline authorship + momentum (advisor's #2/#3) may
be more tractable near-term - momentum especially (recomputes from data we already have: recent senior-auth +
citation velocity). Check those next when building the profile.

### 29ac. ADVISOR round 2 - drop the ct.gov chase; IMPROVE the scientific score instead. Prestige signals are in PubMed.
Advisor agreed ct.gov is not the hill to die on (PI fields inconsistent, global studies omit investigators,
steering committees invisible, sponsors listed not investigators -> poor proxy for peer-recognized leadership).
KEY REFRAME: what trials were a PROXY FOR - "peer-recognized scientific leadership" - is ALREADY IN PUBMED. No
external registry needed. The near-term move is not new dimensions, it's a BETTER scientific score.
ADD to scientific authority (all PubMed-derivable, publication_type-based, internationally uniform):
  - guideline papers / consensus statements  (advisor: "writing the AAD/EADV guideline is arguably stronger
    than being PI on one trial" - lean into this HARD)
  - invited reviews
  - editorials / accompanying commentaries
  - position statements
These are PRESTIGE / peer-recognition signals - the biggest missing signal is prestige, NOT trials. Much easier
to identify than trial leadership (they're a publication_type / MeSH pub-type in the pub metadata we HAVE).
MOMENTUM (advisor's one-sprint pick): Authority x Momentum. 400 career papers but quiet != 80 papers exploding
over 5yr. Both matter to Medical Affairs. Derivable from data we ALREADY HAVE (recent senior-auth count +
citation velocity, last 3-5yr). No new linkage. Highest-value TRACTABLE addition.
NETWORK: advisor reiterates scrutiny - centrality rewards consortium/collaborative-European-groups over
intellectual leadership. Don't remove; reduce slightly over time IF validation shows over-emphasis. (Matches
our §29w Euro-skew observation + §29z.)
THE SETTLED MODEL (two axes, TA-independent):
  SCIENTIFIC AUTHORITY = publications + authorship + citations + GUIDELINE/CONSENSUS/prestige + network.
  COMMERCIAL ENGAGEMENT (separate) = Open Payments + companies + drugs + advisory. (displayed, not ranked.)
NEAR-TERM PLAN (revised, all tractable - no ct.gov, no new matching):
  1. SHIP AD NOW on sci(current) + network, renormalized (drop pharma from rank). This is validated + credible.
  2. ENRICH scientific score with prestige pub-types (guideline/consensus/review/editorial) - check what
     publication_type / pub-type metadata we have in publications_v2 first.
  3. ADD momentum as a second view (recent senior-auth + citation velocity) - re-derive from existing data.
  4. Commercial engagement = separate displayed axis (pharma scorer output).
  5. Trial leadership = DEFERRED (needs investigator->HCP resolution project; not near-term).
NEXT CHECK: what publication-type / classification metadata exists in publications_v2 (is 'guideline' /
'review' / 'editorial' identifiable)? Determines how tractable the prestige-signal enrichment is.

### 29ad. Composite ALREADY flexible + already reweights missing signals. Prestige metadata READY. Two wins.
WIN 1 - recompute_established_ranks_v3 weights are CLI PARAMS (--w-scientific/--w-network/--w-pharma), not
hardcoded. Dropping pharma = --w-scientific 0.588 --w-network 0.412 --w-pharma 0.0. No code change to ship AD.
WIN 2 - the composite ALREADY does per-HCP reweighting (debt #14 already solved in code, despite stale docstring
saying "missing = percentile 0 penalizing"). Actual logic: builds a `components` list, appends a component ONLY
if value is not None (if sci_value is not None: append; if net; if pharma). Missing signal is ABSENT from the
component list, not scored 0 -> remaining weights carry the score. So intl KOLs w/o pharma were NEVER zeroed -
scored on sci+net with pharma reweighted out. (VERIFY the normalization divides by sum-of-present-weights, but
the pattern is correct.) UPDATE the stale docstring.
WIN 3 - PRESTIGE SIGNAL READY: publications_v2 has publication_types (ARRAY) + publication_type (text) +
mesh_terms (ARRAY). PubMed pub-types captured. So guideline/consensus/review/editorial are identifiable NOW -
no metadata backfill. The advisor's top scientific-score improvement (§29ac) is fully tractable. Pub-type values
to flag: 'Practice Guideline','Guideline','Consensus Development Conference','Review','Editorial','Comment'.
SHIP-AD STEP: run recompute_established_ranks_v3 --ta atopic-dermatitis --w-scientific 0.588 --w-network 0.412
--w-pharma 0.0 (--dry-run first). Pharma output stays as a displayed attribute (still populate hcp_pharma_
engagement_v2 for display, just weight 0 in rank).
NEXT BUILD (prestige enrichment, tractable now): add guideline/consensus/review/editorial pub-type counts as a
scientific-authority sub-signal. Then momentum (recent senior-auth + citation velocity from existing data).

### 29ae. PRINCIPLE - scoring nimbleness lives at the DATA-AVAILABILITY layer, not the CONCEPT layer.
User's instinct (validated all session): scoring must be nimble per-TA landscape. REFINED into the right form:
  - CONCEPT layer = STABLE across all TAs. "Scientific Authority" (pubs/authorship/citations/prestige/network)
    and "Commercial Engagement" (Open Payments/advisory) mean the SAME thing in AD, NSCLC, rare disease. Never
    redefine what KOL leadership IS per-TA.
  - DATA-AVAILABILITY layer = NIMBLE per-TA. Which SIGNALS have usable data varies by landscape:
    * AD (73% intl) -> US commercial data structurally thin -> commercial = DISPLAYED axis, not rank input.
    * NSCLC (US-centric) -> commercial data rich -> may legitimately be a rank input THERE.
    * Trial leadership -> gated on investigator->HCP match quality (fails for AD now) -> per-TA readiness.
  NOT the naive version (per-TA weight-tuning: pharma 15% here, 8% there - a maintenance trap, unanswerable
  "why these weights"). The nimbleness is HONEST DATA-COVERAGE ASSESSMENT per TA, not knob-tuning.
=> THE RULE FOR TA #3+: define KOL authority by stable concepts; then assess per-TA which signals have
trustworthy coverage; include a signal in the RANK only where its data supports the whole cohort fairly; show
(don't rank on) signals with structural coverage gaps. This is why the model generalizes: same concepts, data
realities flex underneath.
Three proofs this session: pharma (US-bias -> demote to display), trial leadership (match fails on key KOLs ->
defer), prestige pub-types (intl-uniform -> build). Each = landscape dictating signal trustworthiness without
bending the definition of what's measured.
This belongs in the PLAYBOOK as scoring doctrine.

### 29af. Composite dry-run: WIRING correct (2,547) BUT network-skew visible in global ranking (advisor's caution real).
Consumer migration done: fetch_established_cohort reads hcp_cohort_classification_v2 cohort='established' (2,547),
scope rebuilt from hcps_v2.country (global + region-per-country, matching old 2-row-per-hcp shape). 2,547 ->
4,843 (hcp,scope) rows. No hcp_established_ranks_v2 reads remain. Wiring VERIFIED.
NETWORK-SKEW OBSERVED (w-sci 0.588 / w-net 0.412 / w-pharma 0):
  GLOBAL top: Girolomoni #1, Patruno #2, Wollenberg #3, Silverberg #4, Simpson #5, Flohr, Deleuran,
  GUTTMAN-YASSKY #8, Werfel, de Bruin-Weller...
  US top: Silverberg #1, Simpson #2, GUTTMAN-YASSKY #3, Eichenfield, Lio, Yosipovitch, Boguniewicz...
  => Girolomoni/Patruno (#1/#2 NETWORK, Italian consortium hubs, NOT #1-tier scientific) rank ABOVE
  Silverberg/Guttman-Yassky GLOBALLY. The 41% network weight pulls consortium-heavy European names over
  scientific heavyweights - EXACTLY the advisor's caution (centrality rewards collaborative culture, not
  intellectual leadership). US scope is cleaner (Silverberg #1, Guttman-Yassky #3 - scientific order reasserts
  when not vs the Euro consortium hubs). Guttman-Yassky #8 global vs #3 US = the skew made visible.
CONSIDER: lower network weight (advisor: reduce over time). e.g. 0.65 sci / 0.35 net, or 0.70/0.30. Would pull
the scientific heavyweights back to the top globally. NOT blocking ship, but the global ranking is arguably
network-heavy. DECISION: try a couple weightings in dry-run, pick the one where the global top matches domain
truth (Silverberg/Guttman-Yassky/Simpson should be top-tier globally, not #4/#8).

### 29ag. Scientific score is WELL-BUILT - guidelines already weighted highest. Two issues for advisor.
Weights: W_GUIDELINE_SENIOR=15 (highest!) > W_SENIOR_CITATION_LOG=12 = W_GUIDELINE_FIRST=12 > W_GUIDELINE=8 >
W_FIRST_CITATION_LOG=5 > W_EDITORIAL_SENIOR=3 > W_REVIEW_SENIOR=2 > W_SENIOR_PUB=1 > W_SENIOR_RECENT=0.5 >
W_FIRST_PUB=0.4. Senior-authoring a guideline = 15x a regular senior pub. Advisor's "lean into guidelines"
instinct ALREADY baked in. Consensus/editorial/review all counted. Prestige signals present + dominant.
Guideline DETECTION is sophisticated: publication_types ARRAY ('Practice Guideline','Consensus Statement') +
title regex (guideline|consensus|recommendation|expert panel|position statement|provisional clinical opinion)
MINUS an exclusion regex (adherence|impact of|implementation|barriers|attitudes|real-world|update of...) that
correctly excludes papers ABOUT guidelines vs papers that ARE guidelines. Well thought through.
=> Your question answered: guidelines ARE in, weighted highest, well-detected. Sci score is NOT the weak link.
TWO ISSUES FOR ADVISOR:
ISSUE 1 - RAW SCORE then MIN-MAX NORMALIZE: compute_normalized does (score-min)/(max-min)*100. Silverberg is
almost certainly the MAX (582 raw, far above field). Min-max means ONE outlier (Silverberg) compresses everyone
else into a narrow band near the bottom. The stored 'normalized_score' is outlier-dominated. (percentile_rank
is separate + robust - that's what the composite uses - but worth noting normalized_score is fragile.) Does the
composite use percentile_rank (robust) or normalized_score (outlier-sensitive)? [It uses percentile_rank - ok -
but confirm.]
ISSUE 2 - the NETWORK-SKEW (§29af): even with a strong sci score, network at 0.412 pulls consortium-hub
Girolomoni/Patruno above Silverberg/Guttman-Yassky globally. Sci score being good means the fix is the COMPOSITE
weighting (lower network), not the sci score. What sci/net split does the advisor recommend? And should network
be capped/dampened for consortium inflation?
ADVISOR CONSULT DRAFTED NEXT: (a) sci/network composite split, (b) network consortium-inflation dampening,
(c) sanity-check the guideline-heavy weighting, (d) percentile vs normalized.

### 29ah. ADVISOR - 75/25 sci/net, percentile display (not min-max), VALIDATE don't tune. Applied.
Three decisions:
1. SCI/NETWORK = 75/25. Principled: Scientific = "who CHANGED the field?" (stable, slow-moving authority);
   Network = "who is CONNECTED to the field?" (dynamic, contextual). Related not equal. Consortium coordinators
   must not outrank the scientists who defined the disease. Authority deserves heavier weight (if Silverberg
   stopped collaborating 5yr, authority persists, network changes). DO NOT tune the network algorithm - it
   faithfully measures collaboration structure; only its RELATIVE IMPORTANCE needed recalibration. Revisit net
   internals only after validating across more TAs.
2. NORMALIZATION for DISPLAY = percentile-based or robust rank-preserving (percentile -> sigmoid -> 0-100),
   NEVER min-max. Min-max assumes max is representative; Silverberg is an extreme value -> every future superstar
   rescales everyone. Ranking already uses percentile_rank (correct). This is a DISPLAY fix (normalized_score).
   Advisor prefers showing "99th percentile" over a pseudo-interval 0-100.
3. VALIDATE DON'T TUNE (the key discipline): "Does scoring naturally RECOVER the known KOLs? If yes, STOP
   tweaking." Validation not fitting - else we overfit to AD. Reference list: Silverberg, Simpson,
   Guttman-Yassky, Wollenberg, Weidinger, Flohr, Eichenfield, Bieber.
Advisor's framing: "you've made the leap from building an algorithm to building a scientific INSTRUMENT - judged
by whether experts look at the output and say 'yes, that's the field'."
APPLYING NOW: composite dry-run at --w-scientific 0.75 --w-network 0.25 --w-pharma 0.0. Check global top-20
recovers the reference KOLs. If yes -> execute, STOP tuning. Display normalization = separate follow-up (not
blocking rank; normalized_score display fix later).

### 29ai. *** VALIDATION PASSED at 75/25. Ship it. *** Global top recovers ALL reference KOLs.
Composite dry-run --w-sci 0.75 --w-net 0.25 --w-pharma 0.0. VALIDATION (advisor's reference list) - ALL
recovered in global top 25:
  Silverberg #4, Simpson #5, Guttman-Yassky #8, Wollenberg #3, Weidinger #12, Flohr #6, Eichenfield #15,
  Bieber #25. PLUS Deleuran #7, Werfel #9, de Bruin-Weller #10, Irvine #13, Katoh #16, Lio #22, Ohya #24,
  Hywel Williams #29, Yosipovitch #30. Dense global AD who's-who.
GIROLOMONI/PATRUNO #1/#2 NOW DEFENSIBLE: at 75/25 they lead because their SCI score is ALSO 100 (genuinely
prolific major AD researchers), not just network. The earlier skew (them above Silverberg when NOT sci-tier) is
GONE - now all sci-heavyweights cluster at top together, Girolomoni/Patruno lead on a tiny net edge. A Head of
Med Affairs would not blink at Girolomoni top-5 (legit major AD figure, huge output).
US ranking TEXTBOOK: Silverberg #1, Simpson #2, Guttman-Yassky #3, Eichenfield #4, Lio #5, Yosipovitch #6,
Boguniewicz #7, Abuabara #8, Leung #9. Exactly the US AD KOL list an expert would draw.
=> Advisor's criterion MET: "hand top-20 to a global Head of Med Affairs in AD, they nod." VALIDATION PASSED.
Per advisor "if it recovers the known KOLs, STOP tweaking" -> WE STOP. Execute at 75/25.
Note: Guttman-Yassky sci=100 net=99.6 -> full arc (dedup->relink->rescore) delivered her to the top tier as it
should. The whole 2-day build validated in one ranking.
NEXT: execute (drop --dry-run). Then scoring for AD established = DONE. (Display normalization percentile-fix +
momentum + prestige-already-in = future polish, not blocking.)

### 29aj. ADVISOR - it's a CEILING problem not a weight problem. min-max saturated the sci axis. + a dupe bug.
"Starting to look like a product" - advisor calls it a credible first-gen KOL ranking (names are right;
disagreements now "Girolomoni #1 or #5" = expert-vs-expert debates, no longer "why is a random derm above
Guttman-Yassky"). US top-5 (Silverberg/Simpson/Guttman-Yassky/Eichenfield/Lio) "excellent, an MSL wouldn't
blink." Removing pharma didn't collapse it = validation the sci model does the work.
KEY DIAGNOSIS - SCIENTIFIC AXIS IS SATURATED (ceiling problem):
  Top ~25 nearly all show Sci=100.0. NOT because equally influential - because MIN-MAX normalization
  ((raw-min)/(max-min)) collapses them against the ceiling. Silverberg raw 582 is so far above field that
  Guttman-Yassky (411) / Simpson also display 100. The real differences VANISH.
  => When Sci is flat 100 across the top, composite 0.75*100+0.25*net REDUCES TO ranking-by-network among them.
  That's why 59/41 -> 75/25 barely moved ordering (can't shift weight onto a CONSTANT). Girolomoni/Patruno
  #1/#2 = highest network, because network is the only axis still varying at the top.
THE FIX (advisor, and it's the SAME normalization point from §29ah): fix sci calibration -> weighting fixes
itself. If sci had real spread (Silverberg 100, Guttman-Yassky 97, Simpson 95, Flohr 93, Weidinger 92...), then
75/25 would NATURALLY pull the sci heavyweights up + Girolomoni settles to true sci standing. No hand-tuning.
  Replace: raw -> min-max -> 100  WITH  raw -> log -> percentile -> 0-100 (or robust transform preserving
  separation among the TOP investigators instead of flattening them). This is a SCIENTIFIC-SCORE calibration
  fix (publication_leadership_scoring normalized/percentile), separate from the composite.
  NOTE: composite ranks on percentile_rank which IS robust - so this affects the sci PERCENTILE feeding the
  composite. Need sci percentile to have spread at the top, not tie everyone at ~100. CHECK: are the top-25
  sci percentile_ranks all 100, or do they vary? If they're distinct percentiles the composite should already
  separate them - so the saturation may be in how network percentile (re-derived in-scope) vs sci percentile
  interact. Investigate the actual percentile values feeding the composite for the top 25.
BUG - DUPLICATE: Eric Simpson at US #2 AND US #11. Identity fragmentation - two Eric Simpson records not merged
(name variant / missed dedup). INVESTIGATE. (We saw multiple Eric Simpsons in §29 classification too - Eric
Simpson ta_pubs=219 AND ta_pubs=78 both established. The 78 one is a fragment.)
DECISION: do NOT ship yet. Fix (1) sci calibration/normalization for top-tier spread, (2) the Eric Simpson dupe.
Advisor: "spend the next engineering day on score CALIBRATION, not weights or signals."

### 29ak. CEILING BUG CONFIRMED + ROOT CAUSE FOUND: integer-floored percentile ties the top ~1% at 100.
Data proof: raw_score spans 582 (Silverberg) -> 195 (Weidinger) among top names - HUGE real spread (Silverberg
3x Weidinger). But ALL get sci_pctile=100. Scientific discrimination DESTROYED at the top.
ROOT CAUSE: compute_percentile_ranks uses `percentile = 100 - int(position * 100 / n)`. With n=2,547, the top
~25 positions all give int(position*100/2547)=0 -> percentile=100. Entire top ~1% TIED at 100.
=> composite (which uses percentile_rank, NOT normalized_score) sees flat sci=100 at top -> 0.75*100+0.25*net
reduces to rank-by-network -> Girolomoni/Patruno (top network) #1/#2 despite HALF Silverberg's raw sci (249/199
vs 582). This is THE mechanism the advisor diagnosed.
NOTE: normalized_score column DOES preserve spread (Silverberg 100, Wollenberg 83, Flohr 61, Girolomoni 43) -
but the composite doesn't use it; it uses the integer-floored percentile_rank. Irony: the robust-looking
percentile is LESS discriminating than min-max here, purely due to integer flooring.
THE FIX: make the sci percentile CONTINUOUS (fractional), not int-floored. Options:
  (a) fractional percentile: percentile = 100.0 * (1 - position/(n-1)) [continuous, like the OTHER scorers use -
      network + pharma scorers already use this continuous form! only publication_leadership uses the int-floored
      NTILE-style]. Silverberg 100.0, Wollenberg 99.96, Flohr 99.92... real spread.
  (b) OR feed the composite the normalized_score (already has spread) instead of percentile_rank. But (a) is
      cleaner + consistent with the other two scorers.
  => Silverberg's true sci lead then dominates at 75/25 -> he rises to #1 naturally, Girolomoni settles to real
  standing. NO weight-tuning (validates advisor "fix calibration, weighting fixes itself").
INCONSISTENCY FOUND: network_centrality + pharma scorers use continuous `100*(1-pos/(n-1))`; publication_
leadership uses int-floored `100-int(pos*100/n)`. The sci scorer is the ODD ONE OUT. Fix = make it match.
ALSO: Eric Simpson dupe (raw 246 sci_pctile 100 AND raw 129 sci_pctile 98 AND raw 21 AND raw 0) - FOUR Eric
Simpson records! Multiple fragments. The 246 is the real one; 129/21/0 are fragments/different-people. Plus a
Silverberg at raw 109 (Michael J.? Mark S.? a different Silverberg - correctly separate). Investigate Simpson.
NEXT: (1) fix publication_leadership_scoring percentile to continuous (match other scorers). (2) investigate
Eric Simpson fragments. (3) re-run sci scorer -> re-run composite -> re-validate. Expect Silverberg #1 globally.

### 29al. Calibration fix PARTIALLY worked - Patruno #2->#13 (proof it flows), but Girolomoni still #1, Silverberg #3.
Re-ran sci scorer (continuous percentiles persisted: Silverberg 100.00, Wollenberg 99.96, Guttman-Yassky 99.92,
Flohr 99.88...) then composite. RESULT: Patruno #2 -> #13 (raw 199 -> sci pctile 99.0 -> dropped). Proves the fix
flows. Deleuran, Bieber, Barbarot, Weidinger, Irvine also shifted down appropriately. Global top improved:
Girolomoni #1, Wollenberg #2, Silverberg #3, Simpson #4, Flohr #5, Guttman-Yassky #6, Werfel #7, Eichenfield #8.
BUT NOT FULLY RESOLVED: Girolomoni STILL #1, Silverberg only #3. Expected Silverberg #1.
DISPLAY ARTIFACT NOTE: the Sci column shows integer-rounded (100.0/99.0/98.0) - top ~12 all display "100.0" but
actual stored percentiles differ (Silverberg 100.00 vs Girolomoni ~99.4). Composite uses real values. But if
Silverberg sci=100.00 and Girolomoni sci~99.4, at 0.75 weight that's ~0.45 composite pts to Silverberg, vs
Girolomoni's net edge (100.0 vs 99.8) at 0.25 = ~0.05 pts. Silverberg SHOULD win. He's #3. Something still off.
HYPOTHESIS: the network percentile is RE-DERIVED WITHIN SCOPE (compute_percentiles_in_scope on the established
subset), so network percentiles are recomputed among the 2,547, and may still be integer-floored OR Girolomoni/
Patruno top the in-scope network so hard (net=100.0) that it offsets. OR the sci percentile going into the
composite isn't the continuous one (composite may re-fetch and re-rank, or round). NEED TO CHECK the actual
values the composite computes per-HCP for Girolomoni vs Silverberg: exact sci_pctile, exact net_pctile (in
scope), and the arithmetic. Investigate before more weight changes.

### 29am. REAL ROOT CAUSE - percentile_rank COLUMN IS INTEGER. Continuous values computed then ROUNDED on insert.
The sci scorer console showed continuous (Silverberg 100.00, Wollenberg 99.96, Guttman-Yassky 99.92...) BUT the
STORED percentile_rank shows integer: Silverberg 100, Wollenberg 100, Girolomoni 100, Simpson 100 (all tied),
Patruno 99. => hcp_publication_leadership_v2.percentile_rank column is typed INTEGER. The continuous percentile
is computed, printed to console, then ROUNDED TO INTEGER at the DB insert. The spread is thrown away at the
database boundary.
This is why the composite still ties the top at 100 -> ranks by network -> Girolomoni #1. Patruno improved
(#2->#13) only because his value rounded to 99 (crossed an integer boundary); everyone rounding to 100 stays tied.
Same latent issue on network_influence_pctile / pharma pctile columns if they're also integer - CHECK.
THE FIX: change hcp_publication_leadership_v2.percentile_rank to NUMERIC/DOUBLE PRECISION (and check
hcp_established_ranks_v3.scientific_influence_pctile/network_influence_pctile columns too - they must hold
fractional to preserve the spread through the composite). Then re-run sci scorer (stores continuous) -> re-run
composite. ALTER TABLE ... ALTER COLUMN percentile_rank TYPE double precision.
ALSO note the composite's OWN percentile output columns (scientific_influence_pctile etc. in hcp_established_
ranks_v3) must be fractional or the same rounding kills spread at the composite's output layer too.
=> This is the actual ceiling. Not min-max, not weights, not the percentile FORMULA (that got fixed) - the
COLUMN TYPE rounds it away. Classic "fixed the code, the schema undid it."

### 29an. Root cause pinned: ONLY hcp_publication_leadership_v2.percentile_rank is integer. One ALTER fixes it.
Column type audit: hcp_established_ranks_v3 (all pctile cols numeric), pharma pctile numeric, network_influence_
score numeric - ALL fine. ONLY hcp_publication_leadership_v2.percentile_rank = integer. The 3 integer network
cols (degree/eigenvector/betweenness_percentile) don't matter - composite uses network_influence_score (numeric)
+ re-derives in-scope net pctile as float itself.
FIX (one statement): ALTER TABLE hcp_publication_leadership_v2 ALTER COLUMN percentile_rank TYPE double precision;
Then re-run sci scorer (stores continuous into now-float col) -> verify Girolomoni sci distinctly < Silverberg
(raw 249 vs 582 -> ~99.4 vs 100.0) -> re-run composite -> Silverberg should take #1 globally, no weight change.
Also: bake the column type into the table DDL (double precision) so a rebuild doesn't reintroduce integer. And
fix compute_percentile_ranks return-type note if it casts int anywhere.

### 29ao. *** CALIBRATION CLOSED - SILVERBERG #1 GLOBALLY. The ranking is domain-perfect. *** 
After ALTER percentile_rank->double precision + re-run sci + re-run composite (75/25, NO weight change):
GLOBAL TOP: 1 Silverberg, 2 Wollenberg, 3 Flohr, 4 Guttman-Yassky, 5 Girolomoni, 6 Werfel, 7 Eichenfield,
8 Simpson, 9 Katoh, 10 Drucker, 11 Deleuran, 12 de Bruin-Weller, 13 Calzavara-Pinton, 14 Patruno,
15 Vestergaard, 16 Lio, 17 Gooderham, 18 Irvine, 19 Barbarot, 20 Weidinger.
Domain-perfect global AD KOL ranking. Scientific heavyweights lead. Girolomoni settled #5 (top-tier, no longer
above the defining scientists). Every top-20 name a recognizable global AD leader.
US TOP: 1 Silverberg, 2 Guttman-Yassky, 3 Eichenfield, 4 Simpson, 5 Lio, 6 Boguniewicz, 7 Yosipovitch,
8 Abuabara, 9 (Simpson dup), 10 Leung. Textbook.
=> Advisor's criterion MET: "hand top-20 to a global Head of Med Affairs, they nod." And it was PURE CALIBRATION
- no weight tuning (75/25 unchanged). The fix chain: percentile FORMULA (int-floor->continuous) + COLUMN TYPE
(integer->double precision). Both needed; the schema rounding was the hidden one.
VALIDATION PASSED. Per advisor "if it recovers the known KOLs, STOP." WE STOP TUNING.
REMAINING before final execute: the Eric Simpson DUPLICATE (US #4 real + US #9 fragment; also global #8). One
fragment record (raw 129, the OHSU 78-ta_pub one) not merged into the real Eric L. Simpson (raw 246). Investigate
+ merge, then execute. Minor - one dupe in an otherwise clean ranking.
NEXT: (1) fix Eric Simpson dupe. (2) EXECUTE composite (drop --dry-run) -> hcp_established_ranks_v3 persisted.
(3) bake percentile_rank double-precision into DDL. (4) scoring DONE for AD established.

### 29ap. Eric Simpson dupe = SAME PERSON (OHSU), 2 OpenAlex IDs. Dedup correctly SKIPPED (common surname). Manual merge.
Both records: Eric Simpson, Oregon Health & Science Univ, first_pub 2004/2005, AD KOL. Two OpenAlex author
entities: A5015905197 (219 pubs, survivor) + A5102805192 (78 pubs, fragment). OpenAlex split him; our dedup did
NOT merge because "Simpson" surname freq >10 -> EXCLUDED by the rarity gate (committed policy §28z: don't
auto-merge common surnames w/o strong corroboration). So NOT a bug - the ACCEPTED COST of false-split>false-merge.
This is exactly the "human review of ambiguous common-name case" the doctrine anticipated. Eyeballed = same
person -> targeted MANUAL merge is safe (survivor = A5015905197 record, id 6b551092, raw 246/219 links).
MERGE: use dedup_merge single-cluster OR direct SQL re-point. Survivor 6b551092-0cec-42ee-86db-6a85a81e278b;
merge-away a2678477-82bb-49ff-b2a8-635484c74605. Re-point all 39 FKs (or run through dedup_merge which now
handles all FKs). Then re-derive Eric Simpson's metrics (links 219+78 dedup'd), re-run sci scorer + composite.
NOTE this is a one-off; the general pattern (OpenAlex splitting a common-surname KOL into 2 author IDs) is what
the future evidence-scoring resolver's REVIEW QUEUE is for - flag same-name+same-institution+both-OpenAlex for
human confirm. For now, manual.

### 29aq. *** AD ESTABLISHED SCORING COMPLETE. *** Eric Simpson merged, final ranking validated, executing.
Eric Simpson merged (219+78 -> 297 links), re-scored: now global #5 / US #3 (up - consolidation strengthened
him), duplicate GONE. Cohort 2,547 -> 2,546.
FINAL AD ESTABLISHED KOL RANKING (75/25 sci/net, pharma displayed-not-ranked):
GLOBAL top-20: Silverberg, Wollenberg, Flohr, Guttman-Yassky, E.Simpson, Girolomoni, Werfel, Eichenfield,
Katoh, Deleuran, Drucker, de Bruin-Weller, Calzavara-Pinton, Patruno, Vestergaard, Gooderham, Lio, Irvine,
Barbarot, Weidinger.
US top-10: Silverberg, Guttman-Yassky, E.Simpson, Eichenfield, Lio, Boguniewicz, Yosipovitch, Abuabara, Leung,
Ong.
Domain-perfect. Silverberg #1 (582 raw, 184 senior-auth). Executed composite -> hcp_established_ranks_v3.
=== SCORING DONE FOR AD ESTABLISHED. The full two-day arc complete. ===
The complete chain, start to finish: "why hepatologists in AD established" -> global-count establishment ->
identity fragmentation -> dedup subsystem (586 merges) -> re-derive metrics -> TA-anchored establishment
(hepatologists -> community, 16% credible KOL tier) -> authorship-position derive -> corpus re-link (17,315
links, Guttman-Yassky 6->297) -> scientific scorer -> network scorer -> pharma assessed+DEMOTED to displayed
axis (73% intl -> US commercial data structurally absent) -> trial leadership ASSESSED+DEFERRED (ct.gov match
fails on key KOLs) -> composite 75/25 (advisor: authority stable, network contextual) -> ceiling bug
(int-floored percentile + integer column) FIXED -> Eric Simpson manual merge -> FINAL VALIDATED RANKING.
Advisor: "credible first-generation KOL ranking... you've made the leap from building an algorithm to building
a scientific instrument." Validated against domain truth - the names are right.
REMAINING (future, non-blocking): display normalization (percentile not min-max for shown scores); momentum as
2nd view; the prestige signals ALREADY in sci score; Rising Star + Community cohort scoring; durable fixes
(unscoped Step F in pipeline, evidence-scoring identity resolver subsystem w/ review queue for common-name
splits like Eric Simpson); bake percentile_rank double-precision into DDL. Scoring-model doctrine (2 axes,
data-availability nimbleness, validate-don't-tune) -> playbook.

### 29ar. PERSISTED. hcp_established_ranks_v3: 2,546 global + 2,295 region = 4,841 rows. AD ESTABLISHED DONE.
Composite executed. One clean row per HCP per scope. AD established KOL ranking is LIVE in hcp_established_ranks_v3.
=== END OF SESSION (July 8, evening). AD established cohort: identity-resolved, TA-anchored, scored, ranked,
validated against domain truth. Silverberg #1. The 2-TA generalization verdict fully realized end-to-end. ===

## SESSION July 8 (afternoon) — FINALIZE ESTABLISHED (durability) then Rising Stars

### 30. FINALIZE-ESTABLISHED CHECKLIST (durable fixes - close the hidden regression risks).
The AD established RANKING is done + correct (persisted, validated). These make it DURABLE (won't regress on
rebuild; TA #3 won't re-hit the archaeology):
A. SCHEMA DDL (silent regression - rebuild reintroduces the bug):
  [x] A1. hcp_publication_leadership_v2.percentile_rank: bake `double precision` into CREATE TABLE DDL (live
      table was ALTERed; DDL still says integer -> rebuild = ceiling bug returns). Find the DDL file, fix it.
  [x] A2. hcp_cohort_classification_v2: add GRANT SELECT,INSERT,UPDATE,DELETE TO service_role,anon,authenticated
      + NOTIFY pgrst 'reload schema' to the CREATE TABLE DDL (rebuild loses perms - the mid-session error).
B. PIPELINE COMPLETENESS (TA #3 re-hits archaeology):
  [x] B1. Step F unscoped: rebuild_publication_authors_v2.py was scoped to NEW HCPs -> 17,315 missing links
      (under-linkage). Either fix the script to link ALL TA HCPs (incl pre-existing cross-TA), OR commit the
      §29p backfill SQL as a named pipeline step. Pick one, make it canonical.
  [x] B2. Authorship-position derivation (is_senior/is_first from OpenAlex authorships JSON, §29m) must be a
      COMMITTED pipeline step after Step F. Was manual SQL this session. Without it the sci scorer signal is dead.
C. SCRIPT FIXES (confirm saved/durable):
  [x] C1. publication_leadership_scoring.py percentile formula: continuous 100*(1-pos/(n-1)), not int-floored.
      Confirm the edit is saved in the file (not just run in memory).
  [ ] C2. Confirm all 3 component scorers read established from hcp_cohort_classification_v2 (leadership: done;
      network/pharma: don't filter to established so N/A; composite: done §29ad). Verify no lingering
      hcp_established_ranks_v2 reads anywhere in the scoring dir.
D. HOUSEKEEPING:
  [ ] D1. TA config scoring_weights: store 0.75/0.25/0.0 (or the two-axis intent) in the AD config row so the
      composite weights aren't only CLI-passed. (Or document that weights are intentionally CLI/doctrine-driven.)
  [ ] D2. The eric_simpson_merge.csv one-off: note it in dedup as the pattern for the future review-queue.
Work top-down A->D. A1/A2 are the highest-risk (silent rebuild regression). Then Rising Stars.

### 30a. A (schema DDL) DONE. A1: canonical DDL phase1_addendum_12_publication_leadership_v2.sql (double precision
percentile + grants + real indexes, matches live schema). A2: grants appended to phase1_addendum_11_cohort_
classification_v2.sql. C1 confirmed (scorer's compute_percentile_ranks returns list[float], continuous formula
saved). Schema regression risks closed.
NOW B1 (Step F scoping - the data-completeness item). rebuild_publication_authors_v2.py was scoped to NEW HCPs
-> 17,315 missing links for pre-existing cross-TA AD HCPs (§29o-29q). Decide: fix the script to link ALL TA HCPs,
OR canonize the §29p backfill SQL as a committed pipeline step. Inspect the script's scoping first.

### 30b. B1 RESOLVED - Step F fix is a USAGE fix, not a code change. Use --hcp-ids-file with ALL TA HCPs.
rebuild_publication_authors_v2.py is well-built: takes scoped_hcp_ids, PROVABLY can't write a link for any hcp
outside the set (guard: if winner.hcp_id not in scoped_hcp_ids: skip). 3 scope modes: --only-new-hcps (linked_at
>= today), --hcp-ids-file (explicit list), --since DATE.
ROOT of under-linkage: AD build ran --only-new-hcps -> only NEW HCPs linked; pre-existing cross-TA HCPs
(Guttman-Yassky etc.) not in scope -> never got AD links. Exactly §29o.
THE FIX (no code change): run with --hcp-ids-file = ALL AD-tagged HCP ids (from hcp_therapeutic_areas_v2 WHERE
ta_id=AD). Frozen-NSCLC-safe BY CONSTRUCTION (write guard only writes scoped HCPs; only links them to pubs their
own OA IDs appear on -> can't touch NSCLC links). Uses the script's proven disambiguation (better than the raw
§29p backfill INSERT).
=> This is the CANONICAL Step F for a TA: scope to ALL TA HCPs, not just new ones. The §29p SQL backfill was the
interim; THIS is the durable method. For AD it's already effectively done (we backfilled via §29p SQL), but
document --hcp-ids-file=all-TA-HCPs as the canonical Step F invocation in the playbook so TA #3 does it right.
PLAYBOOK UPDATE NEEDED: Step F canonical invocation = export all TA hcp_ids to a file, run --hcp-ids-file. NOT
--only-new-hcps (that under-links pre-existing cross-TA HCPs). B2 (authorship-position derive) becomes a step
right after this.
OPTIONAL for AD now: could re-run Step F properly with --hcp-ids-file to confirm it matches our §29p backfill
(validation), but not required - AD is already linked. Focus: document the canonical invocation.

### 30c. FINALIZE-ESTABLISHED COMPLETE. A+B+C done, D resolved.
C2: only hcp_established_ranks_v2 refs in scripts/score are DOCSTRING comments in recompute_established_ranks_v3
(lines 15, 61 - describe the old materialization pattern), NOT live reads. Composite migration clean (§29ad).
D1: INTENTIONALLY NOT config-stored. Weights (0.75/0.25/0.0) are DOCTRINE, not per-TA tunable - storing in
config invites the knob-fiddling the advisor warned against (validate-don't-tune, §29ah). Weights stay an
explicit CLI/doctrine choice. Documented in playbook scoring doctrine.
D2: Eric Simpson review-queue pattern captured §29ap. Done.
=> AD ESTABLISHED IS NOW FULLY FINALIZED (ranking correct AND durable): schema DDL won't regress on rebuild
(double precision percentile + grants baked in); pipeline is documented so TA #3 links all-TA-HCPs + derives
authorship position; no stale old-table reads; weights are doctrine. 
Playbook + DDL files updated + published. Moving to RISING STARS.

### 30d. RISING STARS - pipeline exists + ran for NSCLC/Hep, but writes to _v1 tables. Version question is load-bearing.
Discovery: rising-star pipeline (rising_star_scoring + scientific_momentum + network_momentum) HAS run before -
hcp_rising_star_ranks_v2 has 234,758 rows: Hep 158,034, NSCLC 76,721, + 3 other. AD: 0 rows (never processed).
BUT the momentum scorers INSERT INTO hcp_scientific_momentum_V1 / hcp_network_momentum_V1 (v1-named tables,
which exist: 24 + 22 cols). The final ranks table is _v2 but momentum intermediates are _v1.
CONCERN: is this a V1-ERA pipeline run on NSCLC/Hep BEFORE the v2 rebuild, never migrated? AD is v2-native
(dedup, TA-anchor, hcp_cohort_classification_v2). Running a v1 scorer against AD could (a) read old pre-dedup v1
HCP tables -> wrong identities, (b) write inconsistent with v2, (c) the 76K NSCLC / 158K Hep rows may be STALE
v1 data pre-identity-resolution. NSCLC is FROZEN - must not touch its rising data either.
DECIDING CHECK: what do the momentum scorers READ FROM? If hcps_v2/publication_authors_v2/hcp_cohort_
classification_v2 -> v2-compatible (just legacy _v1 table naming), runnable for AD after scoping check. If v1
tables (hcps/publication_authors/old cohort) -> needs full v2 retrofit (the 9-point MULTI-TA STANDARD) before
touching AD. This determines: wiring job vs real build.
=> Rising Stars is NOT a quick win. Either way it needs verification the scorers are v2-safe + AD-scoped +
frozen-NSCLC-safe before running. Treat as a proper build, dry-run everything, verify against v2 sources.

### 30e. Rising momentum scorers are V2-COMPATIBLE (good). _v1 is just legacy output-table naming.
scientific_momentum_scoring reads FROM publication_authors_v2 + publications_v2 + publication_therapeutic_areas_v2
+ hcps_v2 (all v2 sources). The _v1 is only the OUTPUT table name (hcp_scientific_momentum_v1) + a join to
hcp_industry_classification_v1 (industry-flag table). Logic is v2. NOT a v1-era script -> NO full retrofit needed.
=> Rising Stars = WIRE-AND-VALIDATE, not ground-up rebuild. Runnable for AD after: (1) confirm --ta scoping +
frozen-NSCLC-safety + write-default, (2) confirm hcp_industry_classification_v1 populated for AD HCPs, (3)
dry-run momentum scorers -> validate output = plausible emerging AD KOLs (small-N noise check), (4) check the
momentum/ranks percentile columns aren't integer (the ceiling bug), (5) run scientific + network momentum ->
rising_star_scoring composite -> hcp_rising_star_ranks_v2.
STILL A PROPER BUILD (multi-step, needs validation at each stage) but not a rewrite. The design risk remains:
momentum on small pub counts (rising stars have few pubs by definition) can be noisy - the validation gate is
"do the top rising names look like real emerging AD investigators, or small-N noise?"

### 30f. Rising Star model is a 2x2 (Momentum x Visibility), not just momentum. Frontend confirms - well-designed.
Frontend shows the rising-star profile is a 2x2 matrix, NOT single-axis momentum:
                  SCIENTIFIC    NETWORK
  MOMENTUM        91            94       -> "Momentum" (trajectory) composite
  VISIBILITY      92            81       -> "Visibility" (current footprint) composite
Composite: RISING STAR SCORE 99/100, tag "BALANCED". Copy: "Momentum (92) blends scientific and network
TRAJECTORY. Visibility (86) reflects CURRENT publication and collaboration footprint." Rank 1 US / Rank 18 Global.
KEY INSIGHT - this DESIGN SOLVES the small-N noise problem I worried about: pure momentum (slope on tiny pub
counts) rewards noise (1->3 pubs = high momentum, but noise). VISIBILITY counterbalances: a real rising star
needs BOTH accelerating trajectory AND substantive current footprint. The noise case (few lucky pubs) has high
momentum but LOW visibility -> blend suppresses it. Whoever built this anticipated the failure mode. Good.
The "BALANCED" tag = classifies the SHAPE (momentum-heavy vs visibility-heavy vs balanced rising star).
FOUR COMPONENTS to produce:
  - Scientific Momentum  <- scientific_momentum_scoring.py (trajectory of sci output)
  - Network Momentum     <- network_momentum_scoring.py (trajectory of collaboration)
  - Scientific Visibility <- likely the established sci score reused/rescaled for rising cohort
  - Network Visibility   <- likely network centrality reused/rescaled
Then rising_star_scoring.py blends Momentum(sci+net) x Visibility(sci+net) -> hcp_rising_star_ranks_v2 + the
shape tag. NEED TO CONFIRM where Visibility comes from (reuse established scorers vs own computation).
BUILD PLAN: (1) map all 4 components to their source scripts/tables. (2) verify each is v2/AD-scoped/frozen-safe/
non-integer-percentile. (3) dry-run the momentum scorers, validate output = plausible emerging AD KOLs. (4) run
chain -> rising composite. (5) validate final ranking (are these real emerging AD stars?).

### 30g. Rising build MAPPED - Visibility REUSES established scores (already built for AD). Only momentum to run.
rising_star_scoring.py 2x2 sources:
  Scientific Momentum  <- hcp_scientific_momentum_v1  (NEEDS RUN)
  Network Momentum     <- hcp_network_momentum_v1     (NEEDS RUN)
  Scientific Visibility <- hcp_publication_leadership_v2  (ALREADY BUILT for AD this morning ✓)
  Network Visibility   <- hcp_network_centrality_v2      (ALREADY BUILT for AD this morning ✓)
  Cohort <- hcp_cohort_classification_v2 WHERE cohort='rising_eligible' (5,925, correct new table ✓)
=> HALF the 2x2 already exists (visibility = the established sci+network scores we built + validated). Rising =
run 2 momentum scorers + the composite. SMALLER than established.
BUILD (3 runs): 
  1. scientific_momentum_scoring.py --ta atopic-dermatitis  -> hcp_scientific_momentum_v1
  2. network_momentum_scoring.py --ta atopic-dermatitis     -> hcp_network_momentum_v1
  3. rising_star_scoring.py --ta atopic-dermatitis          -> hcp_rising_star_ranks_v2 (+ shape tag)
CHECKS BEFORE EACH RUN (lessons applied):
  - --dry-run first (verify write-default; momentum scorers may default-write like the others).
  - percentile column type on momentum tables + hcp_rising_star_ranks_v2: must be double precision NOT integer
    (the §29am ceiling bug - CHECK before trusting any ranking).
  - frozen-NSCLC-safe: momentum scorers read publication_therapeutic_areas_v2 WHERE ta - confirm AD-scoped write.
  - hcp_industry_classification_v1 populated for AD (the scorer joins it - if empty, all AD HCPs may drop).
  - validate momentum output = plausible EMERGING AD KOLs (small-N: visibility axis should suppress noise).
VALIDATION GATE (like established): do the top rising stars look like real emerging AD investigators? Need a
reference expectation - younger/newer AD names on the way up (harder to eyeball than established KOLs - may need
advisor input on who the emerging AD stars ARE).

### 30h. Rising pre-flight PASS. All percentiles numeric (no ceiling bug). Industry-class covers 4,187 AD HCPs.
Percentile columns on all 3 rising tables = numeric (NOT integer) - no ceiling bug, no ALTER needed. The
leadership table was the lone integer offender.
Industry classification: 4,187 AD HCPs classified. Populated -> the momentum scorer's INNER join won't drop
everyone. CAVEAT: 4,187 < 5,925 rising_eligible, so the join WILL drop ~1,700 unclassified rising HCPs. Watch
the dry-run count - if momentum scores ~4,187 not 5,925, confirm the ~1,700 drop is intended (unclassified =
excluded) vs a coverage gap needing industry-classification re-run for AD.
MOMENTUM MODEL (from column names) - sophisticated + well-designed:
  Scientific momentum: pub_velocity + citation_velocity + authorship_progression (middle->senior author
  transition over time = BECOMING a leader; clever direct signal of emerging independence).
  Network momentum: early_* vs recent_* deltas (degree/eigenvector/betweenness) = collaboration network
  EXPANDING.
  Rising composite also has: citation_trajectory, pub_velocity, TRIAL_INVESTIGATOR_score. NOTE trials DO feed
  rising (unlike established where deferred) - but per §29ab ct.gov match is thin; it's one component among many,
  watch it doesn't distort. 
NEXT: dry-run scientific_momentum_scoring --ta atopic-dermatitis. Check: (a) count scored (~4,187 vs 5,925?),
(b) write-default, (c) top names = plausible EMERGING AD investigators (younger/rising, not established KOLs -
Silverberg should NOT top rising; he's established). Validation is trickier than established - emerging names are
less famous. May lean on the authorship_progression + velocity making sense.

### 30i. RISING MOMENTUM DRY-RUN = 14 eligible HCPs (of 5,925). COLLAPSE - eligibility bug. Dry-run saved us.
scientific_momentum_scoring --dry-run: "Loaded 4,173 author-publication rows" (already low), "Eligible HCPs: 14".
14 of 5,925 rising_eligible. Not a ranking - a collapse. Something filters out ~99.8% of the cohort.
Top-14 output is a grab-bag: Wei Li (Jinan, CN, momentum 100 on pub_vel 12), Evelyn Loo (SG), some plausible
emerging names (Matteo Megna/Naples, Alexander Egeberg/Copenhagen - real derm names) mixed with noise. But 14 is
unusable regardless.
LIKELY CAUSES (to confirm by reading eligibility logic):
  1. early(2016-2020) vs recent(2021-2025) window split requires pubs in BOTH windows to compute a delta ->
     rising stars (career_age 3-10) may have NO early-window baseline -> excluded. Gut the cohort.
  2. Over-filtered fetch: 4,173 author-pub rows for 5,925 HCPs is way too few. hcp_industry_classification_v1
     INNER join (4,187 classified) + other filters compounding.
  3. min-pubs-per-window threshold few rising stars meet.
IRONY: the window-delta approach that makes momentum meaningful for ESTABLISHED (long history, both windows
populated) FAILS for RISING (short history, recent-only). The model may need rising-specific eligibility: score
momentum for anyone with recent-window activity, treat missing-early as zero-baseline (growth from nothing =
high momentum) rather than EXCLUDING them.
DRY-RUN DISCIPLINE VALIDATED AGAIN: would have written 14 rows as "AD Rising Stars" - caught before persisting.
NEXT: read the eligibility filter (early/recent both-required? min pubs? academic-only?). Fix so the rising
cohort isn't gutted. This is the real build work for rising.

### 30j. ROOT CAUSE - momentum scorer IGNORES rising_eligible cohort + demands BOTH-window footprint. Design mismatch.
Eligibility logic read: the scorer does NOT read hcp_cohort_classification_v2 rising_eligible. It builds its OWN
population (pub rows -> aggregate by hcp -> own filter): academic-only + min-pubs in EARLY window (2016-2020) +
min-pubs in RECENT window (2021-2025) + career bound. 
THE KILLER: requiring min pubs in BOTH windows demands a substantial EARLY footprint. A genuine rising star
(career_age 5, first pub 2021) has ZERO early-window pubs -> instantly ineligible. The model structurally
CANNOT SEE newcomers - it selects for people with big early histories = mid/late-career, the OPPOSITE of rising.
PROOF in the 14 survivors: Wei Li (14yr career), Egeberg (46 early pubs!), Estrada (31 early pubs) - these are
established-trajectory people, not emerging. The filter selected established profiles. Wrong population entirely.
=> TWO design problems:
  1. DISCONNECT: momentum scorer re-derives its own eligibility instead of scoring the classifier's 5,925
     rising_eligible cohort. Should score the SAME cohort the classifier defined.
  2. BOTH-WINDOW REQUIREMENT: wrong for rising by construction. A rising star's signal is growth INTO the recent
     window, often from a near-zero early baseline. Missing-early should = zero-baseline (high momentum from
     nothing), NOT exclusion.
THIS IS THE REAL RISING BUILD WORK. The momentum scorer needs rethinking for the rising use case:
  - Score the rising_eligible cohort (join hcp_cohort_classification_v2).
  - Handle short-history: recent-window activity is REQUIRED; early-window is a baseline that can be zero.
  - Momentum = recent trajectory (velocity, acceleration, authorship progression) - computable from recent window
    alone + whatever early baseline exists. Growth-from-zero is the strongest rising signal, not an exclusion.
  - The VISIBILITY axis (reused established scores) already guards small-N noise, so momentum can be permissive.
DECISION POINT: this is a scorer redesign, not a config tweak. Significant. Good place to assess scope vs energy.

### 30k. CONFIRMED - rising collapse is LINKAGE not design. User's "it worked for NSCLC" instinct VINDICATED.
Rising-eligible linkage: 5,925 total, 1,628 ZERO links (27%), MEDIAN 3 links. Half the cohort has <=3 AD pubs.
=> The momentum scorer needs pubs in BOTH early(2016-20) + recent(2021-25) windows. With median 3 total links,
nobody clears "min pubs in each window" -> eligibility collapses to 14 (the few well-linked). The both-window
logic is NOT the root problem - the THIN LINKAGE is. Same disease as established under-linkage (§29o), now in
the rising cohort.
NSCLC worked because NSCLC was fully linked (never under-linked) -> both-window logic fine there. AD rising is
under-linked -> collapse. SCORER IS FINE; DATA IS THIN. User was right - no redesign.
WHY rising still thin after §29p backfill: §29p covered 7,273 HCPs via hcp_openalex_authors_v2 bridge, but
1,628 rising HCPs still at zero - they're either not in the bridge, or the backfill's DISTINCT-ON/scope missed
them. The backfill helped established (which we measured) but rising wasn't separately verified. Classic
"verify the OTHER cohort too."
FIX: extend the link backfill to ALL AD HCPs (or specifically the rising cohort). Same frozen-safe §29p INSERT,
just ensure it covers rising-eligible hcp_ids. Then re-derive, re-run momentum -> should get thousands eligible.
This ALSO means: the durable Step F fix (§30b, --hcp-ids-file with ALL TA HCPs) would have PREVENTED this -
running Step F for all AD HCPs (not just established, not just new) links the rising cohort too. The interim
§29p backfill was established-biased. Confirms the canonical Step F invocation matters.
NEXT: (1) check why 1,628 rising HCPs are unlinked (in hcp_openalex_authors_v2 bridge or not?). (2) extend
backfill to cover them. (3) re-run momentum -> validate eligible count jumps. (4) THEN assess if any residual
both-window issue remains for genuine newcomers.

### 30l. ALL 1,628 zero-link rising HCPs are IN the OpenAlex bridge -> 100% fixable by backfill. Re-run broader.
Split: 1,628 zero-link rising, ALL 1,628 in hcp_openalex_authors_v2 bridge, 0 not-in-bridge. Every one has an
OpenAlex author id + AD pubs in the authorships JSON; the links just were never created. Identical to the
established under-linkage - same fix works. §29p backfill didn't reach them (was effectively narrower than
"all AD HCPs").
FIX: re-run the §29p frozen-safe backfill INSERT for ALL AD-tagged HCPs (covers established[done]+rising+
community in one pass). Idempotent (ON CONFLICT DO NOTHING) -> only ADDS missing links, touches nothing correct.
This is exactly the durable Step F fix (§30b: --hcp-ids-file = ALL TA HCPs). The §29p run was established-biased;
the canonical approach links the whole cohort. Doing it now for AD, then bake into pipeline.
AFTER backfill: re-derive nothing needed (momentum reads publication_authors_v2 live) -> re-run scientific +
network momentum -> eligible count should jump from 14 to thousands -> validate.
RESIDUAL (assess after): some rising HCPs are GENUINELY thin (real early-career, 2-3 pubs) - for them there's
nothing to backfill and the both-window momentum legitimately can't compute. That's correct behavior, not a bug.
The question is whether the ELIGIBLE count after backfill is healthy (thousands) - if so, the both-window design
is fine for the linkable majority.

### 30m. Backfill inserted NOTHING for rising (still 1,628 zero, median 3). NSCLC safe (481,944). Hypothesis wrong.
The extended backfill added zero rising links. NSCLC unchanged (frozen-safe held). So "success no rows" = nothing
inserted. The 1,628 are in the OA bridge but the backfill's authorships-JSON join found no AD-pub matches for
them. Chain is broken somewhere.
FORK (tracing one zero-link rising HCP's OA id against AD-pub authorships):
  - If their OA id APPEARS in AD-tagged pubs' authorships (ad_pubs>0): backfill join logic is subtly off (format/
    NULL) - debug the join.
  - If their OA id does NOT appear in any AD-tagged pub (ad_pubs=0): they have NO AD pubs at all -> they were
    classified rising_eligible by NON-AD signal (global career age / other-TA pubs), NOT AD activity. They
    should NOT be in the AD rising cohort. = the SAME TA-ANCHORING issue we fixed for ESTABLISHED (hepatologists,
    §0d) but likely NEVER APPLIED TO RISING.
STRONG HYPOTHESIS: rising cohort is NOT TA-anchored. We added TA_ESTABLISHED_MIN_PUBS for established but the
rising classification path may still qualify on global career metrics -> rising_eligible full of people with 0
AD pubs (median 3 links, 27% zero = consistent with a cohort not gated on AD output). If so, the "collapse to 14"
is CORRECT behavior - most of the 5,925 aren't real AD rising stars, and momentum rightly can't score them.
=> This would mean: NOT a linkage bug, NOT a momentum-design bug, but a COHORT-DEFINITION bug (rising not
TA-anchored). Fix = apply TA-anchoring to rising classification (require some AD pubs), which shrinks 5,925 to a
real AD-rising cohort, on which momentum should then work.
NEXT: the trace query decides - does a sample zero-link rising HCP have ANY AD pubs? If no -> TA-anchor rising.

### 30n. *** CONFIRMED: rising cohort NOT TA-anchored. Same bug class as established hepatologists. ***
Sample zero-link rising HCP (OA A5012959387) appears in ZERO AD pubs. No AD links to backfill - no AD pubs exist.
Classified rising_eligible by NON-AD signal (global career metrics). The rising classification path was NEVER
TA-anchored - we added TA_ESTABLISHED_MIN_PUBS to established (§0d) but rising still qualifies on global career
structure without requiring AD output.
=> The 5,925 rising_eligible is POLLUTED with career-qualified non-AD people (median 3 links, 27% zero, sample
at 0). The momentum "collapse to 14" was CORRECT - only ~14 of 5,925 have enough real AD pubs for a 2-window
trajectory. SCORER WAS RIGHT, COHORT WAS WRONG. Same lesson as established: TA-anchor or the cohort fills with
cross-TA passengers.
The backfill inserting nothing PROVES it - if they had AD pubs, links would've been created. They have none.
User's "worked for NSCLC" holds one level up: NSCLC rising was TA-clean (NSCLC HCPs entered via NSCLC pubs);
AD rising let in global-career-qualified non-AD people.
FIX: apply TA-anchoring to the RISING classification (require min AD pubs, like established). This shrinks 5,925
-> a real AD-rising cohort. Then momentum computes on people who actually have AD pubs. Need to find the rising
classification logic in cohort_classification_v2.py and add the same ta_pubs gate.
CAVEAT for rising specifically: rising stars legitimately have FEWER pubs than established, so the min-AD-pubs
threshold for rising should be LOWER than established's 5 (maybe 2-3?), AND the both-window momentum requirement
interacts - a rising star needs enough recent-window AD pubs to score. Determine the right rising threshold +
whether both-window or recent-only is right for the (now properly AD-anchored) rising cohort.
NEXT: (1) find rising classification logic + its current (non-AD) eligibility. (2) add ta_pubs gate. (3) decide
rising threshold. (4) re-classify. (5) re-run momentum on the clean cohort.

### 30o. Rising pollution quantified: ~46% have <=2 AD pubs. Threshold decision for TA-anchoring rising.
Distribution of 5,925 rising_eligible by AD-pub count:
  0 AD pubs:     1,628 (27%) - pure pollution (non-AD, career-qualified)
  1-2 AD pubs:   1,063 (18%) - too thin for a real AD rising star
  3-4 AD pubs:   1,939 (33%) - marginal
  5+ AD pubs:    1,295 (22%) - credible AD-rising floor
  10+ AD pubs:     373 (6%)  - clear AD-focused core
~46% (2,691) have <=2 AD pubs -> can't support 2-window momentum + mostly not AD-focused. Cohort ~half pollution.
Mirrors established (9,449 -> 2,547 when TA-anchored).
THRESHOLD DECISION (judgment call):
  - >=5 (like established): 1,295 rising. Clean but maybe too strict FOR RISING - cuts early-career people with
    3-4 strong recent pubs + steep trajectory, who are exactly what "rising star" should catch.
  - >=3: 3,234 rising. Includes 3-4 bucket. Catches genuine early risers; some 3-pub noise.
TENSION: established rewards ACCUMULATED authority (high floor right); rising rewards TRAJECTORY (lower floor
right - catch them BEFORE accumulation). A 4-recent-pub steep riser > an 8-flat-pub plodder.
RECOMMENDATION: rising floor >= 3 AD pubs (3,234 cohort), BECAUSE the VISIBILITY axis + momentum both-window
logic provide secondary filtering - a 3-pub person with no real trajectory won't score high, but a 3-pub person
with all-recent + authorship progression WILL surface (correctly). Let the floor be permissive; let the scoring
discriminate. BUT this interacts with the momentum both-window MIN_PUBS_PER_WINDOW=5 - with a 3-pub floor, almost
nobody has 5 in EACH window. So the momentum window thresholds MUST be revisited for rising (lower per-window
min, or recent-weighted). This is the real design work, now on a PROPERLY ANCHORED cohort.
=> Two linked fixes: (1) TA-anchor rising at >=3 AD pubs, (2) retune momentum windows for the rising reality
(fewer pubs, recent-weighted). Advisor input useful on both thresholds.

### 30p. Past-chat search on rising thresholds - found history but not exact values. Go to code + NSCLC data (ground truth).
Conversation search surfaced:
  - "Working with Cursor Pt.17": KNOWN rising-star contamination history - "Rising Star pipeline leak (63
    Established HCPs leaking into hcp_rising_star_ranks_v3)". So the rising cohort has had bleed/contamination
    issues before - the "Why This Expert" color bug on Rising Star detail pages was traced to this leak, not
    frontend. Confirms rising-cohort purity has been a recurring concern.
  - "Working with Cursor Pt.11": cohort assignment was corrupted by the career_first_pub_year bug (fixed via
    career_first_pub_year_v2 sustained-3yr-window heuristic). Community scoring derives career stage from NPI
    enumeration, NOT pub year. => the cohorts use DIFFERENT career-stage sources (established/rising = pub-year;
    community = NPI). Relevant: rising eligibility keys on career_first_pub_year_v2 + pub-based structure.
  - Frontend cohort order: Established -> Rising Stars -> Community (confirmed 3-cohort model).
Search did NOT surface the exact NSCLC rising thresholds (career_age band, min pubs). Chat summaries too
high-level.
=> GROUND TRUTH approach: NSCLC is the FROZEN cohort that WORKED. Read (a) the rising classification logic in
cohort_classification_v2.py, (b) what thresholds actually produced NSCLC's rising cohort, (c) whether NSCLC
rising HCPs all have NSCLC pubs (i.e. was NSCLC effectively TA-anchored by construction, or explicitly?). This
tells us what threshold to apply to AD to match the proven NSCLC behavior - rather than inventing one.
KEY QUESTION the code will answer: does cohort_classification_v2.py's RISING path already have a ta_pubs gate
(that AD somehow bypassed) or NO ta_pubs gate (so NSCLC only looked clean because NSCLC HCPs entered via NSCLC
pubs)? That determines whether this is a bug (gate exists, AD skipped it) or a gap (no gate, add one).

### 30q. *** ROOT CAUSE PINNED IN CODE: rising path has NO ta_pubs gate (established does). + NSCLC never in v2 classifier. ***
CLASSIFIER CODE (cohort_classification_v2.py classify_hcp) - the order:
  1. ESTABLISHED: (ta_pubs >= TA_ESTABLISHED_MIN_PUBS=5) AND career_rule   <- TA-ANCHORED
  2. elif career_age 3-10 -> RISING_ELIGIBLE                                <- NO ta_pubs GATE (bug)
  3. elif career_age <3 -> too_young
  4. elif career_established but ta_pubs<min -> community
  5. else community (no career data)
Rising is assigned on career_age 3-10 ALONE - pure GLOBAL career age, zero AD-pub requirement. Anyone with a
3-10yr global career lands in rising_eligible regardless of AD activity. EXACTLY the pollution measured (1,628
zero AD pubs). The TA-anchoring we added for ESTABLISHED was NEVER extended to RISING. Confirmed in code, not
inferred.
BIG REFRAME: NSCLC has ZERO rows in hcp_cohort_classification_v2 for rising (query returned 0). NSCLC was NEVER
run through the v2 classifier's rising path! NSCLC rising lives in hcp_rising_star_ranks_v2 (76,721 rows) from an
OLDER pipeline predating cohort_classification_v2. So:
  - NSCLC rising = OLD classification mechanism (whatever it was) -> worked.
  - AD rising = NEW cohort_classification_v2 path with the un-anchored career_age_3_10 rule -> polluted.
"It worked for NSCLC" worked under a DIFFERENT classifier. Can't compare NSCLC's v2 rising cohort - it doesn't
exist. AD is the FIRST TA through the v2 classifier's rising path, and that path has the un-anchored rule. So
this is a genuine gap in the NEW classifier, surfacing now because AD is its first rising run.
THE FIX (clean, mirrors established): add a ta_pubs gate to the RISING branch:
  elif career_age 3-10 AND ta_pubs >= TA_RISING_MIN_PUBS -> rising_eligible
  else (career_age 3-10 but ta_pubs < min) -> community  (present in TA but not enough AD footprint)
Introduce TA_RISING_MIN_PUBS. Value TBD - lower than established's 5 (rising = fewer pubs by nature). From the AD
distribution: >=3 gives 3,234; >=5 gives 1,295; >=2 gives 4,297. This is the threshold to decide (advisor-worthy).
NOTE the momentum both-window MIN_PUBS_PER_WINDOW=5 STILL interacts - even a TA_RISING_MIN_PUBS=3 cohort mostly
won't have 5 pubs in EACH window. So BOTH must change together: (a) anchor rising at TA_RISING_MIN_PUBS,
(b) lower momentum per-window min for the rising density. Two linked knobs.

### 30r. Advisor note drafted (rising thresholds). PROCEEDING with build while advisor out - decisions reversible.
Advisor note asks: (1) rising TA-footprint floor (>=2/3/5 -> 4,297/3,234/1,295), (2) momentum window design
(both-window min-5 too strict for rising; growth-from-low-baseline should be the signal not an exclusion),
(3) a reference set of real emerging AD investigators for validation (rising is harder to eyeball than established).
DECISION: proceed with the build now (user: "keep going, it's 1pm"). All threshold choices are REVERSIBLE
(re-run classifier + momentum with different constants). Use working defaults, validate, adjust when advisor
replies. Working defaults chosen:
  - TA_RISING_MIN_PUBS = 3 (the middle option, 3,234 cohort - genuine AD engagement without established-level bar)
  - momentum MIN_PUBS_PER_WINDOW: lower for rising. Candidate: drop to 2, OR make early-window baseline
    zero-allowed + require recent-window activity only. Decide empirically from what gives a sensible eligible
    count + sensible top names.
BUILD SEQUENCE:
  1. Add ta_pubs gate to the RISING branch of classify_hcp (mirror established): 
     elif career_age 3-10 AND ta_pubs >= TA_RISING_MIN_PUBS -> rising_eligible; else community.
  2. Re-classify AD (--dry-run first): rising_eligible should drop 5,925 -> ~3,234 (at >=3).
  3. Retune momentum per-window min for rising density (separate script constant).
  4. Re-run scientific + network momentum on the clean cohort -> eligible count should be healthy (thousands not 14).
  5. Run rising composite -> validate top names look like plausible emerging AD investigators.
  6. When advisor replies: adjust thresholds if needed, re-run (cheap).

### 30s. *** ADVISOR: don't retune momentum - REDESIGN it for Rising. Different philosophy, not different thresholds. ***
Q1 CONFIRMED: TA_RISING_MIN_PUBS = 3. (>=2 noise: one collab/lab-rotation/middle-author multicenter. >=5 wrongly
tells a real 5yr riser w/ 3 senior + 2 first papers to wait. 3 = commitment to the disease.)
Q2 REFRAME (stronger than asked): the current both-window momentum IS AN ESTABLISHED METRIC ("how has an existing
investigator CHANGED?"). Rising needs "how fast is this investigator EMERGING?" - different prediction problem.
  ESTABLISHED = accumulated authority (past). RISING = future authority (trajectory).
  ZERO EARLY BASELINE IS NOT A BUG - it's THE SIGNATURE of emergence (0 pubs 2016-20 -> 8-12 pubs 2021-25 =
  textbook rising star). The both-window requirement EXCLUDES exactly who we want.
  => DON'T lower MIN_PUBS_PER_WINDOW. REMOVE the historical-window requirement for rising. Established + Rising
  must NOT share the momentum calc.
NEW SCORE = "EMERGENCE" (recent-window only, no early window required):
  ~40% recent publications
  ~30% recent senior/first authorship  
  ~15% citation velocity
  ~15% network growth
  (illustrative weights; career age contextualizes). Noise guard: 0->2 isn't rising, 0->12 is - the recent-
  VOLUME + the Visibility axis handle small-N (a 2-recent-pub person won't clear on volume).
ARCHITECTURAL PRINCIPLE (advisor): Established + Rising have DIFFERENT PHILOSOPHIES not just thresholds.
  "Who shaped the field?" vs "Who is shaping it NEXT?" - different products. Don't force rising into a modified-
  established formula. Reframe rising as "FASTEST-GROWING scientific influence" not "not-yet-established."
VALIDATION (advisor - rising is the hardest to validate):
  - NOT against today's stars (Silverberg). 
  - Academic-age sanity: list full of 25yr veterans = broken; full of 3-paper fellows = broken; want the MIDDLE.
  - Best proxy today: ask established KOLs "which YOUNGER investigators would you recruit to an advisory board
    now?" (different Q than "biggest names").
  - Real validation is LONGITUDINAL: do today's top rising -> established in a few years? (can't do yet.)
IMPACT ON BUILD: the ta_pubs gate (step 1) still needed + correct. But the momentum SCORER needs a rising-
specific rewrite (recent-window emergence), not just a per-window-min tweak. scientific_momentum_scoring's
both-window delta logic is Established-shaped. This is more work than "change a constant" but it's the RIGHT
build. Network momentum (early_vs_recent deltas) similarly - "network GROWTH" can stay delta-based (growth IS a
delta) but must allow zero early baseline.

### 30t. ta_pubs gate WORKS. rising 5,925 -> 3,234. Clean, auditable demotion. + established drifted +38 (backfill).
Dry-run cohort counts after the rising ta_pubs>=3 gate:
  established: 2,547 -> 2,585 (+38, see note)
  rising_eligible: 5,925 -> 3,234 (the >=3 population, exactly predicted)
  too_young: 465 (unchanged)
  community: 6,910 -> 9,562 (+2,652, absorbs demoted)
Demotion breakdown (auditable): community:rising_age_but_ta_pubs=0 (1,628, the zero-pub pollution), =1 (585),
=2 (478) = 2,691 demoted. Reason labels explicit + correct. Branch order verified (thin rising-age -> community
branch 5, not the no_career_data fallback). Unit test passed (career_age 6 + ta_pubs 0 -> community).
NOTE - established drifted 2,547 -> 2,585 (+38). We did NOT touch the established branch. Cause: the §30 step-2
extended backfill added AD links -> a few career-qualified HCPs crossed ta_pubs>=5 into established. CORRECT
behavior (they now have the AD footprint), but it means the established RANKING (hcp_established_ranks_v3, 2,546)
is now slightly stale by +38. MINOR. TODO at end: re-run established composite once to pick up the 38. Does NOT
block rising. (Also: this drift confirms the backfill DID add established-relevant links even though it added
zero to the polluted rising HCPs - consistent: backfill helped real-AD HCPs, the zero-pub rising ones had no AD
pubs to add.)
NEXT: this was --dry-run. EXECUTE the classification to persist the clean rising cohort, then build the Emergence
scorer (advisor's rising redesign) on top of it.

### 30u. Classification PERSISTED + all checks pass. Decision: B (clean-sheet emergence_scoring.py).
Executed. established 2,585 / rising 3,234 / too_young 465 / community 9,562 (15,846 AD HCPs).
ALL VALIDATION CHECKS PASS:
  - Hepatologist spillover: ALL (Loomba/Sanyal/Sarin/Tacke/Wedemeyer/Bajaj/Gores/Trautwein/Trebicka) -> community
    ta_pubs=0. TA-anchoring holds for BOTH established and rising.
  - AD KOLs (Silverberg/Guttman-Yassky/Simpson/Wollenberg/Eichenfield/Yosipovitch) -> established. Correct.
  - RISING GATE VALIDATED BY EXAMPLE: Dawn Eichenfield (rising, ta_pubs=5, career 3-10) + Andrew Simpson (rising,
    ta_pubs=3) = exactly the target profile (early-career, real AD footprint, not-yet-established). Noise (ta_pubs
    1/2) correctly excluded to community. The gate surfaces plausible rising candidates.
  - Community fully auditable (every demotion has explicit ta_pubs=N reason).
DECISION CONFIRMED: B - clean-sheet emergence_scoring.py (NOT surgical edit of momentum scorer). Rationale:
different philosophy (emergence vs accumulated-change) deserves its own scorer + purpose-shaped table; avoids
cramming recent-window emergence values into the delta-shaped hcp_scientific_momentum_v1 schema (the "schema
fights the code" pattern). Reuse momentum scorer's WORKING parts as template (v2 data access, recent-window stat
computation, percentile helper) - not truly from scratch.

### 30v. ADVISOR sharpened Emergence: citations-PER-PUB (not total), DROP network entirely. 3-construct model.
FINAL EMERGENCE SPEC (advisor-approved):
  Population: rising_eligible (3,234, TA-anchored >=3 AD pubs) + recent activity. Percentiles WITHIN rising
  cohort (not global - else Silverberg crushes everyone).
  Window: recent only 2021-2025. No early window. Career age = context, not gate.
  SIGNALS:
    Recent AD publications (volume)              45%
    Recent senior/first authorship               35%
    Recent citation impact = citations PER PUB   20%
  => emergence_raw -> percentile (continuous formula, double precision column from the start).
TWO ADVISOR CORRECTIONS to my draft:
  1. Citations PER PUB, not total. Production is already the 45% axis; total citations double-counts quantity.
     Per-pub makes citations measure IMPACT/quality, not quantity again. Prevents "1 Nature paper 150 cites"
     outranking a sustained AD program. (v2 refinement: mild shrinkage-to-mean for tiny pub counts.)
  2. DROP network from Emergence. Recent centrality = current connectedness, NOT growth - mislabeling it
     "network growth" is dishonest. Don't invent a proxy you don't believe. Omit from the scientific emergence
     scorer; let the COMPOSITE consume network separately (mirrors Established = Sci Authority + Network as
     separate axes). Emergence is a PUBLICATION-derived construct; network is a separate axis.
RISING COMPOSITE = Emergence 75% / Network 25% (mirrors Established 75/25 symmetry).
THREE-CONSTRUCT PRODUCT PHILOSOPHY (the clean separation to preserve across all TAs):
  Established = "Who shaped the field?" (accumulated authority)
  Emergence   = "Who is establishing themselves scientifically?" (recent publication trajectory)
  Network     = "How connected are they?" (separate axis, consumed by both composites)
  Don't blur them. Future-Garrett at 6 TAs benefits from the separation.
V2 REFINEMENTS (noted, not now): (a) publication ACCELERATION - slope across 2021..2025 (1,3,5,8,11 = emerging;
6,6,6,6,6 = flat) - a beautiful emergence signal. (b) citations-per-pub shrinkage for small-N.
BUILD: emergence_scoring.py - population from rising cohort, recent-window signals, per-pub citations, no network,
within-cohort percentiles, double-precision output col, --ta/--dry-run/--execute, frozen-safe. Then rising
composite (emergence + network 75/25). Reuse momentum scorer's v2 data-access + percentile helper as template.

### 30w. BUILT emergence_scoring.py + DDL. Ready to run.
Two files created:
  - phase1_addendum_13_scientific_emergence_v1.sql: committed DDL (double precision percentiles baked in, grants+
    NOTIFY, PK on id, unique on hcp_id+ta_id, indexes). NO ad-hoc table creation (finalize-established lesson).
  - emergence_scoring.py: recent-window Emergence scorer. Key design points implemented:
    * Population: JOINs hcp_cohort_classification_v2 cohort='rising_eligible' (the clean 3,234). No both-window
      gate - only requirement is >=1 recent AD pub.
    * Signals: recent_pubs 45% + senior/first-authorship SHARE 35% + citations-PER-PUB 20%. No network.
    * Percentiles WITHIN rising cohort (rankdata avg-ties -> continuous 0..100). No global comparison.
    * Safe write default: --execute required, --dry-run forces no-write (write = execute and not dry_run).
    * Frozen-safe: ta_id-scoped on cohort + pub-TA join.
    * debug print shows career_first_pub_year_v2 (academic-age sanity - advisor's "want the middle, not 25yr
      veterans or 3-paper fellows").
RUN SEQUENCE:
  1. Create the table: run phase1_addendum_13 SQL in Supabase (or via run_sql.py).
  2. Dry-run: python scripts/score/emergence_scoring.py --ta atopic-dermatitis --dry-run
     -> check scored count (should be most of 3,234 who have >=1 recent pub), top-20 names = plausible emerging
     AD (NOT the established giants; academic-age in the "middle" - roughly career 3-10, first_pub ~2015-2022).
  3. Validate: are these plausible emerging AD investigators? Academic-age sanity (advisor's test).
  4. If good: --execute.
Then: network signal for rising composite + the composite itself (emergence 75 / network 25). Note: the existing
rising_star_scoring.py composite reads the OLD momentum tables - it'll need rewiring to read emergence + a rising-
appropriate network signal. That's the next step after emergence validates.

### 30x. Emergence dry-run: PLAUSIBLE list, passes academic-age test. But INDUSTRY names leaking (no academic filter).
Top-20 emergence: academic-age distribution ON TARGET - first_pub 2016-2023 (career 3-10), NO established giants,
NO 25yr veterans. The "middle" the advisor wanted. Real emerging AD names surfacing:
  - Raj Chovatiya #4 (Rosalind Franklin, 39 recent pubs) - genuinely prominent rising AD/derm name. Strong.
  - JiaDe (Jeff) Yu #6 (Harvard, contact derm) - real younger investigator.
  - David Rosmarin #19 (Tufts, ruxolitinib/vitiligo) - legit rising.
  - Shanthi Narla, Nathan Archer, Jessica Hui - plausible early-career derm.
Model working as designed: high recent pubs + high senior/first share -> top (Chovatiya 39 pubs surfaces).
TWO FLAGS:
  1. INDUSTRY NAMES LEAKING: #10 Mohamed-Eslam Mohamed (AbbVie), #14 Ana Rossi (Sanofi), #20 Korey Capozza
     (National Eczema Assoc, no country). The ESTABLISHED momentum scorer filtered ic.classification='ACADEMIC'
     via hcp_industry_classification_v1; our emergence scorer does NOT. Industry researchers leaking into a
     supposed-academic rising list. LIKELY FIX: add the academic filter (JOIN hcp_industry_classification_v1,
     WHERE classification='ACADEMIC') - unless rising is intended to include industry. Decide.
  2. #1 Shanthi Narla: 10 pubs, 100% first-author, 0 senior. Unusual (all-first/no-senior). Legit-possible
     (productive first-author early-career) but the model rewards Sr/1stPct=100 strongly. Sanity note, not a bug.
NOTE: didn't print the scored COUNT in the paste - confirm most of 3,234 scored (not a collapse). 
DECISION before --execute: (a) add academic filter? (likely yes - matches established momentum precedent + rising
= emerging ACADEMIC investigators). (b) accept the authorship model as-is (Sr OR 1st share). Then execute.

### 30y. Industry-filter decision RESOLVED by data: rising cohort is 99.8% UNCLASSIFIED (3,227/3,234). Don't filter.
hcp_industry_classification_v1 covers only 7 of 3,234 rising HCPs (6 academic, 1 non-academic, 3,227 unclassified).
The table was built for the established/older population; it essentially doesn't cover rising. An INNER academic
filter would collapse the cohort to ~6. NOT VIABLE.
=> Converges with advisor's recommendation: DON'T exclude industry - FLAG it, let users filter. We can't reliably
classify academic-vs-industry for this cohort anyway, so the honest move is keep everyone + surface affiliation
as a displayed/filterable attribute (v2). No academic filter in the emergence scorer. Ship as-is.
ADVISOR VALIDATION (strongly positive): "not Established Lite - it's 'who's building an independent scientific
career?' Exactly what I wanted." Real names confirmed: Chovatiya ("if he weren't high I'd worry"), JiaDe Yu,
Rosmarin, Jessica Hui, Kridin (internationally emerging). Career-year distribution (2019-2023) = "immediately
tells me you're measuring emergence." Citations-per-pub validated by contrast: Hagino 37 pubs @ 13 cit/pub vs
Hyun Lee 6 pubs @ 88 cit/pub = different profiles, model sees both.
ADVISOR REFINEMENTS:
  1. Industry/academic/government/nonprofit = a FLAG for user filtering, not exclusion (AbbVie/Sanofi/National
     Eczema Assoc are product decisions, not errors). v2: affiliation-type attribute.
  2. Display "Leadership publications" (recent senior+first count) as a column - people care about it. Already
     computed (recent_senior_pubs + recent_first_pubs).
  3. Expose LEADERSHIP RATIO = (senior+first)/recent_pubs. 12 pubs/10 leadership != 40 pubs/2 leadership. Already
     computed (recent_senior_first_pct IS this ratio). Just expose it in UI.
  4. VALIDATE edge cases manually: Teppei Hagino (career 2023, 37 pubs) - unusual, deserves inspection (not
     impossible - could be a very productive fellow or a linkage/identity artifact). Worth a spot-check.
VALIDATION METHOD (advisor, the real one): ask 3 AD MSLs "give me 10 investigators you think will be major KOLs
in 5 years" -> measure OVERLAP (not rank) with our top. If the algorithm keeps surfacing the same independently-
named people, it's valuable. + LONGITUDINAL (the killer validation, needs time): take top-5% Rising from N years
ago -> how many are now top-10% Established? High conversion = genuinely PREDICTIVE not descriptive. A compelling
client-facing proof that FieldMark surfaces tomorrow's leaders, not just today's.
DECISION: emergence scorer is GOOD. Execute it. Then spot-check Hagino. Then the rising composite (emergence 75/
network 25).

### 30z. Hagino edge-case spot-check PASSES - real hyper-productive early-career AD investigator, not an artifact.
Teppei Hagino (Chiba Hokusou, JP): career_first_pub_year_v2=2023 but earliest_ad_pub=2021 (heuristic landed
slightly late; true onset ~2021, career age ~5). total_career_pubs=57, ad_links=57 => 100% AD (pure-AD
investigator, on-topic). 37 recent AD pubs (2021-2026), 13.4 cit/pub (solid, not spectacular = high-volume
moderate-impact profile). LEGIT - a real prolific early-career Japanese AD researcher, exactly what emergence
should catch. Not a linkage/identity artifact. Advisor's edge-case instinct good; check confirms signal.
Minor: career_first_pub_year_v2 heuristic imprecision (2023 vs true ~2021) - known, not worth fixing for 1 HCP.
=> Emergence scorer VALIDATED (plausible list + real names + academic-age on-target + edge case clean).
EXECUTE it now.

### 30aa. Emergence EXECUTED (3,052 scored, clean spread). Rising composite: use 10yr network (recent window not computed).
Emergence persisted: 3,052 of 3,234 scored (~182 have no RECENT AD pubs - correctly unscored). Percentiles clean:
min 0.21, median 49.97, max 100. No ceiling saturation. Emergence construct DONE.
NETWORK for rising composite: only window_type='10yr' exists for AD (19,925 hcps); 'recent_2021_2025' never
computed. DECISION: use '10yr' for the rising composite now. Rationale: (a) it's populated + covers the cohort,
(b) for EARLY-CAREER rising HCPs, 10yr network ~= their whole/recent network anyway (they haven't had a long
career - the 10yr-vs-recent distinction matters for 30yr established KOLs, not career-age-5 risers), (c) network
is only 25% of composite so minor imprecision is dampened. Advisor wanted "honest recent network influence" -
for rising HCPs specifically, 10yr is a reasonable proxy. v2 refinement: run network_centrality --window
recent_2021_2025 for a truer recent signal, but marginal benefit for rising, not blocking.
RISING COMPOSITE SPEC: emergence_percentile (hcp_scientific_emergence_v1) 75% + network influence
(hcp_network_centrality_v2 '10yr', network_influence_score -> percentile WITHIN rising cohort) 25%. Mirrors
established 75/25. Population = the 3,052 scored-emergence rising HCPs. Percentiles within rising cohort.
Archetype/shape tag (Balanced / Emergence-led / Network-led) optional - the old rising_star_scoring had
archetype logic; can reuse or simplify.
WIRING: the existing rising_star_scoring.py reads OLD momentum tables (hcp_scientific_momentum_v1 + hcp_network_
momentum_v1) - both wrong now. Needs rewire to read hcp_scientific_emergence_v1 + hcp_network_centrality_v2.
Given it also has the Visibility 2x2 logic (recent_pubs/recent_citations from momentum table) that no longer
applies, cleaner to write a NEW rising_composite that's emergence 75 / network 25 (2-axis, matching established)
rather than retrofit the old 2x2. Decide: new composite script vs retrofit rising_star_scoring.py.

### 30ab. SCHEMA CLARIFICATION - hcp_rising_star_ranks_v3 ALREADY EXISTS with OLD 2x2 shape. My CREATE was a no-op.
Confusion resolved:
  - hcp_established_ranks_v3 (PROVEN): scope_type/scope_value(text), rank, cohort_score, scientific_influence_
    pctile, network_influence_pctile, pharma_engagement_pctile (all numeric). This is the scope pattern to mirror.
  - hcp_rising_star_ranks_v3 ALREADY EXISTS (from old rising_star_scoring.py which INSERTs INTO _v3): OLD 2x2
    shape - scientific_momentum_percentile, network_momentum_percentile, scientific_visibility_percentile,
    network_visibility_percentile, momentum_component, visibility_component, rising_star_raw, rising_star_
    percentile, rank, us_rank, archetype, country. NO scope_type. Uses country/us_rank for geography.
  => My CREATE TABLE IF NOT EXISTS hcp_rising_star_ranks_v3 (2-axis design) was a NO-OP - table existed. The
  scope_type error earlier was querying the existing 2x2 table which has no scope_type.
DECISION NEEDED: the existing _v3 has the OLD 2x2 shape + a country/us_rank geography (not scope_type/scope_value).
Two clean paths:
  A. DROP + recreate hcp_rising_star_ranks_v3 with the NEW 2-axis shape mirroring established (scope_type/
     scope_value, emergence_pctile, network_pctile, rising_composite_raw/pctile, rank). Cleanest - matches
     established exactly, frontend repoints. But drops the old 2x2 table (empty for AD anyway; may have other-TA
     rows? old rising ran for NSCLC/Hep into _ranks_v2 not _v3 - CHECK if _v3 has any rows before dropping).
  B. Keep the existing 2x2 _v3, write a differently-named table (hcp_rising_composite_v1) for the 2-axis. Avoids
     the drop but adds table sprawl + naming confusion.
LEAN: A (drop+recreate to match established), IF _v3 has no rows we care about. CHECK first: does hcp_rising_star_
ranks_v3 have any rows (any TA)? If empty or only stale AD -> safe to drop+recreate clean.

### 30ac. hcp_rising_star_ranks_v3 has 1,581 NSCLC rows (FROZEN) - DO NOT DROP. New table hcp_rising_composite_v1.
Row check: hcp_rising_star_ranks_v3 has 1,581 rows for NSCLC (c0065b03, frozen). Dropping = destroying frozen
NSCLC rising data. NOT ALLOWED. Also won't ALTER a frozen-populated table's shape.
DECISION: new clean table hcp_rising_composite_v1 (2-axis), mirroring hcp_established_ranks_v3's scope structure:
  scope_type/scope_value (NULL global, country region), rank, rising_composite_score, emergence_pctile,
  network_influence_pctile. Percentiles double precision (better than established's numeric). Unique on
  (hcp_id,ta_id,scope_type,scope_value). Table sprawl < dropping frozen NSCLC or ALTERing frozen table.
  Name hcp_rising_composite_v1 - unambiguous, no collision with old _star_ranks_v3.
DDL run inline. Next: composite scorer (Cursor). Logic mirrors recompute_established_ranks_v3:
  - population: rising HCPs with emergence score (3,052) from hcp_scientific_emergence_v1.
  - scope rows: global (all) + region (per hcps_v2.country), like established.
  - per scope: rising_composite = 0.75*emergence_pctile + 0.25*network_pctile; network re-derived WITHIN scope
    from hcp_network_centrality_v2 '10yr' network_influence_score; emergence_pctile from emergence table (its
    within-cohort pctile - or re-derive within scope for consistency? established re-derives network in-scope but
    uses the stored scientific pctile as-is. MIRROR THAT: emergence pctile as-is, network re-derived in scope).
  - per-HCP reweight if network missing (emergence carries, /sum-present-weights).
  - rank within scope. Write hcp_rising_composite_v1.

### 30ad. THE RISING->ESTABLISHED LEAP: it's TIME, not substance. Top rising already exceed the established floor.
Established floor (ta_pubs among 2,585 established): MIN 5, p10 5, p25 6, MEDIAN 8.
Rising stars vs that floor:
  - Narla (#1 rising): 10 RECENT AD pubs -> already ABOVE established median (8), plus pre-2021 pubs on top.
  - Chovatiya: 39 recent AD pubs -> ~5x established median. Top-quartile-established by VOLUME today.
  - Even mid-pack rising (>=3 floor) overlaps the bottom of established.
=> THE LEAP for the top of rising is almost ENTIRELY career_age>10 (or the pub>=200/>=500 career rules) - a
TEMPORAL gate, not a substance gate. On publication output the top rising stars have ALREADY cleared the
established bar, often by a wide margin. The cohorts are CONTIGUOUS at the boundary (rising top >= established
bottom on ta_pubs), separated by the career-age structural rule.
PRODUCT IMPLICATION (strong): the top of the rising cohort isn't "juniors who might someday matter." It's
"established-caliber output sitting in a career-age holding pattern." This is EXACTLY the "who's building an
independent career fast" signal - and it's a compelling MSL story: these are people who will mechanically age
into established with a body of work ALREADY at established level. High-confidence future KOLs, not speculative.
This ALSO validates the longitudinal thesis structurally: a top rising star with established-level output +
career_age 9 will, in ~1-2 years, cross career_age>10 and land INSIDE established (not at its bottom). The
conversion isn't a hope - for the top of rising it's near-mechanical. Worth surfacing in product ("N years to
established-eligible") and as the basis for the eventual longitudinal validation.
CAVEAT: this holds for the TOP of rising. The mid/lower rising cohort (3-5 ta_pubs, less recent volume) is a
truer "maybe" population. The contiguity is at the top boundary specifically.

### 30ae. DESIGN ISSUE (user-surfaced): established gate uses career_age>10 as a LAZY PROXY for authority. Misclassifies at margins.
User's concern: "time alone shouldn't be the only reason an HCP isn't established." Correct - and the deeper
problem is the ESTABLISHED gate, not rising.
The established career rule (OR of 3): pubs>=500 OR (pubs>=200 AND first_pub<2020) OR career_age>10. The THIRD
prong (career_age>10) is a weak proxy for accumulated authority:
  - It LETS IN thin-long-career people: 11yrs + exactly 5 AD pubs + low citations = "established". Wrong.
  - It (correctly, but for the wrong reason) KEEPS OUT explosive short-career people: Chovatiya, 39 recent AD
    pubs, producing like a powerhouse, is NOT established purely because career_age~8.
  => career_age is measuring TENURE, which is only loosely correlated with authority. Doing too much work.
RESOLUTION - two separate truths:
  1. career_age>10 is a lazy proxy -> the established gate SHOULD lean on accumulated-authority signals (total
     career pubs, total citations, sustained senior-authorship over time) rather than a raw age threshold.
     Under an authority-based gate, thin-long-career people DROP to community (correctly); the gate stops
     rewarding a birthday.
  2. BUT Chovatiya still should NOT be "established" - not because of time, but because established = "who has
     SHAPED the field?" = accumulated, field-metabolized authority. His body of work is recent, not yet
     absorbed/cited/built-on. He's shaping the field NOW at high velocity = RISING/EMERGENCE (why he's #4 there).
     The cohorts answer different questions; he's correctly in the emergence answer.
So the fix is NOT "promote Chovatiya." It's "make the established gate authority-based not tenure-based" so it
(a) drops thin-long-career passengers, (b) keeps explosive-recent people out for the RIGHT reason (recency of
authority, not age).
STATUS: this is a FUTURE established-gate refinement, NOT a blocker for rising (rising is working correctly -
it's catching exactly the right people). Note for the established v2 pass. Interacts with the "leap is time not
substance" finding (§30ad) - both point at career_age>10 being the load-bearing-but-weak part of the established
definition. A citation/authority-weighted established gate would be more defensible and would make the rising->
established boundary about EARNED authority accumulation, not a clock.
DO NOT re-open established now (it's validated + shipped). Log as the highest-value established refinement for later.

### 30af. RISING COMPOSITE validated - Chovatiya emergence#4 -> composite#1 (network lifted the both-axes leader).
Composite dry-run (emergence 75 / network 25): Global top5 Chovatiya(99.87), Rossi, Rosmarin, Capozza, Kridin.
US top5 Chovatiya(99.82), Rossi, Rosmarin, Jackson, JiaDe Yu. 3,052 HCPs -> 5,719 scope rows, 66 scopes.
KEY VALIDATION: Chovatiya rose emergence#4 -> composite#1. Network (25%) correctly LIFTED the both-axes leader
(39 recent pubs AND strong AD network) over emergence-only leaders (Narla/Quaade: high emergence, thinner
network). The composite is MORE credible than pure emergence - surfaces people producing AND embedded in the
field = truer rising-star signal. Narla (emergence#1, 10 all-first-author, thin network) correctly settled back.
Mechanics verified: frozen-safe (assert_scoped_ta_writes), reweighting matches established, continuous percentile,
safe write default.
EXECUTED -> hcp_rising_composite_v1. RISING STARS SCORING COMPLETE for AD.
=== THREE-COHORT MODEL for AD now complete on 2 of 3: ESTABLISHED (validated, shipped) + RISING (validated,
shipped). COMMUNITY remains. ===
Rising build arc this session: found the momentum "collapse to 14" -> traced to linkage -> then to the REAL root
(rising cohort not TA-anchored, career_age alone) -> added ta_pubs>=3 gate (5,925->3,234, hepatologists out) ->
advisor reframe (momentum is an Established metric; build EMERGENCE instead) -> built emergence_scoring.py
(recent-window: pubs 45/authorship 35/cites-per-pub 20, no network, within-cohort pctile) -> validated (real
names: Chovatiya/Yu/Rosmarin/Kridin, academic-age on target, Hagino edge-case clean) -> executed (3,052) ->
rising composite (emergence 75/network 25, new hcp_rising_composite_v1 to protect frozen NSCLC) -> validated
(Chovatiya #1) -> executed. Plus: the "leap is time not substance" finding + the established-gate authority-proxy
design issue (§30ad/30ae).
REMAINING: (1) established +38 drift re-run (§30t), (2) Community cohort scoring, (3) frontend repoint to
hcp_scientific_emergence_v1 + hcp_rising_composite_v1, (4) advisor's authority-based established-gate refinement
(future), (5) longitudinal validation (future).

### 30ag. ADVISOR sharpened the established-gate insight: career_age is a proxy for DURABILITY (not a weak proxy for authority). Upgrades §30ae.
Advisor's correction to my framing (stronger + more precise):
  - WRONG framing (mine): "career_age is a weak/lazy authority proxy."
  - RIGHT framing (advisor): "career_age is a proxy for DURABILITY of scientific influence. AD shows BOTH why it's
    useful (correctly keeps high-output Chovatiya in Rising) AND where it breaks (admits long-career thin-TA
    investigators)."
THE CONSTRUCT Established should measure = DURABILITY = demonstrated SUSTAINED authority. NOT older, NOT more
prolific, NOT more citations. SUSTAINED. Established is DURABLE; Emergence is high-velocity-not-yet-metabolized.
Different CONSTRUCTS, not the same construct at different career stages.
  => Chovatiya is correctly in Rising for the RIGHT reason: not "he's young" but "his influence hasn't matured
  into DURABLE authority yet." His trajectory RESEMBLES established; it isn't durable YET.
  => The career-age gate is NOT wrong - it's a FIRST APPROXIMATION of durability. It correctly excludes Chovatiya;
  its failure mode is admitting thin-long-career people (proxy breaking at the other end). Fix = replace the
  PROXY with a DIRECT durability measure, NOT abandon the durability concept.
FUTURE ESTABLISHED-GATE REFINEMENT (the real target, now precisely defined): replace career_age>10 with direct
durability signals - sustained influence across multiple windows, continued senior authorship over time,
citation persistence, guideline leadership over time. Career age was the first approximation; it eventually
disappears, replaced by explicit durability measures. This PRESERVES the construct (durability) and fixes only
the proxy.
LOAD-BEARING INSIGHT (advisor, for product + internal framing): "Chovatiya exceeding Established investigators on
recent output is NOT evidence the cohorting is wrong - it's evidence that Emergence and Established are
intentionally measuring DIFFERENT CONSTRUCTS." 
PRODUCT FRAMING (advisor's, sharper than mine): top of Rising = "investigators whose scientific trajectory
already resembles Established leaders, but whose influence hasn't yet had sufficient time to mature into durable
authority." Conceptually (not UI) Rising ~ "Emerging Leaders" - not grad students, people BEGINNING TO LEAD the
field. Sets up longitudinal validation perfectly (they convert BECAUSE trajectory already resembles established).

### 30ah. *** RISING STARS PERSISTED. hcp_rising_composite_v1: 3,052 global + 2,667 region = 5,719 rows. DONE. ***
=== END OF SESSION (July 8, afternoon+). AD now has TWO of three cohorts fully built, validated, shipped:
    ESTABLISHED (Silverberg #1, domain-perfect) + RISING/EMERGENCE (Chovatiya #1, plausible emerging names). ===

TWO-OF-THREE-COHORT MILESTONE. The scoring methodology generalizes to a 2nd TA (AD: derm, 82% intl, fragmented)
across BOTH a mature construct (Established authority) AND a from-scratch-redesigned construct (Emergence). 

THREE-CONSTRUCT MODEL now concrete:
  ESTABLISHED = durable/accumulated authority ("who shaped the field?") - Sci Authority 75 / Network 25.
  EMERGENCE   = recent velocity/trajectory ("who's building an independent career?") - recent pubs 45 /
                senior-first authorship 35 / cites-per-pub 20, then composite Emergence 75 / Network 25.
  NETWORK     = connectedness (separate axis both composites consume).
Career age understood as a first-approximation DURABILITY proxy (future: replace w/ direct durability signals).

AFTERNOON ARC (finalize-established + rising, one session):
  - Finalized established durability: A1 DDL (double-precision percentile committed), A2 grants, B1 canonical
    Step F (--hcp-ids-file all-TA-HCPs), B2 authorship-derive step, C/D. Established durable, not just correct.
  - Rising: collapse-to-14 -> traced past linkage to the REAL root (rising cohort NOT TA-anchored) -> ta_pubs>=3
    gate (5,925->3,234, hepatologists out, KOLs/plausible-risers in) -> advisor reframe (momentum is Established-
    shaped; build EMERGENCE) -> built + validated + shipped emergence_scoring.py (real names: Chovatiya/Yu/
    Rosmarin/Kridin; academic-age on-target; Hagino edge-case clean) -> rising composite (new table to protect
    frozen NSCLC) -> Chovatiya #1 -> shipped.
  - Two conceptual assets: "the leap is time not substance" (rising top already exceeds established floor) +
    the durability-construct clarification (Established/Emergence measure different things by design).

NEW ARTIFACTS THIS SESSION: emergence_scoring.py, rising_composite_scoring.py, phase1_addendum_13_scientific_
emergence_v1.sql, hcp_rising_composite_v1 table, phase1_addendum_12/13 DDLs, cohort classifier rising gate.

REMAINING (next sessions, scoped + non-blocking):
  1. Established +38 drift: re-run recompute_established_ranks_v3 to pick up the 38 HCPs the backfill promoted.
  2. COMMUNITY cohort scoring (the 3rd cohort).
  3. Frontend repoint: hcp_scientific_emergence_v1 + hcp_rising_composite_v1 (2-axis, not old 2x2); affiliation-
     type as a displayed/filterable attribute.
  4. Established-gate durability refinement (advisor): replace career_age>10 with direct durability signals.
  5. Longitudinal validation (needs time): top-5% Rising -> top-10% Established conversion.
  6. Advisor's rising validation: ask 3 AD MSLs for "10 future KOLs", measure overlap.
  7. Bake canonical Step F all-HCPs into pipeline; network recent_2021_2025 window for a truer rising network.

### 30ai. COMMUNITY construct REVEALED by frontend - it's COMMERCIAL/CLINICAL engagement, not scientific. Different data spine.
Established re-run done: global 2,585 (picked up +38), region 2,331. Established truly final.
COMMUNITY (from the profile screenshot - Maen Hussein, Med Onc, Lady Lake FL, Community Score 68/100 "Rank 1
NSCLC"): a COMMERCIAL + CLINICAL-ENGAGEMENT construct, NOT scientific. The score's components:
  - PATIENT VOLUME (43.1K)
  - PHARMA ENGAGEMENT ($81K)
  - PHARMA REACH (60 - # companies/interactions)
  - DRUG BREADTH (25 - # drugs)
Plus displayed: drug engagement trends (growing/stable/declining per drug), top pharma companies by $, engagement
mix (consulting/speaker/F&B/honoraria/education/travel), engagement timeline, patient volume timeline, territory
(city/state), NPI/specialty. "Why this practitioner" narrative is commercial-strategy framed (pharma $ YoY,
drug-specific engagement, formulary signals) - NOT scientific.
=> This is the SEPARATE AXIS the advisor said to display-not-rank for KOLs - but for COMMUNITY it's the PRIMARY
construct, correctly: practicing community clinicians are prioritized by clinical reach + commercial engagement,
NOT scientific authority. The 3-construct model is actually:
  ESTABLISHED = scientific AUTHORITY (publications)
  RISING/EMERGENCE = scientific VELOCITY (publications)
  COMMUNITY = COMMERCIAL + CLINICAL ENGAGEMENT (Open Payments + patient volume + territory) - different data spine.
DATA AVAILABLE (hcps_v2 has the NPPES spine): npi_number, npi_specialty, npi_taxonomy, nppes_practice_city/state/
setting/zip, nppes_career_stage_years, derived_state, credentials. Commercial data = the Open Payments / pharma
tables already built for the established pharma axis (hcp_pharma_engagement_v2, hcp_open_payments_by_ta_v2).
PATIENT VOLUME (43.1K) - where does this come from? NOT in hcps_v2. Needs a source: Medicare claims? An
estimated/derived volume? MUST identify the patient-volume data source before building - it's a headline
component. Possibly already computed for NSCLC (the screenshot is NSCLC) - check what tables hold it.
NEXT: (1) find how NSCLC's community score was computed (which script + tables) - it's "Rank 1 NSCLC" so the
community scorer EXISTS and RAN for NSCLC, like rising did. Mirror it for AD. (2) identify patient-volume +
pharma-reach + drug-breadth sources. (3) check the community scorer is v2/AD-scoped/frozen-safe.

### 30aj. Community data spine FOUND (Medicare + Open Payments). Scorer exists. But US-DEPENDENT - AD is 73% intl.
Profiles clarified all 3 constructs render correctly:
  - Established (Heymach): "Sci Influence top of Established, Network at ceiling, Pharma 95th pctile" = our exact
    2-axis model (sci/network ranked, pharma DISPLAYED). Confirms established scoring is LIVE + correct.
  - Rising (Singh): frontend still shows OLD 2x2 (Sci Momentum 91/Net Momentum 94/Sci Vis 92/Net Vis 81) - the
    repoint-to-emergence is pending (correctly deferred until backend done). Her narrative "zero senior authorship
    ... transition to senior author = next milestone" = exactly our emergence leadership signal. Good.
COMMUNITY scripts: community_scoring.py, community_classification.py, community_nppes_backfill.py,
generate_community_narratives.py. Output: hcp_community_scores_v2, hcp_community_ranks_v2, hcp_community_snapshots.
PATIENT VOLUME SOURCE = Medicare claims: hcp_medicare_by_ta_v2, hcp_medicare_summary_v2, hcp_claims. ("Patient
Volume 43.1K" = Medicare beneficiary count.)
COMMUNITY SCORE components (from Hussein screenshot): Patient Volume (Medicare) + Pharma Engagement ($ Open
Payments) + Pharma Reach (# companies) + Drug Breadth (# drugs). ALL US-SOURCED (Medicare = US; Open Payments =
US).
*** STRUCTURAL CONCERN (data-availability nimbleness, §29ae, biting again): Community depends ENTIRELY on US data
(Medicare + Open Payments). AD is 73% INTERNATIONAL. So Community may be viable ONLY for the US subset of AD
community HCPs. The intl majority will have NO Medicare, NO Open Payments -> no community score. ***
This is NOT necessarily a bug - it may be CORRECT that Community (a US-commercial-engagement construct) only
scores US HCPs. An MSL working a US territory only cares about US community docs anyway. But we must CHECK
coverage + decide: does AD Community = US-only by design, or do we need an intl community construct (different
data)?
NEXT: (1) check community_scoring.py - v2? AD-scoped? frozen-safe? what it reads. (2) COVERAGE CHECK: how many AD
community HCPs (9,562) have Medicare data + Open Payments? If mostly US subset -> Community is US-only for AD
(probably fine, note it). (3) run for AD, validate, ship. Then all 3 cohorts done -> backend complete -> frontend.

### 30aj-CORRECTION. Heymach is NSCLC - does NOT confirm AD scoring is live. Correcting §30aj.
Misstatement corrected: Heymach (MD Anderson, NSCLC) is an NSCLC profile. NONE of today's AD work appears there.
What his profile confirms is ONLY: the FRONTEND TEMPLATE for the established construct renders (Sci/Network/Pharma
display, pharma-as-displayed-not-ranked) - using NSCLC data. Same for Singh (NSCLC rising, old 2x2 template).
These tell us what the eventual AD frontend REPOINT must match; they do NOT confirm AD scoring is live.
AD backend results are validated ONLY by our direct DB queries: hcp_established_ranks_v3 (Silverberg #1),
hcp_scientific_emergence_v1 (Chovatiya), hcp_rising_composite_v1 (Chovatiya #1). The frontend is NOT yet pointed
at ANY AD scoring tables - that's the deferred repoint (correctly waiting for backend-complete). So: AD data =
validated; AD frontend integration = not started. Keep these separate.

### 30ak. COMMUNITY for AD is BLOCKED on Medicare ingestion. Not a scoring build - a data build. 0 AD Medicare rows.
Coverage check on 9,562 AD community HCPs:
  - has_us_state: 954. has_npi: 347. (overwhelmingly international / non-NPPES-enriched - consistent w/ AD 73% intl)
  - AD Medicare rows (hcp_medicare_by_ta_v2 scoped to AD): ZERO. Medicare was NEVER ingested for AD.
=> The community scorer's PRIMARY input (patient volume from Medicare) doesn't exist for AD. Running it now = empty
/ meaningless. Open Payments (the other input) is the thin US-only data we already know (~275 established payers).
COMMUNITY FOR AD REQUIRES, IN ORDER:
  1. MEDICARE INGESTION for AD (the blocker) - populate hcp_medicare_by_ta_v2 / hcp_medicare_summary_v2 for AD-
     relevant HCPs/drugs. This is a DATA-INGESTION build, not a scoring build. Need to find how NSCLC's Medicare
     was ingested (the ingestion script/pipeline) + what AD-specific inputs it needs (AD drug list? AD HCP NPIs?).
  2. NPPES enrichment coverage: only 347 of 9,562 have NPI. Medicare keys on NPI. So even after ingestion, only
     the US-NPI subset scores. Community for AD will be a SMALL US subset (hundreds, maybe ~950 if state-derivable
     ones get NPIs). That's structurally correct (Community = US commercial construct) but SMALL for an intl TA.
  3. THEN run community_scoring.py for AD -> hcp_community_scores_v2 / _ranks_v2.
STRATEGIC NOTE: this is the SAME data-availability-nimbleness pattern (§29ae) a THIRD time - pharma (US-only ->
displayed), and now Community (US-Medicare-dependent -> small US subset for intl TAs). The 3-construct model has
an asymmetry: Established + Emergence are GLOBAL (publications, intl-uniform); Community is intrinsically US
(Medicare + Open Payments). For an intl-heavy TA, Community is a minor cohort by coverage. For a US-centric TA
(NSCLC) it's rich. This is fine + expected - just must be explicit: AD Community = US subset only.
DECISION POINT: Medicare ingestion is a real build (find the pipeline, get AD Medicare data, ingest, verify).
Is that the right use of remaining time, or checkpoint here with Established+Rising done (backend for the 2 GLOBAL
cohorts complete) and tackle Medicare ingestion fresh? The 2 scientific cohorts are the product core; Community-
for-intl-AD is a smaller-coverage add.

### 30al. Community-for-AD is a REAL PROJECT, not a quick run. 3 compounding problems. RECOMMEND checkpoint.
medicare_filter.py reads local CMS files: BASE_DIR=C:\...\FieldMark\Medicare\, glob Medicare_Physician_Other_
Practitioners_by_Provider_and_Service_*.csv (the big "by Provider and Service" public-use files). Filters to
Parquet on HCPCS codes + provider_type. So the ingestion pipeline EXISTS but has 3 compounding problems for AD:
  1. RAW FILES: unknown if the multi-GB CMS CSVs are on disk (globs BASE_DIR). If downloaded for NSCLC, maybe;
     if not, a sourcing effort.
  2. *** WRONG MEDICARE FILE FOR AD DRUGS ***: this is the "by Provider and Service" file = HCPCS-keyed = Part B
     (procedures + PROVIDER-ADMINISTERED drugs, e.g. infusions). NSCLC drugs are infused/injected (checkpoint
     inhibitors, chemo) -> Part B/HCPCS -> this file captures NSCLC well. But AD DRUGS ARE SELF-ADMINISTERED:
     dupilumab = at-home subcut injection, JAK inhibitors (upadacitinib/abrocitinib) = ORAL. Those are PART D
     (pharmacy), NOT Part B/HCPCS. => this file LARGELY WON'T CONTAIN AD'S DRUGS. AD needs the MEDICARE PART D
     PRESCRIBERS file - a DIFFERENT CMS dataset - + likely ingestion adaptation (this script is Part-B-shaped).
  3. PEDIATRIC PROBLEM: Medicare is 65+. AD is heavily pediatric/young-adult. Even perfect Part D ingestion gives
     a small unrepresentative slice of AD patient volume. Medicare AD "patient volume" is a WEAK construct signal
     for AD (unlike NSCLC where 65+ maps well). Construct validity issue, not just coverage.
  + the NPI ceiling: only 347/9,562 AD community HCPs have an NPI anyway.
=> Community-for-AD = source a DIFFERENT CMS dataset (Part D Prescribers) + adapt ingestion + accept a US-only,
65+-only, pediatric-blind, ~347-HCP signal. A genuine data project with a questionable payoff for an intl
pediatric-skewed TA. NOT finishable in the remaining time, and arguably LOW VALUE for AD specifically.
RECOMMENDATION: CHECKPOINT. The two GLOBAL cohorts (Established, Emergence/Rising) are the product core + are
DONE + validated for AD. Community is intrinsically a US-commercial construct that serves AD poorly (intl +
pediatric). For AD, Community may be best treated as: (a) a small US-subset built LATER when Part D is sourced,
or (b) a DISPLAYED directory (territory/specialty filter) rather than a scored cohort, or (c) deferred until a
US-centric TA#3 where it shines. This is a strategic product call for Garrett, not a today-build.
NEXT SESSION / STRATEGIC: decide Community's role for intl TAs. Source Medicare Part D if pursuing. The
data-availability asymmetry is now fully mapped: Established+Emergence GLOBAL; Community US-only (and Part-D for
non-infused TAs). A clean finding for the multi-TA thesis.

### 30am. REFRAME: Community blocker is the ta_hcpcs_codes MAPPING for AD (missing), NOT the data. Much more tractable.
medicare_aggregator.py is DRIVEN BY a ta_hcpcs_codes table: (therapeutic_area_id, hcpcs_code, code_category,
is_primary_signal, requires_specialty_match, specialty_match_patterns). Two match tiers:
  1. PRIMARY (is_primary_signal=TRUE): specific HCPCS codes = the TA's drugs/procedures.
  2. SPECIALTY (requires_specialty_match=TRUE, is_primary_signal=FALSE): codes counted ONLY if provider_type
     matches a specialty pattern (e.g. 'dermatology').
=> hcp_medicare_by_ta_v2 is empty for AD because there are (almost certainly) NO ta_hcpcs_codes rows for AD -
the mapping was populated for NSCLC/Hep, never AD. The aggregator had no AD codes to match. NOT a data-sourcing
problem (parquets on disk cover ALL HCPCS 2021-2023). The blocker is a MISSING MAPPING = far more tractable.
COMMUNITY-FOR-AD BUILD (revised, much smaller): (1) populate ta_hcpcs_codes for AD - AD drug HCPCS codes as
primary + dermatology specialty-match codes (skin procedures/E&M/biopsy) as the volume proxy. (2) run
medicare_aggregator.py --target-version v2 -> populates hcp_medicare_summary_v2 + hcp_medicare_by_ta_v2 for AD.
(3) run community_scoring.py for AD -> hcp_community_scores_v2/_ranks_v2. (4) validate.
CAVEATS SOFTENED (not gone):
  - AD Part B drugs: the SPECIALTY-MATCH tier sidesteps this - capture DERMATOLOGISTS' Medicare footprint (derm
    procedures/E&M) as patient-volume proxy, even without AD-specific drug codes. That's how the construct works
    for a derm TA.
  - Pediatric skew: real (Medicare 65+), but derms see 65+ patients; as a RELATIVE volume signal across US derms
    it still discriminates.
  - NPI ceiling: 347/9,562 hard limit - AD community stays a small US subset regardless.
KEY UNKNOWN: does populating ta_hcpcs_codes for AD require CLINICAL JUDGMENT (which HCPCS codes = AD/derm)? That's
a domain task - Garrett can supply, or model NSCLC's rows as a template. CHECK: what codes NSCLC has (primary vs
specialty), how many, whether AD is genuinely absent.
NEXT: verify ta_hcpcs_codes has NSCLC/Hep rows + zero AD. Then decide: populate AD codes now (tractable if
specialty-match-driven for derm) or checkpoint (if it needs heavy clinical HCPCS curation).

### 30an. NSCLC codes = 41, mostly specialty-match (30/41). AD-tractable pattern BUT needs CLINICAL HCPCS CURATION.
NSCLC ta_hcpcs_codes breakdown: 21 drug_admin+specialty, 9 procedure+primary, 5 em+specialty, 4 imaging+specialty,
2 drug_admin+primary. => 30 of 41 are SPECIALTY-MATCH (onc doing onc-typical procedures/visits/infusions), 11
primary. AD absent entirely (only NSCLC 41, Hep 27, Rare Disease 21).
GOOD: the specialty-match-heavy pattern TRANSLATES to derm - AD community volume ~= "dermatologist doing derm-
typical E&M/procedures/drug-admin", specialty-gated. Sidesteps AD's Part-D-drug problem (don't need AD drug codes;
use derm SPECIALTY footprint as the volume proxy).
CATCH: the 41 NSCLC codes were CLINICALLY CURATED - specific HCPCS picked to represent meaningful onc activity +
specialty-match patterns written. Replicating for AD = curate the DERMATOLOGY-equivalent set: derm procedure
codes (skin biopsy 11102-11107, excisions, phototherapy 96910/96912/96913, patch testing 95044), E&M levels,
'dermatology' specialty patterns, + dupilumab J-code if capturing. This is DOMAIN WORK (dermatology billing +
which codes signal AD practice) = GARRETT supplies, not Claude (guessing HCPCS codes = plausible-but-wrong risk).
RECOMMENDATION: this is the natural CHECKPOINT. Community-for-AD is now FULLY SCOPED + tractable, but the next
step is clinical HCPCS curation that needs Garrett's domain input (ideally deliberate, not end-of-day). The build
after curation is mechanical: populate ta_hcpcs_codes for AD -> run medicare_aggregator --target-version v2 ->
run community_scoring.py -> validate. And it serves ~347 US HCPs (small US subset of an intl TA) - real but minor.
=== AD BACKEND STATUS: 2 of 3 cohorts COMPLETE (Established, Emergence/Rising - the GLOBAL product core, done +
validated). Community = scoped, blocked only on AD HCPCS curation (Garrett domain task), small US coverage. ===
NEXT SESSION: Garrett curates AD/derm HCPCS codes (or we model NSCLC's 41 into a derm-analog list for his review)
-> populate ta_hcpcs_codes -> aggregate -> score -> validate -> AD 3-cohort complete -> THEN frontend repoint.

### 30ao. PAST-CHAT FINDINGS on Community: full formula + the scorer runs on Open Payments ALONE (Medicare not hard-required).
Community formula (methodology page, Pt.17): Patient Volume 40% (Medicare 3yr) + Pharma Engagement 30% (Open
Payments) + Group Practice Signal 15% + Career Years 10% (NPI enumeration) + Publication Signal 5%. GATE: must
have NPI + clinical activity (Open Payments OR Medicare volume) to appear.
CRITICAL PRIOR FINDING (Pt.11, the community dry-run across NSCLC/Hep/RareDisease = 40,178 rows): the scorer
SCORES HCPs WITH patient_volume=0 via OPEN PAYMENTS alone. Rare Disease examples: "pharma=$344K... patient=0
everywhere - scoring high because of Open Payments, not Medicare." => Medicare is NOT a hard requirement; Open
Payments alone qualifies an HCP (patient axis just = 0). Community is "overwhelmingly US" (9 buckets, everyone US)
- matches our 347-NPI ceiling.
Also Pt.11: community derives career stage from NPI ENUMERATION year (not pub year), so career_first_pub_year_v2
fix doesn't affect it. And a "shadow KOL" observation: Rare Disease community had pediatric hem/onc mini-KOLs with
huge pharma $ slipping in (not at AAMC/NCI centers) - real data, a mix of true community + KOL-adjacent.
=> IMPLICATION FOR AD: Community CAN run NOW without AD Medicare codes - AD community HCPs WITH Open Payments will
score (patient=0). But that's a DEGRADED score (the 40% patient-volume axis = 0 for all -> effectively ranking on
pharma 30% + practice 15% + career 10% + pub 5%, renormalized). To get the FULL construct need AD Medicare (the
HCPCS curation). 
TWO PATHS TO GETTING COMMUNITY DONE FOR AD:
  A. RUN NOW on Open Payments only (no Medicare): populate whatever community_scoring needs, run it, get a
     pharma-driven community ranking for the AD US subset (~275 Open Payments HCPs from the established pharma
     work + any community-cohort ones). Fast. Degraded (no patient volume) but SHIPS a community cohort today.
  B. FULL: curate AD/derm HCPCS -> aggregate Medicare -> then score with real patient volume. Better, needs
     Garrett's code curation.
Could do A now (ship a working-but-pharma-only community cohort) and upgrade to B later when HCPCS curated. OR ask
advisor whether patient-volume-less community is worth shipping vs waiting for Medicare.
NEXT: check what community_scoring.py actually REQUIRES to run for AD (does it need hcp_medicare_by_ta_v2 rows to
exist, or does it LEFT JOIN and tolerate patient=0?). If it tolerates missing Medicare -> path A runs TODAY.

### 30ap. NSCLC community = PATIENT-VOLUME construct (Hussein 9,992 patients #1, scope_size 6,480). AD needs Medicare. DRAFT derm HCPCS.
hcp_community_ranks_v2 NSCLC top: Hussein (patient_vol 9,992, pharma 2,830, composite 67.5, #1), Divers (8,981),
Waples (8,979). scope_size 6,480. => NSCLC community is fundamentally PATIENT-VOLUME driven (Medicare 40% axis is
what makes it real + gives 6,480 rankable HCPs). AD w/o Medicare (93 pharma-only) = a degraded stub, NOT the
construct. CONFIRMED: must do the Medicare/HCPCS path for a real AD community cohort.
DRAFT AD/DERMATOLOGY ta_hcpcs_codes (modeled on NSCLC's specialty-match-heavy structure, FOR GARRETT REVIEW):
  SPECIALTY-MATCH E&M (patient-volume backbone = "derm office visits"), category=em, requires_specialty_match=T,
  specialty='%dermatolog%':
    99202,99203,99204,99205 (new patient), 99211,99212,99213,99214,99215 (established)
  SPECIALTY-MATCH PROCEDURES (derm-typical), category=procedure, specialty-match:
    11102-11107 (skin biopsies), 96910/96912/96913 (PHOTOTHERAPY - meaningful for AD), 95044 (patch testing),
    11900/11901 (intralesional injection)
  PRIMARY SIGNAL (AD-specific), category=drug_admin, is_primary_signal=T:
    dupilumab admin - J2356 (current dupilumab J-code; historically J3490/J3590 unclassified). Check if in the
    Part B data at all (mostly self-administered -> may be sparse; the specialty-match E&M carries the volume).
  SPECIALTY PATTERNS: '%dermatolog%' (+ maybe '%allergy%','%immunolog%' since AD is co-managed by allergists).
DESIGN: mostly specialty-match (derm doing derm-typical work = volume proxy), small primary set. "AD community
patient volume" ~= "dermatologist's Medicare footprint" - exact parallel to NSCLC's "oncologist's Medicare
footprint". Sidesteps AD's Part-D self-administered-drug problem.
NEED: NSCLC's actual 41 codes to finalize the analog structure (specialty_match_patterns exact format, category
values, how many primary vs specialty). Paste kept coming empty - get via direct text or screenshot.
NEXT: finalize derm code list (Garrett clinical review) -> INSERT into ta_hcpcs_codes for AD -> run
medicare_aggregator --target-version v2 -> run community_scoring --ta atopic-dermatitis -> validate -> AD 3-cohort
DONE.

### 30aq. ADVISOR (pt1): Community is DISEASE-DEPENDENT. Don't rank it - make it "Community EXPLORER" (search, not score).
Big reframe: not every TA needs identical products = a STRENGTH. The 3 cohorts split by generality:
  - Established (scientific authority) - GLOBAL, works everywhere.
  - Emergence (scientific trajectory) - GLOBAL, works everywhere.
  - Community (clinical reach) - DISEASE-DEPENDENT. And that's OK.
Q1 (Medicare backbone?): NO for AD. Not because Medicare is bad - it measures the WRONG POPULATION. Best AD
clinicians have pediatric practices + commercially-insured patients + self-administered biologics. Medicare
systematically under-represents all three. STRUCTURAL limitation, not an implementation bug. (My skepticism =
correct.)
Q2 (should Community be a ranked scored cohort?): STRONGEST OPINION - build it, but STOP making it a scientific
RANKING. Community is fundamentally different: Established asks "who shapes science?"; Community asks "who is
ACCESSIBLE to the field?" Not comparable constructs. => rename/rethink "Community Score" -> "COMMUNITY REACH" /
"COMMUNITY EXPLORER" = a SEARCH/FILTER tool, not a leaderboard. Filters: specialty, geography, institution,
practice type, publications, Open Payments, Medicare footprint (where available). 
  WHY: an MSL NEVER asks "who's the #17 community dermatologist?" They ask "who should I see in Philadelphia?" /
  "which derms in Boston treat AD?" / "show me high-volume pediatric dermatologists." SEARCH problem, not RANKING
  problem. (This is Option B from my note, strongly endorsed.)
Q3 (better signal?): YES but you don't have it - commercial claims (IQVIA, Symphony, Komodo, Truveta, Optum,
Flatiron). Expensive for a reason - they're the products that solve exactly this. Part D > Part B for AD, but
even Part D misses pediatrics. No cheap fix.
[AWAITING ADVISOR PART 2]

### 30ar. *** ADVISOR (pt2): THE ARCHITECTURAL INSIGHT - FieldMark has TWO kinds of intelligence. Scientific=global, Operational=local. ***
The core realization (bigger than AD Community): NSCLC and AD aren't comparable, and shouldn't produce identical
products.
  NSCLC: provider-driven, infusion-driven, Medicare-heavy, US-centric.
  AD: outpatient, younger, global, self-administered.
=> These NATURALLY produce different products. Embrace it, don't force parity.
STOP promising "every TA has 4 cohorts." START promising: every TA has Scientific Authority + Emergence +
"Community Intelligence WHERE DATA SUPPORTS IT." More honest.
THE ARCHITECTURE (the load-bearing insight): FieldMark has TWO KINDS OF INTELLIGENCE -
  SCIENTIFIC INTELLIGENCE (Established + Emergence): naturally GLOBAL. Publication-derived. Ranked. Always.
  OPERATIONAL INTELLIGENCE (Community): naturally LOCAL/REGIONAL. Discovery/search. Built only where high-quality
    local data exists.
Forcing them into identical scoring systems is WHAT KEEPS CREATING THESE UNCOMFORTABLE CONVERSATIONS (pharma-
display, trial-defer, and now community). The tension was never a bug to fix - it was the wrong frame. Scientific
= global by nature; Operational = local by nature.
THE PRODUCT DECISION (advisor's explicit recommendation):
  - Established: global, ranked, scientific evidence. Always.
  - Emergence: global, ranked, scientific evidence. Always.
  - Community: an OPERATIONAL DISCOVERY LAYER, not a universal ranking. Where robust local data exists (US onc +
    Medicare) -> provide rankings. Where it doesn't (global AD) -> rich SEARCH + FILTER + PROFILING, WITHOUT
    implying a precision ranking the data can't support.
COMMUNITY EXPLORER model (AD): geographic drill-down - Philadelphia -> Dermatology -> AD -> community physicians,
sorted/filtered by Open Payments / publications / practice size / academic affiliation / clinical trials.
Enormously useful, requires NO pretending Medicare is perfect. MSLs ask "who should I see in Philadelphia?" not
"who's #17" - a SEARCH problem.
=> More sophisticated product: acknowledges different TAs have different data ecosystems while keeping core
scientific capabilities consistent. From a Medical Affairs POV, MORE CREDIBLE than stretching one methodology to
fit every disease. This is the data-availability-nimbleness principle (§29ae) elevated to PRODUCT ARCHITECTURE.

### 30as. Community Explorer DATA GAP = NPPES enrichment. US filter dimensions almost entirely EMPTY. Ingestion identified.
Coverage of AD community (9,562), focus US (intl not a concern per Garrett):
  has_npi 347 | has_specialty 92 | has_city 8 | has_state 954 | has_practice_setting 0 | has_institution 9,525
  (from PUBS not practice) | has_country 8,596 | has_pubs 9,562.
=> The Explorer's CORE filters (specialty, city, practice setting) are almost entirely MISSING. Can't build
"dermatologists in Philadelphia" with 8 cities + 92 specialties. This is an NPPES ENRICHMENT gap.
ROOT: community HCPs entered via PUBLICATIONS (institution + pubs rich) but were NEVER NPPES-enriched (NPI/
specialty/city/practice-setting empty). Established/Rising didn't need practice location; Community Explorer does.
INGESTION TO RUN: NPPES enrichment for the AD community cohort. Script exists: scripts/enrich/community_nppes_
backfill.py. Keys on name+institution/geography -> NPI -> pulls specialty, taxonomy, practice city/state/setting.
This is THE enabling ingestion for the Explorer - run it to populate the filter dimensions.
CEILING TO EXPECT: NPPES only covers US providers. The AD community cohort is majority intl -> only the US subset
will match. Realistic yield: maybe 500-1,500 NPI matches (the US-practicing AD community docs). That's fine - the
Explorer is a US operational tool; the US subset is the addressable population. Intl HCPs remain in the scientific
cohorts (Established/Emergence) where they belong.
NEXT: (1) check community_nppes_backfill.py - is it --ta scoped? what does it match on? does it need an NPPES
data file/API? (2) run it for AD community -> populate NPI/specialty/city/practice-setting. (3) re-check coverage
-> that's the Explorer's real filterable population. (4) THEN build the Explorer UI over the enriched data.
This is the ingestion to kick off NOW (per Garrett - get it going in background) so the Explorer build isn't
blocked later.

### 30at. community_nppes_backfill.py enriches HCPs that ALREADY HAVE an NPI - doesn't FIND NPIs. The gap is upstream: NPI RESOLUTION.
The script: select_community_hcps filters WHERE cohort='community' AND npi_number IS NOT NULL, then calls NPPES
API BY NPI (?number={npi}) to pull specialty/city/practice-setting/taxonomy into hcps_v2 + hcp_nppes_detail_v2.
=> It takes an EXISTING NPI and fills detail. It does NOT find/resolve NPIs from names.
BLOCKER: only 347 of 9,562 AD community HCPs HAVE an NPI. This script enriches at most those 347 (some already
done). Can't touch the other 9,215 - no NPI to query.
THE REAL GAP = NPI RESOLUTION (one step upstream): name + institution/geography -> NPI. A fuzzy NPPES-by-name
search + disambiguation. DIFFERENT problem than detail enrichment:
  - NPI detail enrichment (this script): NPI -> specialty/city/practice. EXISTS, works, needs the NPI.
  - NPI RESOLUTION (missing): name+institution -> NPI. Fuzzy name search against NPPES, needs disambiguation
    (common names -> multiple NPIs; the derived_state/institution helps disambiguate but many lack state).
So the Explorer ingestion is TWO steps: (1) resolve NPIs for the AD community cohort (the missing piece), (2)
run community_nppes_backfill to enrich detail. Step 1 is the real work + the real question.
CEILING REALITY: NPPES is US-only. AD community is majority intl. NPI resolution will only succeed for US-
practicing HCPs - realistically a few hundred to ~1-2k. That IS the Explorer's addressable US population (fine -
Explorer is a US operational tool). But name-only NPI matching is NOISY (wrong-NPI risk) - needs conservative
confidence + ideally state/institution disambiguation, which much of the cohort lacks.
NEXT: (1) does an NPI-RESOLUTION script exist (name->NPI), separate from the detail-enrichment one? Search for
npi resolve/match/search/lookup. (2) if yes - run it (resolve NPIs) then the backfill (enrich). (3) if no - it's
a build: NPPES name-search API (npiregistry ?first_name=&last_name=&state=) + confidence matching. That's the
ingestion to get going. Check for the resolver first.

### 30au. SEQUENCING ISSUE (Garrett-flagged): NPI enrichment was demand-driven, never cohort-wide. Community classified before its data exists.
Why NPI wasn't enriched for the whole class at onset - the defensible original logic:
  - Pipeline is PUBLICATION-FIRST. HCPs enter via OpenAlex/PubMed (they authored papers). NPI/NPPES is a US-
    clinical identity layer bolted on after.
  - For the SCIENTIFIC cohorts, NPI is nearly irrelevant - Established/Emergence score on pubs/authorship/
    citations/network, none need NPI. Enriching NPI across 200K+ HCPs upfront = huge API cost/time for data the
    scientific product doesn't use.
  - So NPI enrichment was DEMAND-DRIVEN: done only where needed (Open Payments matching keys on NPI; that's
    likely how the 347 community HCPs got NPIs - a byproduct of pharma matching, not a deliberate NPI-resolution
    pass).
THE ACTUAL FLAW (the sequencing bug): cohort classification runs BEFORE the data Community NEEDS exists. We
classify 9,562 HCPs as "community" on CAREER STRUCTURE (thin TA pubs + career age), but Community is DEFINED as
the clinical-reach cohort - and we have almost no clinical-reach data for them (NPI resolution never ran on that
cohort). We named a cohort after a construct we didn't ingest the data for.
THE FIX (pipeline ordering): NPI RESOLUTION should be TRIGGERED BY community classification. Once an HCP is
classified Community, they are US-clinical-relevant by the cohort's definition -> resolve their NPI (name+
institution -> NPPES) -> then community_nppes_backfill enriches detail -> THEN the Community construct has data.
Sequence: classify -> (if community) resolve NPI -> enrich NPPES detail -> build Explorer.
=> This is why the Explorer is blocked: the NPI-resolution step doesn't exist as a pipeline stage. It was never
needed for scientific cohorts, and Community's data need was never wired into the classification flow.
For AD specifically: this is the ingestion to build/run - NPI resolution for the AD community cohort. Realistic
yield is a few hundred to ~1-2k (US subset, name-match confidence limited). CEILING is real (intl HCPs have no
NPI; name-only match is noisy w/o state). But it's THE enabling step for the Explorer.
BROADER: bake NPI-resolution-on-community-classification into the pipeline (playbook) so future TAs don't hit
this. Community's data spine (NPI -> NPPES -> practice location/specialty) must be resolved AT classification,
not assumed.

### 30av. CORRECTION: NPPES RESOLUTION TOOLKIT ALREADY EXISTS. Not a build - a run-for-AD-community. + gap audit utility.
The resolver DOES exist (my §30at/30au "it's a build" was wrong). Existing NPPES subsystem:
  - nppes_matcher.py = the name->NPI RESOLVER (the missing step we thought didn't exist)
  - nppes_filter.py + nppes_workstream_b_ingest.py/_dryrun.py = BULK NPPES ingestion workstream (implies the
    NPPES bulk file is available/loadable, not just the API - bulk matching >> API name-search for yield)
  - npi_gap_audit.py = a UTILITY that audits exactly this NPI gap
  - targeted_nppes_enrichment.py, nppes_api_backfill.py, community_nppes_backfill.py = enrichment paths
  - nppes_matcher, map_nppes_to_ror (institution matching), institution_nppes_validation, nppes_diagnostic
=> The Explorer's enabling ingestion is NOT a build - it's running the EXISTING resolver for the AD community
cohort. The subsystem exists; it just never ran against AD community (the demand-driven sequencing, §30au).
Open Payments NPI lift = only 104 community HCPs (< the 347 already have) - no free lift there. Bulk/fuzzy NPPES
matching via nppes_matcher is the path, and the tooling is built.
NEXT: (1) run npi_gap_audit.py - it should quantify the gap + matchable population (purpose-built for this).
(2) inspect nppes_matcher.py - what it keys on (name+state+institution+specialty?), confidence threshold, whether
--ta/cohort scoped, bulk-file vs API. (3) run nppes_matcher for AD community -> resolve NPIs -> community_nppes_
backfill -> enrich detail -> Explorer has data.
This is the ingestion to kick off. Existing tooling = much faster than feared. Check the audit + matcher, then run.

### 30aw. npi_gap_audit.py reads the V1 table `hcps` (not hcps_v2) - the NPPES toolkit is (at least partly) V1-ERA.
The audit's query: GET /rest/v1/hcps?select=id,first_name,last_name,institution_short,city,state,country,
total_career_pubs,npi_number,merge_category&npi_number=is.null&state=not.is.null&country=eq.USA. 
RED FLAGS: table = `hcps` (V1), NOT hcps_v2. Columns institution_short / city / merge_category DON'T EXIST on
hcps_v2 (v2 uses institution_normalized, nppes_practice_city, derived_state). So npi_gap_audit is a V1-ERA
utility auditing the OLD hcp table - its gap numbers do NOT reflect the v2 AD community cohort. (Read-only, no
harm - just querying.)
IMPLICATION: the NPPES toolkit (nppes_matcher, gap audit, workstream_b, etc.) is AT LEAST PARTLY V1-ERA. Same
pattern as the rising momentum pipeline (ran on old classifier) + the _v1 output tables. These scripts predate
the v2 rebuild.
=> Running nppes_matcher UNATTENDED is now clearly WRONG: if it's v1 (reads/writes `hcps` not hcps_v2, matches
against the stale v1 population), it could (a) write NPIs to the wrong table, (b) match against wrong/stale HCPs,
(c) not even touch the v2 AD community cohort we care about. Confirms: NPI resolution is a SUPERVISED, v2-
verification-first operation, NOT a fire-and-break.
BEFORE running any NPPES matcher for AD community: VERIFY it's v2-compatible (reads hcps_v2 + hcp_cohort_
classification_v2, writes hcps_v2.npi_number). If v1 -> needs the same v2 retrofit the other v1-era scripts
needed. This is next-session supervised work.
NPI RESOLUTION STATUS: toolkit exists BUT is v1-era (needs v2-compat check/retrofit before use). Not a
fire-and-forget. The Explorer's enabling ingestion is: (1) verify/retrofit nppes_matcher to v2, (2) supervised
dry-run scoped to AD community, (3) eyeball match quality (wrong-NPI = high risk, false-match class like dedup),
(4) execute in watched batches. NEXT SESSION.

### 30ax. nppes_matcher.py READ (screenshots): it's V1 (reads `hcps`) BUT SAFE - writes PROPOSALS not NPIs. Well-built, conservative.
Full read of nppes_matcher.py:
  - V1: fetch_unmatched_hcps reads supabase.table("hcps") WHERE country=USA AND npi_number IS NULL. Targets OLD
    table, not hcps_v2. (The retrofit gap - it won't see the v2 AD community cohort.)
  - *** SAFE BY DESIGN: it does NOT write NPIs to any HCP table. It writes to npi_match_proposals (a REVIEW QUEUE)
    with tier/confidence/status. It's a PROPOSAL GENERATOR, not an applier. *** My "could corrupt identity layer
    unattended" fear was overblown for THIS script - it only proposes; a human applies later.
  - Loads NPPES from BULK PARQUET: r"C:\...\FieldMark\NPPES\nppes_individual_providers.parquet" (on disk). Bulk
    match >> API. Good.
  - MATCH TIERS (conservative, false-match-disciplined):
    Tier 1 (conf 95, matched_high): exactly 1 candidate on name+STATE. Unambiguous.
    Tier 2 (conf 85, matched_medium): multiple state candidates, disambiguated by first name.
    Tier 3 (conf 50-70, review_pending): state missing, name-only, <=5 candidates.
    Tier 4 (ambiguous/no_match): >5 candidates or 0 -> flagged, NO false match forced.
    Keys on name+state; when it can't disambiguate it says "ambiguous", doesn't guess. Exactly the discipline
    we'd want (false-match class like dedup).
VERDICT: the matcher is well-built + SAFE (proposals only). The ONLY issue is it's V1 (reads `hcps`). To use for
the v2 AD community cohort: retrofit fetch_unmatched_hcps to read hcps_v2 (+ optionally scope to cohort=
'community' via hcp_cohort_classification_v2), and confirm the write target npi_match_proposals is consumed by a
v2 applier. The MATCHING LOGIC needs no change - just the source table.
=> This is a small, clean retrofit (one function's table + columns: hcps->hcps_v2, city/state/first_name/
last_name -> v2 equivalents). Then: run -> proposals land in npi_match_proposals -> REVIEW (Tier 1/2 high-conf
auto-appliable, Tier 3 human review, Tier 4 discard) -> apply approved NPIs to hcps_v2 -> community_nppes_backfill
enriches detail -> Explorer has data.
NEXT SESSION: retrofit nppes_matcher source table to hcps_v2 + community scope -> dry-run -> run (safe, proposals
only) -> review proposals -> apply. Since it's proposals-only, even running it is low-risk once pointed at v2.

### 30ay. Matcher dry-run: 676 eligible, only 30 Tier1+2, but 604 NO_MATCH (89%) - SUSPICIOUSLY HIGH. Likely state-format bug.
AD community NPI matcher dry-run (retrofitted to v2): 676 eligible (US, state-set, no NPI). Tier1 29, Tier2 1
(30 auto-appliable), Tier3 0, Tier4 646 (604 no_match, 42 ambiguous).
RED FLAG: 604 no_match / 676 = 89%. "no_match" = ZERO NPPES candidates for name+state. But every practicing US
physician HAS an NPI - an 89% no-match rate for US-state HCPs is TOO HIGH to be real. Suggests a MATCHING bug,
not genuine absence.
SUSPECTED CAUSE (ranked):
  1. STATE FORMAT MISMATCH (most likely): matcher keys name+state. If HCP derived_state = full name
     ("Pennsylvania") but NPPES parquet practice_state = abbreviation ("PA") - or reversed - EVERY state compare
     fails -> no_match. Classic silent join-killer. Consistent with near-total no_match + the 30 that DID match
     (those happened to have aligned state format, or matched some other way). The matcher machinery WORKS (30
     Tier1/2 prove it) - so it's a data-format issue on the state key, not broken logic.
  2. Name normalization (suffixes/middle/accents) mismatch.
  3. Some community HCPs are genuine non-US-clinical (PhDs, intl-trained researchers) w/o NPI - but wouldn't
     explain 89%.
CHECK BEFORE ACCEPTING THE 30: (a) what format is hcps_v2.derived_state / nppes_practice_state (full name vs
2-letter)? (b) what format is the NPPES parquet practice_state column? If they differ -> normalize one side ->
re-run -> expect no_match to plummet + Tier1/2 to jump from 30 to hundreds. The 89% no_match is almost certainly
recoverable, like the rising linkage was.
DON'T APPLY the 30 yet - if state-format is the bug, the full run yields far more, and we want the complete
proposal set before reviewing/applying.

### 30az. 89% no_match EXPLAINED - the AD community cohort is full of ACADEMIC RESEARCHERS (hepatologists!), not US clinicians. Not a matcher bug.
The 10 top-pub no-match community HCPs: Vijay Shah (Mayo, hepatology), Ramon Bataller (Pittsburgh liver), Anna
Mae Diehl (Duke hepatology), M. Eric Gershwin (UC Davis, autoimmune LIVER disease), Gyongyi Szabo (BIDMC liver),
Phillip Hylemon / Huiping Zhou (VCU, bile acid/liver), Kupiec-Weglinski (UCLA transplant). => THESE ARE
HEPATOLOGY / LIVER RESEARCHERS, not AD community physicians.
ROOT: TA-anchoring (§0d) correctly moved cross-TA passengers (hepatologists w/ thin AD pubs) OUT of established/
rising INTO community. But community is now full of ACADEMIC RESEARCHERS - PhDs/research-MDs who (a) don't bill
Medicare, (b) have no clinical NPI, (c) aren't US-practicing providers. Their "no_match" is CORRECT - they
genuinely aren't in NPPES as practicing clinicians. NOT a state-format bug, NOT a parquet-filter bug, NOT a name
bug. The cohort CONTENT is the issue.
=> The 30 that matched (Tier1/2) are likely the ACTUAL US-practicing clinicians in the community cohort. The
604 no-match are mostly researchers who shouldn't be treated as "community clinicians" at all.
REFRAME - "community" is doing DOUBLE DUTY it shouldn't: it's currently a CATCH-ALL for "not established, not
rising" = a mix of (a) genuine US community PRACTITIONERS (the Explorer's target, ~hundreds) + (b) cross-TA
ACADEMIC researchers demoted by TA-anchoring (thin AD pubs but real scientists elsewhere) + (c) genuine early/
low-output people. The Explorer only wants (a).
IMPLICATION FOR THE EXPLORER: the addressable population isn't 9,562 or even 676 - it's the subset that are
actually US CLINICAL PROVIDERS (have/can-get an NPI). That's the ~30 clean matches + however many of the 347
already-NPI'd community HCPs are real clinicians. Small - consistent w/ AD being intl + the Explorer being a
US operational tool. The no-match researchers should arguably NOT be in "community" - they're cross-TA scientists
(their AD footprint is just thin). 
FUTURE COHORT REFINEMENT: "community" should distinguish US-CLINICAL-PRACTITIONER (NPI, billing, practice) from
CROSS-TA-RESEARCHER (has real science, just not in THIS TA). Currently conflated. The Explorer wants only the
former. Possibly: community practitioners = has NPI + clinical taxonomy; the rest are "peripheral/cross-TA" not
"community". (Ties to the durability/authority-gate discussion §30ae/ag - cohort DEFINITIONS need a cleanup pass.)
NEXT: the matcher is working CORRECTLY. The 30 Tier1/2 are real. Question is whether ~30 + existing-NPI community
clinicians is enough of a US AD clinical population to seed an Explorer, OR whether AD's US clinical community is
genuinely too thin to be worth it (which would itself be a valid finding: AD is intl + pediatric, US Medicare-
billing community derms are a small set). CHECK: of the 347 community HCPs WITH an NPI, how many have a
dermatology/clinical taxonomy? That + the 30 = the real Explorer seed.

### 30ba. *** DEFINITIVE: the AD community cohort contains ~2 dermatologists. The US community derms were NEVER INGESTED. ***
347 NPI-having community HCPs by specialty: 255 null, 16 Gastroenterology, 11 students, 8 Internal Medicine, 4
Transplant Surgery, 4 Oncology, 3 Infectious Disease, 3 Cardiology... DERMATOLOGY: 2. TWO.
=> Even among NPI'd community HCPs, the specialty mix is GI/transplant/onc/IM (cross-TA researcher spillover:
hepatology->GI/transplant, NSCLC->onc) + unrelated noise (dentist, addiction counselor, nurse anesthetist,
dietitian = mismatched/bad NPI matches). The actual DERMATOLOGY clinical community is ~NONEXISTENT here.
THE STRUCTURAL ROOT (bigger than the matcher): FieldMark's AD population entered via PUBLICATIONS. That captures
ACADEMIC dermatologists (KOLs -> established/rising) + cross-TA researchers, but NOT the COMMUNITY PRACTICE
dermatologist who treats AD patients and doesn't publish. A community derm in Tulsa seeing 200 AD patients, never
wrote a paper -> NO publication -> never entered the system. The pipeline STRUCTURALLY CANNOT SEE community
practitioners because they have no publications.
=> An "AD Community Explorer" built on the current data would surface ~2 derms + a pile of misclassified
researchers. NOT viable. The community-PRACTITIONER population doesn't exist in FieldMark - it was never ingested,
and CAN'T be via the publication-first pipeline.
THIS IS THE DEEP VERSION OF THE ADVISOR'S POINT (§30ar): scientific intelligence (pubs) is global + is what
FieldMark HAS. Operational intelligence (community practice) requires a DIFFERENT INGESTION SPINE ENTIRELY - you'd
seed community practitioners FROM NPPES (all US dermatologists) or claims, NOT from publications. The Explorer
isn't blocked on NPI-resolution of the existing cohort; it's blocked on the fact that the RIGHT PEOPLE AREN'T IN
THE DATABASE AT ALL.
TO BUILD AD COMMUNITY EXPLORER PROPERLY (future, real ingestion): seed FROM NPPES - pull ALL US dermatologists
(+ pediatric derm, allergy/immunology) by taxonomy, as a SEPARATE population from the publication-derived HCPs.
That's an NPPES-first ingestion (taxonomy = Dermatology), independent of publications. THEN layer Open Payments /
any claims. This is a distinct data pipeline, not a fix to the current cohort.
=> AD Community, done right, is a NEW INGESTION PROJECT (NPPES-derived derm directory), not a scoring/matching
task on the existing cohort. Correctly a future effort. The 2 scientific cohorts remain AD's complete, shipped core.
DECISION: stop the NPI-matcher thread - it's resolving the wrong population. The finding (community practitioners
aren't ingested + can't be via pubs) is the real deliverable. Kill the 30-match apply - not worth it for 2 derms
+ noise. Next: advisor/strategic - is an NPPES-first derm directory worth building for AD, or is Community simply
a US-centric-TA feature (NSCLC has it via Medicare) that AD doesn't get until that ingestion exists?

### 30bb. *** 17,274 US DERMATOLOGISTS in the NPPES parquet. The AD Community population EXISTS - just never ingested. ***
NPPES parquet taxonomy_1 startswith '207N' (Dermatology): 17,274 total.
  207N00000X general Dermatology 14,623 | 207ND0101X MOHS/procedural 1,119 | 207NS0135X MOHS surgery 675 |
  207ND0900X Dermatopathology 572 | 207NP0225X PEDIATRIC DERMATOLOGY 223 (matters most for AD) | 207NI0002X
  Derm Immunology 62.
=> The entire US dermatology workforce is IN THE PARQUET. Community practitioners were never MISSING from the
world - just never INGESTED (publication-first pipeline only pulled publishers). This is the population the
Explorer needs. Community for AD goes from "impossible" -> "one NPPES-first ingestion away."
Parquet schema (from the error dump) - real columns: npi, entity_type_code, last_name, first_name, middle_name,
name_suffix, credentials, practice_address/city/state/zip/country_code/phone, enumeration_date, sex_code,
taxonomy_1..5 + primary_taxonomy_switch_1..5, is_sole_proprietor. Taxonomy is a CODE (207N...), not a label.
THE BUILD (NPPES-first community ingestion for AD dermatology):
  1. Filter parquet to derm taxonomy (207N* in any taxonomy_1..5, primary preferred) -> ~17k US derms (+ maybe
     allergy/immunology 207K* for AD co-management, TBD).
  2. Ingest as a SEPARATE community-practitioner population into hcps_v2 (or a dedicated community table) - NPI,
     name, practice city/state/zip, taxonomy/specialty, enumeration date (career stage). These are NPPES-native
     (NPI known, practice location known) - NO name-matching needed (they come WITH their NPI). Sidesteps the
     entire resolution problem.
  3. Classify them into AD community (they're derms -> AD-relevant by specialty). Tag cohort=community, ta=AD.
  4. Layer Open Payments (join on NPI) for pharma engagement where present.
  5. Build Community EXPLORER: filter/search by state/city/subspecialty (pediatric derm!)/practice setting/Open
     Payments. This is the operational discovery tool the advisor described - now with REAL data.
KEY DESIGN Q: do these NPPES-seeded derms MERGE with the existing publication-derived AD HCPs (a KOL derm who
also has an NPI = one person) or stay a separate population? MUST dedup on NPI - the academic derms already in
hcps_v2 (established/rising) will overlap with the NPPES pull. Join on NPI to avoid duplicating the KOLs as
"community". The NON-overlapping NPPES derms = the pure community practitioners (the new population).
NEXT: (1) how many of the 17,274 derms overlap existing hcps_v2 NPIs (the KOLs) vs are net-new community? (2)
decide the ingestion target (hcps_v2 vs dedicated community_practitioners table). (3) build the ingest.

### 30bc. CONFIRMED: FieldMark has ~50 derms; parquet has 17,274. ~17,200 net-new. NPI join clean. This IS the community build.
Facts: (1) parquet NPI = 10-digit string ('1619970639'), matches hcps_v2.npi_number (text) - clean join. (2)
hcps_v2 has ~50 dermatologists total (42 Dermatology + variants) of its 49,298 NPI'd HCPs. The 49K are onc/hep/
other-TA. => the 17,274 parquet derms are ~17,200 NET-NEW. FieldMark captured ~50 academic derms (KOLs), missed
the ENTIRE US clinical derm workforce (they don't publish). Thesis fully confirmed.
THE COMMUNITY BUILD (NPPES-first, no name-matching - they come WITH NPI):
  1. Filter parquet: taxonomy_1 startswith '207N' (derm) -> 17,274. (Consider also taxonomy_2..5 for derms whose
     primary is something else; + optionally allergy/immunology 207K for AD co-mgmt - decide later.)
  2. Dedup on NPI vs hcps_v2 (only ~50 overlap = existing academic derms - flag, don't duplicate). ~17,200 net-new.
  3. Ingest net-new derms into hcps_v2 (or dedicated table) with: npi, name, practice city/state/zip, taxonomy->
     specialty, enumeration_date->career stage, sex. NPPES-native = NPI + location known, NO resolution needed.
  4. Classify as AD community (cohort=community, ta=AD) - they're derms, AD-relevant by specialty. (Design Q:
     are ALL US derms "AD community" or only those with an AD signal? A general derm treats AD - reasonable to
     include all derms as AD-community-eligible, since AD is bread-and-butter derm. Pediatric derm 223 especially.)
  5. Layer Open Payments on NPI (pharma engagement where present).
  6. Build Community EXPLORER: filter by state/city/subspecialty (pediatric derm)/practice setting/Open Payments/
     sole-proprietor. The operational discovery tool, real data.
DECISIONS TO MAKE:
  - Ingest target: extend hcps_v2 (unified) vs dedicated community_practitioners table (keeps 17K non-publishing
    providers separate from the publication-derived scientific corpus). LEAN: dedicated table or a clear
    source/type flag - these are a fundamentally different population (clinical, non-publishing) and mixing 17K
    non-scientists into hcps_v2 could pollute scientific queries/counts. Flag source='nppes_community'.
  - Scope: all 17,274 US derms as AD community? Or gate somehow? (AD is core derm -> all derms plausibly treat
    AD -> include all as the AD community directory. This is a DIRECTORY not a ranking, per advisor - inclusion
    is fine, the Explorer filters.)
  - Career stage from enumeration_date (NPI year), matching how community_scoring derived it.
NEXT: decide ingest target (dedicated table recommended) -> build the parquet-filter-and-ingest -> classify ->
Explorer. This is a real, clean, achievable build. The community population finally exists.

### 30bd. SEQUENCING DOCTRINE (consolidated) - the AD build's dependency lessons, learned by hitting walls. FOR THE PLAYBOOK.
Every "why is this empty/wrong/collapsed" this build traced to a step that logically needed to happen EARLIER.
The canonical dependency order (each MUST precede the next), with the wall we hit when it didn't:
  1. INGEST publications (canonical path, no HCP-row creation) -> the corpus.
  2. DEDUP / identity resolution BEFORE any scoring. [Wall: scored fragmented identities, re-derive chain.]
  3. CORPUS LINKAGE for ALL TA HCPs (Step F --hcp-ids-file=all, NOT --only-new). [Wall: 864 established KOLs
     under-linked (Guttman-Yassky 6 links); rising momentum collapsed to 14.]
  4. DERIVE authorship position (is_first/is_senior) BEFORE scientific scoring. [Wall: dead scorer signal, silent
     zeros.]
  5. TA-ANCHORING inside classification for EVERY cohort (established AND rising need the ta_pubs gate). [Wall:
     hepatologists in established; fixed; then SAME bug in rising - fixed twice.]
  6. CLASSIFY into cohorts (established/rising/community) - AFTER 2-5, so classification sees clean linked
     identities.
  7. OPERATIONAL-IDENTITY RESOLUTION (NPI/NPPES) must be wired to COMMUNITY classification, not demand-driven.
     [Wall: community classified as "clinical reach" before ANY clinical identity data existed -> discovered the
     community PRACTITIONERS were never ingested at all (publication-first can't see non-publishers).]
  8. SCHEMA/DDL: column types correct AT CREATE time (percentile = double precision, grants + NOTIFY committed).
     [Wall: integer percentile ceiling bug cost hours; missing grants stopped classifier mid-run.]
  9. SCORE (component scorers) -> COMPOSITE -> VALIDATE against domain truth.
META-LESSON: FieldMark's pipeline grew cohort-by-cohort + signal-by-signal, so dependencies were discovered by
BREAKING, not declared upfront. TA #3 should follow this declared order. The two INTELLIGENCES have DIFFERENT
spines that must be sequenced independently:
  - SCIENTIFIC (established/emergence): publication corpus -> dedup -> link -> authorship -> TA-anchor -> classify
    -> score. Global.
  - OPERATIONAL (community): NPPES-FIRST ingestion (by specialty taxonomy) -> dedup on NPI vs scientific corpus
    -> classify -> Open Payments -> Explorer. US/local. This spine was MISSING entirely (community practitioners
    never ingested) - the biggest sequencing gap of the whole build.
=> ADD to TA_NEW_PLAYBOOK as the canonical build sequence + the two-spine split. This is the highest-leverage
process learning of the AD build.

### 30be. Community derm ingestion dry-run VALIDATED: 19,351 US derms, 19,009 net-new. Executing.
Dry-run (all-5-taxonomy-slots): 19,351 total US dermatologists (vs 17,261 taxonomy_1-only; +2k from slots 2-5).
Matched to existing hcps_v2 (by NPI): 342 (the academic-derm overlap - KOLs + derms whose npi_specialty was null
but are in corpus). Net-new: 19,009 = the community derm population that was NEVER in FieldMark.
Taxonomy: Dermatology 16,275 | Procedural 1,480 | MOHS 690 | Dermatopathology 591 | PEDIATRIC DERM 259 | Derm
Immunology 56. Coherent = real US derm workforce shape.
States: CA 2,555, FL 1,563, NY 1,479, TX 1,390, PA 816, IL 742, MA 716, OH 615, NC 605, MI 565. Textbook US derm
density by population. Real.
All checks pass. EXECUTE -> community_practitioners. This is the OPERATIONAL SPINE finally built: 19k real US
dermatologists, NPPES-native (NPI+location+specialty), 342 linked to the scientific corpus, 19k net-new community
practitioners. The population that publication-first structurally couldn't see.
AFTER EXECUTE: (1) layer Open Payments on NPI (pharma engagement per derm where present). (2) build Community
EXPLORER (filter by state/city/subspecialty[pediatric derm]/practice-setting/Open-Payments/sole-proprietor) - the
operational discovery tool. (3) playbook capstone (fold §30bd sequencing doctrine + two-spine architecture into
TA_NEW_PLAYBOOK).

### 30bf. *** OPERATIONAL SPINE LIVE. community_practitioners: 19,351 US derms (19,009 net-new, 259 peds, 56 states). ***
Executed. Confirmed: 19,351 total / 342 matched-to-hcps_v2 / 19,009 net-new / 56 states / 259 pediatric derm.
Exactly matches dry-run. FieldMark now has TWO INTELLIGENCES physically in the DB:
  - SCIENTIFIC: hcps_v2 (publication-derived KOLs/researchers; established + emergence).
  - OPERATIONAL: community_practitioners (NPPES-derived practicing US dermatologists; the Explorer population).
  Linked on NPI (342 overlaps = academic derms who are both).
The population publication-first structurally could NOT see (non-publishing community derms) is now ingested.
This closes the biggest architectural gap of the AD build.
REMAINING FOR AD COMMUNITY:
  1. Open Payments layer: join community_practitioners.npi_number -> Open Payments -> pharma engagement per derm
     (most will have none; the ones with industry ties light up = a useful filter signal). Backend, quick.
  2. Community EXPLORER UI: filterable directory - state/city/subspecialty(pediatric derm)/practice-setting/
     Open-Payments/sole-proprietor. The operational discovery tool. Frontend (backend now ready for it).
  3. PLAYBOOK CAPSTONE: fold §30bd sequencing doctrine + two-spine architecture into TA_NEW_PLAYBOOK.
AD STATUS: Established (shipped) + Emergence/Rising (shipped) + Community (operational spine LIVE, Explorer +
Open-Payments layer remain). All three cohorts now have real data. The 3-cohort model complete-in-substance for
a 2nd, very different TA - across scientific (global) AND operational (local) intelligence.

### 30bg. Open Payments parquets on disk + HAVE NPI. Clean join to community derms. Pharma layer = tractable aggregation.
OpenPayments folder: raw OP_DTL_GNRL_PGYR2022/23/24 (~7-8GB each) + pre-filtered op_general_pgyr2022/23/24.parquet
(~200MB each). Same pattern as Medicare (local, parquet-filtered).
CRITICAL: op_general parquet HAS `npi` column. Schema: record_id, program_year, npi, recipient_first/middle/last_
name, recipient_state, specialty_primary, manufacturer_name, payment_amount_usd, payment_date, nature_of_payment,
dispute_status, drug_slot, drug_indicator, drug_name, drug_ndc. 12.2M rows (2024 alone).
=> CLEAN NPI JOIN to community_practitioners.npi_number. NO name-matching, NO Profile_ID crosswalk needed. Same
frictionless pattern as the NPPES derm pull. (Note: this NPI-keyed parquet is likely also how the existing hcp_
open_payments_v2 tables were built - NPI join to hcps_v2.)
PHARMA LAYER BUILD (community derm Open Payments aggregation):
  1. Read op_general_pgyr2022/23/24.parquet, filter to npi IN (community_practitioners NPIs) - 19,351 NPIs, most
     will have 0 payment rows (regular practicing derms), the industry-engaged ones light up.
  2. Aggregate per NPI (3yr): total_payments_usd, payment_count, distinct_manufacturers, distinct_drugs, by
     nature_of_payment (consulting/speaker/food/etc.), top manufacturers, top drugs, yoy trend.
  3. Optionally AD-relevant drug filter (dupilumab/Dupixent, upadacitinib/Rinvoq, abrocitinib/Cibinqo,
     tralokinumab/Adbry, lebrikizumab, ruxolitinib/Opzelura, JAK/IL-13/IL-4 class) -> AD-specific pharma
     engagement vs all-pharma. (drug_name available.)
  4. Write to a community_practitioner_payments table (keyed on npi, parallel to community_practitioners).
  5. Explorer filter: "has industry ties" / payment tier / specific-manufacturer / AD-drug engagement.
DESIGN NOTE: most of 19k derms will have NO Open Payments (typical practicing derm) - that's fine + expected. The
subset WITH payments = the higher-engagement community targets (an MSL signal). The absence is also signal
(greenfield).
NEXT: (1) confirm the existing hcp_open_payments_v2 pipeline's aggregation logic (reuse as template - it did this
for hcps_v2 HCPs). (2) build community_practitioner_payments aggregation (filter parquet by community NPIs ->
aggregate -> write). (3) then Explorer over community_practitioners + payments.

### 30bh. AD drug list finalized (12) + ADVISOR: make it a ta_drug_keywords TABLE, not hardcoded. Config-not-code (like ta_hcpcs_codes).
AD DRUG LIST (12, for ad_drug_payments filter):
  Biologics: Dupixent/dupilumab, Adbry|Adtralza/tralokinumab, Ebglyss/lebrikizumab, Nemluvio/nemolizumab.
  Oral JAK: Rinvoq/upadacitinib, Cibinqo/abrocitinib.
  Topicals: Opzelura/ruxolitinib, Eucrisa/crisaborole, Vtama/tapinarof, Zoryve/roflumilast, Protopic/tacrolimus,
  Elidel/pimecrolimus.
  EXCLUDE (advisor): off-label immunosuppressants (cyclosporine/MTX), psoriasis therapies, asthma biologics,
  pipeline agents. -> highly specific AD signal, minimizes false positives from broad-practice derms/allergists.
ALIAS SCHEMA (advisor, future-proof): per drug {canonical, generic, brands[], aliases[], active, approval_status}
- room for regional brands, misspellings, formulation variants without parser changes.
MATCHING: normalize (lowercase, strip punct, collapse whitespace) THEN case-insensitive substring on drug_name
vs generic+brands+aliases. Sufficient for Open Payments free-text drug_name.
*** ARCHITECTURAL (advisor, ties to §30bd sequencing doctrine): DON'T hardcode drugs in the enrichment script.
Create a ta_drug_keywords TABLE (exactly like ta_hcpcs_codes). Columns: therapeutic_area_id, canonical_name,
generic_name, brands[], aliases[], active, approval_status. Every TA populates its rows; the enrichment code is
written ONCE, never changes. This is the config-not-code principle (same as ta_hcpcs_codes for Medicare) applied
to the operational/pharma spine. ***
BUILD ORDER: (1) create ta_drug_keywords table. (2) populate AD's 12 drugs. (3) aggregate_community_payments.py
reads ta_drug_keywords for the --ta -> filters Open Payments parquet -> aggregates -> community_practitioner_
payments. Generalizes to all TAs.

### 30bi. ta_drug_keywords ALREADY populated for AD (14 rows) - covers all 12 + 2 pipeline flagged is_primary_signal=false. No insert.
Existing AD rows fully cover our finalized 12 (all approved, is_primary_signal=true, brand+generic present) PLUS
2 pipeline agents (Amlitelimab, Rocatinlimab) correctly flagged is_primary_signal=FALSE. The include/exclude
distinction we wanted is ALREADY ENCODED. Schema: drug_name, drug_brand_name, drug_generic_name, is_primary_
signal, launch_year, withdrawal_year, market_position, expected_recipient_profile, notes. One drug per row.
=> NO INSERT NEEDED. The config-not-code pattern was already in place (advisor's rec already built). Aggregation
filters WHERE is_primary_signal=true to get the 12 approved AD drugs, auto-excluding the 2 pipeline.
TACROLIMUS SAFEGUARD (handled by data): drug_brand_name='Protopic'. Match tacrolimus on BRAND (Protopic) not bare
generic to avoid systemic-transplant (Prograf) false positives. Other 11 safe on brand OR generic.
AGGREGATION SPEC (aggregate_community_payments.py):
  - Read ta_drug_keywords WHERE ta_id=AD AND is_primary_signal=true -> the 12 AD drugs (brand+generic aliases).
  - Special-case tacrolimus: brand-only match (Protopic). (Generalize: could add a match_brand_only flag to the
    table later; for now special-case the one drug.)
  - Load community_practitioners NPIs (~19,351).
  - Read op_general_pgyr2022/23/24.parquet, filter npi IN community NPIs.
  - Aggregate per NPI 3yr: total_payments, count, distinct_mfrs, distinct_drugs, by nature_of_payment bucket,
    AD-drug $ + count (normalize drug_name lowercase/strip-punct/collapse-ws, substring vs brand+generic),
    top_manufacturers/top_drugs jsonb, yearly.
  - Upsert community_practitioner_payments ON CONFLICT (npi_number). Write only NPIs WITH payments.
  - --dry-run reports: # community derms w/ ANY payments, # w/ AD-drug payments, $ distribution, top 10.
NEXT: build + dry-run the aggregation. Then Explorer over community_practitioners + payments.

### 30bj. No new parquets for AD Open Payments - the files are UNIVERSAL (all physicians/drugs). TA-specificity is at QUERY time.
op_general_pgyr2022/23/24.parquet = COMPLETE CMS general payments (every physician, manufacturer, drug, US-wide).
NOT TA/specialty-filtered. AD's data was always in there; TA-specificity comes from QUERY-TIME filters: which NPIs
(community derms) + which drugs (ta_drug_keywords AD list). No AD-specific ingestion needed.
WHY OPEN PAYMENTS WORKS FOR AD BUT MEDICARE PART B DIDN'T (sharpens the data-availability doctrine):
  - Open Payments keys on NPI + free-text drug_name. AD's drugs (Dupixent/Rinvoq) generate payments (speaker/
    consulting) captured by NPI regardless of self-administration. AD IS representable in the file's keying ->
    filter works.
  - Medicare Part B keys on HCPCS procedure codes. AD's self-administered drugs are Part D pharmacy, NOT Part B
    procedures -> genuinely absent from the Part B file -> needed the HCPCS-curation workaround.
LESSON: it's not "is the raw file on disk" - it's "is the TA's signal REPRESENTABLE in the file's KEYING." NPI+
drug keying (Open Payments) = AD representable. Procedure-code keying (Medicare Part B) = AD's drugs not
representable. Check the keying, not just the file presence, when assessing a data source for a new TA.

### 30bk. Community Open Payments dry-run VALIDATED: 73% have payments, AD-drug $ mirrors real market. Executing.
1,802,511 payment rows for 19,351 community NPIs (DuckDB filter). Dry-run:
  - 14,165 (73.2%) have ANY Open Payments. Sensible (derms get food/bev/speaker).
  - 11,506 have AD-DRUG payments (~60%). Strong AD signal.
  - Total $ among payees: min $8 / median $1,399 / max $14.9M / sum $306.0M.
  - TOP AD DRUGS BY $: Dupixent $35.8M, Rinvoq $19.6M, Opzelura $10.5M, VTAMA $9.7M, Cibinqo $7.4M. = EXACTLY the
    real AD market hierarchy (Dupixent dominant biologic, Rinvoq lead oral JAK, then topicals). Strong validation
    the drug matching works.
  - Tacrolimus brand-only safeguard worked (no Prograf pollution).
SANITY CHECKS PASS:
  - Silverberg (NPI 1831325521): $2.5M total, $1.7M AD (mostly Dupixent/Sanofi). He's a KOL who's ALSO a
    dermatologist w/ NPI -> appears in community_practitioners as one of the 342 matched_hcp_id overlaps. Numbers
    plausible for a top AD KOL. Overlap linkage working.
  - Top payee $14.9M total / $601 AD = big general pharma engagement but NOT AD - the AD-specific filter correctly
    SEPARATES "big pharma $ generally" from "AD $ specifically". That separation is the core value.
14,165 rows to upsert (only NPIs w/ payments). EXECUTE -> community_practitioner_payments. Then the community
directory has BOTH spines: NPPES identity/location + Open Payments engagement (general + AD-specific).
NEXT AFTER EXECUTE: Community EXPLORER - filter/search by state/city/subspecialty(peds derm)/practice-setting/
sole-prop/has-payments/AD-drug-engagement-tier/specific-manufacturer. The operational discovery tool, real 2-spine
data. Then playbook capstone (§30bd doctrine + two-spine + query-time-filtering §30bj into TA_NEW_PLAYBOOK).

### 30bl. Cross-TA community geography: AD-derm vs NSCLC-onc state distributions differ in ways that TRACK THE MEDICINE.
Normalized (top-15 shares): 
  CA: AD ~17% (#1) vs NSCLC ~11% (#3) -> AD-HEAVY. Derm density tracks population+AFFLUENCE+cosmetic-adjacent
    market (CA epicenter). Affluence hypothesis held.
  TX: NSCLC ~13% (#1) vs AD ~9% (#4) -> NSCLC-HEAVY. Lung-cancer burden (smoking regions) + huge community-onc
    networks (Texas Oncology). NSCLC concentrates where disease + big community onc practices are.
  FL: both ~11-12% (high in BOTH). Refines the hypothesis: FL retirees drive BOTH retiree skin-cancer/derm AND
    retiree oncology -> top state for any 65+-relevant specialty. FL derm is heavily skin-cancer (sun+elderly),
    mirroring the oncology retiree pull. (I expected FL to skew NSCLC harder; it's even - because derm in FL is
    also age-driven.)
  MA/MD/NC: rank higher in NSCLC relative to size (MD top-15 NSCLC, not AD). Academic/NCI-adjacent oncology
    concentration (Bethesda/Baltimore, Boston, Research Triangle) pulls community-adjacent oncologists; derm more
    evenly population-distributed.
VALIDATION: both distributions are sane (track population) but their SHAPES reflect real differences - derm =
population+affluence; onc = disease burden + academic-cancer-center gravity + retiree age. NOT noise. Also a
methodological note: NSCLC community came via MEDICARE (inherently 65+-serving high-volume oncologists) while AD
came via NPPES (ALL derms) - different source filters, so shape differences partly reflect the SOURCE not just
the specialty. Both valid.
This is a nice cross-TA sanity check + a small market-intelligence artifact (geographic community composition by
TA). Confirms the AD community directory is geographically real.

### 30bm. BACKEND STATUS CHECK (Garrett asked "are we done"): Scientific 100%, Community ~80%. Precise remaining list.
DONE + VALIDATED:
  - Established: shipped, Silverberg #1, durable, +38 current. 100%.
  - Emergence/Rising: shipped, Chovatiya #1, validated. 100%.
  - Community DATA SPINES: community_practitioners (19,351 derms) + community_practitioner_payments (14,165 w/
    payments, AD-drug validated). Both live.
=> SCIENTIFIC BACKEND 100%. COMMUNITY BACKEND ~80% (data spines done, organizing layer remains).
COMMUNITY REMAINING (small, some pending Explorer design decisions):
  1. career_stage_years: the ingest was to compute it from enumeration_date - CONFIRM it populated (spot check
     community_practitioners.career_stage_years not-null count).
  2. Classification/TA-tagging: community_practitioners has NO therapeutic_area_id (deliberate - US derm directory
     is TA-agnostic). If Explorer is presented AS "AD community", may need a tag/view formalizing the AD community
     cohort. Design decision.
  3. Narratives: established/rising get AI "Why This Expert" text; community derms don't. generate_community_
     narratives.py exists, not run for this population. Directory may not need per-derm narratives - product call.
  4. (Optional) light engagement TIER for filtering (has-payments / AD-drug-tier) - could be a computed column or
     just Explorer-query-time. Probably query-time, no backend needed.
NOT a full community SCORER - advisor said Community = Explorer (search/filter) NOT a ranking. So no composite/
rank needed. The "organizing layer" is: confirm career stage + decide TA-tagging + decide narratives. Small +
partly Explorer-design-dependent.
NEXT SESSION OPTIONS: (a) finish community organizing layer (small), (b) build Community Explorer UI (the payoff,
frontend - backend ready), (c) playbook capstone (§30bd sequencing + two-spine + §30bj keying doctrine into
TA_NEW_PLAYBOOK). Frontend repoint of the 2 scientific cohorts (established/emergence) to AD tables also still
pending (deferred until backend-complete - scientific backend now IS complete, so that repoint is unblocked).

### 30bn. Frontend surface understood + career_stage confirmed. Community tab = the Explorer's home. Design tension: directory in a leaderboard UI.
career_stage_years: 19,351/19,351 populated. min 0, avg 16, max 21. NOTE: capped at ~21 = years since NPI
enumeration (NPIs started ~2005) - UNDERSTATES true career length for senior derms (35-yr practitioner shows 21).
Fine as RELATIVE early/mid/late signal for Explorer filtering, not literal career length. Label it "years since
NPI" or "practice tenure (NPI-based)" not "career length" to be honest.
FRONTEND SURFACE (screenshot): cohort tabs = Established / Rising Stars / COMMUNITY / Social / Telescope / Field
Intelligence. TA nav Oncology->NSCLC. Established shows RANKED cards: big score (100), #N US / #N Global, chips
Scientific/Network/Pharma, narrative snippet, institution, flag, TARGETED status, action icons. Top Institutions
strip. Polished dark theme, gold accent.
=> COMMUNITY TAB is the Explorer's home (Garrett confirmed). DESIGN TENSION: every other tab = RANKED score-cards;
Community = SEARCH/FILTER DIRECTORY (advisor: not a ranking). Community must fit the UI visually while being
fundamentally different (no #1/score-ranking). 
COMMUNITY TAB DESIGN (proposed):
  - Replace the "Top Institutions" strip + ranked list with: a FILTER BAR (state/city, subspecialty [General/
    Pediatric/MOHS/Dermatopathology/Procedural/Immunology], practice setting, "has AD-drug engagement" toggle,
    payment tier) + a SEARCH (name/city).
  - Cards become DIRECTORY cards (not score cards): name, credentials, city/state, subspecialty badge, practice
    setting, sole-proprietor flag, + an ENGAGEMENT strip (total Open Payments tier + AD-drug $ + top manufacturer)
    instead of Scientific/Network/Pharma chips. NO #N rank, NO 0-100 score.
  - Optional sort (not rank): by AD-drug $ desc, total payments desc, name, career tenure - a SORT not a RANKING
    (user-chosen, no implied authority).
  - "matched_hcp_id" derms (the 342 who are ALSO in the scientific corpus / KOLs) get a badge linking to their
    scientific profile ("Also a published KOL ->").
DATA READY: community_practitioners (identity/geo/subspecialty/tenure) + community_practitioner_payments (general
+ AD-drug engagement). Everything the cards+filters need is in these 2 tables, joinable on npi_number.
BUILD: prototype the Community Explorer tab (React) matching the frontend's dark/gold aesthetic, over the real
2-table data. Decide filters/card layout by seeing it.

### 30bo. "Who to connect with first" WITHOUT claims data - the honest proxy: AD-ENGAGEMENT DEPTH, framed as engagement not clinical value.
The MSL's real question: "which of 2,000 territory derms first?" Gold answer = patient volume + AD prescribing =
COMMERCIAL CLAIMS (IQVIA/Komodo/etc) = can't afford. So need a defensible PROXY from what we HAVE (NPPES + Open
Payments).
KEY INSIGHT: Open Payments AD engagement IS a prioritization signal - not because payments=clinical importance,
but because a derm with AD pharma relationships is (1) demonstrably engaged w/ the AD treatment landscape
(Dupixent speaker fees -> prescribes it, attends AD events, in the conversation), (2) already reachable (shown
willingness to engage industry -> warmer outreach), (3) market-validated (other mfrs already invested = evidence
they matter).
PROPOSED "CONNECT PRIORITY" PROXY (Open Payments + NPPES only):
  - AD-drug $ 3yr (primary) - depth of real AD relationships.
  - AD-drug BREADTH - # distinct AD drugs (3+ = embedded in AD landscape, not one-mfr).
  - Manufacturer diversity - multiple pharma = broadly active.
  - Recency/trend - AD engagement growing (2024>2022) = increasingly active.
  - (Optional) peds-derm weight - pediatric derms matter disproportionately for AD (pediatric disease burden).
BANDS (3-tier segmentation, NOT a 1-N rank):
  - PRIORITY: deep + broad + growing AD engagement -> "connect first"
  - ACTIVE: some AD engagement -> "worth developing"
  - WHITESPACE: no recorded AD engagement -> "opportunity, unvalidated"
*** FRAMING IS LOAD-BEARING (honesty): label it "most AD-ENGAGED in your territory," NOT "top KOL" or "highest
patient volume." We're proxying ENGAGEMENT (which we can measure), not CLINICAL VALUE (which we can't). An MSL
understands "these have the deepest existing AD-industry engagement near you" - defensible + useful. Claiming it's
clinical importance would be dishonest + a credibility risk with sophisticated Medical Affairs buyers (same
principle as the pharma-display and Community-not-ranking decisions). ***
CAVEAT to surface in-product: engagement != quality of care or true patient volume. It's "who's already active in
the AD landscape." Whitespace derms may be excellent + high-volume but industry-unengaged - so whitespace is
OPPORTUNITY not "low value." The tiers guide SEQUENCING of outreach, not judgment of the physician.
=> This is the next-best-thing given no claims data. Build: compute a connect_priority tier from community_
practitioner_payments (AD $ + breadth + mfr diversity + trend) -> Explorer leads with PRIORITY derms per
territory, ACTIVE next, WHITESPACE as a separate "develop" view.
NEXT: confirm the framing w/ Garrett, then compute the tier + rebuild Explorer to lead with it (grouped bands,
not a flat sorted list).

### 30bp. ADVISOR (1 of 2) on the Explorer: surface OPPORTUNITY, not activity. Community -> "Field Opportunity" with a score.
[Awaiting part 2 before reacting.]
Advisor's critique of the Explorer draft: UI beautiful BUT not surfacing what an MSL actually asks. Cards show
ACTIVITY (Open Payments, AD-drug $, manufacturer) = DESCRIPTIVE, not PRIORITIZATION.
  - MSL is NOT asking "who has highest AD-drug payments?" (interesting, not actionable).
  - MSL IS asking "who should I see NEXT?" - depends on MULTIPLE signals blended.
PROPOSED REFRAME: Community -> "FIELD OPPORTUNITY". Every physician gets an OVERALL SCORE (e.g. "FIELD
OPPORTUNITY 94") - NOT prestige-based, OPPORTUNITY-based. Blend:
  1. AD commercial engagement: Open Payments, AD-drug $, manufacturers.
  2. Scientific engagement: publications, clinical trials, conference activity (if available).
  3. Specialty fit: Dermatology / Pediatric Derm / Allergy / Community IM / etc.
  4. Practice influence: academic / large group / hospital / private.
  5. Recency: engagement exploding recently vs plateaued.
=> Score answers "this physician is worth seeing."
NOTE (to reconcile after part 2): this REINTRODUCES A SCORE/RANKING for community - which the EARLIER advisor
guidance (§30ar) explicitly said NOT to do ("Community = Explorer, search not rank"). Possible tension OR
evolution of the advice. Also tension w/ §30bo honesty framing (don't imply clinical value we can't measure).
Need part 2 + reconciliation: is "Field Opportunity" a RANK (contradicts §30ar) or a TIERING/guide? And does
blending scientific+commercial re-mix the two intelligences we deliberately separated? Hold judgment for part 2.

### 30bq. ADVISOR (2 of 2) + RECONCILIATION: Community is a WORKSPACE (execution product), not a cohort. "Field Opportunity" resolves the ranking tension.
RECONCILIATION of the §30ar tension: "Field Opportunity" is NOT the authority-ranking §30ar warned against. §30ar
said no SCIENTIFIC/prestige ranking (like Established's). Field Opportunity answers a DIFFERENT question - "who
deserves my next CONVERSATION?" not "who's the best?" It's DECISION SUPPORT, not authority. And it doesn't claim
clinical value (respects §30bo honesty) - it blends OPPORTUNITY signals. So earlier + now are CONSISTENT: no
authority rank; yes to opportunity-based decision support. Framing discipline intact.
THE BIG REFRAME: Community is NOT a cohort - it's a WORKSPACE.
  - Established + Rising = INTELLIGENCE products (who matters scientifically). "Who's the best?"
  - Community = EXECUTION product. "Who deserves my next conversation?" MSL's Monday-morning question: "given my
    territory, strategy, and who we've already engaged, which 5 physicians do I prioritize this week?"
  Cards stop being PROFILES, become DECISION SUPPORT.
STANDOUT IDEAS:
  1. CROSS-COHORT BADGE ("Community + Established" / "Community + Rising" on a card) - the thing IQVIA CANNOT do
     (no scientific layer). MSL sees a high-AD-engagement community derm who's ALSO Rising scientifically = not
     just a prescriber, becoming important. The two-intelligence bridge as a PRODUCT DIFFERENTIATOR. (We have the
     linkage: matched_hcp_id -> hcps_v2 cohort. Extend beyond the 342 exact-NPI overlaps.)
  2. "WHY THIS PHYSICIAN" explainer (Telescope-style): "top 2% AD engagement · 17y practice · Dupixent+Opzelura ·
     moderate publications · strong regional influence." Turns the score from black-box -> decision support (WHY,
     actionable).
  3. TERRITORY CONTEXT header: "Philadelphia Territory · 43 physicians · 5 Emerging · 12 Established · 21
     Community." Makes the page TACTICAL.
  4. THE MEDICAL-AFFAIRS-HEAD SORT (the killer): high AD engagement + LOW prior COMPANY engagement + near
     territory + rising scientific influence. = OPPORTUNITY not activity. Highest-Open-Payments derm is often the
     WORST target (saturated by competitors); sweet spot = high-landscape-engagement-but-not-yet-YOURS. Whitespace
     done right. NOTE: "low prior COMPANY engagement" implies knowing THIS client's own engagement history - a
     future CRM/input; for now proxy with low-overall-OP or a manual "already engaged" exclude list.
FIELD OPPORTUNITY score blend (advisor): (1) AD commercial engagement (OP, AD-drug $, mfrs), (2) scientific
engagement (pubs/trials/conf - we HAVE pubs+cohort via matched_hcp_id), (3) specialty fit (derm/peds-derm/
allergy/community-IM), (4) practice influence (academic/group/hospital/private), (5) recency (exploding vs
plateaued). => "worth seeing."
HEAVY FILTERS (advisor wants): Dupixent users, JAK engagement, Pediatric AD, Academic, Community, High/No Open
Payments, Emerging/Established/Rising. Example MSL query: "Pennsylvania + Community + High AD engagement + Low
scientific footprint." Filters ARE the product.
RECONCILE w/ HONESTY (§30bo): Field Opportunity must still be honestly framed - it's OPPORTUNITY (engagement +
fit + recency + whitespace), NOT clinical value/patient volume. The "why this physician" explainer enforces
honesty (shows the actual signals, no hidden clinical claim). Good.
=> REBUILD Explorer as a WORKSPACE: territory header + heavy filter rail + Field Opportunity score + cross-cohort
badge + why-this-physician explainer + the opportunity sort. Cards = decision support. THIS is the differentiated
product (not another ranking - a "what do I do next" tool).
NEXT: (1) design the Field Opportunity score (signals we HAVE now vs future). (2) rebuild the Explorer prototype
as the workspace. (3) the cross-cohort linkage (matched_hcp_id + fuzzy) to power the badge.

### 30br. FIELD OPPORTUNITY v1 score design - from the signal inventory. Key Q: scientific BAKED-IN vs BADGE.
Signal inventory (Garrett): HAVE (specialty, practice type, state, institution, career age, Open Payments, AD-
specific OP [Very High/Very High], companies engaging, Scientific Authority/Emergence/Publications/Coauthor net
[Very High but Medium actionability]). MISSING: prescribing volume, claims (❌). FUTURE: internal Field Intel
(🚧, Extremely High actionability).
INSIGHT: FieldMark has MORE than IQVIA-style vendors for this (the whole scientific layer they lack). Missing =
prescribing/claims = exactly what advisor said stop faking. So v1 leans into UNIQUE signals + honestly excludes.
FIELD OPPORTUNITY v1 (5 components, all from ✅ data):
  1. AD Commercial Engagement ~35% (leads - Very High/Very High): AD-drug $ depth + AD-drug breadth + mfr
     diversity. From community_practitioner_payments.
  2. Scientific Signal ~25% (the IQVIA-can't differentiator): via matched_hcp_id -> also in scientific corpus? +
     cohort (Established/Rising/Emergence) + pub footprint. Most community=0; the ones lighting up = gold.
  3. Specialty Fit ~15%: Pediatric Derm weighted highest (AD peds burden), General strong, others scaled.
  4. Recency/Momentum ~15%: AD-drug $ trend 2024 vs 2022. Growing = increasingly active target.
  5. Practice Influence ~10%: academic/large-group/hospital > solo. From nppes_practice_setting + sole_prop.
EXCLUDED (honesty line): prescribing/claims (don't have, don't fake). Internal Field Intel (future). PRIOR
COMPANY ENGAGEMENT - the advisor's killer sort wants "LOW prior engagement" but that needs CLIENT's own CRM -
v1 can't do true whitespace-vs-your-company; can only show overall engagement for manual saturation read. True
low-prior = CRM-integration future feature.
*** OPEN DESIGN Q (need Garrett's call): Scientific Signal BAKED INTO the score vs SEPARATE BADGE? ***
  - Baked in: one number, but a 92 is AMBIGUOUS (commercial? scientific? re-blurs the 2 intelligences we
    separated).
  - Badge: Field Opportunity = commercial-forward (honest engagement measure) + cross-cohort badge ("also Rising")
    shows scientific separately. MSL sees BOTH axes cleanly. Keeps 2 intelligences legible.
  MY LEAN: commercial-forward SCORE + scientific as prominent BADGE/modifier (scientific can BOOST priority
  visibly but isn't invisibly blended). Field Opportunity primarily = engagement opportunity (honest); badge adds
  "+ scientifically important." Legible.
HONESTY GUARDRAILS (locked): name it "Field Opportunity" not "Physician Score"; ALWAYS show the number WITH its
why-breakdown (never bare 92); it measures OPPORTUNITY (engagement+fit+recency+whitespace) NOT clinical value/
volume.
NEXT: Garrett's call on bake-in-vs-badge -> finalize weights -> compute Field Opportunity -> rebuild Explorer as
workspace (territory header, filters, score+why, cross-cohort badge, opportunity sort).

### 30bs. ADVISOR (resolves bake-vs-badge by DISSOLVING it): NO single Community score yet. MULTI-DIMENSIONAL opportunity. Composite emerges from EVIDENCE later.
THE RESOLUTION: don't build a Community score at all yet. Show MULTIPLE INDEPENDENT opportunity dimensions; let
the MSL reason across them; let the composite EMERGE later from evidence (watch which combos prove useful), NOT
from intuited weights now. Better + more honest than my badge-lean (which still committed to a 35/25/15/15/10 I
have no evidence for). Same discipline as the whole build: don't assert precision the evidence lacks.
THE DIMENSIONS (independent, shown side by side, NOT collapsed):
  - COMMERCIAL OPPORTUNITY [have it well]: AD-drug $, # + diversity of mfrs, recency, practice type. "Actively
    engaged in the AD commercial ecosystem."
  - SCIENTIFIC OPPORTUNITY [already built]: via matched_hcp_id -> Emergence rank / pub count / cohort. "#37
    Emergence, 12 recent AD papers."
  - ACCESSIBILITY [underrated, have it]: academic/private/hospital/solo, in-territory, US, NPI. Simple
    operational attributes that genuinely aid prioritization.
  - RELATIONSHIP STATUS [🚧 killer future]: "Unknown" today. THE MOAT - "6 visits, 3 ad boards, positive
    relationship, interested in IL-13" = FieldMark, NOT Open Payments. Show as honest Unknown/🚧 placeholder now
    so the ARCHITECTURE anticipates it.
TWO ELEVATING IDEAS:
  1. SORT BY STRATEGY not score: "Show me: build new relationships / maintain key / rising scientists / high
     commercial / under-engaged / territory priority." Product tells STORIES aligned to how MSLs plan. Decision-
     support, not leaderboard.
  2. BELIEF PROFILES as a sort axis (Garrett conceived months ago): "interested in barrier dysfunction / IL-31 /
     JAKs / pediatric AD." Genuinely novel - sort the field by what physicians BELIEVE, not just who they are.
     (Belief Profiles already exist for scientific HCPs - the "Deep Corpus"/"Belief Profile" on Established/Rising
     profiles. Extend the concept to Community as a filter axis; derivable from pubs for the matched ones,
     future/inferred for pure practitioners.)
META (the real prize): FieldMark shifted DISCOVERY platform -> DECISION-SUPPORT platform. Discovery = a feature
(replaceable). "Who do I spend the next hour with" = a WORKFLOW (sticky, hard to replace). Materially stronger
market position. Community-as-workspace is where it's most visible.
=> BUILD (revised): NOT a scored Explorer. A MULTI-DIMENSIONAL WORKSPACE - each derm shows the independent
dimensions (Commercial / Scientific / Accessibility / Relationship-Unknown), a STRATEGY-based sort/filter ("show
me..."), territory context, cross-cohort visibility. No invented composite. Let usage reveal the weighting.
NEXT: rebuild the prototype as the multi-dimensional strategy-sorted workspace (Commercial/Scientific/
Accessibility dims + Relationship placeholder + strategy presets + territory header). Honest: no fake composite,
dimensions shown independently.

### 30bt. BUILT Community Workspace prototype v2 (CommunityWorkspace.jsx) - multi-dimensional, strategy-sorted, no composite.
Rebuilt per §30bs. Key elements realized:
  - NO composite score. 4 INDEPENDENT dimensions per physician: Commercial / Scientific / Accessibility (star
    ratings) + Relationship (honest "Unknown" + lock - the moat's architectural slot).
  - STRATEGY SORT not score: "Show me..." presets (Build new relationships / Rising scientists / High commercial /
    Under-engaged / Pediatric AD) - each RESHAPES what surfaces + order. Tells stories, matches MSL weekly planning.
  - TERRITORY HEADER: state picker -> "X physicians · Y AD-engaged · Z Rising · Established · Pediatric". Tactical.
  - CROSS-COHORT BADGE prominent ("Also Rising · #47 Emergence · 8 recent AD papers") = IQVIA-can't differentiator.
  - Belief-profile teaser ("Interested in IL-13 pathway") - plants the belief-driven-sort flag.
Data modeled on real distributions (CA/FL/NY/TX, 6 subspecialties, ~73% engaged, ~4% Rising-overlap, Dupixent-led).
In production: dims computed from community_practitioners + community_practitioner_payments + matched_hcp_id ->
hcps_v2 cohort/emergence/pubs. Relationship dim = future CRM/Field Intel.
This is the "decision-support not discovery" thesis made tangible: answers "who deserves my next conversation?"
via strategy, not a leaderboard. Honest (no faked composite; relationship shown as Unknown).
STATUS: prototype 2 delivered for Garrett reaction. Next: (1) Garrett feedback on the workspace model. (2) if
approved, spec the REAL computation of the 3 available dims (Commercial/Scientific/Accessibility) from the live
tables + the strategy queries, for the actual frontend build. (3) belief profiles + relationship = future.
NOTE: this is a PROTOTYPE (sample data) to validate UX/direction - not the app code. Real build = wire dims to
Supabase + integrate into the existing React frontend Community tab.

### 30bu. Workspace v2 LOVED. v3 spec from advisor reaction. DECISION: KEEP STARS + always-visible evidence (option 1).
Advisor: "first mockup I can imagine an MSL using every day... looks like a workflow not a directory." Crossed a
threshold: v1 answered "who are these physicians?"; v2 answers "why spend time with THIS one vs the other 15?"
STARS DECISION (Garrett): KEEP the stars (option 1) - stars + ALWAYS-VISIBLE evidence. Rationale: stars give the
scannable territory-sweep (see each card's SHAPE instantly - Commercial-heavy/Sci-light) that raw facts don't;
the advisor's subjectivity worry is fixed by SHOWING the evidence alongside (stars = visual encoding of facts,
not our opinion), not by removing stars. (Advisor's own feedback was self-contradictory: praised "Commercial
★★★★★ / Scientific ★☆☆☆☆ incredibly intuitive" then argued against stars.) CONCESSION: star BANDS must be
simple explainable thresholds (e.g. AD-$ percentile / clear cutoffs), NOT a hidden weighted blend (that'd be the
invented-composite we're avoiding). Honest stars, transparent bands, evidence always shown.
V3 REFINEMENTS (from advisor reaction):
  1. *** "WHY SHE'S HERE" line under the name *** (advisor's best idea): one line explaining the recommendation
     BEFORE reading the card. e.g. "High commercial engagement · No relationship history · Interest in JAK
     inhibition." Makes each card a BRIEFING. Highest-value add.
  2. BELIEF PROFILES = the favorite ("Interested in JAK inhibition" answers "what do I TALK ABOUT?" - more
     valuable than "$181K"). Lean in hard as they become available. Future: barrier dysfunction / IL-31 /
     biomarkers / pediatrics / itch / sequencing.
  3. RICHER TERRITORY SNAPSHOT: "16 physicians · 9 commercially engaged · 4 pediatric · 3 under-engaged · 1
     rising · 0 established KOLs" - a territory character snapshot (scientifically mature vs commercially active).
  4. RENAME "Accessibility" -> "Practice Setting" or "Engagement Profile" (accessibility implies scheduling ease).
  5. MORE STRATEGY PRESETS: recent commercial acceleration, scientific opinion leaders, clinical trial
     investigators, advisory board candidates. Presets-as-strategy (not filters).
  6. Relationship row = "the heart of FieldMark" one day (Last visit April 17 · Positive · Interested in IL-13
     durability). Keep the honest Unknown placeholder now.
THE TRAJECTORY (advisor): eventually the page RECOMMENDS specific physicians - "Nicole Anderson · Recommended
this week · because: high commercial + no prior relationship + JAK interest + private + territory priority." =
AI decision-support (not a chatbot). The "why she's here" line is the first step toward this.
META (advisor): "less like an HCP database, more like a decision-support dashboard for Medical Affairs" - much
more compelling direction. Discovery=feature; "who do I spend time with"=workflow. Don't invent data we lack;
strongest parts are grounded in real signals (commercial/scientific/practice/relationship).
NEXT: build v3 - stars+evidence, "why she's here" line, richer territory snapshot, renamed practice-setting dim,
more strategy presets. Then (if approved) spec real computation of the 3 live dims + strategy queries for the
actual frontend.

### 30bv. v3 reaction: Practice Setting = CONTEXT not signal (drop its stars). "Why recommended" drawer. + the priority ranking of the whole build.
CORRECT TWEAK: Practice Setting should NOT be stars. Stars encode STRENGTH/PRIORITY; Practice Setting has NO
inherent direction (academic center isn't "better" than solo - depends on MSL objective). 4 stars of WHAT? So:
Commercial + Scientific = SIGNALS (stars, directional). Practice Setting = CONTEXT (stated fact: "Large Group ·
20 years"). This also visually reinforces the signals-vs-context hierarchy = the right mental model. FIX: render
Practice as plain text, not a star row.
RELATIONSHIP = the moat, quietly. "Field Intelligence — coming soon" is a favorite line. Becomes: "Relationship:
Strong · Last visit May 18 · Discussed JAK sequencing · Follow-up requested" OR "None · Recommended first
meeting." Transforms discovery -> workflow. (Future: CRM/Field Intel integration.)
BUILD THIS: "WHY RECOMMENDED" DRAWER - click the headline/why-line -> expand:
  "Why FieldMark recommended Michael Feldman: ✓ Top 10% AD commercial engagement in PA · ✓ No prior relationship ·
   ✓ 9 AD publications since 2021 · ✓ Emerging scientist (#212) · ✓ Rinvoq engagement · Confidence: High"
  = explainability -> TRUST. MSLs + managers ask "why did the system put this physician first?" - transparent
  answer is powerful. (The "why she's here" line is the teaser; the drawer is the full evidence. Note: only show
  signals we actually HAVE; "Confidence" reflects data completeness - honest.)
PHILOSOPHICAL (the value prop crystallized): CRM says "here's everyone in your territory." FieldMark says "here's
who deserves your attention, AND WHY." Much stronger. Discovery -> decision-support -> workflow.
ADVISOR'S PRIORITY RANKING of the whole build (useful framing for positioning):
  1. Established - demonstrates scientific CREDIBILITY (intelligence is real).
  2. Rising Stars - demonstrates PREDICTIVE capability.
  3. Community workspace - demonstrates DAILY UTILITY.
  #1+#2 convince Medical Affairs LEADERSHIP the intelligence is real (the SALE). #3 convinces the MSL they'll USE
  it every day (the RETENTION/stickiness). Both needed: credibility gets you bought, daily utility keeps you.
NEXT: v4 tweak (Practice -> context text, not stars) + optionally the "why recommended" drawer. Then the design
is locked -> real computation + frontend wiring (next session).

### 30bw. *** THE CENTRAL PRODUCT INSIGHT: Community is the MAP (static, planning). FIELD INTELLIGENCE is the HEARTBEAT (daily, what CHANGED). ***
Garrett's problem: "the data won't change much Monday to Monday" - open it weekly, "same people," feels dead.
Advisor: this isn't a flaw - it uncovered the CENTRAL product question. The answer is NOT "make the data change
more." It's: Community was never the daily product.
WHAT ACTUALLY CHANGES, BY CADENCE:
  Practice setting: never. Territory: rarely. Open Payments: ~quarterly. Publications: slowly. Commercial
  engagement: monthly/quarterly. Emergence: monthly. => Community data is SLOW. Correctly so.
THE REFRAME - COMMUNITY IS A PLANNING PRODUCT, NOT AN OPERATIONAL ONE:
  MSLs don't re-plan territory every Monday. They re-plan: inheriting a territory, before a congress, before a
  launch, before quarterly planning, before advisory-board nominations, before territory reviews. = a PLANNING
  workflow (periodic), not a daily one.
  => Community = "the ROSTER / the MAP" (think LinkedIn - relatively static, you don't expect it to change daily).
  Discover physicians, plan territory. Established/Rising = STRATEGIC (monthly). Community = TACTICAL PLANNING.
WHAT CHANGES EVERY MONDAY: not the physician - YOUR KNOWLEDGE ABOUT the physician. The Relationship/Field-Intel
layer. Michael Feldman's CARD changes not because HE changed but because INSTITUTIONAL MEMORY changed ("Visited
yesterday · interested in Rinvoq sequencing · asked about IL-13 durability · follow-up requested"). 
=> FIELD INTELLIGENCE is the DAILY product / the HEARTBEAT:
  "Field Intelligence · 4 updates since yesterday: Feldman mentioned pediatric expansion · Kim changed opinion on
   JAK sequencing · Johnson attended EADV · Chen published new IL-31 paper." People log in every morning for THIS.
THE PRODUCT HIERARCHY (resolved):
  Community = stable MAP (roster, planning). Established/Rising = strategic intelligence (monthly). Field
  Intelligence = the daily heartbeat (what CHANGED). Community + Field Intel REINFORCE (map + where-to-go-next),
  don't compete.
THE ORIGINAL THESIS VINDICATED (Garrett, >1yr ago): "Existing tools tell me WHO an HCP is. They don't remember
what I've LEARNED from them." THAT's the moat. Field Intelligence = the institutional-memory layer = the thing
that changes daily = the reason to open it every morning.
EVEN COMMUNITY CAN FEEL ALIVE - surface CHANGES not LEVELS (delta, not state):
  NOT "Commercial ★★★★" -> "Commercial ↑ +$42K AD · new AbbVie payment"
  NOT "Scientific ★★★"   -> "2 new AD publications · entered Rising Top 250"
  NOT "Relationship Unknown" -> "New to territory" / "No engagement in 14 months"
  People notice MOVEMENT, not levels. (This applies across the whole app, not just Community.)
THE PRODUCT CATEGORY (the real identity): NOT a database ("who are my physicians?"), NOT a dashboard ("what's
happening?"). An INTELLIGENCE SYSTEM: "what CHANGED that I should care about?" Fundamentally different product.
IMPLICATION FOR BUILD PRIORITY: don't over-invest in making Community "daily." Build it as the excellent stable
MAP it should be. The daily heartbeat = Field Intelligence (the change-feed + institutional memory) - that's the
next big product surface + the moat. The "delta not level" pattern is a cross-cutting design principle to apply
everywhere.

### 30bx. SESSION END. Kickoff note + Claude Code frontend audit prompt written. Tomorrow = frontend audit -> AD repoint. Adopting Claude Code.
End of the July 8 two-day marathon. Two handoff artifacts written for a frictionless day 3:
  - NEXT_SESSION_KICKOFF.md: warm-start note (where things stand, tomorrow's goal = frontend supports AD, the
    exact first move, key facts the frontend work needs, queued items, the §30bw insights not to lose).
  - claude_code_frontend_audit_prompt.md: read-only audit prompt for Claude Code (architecture map, data layer +
    every table reference = repoint surface, the Rising 2x2->2-axis rework, cohort card anatomy, lift estimate
    Small/Med/Large, risks). Produces a summary to bring back to chat for scoping.
DECISION: Garrett adopting Claude Code (put off long enough) - frontend audit = ideal first real CC task (read-
heavy, big files, well-scoped, outputs a summary). Workflow: CC audits/executes the big codebase; chat does
strategy/design + keeps TA_BUILD_DEBT coherent (the established chat-strategy / CC-execution split). Note: CC
adoption also the substrate for the eventual gated-agent-team TA-expansion vision (playbook capstone = the
prerequisite: the declared build sequence becomes the agent task spec).
CONTINUITY NOTE: the thread lives in TA_BUILD_DEBT.md (through §30bx) + cross-conversation memory, NOT this chat
window. A fresh chat pointed at the doc resumes with near-total continuity. Long chat = degrades (compaction
evidence); fresh container is BETTER for the new frontend phase.
=== TWO-DAY MARATHON COMPLETE. AD: scientific backend 100% (Established + Emergence, validated). Operational spine
built (19,351 derms + payments). Community reconceived: workspace design LOCKED -> then reframed as the MAP, with
Field Intelligence as the daily HEARTBEAT (the moat, the original thesis). Architecture: TWO INTELLIGENCES
(scientific-global publication-first; operational-local NPPES-first) + the coming THIRD (the change-layer).
Sequencing doctrine + two-spine + keying principle captured for TA #3. Tomorrow: frontend. ===

### 30by. FRONTEND AUDIT (Claude Code, live-verified). Lift: Established Small, Rising Medium, Community Large/separate. + RLS LAUNCH BLOCKER found.
Claude Code audit of frontend/src (~177 files, data layer in lib/api.ts ~4300 lines), verified against live
Postgres + PostgREST. Stack: Vite+React18+TS, react-router-dom v7, supabase-js v2, recharts, force-graph.
KEY ARCHITECTURE FINDINGS:
  - Cohort UI is WELL-PARAMETERIZED: one FeedLayout component (App.tsx:342-1021) branches on `track` string;
    shared .map over <HCPCard>; one shared HCPCard.tsx (1178 lines) branches on hcp.cohort_classification. Adding
    AD = config + data-layer, NOT new components (for Established).
  - Cohort data flows through POSTGRES RPCs, not table names: fetchCohortViaRpc (api.ts:495-557) calls get_
    established_filtered / get_rising_star_filtered / get_community_filtered, passing p_ta_id. So "repointing" is
    mostly a DB-FUNCTION job. .from("hcp_*_ranks_v3") are only enrichment lookups.
  - TA selection FULLY HARDCODED across >=5 maps (TAFilterChips.tsx, routeSlugs.ts, api.ts TA_ID_MAP:657). AD's
    ta_id 9e4139d2 ABSENT (only immunology parent 4cf07827 present). Immunology hard-DISABLED (TAFilterChips:29).
    AD exists only as a disabled INDICATION under Immunology - and INDICATION DOESN'T SCOPE COHORT QUERIES (keyed
    on TA only). => AD must be its OWN TOP-LEVEL TA CHIP (mirroring how "Oncology" chip is really NSCLC).
LIVE DATA VERIFIED: hcp_established_ranks_v3 AD=7,462 (glob 5,131/region 447); hcp_rising_composite_v1 AD=5,719;
hcp_scientific_emergence_v1 AD=3,052; community_practitioners 19,351; community_practitioner_payments present.
hcp_narratives_v2 AD=0 (NOT generated - cards show "narrative generating" until backend gen runs).
*** RLS LAUNCH BLOCKER (opposite of the worry - Established is FINE): the 4 NEW AD tables shipped with RLS
DISABLED - readable by anyone with the committed anon key (in the JS bundle), no login. WORST: community_
practitioner_payments = Sunshine Act payment detail on 19,351 named physicians+NPIs, WIDE OPEN. Claude Code
drafted migrations/2026_07_09_ad_tables_rls_lockdown.sql (enables RLS + authenticated-only read on all 4, revokes
anon grant; pipelines use DATABASE_URL/service_role so unaffected). RUN FIRST, independent of frontend timing. ***
  (Established is NOT blocked: RLS ON, admits authenticated, inherits production NSCLC's exact working posture.)
LIFT (revised, per audit):
  - ESTABLISHED = SMALL: ~6 files additive config (api.ts TA_ID_MAP + TA_DISPLAY_BY_ID + resolveTASlug;
    routeSlugs.ts both maps + taLabelToApiSlug; TAFilterChips add chip + remove Immunology disable; Indication
    Filter add AD indication; un-hardcode App.tsx:1051 therapeuticArea:"nsclc" + InstitutionsInTerritoryPanel
    taSlug="nsclc":841). NO HCPCard change, NO new RPC - rides existing generic get_established_filtered which
    already reads v3 (= AD's target table). Fastest path to a live 2nd TA (minus narratives).
  - RISING = MEDIUM: new RPC over hcp_rising_composite_v1 + hcp_scientific_emergence_v1; collapse two 2x2 grids ->
    two tiles (HCPCard.tsx:952-986 + ScoreBreakdownV3Rising.tsx:160-205) + 1 DetailScreen subtext; re-map ~6 field
    sites (types.ts:102-108, hcpData.ts:68-74, App.tsx:320-326). network_influence_pctile = SAME field Established
    uses (type already carries it). DECISION NEEDED: `archetype` is orthogonal to new axes + new model doesn't emit
    it - does it survive? Old 2x2 read scientific/network _momentum/_visibility_percentile (4 fields) -> new = 2
    axes (emergence_pctile, network_influence_pctile).
  - COMMUNITY = LARGE / SEPARATE PROJECT: operational tables are DIFFERENT SHAPE (npi-keyed, no therapeutic_area_
    id, no rank/composite, many not linked to hcps_v2) -> legacy getCommunity->HCPCard->/hcp/:id flow WON'T WORK.
    It's the CommunityWorkspace redesign (§30bt/bu), NOT a repoint. Own project.
OTHER: no shared TA config (identity duped across >=5 maps - a central TA_REGISTRY would de-risk AD + future TAs;
backend already moved to JSON-per-TA, frontend hasn't). Dead code in HCPCard (console.log McKean 513-524; unused
renderScoreChip 569-700). NSCLC strings in StatPillWithTooltip. anon key committed inline in bundle.
RECOMMENDED ORDER (audit): 1) RUN RLS LOCKDOWN (now, independent). 2) Ship AD Established (§5 config diff, Small).
3) Rising (new RPC + 2-tile rework, Medium). 4) Community (own project, CommunityWorkspace redesign).

### 30bz. RLS LOCKDOWN RUN + VERIFIED. Launch blocker CLEARED. Anon locked out of all 4 new AD tables.
Ran the 4-table migration (ENABLE RLS + authenticated-read policy + REVOKE SELECT FROM anon + NOTIFY pgrst).
VERIFIED:
  - Service role: SELECT count(*) community_practitioner_payments = 14,165 (data intact, pipelines unaffected -
    they use DATABASE_URL/service_role, bypass RLS).
  - Anon PostgREST probe: HTTP 401, PostgREST error 42501 "permission denied for table community_practitioner_
    payments". = anon BLOCKED at the grant level (REVOKE fired). Hole closed. (Got hard 401/permission-denied
    rather than []/*/0 because REVOKE-grant is stricter than RLS-policy-empty and fires first - the MORE secure
    outcome.)
=> The data-exposure launch blocker is CLEARED. Sunshine Act payment data on 19,351 named physicians now locked
to service_role (pipelines) + authenticated users only. All 4 new AD tables (rising_composite, scientific_
emergence, community_practitioners, community_practitioner_payments) now match the RLS posture of the working
tables (hcps_v2, established_v3, narratives).
NEXT: ship AD Established (§5 config diff, Small) - the fast path to a live 2nd TA.

### 30ca. AD Established frontend diff REVIEWED + approved (Claude Code, plan mode). Replace variant. 5 files/11 edits, NSCLC-safe.
Claude Code traced real wiring, produced clean additive diff, caught 2 things the audit missed. Reviewed + approved.
NSCLC PRESERVATION VERIFIED: taLabelToApiSlug("Oncology")==="nsclc" confirmed stays true -> both un-hardcodings
preserve NSCLC byte-for-byte. All NSCLC/Onc/Hep map entries untouched; AD added ALONGSIDE. 
IMMUNOLOGY INDICATION: confirmed leave inert (flipping to true would route to wrong ta_id 4cf07827 parent, not AD
9e4139d2 -> misleading duplicate). Indication never reaches cohort query (filter has no indication field). Left
untouched per "only add" guardrail.
THE 5-FILE DIFF (11 edits): api.ts (TA_ID_MAP + TA_DISPLAY_BY_ID + resolveTASlug slugByLabel); routeSlugs.ts
(TA_SLUG_TO_LABEL + TA_LABEL_TO_SLUG + taLabelToApiSlug case + new ATOPIC_DERMATITIS indication map wired into
both by-TA maps); TAFilterChips.tsx (REPLACE disabled Immunology chip -> AD, remove isImmunology branches);
IndicationFilter.tsx (add AD "All" indication, Immunology untouched); App.tsx (InstitutionsInTerritoryPanel
taSlug + getHCPDetail therapeuticArea both -> taLabelToApiSlug(selectedTA)). NO HCPCard/DetailScreen/RPC touched.
DECISION: REPLACE variant (Immunology chip -> AD) - removes dead disabled UI, doesn't enable Immunology, other 3
chips untouched. (vs keep-disabled-Immunology-as-5th + AD-6th = clutter.)
2 THINGS AUDIT MISSED (both flag-not-fix, correctly out of scope):
  1. COUNT BADGES read 0 for AD: getTACounts (api.ts:1086) reads hcp_established_scores_v2 / hcp_community_scores_
     v2 / hcp_score_ranks_v2 - AD=0 in all 3 (pipeline populated ranks_v3 but NOT _scores_v2 count tables). Feed
     UNAFFECTED (uses ranks_v3 via RPC, 7,462 AD rows). Only the separate TASelectionScreen shows 0/"—" AD counts.
     BACKEND DATA GAP (future: populate _scores_v2 for AD), not a frontend fix.
  2. HEPATOLOGY SIDE EFFECT: un-hardcoding InstitutionsInTerritoryPanel FIXES a latent bug (Hep was showing NSCLC
     institutions). Now Hep->hepatology, Rare->rare-disease. NSCLC still ->nsclc (unchanged). Behavior change
     beyond AD = arguably a fix; let stand but verify Hep institutions panel looks sane when testing.
NEXT: Claude Code applies edits -> runs typecheck + lint + build -> then LOCAL test: AD chip renders Established
(logged in), NSCLC IDENTICAL to before, Hep institutions sane. On branch ad-frontend-established (isolated, not
deployed until merged to foundation-rebuild). AD cards show "Narrative generating" (AD narratives=0, expected).

### 30cb. *** AD ESTABLISHED IS LIVE IN THE FRONTEND. Verified in-browser, logged in. Rankings domain-correct. ***
Preview server + authenticated login: the "Atopic Dermatitis" chip renders real Established data. Full chain
resolved (chip -> /atopic-dermatitis/established/all -> AD ta_id -> get_established_filtered -> rows). 
RANKINGS VALIDATED IN-PRODUCT (domain-correct who's-who of AD):
  #1 Silverberg (100, GWU - the AD KOL benchmark, exactly right) · #2 Guttman-Yassky (Mount Sinai) · #3 Simpson
  (OHSU) · #4 Eichenfield (UCSD, PEDS AD) · #5 Lio · #6 Paller (peds AD) · #7 Boguniewicz · #8 Yosipovitch (itch)
  · #9 Abuabara · #10 Leung · #11 Ong · #12 Feldman · #13 Sidbury (Seattle Children's) · #14 Greenhawt (Children's
  Colorado) · #15 Shi · #16 Siegfried (Cardinal Glennon). = accurate AD field, incl correct pediatric-AD skew.
CARD ANATOMY renders perfectly: score, #US/#Global rank, Scientific/Network/Pharma chips, institution, flag, gold
Established border. Pharma-as-display working (Silverberg 95, Guttman-Yassky 0, Eichenfield 95 - real Open Payments
variation, not ranked). Cards render clean despite AD narratives=0 (detail view would show "narrative generating").
Top Institutions strip populated (Mount Sinai 4 Est, Northwestern, U Miami, U Mississippi).
=> FieldMark's SECOND therapeutic area is live in the frontend. The scientific-backend work (2 days) is now VISIBLE
+ validated end-to-end in the real product. On branch ad-frontend-established, builds clean, NSCLC byte-for-byte
preserved. Ready to commit + (later) merge to foundation-rebuild.
NEXT: commit the branch -> optionally verify NSCLC + Hep unchanged in same session -> then Rising (Medium: new RPC
+ 2x2->2-tile) as the next cohort. Merge to foundation-rebuild when satisfied (that's the deploy trigger).

### 30cc. GAP FOUND: AD Established has almost NO practice-location data (8 of 5,131 have nppes_practice_state) + NO region-scope rows. Territory filtering is hollow.
Investigating why NE territory showed "4 Est" at Mount Sinai, found the real issue:
  - Check B: of 5,131 AD Established HCPs (global scope), only 8 have nppes_practice_state populated. 99.8% NULL.
    Established is PUBLICATION-DERIVED and was essentially NEVER NPI/practice-location resolved (that data came
    from the NPPES spine, which we built only for COMMUNITY yesterday). So territory/state filtering on Established
    filters against ~all-null data. The "5 in NE" = 5 of the only 8 HCPs cohort-wide that have ANY state.
  - Check A: 0 region-scope rows for AD Established in the 9 NE states (scope_type='region'). AD Established only
    got GLOBAL scope computed, not regional breakdowns. (Contrast: audit reported AD region-US 447 rows exist -
    so 'region-US' national scope exists but NOT per-STATE region rows the territory filter needs. RECONCILE.)
  - 4-vs-5 (cards vs query): the 4 visible cards are all Mount Sinai (Guttman-Yassky, Kim, Estrada, Gottlieb =
    the "4 Est" institution count). The 5th NE-state HCP is elsewhere/below fold, OR app territory logic != my SQL.
    Moot vs the bigger point: the territory view is running on ~8 data points, cosmetically "working" but hollow.
=> BACKEND DATA GAP, not a frontend bug. The AD frontend repoint is correct; the territory FEATURE is starved of
data because Established HCPs lack practice-location. TWO sub-gaps: (a) NPI/practice-state resolution for the
Established (publication-derived) population - was never done; (b) per-state region-scope rank rows for AD.
IMPORTANT SCOPE NOTE: this is the SAME structural theme as the Community discovery - publication-derived HCPs lack
operational/location data. Established KOLs CAN often be NPI-matched (they're real US clinicians w/ NPIs, unlike
the pure researchers), so this is resolvable via an NPI-resolution pass on the Established cohort - but it's a
BACKEND job, separate from today's frontend work. Territory filtering for Established will stay hollow until then.
For NSCLC it presumably works because NSCLC Established got practice-location/region data at some point (verify).
DECISION: today's frontend goal (AD Established RENDERS) is DONE + correct. Territory filtering being data-starved
is a pre-existing backend gap surfaced (not caused) by testing AD. Log it, don't fix now. The NATIONAL/global AD
Established view (Silverberg #1 etc, §30cb) is fully correct - that's the shippable win. Territory scoping is a
separate backend completeness task.
NEXT: confirm national view still good -> commit branch. Backlog: NPI-resolve Established population + per-state
region rows (backend, future). Verify how NSCLC territory gets its location data (the template).

### 30cd. RESTRUCTURE: AD = indication under IMMUNOLOGY (not top-level chip). Trace revealed Oncology->NSCLC is a FAÇADE.
Garrett corrected the IA: mentors will see this - chip bar must read ONCOLOGY·HEPATOLOGY·IMMUNOLOGY·RARE DISEASE
(NOT "Atopic Dermatitis" as top-level), with AD as an indication UNDER Immunology, mirroring NSCLC under Oncology.
CLAUDE CODE TRACE (airtight): the Oncology->NSCLC "hierarchy" is a FAÇADE. The TA LABEL carries the ta_id, NOT the
indication. taLabelToApiSlug("Oncology")="nsclc" (hardcoded switch) -> TA_ID_MAP["nsclc"] -> ta_id. The selected
INDICATION never enters `filters` - it only gates the "coming soon" state + section header + telescope + landscape
link. Selecting "All" vs "NSCLC" under Oncology = SAME ta_id. Indication chips are COSMETIC.
=> To mirror: taLabelToApiSlug("Immunology") -> "atopic-dermatitis" -> TA_ID_MAP -> 9e4139d2. Immunology behaves
like Oncology; AD is its cosmetic first indication. Pivotal = ONE line (the Immunology case in taLabelToApiSlug).
Rest of the plan = REVERTING the top-level-AD-chip edits (§30ca) + flipping Immunology's AD indication active:true
+ restoring "Immunology" to TA_CHIPS (enabled now). App.tsx un-hardcodings KEPT. api.ts TA_ID_MAP + TA_DISPLAY_BY_
ID entries KEPT (targets of the mapping).
*** OPTION A vs B (the real decision): 
  A = faithful mirror (TA-label->ta_id, indication cosmetic). Fast (~1 pivotal line + reverts). BUT reproduces
    Oncology's FLAW: indication is fake -> if a 2nd immunology indication (Psoriasis/RA/etc, all VISIBLE in the
    list) is ever activated, it'd silently show AD's data. Latent demo footgun. SAFE TODAY because AD is the ONLY
    active immunology indication (siblings active:false, unclickable).
  B = real per-indication ta_id (thread taId through filters + getEstablished/Community/RisingStars signatures).
    Invasive today but makes indication GENUINE - each resolves to its own ta_id. The architecturally correct
    multi-indication foundation (= FieldMark's core thesis).
DECISION: ship OPTION A NOW (correct VISUAL structure for mentors today, safe because AD is sole active immunology
indication) + LOG OPTION B as REQUIRED before activating ANY sibling indication (Psoriasis etc). The footgun only
fires when a 2nd indication is activated - which won't happen yet. Don't default to A permanently - B is the real
fix for multi-indication. ***
COSMETIC CALLS: (1) land on "Atopic Dermatitis" indication (not "All") - reads intentional for demo. (2) FIX the
stale count: Immunology "All" shows 1204 placeholder; real AD Established ~7,462 - set both All + AD indication to
7462 (same data). Don't show a stale number to mentors.
FLAG (note, not fix): search/TopBar scopes Immunology to parent ta_id 4cf07827 (separate getTAIdForLabel path),
consistent w/ Oncology using oncology-parent. Out of scope for Established.
NEXT: approve Option A + 2 cosmetic calls -> Claude Code applies (plan mode) -> verify Immunology->AD renders +
NSCLC unchanged -> commit. Backlog: OPTION B (real per-indication ta_id) before any 2nd immunology indication;
also the §30cc territory/practice-location gap (separate backend).

### 30ce. DECISION REVERSED (Garrett pushed): do OPTION B now (real per-indication ta_id), not A-then-B.
Garrett: "why not just do the right fix now?" - correct. Reasons to do B now:
  - The mentor demo's whole point is multi-indication scaling; Option B makes the indication REAL, not cosmetic.
    A mentor clicking Psoriasis should get a real answer, not decorative behavior.
  - Have to do B eventually anyway; marginal cost NOW (Claude Code warmed, files traced, review in place) << total
    cost of A-now + B-later + context-switch tax.
  - Kills the footgun permanently vs leaving a "fix before activating siblings" landmine in backlog (exactly how
    latent bugs ship to a demo).
  - It's the architecturally honest version of FieldMark's "many TAs, many indications" thesis - structural not
    presentational.
Counterarguments (speed; B touches filters shape + getEstablished/getCommunity/getRisingStars signatures) are
weak: not time-boxed today, and "more surface" is well-bounded mechanical work Claude Code handles well w/ plan
mode + typecheck.
OPTION B DESIGN: add a `taId` to each indication config; thread into `filters`; the cohort fetchers use the
indication's taId when present. CRITICAL GUARDRAIL: must be ADDITIVE/BACKWARD-COMPATIBLE - an indication WITHOUT
an explicit taId falls back to the current TA-label->ta_id behavior, so NSCLC/Oncology/Hepatology/Rare Disease
behave BYTE-FOR-BYTE identical. Only Immunology's AD indication carries an explicit taId (9e4139d2) initially.
This touches the 3 shared cohort fetchers (affects all TAs' code paths) -> the backward-compat fallback is the
safety mechanism. Plan mode + typecheck + verify NSCLC unchanged.
NET RESULT: Immunology top-level TA (enabled) with AD as a REAL indication resolving to 9e4139d2; siblings can
later each carry their own taId (genuine multi-indication). Solves §30cd's footgun structurally.
NEXT: Claude Code plans Option B (plan mode, show full trace + diff) -> review (esp. the backward-compat fallback
for existing TAs) -> apply -> typecheck/build -> verify Immunology->AD renders + NSCLC/Hep byte-for-byte -> commit.

### 30cf. OPTION B plan REVIEWED. Guardrail airtight. DECISIONS: (a) "All"=recommended (AD taId), (b) thread taId into DETAIL page NOW (don't defer).
Claude Code Option B plan reviewed. Core change = one line x3 in the cohort fetchers: `const taId = filters.taId
?? TA_ID_MAP[taSlug]`. `??` = use indication's explicit taId if present, else EXACT current logic. Backward-compat
PROVEN: every existing TA has no indication taId -> undefined -> untouched TA_ID_MAP[taSlug]. Oncology/NSCLC ->
c0065b03 byte-for-byte. Effect dep indicationTaId constant-undefined for existing TAs -> zero extra fetches. SAFE.
New helper getIndicationTaId(taLabel, indicationLabel) reads taId off the indication config. FilterState/Indication
Option get optional taId field (additive). Reverts the top-level-AD-chip edits; restores Immunology as enabled chip.
DECISION (a) "All" fork = RECOMMENDED: Immunology parent ta_id 4cf07827 has 0 established rows (only AD 9e4139d2
has 7,462). So "All" must ALSO carry AD's taId (both All+AD -> 9e4139d2, count 7462, AD listed first = landing) -
else All renders empty + 7462 count is a lie. Mirrors Oncology (All ~= NSCLC). Reversible when real cross-
indication data exists.
DECISION (b) THREAD taId INTO DETAIL PAGE NOW (not deferred): Flag #2 - as feed-only-scoped, clicking an AD card
opens a detail page scoped to Immunology PARENT ta_id 4cf07827 (no data) -> EMPTY scores/narrative. For a MENTOR
DEMO that's a worse moment than no list (looks broken: Silverberg's card -> empty profile). So include the detail-
page taId threading now: thread indication taId into card-nav `state` -> consume in HCPDetailRoute. More surface
but the drill-down MUST work for the demo. (My earlier "feed only" constraint no longer applies - doing it right
means detail is AD-aware too.)
REMAINING FLAGS (accept/defer): #3 feed narratives use taSlug=immunology -> 0 for AD -> "narrative generating"
placeholder (expected, AD narratives=0). #4 getTACounts untouched -> AD count badges 0/"—" on TASelectionScreen
(cosmetic, known §30ca/cc). #2-side-panels: DOLHeroPanel/InstitutionsInTerritoryPanel/ActiveFilterPills also
parent-scoped - decide if those matter for demo (institutions panel already shows AD via the un-hardcoding? verify)
- lower priority than the detail page itself.
NEXT: approve Option B + (a) recommended + (b) include detail threading. Claude Code applies (plan mode) -> type
check/build -> verify: Immunology->AD feed renders, AD CARD CLICK -> populated detail (Silverberg profile), NSCLC/
Hep byte-for-byte unchanged, greyed immunology siblings show. Then commit.
BACKLOG (still): §30cc territory/practice-location gap (Established has 8/5131 practice states); getTACounts
_scores_v2 population for AD; side-panel parent-scoping if it matters.

### 30cg. BUG: AD detail page still parent-scoped - Silverberg (#1 in feed) shows "Unclassified" on his profile. Decision-(b) threading didn't fully land.
Compared Silverberg (AD, Image1) vs Heymach (NSCLC, Image2) detail pages. Silverberg MISSING all cohort/TA-scoped
components that Heymach has:
  - NO "Established Score" block (Heymach: 99/100, Rank 8 US/51 Global, Sci/Net/Pharma bars). Silverberg shows grey
    "Unclassified - in our database but hasn't met cohort criteria."
  - NO "Why This Expert" narrative (expected - AD narratives=0), NO Belief Profile, NO Top Collaborators.
  - BUT DOES show all hcp_id-keyed data: Identification/NPI, Top Pharma Companies, Drug Engagement, Engagement Mix,
    Publication Timeline. (These work regardless of ta_id.)
SMOKING GUN: Silverberg is #1 AD Established in the FEED (just verified §30cb) but his DETAIL page says
"Unclassified." => the detail page is querying his cohort/score under the WRONG ta_id (Immunology PARENT 4cf07827,
0 rows) -> finds no cohort record -> falls back to "unclassified + raw data" view. This is EXACTLY flag #2 from the
Option B plan ("detail page scoped to Immunology parent -> empty scores/narrative").
=> Decision (b) - thread indication taId into the DETAIL page - did NOT fully land. Feed is AD-aware (ranks #1);
detail route is still parent-scoped. Either the taId wasn't threaded into the card-nav state, or it's threaded but
NOT CONSUMED where HCPDetailRoute does the cohort/score/established lookup.
DIAGNOSIS FOR CLAUDE CODE: the signature (hcp_id data present, ta-scoped cohort/score/narrative absent + "Unclassi
fied") = the detail page's ESTABLISHED/cohort query is using taLabelToApiSlug(selectedTA)="immunology"->parent
4cf07827 instead of the indication taId 9e4139d2. Need: the indication taId must reach the detail page's cohort/
score lookup (getEstablished-equivalent for the single HCP, or however the profile resolves cohort membership +
score + rank). Verify: does getHCPDetail / HCPDetailRoute accept + use a taId? The card-nav `state` must carry it
AND the detail data-fetch must consume it for the cohort/score/narrative queries (not just the hcp_id lookups).
NOT a data gap (his AD Established record EXISTS - he's #1 in feed). Purely the detail path resolving wrong ta_id.
NEXT: hand back to Claude Code with this diagnosis - fix the detail-page cohort/score resolution to use the
indication taId. Re-verify: Silverberg detail shows Established Score ~100, Rank #1 US, Sci/Net/Pharma bars (like
Heymach). NSCLC detail (Heymach) must stay unchanged.

### 30ch. SEQUENCING: NPPES practice-state resolution MUST precede narrative generation (narratives reference location).
Garrett caught a data-dependency: AD Established narratives reference LOCATION (institution city, regional
influence, "based in..."). Generating narratives BEFORE the §30cc NPPES/practice-state resolution -> narratives
omit or misstate location -> would need full regeneration (multi-hour job, wasted). So RESOLVE LOCATION FIRST.
CORRECTED ORDER:
  1. Detail-page taId fix (§30cg) - running in Claude Code now.
  2. NPPES practice-state resolution for AD Established (§30cc) - populate nppes_practice_state (8/5131 -> most)
     + likely per-state region-scope rank rows. Backend, NPI-resolution pass (Established KOLs mostly HAVE NPIs,
     unlike the Community researchers - resolvable). ALSO fixes the frontend territory filter ("more cards appear
     accurately" - Garrett's next goal). VERIFY FIRST: how does NSCLC Established get its practice-location? = the
     working template to replicate.
  3. THEN narrative generation (~2,585 AD Established) - narratives now reference ACCURATE location. Multi-hour
     background job -> run while doing other foreground work. Writes hcp_narratives_v2 w/ AD ta_id. Test-run 5
     HCPs first (confirm writes correctly) before full run.
This is a data-DEPENDENCY ordering (narratives depend on location) - exactly what §30bd sequencing doctrine is for.
Good catch: generate out of order and you pay twice.
NEXT: finish detail fix -> NPPES practice-state resolution (verify NSCLC template first) -> narrative test-run ->
full narrative background run.

### 30ci. Detail-page bug = TWO breaks (not one). Fix reviewed + approved. + FLAG: duplicate global rows in hcp_established_ranks_v3.
Claude Code trace found the taId DID reach the detail route (earlier getHCPDetail fix worked), but TWO independent
downstream breaks the fix didn't touch:
  BREAK 1 (cohort gate): getHCPDetail returns cohort_classification from a single GLOBAL column on hcps_v2 - NULL
    for Silverberg (he's classified within AD sub-indication, not globally). DetailScreen gates the Established
    block on cohort_classification==="established" -> NULL -> never renders -> "Unclassified" banner. FIX: when
    taId passed, derive cohort from PRESENCE in hcp_established_ranks_v3 for that ta_id (= exactly how the feed
    defines the cohort). Guarded by if(filters.taId) -> NSCLC unaffected.
  BREAK 2 (breakdown slug): DetailScreen gets taSlug="immunology" -> getEstablishedScoreBreakdown resolves parent
    4cf07827 -> 0 rows. FIX: add reverse taId->slug lookup (apiSlugForTaId via SLUG_BY_TA_ID) so detail passes
    "atopic-dermatitis"->9e4139d2 where Silverberg's rows live (rank 1, score 100, sci100/net100/pharma94.89 -
    verified). Falls back to taLabelToApiSlug when detailTaId undefined -> NSCLC unchanged.
Both guarded/backward-compat: NSCLC/Hep/Rare (no taId) -> both fixes inert -> Heymach byte-for-byte. APPROVED.
*** FLAG (backend data-quality, note for cleanup): hcp_established_ranks_v3 has DUPLICATE global rows for
Silverberg (2 rows, scores 99.95 / 99.9525). getEstablishedScoreBreakdown global-rank query uses .maybeSingle()
-> ERRORS on 2 rows -> global_rank shows null (US/region rank #1 still fine). Doesn't block the fix. Echoes the
§30bd "dedup before scoring" lesson. TODO backend: (1) count how many AD Established HCPs have dup global rows -
may not be just Silverberg; (2) dedup pass on ranks_v3. (The detail fix uses .limit(1) to tolerate the dupes.) ***
NEXT: apply Parts 1+2 -> typecheck/build -> verify Silverberg detail shows Established Score 100 / Rank #1 US /
Sci-Net-Pharma bars (like Heymach) + NSCLC unchanged. Then: count dup global rows (quick diagnostic). Then the
NPPES practice-state resolution (§30cc/ch).

### 30cj. DETAIL-PAGE FIX VERIFIED in-browser. AD drill-down works end-to-end. Committing.
All 3 checks passed in-browser (logged in): Silverberg profile now shows Established block (Score 100, Rank #1 US,
Sci/Net/Pharma bars) - "Unclassified" banner gone. Other AD cards (Guttman-Yassky/Eichenfield) same. NSCLC
(Heymach) byte-for-byte unchanged. => AD-under-Immunology is COMPLETE + demo-ready: chip -> feed (Silverberg #1) ->
card click -> populated AD detail profile. Full path works.
(Global rank may still null for HCPs with dup global rows - the task_c0e748c8 dedup issue - US/region rank fine.
Separate, filed.)
STATE OF AD FRONTEND: Established cohort fully live under Immunology TA (feed + detail), Option B real per-
indication ta_id wiring, backward-compat (NSCLC/Hep unchanged), greyed immunology siblings, count 7462. On branch
ad-frontend-established. Committing.
REMAINING FOR AD FRONTEND (not blocking Established demo): Rising cohort (Medium - new RPC + 2x2->2-tile);
Community (Large - CommunityWorkspace redesign). Narratives (0, "generating" placeholder). Territory/practice-
location (§30cc, next).
NEXT: (1) dup-count diagnostic (Silverberg-only or systemic?). (2) NPPES practice-state resolution (§30cc/ch) -
verify NSCLC template first. (3) THEN narratives (background, multi-hour, after location resolved).

### 30ck. Two diagnostics: (1) dup global rows are SYSTEMIC (not Silverberg-only); (2) NSCLC Established practice-state = only 20% - the State fix = replicate NSCLC's NPI-resolution for AD.
DIAGNOSTIC 1 - DUP GLOBAL ROWS SYSTEMIC: query capped ~100, EVERY row has exactly 2 global rows. Widespread double-
insert across AD Established, not a one-off. Almost certainly recompute_established_ranks_v3.py RE-RUN without
truncate/dedup (cf §30cb "+38 from backfill drift via re-run"). task_c0e748c8 cleanup = real: dedup + UNIQUE
constraint (therapeutic_area_id, scope_type, scope_value, hcp_id) to prevent recurrence. Echoes §30bd dedup lesson.
Not blocking demo (.limit(1) tolerates, US rank shows; global rank nulls via .maybeSingle()).
DIAGNOSTIC 2 - THE STATE FIX REFRAMED: NSCLC Established = 11,390 HCPs but only 2,227 have nppes_practice_state =
~20%. So even the WORKING TA has practice-state for only 1/5 of Established. NSCLC territory filtering runs on 20%
coverage.
=> AD (8/5,131 = 0.2%) isn't uniquely broken - it just never got ANY NPI-resolution pass. NSCLC got one (2,227
populated). The FIX = run that same NPI-resolution/practice-state enrichment for AD's ta_id. AD Established KOLs
mostly have NPIs (real US clinicians) -> resolvable. Target: AD 0.2% -> ~20%+ like NSCLC. That fixes the demo
territory view ("more cards appear accurately").
CAVEAT: 20% is itself low - NSCLC's territory view also isn't complete. "Fix AD to match NSCLC" = ~20% for AD
(helps demo, not full). Deeper fix (higher NPI-resolution coverage across ALL Established) = bigger backend project,
later.
NEXT: FIND the script/mechanism that populated NSCLC's 2,227 practice-states (the enrichment pass). Candidates:
scripts/enrich/nppes_matcher.py, targeted_nppes_enrichment.py (both in repo). Determine how it selects/writes ->
run for AD ta_id 9e4139d2. Verify AD practice-state coverage jumps. THEN territory filter shows more AD cards.
(Also: per-state region-scope rank rows - §30cc noted AD has 0; does NSCLC have them? territory filter may need
them too. CHECK.)

### 30cl. State-fix trace: NSCLC's practice-states came from a SUPERSEDED all-cohort script (nppes_enrichment.py); no v2 script covers Established. Fix = populate nppes_practice_state. + FAST PATH via community_practitioners.
TRACE (Claude Code): NSCLC Established's 2,227 practice-states came from archive/superseded/nppes_enrichment.py -
a general ALL-COHORT NPPES backfill from the NSCLC-build era. v2 rebuild REPLACED it with COMMUNITY-ONLY scripts
(community_nppes_backfill, nppes_matcher, workstream_b). So NO active v2 script covers the ESTABLISHED cohort ->
AD Established sits at ~8 (only pubmed_pipeline/dedup_merge stragglers). AD didn't fail a step - the whole-cohort
enrichment stopped existing in v2; NSCLC just retains legacy fills.
FRONTEND (great news): territory filter reads nppes_practice_state DIRECTLY - column predicate on hcps_v2 join in
get_established_filtered (`h.nppes_practice_state = ANY(p_states)`). NO per-state region rows needed (no TA has
them; AD already has its 447 region/US rows). => populating hcps_v2.nppes_practice_state is the ENTIRE fix. Zero
ranks_v3 / frontend changes.
PLAN (Claude Code): Step0 verify coverage (how many AD Established have npi / already have state). Step1 NPI
coverage for the gap (targeted_nppes_enrichment.py --ta atopic-dermatitis w/ LOWERED --min-career-pubs; default
500 tuned for NSCLC, AD authors have fewer pubs). Step2 practice-state backfill (reuse community_nppes_backfill's
parse_nppes_result+apply_writes, cohort-agnostic fill-only keep_or_new, w/ a NEW --established-ta target selector
from hcp_established_ranks_v3 for 9e4139d2). Step3 none. Guardrails: keep_or_new fill-only (won't touch NSCLC's
2,227), AD-ta-scoped, dry-run first, API throttled.
*** FAST PATH (Claude Code flagged, I'm elevating it): many AD Established derms ALREADY EXIST in community_
practitioners (19,351 NPPES derms w/ NPI+practice_state from yesterday). A JOIN AD-Established -> community_
practitioners (by NPI, or name) could backfill practice-state with ZERO API calls. Silverberg/Guttman-Yassky/
Eichenfield are academic derms who are ALSO practicing clinicians -> plausibly in the 19,351 (cf the 342 matched_
hcp_id overlaps). For AD specifically, the OPERATIONAL SPINE built yesterday feeds the SCIENTIFIC cohort's location
data. Elegant + free + instant. ***
REORDERED PLAN: Step0 coverage (npi? state?). Step0.5 (NEW, fast path): how many AD Established get practice-state
from community_practitioners join (free, no API)? If it covers most -> may skip the NPPES API pass entirely.
Step1/2 (API) only for the residual the community join doesn't cover.
NEXT: run Step0 + Step0.5 coverage SQL (read-only) -> see how much the free community-join covers -> decide API
pass scope.

### 30cm. Coverage reality: AD Established has only 171/2,585 NPIs (7%). Bottleneck = NPI, not state. Fast path = 90 free via community join. Full = risky name-match.
Step0: 2,585 AD Established HCPs, only 171 have NPI (~7%), 6 have practice-state. Step0.5: 90 matchable to
community_practitioners by NPI (free state backfill). 
=> BOTTLENECK IS NPI COVERAGE, not practice-state. 93% of AD Established have NO NPI -> can't get state from
anywhere (NPPES keyed on NPI) until NPI-resolved. SAME structural truth as yesterday: publication-derived HCPs
mostly lack NPIs. Practice-state coverage gated on NPI coverage = 7%.
PATHS:
  A (free): community join UPDATE -> ~90 HCPs get state. $0, instant, trivial, zero-risk. Coverage 6 -> ~96.
    The 90 are the KOLs who are ALSO practicing derms (in the 19,351) = highest-value, most-likely-demoed.
  B (full): NPI-resolve the other ~2,414 via NPPES NAME+STATE match (targeted_nppes_enrichment, lowered pub
    threshold) THEN backfill state. Up to ~2,414 but: reintroduces the FUZZY-MATCH accuracy risk that ate hours
    yesterday (89% no-match, mismatch risk on researchers/PhDs/intl). Slow (throttled API). Real work + real risk.
RECOMMENDATION: A NOW (demo), B later as a careful scheduled backend project (w/ yesterday's fuzzy-match
skepticism + validation). Rationale: the 90 free matches = highest-value KOLs (the ones a mentor clicks); UPDATE
is instant/zero-risk; materially improves territory view TODAY. Full 2,414 name-match = real accuracy risk, needs
validation not a rushed pre-demo pass. FOR NARRATIVES: the 90 demoed KOLs getting accurate location is what
matters most; the long tail of 2,414 lower-ranked researchers matters less for demo narratives.
NEXT: Option A - the free community-join UPDATE for the 90 (AD-scoped, fill-only, dry-run/verify first). Then
proceed to narratives for AD Established (the 90 will have location; rest won't - acceptable, they're lower-ranked/
non-demoed). Backlog: Option B full NPI-resolution of Established (careful, validated, later).

### 30cn. State fast-path DONE: AD Established practice-state 6 -> 96 via free community_practitioners NPI join. Verified names/locations correct.
Ran the fill-only, AD-scoped UPDATE (hcps_v2.nppes_practice_state/city from community_practitioners by NPI). ~90
rows written. Verified 6 -> 96 AD Established HCPs now have practice-state. Sanity-checked top 25 pre-write: all
correct (Silverberg->DC/GWU, Simpson->OR/OHSU, Eichenfield->CA/UCSD, Feldman->NC/Wake, Bunick->CT/Yale, Margolis->
PA/Penn, Wan->MD/Hopkins etc). Clean NPI join, no mismatches. Guardrails held: fill-only (nppes_practice_state IS
NULL -> can't overwrite NSCLC's 2,227), AD-ta-scoped. Dup global rows appeared in the join (each name x2) but
UPDATE idempotent on hcps_v2 (one row per h.id) - harmless; dedup still pending (task_c0e748c8).
=> The 96 = the highest-value AD KOLs (also practicing derms). Territory view now shows meaningfully more NE cards
(Nanette Silverberg/Alexis/Brunner NY, Margolis PA, Bunick CT, Wan MD). Free, instant, zero API. The operational
spine (yesterday's 19,351 derms) fed the scientific cohort's location - the two-intelligence architecture paying
off concretely.
REMAINING (backlog, not demo-blocking): Option B - NPI-resolve the other ~2,414 AD Established (7% NPI coverage) via
careful validated name-match (fuzzy-match risk per yesterday). Deferred. The 96 cover the demoed KOLs; long tail
is lower-ranked researchers.
NEXT: verify territory view in browser (more NE cards) -> THEN narratives for AD Established (now the demoed KOLs
have accurate location for the narrative text). Narrative gen = multi-hour background job (test 5 first).

### 30co. STRATEGIC FINDING: AD Established is an INTERNATIONAL academic cohort - 78% of no-NPI HCPs are non-US. US-territory filtering has a hard ceiling AD doesn't share with NSCLC. Dry-run (no writes).
Ran the NPI-resolution DRY-RUN on the 2,414 no-NPI AD Established (faithful to production matcher). KEY FINDINGS:
  - *** 1,884 of 2,414 (78%) are EXPLICITLY NON-US *** (DE/JP/KR/IT/GB...). AD "global" Established is dominated by
    European/Asian academic derm KOLs w/ NO US NPI. US-resolvable universe = only ~530 (vs NSCLC's 2,227 US-heavy).
    HARD CEILING on US-territory filtering for AD that NSCLC didn't have. NOT a matcher bug - the NATURE of AD
    (globally-distributed specialty). "It worked for NSCLC" DOESN'T transfer: AD != NSCLC (international field).
  - Matcher yield on the 530 US: 25 HIGH-confidence / 81 ambiguous (held) / 424 no-match. Running "for real" = 25
    rows written. Barely > the 96 already free.
  - THRESHOLD: --min-career-pubs 500 must be REMOVED (0 AD no-NPI HCPs have >=500 pubs; max 301, avg 14. Established
    membership IS the quality filter).
  - *** CRITICAL FAILURE MODE (why dry-run first was right): the TOP US KOLs FAIL. Guttman-Yassky (#2 Mount Sinai)
    -> NO MATCH. Abuabara (#36 UCSF) -> NO MATCH. Cause: HYPHENATED/COMPOUND/ACCENTED surnames break exact-last-
    name match (Guttman-Yassky, Yamamoto-Hanada, Akdis). Conservative matcher misses exactly the highest-value
    people while correctly skipping intl. Blind run = 25 mid-tier writes + Guttman-Yassky STILL blank. ***
  - Only 1 of 25 high matches has state cross-check (these HCPs lack a state to corroborate = the chicken-egg the
    task tries to break). Parallel community_practitioners pass independently yielded 16 high (complementary).
CONFIDENCE GATE (agreed): WRITE only `high` (single NPPES verified name+derm-taxonomy). NEVER write ambiguous/
no_match (wrong location on a KOL profile worse than blank). Manual eyeball the high set before writing (few, no
state corroboration).
DECISION: do Claude Code's rec (a) - add SURNAME-NORMALIZATION pass (split hyphens, try components, strip accents)
+ re-run dry-run. Recovers the demo-critical misses (Guttman-Yassky, Abuabara). THEN review the improved high set,
manual-eyeball, write only high.
STRATEGIC IMPLICATION (bigger than the fix): AD territory filtering is inherently limited - it's an international
cohort. The US-practicing-derm population for AD lives in COMMUNITY (19,351), not Established. Established territory
view will always be sparse for AD (mostly intl KOLs). This is correct + worth articulating to mentors: "Established
= global scientific leaders (many intl); Community = US practicing derms (territory-rich)." Reinforces the two-
intelligence split.
NEXT: surname-normalization re-run (dry-run) -> review improved high set -> manual eyeball -> write high only ->
backfill their state. Then narratives.

### 30cp. NPI dry-run v2b: taxonomy ALLOW-LIST is the key - 67 clean high-confidence (was 25). Ambiguous 101->2. Reviewing 67 via CSV before write.
Progression: v1 (exact name+exclusion) 25 high / 81 amb / 424 no-match -> v2a (+surname normalization) 62/101/367
-> v2b (+taxonomy ALLOW-LIST derm/allergy/immunology) 67 HIGH / 2 amb / 461 no-match. The allow-list simultaneously
REMOVED ~20 false positives (vet, dentists, counselors, NP, SLP) AND RESCUED real matches from ambiguous (only-one-
same-name-candidate-is-a-derm -> unambiguous high). Ambiguous collapsed 101->2. The 67 are uniformly Dermatology/
Allergy&Immunology/Peds-Allergy-Immunology - "reads like a real AD clinical roster."
TOP-KOL RECOVERY: Abuabara (#36 -> NPI ...216, Derm Philadelphia) + Lio (#17 -> Derm Chicago, taxonomy
disambiguated a common name) NOW RESOLVE (were no-match in v1). Residual misses: Guttman-Yassky, Sidbury = NPPES
last_name search quirk on HYPHENATED compound surnames (won't return even verbatim) -> MANUAL ENTRY for the
trivially-few top KOLs.
FINAL GATE (agreed): write only single-NPPES-result w/ exact-first-token + whole-surname compressed-equality
(accent/hyphen/space-insensitive) + taxonomy in {derm, allergy, immunology} = the 67. MANUAL EYEBALL the ~10
common-name entries first (James Taylor/Jennifer Chen/Emily Cole/Robert Wood/Kelly Stone - taxonomy-plausible +
exact-name but no state corroboration -> coincidental same-name derm POSSIBLE). HAND-ENTER Guttman-Yassky/Sidbury/
top-40 hyphenated misses. NEVER write the 2 ambiguous or 461 no-match. Precision-over-recall accepted (drops genuine
AD clinician w/ non-allergy taxonomy - blank beats wrong).
=> Export 67 to CSV (rank/name/institution/proposed NPI/NPPES name/state/city/taxonomy, ~10 common-name FLAGGED)
for review BEFORE any DB write. Same eyeball discipline as the community-join 25. Confirm ~57 unambiguous look
right + scrutinize the ~10 flagged individually (keep clear, drop uncertain).
RESULT WHEN WRITTEN: ~67 more AD Established get NPI -> unlocks their practice-state backfill (96 -> ~160+ w/ state).
Plus manual top-KOL entries. Still capped by the 78%-international ceiling (§30co) - this maxes the US-resolvable set.
NEXT: review CSV -> write approved high set -> manual KOL entries -> state backfill -> THEN narratives.

### 30cq. NPI CSV review: add INDUSTRY-affiliation flag (Claude Code caught David Berk/Atara -> clinical NPI false-positive risk). Review flagged + location-mismatch scan.
CSV ad_established_npi_proposals_dryrun.csv (67 rows) exported, NO writes. Columns incl nppes_candidate_count +
review_flag. 11 rows flagged REVIEW(common name) (>=8 candidates). 
CLAUDE CODE CAUGHT a 2nd failure mode the flag missed: INDUSTRY/NON-CLINICAL affiliations. #510 David Berk (inst
"Atara Biotherapeutics") matched a clinical Dermatology NPI (cand=5, unflagged). Industry scientists often have NO
clinical NPI -> same-name match to a clinician = false positive by construction. Orthogonal to candidate-count.
=> Adding 2nd review_flag reason: industry/biotech institution (Atara + '...therapeutics/biosciences/pharma/inc').
REVIEW STRUCTURE: unflagged (~55) = scan-and-trust tier (exact name + single/taxonomy-disambiguated derm, real
institution = same safety class as community-join 25). Flagged (~11 common-name + industry) = judgment. Decision
rule per flagged: does NPPES practice location CORROBORATE the HCP's known institution? corroborated -> keep; high-
candidate + no corroboration -> drop (blank beats wrong); industry + clinical NPI -> drop unless strongly
corroborated.
WATCH (even unflagged): institution-vs-NPPES-location MISMATCH. E.g. Abuabara inst=UCSF(SF) but NPPES NPI=
Philadelphia (cand=1, unflagged) - could be legit (stale NPPES / prior practice) or wrong match. Scan the trust
tier once for inst-vs-location mismatches too.
Guttman-Yassky + Sidbury still absent (hyphenated-surname NPPES quirk) -> hand-enter.
WRITE PLAN (on approval, dry-run-first): (1) set hcps_v2.npi_number for approved HCPs. (2) practice-state backfill
(community_nppes_backfill fill-only logic) over just those NPIs. Nothing to DB until approved.
NEXT: regenerate CSV w/ industry flag -> Claude Code pastes flagged rows inline + confirms unflagged are exact-
single-derm -> review flagged individually + scan trust tier for location mismatch -> approve write set -> write.

### 30cr. NPI flagged-row review: DECISION PRINCIPLE = location-match trumps candidate-count. Keep 7, drop 8 of the 15 flagged. + 52 unflagged clean.
Reviewed 15 flagged rows. PRINCIPLE: does NPPES practice location corroborate the HCP's known institution? location
match = the disambiguator (only 1 of N same-name candidates is in that city) -> trumps high candidate count.
KEEP (7) - location corroborates institution OR unique/real-derm:
  - Matthew Turner: Roudebush VA Indianapolis = NPPES Indianapolis IN. keep.
  - Rachel Miller: Mt Sinai NY = NPPES New York NY. keep.
  - John Browning: UT San Antonio = NPPES San Antonio TX. keep.
  - James Taylor: Cleveland Clinic = NPPES Cleveland OH (common name but location pins it). keep.
  - Jennifer Chen: Stanford = NPPES Stanford CA (common name but location pins it). keep.
  - Seminario-Vidal: Lilly keyword-flagged but cand=1 unique, real derm (CC noted). keep.
  - Bhatia: "Therapeutics Clinical Research" = his own site, cand=3, real derm (CC noted). keep.
DROP (8) - location MISMATCH or industry-staff/clinician collision (blank beats wrong):
  - Carla Davis: Baylor Houston vs NPPES DC. mismatch. drop.
  - David Berk: Atara Biotherapeutics (industry) vs NPPES St Louis. collision. drop.
  - Mark Kaplan: Indiana vs NPPES Gurnee IL, 18 cand. mismatch. drop.
  - Jason Meyer: SF VA vs NPPES Nashville TN. mismatch. drop.
  - Maria Rueda: Eli Lilly (industry) vs NPPES Seymour TN. collision. drop.
  - Emily Cole: Emory Atlanta vs NPPES St Louis MO. mismatch. drop.
  - Dana Wallace: Nova FL = NPPES Ft Lauderdale FL (state matches) BUT 15 cand, no city confirm. drop (cautious).
  - Kelly Stone: NIH vs NPPES DC (loose), 20 cand, common. drop (cautious).
52 unflagged CONFIRMED clean (exact-name single-derm-taxonomy, <8 cand, non-industry). => WRITE SET = 52 unflagged
+ 7 kept flagged = 59. Plus hand-enter Guttman-Yassky + Sidbury (hyphenated misses).
ALSO scan unflagged for the Abuabara-type location mismatch (inst UCSF/SF vs NPPES Philadelphia, cand=1 so unflagged)
- CC's confirmation didn't call additional ones; accept unflagged but note Abuabara's mismatch (could be stale NPPES/
prior practice - keep but flag for the narrative to not over-specify her city).
NEXT: tell Claude Code the write set (52 unflagged + 7 named keeps, drop the 8) -> dry-run-first write of npi_number
-> practice-state backfill over those NPIs -> hand-enter Guttman-Yassky/Sidbury -> verify state coverage jump ->
THEN narratives.

### 30cs. NPI write dry-run: 57 to write (2 excluded = duplicate-HCP-record KOLs). GO for execute. 96 -> ~153 coverage.
Dry-run: all 59 approved resolved to unique hcp_ids, all npi_number NULL + no practice_state -> clean fill-only
write of 57. Includes the 7 kept-flagged + top KOLs (Abuabara, Lio, Steinhoff, Beck, Nadeau, Chatila). Guardrails
confirmed: fill-only (WHERE npi_number IS NULL / practice_state IS NULL), scoped to 57 AD-Established hcp_ids,
dup-NPI conflicts excluded, service-role. GO given.
2 EXCLUDED (Donald Leung 1215012950, April Armstrong 1356477087): NPI already on ANOTHER hcps_v2 row -> these KOLs
have DUPLICATE HCP RECORDS (pub-side no-NPI row in AD Established + separate NPI-bearing row). Unique constraint
correctly blocked. = DEDUP candidates (like Janne/Reddy merges), not matcher errors. Merging carries NPI+state over.
=> THIRD duplicate-data symptom today (dup global rank rows §30ck, now dup HCP rows). Broader AD dedup pass owed.
Create dedup task chip (Leung+Armstrong + scan for more) - AFTER the 57-write, not blocking.
NEXT: execute 57-write (96->~153) -> create dedup chip -> hand-enter Guttman-Yassky/Sidbury NPIs (manual NPPES
lookup) -> verify coverage -> THEN narratives. Abuabara noted: NPPES says Philadelphia vs inst UCSF - keep NPI but
narrative shouldn't over-specify her current city.

### 30ct. NPI/state write DONE + verified: 96->153 practice-state, 171->228 NPI. State work complete (at US ceiling). 3 dup symptoms = 1 root cause.
Executed + independently verified: AD Established global with npi_number 171->228 (+57), with nppes_practice_state
96->153 (+57). Spot-check correct (Abuabara NPI ...216 PA/Philadelphia; Lio ...923 IL/Chicago). Fill-only, scoped,
2 dup-NPI conflicts skipped.
DEDUP PATTERN (key insight): task_f93e84de (merge dup AD Established HCP records: Leung+Armstrong + broader scan) +
task_c0e748c8 (dup hcp_established_ranks_v3 global rows) = THREE dup symptoms today likely sharing ONE root cause:
the AD pipeline's upsert/dedup logic producing dupes across hcps_v2 AND ranks_v3. Fix at SOURCE (one root-cause
pass on the AD upsert) then clean existing dupes. Echoes §30bd dedup-before-scoring. Backlog.
HOUSEKEEPING: move review CSV -> docs/; preserve the write/matcher script -> scripts/enrich/ (REUSABLE: taxonomy-
allow-list + surname-normalization matcher is valuable for AD long-tail + future TAs; don't lose to scratchpad).
STATE WORK COMPLETE: 153 practice-states = the US-resolvable ceiling for AD Established (78% intl, §30co). Wrong
matches excluded, demoed KOLs covered w/ verified locations. Remaining: hand-enter Guttman-Yassky + Sidbury (manual
NPPES lookup -> 153->155); the international majority is correctly unresolvable.
NEXT: (1) hand-enter the 2 KOL NPIs. (2) housekeeping (CSV->docs, script->scripts/enrich). (3) NARRATIVES - test 5
first (confirm writes hcp_narratives_v2 w/ AD ta_id + reads well + uses location where present), then full/scoped
run. Abuabara caveat: NPPES=Philadelphia vs inst UCSF -> narrative shouldn't over-specify her current city.

### 30cu. AD profile-components diagnosis: 1 scoping bug to fix NOW (hardcoded NSCLC), rest = the ENRICHMENT/SYNTHESIS LAYER never run for AD.
Claude Code traced every AD detail-page component. THE PATTERN: AD's build populated the SCORING layer (ranks_v3 +
3 percentile tables) but NOT the downstream ENRICHMENT/SYNTHESIS layer. Narratives, AI scientific-position overviews
(Belief Profile), top-collaborator pairing, research-theme extraction = all NSCLC-only (pipeline steps never run for
AD). Apart from the Established score block (lone true scoping bug, fixed §30ci), every missing AD component = a
DATA-GEN GAP.
RENDERS CORRECTLY FOR AD: Identity/Identification (NPI/state now populated for the 57), Top Pharma, Drug Constella
tion, Publication Timeline (all hcp_id-keyed, TA-agnostic), Established Score block (fixed).
MISSING (component / source table / cause):
  - Belief Profile (ScientificNarrativeSection <- hcp_ai_overviews synthesis_type=scientific_positions): 0 AD rows
    = DATA GAP + a LATENT HARDCODE BUG (DetailScreen.tsx:1589 <ScientificNarrativeSection therapeuticArea="NSCLC"/>
    hardcoded; getScientificNarrativeForHcp filters hcp_ai_overviews.therapeutic_area="NSCLC"). Same class as the
    score-block fix. => generate data AND fix hardcode.
  - Top Collaborators (hcp_top_collaborators_v2): 0 AD rows = pure DATA GAP. (network_centrality_v2 DID run for AD -
    19,925 rows, why Network bar shows - but the collaborator-PAIRING step didn't. different pipeline stage.)
  - Why This Expert (hcp_narratives_v2): 0 AD = pure DATA GAP (narrative gen, build-doc step 12, pending). Minor:
    getHCPNarrative header falls to slug from hcp.specialty -> "immunology" not "atopic-dermatitis" (latent slug
    mismatch, moot while AD narratives=0, fallback tries any-slug).
  - Research Themes (hcp_research_themes_v2): 0 AD = pure DATA GAP (theme-extraction never run over AD corpus; hcp_
    id-keyed, no TA filter, NO scoping bug).
*** FIX NOW (fold into commit): the hardcoded therapeuticArea="NSCLC" at DetailScreen.tsx:1589 - DEMO LANDMINE:
masked now by AD data gap, but the moment AD hcp_ai_overviews is generated (or an AD HCP shares an hcp_id-keyed
overview) it SILENTLY SHOWS NSCLC BELIEF DATA ON AD PROFILES. Same fix as score block: replace "NSCLC" literal with
resolved AD slug (taLabelToApiSlug/detail taId). Cheap, removes live footgun. ***
BACKLOG = "RUN THE AD ENRICHMENT/SYNTHESIS LAYER" (each = existing NSCLC pipeline step pointed at AD ta_id):
  1. narrative gen -> hcp_narratives_v2. 2. AI scientific-positions synthesis -> hcp_ai_overviews (Belief Profile).
  3. top-collaborator pairing -> hcp_top_collaborators_v2. 4. research-theme extraction -> hcp_research_themes_v2.
  Coherent batch, not 4 ad-hoc runs. (Narratives first, after location - §30ch. Also fix the getHCPNarrative slug
  mismatch when running narratives.)
NEXT: fix the :1589 hardcode NOW (fold into commit) -> then the enrichment-layer batch as backend jobs (narratives
lead). The scoring layer is done; the synthesis layer is the remaining AD backend work.

### 30cv. Enrichment scope: Top 200 each of Established/Rising/Community. FLAG: enrichment layer is PUBLICATION-DERIVED - fits Established+Rising, probably NOT Community.
Garrett scoped the enrichment batch to Top 200 Established + Top 200 Rising + Top 200 Community (not full corpus).
Good: covers demoable, fast, cohort-aware.
DEPENDENCY CHECK per cohort:
  - ESTABLISHED top 200: clean, ready (hcp_established_ranks_v3 live+ranked). Run enrichment now.
  - RISING top 200: data exists (hcp_rising_composite_v1, 5,719) but frontend NOT repointed yet (pending Medium
    task). Enrichment doesn't depend on frontend -> generate now so it's READY when frontend catches up. Smart to
    pre-enrich. (Rising profiles just not VISIBLE until repoint.)
  - COMMUNITY top 200: TWO issues. (a) "top 200 by WHAT"? Community has NO single score (deliberately multi-
    dimensional §30bs). Needs a rank definition (AD-drug $? a dimension?). (b) MORE FUNDAMENTAL: the enrichment
    layer (narratives, belief profiles, top-collaborators, research-themes) is ALL PUBLICATION-DERIVED - needs a
    scientific corpus. Community practitioners are mostly NON-PUBLISHING (the whole point of the operational spine).
    A community derm w/ no pubs CAN'T have a "Why This Expert" narrative or co-author network. => enrichment layer
    is STRUCTURALLY INAPPLICABLE to most of Community.
=> Community's "profile" is a DIFFERENT artifact: the operational card (Commercial/Scientific/Practice dimensions,
"why she's here" line, cross-cohort badge) - NOT an AI publication-narrative. Enriching Community w/ the pub-derived
layer would produce empty/nonsensical results for non-publishing derms.
PROPOSED: run the enrichment batch for Top 200 ESTABLISHED + Top 200 RISING now (both publication-derived, layer
applies). DEFER Community - its "profile completeness" = the Community Workspace build (wiring the dimensions/card
to real data), a DIFFERENT task, not this enrichment layer. The ~342 matched_hcp_id community derms who ARE also
in the scientific corpus could get scientific enrichment via their hcps_v2 row, but that's an edge case.
NEED GARRETT'S READ: agree to enrich Established+Rising now, handle Community via the Workspace build (not pub-
enrichment)? Or is there a Community-specific enrichment intent I'm missing?

### 30cw. Community narrative: Garrett wants top-by-patient-volume -> narrative. REALITY: no volume data (claims unaffordable). Proxy = AD engagement. Narrative = OPERATIONAL (not publication).
Garrett: sort Community by PATIENT VOLUME, top 200 get a narrative. Two problems:
  PROBLEM 1 - NO PATIENT VOLUME DATA. Volume/prescribing = commercial claims (IQVIA/Komodo) = the data Garrett said
  can't afford (the whole reason Community is Open-Payments-based §30bo). No volume field exists anywhere. => "sort
  by volume" -> "sort by best PROXY". Best available proxy = AD-DRUG OPEN PAYMENTS engagement (deep Dupixent/Rinvoq
  $ = demonstrably active in AD treatment). Name it HONESTLY (engagement, not volume - §30bo rule).
  PROBLEM 2 - NARRATIVE SOURCE. Community derms DON'T PUBLISH -> the Established/Rising PUBLICATION-narrative
  generator has nothing to draw from. BUT can generate an OPERATIONAL engagement narrative from Open Payments +
  NPPES: "High Dupixent+Rinvoq engagement 3yr, no prior company relationship, pediatric AD focus, Boston, sole
  practitioner." Genuinely useful, AI-written, sourced from operational data not pubs. = a DIFFERENT generator
  (same idea, different inputs).
WHAT GARRETT IS ACTUALLY PROPOSING (made precise):
  1. Rank Community by AD-drug engagement (honest volume proxy).
  2. Top 200.
  3. Generate OPERATIONAL engagement narrative for those 200 (from OP + practice data) -> becomes the "why she's
     here" briefing text on the Community card (the locked CommunityWorkspaceV3 design already has this slot).
= a NEW Community-specific enrichment. Good idea - makes top Community derms feel as complete as Established, w/
operationally-grounded text. Distinct from the pub-enrichment batch (which stays Established+Rising).
DECISION NEEDED: (a) confirm engagement-as-volume-proxy (honestly labeled), and (b) is the operational Community
narrative a NOW build or does it wait for the Community Workspace build (since the narrative slot lives in that UI)?
Leaning: the Community operational narrative naturally belongs WITH the Workspace build (the card that displays it
isn't built yet) - so enrich Established+Rising now (pub-narratives), and fold the Community operational narrative
into the Workspace build. But if Garrett wants the 200 narratives generated now as a backend asset ready for the
UI, that's fine too (data can precede UI, like pre-enriching Rising).

### 30cx. Dedup task_c0e748c8 -> do BEFORE enrichment (enrichment selects top-200 from this table). Investigate read-only first.
WHY BEFORE ENRICHMENT: narratives/belief/collaborators select "top 200" by rank from hcp_established_ranks_v3 -
the dup table. Enriching against 2-rows-per-HCP risks: only 100 distinct HCPs selected, double-generation, or rank
weirdness. Clean dupes FIRST -> enrichment selects a correct clean top 200. Prerequisite, not detour.
SAFE SEQUENCE (destructive DB op on a table the live frontend reads - full care):
  1. QUANTIFY (read-only): GROUP BY (ta_id,hcp_id,scope_type,scope_value) HAVING count>1. CRITICAL: AD-only or also
     NSCLC (c0065b03)? If AD-only -> scope dedup to AD, NSCLC untouched (safe). If NSCLC too -> extreme care (frozen
     production TA). Strong hypothesis: AD-only (from AD recompute re-run §30ck). VERIFY before touching.
  2. INSPECT dupe pairs: confirm genuine dupes (Silverberg 99.95 vs 99.9525 = re-run drift, near-identical). Keep-
     rule: highest cohort_score (more-complete/corrected computation).
  3. Claude Code PROPOSES dedup + UNIQUE-constraint SQL -> review (DELETE correctly scoped? keeps exactly 1 row/key?
     constraint matches (hcp_id, ta_id, scope_type, scope_value)?).
  4. RUN (service-role, RLS-migration-level care) -> verify 1 row/HCP, Silverberg global rank renders.
THE REAL FIX = UNIQUE (hcp_id, therapeutic_area_id, scope_type, scope_value): prevents recurrence - next accidental
recompute re-run CAN'T double-insert (conflicts/errors loud instead of silently duping). §30bd dedup lesson made
structural. Also consider changing recompute_established_ranks_v3.py to upsert (ON CONFLICT DO UPDATE) or truncate-
first.
NOTE: this is 1 of the 3 dup symptoms (§30ct) - task_f93e84de (dup HCP records Leung/Armstrong) is the 2nd; may
share root cause (AD pipeline upsert). This task fixes the ranks_v3 symptom + adds the guard.
NEXT: run the quantify query (step 1, read-only) -> is it AD-only? how widespread? -> inspect pairs -> review
proposed SQL -> run -> THEN proceed to enrichment (narrative script location + test-5).

### 30cy. Narrative generator analysis: SLUG MISMATCH (must fix frontend read first) + RISING INCOMPATIBLE (script change needed). Established-only now.
Script: scripts/narrative/generate_narratives_v2.py (Sonnet-based, cohort-templated). Writes narrative/why_now/
engagement_angle/signal_strength/caution_flags per HCPxTA. Flags: --cohort (established/rising/community/all),
--established-top (def 100), --rising-top (100), --community-top (500), --dry-run, --force, --target-version (MUST
pass v2), --hcp-id. NO --ta flag - scopes via load_visible_ta_ids() (therapeutic_area_ingestion_config WHERE
is_visible_in_ui AND is_active); generates for every visible TA's top-N; --force-off + freshness skips NSCLC.
*** CRITICAL - SLUG MISMATCH (would silently waste the run): generator WRITES therapeutic_area_slug="atopic-
dermatitis" (= therapeutic_areas.slug for AD ta_id). But frontend READS "immunology" (AD modeled as Immunology TA:
getHCPDetail narrative query taLabelToApiSlug("Immunology")="immunology"; getHCPNarrative uses hcp.specialty=
"immunology"). write != read -> narratives generate but DON'T RENDER (getHCPDetail is TA-strict, no fallback).
FIX FIRST (recommended, same pattern as score-block/DetailScreen:1589): make frontend narrative READS resolve the
AD slug (atopic-dermatitis via apiSlugForTaId/taId). NOT the quick-wrong option (write "immunology" -> collides w/
future Immunology indications). One more small frontend fix, THEN write-slug matches everywhere. ***
*** RISING INCOMPATIBLE: generator's Rising path reads hcp_rising_star_ranks_v3 + OLD MOMENTUM tables (scientific_
momentum_v1/network_momentum_v1). AD Rising lives in hcp_rising_composite_v1/hcp_scientific_emergence_v1 (new 2-axis
model). Running Rising now -> selects 0 AD HCPs, can't read Emergence context. AD RISING NARRATIVES NEED SCRIPT
CHANGES, not just a run. Defer - pairs naturally with the Rising FRONTEND repoint (same new-table migration). ***
OTHER BLOCKERS (flag-handled): must pass --target-version v2 (v1 = wrong table); --hcp-id single-mode FAILS for AD
(cross-checks hcps_v2.cohort_classification=="established" which is NULL for AD -> ValueError) -> use TOP-N path
only (overrides cohort from rank selection); confirm AD is_visible_in_ui=true in therapeutic_area_ingestion_config
or top-N selects nothing.
ESTABLISHED SELECTION WORKS FOR AD: fetch_established_top_hcp_ids top-N by rank from ranks_v3 (scope_type='region',
scope_value='US'), sets cohort_classification="established" from rank selection (doesn't rely on null global col).
REORDERED PLAN: (1) dedup ranks_v3 first (in progress). (2) FIX frontend narrative read slug (AD->atopic-dermatitis,
same pattern as prior fixes). (3) Established narrative test: --cohort established --established-top 5 --target-
version v2 --dry-run (note: iterates all visible TAs, NSCLC freshness-skipped). (4) verify renders + reads well ->
(5) full Established top 200. RISING narratives deferred (needs script update to new tables, pairs w/ Rising frontend
repoint). Community deferred (operational narrative w/ Workspace build, §30cw).

### 30cz. Dedup investigation: AD-ONLY (NSCLC clean), 2,546 exact global pairs from a partial recompute re-run. Discriminator = computed_at. Draft dry-run.
BLAST RADIUS: AD-only (ta 9e4139d2). NSCLC c0065b03 + all other TAs = ZERO dups. 2,546 duplicate groups, all exact
pairs, 2,546 excess rows, 2,546 HCPs. ENTIRELY scope_type='global' (region scopes clean).
ROOT CAUSE (visible in data): two AD recompute runs 2026-07-08 - 15:46:57 (PARTIAL, 2,546 global-only) + 18:16:34
(COMPLETE, 4,916 = 2,585 global + 2,331 region). Writer INSERTs w/o upsert/delete-first -> the 2,546 global HCPs in
BOTH runs = the dups. (Matches §30cb "+38 from re-run" note.) Later run's region rows + ~39 extra global HCPs
unaffected.
GENUINE DUPES confirmed: same hcp_id/TA/global, identical scientific_influence_pctile, marginal re-sort drift only
(rank/score/network) - two generations of same logical row, differ only by id + computed_at.
CLEAN DISCRIMINATOR: computed_at. Keep 18:16:34 (complete/consistent), drop 15:46:57 (leftover partial). Every pair
has exactly one row per timestamp -> separates cleanly. BETTER than "keep highest score" (based on WHICH RUN was
authoritative, not arbitrary tiebreak).
FIX (dry-run first): DELETE the 2,546 rows WHERE computed_at='2026-07-08 15:46:57' AND scope_type='global' AND ta=
AD (exactly 2,546). Verify AD global 5,131 -> 2,585 distinct. Add UNIQUE (therapeutic_area_id, hcp_id, scope_type,
scope_value). 
CONSTRAINT SIDE EFFECT: recompute_established_ranks_v3.py plain INSERT will ERROR on future re-run (conflict) instead
of silently duping = DESIRED short-term (fail loud). LONG-TERM: move script to upsert (ON CONFLICT DO UPDATE) or
delete-first so re-runs are clean. (Same root-cause class as task_f93e84de dup HCP records - the AD pipeline's non-
idempotent writes.)
NEXT: review the dry-run (DELETE targets exactly 2,546? pre/post 5,131->2,585? constraint DDL?) -> approve -> run ->
verify Silverberg global rank renders (was null via .maybeSingle() on 2 rows) -> THEN slug fix -> narrative test-5.

### 30da. Dedup ROOT CAUSE found (better than expected): NULLS-DISTINCT constraint let global(NULL scope_value) rows escape the existing upsert. Fix = NULLS NOT DISTINCT constraint swap. Migration-file.
CORRECTION to §30cz: recompute script ALREADY upserts (INSERT ... ON CONFLICT (hcp_id,ta_id,scope_type,scope_value)
DO UPDATE, line 200-215). The bug is subtler: the EXISTING unique constraint (hcp_established_ranks_v3_hcp_id_
therapeutic_area_id_scope_t_key) is STANDARD (NULLS DISTINCT). Global rows have scope_value=NULL; Postgres treats
NULLs as DISTINCT -> two global NULL rows NEVER conflict -> ON CONFLICT never fires -> duplicate on re-run. Region
rows (non-null) conflict + upsert cleanly. => explains global-ONLY + AD-only (AD got re-run Jul-8 15:46+18:16;
NSCLC frozen after single run so never hit the NULL-escape).
FIX (better than "add constraint"): SWAP the standard unique for NULLS NOT DISTINCT (PG15+; on 17.6). Then NULL
global rows CONFLICT -> existing upsert fires -> future re-runs UPDATE IN PLACE not duplicate. NO script change
needed (upsert was always correct; constraint just needs to recognize NULL-scope conflicts). Genuinely FIXES
recurrence, not just guards.
REVIEW CHECKS PASS: DELETE targets exactly 2,546 (0 orphans, every deleted row has an 18:16 twin); pre/post 5,131
-> 2,585 distinct (one row each); constraint DDL drops standard unique, adds NULLS NOT DISTINCT (hcp_id, ta_id,
scope_type, scope_value). Atomic txn: DELETE first (dupes must be gone before stricter constraint creates), then
constraint swap, one BEGIN/COMMIT.
CAUTION CONFIRMED SAFE: the swapped constraint is TABLE-WIDE (all TAs, not just AD). Changes uniqueness semantics
for NSCLC etc too - but that's DESIRED (would've prevented NSCLC dupes too) and constraint CREATION succeeds because
quantify confirmed zero dups outside AD. Safe.
RUN MECHANISM: write to migrations/ file (like RLS lockdown §30bz), run in Supabase SQL editor - version-controlled,
final eyes before executing on production table. (Not direct-run.)
POST-FIX VALIDATION (Claude Code suggested): run recompute_established_ranks_v3.py --ta atopic-dermatitis twice
(--dry-run first) + re-check dup query returns 0 - confirms re-runs no longer duplicate.
NEXT: write migration file -> review -> run in SQL editor -> verify DELETE 2546 + 2,585 distinct + Silverberg global
rank renders -> THEN slug fix -> narrative test-5. (This also structurally explains task_f93e84de's dup HCP records
may be a DIFFERENT root cause - that's hcps_v2 not ranks_v3 - keep separate.)

### 30db. DEDUP DONE + VERIFIED. AD ranks_v3 global 5,131->2,585 distinct (one row/HCP). Constraint swapped to NULLS NOT DISTINCT. Recurrence structurally prevented.
Ran migrations/2026_07_10_dedupe_ad_established_ranks_v3_global.sql in Supabase SQL editor. "Success. No rows
returned" (normal - DELETE/DDL don't return rows; editor swallows the DELETE count). VERIFIED via 3 read queries:
  1. AD global: 2585 rows / 2585 distinct (was 5,131) = exactly one global row per HCP. DELETE applied.
  2. Constraint: hcp_established_ranks_v3_hcp_ta_scope_uq present (old ..._scope_t_key gone). Swap applied.
  3. Dup-check (>1 global row per hcp): 0 rows. No dupes remain.
=> RECURRENCE STRUCTURALLY PREVENTED: NULLS NOT DISTINCT means next recompute --ta atopic-dermatitis re-run -> global
NULL-scope rows CONFLICT -> existing upsert fires -> updates in place, no duplication. Bug can't recur. No script
change needed.
PAYOFF: Silverberg global rank should now RENDER (was null via .maybeSingle() on his 2 rows; one row now). VERIFY
in app.
Migration file untracked -> commit to ad-frontend-established alongside AD work + close task_c0e748c8 (superseded).
STATUS: today's dedup prerequisite DONE. ranks_v3 clean -> enrichment can now select a correct top-200. 
NEXT: (1) verify Silverberg global rank in app. (2) commit migration + close chip. (3) SLUG FIX (frontend narrative
reads resolve AD->atopic-dermatitis, §30cy). (4) narrative test-5 (Established, dry-run then real). (5) full
Established top 200. [Context: Code ~72% - natural point for a FRESH Code session for narrative work; state safe in
this doc + chips.]
(task_f93e84de dup HCP records = separate, hcps_v2 not ranks_v3, likely different root cause - still pending.)

### 30dc. Narrative slug fix REVIEWED + approved. Two read sites, both backward-compat. (Fresh Code session.)
Fresh Code session traced the slug mismatch to TWO narrative read sites (both found - my worry addressed):
  FIX 1 (getHCPDetail, api.ts:1582): narrativePromise filtered therapeutic_area_slug=taSlug="immunology" -> no
    match -> hcp.narrative=null. Fix: derive narrativeTaSlug = apiSlugForTaId(taId) ?? taSlug -> AD reads "atopic-
    dermatitis". Same pattern as score-block fix.
  FIX 2 (DetailScreen.tsx:727): getHCPNarrative called with hcp.specialty="immunology" -> missed AND fell back to
    HCP's most-recent narrative across ANY TA (could show unrelated TA's narrative = worse-than-blank). Fix: pass
    the already-correct taSlug prop (App resolves via apiSlugForTaId(detailTaId)??taLabelToApiSlug) instead of
    hcp.specialty. Update effect deps [.., taSlug].
BACKWARD-COMPAT VERIFIED: Fix1 apiSlugForTaId(taId)??taSlug -> NSCLC/Hep/Rare resolve same as today (additive).
Fix2 getHCPNarrative runs resolveTASlug() on arg; passing taSlug ("nsclc" etc) = same slug the old hcp.specialty
path produced -> only ADDS "atopic-dermatitis" resolution; NSCLC narratives read exactly as before. response.
therapeuticArea (displayed specialty label) untouched. Only AD fixed.
These are the ONLY 2 narrative reads (API layer + component layer) -> whichever the UI renders is AD-scoped.
APPROVED. NEXT: apply both -> typecheck/build -> narrative test-5 (Established, --cohort established --established-
top 5 --target-version v2 --dry-run then real) -> verify a narrative RENDERS on Silverberg profile (real test of
this fix) + reads well -> full Established top 200.

### 30dd. Narrative dry-run: CLEAN + high quality. Blast radius = AD-only (freshness-skipped the 5 non-AD). Sample (Lio) reads excellently. Proceed to real 5.
Dry-run output: loaded 3 visible TAs (Hep/NSCLC/AD), selected 10 unique HCPs (top-5 per TA w/ rows). KEY: "[fresh
ness] Skipped 5 contexts with narratives newer than latest score" -> 5 already had narratives (NSCLC/Hep), skipped;
5 remain = the AD ones. Net writes = ~5 AD. Hep didn't surprise (its top-5 already have narratives or skipped). Cost
$0.03 for 5.
SAMPLE (Peter Lio, AD) = HIGH QUALITY:
  - Accurate/specific: global rank 19, US rank 5, "59 AD pubs senior-author, 40 in last 5yr, 10 guideline pubs",
    Network 98th pctile. Real grounded numbers, not fluff.
  - Domain-appropriate: novel targeted mechanisms, patient-stratification, treatment sequencing, guideline
    incorporation. Reads like AD medical-affairs fluency. MSL-useful.
  - HONEST pharma gap: "pharma engagement data is not available for this profile" (Lio = Pharma 0, correctly stated
    not invented). Holds the §30bo honesty discipline.
  - All 5 fields populated well (narrative/why_now/engagement_angle/signal_strength/caution_flags). caution_flags
    null (appropriate for clean top-tier).
  - LEANS ON INSTITUTION ("Peter Lio at Northwestern") + publication metrics, NOT a specific practice city -> the
    stale-NPPES-location risk (Abuabara Philadelphia vs UCSF) did NOT materialize. Generator anchors on institution
    + scholarly record = reliable data. Location caveat likely a non-issue for narratives.
=> PROCEED to real 5-HCP run (drop --dry-run). Then verify a narrative RENDERS on Silverberg profile (real test of
the slug fix §30dc) + reads well. Then full Established top 200.
NEXT: real 5 -> verify render -> full top 200 (background). Cost check: 5 = $0.03, so 200 ~ $1.20 - trivial. Could
even do more than 200 given cost. (Rising deferred - script reads old momentum tables §30cy.)

### 30de. DESIGN DEBT: generate_narratives_v2.py TA-scoping is not future-proof (implicit via config-visibility + freshness-skip, no --ta flag). Fix later, fine for today.
Garrett flagged: the narrative script isn't future-proofed. Correct - real design debt:
  1. TA scoping is IMPLICIT + GLOBAL, not explicit. No --ta flag. Generates for whatever's is_visible_in_ui in
     config; relies on FRESHNESS-SKIP to avoid redoing. "Only does AD" is true ONLY because NSCLC/Hep have fresh
     narratives - an emergent side effect of data state, not an intention.
  2. Freshness-skip is load-bearing but invisible. Add a 4th TA / recompute NSCLC scores (making its narratives
     "stale") / use --force -> script silently does far more than intended. No explicit guardrail.
  3. No way to target ONE TA. Can't regenerate just AD (e.g. after prompt tweak) without --force-everything or
     fighting freshness.
  4. is_visible_in_ui OVERLOADED: controls BOTH frontend visibility AND narrative-script enrollment (should be
     independent). Marking a TA user-visible shouldn't auto-enroll it in narrative gen.
  5. Recompute coupling: freshness compares narrative age to "latest score" -> any score recompute silently re-
     enrolls that TA for regeneration next run (unexpected cost/scope balloon).
=> scoping is a COINCIDENCE OF DATA STATE, not an expressible intention. Works today for AD by luck of freshness
state; will surprise later.
TODAY: FINE - the dry-run EMPIRICALLY PROVED current state = AD-only (net 5). Verified behavior, didn't trust
design. Complete the run safely.
FIX (task chip, later - NOT a blocker): add --ta <slug> flag to explicitly scope generation to one/list of TAs,
INDEPENDENT of is_visible_in_ui. Lets you say --ta atopic-dermatitis and know exactly what runs regardless of
freshness/visibility. Decouples "visible to users" from "process for narratives". Makes runs intentional +
reproducible. (Same reproducibility principle as the established_npi_resolver --ta design.)
NEXT: finish today's run (verified safe) -> verify render on AD profile -> full top 200. File the --ta future-proof
chip for later.

### 30df. NARRATIVE RENDERS - slug fix WORKS end-to-end (Guttman-Yassky "Why This Expert" shows real text). The "two narratives" = two FIELDS by design (card=why_now teaser, detail=narrative), consistent w/ NSCLC.
Verified in-browser: Guttman-Yassky detail "WHY THIS EXPERT" renders real accurate narrative (2nd US/4th global,
126 senior-author pubs, 67 in last 5yr, 15 guideline pubs, ~23yr). => SLUG FIX §30dc WORKS end-to-end: generator
writes atopic-dermatitis -> frontend reads atopic-dermatitis -> displays. All the last hour's work validated.
GARRETT SPOTTED "two different narratives" (card vs detail): NOT a bug - two FIELDS surfaced in two places by
design:
  - CARD shows why_now field ("As the AD treatment landscape expands with multiple mechanism-differentiated
    biologics...") - the forward-looking hook, truncated as teaser.
  - DETAIL "Why This Expert" shows narrative field (biographical/credentials summary).
  Generator writes 5 fields (narrative/why_now/engagement_angle/signal_strength/caution_flags); UI surfaces
  different fields on card vs detail. CONSISTENT WITH NSCLC (Garrett noticed NSCLC does same) = evidence it's
  INTENDED, not an AD break. NSCLC is the working reference; AD now behaves identically = correct.
MINOR UX NOTES (decisions, not bugs): (1) card why_now teaser can't be expanded on the card (must click to detail)
- fine (card=summary, detail=depth), or make expandable if desired. (2) worth confirming card=why_now / detail=
narrative consistently (two distinct fields) vs any same-field-truncation confusion - from images they're clearly
distinct fields, likely fine.
=> AD Established narratives WORK. Ready for full run.
NEXT: full Established run (--established-top 200, ~$1.20, ~40min at 1min/5 - could even do all 2,585 ~$15/~4-5hr).
Then AD Established profiles are COMPLETE (score+narrative). [Remaining enrichment: belief profiles/ai_overviews,
top-collaborators, research-themes - separate gen steps. Rising narratives - deferred (old tables). Community -
Workspace build.]

### 30dg. UX ISSUE (real, worth fixing): card teaser = why_now (truncated, DEAD-ENDS - appears nowhere else, can't expand). Likely defect: why_now displayed ONLY on card. Decide design.
Garrett dug into the "two narratives": the CARD surfaces why_now (truncated, ellipsis) but that text appears
NOWHERE ELSE and can't be expanded. He'd assumed card = preview of the detail "Why This Expert" (narrative field) -
intuitive assumption. Reality: card=why_now, detail=narrative = two different fields. User reads compelling card
half-sentence -> clicks in -> gets DIFFERENT text. Genuine UX seam. (Consistent w/ NSCLC = intended mapping, but
questionable design.)
NOT a bug (consistent field-mapping) but arguably WRONG design. Options:
  A. Card teaser previews the DETAIL narrative (what Garrett expected): card shows truncated `narrative` (same field
     as detail Why This Expert) -> clicking expands the SAME thought. Most intuitive. ~1-line (card pulls narrative
     not why_now).
  B. Keep card=why_now (a forward-looking "why engage NOW" hook is arguably the BEST card surface - most MSL-
     actionable), but FIX THE DEAD-END: display full why_now on the DETAIL page too (its own "Why Now" section near
     "Why This Expert"). The ACTUAL DEFECT = why_now is currently displayed ONLY on the card, truncated, no full
     version anywhere. Generator writes why_now (paid for) but it only appears as a truncated teaser.
  C. Leave it (consistent w/ NSCLC, works). But Garrett noticed twice + it bothers him -> worth fixing.
LEAN: Option B. why_now (engagement hook) IS a good card surface (most actionable "why now"); narrative (bio/creds)
is right for detail Why This Expert. The defect is why_now has no full-text home -> add a "Why Now" section to the
detail page so the card teaser expands into something real. Keeps both distinct useful fields, gives the hook a
payoff. Generator already writes why_now - just not displayed on detail.
(Applies to NSCLC too = product-wide UX fix, not AD-specific. Verify: is why_now displayed ANYWHERE on the detail
page currently? If not -> that's the confirmation.)
NEXT: while narrative top-200 runs, have Claude Code check where why_now is displayed (card only? detail too?) ->
confirm the dead-end -> decide A vs B -> apply. Then continue enrichment (belief profiles etc).

### 30dh. Field->UI trace: 4 of 5 narrative fields dead-end or invisible for ESTABLISHED. Two root causes. Fix = un-gate Signal Summary + add why_now to detail mapping.
Claude Code mapped all 5 generator fields -> 2 render surfaces (HCPCard, DetailScreen):
  - narrative_text: card FALLBACK (why_now ?? narrative); detail PRIMARY "Why This Expert" (renderNarrative,
    DetailScreen:1350). RENDERS for AD. ✓
  - why_now: card PRIMARY teaser (3-line clamp, HCPCard:947). Detail "Why Now" block EXISTS (DetailScreen:1387) but
    NEVER POPULATES - (a) gated to cohort==="rising_star" (:1356) so Established/Community never see it, AND (b)
    detailResponseToRisingStar mapping (App.tsx:230) OMITS why_now (maps narrative/engagement_angle/caution_flags/
    signal_strength but not why_now) -> hcp.why_now=null on detail -> guard never fires. DEAD-END everywhere.
  - engagement_angle: detail "Signal Summary -> Engagement Angle" (:1398) but RISING_STAR ONLY.
  - caution_flags: detail "Signal Summary -> Caution" (:1409) RISING_STAR ONLY.
  - signal_strength: detail "Signal:" badge (:1382) RISING_STAR ONLY.
=> FOR AD ESTABLISHED (+ NSCLC Established + Community): why_now = truncated card dead-end (no full text anywhere);
engagement_angle/caution_flags/signal_strength = GENERATED (paid for) but RENDERED NOWHERE (Signal Summary is
rising-star-gated). 4 of 5 fields dead-ended or invisible for Established.
THE BURIED FIELDS ARE THE MOST MSL-ACTIONABLE: engagement_angle ("how to approach" - Lio's was excellent: study-
design rigor/comparative-effectiveness/evidence-thresholds) = arguably MOST useful field, INVISIBLE. why_now
(timeliness hook) teased-not-shown. caution_flags (risk signals) invisible.
TWO ROOT CAUSES: (a) why_now omitted from detail mapping (App.tsx:230). (b) Signal Summary gated rising_star-only
(DetailScreen:1356) - should show for established/community too.
FIX (product-wide, benefits NSCLC too): (1) add why_now to the detail response mapping. (2) un-gate Signal Summary
(engagement_angle/why_now/signal_strength/caution_flags) for established+community, not just rising_star. Then the
card teaser has a home AND the buried actionable fields surface. Verify each field renders sensibly per-cohort
(e.g. established caution_flags often null = fine, hide if empty).
NEXT: draft the fix (un-gate Signal Summary + add why_now mapping) - makes AD Established profiles genuinely
complete (narrative + why_now + engagement_angle + signal + caution all visible). Then continue enrichment (belief
profiles etc). [Narrative top-200 run completing in background meanwhile.]

### 30di. Signal Summary fix APPROVED. 2 small diffs, empty-field-hiding already clean, backward-compat. Nuance: why_now was blank for ALL cohorts (fix helps rising stars too).
Reviewed both diffs:
  FIX 1 (App.tsx:230): add `why_now: detail.narrative?.why_now ?? null` to detailResponseToRisingStar mapping. Data
    was already selected by getHCPDetail + in response type, just dropped in this mapping. Flows through
    mapRisingStarToHCP (already maps item.why_now) -> hcp.why_now. One line.
  FIX 2 (DetailScreen:1356): remove ONLY the cohort==="rising_star" gate; keep OR (why_now||engagement_angle||
    caution_flags) as trigger. Lines 1359-1420 untouched.
CONCERN (a) EMPTY-FIELD HIDING: already clean, no change needed. Each sub-block independently guarded ({hcp.caution_
flags && ...} etc) -> null caution_flags renders nothing (no empty label). Section-level OR guard -> "Signal
Summary" heading never appears with zero body. signal_strength deliberately NOT in section trigger (lone badge w/o
body would render near-empty section; keeps rising-star behavior identical).
CONCERN (b) BACKWARD-COMPAT: rising-star section trigger now (why_now||engagement_angle||caution_flags) = IDENTICAL
to what they already evaluated (they always passed cohort check, OR was the real gate). TA-agnostic/cohort-driven.
NSCLC rising unchanged; NSCLC established/community GAIN Signal Summary when they have data (additive, never removes).
NUANCE (Code caught, my assumption was off): rising stars saw engagement_angle/caution_flags/signal_strength but NOT
why_now - it was dropped in the SAME mapping omission for ALL cohorts. So "Why Now" block was blank for EVERYONE.
Fix 1 also populates it on rising-star detail (previously dead). ACCEPT - no reason to hide a correct field;
scoping it out would preserve a bug.
NET: rising_star gains populated Why Now; established gains full Signal Summary; community gains it (data-dependent).
No HCPCard change. APPROVED.
NEXT: apply both -> typecheck (expect 70 baseline, 0 new) + build -> verify on an AD Established profile: Why This
Expert + Why Now + Engagement Angle + Signal (+ Caution if present) all render. Then continue enrichment. [Narrative
top-200 run finishing in background.]

### 30dj. Signal Summary fix APPLIED + verified (typecheck 70 baseline / build green). The "new" error was pre-existing :1589 ternary shifted to :1587 (Fix 2 collapsed 3->1 line, -2 lines). AD profiles now show full briefing.
Both edits in: App.tsx:231 (why_now added to detailResponseToRisingStar), DetailScreen.tsx:1356 (Signal Summary
cohort gate removed -> renders on why_now||engagement_angle||caution_flags any cohort). Typecheck 70=baseline, 0 net
new. Build green 6.72s. The apparent "new" TS2322 at :1587 = the pre-existing ScientificNarrativeSection ternary
error from :1589, shifted up 2 lines by the gate collapse (net -2 lines). NOT new - good catch by Code.
=> AD Established profiles now render FULL BRIEFING: Why This Expert (narrative) + Signal Summary (Why Now +
Engagement Angle + Signal badge; Caution hidden when null). Rising-star Why Now block (previously blank for all
cohorts) now populates too (the accepted additive nuance).
VERIFY IN BROWSER: (1) does Engagement Angle read well for an Established KOL (debut on Established - was rising-
star-scoped; confirm tone fits senior figure)? (2) does Why Now show the full text the card teased (dead-end
resolved)?
STATE: AD Established profile completeness now = score block + narrative + full Signal Summary. Remaining enrichment:
Belief Profile (hcp_ai_overviews - TAG "atopic-dermatitis" to match DetailScreen:1589 fix), Top Collaborators (hcp_
top_collaborators_v2 - pairing step), Research Themes (hcp_research_themes_v2 - extraction). Each = run NSCLC step
for AD.
NEXT: verify profile briefing -> narrative run finishing (~193 writing) -> then Belief Profile step (check the tag
BEFORE generating, like we did narratives). [This session's UX-audit win: surfaced 4 buried fields product-wide.]

### 30dk. Signal Summary WORKS (content excellent) but SIGNAL BADGE OVERFLOWS: signal_strength is a full SENTENCE stuffed in a BADGE component -> horizontal overflow across screen.
Verified Guttman-Yassky profile: Signal Summary renders. CONTENT EXCELLENT:
  - Why Now: full text renders (dead-end RESOLVED) - "AD landscape expands with multiple mechanistic classes...".
  - Engagement Angle: PERFECT Established-KOL tone - "immunopathologic mechanisms distinguishing AD endotypes...
    therapeutic sequencing/patient stratification... study design standards, endpoint selection, head-to-head
    evidence." Senior-figure register, MSL-actionable. The previously-invisible field = most valuable on page.
  - "No reported industry engagement / Greenfield for first-mover MSL relationships" = beautiful honest Pharma-0
    reframing (opportunity not blank).
BUG (Garrett caught): the SIGNAL badge OVERFLOWS horizontally across the whole screen (spans both columns, over
Field Intelligence panel). Text: "SIGNAL: SCIENTIFIC AND NETWORK INFLUENCE SIGNALS ARE BOTH AT THE C...G VERY HIGH
CONFIDENCE IN". ROOT CAUSE: signal_strength was designed as a SHORT badge label (e.g. "Signal: Strong") but the
GENERATOR writes it as a FULL SENTENCE (cf Lio sample: "Scientific and Network Influence signals are exceptionally
strong and mutually reinforcing... high confidence..."). Paragraph-in-a-badge -> overflow. Format mismatch:
generator output (long-form) vs UI component (short badge). Was masked while rising-star-only IF their signal_
strength was short; un-gating surfaced it on Established where AD generator produces long-form.
FIX OPTIONS: (a) frontend - render signal_strength as a normal text block/sentence (not a fixed-width badge) w/
proper wrapping + overflow handling; treat it like the other Signal Summary prose fields (Why Now/Engagement Angle
render fine as wrapped text). SIMPLEST + consistent. OR (b) generator - constrain signal_strength to a short label
(e.g. High/Moderate/Emerging) - but that loses the richer sentence + requires regen. LEAN (a): make the badge a
wrapping text block like the sibling fields. Also the "SIGNAL:" badge styling (uppercase pill) may need to become a
labeled prose line.
NEXT: fix the signal_strength rendering (option a - wrapping text block, not overflow badge). Verify on Guttman-
Yassky. [Narrative run finishing. Rest of Signal Summary content validated - excellent.]

### 30dl. NARRATIVE RUN COMPLETE: 198 AD Established narratives generated (2 failures ~1%, transient), 34 min, $1.10.
Full top-200 AD Established narrative run done: 198 generated / 2 failed / $1.10 / 34.1 min. ~all demoable AD
Established now narrated (Why This Expert + Why Now + Engagement Angle + Signal + Caution-where-present). 2 failures
= ~1% transient (not systemic). OPTIONAL: re-run same command -> freshness-skips the 198, retries only the 2 (cheap)
- or just note + move on (198/200 fine for demo). Low priority.
STATE: AD Established profile completeness = score block + narrative + full Signal Summary content. Only remaining
visual bug: signal_strength badge OVERFLOW (§30dk, fix in progress - render as wrapping prose not fixed badge).
Then AD Established narrative/signal layer = DONE.
REMAINING AD ENRICHMENT (each = run NSCLC step for AD ta_id): Belief Profile (hcp_ai_overviews, TAG atopic-
dermatitis), Top Collaborators (hcp_top_collaborators_v2), Research Themes (hcp_research_themes_v2). Then AD
Established fully matches NSCLC depth. (Rising narratives deferred - old-tables script change; Community operational
narrative - Workspace build.)
NEXT: (1) apply signal_strength overflow fix -> verify Guttman-Yassky clean. (2) then Belief Profile enrichment
(check atopic-dermatitis tag BEFORE generating). (3) Top Collaborators. (4) Research Themes. [Consider fresh Code
session for the belief/collaborators/themes batch - context climbing; state in doc + chips.]

### 30dm. signal_strength overflow fix APPROVED: root cause = flexShrink:0 span in space-between flex row. Fix = render as wrapping prose div like sibling fields.
Root cause confirmed: signal_strength was a <span> with flexShrink:0 inside a justifyContent:space-between flex row
-> span doesn't wrap + flexShrink:0 forbids shrinking -> full-sentence value forced row wider than column -> spill.
FIX: remove the flex row + badge span; render signal_strength as a plain block <div> (fontSize 14, lineHeight 1.5,
no flex/flexShrink/nowrap/fixed-width) - structurally identical to Why Now/Engagement Angle blocks that already wrap.
Text wraps at column content-box width. Why Now/Engagement Angle untouched (outside replaced region, own guards).
Also removes the dead signalStrengthColor helper (only matched high/moderate/early; full sentences fell to default
-> dead for this data; removal avoids TS6133 unused-fn error).
Section-guard: added signal_strength to section-level guard (why_now||engagement_angle||caution_flags||signal_
strength). Accepted - signal_strength always co-occurs w/ the others in real output so renders identically; only
closes a lone-field edge case. Harmless.
APPROVED. Apply -> typecheck (70 baseline, 0 new - the removed helper offsets nothing since it was unused) + build
-> verify Guttman-Yassky Signal Summary renders clean (signal_strength wraps in column, no horizontal bleed).
=> After this: AD Established narrative/signal layer DONE (score + narrative + full Signal Summary, no overflow).
NEXT: verify -> then Belief Profile / Top Collaborators / Research Themes enrichment (consider fresh Code session -
context climbing). Commit accumulated work at a checkpoint.

### 30dn. signal_strength overflow FIXED + verified (renders clean, wraps in column). Content excellent. Minor polish: add yellow left-border accent to Signal Summary to match Why This Expert.
Verified Guttman-Yassky: Signal Summary renders CLEAN - Signal/Why Now/Engagement Angle all wrap as prose sub-blocks
in the left column, no horizontal bleed. Overflow bug RESOLVED. Content excellent (Engagement Angle: "immunopatho
logic distinctions between AD subtypes... trial design, endpoint selection, therapeutic sequencing" = perfect
Established-KOL register).
POLISH (Garrett caught): "Why This Expert" has a yellow/gold LEFT-BORDER ACCENT bar; "Signal Summary" does NOT.
They're PEER narrative sections -> should match visually (currently look like different tiers). FIX: add the same
left-border accent to Signal Summary, REUSING the exact Why-This-Expert accent styling (same gold color/width/
padding offset, not a new near-match yellow). Cosmetic, quick.
=> After this polish: AD Established narrative/signal layer visually DONE + consistent.
NEXT: apply accent polish -> then COMMIT accumulated work (dedup migration, narrative slug fix, Signal Summary
un-gate, overflow fix, accent) + push. Then decide: Belief Profile/Collaborators/Themes enrichment (fresh session)
vs bank the day. Lots done this session - commit is the priority before switching/stopping.

### 30do. Starting BELIEF PROFILE enrichment (hcp_ai_overviews, scientific-positions synthesis -> ScientificNarrativeSection). TAG MATCH is the key risk (trickier than narratives).
Moving to Belief Profile enrichment for AD top Established. Trace-before-generate (no writes) - the TAG is the whole
ballgame + trickier than narratives:
THE TAG COMPLICATION: our morning fix DetailScreen.tsx:1587 passes therapeuticArea={taSlug==="nsclc"?"NSCLC":taSlug}.
So frontend READS:
  - NSCLC -> "NSCLC" (uppercase DISPLAY NAME)
  - AD -> "atopic-dermatitis" (SLUG - falls through ternary else to taSlug)
= an INCONSISTENCY in the frontend read (NSCLC=display-name, AD=slug). So the generator must write DIFFERENT-format
tags per TA to match: NSCLC rows tagged "NSCLC", AD rows must be tagged "atopic-dermatitis" (NOT "Atopic Dermatitis"
display name). If the NSCLC generator writes the display name, the AD equivalent would write "Atopic Dermatitis" ->
MISMATCH with the frontend's "atopic-dermatitis" read -> belief profile generates but DOESN'T RENDER (same class as
the narrative slug issue).
TRACE MUST ANSWER: (1) script name/flags/scoping. (2) EXACTLY what it writes to hcp_ai_overviews.therapeutic_area
for a TA - display name or slug? (3) does it select AD Established given the null-cohort-column issue? (4) 5-HCP
test invocation. (5) does the write value == frontend read ("atopic-dermatitis" for AD)? Flag any mismatch.
POSSIBLE OUTCOME: may need EITHER the generator to write "atopic-dermatitis" for AD, OR reconcile the frontend read
(make DetailScreen:1587 consistent - e.g. always slug, and tag NSCLC rows by slug too - but that risks NSCLC render).
Decide after trace. Same trace-before-generate discipline that saved the narrative run.
NEXT: trace the belief-profile generator -> confirm tag match -> (fix tag/read if needed) -> 5-HCP test -> verify
renders on Guttman-Yassky belief profile -> full top-200. [After committing the narrative/signal work first.]

### 30dp. Belief Profile trace: BIGGER than narratives. TWO-stage NSCLC-hardcoded pipeline. Tag mismatch confirmed. Needs TA-parameterization of BOTH stages. ~$25-70 for top-100.
Trace (no writes): Belief Profile = hcp_ai_overviews synthesis_type='scientific_positions' -> ScientificNarrative
Section. Generator = scripts/narrative/generate_scientific_position_synthesis.py. But it's a TWO-STAGE pipeline,
both NSCLC-hardcoded:
  STAGE 1 (extract_scientific_positions.py): reads each HCP's papers, extracts per-paper positions -> hcp_scientific
    _positions_v1 (tagged by therapeutic_area_id). HEAVY stage: 1 call PER PAPER. Selects top Established from
    hcp_established_ranks_v3 (scope_type='region', scope_value='US', rank<=100) - the SAME ranks table we deduped
    this morning, NOT the null cohort column -> works for AD once parameterized. ✓
  STAGE 2 (synthesis): reads positions_v1 for the TA, synthesizes -> hcp_ai_overviews. Selects ONLY HCPs w/ positions
    in _v1 for that TA. AD has NONE yet (Stage 1 NSCLC-only) -> STAGE 1 MUST RUN FOR AD FIRST or Stage 2 = 0 AD.
=> NOT "run NSCLC script for AD" like narratives. TWO AD-adapted stages in sequence.
TAG MISMATCH CONFIRMED (the check paid off): generator writes hardcoded NSCLC_TA_NAME="NSCLC" (uppercase display
name, no TA param). Frontend reads "atopic-dermatitis" for AD (:1587 ternary). As-is: NSCLC rows tagged "NSCLC"
(render), ZERO AD output. Even naively writing display name "Atopic Dermatitis" would still mismatch the slug the
frontend sends. Same failure mode as narratives.
BOTH STAGES NSCLC-HARDCODED in multiple places: NSCLC_TA_ID in selection SQL + positions query + Stage2 written tag
+ PROMPT TEXT ("in NSCLC" baked in templates -> would MISLABEL AD investigators). Needs real TA-parameterization,
not a flag flip. But scripts are CLEAN/reusable (async, dry-run, idempotent) -> "modest adaptation (parameterize ~3
constants + prompt + tag), not a rewrite" - comparable to narrative work.
FIX PATH: parameterize NSCLC_TA_ID -> AD ta_id; write tag as "atopic-dermatitis" (slug, per frontend read);
genericize prompt text (remove "in NSCLC"). Recommendation from Code: (a) write "atopic-dermatitis" to ship AD now,
(b) log the frontend read inconsistency (:1587 ternary NSCLC=display-name/AD=slug) as debt to reconcile later.
COST: Stage 1 HEAVY (1 call/paper, ~$0.20-0.60/HCP -> top-100 ~$20-60). Stage 2 cheap (~$5-10/100). Full ~$25-70
(vs narratives $1.10). Affordable but a real spend + Stage 1 slower. 
FIRST: verify whether ANY AD rows already exist in hcp_scientific_positions_v1 (Code had no DB access) - confirm
before costing a full Stage-1 run.
NEXT: (1) DB check - AD rows in hcp_scientific_positions_v1? (2) draft TA-parameterization of both stages (Code
offered, no writes). (3) 5-HCP test (Stage1 then Stage2, tag=atopic-dermatitis) -> verify Belief Profile RENDERS on
Guttman-Yassky. (4) full top-100. Log the :1587/:1574 ternary inconsistency as debt.

### 30dq. AD positions = 0 confirmed (Stage 1 must run fresh). COST estimate suspect - Garrett's instinct: NSCLC didn't cost this much. Read the actual paper-cap before costing.
DB check: hcp_scientific_positions_v1 for AD = 0 positions / 0 HCPs. Stage 1 runs fresh for AD, confirmed.
COST FLAG: Garrett doesn't remember NSCLC Belief Profile costing $20-60. Trust that instinct - Code's estimate was
a ballpark from READING code (per-paper x papers/HCP x 100), not measured. Reasons real cost likely LOWER:
  1. NSCLC Stage 1 may have been done incrementally over prior sessions -> never a single visible bill.
  2. The per-paper estimate hinges on the PAPER CAP per HCP (TOP_PAPERS_SQL). If capped at top ~10-20 papers/HCP
     (not ALL papers), it's 100 HCPs x ~15 papers = ~1,500 modest calls = single-to-low-double-digit $, not $60.
     Code flagged its own estimate "rough - depends on per-HCP paper cap." That cap is the whole ballgame.
  3. Idempotent upsert -> re-runs cheap (but first run is the cost).
=> DON'T cost/run until we READ the actual cap. Check: (1) paper cap per HCP in TOP_PAPERS_SQL (top N or all?), (2)
model + max_tokens per call, (3) full vs truncated abstracts. Then a GROUNDED estimate for AD top-100. Also: any
record of what NSCLC Stage 1 actually cost / how many calls?
HUNCH (aligned w/ Garrett's memory): extraction scripts almost always cap papers/HCP (don't need all 300 of
Silverberg's papers - top ~15-20 recent/cited capture his positions). Likely much less than $20-60.
NEXT: read the paper cap -> grounded cost -> then parameterize both stages (backward-compat NSCLC) -> test-5 ->
decide scope -> run. [Still: log the :1587 ternary frontend-read inconsistency as debt.]

### 30dr. COST RECONCILED via past-chat search: Garrett's memory correct. Belief Profile reads PRE-STORED abstracts, ~$25 (not $20-60). Paper cap ~10/HCP confirmed.
Garrett recalled the enrichment was based on abstracts ALREADY in the DB for the TA. CONFIRMED via past chats
(July 7 NSCLC pilot that established this pipeline):
  - Corpus = 1,296 abstracts total (822+474) ALREADY INGESTED (not re-fetched live).
  - Extraction ~$0.015/abstract on ~1,600-char abstracts -> ~$20 for extraction.
  - Synthesis = 189 calls (1 per HCP w/ papers) -> ~$5.
  - TOTAL ~$25 one-time for full Top-100 x Top-100 NSCLC pilot. Runtime 30-45 min.
  - PAPER CAP: pilot design "extract all 10 [papers/HCP], let synthesis weight them"; citation skew noted (top 3-4
    papers carry messaging weight). So ~10 papers/HCP cap confirmed.
=> Garrett RIGHT: enrichment reads PRE-STORED abstracts; extraction is 1 call/abstract at ~$0.015; capped ~10/HCP.
Code's $20-60 estimate was TOO HIGH - it reasoned "1 call/paper up to N" without knowing (a) abstracts are pre-
stored (no live fetch) and (b) the ~10/HCP cap. GROUNDED cost from Garrett's own pilot: ~$25 for full top-100, NOT
$20-60. Cost is NOT a constraint (was never meant to be).
ALSO recovered design context: Belief Profile = the "scientific positions / publication messaging" layer. Per-paper
STRENGTH weights statements (authority-weighted aggregation = the differentiated moat, needs the HCP graph).
Cohort asymmetry productized in synthesis prompt (Established="established positioning" 8+ papers / "focused" 3-7;
Rising="emerging voice" 5+ / "early footprint" 1-4; 0 papers = don't render). AD scientific advisor is load-bearing
for the paper-strength rubric + statement typology.
=> This changes the Stage-1 concern: Code said "Stage 1 must run for AD, extracts positions per paper" - but if AD
abstracts are already ingested (they should be - AD corpus was built), Stage 1 reads THOSE, ~$0.015 each, capped
~10/HCP. NOT a heavy live-fetch. Confirm AD abstracts are in the DB (they should be from the AD ingestion) -> then
Stage 1 for AD top-100 ~$20, Stage 2 ~$5.
NEXT: confirm AD abstracts present in DB (publication_authors_v2 / abstracts table for AD). Then the cost is ~$25
as Garrett remembered. Proceed w/ parameterization + test-5 (cost non-issue). Verify the ~10-paper cap in the
actual Stage-1 SQL.

### 30ds. AD corpus confirmed: 19,047 AD pubs w/ abstracts (publications_v2.abstract, source_therapeutic_area_id). Ample. Cost hinges ENTIRELY on the paper cap.
Schema: abstracts in publications_v2.abstract; TA link = publications_v2.source_therapeutic_area_id (or publication_
therapeutic_areas_v2 join). AD = 19,047 pubs with abstracts. Ample corpus (Stage 1 has plenty to extract from).
(Note: publications_v2_ad_contaminated_backup exists - Stage 1 must read publications_v2 CLEAN, not the backup.)
COST REALITY - the cap is everything: 19,047 is the AVAILABLE corpus. If Stage 1 extracted ALL -> ~$285. But it
CAPS at top ~10 papers/HCP for top-100 HCPs -> ~1,000 abstracts (w/ dedup maybe fewer) x $0.015 = ~$15 extraction +
~$5 synthesis = ~$20 total. Matches Garrett's ~$25 memory. THE CAP is what keeps it $20 not $285 -> confirming the
actual cap value in Stage-1 SQL is critical (difference between $20 and $285 run).
=> DON'T run Stage 1 unbounded over 19,047. The top-N-papers-per-top-N-HCPs scoping is the cost control. Verify the
exact cap (TOP_PAPERS_SQL) + HCP selection (top-100 from deduped ranks_v3) before running.
NEXT: Code reads Stage-1 SQL -> exact paper cap + HCP-count + grounded cost (should be ~$20). Parameterize both
stages (backward-compat NSCLC; AD tag "atopic-dermatitis"; genericize prompt, PRESERVE cohort-asymmetric framing).
Test-5 -> verify Belief Profile RENDERS on Guttman-Yassky -> full top-100 (~$20-25). AD advisor load-bearing for
paper-strength rubric/typology (recovered §30dr) - NSCLC-validated pipeline is a reasonable start.

### 30dt. Belief Profile toolkit FULLY READ. Cost ~$15 (Garrett right). TWO key findings beyond cost: Stage 1 NOT idempotent; SOFT prompt contamination (NSCLC drug exemplars) = quality risk needing AD-specific rework (advisor load-bearing).
Full read of both scripts (self-contained, all prompts inline). PIPELINE: publications_v2.abstract -> [Stage 1
extract, 1 call/paper] -> hcp_scientific_positions_v1 (atomic positions) -> [Stage 2 synthesize, 1 call/HCP] ->
hcp_ai_overviews -> ScientificNarrativeSection (Belief Profile).
STAGE 1: HCP selection get_target_hcps (2 ranks queries deduped, --limit default 200, --cohort). ESTABLISHED_HCPS_
SQL reads hcp_established_ranks_v3 (region/US, rank<=100) - immune to null-cohort issue. PAPERS: TOP_PAPERS_SQL
reads publications_v2 (CLEAN, p.abstract) JOIN publication_authors_v2. Filters: pub_year>=2020, abstract>=800 chars,
senior OR first author, cap rn<=PAPERS_PER_HCP=10. Extraction prompt asks "up to 5 distinct positions" (claim author
ADVANCES, not bare findings). Typology: position_type (positive/cautionary/unmet_need/hypothesis) x position_
category (efficacy/patient_selection/biomarker/safety/resistance/sequencing/access/diagnostics/methodology). Drug
normalization: NONE (free-text). confidence 0-1. Validation before write. 
*** STAGE 1 NOT IDEMPOTENT: plain INSERT no ON CONFLICT -> re-run APPENDS duplicate positions. Clean re-run needs
DELETE existing TA rows first. (Matters: test-5 then full run would duplicate the 5.) ***
STAGE 2: selects HCPs purely position-driven (whoever Stage 1 populated), no cohort/rank filter. Aggregates ->
3-bucket (strongly_advocates/frequently_raises/research_focus) + corpus_depth (Deep>=5/Focused>=3/Signal). Weighting
PROMPT-DIRECTED not computed (hands model citation+author_role, instructs weight by recency/citations/authorship,
confidence rubric 0.50-0.98). Output body JSON -> hcp_ai_overviews. IDEMPOTENT (ON CONFLICT (hcp_id, synthesis_type,
therapeutic_area) DO UPDATE). Writes therapeutic_area = NSCLC_TA_NAME = "NSCLC" (line 534) -> AD needs "atopic-
dermatitis" (slug, per frontend read).
COST GROUNDED: model claude-sonnet-4-6 (older id - candidate upgrade, separate decision). Stage 1: <=100 HCP x <=10
papers, 800-char/2020/senior-first filter leaves ~6-8 papers/HCP -> ~650-800 calls, ~$0.012-0.015/call -> ~$8-12,
SLOW (sequential, ~25-45 min). Stage 2: <=100 calls ~$0.04-0.05 -> ~$4-6, fast (concurrency 8). AD top-100
Established ~$12-18 (~$15). Both cohorts (200 HCP) ~$25-40. PAPERS_PER_HCP=10 = primary cost lever. GARRETT'S ~$25
MEMORY CONFIRMED (Code's original $20-60 corrected).
*** TWO CLASSES OF NSCLC HARDCODING: (a) HARD constants/SQL (ta_id, tag) - mechanical to parameterize. (b) SOFT
PROMPT CONTAMINATION - "NSCLC" word + NSCLC DRUG EXEMPLARS (durvalumab/pembrolizumab/SABR/EFS/amivantamab/TTD) baked
in BOTH extraction + synthesis prompts. Left unchanged -> tells model AD investigators work in NSCLC + seeds theme-
naming w/ lung-cancer drugs -> BIASES extraction + MISLABELS AD experts. This is a QUALITY item, not cosmetic. AD
needs AD exemplars (dupilumab/upadacitinib/EASI-75/IGA/itch) - AD ADVISOR LOAD-BEARING here (recovered §30dr). ***
FULL HARDCODE SURFACE mapped (Stage 1: lines 3,32,145,159,213,257,265,412; Stage 2: lines 34,35,257/300/320,260/303/
323,278-279,387,401,534).
PARAMETERIZATION DECISIONS (when we draft): (1) TA constants + tag format ("atopic-dermatitis"). (2) prompt de-
contamination (AD-neutral or AD-specific exemplars - advisor input ideal). (3) --ta flag vs config lookup. (4)
Stage-1 idempotency (add ON CONFLICT / delete-first, else re-runs dup). (5) model upgrade? (separate).
NEXT: decide parameterization approach. KEY QUESTION for Garrett: prompt de-contamination - go AD-neutral now (strip
NSCLC exemplars, generic) to ship, and refine w/ advisor later? Or wait for advisor input on AD exemplars/typology
before running? Cost non-issue ($15) so no rush from that angle.

### 30du. NSCLC precedent recovered: B (AD-specific exemplars) IS the robust approach = Garrett writes AD position examples (as he did for NSCLC). Typology is TA-agnostic (his design); only EXAMPLES are TA-specific. Ship founder-authored now, advisor validates later.
Past-chat search on how NSCLC was done:
  FACT 1: the NSCLC prompt exemplars came from GARRETT, not invented by Claude. He wrote (July 7): Positive="Perio
    perative durvalumab improves EFS and pCR"; Cautionary="EGFR-mutant disease remains a challenge despite check
    point advances"; Unmet Need="STK11/LKB1 tumors require novel combinatorial approaches." These seed the model
    with the SHAPE of a position (drug + endpoint + polarity). NSCLC-specific -> mislead for AD.
  FACT 2: the TYPOLOGY is TA-AGNOSTIC and Garrett designed it. He renamed layer -> "Scientific Positions"; framework
    = positions/hypotheses/beliefs/concerns/evidence stances w/ polarity (positive/cautionary/unmet-need). General
    ontology; only the EXAMPLES are NSCLC.
  FACT 3: NSCLC pilot SHIPPED with Garrett's own exemplars; advisor was for STRESS-TESTING/refinement later, not a
    prerequisite to run. Precedent = FOUNDER-AUTHORED exemplars now, advisor validates later.
=> "B is most robust" CONFIRMED + clarified: B = Garrett writes AD position examples (as he did for NSCLC), swapped
into the prompt in place of the NSCLC exemplars. Robustness = his domain expertise seeding AD exemplars. NOT
guessing - doing for AD what he already did for NSCLC. Doesn't need advisor to START (didn't for NSCLC).
AD EXEMPLARS Garrett would provide (his field): Positive e.g. "Dupilumab achieves durable EASI-75 in moderate-severe
AD"; Cautionary e.g. "JAK inhibitor safety signals warrant careful patient selection" (upadacitinib/abrocitinib
boxed warnings); Unmet Need e.g. "H2H biologic comparisons + long-term remission data remain limited." (Garrett to
finalize the actual exemplars.)
=> APPROACH: B. Parameterize hard constants (ta_id, tag="atopic-dermatitis") + REPLACE NSCLC position exemplars w/
Garrett-authored AD exemplars in BOTH prompts + de-NSCLC the framing text + make Stage 1 idempotent (ON CONFLICT or
delete-first). Backward-compat NSCLC. Then test-5 -> verify renders + reads AD-accurate -> full top-100 (~$15).
NEXT: Garrett provides the AD position exemplars (positive/cautionary/unmet-need, + any category examples) -> Code
parameterizes both scripts w/ them -> review diffs -> test-5.

### 30dv. CORRECTION (Garrett): the NSCLC prompt exemplars were NOT founder-authored. Garrett is not a scientist. The EXTRACTED positions are abstract-derived (correct); the prompt EXEMPLARS are teaching-examples (likely Claude/Cursor-written when pipeline built). De-contamination should NOT require Garrett to author clinical claims.
CORRECTION to §30du: Garrett clarified he did NOT create the NSCLC position exemplars and is not a scientist -
thought positions were derived from abstracts. HE'S RIGHT, and I conflated two things:
  1. EXTRACTED POSITIONS (the output) ARE abstract-derived: Stage 1 reads each real abstract, extracts THAT paper's
     actual positions. Heymach's positions came from Heymach's papers. Correct - this is the moat.
  2. PROMPT EXEMPLARS (in the instructions) are a DIFFERENT thing: 2-3 illustrative examples baked into the prompt
     template to show the model the SHAPE of a position. NOT extracted - teaching examples. The "durvalumab/EFS"
     text Code found. Likely written by Claude/Cursor when the pipeline was built (NSCLC examples b/c NSCLC was the
     TA), NOT founder-authored. In the July 7 chat Garrett described positions CONCEPTUALLY while designing the
     feature - not authoring production prompt exemplars.
=> REVISED APPROACH: Garrett does NOT need to author AD clinical claims (he's not a scientist; shouldn't assert
statements he can't stand behind). De-contamination options:
  (a) TA-NEUTRAL/STRUCTURAL exemplars: replace NSCLC drug examples with generic structural ones showing the SHAPE
     (drug + endpoint + polarity) WITHOUT naming specific drugs/claims. Model derives real AD content from real AD
     abstracts. SAFEST - no founder clinical authorship, no NSCLC bias. LEAN THIS.
  (b) AD exemplars from the ADVISOR (not Garrett) - if we want AD-specific teaching examples, they come from the
     load-bearing AD advisor, later. 
  (c) AD exemplars pulled FROM the AD abstracts themselves (a few real extracted AD positions as examples) - but
     circular (need to run first).
DECISION: go (a) TA-neutral/structural exemplars now - de-NSCLC the prompt without requiring Garrett to invent
clinical claims. Extraction quality comes from the real abstracts + the (TA-agnostic) typology. Advisor can refine
with AD-specific exemplars later (the NSCLC precedent: ship now, advisor refines). Cost/quality both fine.
NEXT: parameterize both scripts - hard constants (ta_id, tag "atopic-dermatitis") + REPLACE NSCLC exemplars w/ TA-
NEUTRAL structural ones (not founder-authored AD claims) + de-NSCLC framing + Stage 1 idempotency + backward-compat
NSCLC. Test-5 -> verify AD positions extract sensibly from real abstracts + Belief Profile renders. Then full top-100.

### 30dw. Belief Profile parameterization REVIEWED - excellent. Per-TA registry (TA_CONFIGS), TA-neutral exemplars, tag=atopic-dermatitis, Stage-1 idempotency, NSCLC byte-for-byte. Approve -> test-5.
Code parameterized both scripts via a per-TA REGISTRY (TA_CONFIGS keyed by --ta, default nsclc) - better than
constant-swapping, works for any TA. Review:
  1. REGISTRY: nsclc entry reproduces original strings VERBATIM (byte-for-byte identical render); atopic-dermatitis
     entry has own ta_id (9e4139d2), tag, exemplars. Backward-compat by construction. ✓
  2. EXEMPLARS TA-NEUTRAL (per §30dv correction): AD finding_position_example = "active arm achieved higher response
     rate than comparator at primary endpoint" -> "magnitude and durability support this approach as preferred
     option for target patient population." NO drug names, NO specific clinical claims - teaches the SHAPE only.
     biomarker_examples = "disease-relevant molecular or serologic markers" (not PD-L1/ctDNA). Garrett authors
     nothing clinical; model extracts real positions from real AD abstracts. ✓
  3. TAG: Stage 2 AD entry writes tag="atopic-dermatitis" (comment "slug, matches frontend read"). ✓ THE key item.
  4. STAGE-1 IDEMPOTENCY: DELETE_POSITIONS_FOR_HCP_TA_SQL clears HCP's existing positions before re-insert, INSIDE
     the per-HCP transaction (committed per HCP). Fresh run = no-op delete; re-run REPLACES not duplicates. Nuance
     (Code flagged honestly): changes NSCLC RE-RUN behavior (replaces vs duplicate-appends) = CORRECTING a latent
     bug, not altering clean-run results. ✓
  5. BACKWARD-COMPAT 3 ways: nsclc entry original ta_id/tag; default --ta nsclc; every prompt placeholder renders
     NSCLC's exact original text. Typology (position_type x position_category) + corpus-depth framing (deep/focused/
     signal) untouched (TA-agnostic). ✓
  6. Stage-2 theme-naming exemplars neutralized (AD "Good" = generic strategy names "Combination Maintenance
     Strategy"/"Biomarker-Guided Selection"; "Bad" = anti-pattern naming a drug, no NSCLC drugs). ✓
  7. --ta flag added to both (choices from TA_CONFIGS.keys(), default nsclc). ta_id threaded through selection/
     prompt/write in both stages.
Code offered: could later move registry to config/therapeutic_areas/*.json to generalize (kept inline per "AD is
additive"). Good future note, not now.
=> APPROVE. Apply -> test-5: Stage1 --ta atopic-dermatitis --cohort established --limit 5 --dry-run then real
(idempotent), sanity-check rows in hcp_scientific_positions_v1 for AD -> Stage2 --ta atopic-dermatitis --limit 5
--dry-run then real, confirm hcp_ai_overviews rows synthesis_type='scientific_positions' + therapeutic_area='atopic-
dermatitis' -> VERIFY Belief Profile RENDERS on Guttman-Yassky + reads AD-sensible. NSCLC regression: one --ta nsclc
--dry-run per script, diff prompt vs pre-change to prove byte-identity. Then full top-100 (~$15).
NEXT: apply + test-5. Watch: do the neutral exemplars produce good AD position extraction from real abstracts (the
quality test)?

### 30dx. DEMO VIDEO to re-record (Garrett) - but AFTER enrichment complete, not now. Signal Summary + full enrichment stack = the demo-worthy profile.
Garrett realized the un-gated Signal Summary (Why Now + Engagement Angle) is a major surface the current demo/intro
video doesn't show -> wants to possibly re-record. RECOMMENDATION: log it, re-record AFTER the AD enrichment batch
is complete, NOT now. Reasons:
  1. The LIVE app already has Signal Summary (mentor live click-throughs reflect it); only the RECORDED video is
     stale. Urgency depends on what the video is for (async first-touch vs live walkthrough).
  2. Re-recording now = capturing an INCOMPLETE profile (Belief Profile/Collaborators/Themes not yet populated for
     AD). Would want to re-record AGAIN once enrichment lands. Record ONCE at the end.
  3. The demo-worthy profile = the COMPLETE stack: score + narrative + full Signal Summary + Belief Profile + Top
     Collaborators + Research Themes (as rich as NSCLC). Recording before enrichment done undersells it.
DECISION: re-record demo/intro video ONCE, after AD enrichment batch complete (Signal Summary + Belief Profile +
Collaborators + Themes all populated + rendering). Definite to-do, not now. (Also: does the video use NSCLC or AD?
If NSCLC, the Signal Summary improvement already applies there too - could record either TA's complete profile.)
NEXT: continue Belief Profile enrichment (test-5 running). Demo re-record queued for after the enrichment batch.

### 30dy. Belief Profile test-5: applied + AD extraction quality EXCELLENT (the neutral-exemplar bet paid off) + NSCLC byte-identity PROVEN. Stage 1 running.
Diffs applied to both scripts (compile clean). Results:
  *** AD EXTRACTION QUALITY EXCELLENT - the key uncertainty resolved: real AD-specific positions grounded in
  abstracts - "pediatric AD underdiagnosis, severity-tool caution (PtGA vs POEM), rural access gaps" - correct
  typology (unmet_need_position/diagnostics, cautionary_position/diagnostics, positive_position/patient_selection)
  + ZERO NSCLC contamination. The TA-NEUTRAL exemplars worked: model extracted real, specific, clinically-sensible
  AD positions from real abstracts; Garrett authored nothing clinical; AD-accurate b/c grounded in papers. The
  neutral-exemplar approach VALIDATED. ***
  NSCLC BYTE-IDENTITY PROVEN: Code wrote a zero-API prompt-render harness, diffed before/after - all 4 NSCLC prompts
  (Stage1 extraction + Stage2 deep/focused/signal) render byte-for-byte identical (empty diff, exit 0). Stronger
  than a live dry-run, cost nothing. NSCLC provably untouched.
  De-contamination confirmed: "atopic dermatitis" framing, zero NSCLC/amivantamab/TTD/PD-L1 leak (grep -c = 0).
  AD selection works (hcp_established_ranks_v3, null-cohort dodged). Stage 1 idempotent write to hcp_scientific_
  positions_v1.
PRACTICAL: run is sequential + output block-buffered (Python->file) -> ~12-15 min for 5 HCPs, progress hidden until
done. Code waiting for completion (not polling buffered file). Background job bswnb91sk.
NEXT: Stage 1 finishes -> Code shows a couple ACTUALLY-WRITTEN positions (from DB) -> Stage 2 (dry-run then real,
tag atopic-dermatitis) -> VERIFY Belief Profile renders on Guttman-Yassky + reads true to her known AD positions
(Garrett gut-check) -> full top-100 (~$15). NOTE FOR FULL RUN: sequential Stage 1 is SLOW (~19 papers/5min) -> top-
100 Stage 1 could be ~1-2 hrs. Background it.

### 30dz. Belief Profile test-5 COMPLETE + confirmed. 249 positions (healthy polarity spread), 5 profiles all depth=deep, genuine AD themes, tag=atopic-dermatitis on all 5. Verify render on Guttman-Yassky.
Stage 1 (extract): 5 HCPs, 50 papers, 249 positions, 0 errors. Polarity spread 119 positive / 58 unmet-need / 41
cautionary / 31 hypothesis - HEALTHY realistic mix (not all-positive = genuine positions, not cheerleading). AD-
specific, correctly typed (severity-tool discordance, underdiagnosis, methodology cautions), zero NSCLC leak.
Stage 2 (synthesize): 5 Belief Profiles, all depth=deep, 0 errors. Themes = genuine AD concepts: "Beyond-Severity
Burden Assessment", "Skin Barrier Therapeutic Targeting", "Psychodermatology Adjunctive Benefit" - thematically
named (not drug-named, anti-pattern guard held), calibrated confidence + real evidence links. The differentiated
"what does this investigator advocate" output, working for AD.
TAG correct on all 5: therapeutic_area='atopic-dermatitis' (matches getScientificNarrativeForHcp / DetailScreen
taSlug for AD). Top-5 = real AD KOL roster (Silverberg, Guttman-Yassky, Simpson, Eichenfield, Lio). Guttman-Yassky
(rank 2) has a profile -> verification target.
=> VERIFY (Garrett): Guttman-Yassky Belief Profile - (1) section renders (Deep Corpus badge, confidence meter,
strongly-advocates/frequently-raises/research-focus buckets)? (2) reads TRUE to her (AD immunopathology/endotyping
figure - founder gut-check, "is this actually her")?
TWO HOUSEKEEPING (Code): (1) Guttman-Yassky's stored name uses Unicode hyphen U+2010 not ASCII - detail render by
hcp_id unaffected, but name SEARCH w/ normal hyphen might miss. Separate data-hygiene item, log it. (2) scripts
applied but NOT committed - commit after Garrett confirms render ("Belief Profiles: parameterize scientific-positions
pipeline by --ta; AD support + idempotent Stage 1").
NEXT: verify render + gut-check -> commit the 2 scripts -> full top-100 run (Stage 1 sequential ~1-2hr, BACKGROUND
it; Stage 2 fast after). Then Top Collaborators + Research Themes remain.

### 30ea. OPERATIONAL RULE (Garrett): run LONG enrichment jobs directly in Garrett's terminal, NOT as Code background jobs. Live progress vs buffered blackout.
Garrett: future long runs should be in the terminal so we see progress/duration/ETA. CORRECT - a real limitation
surfaced today:
  - Code background job (output redirected to file) = BLOCK-BUFFERED -> progress doesn't flush until stage finishes.
    Code flew blind ("still on first HCP after 90s, output won't appear until done"). No live progress/ETA/rate for
    a 1-2hr job = bad (can't tell healthy vs stalled vs erroring until done).
  - Garrett running directly in his terminal (the narrative run) = STREAMED LIVE: "Progress: 125/200 | success=123
    failed=2 | rate=0.1/sec | ETA=12.9 min". Full visibility, watch failures, know completion, can Ctrl-C.
RULE: LONG enrichment/generation runs (narratives, Belief Profile Stage 1, future TA pipelines) -> Garrett runs
them DIRECTLY in his terminal (python scripts/...) for live progress + ETA + failure count + abort control. Code is
for the CODE (parameterize, trace, review, fix) + short/verifiable runs; the multi-min/multi-hr GENERATION runs go
in Garrett's terminal. (If Code must run one, use unbuffered: python -u, or PYTHONUNBUFFERED=1, so output streams -
but Garrett's terminal is the better default for visibility.)
=> APPLIES NOW: the full Belief Profile top-100 run - Garrett runs it in his terminal (python scripts/narrative/
extract_scientific_positions.py --ta atopic-dermatitis --cohort established, then generate_scientific_position_
synthesis.py --ta atopic-dermatitis) to watch Stage 1's ~1-2hr progress live, rather than Code backgrounding it.
NEXT: Garrett runs full Belief Profile in terminal (live progress). Parity analysis (read-only) can run in Code in
parallel.

### 30eb. Verified: Code WAS already running full Belief Profile Stage 1 (job bkivbkcyk, 15:58:29, ~9/100 HCPs, 409 positions, healthy). Garrett right to check first (would've been 2 racing processes). DECISION: A - leave it running.
Garrett asked "are we sure Code isn't already doing this?" - GOOD catch. Code verified (checked process + DB twice):
YES it's running the full top-100 Stage 1 (bkivbkcyk, started 15:58:29, no --limit, actively writing hcp_scientific
_positions_v1). Live proof: AD positions 249/5HCPs (test-5) -> 409/9HCPs, rank order, idempotent-replacing test-5 +
extending. Stage 2 queued (auto-launch when Stage 1 done). test-5 job (bswnb91sk) separate/complete.
=> Starting a 2nd Stage 1 in Garrett's terminal would RACE: two processes delete+insert same HCPs -> lost/half-
written HCPs + double spend. Confirmed don't.
DECISION: A - leave Code's run going. Rationale: already 9% done + healthy (killing = throw away progress + re-spend);
visibility benefit smaller for THIS run (Code gives stage-boundary notifications + manual progress reads); the
terminal-visibility RULE (§30ea) applies to NEXT runs, not retroactively worth a kill+restart. Stage 2 is fast
(doesn't need terminal); Collaborators/Themes/future TAs = where the terminal rule kicks in.
LESSON REINFORCED: verify state before acting (Garrett caught me prescribing a terminal run without confirming Code
wasn't already running it - the exact assume-don't-verify failure we avoid). Also: I lacked visibility into Code's
in-flight jobs - always ask Code for status before starting parallel work on the same resource.
NEXT: A (Code finishes Stage 1 -> auto Stage 2, notifies at boundaries). Parity analysis (read-only, §30 revised
4-column prompt both cohorts) runs in Code in PARALLEL - won't touch the running job. Then verify Guttman-Yassky
Belief Profile renders (may already be visible from test-5).

### 30ec. PARITY MATRIX (live-DB measured) = AD definition-of-done. AD Established near-done (cleaner than NSCLC on core layers); AD Rising ENTIRELY UNBUILT (one blocker: rising scoring chain never ran).
Code built a live-DB parity matrix (4 cols: NSCLC Est, AD Est, NSCLC Rising, AD Rising). KEY FINDINGS:
HEADLINE: AD Established essentially DONE + CLEANER than NSCLC on core authority layers (98-99% vs NSCLC 57-58%) -
because AD used the TA-anchored 2,586-KOL cohort vs NSCLC's looser 11,390 LEGACY set. NOT apples-to-apples; AD does
NOT need to "catch up" to NSCLC's lower %. AD data quality arguably BETTER on foundational layers.
AD ESTABLISHED remaining (the near-done column):
  1. Belief Profiles - FINISHING NOW (job bkivbkcyk, Stage 1 ~12 HCPs in, 559 positions; Stage 2 auto-follows). ⏳
  2. Top Collaborators - 0, GAP. Needs collaborator-extraction run for AD (feeds detail-page collaborator panel).
     NET-NEW RUN.
  3. Research Themes - 0, GAP. Needs theme generator for AD. NET-NEW RUN.
  4. Narratives - 198 (intended top-KOL slice; NSCLC-parity IS a slice not 100% -> effectively done).
  5. Web signals / Medicare / Open Payments - structurally sparse (AD ~82% intl, US-gated), DISPLAY-ONLY, NOT
     blockers (per scoring doctrine: pharma weight-0/display-only).
  => AD Established = Belief Profiles (finishing) + Collaborators + Themes. TWO net-new runs. That's it.
AD RISING - entirely UNBUILT (biggest chunk): 0 HCPs scored. 3,234 rising_eligible candidates EXIST but the RISING
SCORING CHAIN NEVER RAN for AD. ENTIRE Rising column blocked on that ONE step. Fix: run scoring_pipeline.py (rising)
-> hcp_rising_star_ranks_v3 -> network_momentum -> unblocks column; then same overlays (narratives/Belief Profiles/
themes) as Established. = ONE coherent workstream (one blocker + downstream cascade), not scattered gaps.
HOW TO READ %: full-cohort layers (classification/pub-leadership/network/author-metrics) should approach 100% (AD
Est does 98-99%); overlay layers (Belief/narratives/themes/web-signals) are top-KOL BY DESIGN -> low % expected even
when "done", judge by top-N depth not cohort %; US clinical/commercial (Medicare/OpenPayments) coverage-capped by
US fraction (AD ~82% intl -> low = structural not defect); NSCLC's own gaps (58% pub-leadership, legacy classif) =
its larger un-anchored denominator, NOT a bar AD must match.
NOTE the Rising data-model wrinkle (from §30cy): the OLD rising chain (scoring_pipeline rising -> hcp_rising_star_
ranks_v3 + network_momentum) is what parity measures - but AD Rising was ALSO discussed as living in the NEW model
(hcp_rising_composite_v1/scientific_emergence_v1) w/ a frontend repoint pending. RECONCILE: which rising model is
canonical for AD? The scoring chain to run + the frontend repoint must target the SAME model. Clarify before running
AD Rising.
Code offered to save the matrix as docs/AD_PARITY_CHECKLIST.md - YES, track it in repo.
NEXT: let Belief Profile finish (Stage 1 -> Stage 2). Then AD Established: Collaborators run + Themes run = DONE.
AD Rising = separate coherent workstream (scoring chain + overlays + frontend repoint; reconcile old vs new model
first). Decide: continue vs bank (huge day).

### 30ed. Parity checklist saved to docs/AD_PARITY_CHECKLIST.md (108 lines, 4-col matrix + punch-list + reading guide, dated 2026-07-10, Belief Profiles mid-generation at snapshot). Committing ("docs: AD enrichment parity checklist vs NSCLC"). Running docs published for Garrett to save locally.
End-of-day-session checkpoint before Garrett's evening break. Belief Profile Stage 1 (bkivbkcyk) still running
healthy: 559 positions / ~12 HCPs in; Stage 2 auto-follows. Parity checklist committed + pushed. Running docs
(TA_BUILD_DEBT.md through here) published to outputs for local save.
STATE AT BREAK: AD Established near-complete (Belief Profiles finishing in background; Collaborators + Themes = 2
net-new runs remain). AD Rising entirely unbuilt (one blocker: rising scoring chain; reconcile old vs new rising
model first). All committed + pushed on ad-frontend-established (not deployed). Demo re-record queued for post-
enrichment.
PICKUP WHEN BACK: (1) verify Belief Profile finished (Stage1+Stage2) -> Guttman-Yassky Belief Profile renders +
reads true (founder gut-check). (2) AD Est: Top Collaborators run + Research Themes run. (3) AD Rising workstream
(resolve model question first). (4) demo re-record. (5) merge to foundation-rebuild to go live (after enrichment).

### 30ee. BELIEF PROFILE FULL RUN COMPLETE (both stages, 0 errors). 87/87 profiles, tagged atopic-dermatitis. 30.8 positions/HCP matches NSCLC baseline 35.1 (Gate 14 holds at scale). Idempotency held (test-5 replaced not duped).
Full AD Established Belief Profile build done + clean (ran during the Umbra session):
  STAGE 1: 100 HCPs (ranks 1-100) -> 2,676 positions across 87 DISTINCT HCPs, 0 API errors. 13 HCPs had no
    papers clearing the >=800-char/2020+/senior-or-first filter (expected - thinner lower-ranked KOLs; data-
    coverage fact not a failure). Polarity: 874 positive / 649 unmet-need / 596 hypothesis / 557 cautionary.
  STAGE 2: 87/87 Belief Profiles written, 0 errors, tagged atopic-dermatitis, zero empty bodies. Corpus-depth:
    56 deep / 14 focused / 17 signal_moment (RIGHT shape - top ranks rich corpora=deep, thinner=conservative
    signal framing; validates the cohort-asymmetric framing we preserved).
  IDEMPOTENCY HELD AT SCALE: test-5 HCPs cleanly REPLACED not duplicated (first real at-scale test of delete-
    before-reinsert - PASSED).
GATE 14 CHECK (vs tonight's NSCLC baseline 35.1 positions/HCP): AD full = 2,676/87 = 30.8/HCP = in the NSCLC band
(test-5's ~50 was the top-5 densest KOLs, as predicted). Polarity shape matches NSCLC (positive largest). Gate 14
HOLDS on the full run, not just test-5. Cost ~$15 as grounded.
Pipeline scripts already committed (d91e8e4). AD_PARITY_CHECKLIST.md updated (Belief Profiles row hourglass->done 87)
but UNTRACKED - commit pending ("docs: AD enrichment parity checklist vs NSCLC + Belief Profiles complete").
=> AD ESTABLISHED enrichment status: authority layers 98-99%, ranks deduped, narratives 198, Signal Summary
un-gated, BELIEF PROFILES DONE (87). Remaining: Top Collaborators (0) + Research Themes (0) = 2 net-new runs
(Themes has the tag-match risk - Gate 15 - therapeutic_area TEXT must = frontend read).
NEXT: (1) VERIFY Guttman-Yassky Belief Profile renders + reads TRUE (founder gut-check - the last validation on the
moat layer). (2) commit the parity checklist. (3) then Collaborators + Themes (trace-before-generate the themes tag).

### 30ef. REGRESSION on server restart: Guttman-Yassky shows "Unclassified" + WHOLE profile collapsed (no Why This Expert, no Signal Summary, no Belief Profile, no score block). This afternoon she rendered FULLY (§30dj/dk). Likely: dev server restarted on WRONG BRANCH (pre-fix code).
After localhost server was closed + restarted, Guttman-Yassky detail page shows "Unclassified - this HCP is in our
database but hasn't met cohort criteria. Available data shown below." = the OLD pre-fix behavior. NONE of today's
enrichment renders (no narrative, no Signal Summary, no Belief Profile, no Established score block). Only Engagement
Mix + Publication Timeline show.
This is a REGRESSION not a missing-data issue: she rendered FULLY this afternoon (§30dj score block classified,
§30dk full Signal Summary) + Belief Profile written to DB tonight (§30ee, 87/87 tagged atopic-dermatitis, DB-verified).
Data is intact in DB. The FRONTEND reverted to pre-fix behavior.
"Unclassified - hasn't met cohort criteria" is EXACTLY the pre-fix symptom (§30-series score-block bug): detail page
derived cohort from global hcps_v2 column (NULL for indication-scoped HCPs). The FIX made it derive from presence in
hcp_established_ranks_v3. Seeing pre-fix behavior => running pre-fix CODE.
MOST LIKELY ROOT CAUSE: dev server restart landed on the WRONG BRANCH (not ad-frontend-established which has today's
fixes - maybe foundation-rebuild/main/other). Without the score-block cohort-derivation fix, she reverts to
Unclassified, and narrative/signal/belief sections all gate off cohort -> total collapse.
CHECK: `git branch --show-current` + `git status`. If not ad-frontend-established -> `git checkout ad-frontend-
established` -> restart dev server -> she should render fully again (data's all in DB). If ON the right branch ->
deeper investigation (did a rebuild/HMR break, is the RPC returning her cohort, etc).
NEXT: confirm branch. Fix = checkout correct branch + restart. Then re-verify Guttman-Yassky renders full profile
incl Belief Profile + reads true.

### 30eg. Guttman-Yassky IS in ranks_v3 (global rank 1 + US rank 1) but frontend says "Unclassified" = CONTRADICTION. Also she moved 2->1 since this afternoon = ranks table CHANGED. Not stale build (branch confirmed). Investigate what recomputed ranks + why read path misses her.
git branch confirmed ad-frontend-established (code fixes present, committed). So NOT a wrong-branch issue.
DB check: Guttman-Yassky (f5a0351e) IS in hcp_established_ranks_v3 for AD - global rank 1, US rank 1. Only 2 rows
(not duplicated - dedup held). BUT: she was rank 2 this afternoon (behind Silverberg), now rank 1. => THE RANKS
TABLE CHANGED since this afternoon. Something recomputed established ranks tonight.
THE CONTRADICTION: data says established-rank-1 (both scopes), UI says "Unclassified - hasn't met cohort criteria."
Can't both be right on correct code. Points to: frontend read path not finding her rank despite it being there.
CANDIDATES:
  1. A rank recompute fired tonight (recompute_established_ranks_v3?) - Belief Profile READS ranks (to select top-
     100) it doesn't WRITE them, so something ELSE ran. Check: did Code trigger a recompute? "1 commit ahead of
     origin" - what's that commit?
  2. Detail page reads cohort from pre-fix path (global hcps_v2 column) not hcp_established_ranks_v3 -> fix not in
     running code despite being on branch (stale build still possible - hard-refresh not yet confirmed).
  3. .maybeSingle() on global scope: original dedup bug (§30cx) was dup global rows -> maybeSingle returns null ->
     rank renders null. She's NOT duplicated now (only 2 rows), so this specific bug isn't recurring - but if the
     read expects a specific scope_value shape and the recompute changed it, could miss.
KEY DIAGNOSTIC: computed_at on her rank rows. If tonight -> something recomputed (investigate what). If this
afternoon -> ranks stable, problem is purely frontend (stale build/cache -> hard-refresh).
NEXT: (1) check computed_at + whether the recompute was intended. (2) hard-refresh browser (Ctrl+Shift+R) - still
not confirmed done. (3) if she's rank 1 in DB but Unclassified in UI after hard-refresh -> the read path is the bug
(is the score-block fix actually reading ranks_v3? verify the running code). Investigate before assuming.

### 30eh. Ranks are July-8 stable (computed_at 2026-07-08 18:16:34) - NO recompute tonight; Claude misremembered her as "rank 2 this afternoon" (she's been global+US rank 1 since the 8th). Hard-refresh did NOT fix. => running frontend not executing the score-block fix despite branch being correct.
computed_at = 2026-07-08 18:16:34 (both rows). So ranks STABLE since Jul 8, nothing recomputed tonight. Claude's
"she was rank 2 this afternoon" memory was WRONG - she's been rank 1 global+US since the 8th. No mystery recompute;
that thread CLOSED. Data has been correct+stable throughout (rank 1, one row/scope).
Hard-refresh did NOT fix the Unclassified render. So RULED OUT: wrong branch (confirmed ad-frontend-established),
changed/bad data (stable, rank 1), browser cache (hard-refresh no-op).
REMAINING EXPLANATION: the RUNNING dev server isn't executing the score-block fix - she's rank 1 in ranks_v3 but the
detail page can't classify her. Fix is COMMITTED on branch but running server not reflecting it. Causes to check in
order:
  1. STALE DEV SERVER PROCESS (most likely): Vite started BEFORE the fix commit / before checkout -> serving old
     bundles. A browser refresh won't help (server serves stale code). FIX: fully KILL the Vite process (Ctrl+C,
     confirm dead) + `npm run dev` fresh + hard-refresh.
  2. Fix not actually in the running file: have Code confirm the score-block cohort-derivation fix (derive cohort
     from presence in hcp_established_ranks_v3 when taId passed, not the global hcps_v2 column) is present + trace:
     for an AD HCP IN ranks_v3 but NULL in global hcps_v2 cohort col, does the read classify established or
     unclassified?
  3. EDGE CASE - her global row scope_value=NULL: if the read filters on scope or .single()/.maybeSingle() mishandles
     the null-scope global row, it misses her rank even though present (same SHAPE as the original dedup bug §30cx;
     she's not duplicated now but the null-scope read could still mishandle).
LEAN: kill-and-restart dev server (1) first - "branch right, files right, UI old" = classic stale server process.
NEXT: fully stop Vite -> npm run dev fresh -> hard-refresh. If classified -> stale process was it. If STILL
unclassified on clean restart -> read-path edge case (2/3), have Code trace why the fix isn't firing for her null-
scope-global row.

### 30ei. RESOLVED: stale Vite dev-server process was serving old bundles. Full kill + `npm run dev` restart brought the score-block fix back into running code -> Guttman-Yassky renders fully incl Belief Profile. Data was correct throughout.
The Unclassified regression (§30ef-eh) = a STALE VITE PROCESS (started before the fix commit) serving old compiled
bundles. Browser hard-refresh couldn't fix it (server-side stale, not browser cache). Full kill + npm run dev fresh
-> Guttman-Yassky renders fully again (score block classified + Signal Summary + BELIEF PROFILE). Data/branch/ranks
were correct the entire time.
LESSON (operational): after committing frontend fixes, a browser refresh is NOT enough - the Vite DEV SERVER must be
restarted to pick up committed changes if it was running from before. "Branch right + files right + UI shows old
behavior + hard-refresh no-op" = stale dev-server process -> kill Vite, npm run dev fresh. (Add to Part II verify-in-
browser discipline: ensure the dev server was started AFTER the code under test.)
ALSO logged: Claude misremembered her as "rank 2 this afternoon" - she's been global+US rank 1 since Jul 8 (computed_
at proved it). Verify timestamps, don't trust recollection of ranks.
=> BELIEF PROFILE fully validated end-to-end: 87/87 built, tagged, RENDERING on Guttman-Yassky. Remaining: founder
gut-check (does it read TRUE to her?) + commit parity checklist + Collaborators + Themes.
NEXT: (1) the founder domain-truth read of Guttman-Yassky's Belief Profile - is it genuinely HER? (2) commit AD_
PARITY_CHECKLIST.md. (3) Collaborators + Themes runs (trace themes tag first).

### 30ej. Belief Profile FOUNDER GUT-CHECK PASSED (Guttman-Yassky reads legitimate). Deep Corpus, 10 papers/50 positions. Specific to HER real work (single-cell, tape-strip, CCL17/TARC, IL-13/JAK1). Advocacy-vs-caution split working. Advisor read still ideal for the definitive domain-truth nod.
Guttman-Yassky Belief Profile renders + Garrett's gut-check = "looks legitimate." Analysis of WHY it holds:
  - SPECIFIC TO HER real work (not generic AD): "single-cell and tape-strip approaches", "CCL17/TARC", "tape strip
    RNA sequencing as scalable alternative to skin biopsy", "IL-13 and JAK1 inhibition" - maps to her genuine
    signature (molecular endotyping, minimally-invasive profiling, translational mechanism->trial bridge). Generic
    would say "advocates biologics"; this cites her METHODS = real abstract extraction.
  - POLARITY SPLIT doing real work: Strongly Advocates = positive positions (JAK1 efficacy, biomarker frameworks);
    Frequently Raises = her CAUTIONS/unmet-needs (dose-dependent tolerability, biomarker validation gaps, long-term
    evidence gaps >16wk for JAK inhibitors). Captures a serious scientist advancing a therapy AND flagging limits =
    not cheerleading. Sophisticated field-accurate concerns.
  - Deep Corpus badge (correct for her stature), 50 positions/10 papers = 5/paper (at cap, thorough).
  - Every position "Supported by N publications" + View sources = the MOAT working (grounded in her actual papers,
    traceable). No publication-count competitor can replicate.
FOUNDER GUT-CHECK: PASSED (smell test). CAVEAT (per Umbra constitution Art V - domain-truth validation stays human/
expert): Garrett is not the AD domain expert; the DEFINITIVE nod on the moat layer should come from the AD ADVISOR
before customer-facing. Nothing looks wrong; the advisor read is the deeper validation (catch overstatement/missing
themes neither Garrett nor Claude would). Not blocking; queue advisor review of Belief Profiles.
=> BELIEF PROFILE COMPLETE + validated (founder-level). Moat layer built for AD Established.
NEXT: (1) commit AD_PARITY_CHECKLIST.md. (2) queue advisor review of AD Belief Profiles (definitive domain-truth).
(3) Top Collaborators + Research Themes runs (trace themes tag first - Gate 15).

### 30ek. CONCERN (Garrett): platform surfaces only 19 US Established AD HCPs. Diagnose kind-of-problem BEFORE fixing. Likely: nppes_practice_state bottleneck (US filter needs practice-state; only ~31% NPPES match) stacking on AD's 82%-intl skew - NOT a small roster.
Garrett's concern: only 19 US Established AD HCPs surface - too low for a workable MSL roster. Take seriously but
DIAGNOSE which problem (data vs frontend-surface - just spent an hour where data was fine but UI showed nothing).
DIAGNOSTIC 1 - real US Established count in ranks:
  SELECT COUNT(DISTINCT hcp_id) FROM hcp_established_ranks_v3 WHERE therapeutic_area_id='9e4139d2...' AND scope_type=
  'region' AND scope_value='US';
  -> if ~19: constraint upstream (classification/practice-state). If hundreds: "19" is frontend/filter artifact.
PRIOR (from this week): AD ~82% intl (why pharma display-only, NPI ~31%, US clinical structurally sparse). Small US
count PARTLY reflects genuinely intl-heavy AD leadership. BUT 19 feels too low even for 82%-intl -> suspect a 2nd
stacking factor:
  THE nppes_practice_state BOTTLENECK: territory/US filtering reads hcps_v2.nppes_practice_state DIRECTLY (Part II
  §7h). NPPES matching only succeeded ~31% of US clinical HCPs (Gate 6). So "US Established" in the FRONTEND may be
  gated on "has practice_state" not "is US+established" -> if only a fraction of AD US Established KOLs got an NPI/
  practice-state match, surfaced count COLLAPSES though many more are genuinely US-based established. LIKELY CULPRIT:
  not 19 US Established HCPs, but 19 with the practice-state field the US filter requires.
DIAGNOSTIC 2 - US-by-country vs has-practice-state:
  SELECT COUNT(*) FILTER (WHERE h.country='US') AS est_country_us, COUNT(*) FILTER (WHERE h.nppes_practice_state IS
  NOT NULL) AS est_with_practice_state FROM hcp_established_ranks_v3 r JOIN hcps_v2 h ON h.id=r.hcp_id WHERE r.
  therapeutic_area_id='9e4139d2...' AND r.scope_type='global';
  -> if est_country_us >> est_with_practice_state (e.g. 150 vs 19): bottleneck = NPPES practice-state population, NOT
  roster. FIX = practice-state backfill (known tractable gap: state-derivation step §PLAYBOOK, NPPES match rate),
  NOT re-scoring/re-ingesting.
NEXT: run both diagnostics. Determine: (a) real US Established roster size, (b) whether practice-state is the gate.
Then decide fix (practice-state backfill vs deeper). Don't assume 19 is the true roster.

### 30el. "19 US Established" was a FILTER/DISPLAY ARTIFACT - real US Established roster = 447. Practice-state gap real: 447 US-by-country but only 153 have nppes_practice_state (294 invisible to STATE-based territory filters). Dashboard now shows full roster (post Vite restart).
Diagnostics: US Established (region rank) = 447 distinct HCPs. US-by-country = 447; with nppes_practice_state = 153.
=> "19" was NEVER the roster. Real US Established AD = 447. Dashboard screenshot (post Vite restart) shows a FULL
roster (Guttman-Yassky, Simpson, Eichenfield, Lio, Paller, Yosipovitch, Abuabara, Feldman, Shi, Sidbury, Margolis,
Alexis, Kim, Steinhoff, Silverberg J+N, Brunner, Hebert, Bunick, Estrada... 24+ visible, more scrolling). Healthy.
TWO SEPARATE THINGS:
  1. THE 447-vs-153 PRACTICE-STATE GAP (real, tractable): all 447 in ranks, but only 153 have nppes_practice_state.
     A STATE-based territory filter can only place 153; the other 294 are US-by-country w/ no state -> invisible to
     state-specific territory views. This is the NPPES ~31% match rate (Gate 6) manifesting. 294 US Established AD
     HCPs invisible to state territory filtering.
  2. "WHERE DID 19 COME FROM?" - neither 447 nor 153. Candidates: (a) count under a SPECIFIC STATE selected in the
     territory filter (19 = one state's roster); (b) a COUNT BADGE reading a different table than the feed
     (getTACounts reads _scores_v2 vs feed _ranks_v3 - can disagree, Part II §7h); (c) STALE VITE bundle pre-restart
     (same bug that hid Guttman-Yassky §30ei) - now fixed. LIKELY (a) or (c) given dashboard now shows full roster.
DECISIONS:
  A. PRACTICE-STATE BACKFILL (fixes the 294): populate nppes_practice_state for more US Established via the state-
     derivation step (institution->state mapping, PLAYBOOK) + better NPPES matching. Known bounded task. Gets more
     of the 447 into state territory views.
  B. FILTER FALLBACK (faster, product decision): should the US/territory filter require practice-state at all? For
     intl-heavy AD, gating on an NPPES CLINICAL match drops US-based ACADEMICS/researchers who are legit US+
     established but lack/didn't-match an NPPES record. Fall back to country='US' when practice_state null -> surface
     the real US roster now, before backfill. Smaller frontend change.
NEXT: (1) pin down what "19" actually was (select a state? count badge? stale?) - probably resolved by the restart.
(2) decide practice-state backfill (A) and/or filter-fallback (B) for the 294 without state. Neither is urgent -
447 roster is healthy + surfacing.

### 30em. CORRECTION: the dashboard DOES render exactly 19 cards (Claude miscounted "24+"). So 19 is REAL + reproducible POST-restart, NOT a stale ghost. Hard contradiction: DB 447 US Established, feed renders 19. Find where 447->19 collapses. Likely a FEED LIMIT/PAGINATION (the 19 are the TOP-19 by rank) or the "Territory (US-intel)" filter.
Garrett corrected: image has exactly 19 HCP cards (Claude's "24+" was a sloppy miscount - apologized). So "19" is
REAL, reproducible AFTER the Vite restart - not a stale-bundle artifact. Retract §30el's "full roster surfacing"
conclusion.
HARD CONTRADICTION: hcp_established_ranks_v3 = 447 US Established AD; frontend feed renders 19. 428 dropped between
ranks table and rendered feed.
KEY CLUE: the 19 shown are the TOP-19 BY RANK (Guttman-Yassky #1, Simpson, Eichenfield, Lio, Paller, Yosipovitch,
Abuabara, Feldman, Shi, Sidbury, Margolis, Alexis, Kim, Steinhoff, Silverberg, Brunner, N.Silverberg, Hebert,
Bunick, Estrada - top ranks in order, then STOPS). Top-N-then-stops STRONGLY suggests a LIMIT/PAGINATION cutoff, NOT
a data filter (a filter would scatter, not truncate the top). Also NOT simply practice-state (that'd show 153 not 19).
Screenshot: "Territory (US-intel)" filter toggled ON.
FUNNEL to diagnose: 447 US Established -> 153 with practice-state -> 19 rendered. What cuts 153->19 (or 447->19)?
Candidates: (a) FEED LIMIT/page-size resolving to 19 (most likely given top-19-by-rank); (b) "Territory (US-intel)"
filter intersecting to a narrow set; (c) practice-state AND something else.
DIAGNOSTICS: (1) confirm 447 (done). (2) confirm 153 w/ state (done). (3) distribution of the 153 by state (ORDER BY
n DESC) - if scattered summing to 153, 19 is a FRONTEND cap not a state count. 
CODE TRACE (parallel): the get_established_filtered (or the Immunology->AD Established feed) RPC - what's its LIMIT/
page-size? does "Territory (US-intel)" cap it at 19? why 447->19: pagination vs practice-state vs territory filter?
Show the feed query + limit/filter params.
NEXT: run state-distribution SQL + Code feed-trace IN PARALLEL. Pin whether it's a feed limit (likely) or a filter.
The top-19-by-rank pattern = probably a limit/page-size bug or a hardcoded cap.

### 30en. DIAGNOSIS: the 447->19 collapse is a FEED LIMIT/PAGINATION cap, NOT a filter. State distribution scatters across ~29 states (CA 24/NY 20/TX 10...) summing to 145 - NO single state has 19. So 19 != a state count + != practice-state (145). The feed renders top-19-by-rank then stops = a limit.
State distribution of the 145 US Established w/ practice-state: CA 24, NY 20, TX 10, MD 9, IL 8, PA 8, FL 7, OH 6,
MA 6, CT 5, ... 29 states, sum 145. NO state = 19. (Note: with_state now 145 not 153 - minor drift, immaterial here.)
=> CONCLUSION: "19" is the FRONTEND FEED CAPPING at ~19 (top-19 by rank then stops). NOT a state count, NOT the
practice-state filter (145), NOT a scattered data filter (would not truncate the top cleanly). It's a LIMIT/
PAGINATION on the feed. The 447 roster is real + correctly ranked; the feed just doesn't render past ~19.
WHY 19 SPECIFICALLY (odd for a hardcoded limit - expect 20/25/50): (a) LIMIT 20 with an off-by-one or 1 row dropped
for a null field -> 19; (b) page-size 20, first page minus 1; (c) "Territory (US-intel)" filter intersecting the
feed requiring some field that ~19 of top-20 have; (d) literal hardcoded cap. Code trace will pin it.
practice-state 145/153 = RED HERRING for this bug (matters for state-territory PLACEMENT, not the feed cap).
CODE TRACE (fire this): the AD Established US feed RPC / query for Immunology->AD w/ Territory(US-intel) on - find
the LIMIT / page-size / any cap; why does it render ~19 of 447? Is it LIMIT 20 (off-by-one), pagination page-size,
or the territory filter requiring a field? Show the query + limit/filter/pagination params + whether pagination/
"load more" exists.
NEXT: Code trace to find the exact cap. Likely a one-line fix (raise/remove limit, fix pagination, or fix the
territory-filter intersection). 447 roster is healthy - purely a feed-rendering cap. THIS is the real "only 19"
bug + it's tractable.

### 30eo. REFRAME (Garrett caught it): feed shows Guttman-Yassky in #1 CARD position but she's US rank #2 - the true US #1 (Silverberg) is MISSING from the feed. So it's a FILTER DROPPING SPECIFIC HCPs, not just a count limit. The dropped #1 is the key.
Garrett: the cards show Guttman-Yassky at the top but she's US rank #2 (Silverberg is US #1 per Gate 10: Silverberg,
Guttman-Yassky, Simpson, Eichenfield...). If the #1 (Silverberg) is absent/not-at-top, the feed is DROPPING specific
HCPs, not merely capping count. This reframes "19": maybe not top-19-by-limit but "the 19 who PASS SOME FILTER, in
rank order" - and the filter drops the #1.
WHAT DROPS SILVERBERG SPECIFICALLY? He HAS an NPI (1831325521, GWU/DC, verified Gate 6) - but did his nppes_practice_
state populate? Candidates for the dropping field: (a) nppes_practice_state NULL (feed requires state -> drops the
~302 without it, AND if Silverberg's state didn't populate he drops despite having an NPI); (b) some display field
(headshot/score component/column) the feed requires; (c) territory filter requiring US-intel data.
UNIFYING HYPOTHESIS: the feed requires nppes_practice_state (or similar), showing only top-ranked HCPs who HAVE it.
447 US Established -> ~145 with practice-state -> the top ~19 of those by rank render. Silverberg (#1, possibly null
state) drops -> Guttman-Yassky (#2, NY ✓) becomes first card. This ties count + missing-#1 together: it's a PRACTICE-
STATE (or similar field) REQUIREMENT in the feed, not a limit.
DIAGNOSTIC (run): top-25 US Established by rank WITH practice_state + country:
  SELECT r.hcp_id, h.full_name, r.rank, h.nppes_practice_state, h.country FROM hcp_established_ranks_v3 r JOIN
  hcps_v2 h ON h.id=r.hcp_id WHERE r.therapeutic_area_id='9e4139d2...' AND r.scope_type='region' AND scope_value=
  'US' ORDER BY r.rank LIMIT 25;
  -> compare to the 19 cards. HCPs in query but NOT on dashboard = the dropped ones. If they share a null field
  (practice_state?) = THE FILTER. If Silverberg #1 has null practice_state + is missing -> confirmed: feed requires
  practice-state, drops #1.
=> This is likely the SAME root as the "19": a field-requirement filter, not a limit. Code's feed trace + this SQL
converge. If confirmed, the fix (Option B from §30el) = feed should NOT require practice-state (fall back to country=
US), which simultaneously restores the #1 AND expands 19->fuller roster.
NEXT: run the top-25 SQL, compare to dashboard, confirm the dropped field. Pair w/ Code's feed trace.

### 30ep. ROOT CAUSE FOUND (Code, empirical): TWO stacking bugs = 447->19. Practice-state was a RED HERRING (confirmed). Bug A: count RPC reads wrong table (v2 not v3) -> AD count=0 -> Load-More gated off -> feed frozen at page-1 (20). Bug B: industry filter substring "roche" eats "University of Rochester" (rank 18) -> 20-1=19.
Code traced the feed empirically (ran count+rows RPCs vs DB). "19" = page-size 20 frozen by Bug A, minus 1 Rochester
false-positive (Bug B). NOT a limit, NOT practice-state (red herring - confirmed), NOT the territory filter.
BUG A (the real cap): two RPCs point at DIFFERENT tables. get_established_filtered (ROWS) reads hcp_established_ranks
_v3 ✓ (447 AD rows). get_established_filtered_count (TOTAL) still reads hcp_established_ranks_v2 ✗ (0 AD rows). The
migration 2026_05_28_get_established_filtered_v3.sql repointed the ROWS fn to v3 but NEVER the COUNT fn (body still
FROM hcp_established_ranks_v2 er, verified via pg_get_functiondef). AD built into v3 ONLY -> count returns 0. NSCLC
has v2 rows so its count works -> why this never surfaced until AD. Downstream: getEstablished->fetchCohortViaRpc
sets feedTotal=data.total=0. Load-More gated by hcpList.length < feedTotal (App.tsx:911) -> 19<0 = false -> NO
pagination -> feed frozen on page 1 (20 rows).
BUG B (the -1): rows RPC returns 20 (ranks 1-20). Client-side INDUSTRY_PATTERNS filter (api.ts:232) drops any
institution containing a pharma substring - list includes bare token "roche" (api.ts:675). Matches "University of
Rochester Medical Center" (rank 18) -> KOL wrongly filtered as industry. 20-1=19. Over-filters EVERY page (Code
flagged 76/447 as "industry" - unknown share are Rochester-style false positives).
=> "19" = 20 (page-1, frozen by A) - 1 (Rochester false-pos, B). Garrett's missing-#1 catch = Bug B dropping ranked
HCPs via substring false-positive (proved it was a filter not a clean limit - he was right).
PRACTICE-STATE RED HERRING confirmed: "US-intel"=national territory -> states=[] -> p_states=ARRAY[]::text[] -> the
RPC's (cardinality(p_states)=0 OR ...) short-circuits TRUE -> NO practice_state filter applied. The 19 are global
top-by-rank (1-20), not a state subset. practice-state (145/447) only bites if a REGIONAL territory is selected (and
even then count RPC still returns 0 - same v2 bug).
THE FIXES: Bug A (the real one): repoint BOTH get_established_filtered_count overloads to hcp_established_ranks_v3
(one-word table swap mirroring the rows fn) -> restores total=447 + Load-More. CHECK community/rising count RPCs for
the same missed-repoint. Bug B: make industry match token/word-boundary aware (or drop bare "roche") so it stops
eating "Rochester" (+ watch similar substrings).
NEXT: (1) fix Bug A (count RPC v2->v3 repoint migration) - restores 447 + pagination. (2) fix Bug B (industry
substring word-boundary) - stops dropping Rochester + audit the other 76 flagged industry for false positives. (3)
verify feed shows full 447 in correct rank order w/ Silverberg #1. (4) CHECK rising/community count RPCs for the same
v2/v3 miss.

### 30eq. Both fixes AUDITED + APPROVED. Bug A = Established-count-only (Rising/Community count RPCs verified consistent - NOT affected). NSCLC safe (2885 v2==v3 identical). Bug B blast radius = only 1 false-pos (Rochester, 4 HCPs); other 72 real pharma. Apply both.
Code audited (empirical) + proposed diffs:
BUG A AUDIT: rows/count table consistency per cohort: Established rows=v3/count=v2 = MISMATCH (the bug); Rising v3/v3
= ok; Community v2/v2 = ok. => Established-count-ONLY. My "check rising/community" worry resolved correctly (Code
verified, didn't assume - they're internally consistent). NSCLC SAFETY VERIFIED: established US count 2885 in BOTH
v2 and v3 (identical) -> repoint v2->v3 leaves NSCLC unchanged (2885), fixes AD (0->447), and makes NSCLC's count
consistent (was silently reading a different same-numbered table). AD Rising/Community rank tables empty (0 rows) ->
feeds empty for real data reason, count RPCs correctly return 0 (consistent w/ parity checklist, not a bug).
BUG B BLAST RADIUS: 76 flagged HCPs span 9 institutions; only ONE false-positive: "roche" in "University of
Rochester Medical Center" (4 HCPs). Other 8 patterns (pfizer 17/regeneron 15/sanofi 12/abbvie 11/eli lilly 11/
incyte 3/iqvia 2/astrazeneca 1) all REAL pharma/CRO, word-boundary-safe. Word-boundary fix frees exactly 4 Rochester
HCPs, keeps all 72 genuine drops. Low risk, precisely scoped. (NOT the product-wide issue I feared - only "roche"
leaked.)
DIFFS: Bug A - both count overloads: hcp_established_ranks_v2 er -> _v3 er, same signatures, CREATE OR REPLACE (no
DROP), standalone/no-txn/no-- comments, NOTIFY pgrst included. Bug B - word-boundary regex BUILT FROM the existing
INDUSTRY_PATTERNS list (list stays source of truth, no churn), .some(includes)->.test() at both call sites (api.ts
:238 rising + :248 established/community). \b...\b escaped -> "roche" won't match "Rochester".
APPROVED both. Order: Bug A (migration via direct DB connection) then Bug B (frontend edit + typecheck/build).
VERIFY: Bug A - AD count RPC 0->447, NSCLC 2885 unchanged, frontend "Load 20 More" appears (19<447 now true). Bug B
- typecheck 70 baseline/build green, Rochester's 4 no longer flagged, rank-18 Rochester KOL renders, feed 19->20 on
page 1. THEN full verify: feed shows 447 across pages, correct rank order, SILVERBERG #1.
NEXT: apply both -> verify 447 + Silverberg #1 + Load More paginates. This was the real "only 19" bug (Garrett's
concern fully vindicated: wrong count AND wrong #1).

### 30er. Bugs A+B fixed (Load More appeared, Rochester KOL back = +1) BUT unmasked a THIRD bug: "Load 20 More" added only 1 card (not 20), and Silverberg (#1) STILL missing. => the ROWS RPC only returns ~21 rows total, not 447. Count(447) and rows(~21) now disagree the OTHER way. A filter on the ROWS query cuts 447->~21, dropping Silverberg.
After applying A+B + server restart: Bug A worked (Load More button appeared - count now 447 un-froze it). Bug B
worked (Rochester KOL back = +1 card). BUT:
  1. Guttman-Yassky STILL #1, Silverberg (true US #1) STILL missing -> dropped by something OTHER than the Rochester
     substring bug (separate cause).
  2. "Load 20 More" added only 1 card (page 1 had 20 -> now 21), NOT 20. => the ROWS RPC page 2 returned ~1 row then
     dried up. The rows query is returning ~21 TOTAL, not 447.
=> THIRD BUG: count RPC (repointed to v3) correctly returns 447, but the ROWS RPC only delivers ~21 rows. They now
disagree the OTHER way (count 447 / rows ~21). A FILTER on the ROWS query cuts 447->~21 and drops Silverberg (#1).
The rows RPC applies a restriction the count RPC doesn't (they were already proven to differ - read different tables
pre-fix; may differ in MORE than the table - joins/filters/where-clauses).
NOT practice-state (US-intel=national -> p_states=[] -> no practice-state filter per Code §30ep). So what does the
ROWS query require that count doesn't? Candidates: (a) an INNER JOIN in rows that filters (e.g. joins a table only
~21 AD HCPs have a row in - a score component? a display table? headshot/enrichment?); (b) a WHERE clause in rows
absent from count; (c) rows joins hcps_v2 or another table on a condition that excludes most.
DIAGNOSTIC: dump BOTH get_established_filtered (rows) and get_established_filtered_count definitions and DIFF their
FROM/JOIN/WHERE - the rows fn has an extra restriction. Also: run the rows RPC directly for AD US with p_limit=500
p_offset=0 - how many rows? (should be 447; bug if ~21). And check what Silverberg's hcp_id has/lacks that the ~21
shown have (the joined/filtered field).
NEXT: Code dumps + diffs the two RPC bodies (rows vs count) to find the extra filter/join in ROWS. Run rows RPC
directly (limit 500) to confirm it returns ~21 not 447. Find what the ~21 share that the other ~426 (incl Silverberg)
lack. THAT field/join is bug #3. (Count fix was necessary but revealed the rows query was ALSO restricted.)

### 30es. Bug #3 ROOT CAUSE: loadMore (App.tsx:533) OMITS taId from its filters object -> getEstablished falls back to TA_ID_MAP['immunology'] = PARENT Immunology ta_id (0 Established rows) -> Load More fetches empty page. Rows RPC is INNOCENT (returns 447, Silverberg #1). Silverberg NOT dropped - browser is running a STALE BUNDLE.
Code diagnosed empirically. THE ROWS RPC IS FINE: ran directly limit 500 -> 447 rows, Silverberg rank 1 PRESENT,
top roster correct (#1 Silverberg/GWU, #2 Guttman-Yassky, #3 Simpson). am join is LEFT non-filtering; no INNER join,
no extra WHERE. My "rows has extra filter" hypothesis WRONG (Code checked, didn't assume).
REAL BUG #3: loadMore queries the WRONG TA. Initial load (App.tsx:499) filters={...taId, indicationTaId} (has taId).
loadMore (App.tsx:533) filters={therapeuticArea, region, states, themeIds} - taId MISSING. getEstablished does
taId=filters.taId ?? TA_ID_MAP[taSlug]; taSlug=taLabelToApiSlug('Immunology')='immunology' -> loadMore falls back
to the PARENT Immunology ta_id (4cf07827) which has 0 Established rows (AD is UNDER immunology but the immunology
ta_id itself has no HCPs). So Load More fetches an EMPTY page. "~21" = 20 (correct AD page 1) + ~0 (broken page 2).
= a direct TA-SCOPING BUG (PLAYBOOK §7f parent-vs-indication ta_id), hiding in loadMore instead of initial fetch.
Initial load was fixed to pass indication ta_id; loadMore was MISSED (the "find them ALL" lesson - like narrative
slug's 2 read sites).
SILVERBERG MYSTERY RESOLVED: he is NOT dropped. Live RPC shows him #1. Garrett sees Guttman-Yassky #1 -> BROWSER
RUNNING STALE BUNDLE (same stale-Vite issue as §30ei tonight). Live query = Silverberg #1; rendered page = Guttman-
Yassky #1 -> browser not running current code. (Rochester false-pos = Lisa Beck rank 18, NOT Silverberg - he was
never filtered.)
FIX #3 (one line): loadMore filters object add taId: indicationTaId (already in scope; initial load uses it).
Makes Load More query AD (447) not Immunology (0).
ALSO: grep other getEstablished/getCommunity/getRisingStars call sites (+ other loadMore/pagination paths) for the
same taId omission - this parent-fallback could lurk in community/rising load-more too.
NEXT: (1) apply fix #3 (loadMore taId). (2) HARD server restart + hard refresh (stale bundle is why Silverberg looks
missing - he's #1 in the data). (3) verify: Silverberg #1, Load More adds 20 (real page 2), pages through 447. (4)
grep other pagination call sites for taId omission. (5) commit A+B+C together.

### 30et. All 3 feed fixes COMMITTED (0dcc0d1). Audit: taId omission was loadMore-ONLY; its filters object is SHARED across established/community/rising branches -> the one fix covers all 3 cohorts' pagination. Verify in browser after CLEAN restart (B+C ship in the bundle - stale bundle = why Silverberg looked missing).
Committed 0dcc0d1 "fix(feed): AD Established feed shows all 447, not 19" (3 files +62/-3):
  A - count RPC repoint (both overloads -> ranks_v3): applied live to DB + committed as migration. AD 0->447, NSCLC
    2885 unchanged.
  B - INDUSTRY_REGEX word-boundary (\b, both call sites): frees Rochester (Lisa Beck rank 18), keeps real pharma.
  C - loadMore taId: indicationTaId added: Load More now queries AD (447) not parent Immunology (0).
AUDIT: the taId omission was loadMore-ONLY. Its filters object is SHARED across established/community/rising
branches -> the single loadMore fix covers community + rising load-more too (no sibling bug lurking - resolved the
§30es concern). Two initial-load sites (fetchHCPs:458, fetchData:499) already had taId. No feed callers outside
App.tsx. Typecheck 70 baseline, build clean.
CRITICAL FOR VERIFY: Bug A is live in DB; B+C ship in the FRONTEND BUNDLE -> only take effect on a clean rebuild.
Stale bundle = why Silverberg looked "missing" (data has him rank 1). MUST kill Vite + restart + hard refresh.
DEPLOY NOTE: B+C are on ad-frontend-established. If the deploy tracks foundation-rebuild, must merge/deploy ad-
frontend-established (or point deploy at it) to see B+C live at app.besselanalytics.com. Nothing pushed yet.
NEXT: (1) CLEAN restart (kill Vite, npm run dev, hard refresh). (2) verify: Silverberg #1, Load More adds real 20
(cards 21-40, AD not Immunology), pages through 447, Lisa Beck rank 18 present. (3) push ad-frontend-established.
(4) then back to enrichment (Collaborators + Themes) / the practice-state territory decision (separate, §30el).

### 30eu. After all 3 fixes + restart: HCPs load + paginate, but Silverberg STILL not #1 in the rendered feed - though the rows RPC returns him rank 1 (Code proved directly §30es). Contradiction persists. Split: is he PRESENT-but-not-first (client-side sort bug) or ABSENT (a filter still dropping him)?
Count/pagination fixed (HCPs loading). But Silverberg STILL not at top of rendered feed. Rows RPC returns him rank
1 (proven §30es). So DB/query fine, rendered order wrong. Possibilities:
  1. STALE BUNDLE AGAIN (bitten 3x tonight): confirm FULL Vite kill + hard-refresh (Ctrl+Shift+R). If any cached
     bundle -> old order.
  2. FRONTEND RE-SORTS client-side: RPC returns rank order (Silverberg 1) but UI re-sorts before render - by
     displayed score (both Silverberg & Guttman-Yassky show 100 -> rounded tie -> secondary sort by name/hcp_id/
     insertion puts Guttman-Yassky first). Would explain RPC-says-1 but UI-shows-2.
  3. Need to know WHO is #1 now: still Guttman-Yassky (nothing changed -> stale bundle) or someone ELSE (order
     shifted but not to Silverberg)?
KEY DISCRIMINATOR: is Silverberg PRESENT-but-not-first (scroll - at position 3/5?) or ABSENT entirely?
  - PRESENT not first -> client-side SORT/ordering bug (RPC gives him #1, UI re-sorts him down). Possibility 2.
  - ABSENT entirely -> a filter still drops HIM specifically -> filter hunt for one person.
DIAGNOSTIC: (a) confirm clean restart done. (b) is Silverberg visible anywhere in feed? (c) if present-not-first ->
Code: does the frontend re-sort the RPC rows client-side before render (by score/name/other)? the RPC returns rank
order; does the UI preserve it? Check the cohort feed render/sort path. (d) both Silverberg + Guttman-Yassky show
100 - is the displayed score rounded, causing a tie the UI breaks by a non-rank secondary key?
NEXT: get who's #1 now + is Silverberg present/absent. Then either (stale bundle -> real clean restart) or (client
sort bug -> Code check the render ordering vs RPC rank order).

### 30ev. CONFIRMED not stale bundle (clean restart + cache-disabled, Silverberg STILL absent). He's dropped by something REAL + specific between RPC-return (he's rank 1) and render. Trace his row end-to-end. Prime suspects: industry regex edge on "George Washington University", client-side dedup collision, or a null-field card-render guard.
Full clean restart (confirmed no stray node, hard-refresh cache-disabled) - Silverberg STILL not in rendered feed.
DEFINITIVELY not a stale bundle. Rows RPC returns him rank 1 (proven §30es). So something client-side between RPC
response and rendered cards drops HIS specific row.
SUSPECTS:
  1. INDUSTRY_REGEX edge: his institution = "George Washington University" (from Code's §es output). Does the new
     word-boundary regex match a token in it? (Pattern list: pfizer/regeneron/sanofi/abbvie/eli lilly/roche/incyte/
     iqvia/astrazeneca/parexel/syneos/icon plc/charles river - nothing obviously matches "George Washington
     University" but this feed keeps surprising; the \b fix could have an edge). CHECK definitively.
  2. CLIENT-SIDE DEDUP (hcp-dedupe.ts): keys on name+institution - could a key collision drop/collapse his row?
  3. NULL-FIELD CARD-RENDER GUARD: does his row lack a field a card component requires -> card skipped?
TRACE (Code): (a) run his actual institution string through INDUSTRY_REGEX -> true/false. (b) check dedup for a
collision on his row. (c) check card-render guards for a required field he's null on. (d) get his hcp_id + institution
from DB, trace that specific row through fetch->filter->dedup->render, find WHERE it disappears.
NOTE: Guttman-Yassky is rendering as #1 (she's rank 2). So the feed shows rank 2 as top = rank 1 (Silverberg) dropped,
everyone shifts up. Same shape as the Rochester drop but Silverberg-specific + survived the word-boundary fix -> if
industry filter, it's a DIFFERENT match than "roche"/Rochester.
NEXT: Code traces Silverberg's row to the exact drop point. Most likely (1) industry regex or (2) dedup. Fix, then
verify Silverberg #1.

### 30ew. FOUND IT (Garrett, via the FILTERS panel not the feed): DC is MISSING/unselected in the US States filter. All 50 states lit, DC greyed. Silverberg is at George Washington University, practice_state="DC" -> filtered out because DC isn't in the selected-states set. That's why the #1 US KOL drops.
Garrett inspected the Filters panel (not the feed) and spotted: US States shows all 50 selected/highlighted (red)
but DC is GREYED/unselected. Silverberg = George Washington University, Washington DC, nppes_practice_state="DC".
=> DC not in the states filter set -> Silverberg (+ any DC HCP) filtered out. He's the highest-ranked DC practitioner
-> the visible casualty (US #1 missing).
EXPLAINS EVERYTHING cleanly: not count RPC, not industry regex, not loadMore, not dedup - a FILTER-COMPLETENESS bug:
DC omitted from the US States list. The RPC returns him (Code queried WITHOUT the DC-excluding state filter, or at
national default) but the RENDERED feed applies the states filter which excludes DC. Survived all prior fixes because
it's an entirely separate cause.
ROOT: the US States filter list omits DC (shows "US STATES (50)" - 50 states, no DC). DC is a territory/district, not
a state - a classic "50 states" list that forgets DC (+ likely also PR, other territories). The default "all US" /
national selection is built from this 50-item list -> DC-based HCPs excluded by construction.
FIX: add DC to the US States filter list (and the default-selected set), and audit for other missing US
jurisdictions (PR, territories) if any AD HCPs have them. Also: confirm the "national/US-intel" default actually
selects ALL including DC (Code earlier said national -> p_states=[] = no filter; but the rendered behavior filters
DC out, so the UI default may pass the 50-state array, NOT []). Reconcile: does national pass [] (no filter) or the
50-state list (which omits DC)?
IMPACT: any DC HCP invisible in territory-filtered views. Silverberg (US #1 AD KOL, GWU/DC) = the headline casualty.
Demo-critical (wrong #1). Likely affects NSCLC + all TAs (DC omission is TA-independent).
NEXT: (1) add DC to the states filter list + default set. (2) reconcile national-default behavior ([] vs 50-list).
(3) verify Silverberg #1 in DC-inclusive feed. (4) audit for PR/other territories. This is the REAL reason Silverberg
was missing - all night's other fixes were also real bugs but THIS is the #1-missing cause.

### 30ex. TWO problems, second is structural: (1) DC omitted (3 AD HCPs incl Silverberg). (2) 302 of 447 US Established AD HCPs have NULL practice_state -> excluded whenever ANY state filter active = 68% of US roster invisible under territory filtering. Garrett: "AD needs to filter differently than NSCLC." CORRECT - this is a product-design fork.
Code confirmed: Silverberg practice_state="DC"; 3 AD Established in DC. AND 302/447 US Established AD have NULL
practice_state.
PROBLEM 1 (small): DC omitted from states list -> 3 DC HCPs (incl Silverberg #1) dropped. Fix: add DC.
PROBLEM 2 (STRUCTURAL, the real issue): 302/447 (68%) US Established AD have NULL practice_state -> excluded whenever
a state filter is active. Two-thirds of the US roster invisible under territory filtering.
WHY AD != NSCLC (Garrett's insight, correct): NSCLC US-centric, high NPI/practice-state coverage (US clinicians
match NPPES cleanly). AD 82% intl + US KOLs heavily ACADEMIC (Guttman-Yassky/Mt Sinai, Silverberg/GWU) whose NPPES
clinical records often don't populate practice_state -> structural 302/447-null gap NSCLC doesn't have. A state-
filter territory model that works for NSCLC silently hides 2/3 of AD's US roster. => PRODUCT-DESIGN FORK, not just a
bug.
OPTIONS for "territory" when most KOLs lack practice_state:
  A (LEAN): NULL practice_state INCLUDED in national/all-US view. "All US" = everyone country='US' regardless of
    practice_state (no state filter). Specific-state selection filters to that state (only the ~145 placeable).
    National = full 447; state view = the subset we can place. Silverberg shows (DC + national). Cleanest.
  B: backfill practice_state from institution (state-derivation GWU->DC, Mt Sinai->NY) - reduces 302, complementary,
    won't get all (ambiguous/intl institutions), more work.
  C: coverage-honest territory UX ("N in [state] + M unspecified") - more UX work.
KEY RECONCILIATION: Code earlier said national -> p_states=[] -> NO state filter. If that's intended, the 302 nulls +
DC SHOULD show in national. The BUG = the default isn't passing [], it's passing the explicit all-50-states array
(which omits DC AND excludes the 302 nulls). LIKELY FIX = make the default "all US" view pass [] (no state filter),
not an all-states-selected array -> surfaces all 447 in default view; state filtering = opt-in narrowing.
LEAN: Option A via the []-default fix + add DC to the list (for when DC is explicitly selectable). Backfill (B) later
for precise state placement.
NEXT: read the states-list + "select all"/default definition. Determine: does default pass [] or the 50-array? Fix
so default = all 447 (no state filter) + DC in the list. Verify Silverberg #1 + all 447 in national view. This is
the AD-differs-from-NSCLC territory-model decision.

### 30ey. ===== END-OF-DAY CLOSEOUT (2026-07-10 night) =====
TWO-DAY ARC COMPLETE. Banking here. Tomorrow's pickup is the territory-model fix (fully diagnosed, §30ex).

WHAT SHIPPED TODAY (committed):
  - AD Belief Profiles: 87/87 built + validated (§30ee, founder gut-check passed §30ej). The MOAT layer for AD Est.
  - Feed fixes A/B/C committed 0dcc0d1 (§30et): count RPC v2->v3 repoint (447 not 0), industry regex word-boundary
    (frees Rochester), loadMore taId (pagination queries AD not parent Immunology).
  - Docs current: TA_BUILD_DEBT (this, thru §ey), TA_GATE_BASELINES (Gates 1-16, all NSCLC baselines backfilled),
    TA_NEW_PLAYBOOK (Part II added: frontend repoint + enrichment). AD_PARITY_CHECKLIST saved.
  - UMBRA founding docs authored: Governance & Organizational Trust (constitution) + Implementation Doctrine
    (companion). In /mnt/user-data/outputs.

TOMORROW - FIRST THING (the one open bug, fully diagnosed):
  TERRITORY-MODEL FIX for AD (§30ex). Silverberg (US #1) still not rendering because:
    (1) DC omitted from the US States filter list (3 AD HCPs incl Silverberg practice in DC).
    (2) STRUCTURAL: 302/447 US Established AD have NULL practice_state -> excluded under any state filter (68% of US
        roster hidden). AD academic/intl -> low practice-state coverage, unlike NSCLC.
  FIX (decide from what Code finds): make the default "all US / national" view pass p_states=[] (NO state filter) ->
    shows all 447 incl nulls + DC; specific-state selection = opt-in narrowing to the ~145 placeable. Add DC to the
    states list. LEAN Option A. First: Code must report whether the default currently passes [] or the 50-state
    array (determines 1-line fix vs territory-model change). VERIFY NSCLC state filtering doesn't regress.
  VERIFY: Silverberg #1 in national view, all 447 visible, Load More paginates, DC selectable.

THEN (AD Established remaining to parity):
  - Top Collaborators run + Research Themes run (2 net-new; THEMES has tag-match risk - Gate 15 - therapeutic_area
    TEXT must match frontend read, trace first).
  - Backfill practice_state from institution (Option B, complementary to the territory fix) - later.

THEN (bigger workstreams):
  - AD Rising: entirely unbuilt, one blocker (rising scoring chain never ran). RECONCILE old (rising_star_ranks_v3/
    momentum) vs new (rising_composite_v1/scientific_emergence_v1) model FIRST.
  - Advisor review of AD Belief Profiles (definitive domain-truth nod, per Umbra Art V).
  - Demo re-record (after enrichment complete).
  - Merge ad-frontend-established -> foundation-rebuild to deploy (after enrichment; RLS migration already run).
  - UMBRA: begin Capability 1 (State Substrate) toward the constitution - first test = can it hold canonical vs
    historical (e.g. Belief Profile costs $15 not $60).

CLOSEOUT CHECKLIST:
  [ ] commit + push docs (TA_BUILD_DEBT, GATE_BASELINES, NEW_PLAYBOOK, AD_PARITY_CHECKLIST)
  [ ] push ad-frontend-established (feed fixes 0dcc0d1)
  [ ] save UMBRA docs locally (Governance + Implementation Doctrine)
  [ ] confirm no orphaned Code background jobs
===== END CLOSEOUT =====

### 30ez. AD RISING FRONTEND = larger than a repoint (grep-confirmed). Tier 1 now; archetype + Landscape + Home/Watchlists/Briefs are logged follow-ups.

RPC migration DONE (get_rising_composite_filtered / _count, mirrors get_established_filtered against
hcp_rising_composite_v1; career_first_pub_year_v2 swap confirmed via 76% plain-vs-v2 divergence + scorer
grep showing emergence/momentum gate on _v2). Migration is scope-row shaped, returns the real axes
(rising_composite_score, emergence_pctile, network_influence_pctile). Safe to apply — net-new names, old
rising RPC untouched for frozen NSCLC.

FRONTEND CONSUMER TRACE (the load-bearing find): the entire rising read path speaks the OLD 2x2
momentum/visibility vocabulary. Nothing reads the new columns. A field-grep (archetype|scope_rank|us_rank)
exposed the true blast radius - NOT the 4 files scoped, but ~11 surfaces across 4 tiers:
  TIER 1 (feed - do now): ScoreBreakdownV3Rising, HCPCard, api.ts rising branch (281-351), types.ts,
    hcpData.ts. Collapse 4 tiles -> 2 (Emergence / Network Influence, copy from the 30v advisor spec).
  TIER 2 (archetype = a subsystem, not a field): 5 archetype fns in HCPCard + an ARCHETYPE stat column +
    pill; ScoreBreakdownV3Rising has its own archetypeColor/ShortLabel/showBadge. New model emits NO
    archetype. DECISION LOGGED BELOW.
  TIER 3 (Landscape/Telescope - separate workstream): LandscapeQuadrantChart + api.ts feeders (3158-3389)
    read the 4 momentum/visibility fields + archetype + us_rank straight off hcp_rising_star_ranks_v3 (OLD
    table). A 2-axis model has no 4-quadrant chart - rebuild-or-remove, not a repoint. Plus
    MethodologyPage:157-195 PROSE describes the 70/30 momentum/visibility model - copy goes false on cutover.
  TIER 4 (silent-empty risk): home.ts, watchlists.ts, briefs.ts, generate-brief Edge Fn all query us_rank +
    archetype directly off hcp_rising_star_ranks_v3, bypassing the RPC. On AD-cutover they read a stale/absent
    table -> silent empties. Briefs empty would show in a demo. Repoint-or-guard pass needed; bump priority.

ARCHETYPE DECISION (not a regression - a retired premise): the old archetypes (Scientific/Network Accelerator,
Balanced Rising Star) were labels for positions in the 2x2 grid. The 30v advisor pass killed the
network-in-momentum axis AS DISHONEST. So archetype named positions in a grid whose axes no longer mean what
they claimed. Removing it is a consequence of the advisor's own logic, not a feature loss.
  - NOW (Tier 1): AD rising renders NO archetype badge (old subsystem stays live for NSCLC on the old table).
    AD leads with cohort-relative emergence_pctile + the 2-tile breakdown = more info than one quadrant label.
  - LATER (open design Q, decidable after seeing the 2-tile render): does emergence x network-influence
    warrant its OWN archetype derivation? emergence-high/network-low ("surging on science, not yet connected")
    vs emergence-low/network-high ("connected, not accelerating") is a REAL, honest distinction - arguably
    better than the old one because both axes now mean what they say. Build the honest version or none.

SEQUENCING (reconfirmed): commit resolvePrimaryTaId durability fix first (clean base - it's uncommitted in
the working tree, touches App.tsx/api.ts which Tier 1 also touches; verify Silverberg survives hard-refresh
before committing). Run NSCLC back-migration (emergence + rising_composite --ta nsclc) BEFORE repointing the
feed, else NSCLC rising goes dark (rising_composite_v1 is AD-only today). Then Tier 1. Tiers 2-4 logged.

ALSO LOGGED (Established twin): established_scoring.py:298 selects plain career_first_pub_year (corrupted col).
Established RANKS are clean (career age not in its ranking math - projection-only), but Established CARDS may
DISPLAY the corrupted start year. Same display bug we fixed for rising. Low priority, don't lose it.

---

## SESSION July 28 — congress dual-chip fix: two follow-ups logged

Context: /congress/asco-2026 showed EST + RISING chips on the same presenter (Le, Skoulidis, Goldberg,
Elamin). Fixed in display: chip + rank + band now come only from the assigned cohort per
hcps_v2.cohort_classification; null classification -> no chip, presenter lands in a
"TRACKED - NOT CURRENTLY IN A COHORT" group. Cohort assignment itself was verified exclusive
(all 122 dual-rank-table HCPs are rising_star). Two follow-ups deliberately NOT done in that pass:

**1. api.ts collaborator blocks guess cohort by precedence, not classification.**
`lib/api.ts` (~:1924 and ~:2090, the [establishedRanks, rising*] Promise.all blocks) join both rank
tables and derive `cohort_kind` by rising-first precedence without consulting cohort_classification.
No dual badge (if/else), and the precedence coincidentally matches the invariant today - but it labels
null-classification HCPs "established" whenever they merely appear in hcp_established_ranks_v3 (the
Paik case below). Fix = route through cohort_classification. NOTE: this alters displayed cohort scores
on collaborator panels, so it needs its own pass and its own review - do not fold into unrelated work.

**2. DATA gap: real Established ranks with null cohort_classification.**
18 of 47 ASCO confirmed presenters carry an hcp_established_ranks_v3 rank but NULL
hcps_v2.cohort_classification - including Paik #79, Ganti #152, Molina #185. That is upstream of any
display surface: the ranks table covers a wider pool than classification has been assigned to (or
classification lapsed for these). Founder wants to understand WHY before deciding anything.
Do NOT patch in display; the congress page now honestly shows them unchipped in the
not-currently-in-a-cohort group until this is resolved. Investigate cohort_classification writers
(scripts/classify/cohort_classification_v2.py) vs established ranks coverage.

2026-09-01: congress_confirmed_presenters was REBUILT on this date and the count changed from 47 to 51.
The 18-of-47 figures above are AS-OF their original date and have deliberately not been restated -- this
is a debt log, a record of what was found when it was found, not a claim about the current table. The
rebuild is HCP-dependent (ingest_asco_abstracts.py matches ASCO speaker names against the live NSCLC
US established + rising boards), so the presenter set drifts with every board recompute; re-derive before
reusing any ratio from this entry.

**RESOLVED July 28 (same day) - #2 was the wrong table, not a data gap.**
hcps_v2.cohort_classification is a stale denormalized column (73.6% null across the 3,178 US
Established board, last bulk-written 2026-07-24, no maintainer found). The authoritative source is
hcp_cohort_classification_v2 (written by scripts/classify/cohort_classification_v2.py; complete
coverage, zero null; per-TA career-structure taxonomy: established / rising_eligible / too_young /
community). Congress detail page repointed to it (join hcp_id + therapeutic_area_id); all 18
resolve to established; the no-chip band empties.

TAXONOMY WARNING for anyone touching this next: career structure != board membership.
Measured July 28 (NSCLC): rising board 1,588 = 965 established + 618 rising_eligible + 4 missing +
1 community; est board (US) 3,178 = 3,170 established + 8 community; all 122 board-overlap HCPs are
career-established. rising_eligible means eligible for rising evaluation, NOT on the rising board.
Display rule adopted: v2 cohort picks the rank table (established -> est rank, rising_eligible ->
rising rank), no chip otherwise. Consequence: the 4 dual-rank presenters (Le, Skoulidis, Goldberg,
Elamin) read EST, not RISING.

**FINAL RULE July 28 (supersedes the v2 display mapping above): congress chips = BOARD
MEMBERSHIP, rising first.** Founder reviewed the v2 repoint's effect (dual-board presenters
flipping to EST) and chose board membership as the chip construct: chip the board an MSL can
browse the presenter on; dual-board HCPs show RISING (the smaller, deliberate list - 209 US
members vs 3,178 EST). hcp_cohort_classification_v2 (career structure) is deliberately NOT
consulted for chips - it remains authoritative for career-structure questions only. Verified:
the ingest's us_rank IS NOT NULL lookup already equals the feed's visible-US-board membership
(us_rank populated only for the 209 board members; get_rising_star_filtered has no rank gate,
just TA + country scoping). A reported "3,065 over-included us_rank carriers" figure matched
nothing in hcp_rising_star_ranks_v3 (209 us_rank rows TOTAL, all TAs) - if that number resurfaces,
find its source table first.

Follow-up #1 above (api.ts collaborator blocks) should therefore align with the same
board-membership-rising-first rule (which its precedence already implements) - its remaining
defect is only the null-classification labeling noted above. Full inventory of stale-column
readers: see the July 28
"stale cohort_classification readers" sweep in the session report / commit message - notable:
searchHCPs community-gate post-filter (api.ts ~:2605) keys the gate on the stale column (73.6%
null -> gate mostly dormant); getHCPById deep-link path (api.ts ~:1529) drives DetailScreen
"Unclassified" banners off it; established/community/rising scoring scripts SELECT their input
population from it (board drift risk on re-run); generate-brief and generate-hcp-synthesis Edge
Functions feed it to prompts; us_institution_state_lookup.sql uses IS NULL as a "publication HCP"
proxy. Each needs its own pass; none changed yet.
