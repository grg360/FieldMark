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

---
## REVISION (post-review) — the "still-unverified" list is a BLOCKING CHECKLIST, not an appendix
An external review correctly pressured that the unverified items are LOAD-BEARING, not low-risk.
Several are the exact difference between "clean incremental" and "silently corrupted a shared table
/ created duplicate HCPs." Treat each as a gate verified BEFORE its stage runs, stage-by-stage.

### FRAMING (changes the risk calculus): THIS NSCLC RUN IS A MACHINERY TEST, not a needed refresh.
Purpose = prove the incremental cycle works on a frozen, well-understood TA (NSCLC numbers are known)
BEFORE relying on it for AD + future TAs. Consequences:
- Risk #3 (whole-TA rescore of ~80K for 33 pubs) DOWNGRADES to harmless inefficiency — over-computation
  is fine on a test; scores land ~where they were. Optimize scope later, for production cadence.
- Risks #1 and #2 UPGRADE — this run blesses the pattern for all future TAs, so Step C's new-fragment
  case and Step 4's COUNT scope being PROVEN matters more, not less.

### THREE LOAD-BEARING GATES (verify before the relevant stage; these cause SILENT corruption if wrong):
GATE-A (Step 2, openalex_pipeline): confirm it scopes to un-enriched pubs (enriched_at IS NULL), does
  NOT re-enrich all. If it re-enriches everything → not incremental, expensive, touches correct data.
GATE-B (Step 4, inventory upsert): DRY-RUN the write as a COUNT and DIFF against current inventory
  values BEFORE executing (this is §3b's own discipline line — follow it, don't just cite it). Confirm
  corpus_pub_count is computed over the author's FULL cross-TA flat footprint, NOT NSCLC-scoped. A
  scoped COUNT would CLOBBER cross-TA authors' counts (silent, irreversible-ish).
GATE-C (Step 5, Step C incremental) — THE BIGGEST GAP IN OUR PROOF: idempotency was proven on
  (i) no-new-data (run twice → 0) and (ii) genuinely-new-author creation. It was NOT tested on the
  NEW-FRAGMENT-OF-EXISTING-HCP case — a new OpenAlex author-id for a person who ALREADY has an HCP
  (the Riely/Hirsch mechanism). identity_hash backfill was DONE precisely to catch this, but the
  end-to-end routing ("new fragment → identity_hash match → link to existing HCP, do NOT create dup")
  was never exercised. BEFORE trusting Step C in the cycle, construct this test: take an existing HCP,
  un-link one shard + delete its inventory row, re-run incremental, confirm it RE-LINKS to the existing
  HCP via identity_hash (or creates+dedup-folds) rather than silently duplicating. This is the exact
  case that, if wrong, spawns duplicates dedup must clean — proving it closes the loop the whole
  backfill was for. (Note: today's cycle-test attempt §31o was ABORTED at this step because the target
  HCPs had null identity_hash — now backfilled, so the test is finally runnable.)

GATE-D (R5 sequencing, Step 3): confirm Step 3's author_pub_flat flatten reads the NEWLY-ENRICHED
  authorships from Step 2, not a cached/stale table. R5 failure mode = flatten runs before enrichment
  lands → the 33 new pubs silently absent from inventory → they never enter the cycle at all.

### VERDICT: NOT safe to run as-is — not because the sequence is wrong (it's right), but because its
safety rests on GATE-A/B/C assumptions that are still unverified, and A/B/C are the exact silent-
corruption cases. Run stage-by-stage; verify each gate immediately before its stage; use the diff as
the oracle at the end (NSCLC numbers are known → a wrong result is visible). GATE-C ideally proven as
a standalone test FIRST (it's the pattern-blessing risk).

---
## CORRECTION (discovered mid-walk, first real cycle) — ta_tagging was WRONGLY dropped; it's LOAD-BEARING.
Original sequence omitted ta_tagging (assumed pub-driven HCPs are implicitly NSCLC). WRONG. Verified mid-cycle:
Step C creates HCPs but does NOT tag TAs (ROADMAP L270). The 428 new HCPs had 0 NSCLC tags in
hcp_therapeutic_areas_v2. Step F scopes to TA-TAGGED HCPs (--hcp-ids-file from hcp_therapeutic_areas_v2) → if the
new HCPs aren't tagged, Step F silently MISSES them → they never link to their pubs → score as zero-pub phantoms.
So ta_tagging MUST run AFTER Step C, BEFORE Step F.

Also: ta_tagging is a CONCEPT CLASSIFIER (§2g) — scores each HCP's pubs' OpenAlex concepts against
curated_ta_concepts for the TA, applies a threshold. So it also DECIDES WHICH of the 428 enter the NSCLC scored
population (a person with 1 NSCLC pub + 40 cardiology pubs correctly should NOT be tagged NSCLC). Consequential, not
mechanical — directly shapes the diff population. Depends on NSCLC curated_ta_concepts existing + being mature
(NSCLC = TA #1, so it should be).

SCRIPT: scripts/classify/ta_tagging_rebuild_v2.py --ta nsclc --execute (default dry-run). Flags: --ta, --execute
ONLY — no per-HCP/new-only scoping → whole-TA re-tag (heavier but correct, script-native).

CORRECTED INCREMENTAL ORDER:
  ingest → openalex enrich → flatten → inventory upsert(GREATEST) → Step C →
  **ta_tagging_rebuild_v2 --ta nsclc --execute** → Step F(--hcp-ids-file ALL NSCLC) → 9b authorship position →
  dedup → career re-derive → cohort_classification → scoring → diff.

META-NOTE: this is the 2nd load-bearing correction found by walking (1st = inventory GREATEST drift fix §31u). The
incremental sequence is being DISCOVERED via one careful walk, not executed from a correct spec — expected, since the
ROADMAP only documented the full build. Each stage may surface a "needs X first." Verify-before-each-stage is working.

---
## FRICTION LOG — first-walk discoveries (the point of the first walk: find & fix friction so future runs are smooth)
This first careful walk is a DISCOVERY process, not just execution. The ROADMAP documented the full BUILD; the
incremental cycle is being derived by walking it once and correcting. Findings so far:

FRONT HALF — walked clean (✅ done this cycle):
  ingest(33 pubs) → openalex enrich(25 got authorships) → flatten author_pub_flat(+216, GATE-D) →
  inventory upsert(+431 new authors, GATE-B) → Step C incremental(428 new HCPs, 3 fragment-catches via identity_hash).

FRICTION FOUND + DISPOSITION:
  F1. INVENTORY DRIFT (§31u): recomputing corpus_pub_count from author_pub_flat would DROP 933 established KOLs'
      counts (flat under-represents the corpus the inventory was built from). FIX APPLIED: GREATEST() on upsert
      (never lower a count). Also flagged: a full --truncate inventory rebuild from current flat = silent KOL
      degradation → KNOWN_ISSUES.
  F2. ta_tagging WRONGLY DROPPED from sequence → it's LOAD-BEARING (Step C doesn't tag TAs; Step F scopes to
      TA-tagged HCPs; untagged new HCPs → silently unlinked → zero-pub phantoms). FIX: re-inserted at Step C→
      ta_tagging→Step F. Also it's a concept-classifier that DECIDES which new HCPs enter the scored set (shapes diff).
  F3. ta_tagging WHOLE-CORPUS SCAN (~400K pubs re-scored every cycle @ ~687/sec = 15+min, ×2 for dry+execute).
      Untenable per-cycle. DISPOSITION: scoping spec → Code (--candidate-hcp-ids-file; affected HCPs = authors of
      new pubs incl EXISTING HCPs a new pub pushes over threshold; re-aggregate their FULL pub set; both-modes
      validation required). Dry-run KILLED at ~18% (throwaway).
  F4. dedup_detect WHOLE-CORPUS SCAN. Same treatment. DISPOSITION: scoping spec → Code (--candidate-hcp-ids-file;
      CRITICAL: comparison neighborhood must include EXISTING HCPs sharing name-block, or new-vs-existing dups are
      missed; both-modes validation required).

PATTERN: the FRONT half of the chain (ingest→Step C) was already incremental-ready (config windows, enriched_at
scoping, §3b inventory, incremental Step C). The BACK half (ta_tagging, dedup, + likely career/cohort/scoring) was
built whole-TA/whole-corpus for the BUILD and needs scoping for incremental. That's the core finding of this walk.

DISPOSITION FOR THIS CYCLE: PAUSED at Step C (clean point, nothing half-written). Waiting on Code's scoped ta_tagging
+ dedup rather than burning ~30min on whole-corpus throwaway runs. Resume: scoped ta_tagging (validate both-modes) →
Step F → 9b → scoped dedup (validate) → career re-derive → cohort → score → diff. Downstream stages (career/cohort/
scoring) STILL TO CHECK for whole-corpus scans — likely need the same scoping treatment (verify when reached).

---
## BACK-HALF SCOUTED (all scripts confirmed on disk; incremental-readiness mapped)
Pre-verified while Code builds scoped ta_tagging. All 7 back-half scripts EXIST (ROADMAP inventory's "✗ PENDING" for
network_centrality + pharma_engagement is STALE — both are on disk now).

| Stage | Script | Path | Incremental-ready |
|-------|--------|------|-------------------|
| ta_tagging | ta_tagging_rebuild_v2.py | scripts/classify | ⏳ Code scoping (--candidate-hcp-ids-file) |
| Step F | rebuild_publication_authors_v2.py | scripts/classify | ✅ --hcp-ids-file (R3: ALL NSCLC, NOT --only-new) |
| 9b authorship pos | ??? UNCONFIRMED | ? | ? — the one remaining unknown; scout when at Step F |
| dedup | dedup_detect/merge.py | scripts/dedup | ✅ Code scoped (--ingestion-run-id / --candidate-hcp-ids-file) |
| career | career_enrichment_from_clusters.py | scripts/enrich | ✅ NATIVE (--hcp-ids-file, --only-changed-today, --include-null-only, --dry-run) |
| cohort | cohort_classification_v2.py | scripts/classify | ⚠️ --ta only (whole-TA — but CORRECT: consistency) |
| scoring rising | scoring_pipeline.py | scripts/score | ⚠️ --ta only (whole-TA — correct) |
| scoring established | publication_leadership → network_centrality → pharma_engagement → recompute_established_ranks_v3 | scripts/score | ⚠️ --ta (4-script sub-pipeline) |

SCORING = a 6-step sub-pipeline, splits by cohort:
  - Rising: scoring_pipeline.py --ta
  - Established: publication_leadership_scoring → network_centrality_scoring → pharma_engagement_scoring →
    recompute_established_ranks_v3 --ta --w-scientific 0.75 --w-network 0.25 --w-pharma 0.0
    (pharma weight 0.0 → pharma scorer irrelevant to rank; network 0.25 → matters; scientific 0.75 → dominant)
  - Community: Medicare/OpenPayments (SKIP this cycle)
Each established scorer reads the established set from hcp_cohort_classification_v2 WHERE cohort='established'.

KEY REFRAME: the 428 new HCPs are predominantly RISING-cohort (early-career, low pub count, just crossed threshold).
So the DIFF's most interesting content (new rising stars — advisor's #1 signal) comes from the RISING pipeline
(scoring_pipeline.py, complete + working). Established-scoring gaps matter LESS for this batch. This cycle's diff is
rising-driven.

REMAINING WHOLE-TA (acceptable, "correct not minimal"): cohort + scoring. Unlike ta_tagging/dedup (whole-corpus =
pure waste → scoped), whole-TA cohort/scoring is arguably CORRECT (scores must be internally consistent across the TA;
rescoring 428 against a stale 43K ranking would be wrong). Optimize later only if runtime hurts.

ONE REMAINING UNKNOWN: 9b authorship-position derivation script/SQL (ROADMAP: "run right after Step F", REQUIRED or
scorer first/senior signals are dead). Scout when we reach Step F.

---
## RESUME STATE (end of first-walk session) — paused mid-back-half, clean & safe
CORPUS STATE (all committed to DB, nothing half-written):
- 33 new NSCLC pubs ingested (25 with authorships, 8 too-new-for-OpenAlex deferred).
- author_pub_flat +216 rows (the new authors). inventory 253,011→253,442 (+431 new authors, GREATEST-protected).
- Step C incremental: 428 NEW HCPs (hcps_v2 282,427→282,855), 3 fragment-catches via identity_hash (GATE-C mechanism
  on real data). ingestion_run_id = 5001edfd-7085-4e97-8f04-16b813bbd32a.
- BEFORE-snapshot for the diff: 8c7244a1-adac-4e6a-b77a-f081d6e12618 (43,535 ranked NSCLC HCPs).
- TA tags NOT yet applied to the 428 (ta_tagging is the next stage, not yet executed).

TOOLING BUILT THIS SESSION (by Code, NOT committed):
- scoped dedup_detect.py (--ingestion-run-id / --candidate-hcp-ids-file; relational name-block scoping; offline
  both-modes proof passed incl new-vs-existing-KOL case).
- scoped ta_tagging_rebuild_v2.py (--candidate-hcp-ids-file; offline both-modes proof passed incl the pre-existing-
  HCP-pushed-over-threshold critical case).
- compute_affected_hcps.py (scripts/utilities): affected set = new HCPs (by run_id) UNION existing authors of batch
  pubs (via authorships JSON → hcp_openalex_authors_v2, NOT publication_authors_v2 which is empty pre-Step-F).
- affected.txt WRITTEN & VALIDATED: 496 HCPs (A=428 new + B=68 pre-existing co-authors; 213 OA author ids; group A⊆
  union; 0 dangling). batch_pubs_33.txt has the 33 pub ids.

WHERE WE STOPPED: attempted both-modes validation of scoped ta_tagging. Scoped run finished fast (good sign). FULL
whole-corpus run (the baseline) CRASHED mid-scan (~offset 213K pubs, "NativeCommandError") → no clean baseline
produced. Output is UTF-16 + heavy HTTP-log noise (run future scans with logging quieted or 2>$null on the HTTP
logger). So scoped ta_tagging is NOT YET blessed on real data (offline proof only).

RESUME NEXT SESSION (fresh — next real step is a WRITE, wants fresh eyes):
1. Investigate the full-scan crash (NativeCommandError ~offset 213K — memory? a bad pub row? rerun and watch). OR:
   skip full-corpus validation and trust Code's offline both-modes proof for this machinery-test cycle (defensible —
   it covered the critical case), running the real both-modes validation as a separate task later. DECIDE fresh.
2. Once scoped ta_tagging is trusted: python scripts/classify/ta_tagging_rebuild_v2.py --ta nsclc
   --candidate-hcp-ids-file affected.txt --execute  → tags the qualifying subset of the 496. Verify the 428's tag
   count went 0→(qualifying N).
3. Step F: export ALL NSCLC hcp_ids (SELECT hcp_id FROM hcp_therapeutic_areas_v2 WHERE therapeutic_area_id=NSCLC —
   AFTER tagging so the 428 are included) → rebuild_publication_authors_v2.py --hcp-ids-file <file> --execute [R3].
4. 9b authorship position (SCOUT the script/SQL first — still unconfirmed).
5. Scoped dedup: dedup_detect.py --candidate-hcp-ids-file affected.txt → review CSV → dedup_merge --dry-run→--execute.
   (Both-modes validate dedup here too, on post-Step-F corpus state.)
6. career_enrichment_from_clusters.py --hcp-ids-file affected.txt (or --only-changed-today) [native incremental].
7. cohort_classification_v2.py --ta nsclc --execute. 8. scoring (rising: scoring_pipeline.py --ta nsclc; established
   sub-pipeline). 9. AFTER-snapshot + reingest_diff --diff --before 8c7244a1... → THE FIRST REAL DIFF.

HOUSEKEEPING PENDING: git commit (create_hcps_v2, backfill_identity_hash, reingest_diff, migration,
compute_affected_hcps, scoped dedup+ta_tagging — NOT PostHog/vite files). KNOWN_ISSUES: inventory/flat drift (full
--truncate rebuild degrades KOL counts; use GREATEST). Window pubmed_days_back restored to 3650 ✓.

---
## THE WALK — completed stages (first real cycle, 2026-07-21). Each stage: exact command, gotcha, verify. This is the durable playbook — next cycle follows THIS.

### STAGE 5.5 — ta_tagging (scoped) ✅
CMD: `python scripts/classify/ta_tagging_rebuild_v2.py --ta nsclc --candidate-hcp-ids-file affected.txt --execute`
- affected.txt (496) from compute_affected_hcps.py (new HCPs by run_id UNION existing authors of batch pubs via
  authorships JSON→hcp_openalex_authors_v2, NOT publication_authors_v2 which is empty pre-Step-F).
- ⚠️ MODE DEFAULT: --author-position... n/a here; ta_tagging default is DRY-RUN, add --execute.
- 🚨 CRITICAL FINDING: scoped mode resolves HCP→pubs via **author_pub_flat** (Step-F-independent). FULL mode resolves
  via publication_authors_v2 (1,983,176 rows) which is EMPTY for new HCPs pre-Step-F → **full mode is BLIND to new
  HCPs pre-Step-F → full=56 is WRONG, scoped-via-flat=441 is CORRECT.** "full mode = ground-truth baseline" is INVALID
  in the pre-Step-F incremental state. Don't both-modes-validate ta_tagging against full here; trust the flat resolution.
- VERIFY: hcp_therapeutic_areas_v2 NSCLC count rises by net-new tags (79,888→80,273, +385). new HCPs tagged =
  `SELECT count(*) FROM hcp_therapeutic_areas_v2 ta JOIN hcps_v2 h ON h.id=ta.hcp_id WHERE ta.therapeutic_area_id=<TA>
  AND h.ingestion_run_id=<run>` → 385 of 428 (90%; they entered via NSCLC pubs so high tag-rate is correct; 43
  correctly untagged as too-tangential).
- ⚠️ EXPORT TRAP: Supabase UI SQL editor caps COPY at 100 rows. For any full-set file use run_sql.py or pure-SQL
  analysis, NEVER a UI-copied file (a truncated new428.txt gave a false new-vs-preexisting split; caught by an
  impossible number 347>68).

### STAGE 6 — Step F (scoped additive) ✅
CMD: generate NSCLC hcp-ids → `python scripts/classify/rebuild_publication_authors_v2.py --hcp-ids-file <file> --execute`
- Generate the hcp-ids file (AFTER tagging so new HCPs are included):
  `python scripts/utilities/run_sql.py "SELECT hcp_id FROM hcp_therapeutic_areas_v2 WHERE therapeutic_area_id='<TA_ID>'" > nsclc_all_hcp_ids.txt`
  then strip run_sql's table formatting (header/---/footer) to bare uuids:
  `Get-Content nsclc_all_hcp_ids.txt | Where-Object { $_ -match '^[0-9a-f]{8}-...uuid regex...$' } | Set-Content nsclc_all_hcp_ids_clean.txt`
- ⚠️ R3: use --hcp-ids-file with ALL TA hcp_ids, NEVER --only-new-hcps (buried 34% of AD). File format: one bare uuid/line.
- SAFE BY DESIGN: "SCOPED ADDITIVE MODE — NO wipe, NO delete, ON CONFLICT DO NOTHING." Output labels R3 failure
  "Skipped (winner not in scoped set - DROPPED, R3 risk): N" — must be 0.
- VERIFY: publication_authors_v2 rises by NET-NEW only (1,983,176→1,986,947, +3,771; 673,119 already existed, no-op).
  CRITICAL: new HCPs now linked = `SELECT count(DISTINCT pa.hcp_id) FROM publication_authors_v2 pa WHERE pa.hcp_id IN
  (SELECT id FROM hcps_v2 WHERE ingestion_run_id=<run>)` → 0→385 (matches tagged; untagged stay unlinked, correct).

### STAGE 6b/9b — authorship position ✅
CMD: `python scripts/classify/derive_authorship_position_v2.py --pub-ids-file batch_pubs_33.txt --author-position-mode skip --execute`
- ⚠️ MODE DEFAULT: --author-position-mode defaults to `label` (writes STRING) but live author_position col is INTEGER
  → default CRASHES. MUST pass `--author-position-mode skip` (writes only is_first_author/is_senior_author booleans,
  the actual scorer signal; leaves the INTEGER author_position untouched).
- SCOPE by PUB (the batch's 33 new pubs = the pubs whose publication_authors_v2 rows Step F just created). Runs AFTER
  Step F (updates rows F created), per §29m.
- VERIFY: is_first/is_senior/middle counts sane (7/7/54 for this batch). Index→role: first=array_index 0, last=high idx.

### STAGE 7 — dedup (scoped) ✅  [MUST run after Step C; MUST run BEFORE career metrics, per R1/ROADMAP 10b]
CMD detect (read-only): `python scripts/dedup/dedup_detect.py --ingestion-run-id <run>`
  → seeds on new HCPs, expands to name-block neighborhood (existing+seed) → catches new-vs-existing dups → candidate CSV.
CMD merge: review CSV → `python scripts/dedup/dedup_merge.py --dry-run` → `--execute`.
- ⚠️ MERGE TIER DEFAULT: no --tier → processes only `merge_fragment_high_confidence` (NOT the low_evidence rows, which
  stay in the CSV). To merge low-evidence: `--tier fragment_low_evidence` or `--cluster N`.
- NEVER blind-merge. REVIEW each: `shared_coauthors` in merge_reason = decisive same-person signal (high-conf).
  `no_strong_corroboration` on an EMPTY 0-pub stub = still a safe merge (stub has nothing to corroborate against;
  it's a phantom). Same-name-DIFFERENT-institution + pub_domain_overlap = the identity_hash-instability case (same
  person, multiple affiliations) — mergeable with judgment. Verify empty-stub vs distinct-namesake via a quick
  institution+pub_count query on both sides before merging low-evidence.
- VERIFY: hcps_v2 drops by #merges (282,855→282,852, −3). Dry-run shows FK re-point (publication_authors_v2,
  hcp_therapeutic_areas_v2, hcp_openalex_authors_v2) then hcps_v2_stub_delete; survivor keeps works, empty stub deleted.

### STAGE 8 — career metric re-derivation ✅  [ROADMAP step 11; AFTER dedup per R1]
CMD: `python scripts/enrich/career_enrichment_from_clusters.py --only-changed-today --target-version v2`
- ⚠️ NO --execute FLAG. Convention is INVERTED: --dry-run is opt-in, DEFAULT (no flag) WRITES. `--execute` errors out.
- ⚠️ ALWAYS pass --target-version v2 (default v1 = writes wrong tables; the recurring v2 trap).
- Scope: --only-changed-today catches new HCPs + merge survivors + touched co-authors (432 this cycle).
- WHAT IT WRITES: total_career_pubs (from OpenAlex works_count SUM) + raw career_first_pub_year (naive MIN year).
  ❗ It writes `career_first_pub_year` (raw), NOT `career_first_pub_year_v2`. The _v2 (guarded) column stays NULL here.

### FIRST_PUB_YEAR HANDLING (the key sequencing subtlety — ROADMAP steps 11 + 11b) ❗
THREE columns exist: career_first_pub_year (raw MIN, written by career_enrichment) → career_first_pub_year_v2
(GUARDED/sustained-onset) → career_age_years (= current_year − guarded). After Stage 8, only the RAW column is
populated; _v2 and career_age_years are NULL. THIS IS EXPECTED, NOT A BUG.
The sustained-onset derivation (ROADMAP step 11 "career_first_pub_year_v2 sustained-onset method") is FOLDED INTO
cohort_classification_v2.py: its `guard_first_pub_year(raw_fpy, current_year)` function (L204) IS the guard/sustained
method — treats garbage years as null, then career_age = current_year − guarded_fpy (L275-276), writes
career_first_pub_year_v2 + career_age + cohort (L322-324). So career_first_pub_year_v2 + career_age_years get
populated at STAGE 9 (cohort), NOT stage 8. Running cohort fills the nulls.
⚠️ WHY IT MATTERS: network_momentum_scoring + scientific_momentum_scoring GATE on `career_first_pub_year_v2 IS NOT NULL`
(exclude null-year HCPs). So a new HCP whose year guards-to-null DROPS OUT of momentum (rising-star) scoring. AFTER
cohort, VERIFY the 425 got sensible guarded years, not mass-nulled:
  `SELECT count(*) total, count(career_first_pub_year_v2) has_guarded, count(career_age_years) has_age,
   count(*) FILTER (WHERE career_first_pub_year_v2 IS NULL AND career_first_pub_year IS NOT NULL) guarded_to_null
   FROM hcps_v2 WHERE ingestion_run_id=<run>`. Large guarded_to_null = guard too aggressive → investigate before scoring.
Also note ROADMAP step 11 says total_career_pubs should ideally be a join-table COUNT (--ta scoped, linked pubs) vs.
the OpenAlex works_count SUM career_enrichment writes — the §0c under-linkage tension (Guttman-Yassky 764 works/8 linked).
Cohort reads whatever's in the column; for this cycle we used works_count. Flag for future: decide works_count vs linked-count.

---
## 🚨 STAGE 8/9 — THE CAREER-DERIVATION CHAIN (biggest gap found; the full dependency the incremental sequence missed)
career_age drives rising-star + established classification. It has a MULTI-STEP derivation chain that the incremental
sequence never accounted for. Found when ALL 425 new HCPs classified to community (career_first_pub_year_v2 null →
career_age null → can't qualify rising/established → community). NOT a guard bug; a missing-upstream-data bug.

THE FULL CHAIN (must run IN ORDER, all scoped to affected/new HCPs):
1. openalex_author_enrichment.py  → fetches per-OpenAlex-author counts_by_year → hcp_author_metrics_v2
   (snapshot_date, counts_by_year JSONB). ❗ THIS WAS SKIPPED. The 425 new HCPs have ZERO hcp_author_metrics_v2 rows.
   career_enrichment_from_clusters.py (which we DID run) is DIFFERENT — it writes total_career_pubs (works_count SUM)
   + raw career_first_pub_year (naive MIN), but does NOT populate hcp_author_metrics_v2 / counts_by_year.
2. sql/backfill/ad_career_first_pub_year_v2.sql  → "SUSTAINED-ONSET" method. ❗ SKIPPED, and it's AD-HARDCODED.
   Reads hcp_author_metrics_v2.counts_by_year (WHERE snapshot_date='2026-07-07' AND ta_id=<AD>), computes for each HCP
   the earliest year with ≥2 works sustained over 3 consecutive years (≥2 works in year, year+1, year+2); falls back
   COALESCE(sustained → earliest-2-paper-year → earliest-year). Writes career_first_pub_year_v2. THIS is why Shaw got
   1990→2008 (isolated 1990 paper discarded, sustained publishing began 2008). A naive raw→_v2 COPY would be WRONG
   (would put the spurious-early MIN into _v2). HARDCODED bits to parametrize: ta_id (AD 9e4139d2… → NSCLC c0065b03…),
   snapshot_date ('2026-07-07' → this cycle's author-metrics snapshot), and scope (add ingestion_run_id filter for
   incremental).
3. cohort_classification_v2.py --ta <slug> --execute  → reads career_first_pub_year_v2 (L116/566), GUARDS it
   (guard_first_pub_year: rejects fpy<FPY_GARBAGE_MIN or fpy>current_year), derives career_age = current_year − guarded,
   writes career_first_pub_year_v2 + career_age + cohort. So cohort GUARDS an already-populated _v2; it does NOT derive
   it. If _v2 is null coming in (steps 1-2 skipped), guard(null)=null → career_age null → HCP → community.

WHY THIS WAS INVISIBLE IN THE FULL BUILD: existing HCPs got hcp_author_metrics_v2 + sustained-onset _v2 populated in
the AD/NSCLC builds. Incrementally, new HCPs get neither (openalex_author_enrichment + the sustained-onset SQL aren't
in the sequence), so _v2 stays null and they all fall to community. Same "front-half incremental, back-half assumes
full-build column state" pattern as the ta_tagging author_pub_flat finding.

FIX FOR THE INCREMENTAL SEQUENCE (insert between career_enrichment and cohort):
  8.  career_enrichment_from_clusters.py --only-changed-today --target-version v2   [works_count + raw first_pub_year]
  8b. openalex_author_enrichment.py  scoped to affected/new HCPs  → hcp_author_metrics_v2.counts_by_year (billed API)
  8c. sustained-onset SQL (generalize ad_career_first_pub_year_v2.sql → param ta_id + snapshot_date + ingestion_run_id
      scope) → career_first_pub_year_v2
  9.  cohort_classification_v2.py --ta <slug> --execute  → guards _v2, derives career_age, classifies
  VERIFY after 8c: SELECT count(career_first_pub_year_v2) for new HCPs > 0 BEFORE running cohort.
  VERIFY after 9:  new HCPs distribute across rising/established/community, NOT 100% community.
TODO: generalize the sustained-onset SQL to a TA-parametrized script (it's a documented ROADMAP-§11 step but only exists
as an AD-hardcoded backfill SQL). And confirm openalex_author_enrichment.py's scoping flags for incremental use.

STATUS AT THIS POINT: cohort ran but MISCLASSIFIED all 425 → community (bad career data). Must re-run cohort AFTER
the career chain (8b/8c) is complete. Cohort's --execute already wrote the (wrong) community classifications; re-running
after the fix will correct them (it's an upsert). Scoring is BLOCKED until career_age is real.

---
## ✅ CAREER CHAIN — SOLVED end-to-end (2026-07-21). The fix, proven.
The all-425-to-community bug is FIXED. Root cause confirmed + resolved:
STEPS RUN (the missing chain, now the canonical incremental sequence):
  8b. openalex_author_enrichment.py --hcp-ids-file affected.txt   [Code ADDED --hcp-ids-file flag: intersects with
      --ta if both given, else exactly those ids. COMMIT this flag.] → 425/425 new HCPs got hcp_author_metrics_v2
      rows with counts_by_year at snapshot_date=2026-07-21. Scoped run: 494 links, 491 ok, 2.4min, cheap. VERIFY:
      count(hcp_author_metrics_v2 WHERE new HCPs AND counts_by_year NOT NULL AND snapshot=today) → 425.
  8c. sustained-onset SQL (nsclc_career_first_pub_year_v2_incremental.sql — adapted from AD original: ta_id→NSCLC,
      snapshot_date→2026-07-21, +ingestion_run_id scope). PREVIEW FIRST (validated: discards garbage early years —
      Hiroki Ito earliest=1899→sustained=1994; Scalfi 1939→1986 — COALESCE(sustained→2paper→earliest) working).
      UPDATE → 425/425 career_first_pub_year_v2 populated. ❗ SNAPSHOT_DATE in the SQL must match the enrichment
      run's printed snapshot_date or it reads 0 rows.
  9.  cohort_classification_v2.py --ta nsclc --execute (re-run) → reads the now-populated _v2, guards, derives
      career_age (425/425 has_age, range 0-47 — sensible), classifies.
RESULT (the pass/fail gate — PASSED): 425 new HCPs went from 100% community → community 290 / rising_eligible 63 /
too_young 29 (+43 untagged). 63 RISING STARS surfaced — the cycle's whole point. Existing cohort undisturbed
(established 21.1% / rising 21.4% / community 55.4% held; Heymach/Jänne/Ramalingam still established; Tacke/Sanyal
still community).
TODO (make next cycle turnkey): (1) COMMIT the --hcp-ids-file flag on openalex_author_enrichment.py. (2) Generalize
the sustained-onset SQL into a TA-parametrized script (--ta, --snapshot-date, --ingestion-run-id) — it's ROADMAP
step 11 but only existed as AD-hardcoded backfill SQL; now also have the NSCLC version saved. (3) Add 8b+8c to the
canonical sequence between career_enrichment (8) and cohort (9).

---
## 🚨 STAGE 12 (SCORING) — THE ROADMAP IS STALE; the diff points at the wrong table. STOP POINT for this walk.
The ROADMAP step 12 says rising scoring = scoring_pipeline.py → hcp_score_ranks_v2. THE FRONTEND + FEATURE_DEFINITIONS_
CURRENT.md PROVE THIS IS STALE for the live NSCLC rising leaderboard. Ground truth (frontend api.ts + FEATURE_DEFINITIONS_
CURRENT.md lines 40-50, 100-115):
  - NSCLC rising LEADERBOARD ← RPC get_rising_star_filtered → table hcp_rising_star_ranks_v3 (momentum_component,
    visibility_component, scientific/network momentum & visibility percentiles, archetype) ← script
    scripts/score/rising_star_scoring.py (a "FROZEN model"). Archetypes: Emerging Leader 1371 / Scientific Accelerator
    80 / Balanced Rising Star 71 / Network Accelerator 59. (Dark Horse already gone from the DATA — it's only stale UI copy.)
  - AD rising uses a DIFFERENT newer model: hcp_rising_composite_v1 (Emergence 75% + Network 25%) via
    rising_composite_scoring.py + emergence_scoring.py. NSCLC has 0 rows there; AD has 0 in v3. TA-conditional.
  - scoring_pipeline.py → hcp_score_ranks_v2 is a DETAIL-PAGE FALLBACK for rising/community rank, NOT the board.
    Its NSCLC rising data is 7 WEEKS STALE (computed 2026-05-29). Almquist #1 there is stale-model noise; the live
    board (Singh etc.) comes from hcp_rising_star_ranks_v3.

CONSEQUENCES (must resolve before the "what changed" diff is valid):
1. We nearly persisted scoring_pipeline.py (dark_horse fix was to THIS wrong scorer — harmless, never persisted).
   The live NSCLC rising leaderboard is rising_star_scoring.py, which we have NOT run this cycle.
2. reingest_diff.py was built to snapshot hcp_score_ranks_v2 (the BEFORE snapshot 8c7244a1 is that table). But the
   leaderboard is hcp_rising_star_ranks_v3. THE DIFF POINTS AT THE WRONG TABLE. To show "what changed" on the actual
   board, the diff must snapshot hcp_rising_star_ranks_v3 (+ hcp_established_ranks_v3 for established).
3. rising_star_scoring.py is a "FROZEN model" — OPEN QUESTION whether it's meant to be re-run per incremental cycle
   at all, or whether NSCLC rising is a frozen snapshot new HCPs don't auto-enter. Momentum needs year-windowed
   (recent-5yr vs prior-5yr) inputs (hcp_scientific_momentum_v1, hcp_network_momentum_v1) — expensive, likely periodic.
4. Aditi Singh is FRAGMENTED in the stale table: "Aditi Singh" (community) + "Aditi P. Singh" (rising #3750) = two
   HCP rows, same person. A dedup case in the rising set. (Pre-existing, not from this cycle.)

STATUS: the ingest→cohort walk is COMPLETE and correct (all 5 upstream gaps fixed). The SCORING layer is a separate,
unresolved architecture: the canonical NSCLC rising scorer (rising_star_scoring.py / hcp_rising_star_ranks_v3) differs
from the ROADMAP, is "frozen," and the diff infra points at the wrong (stale, fallback) table. This needs a focused
session: (a) confirm whether rising_star_scoring.py is re-runnable incrementally or frozen-by-design; (b) run it (+ its
momentum inputs) for the new HCPs if re-runnable; (c) REPOINT reingest_diff.py to hcp_rising_star_ranks_v3 +
hcp_established_ranks_v3; (d) re-take the BEFORE snapshot on the correct table (the current 8c7244a1 is the wrong table).
ROADMAP TODO: update step 12 — NSCLC rising is rising_star_scoring.py→hcp_rising_star_ranks_v3, NOT scoring_pipeline.py.

---
## 🔑 SCORING IS PER-TA MODEL-DISPATCHED — the automation MUST branch on the TA's rising-model profile
Critical architecture for the automated weekly reingest: there is NO single "score the TA" step. Each TA has a
RISING-STAR SCORING PROFILE determined by its therapeutic landscape, and the automation must dispatch on it.

CURRENT PROFILES (two exist today):
- MOMENTUM model (NSCLC + momentum-suitable TAs): 5-script chain →
    network_centrality_scoring (hist_2016_2020) → network_centrality_scoring (recent_2021_2025) →
    scientific_momentum_scoring → network_momentum_scoring → rising_star_scoring → hcp_rising_star_ranks_v3.
    Fits DENSE, MATURE, long-history, US-heavy fields with strong temporal signal (enough data to measure velocity).
- EMERGENCE/NETWORK composite (AD + emergence-suitable TAs): emergence_scoring → rising_composite_scoring →
    hcp_rising_composite_v1 (0.75 emergence + 0.25 network). Fits SPARSER / younger / more international / fast-moving
    fields where "who's surfacing / who's connected" beats velocity-through-a-dense-network.

WHY IT'S LANDSCAPE-DRIVEN (not arbitrary): momentum needs a rich temporal + network-density signal to be meaningful;
a sparse field makes momentum noise. So the model is chosen to FIT THE DATA. NSCLC has "more protein to chew on" →
momentum. AD is 82% international / different structure → emergence composite.

IMPLICATION FOR NEW TAs (Alzheimer's, Heart Failure, etc.): each needs a DELIBERATE rising-model choice at build time,
assessed from the landscape (network density, publication-history depth, temporal signal, geographic skew). Alzheimer's
(huge mature field) likely momentum-suitable like NSCLC — but VERIFY. A sparse/rare-disease TA → almost certainly
emergence. Do NOT default; choosing the model is part of onboarding a TA.

REQUIRED FOR AUTOMATION: add a per-TA `rising_model` config field (e.g. 'momentum' | 'emergence_composite') — extend
the existing per-TA config pattern (therapeutic_area_ingestion_config etc.). The weekly-reingest task reads it and
dispatches the correct scoring chain. Frontend already forks on it (ch2 §11: taId===AD ? composite : rising_star) —
the BACKEND automation needs the same fork, config-driven, or a new TA silently gets scored by the wrong model (or
not at all). Established scoring is shared (publication_leadership + network_centrality[10yr] + recompute_established_
ranks_v3), so the fork is specifically the RISING chain.

ALSO NOTE (scaling): the momentum chain is a FULL-TA GRAPH RECOMPUTE every cycle (centrality is whole-graph — new
edges shift every node; percentiles are cohort-relative). So "incremental reingest" is incremental at INGEST but a
FULL RESCORE at SCORING, by necessity (relative rankings are only correct if recomputed across the whole cohort).
Per-cycle scoring cost scales with GRAPH SIZE, not weekly ingest volume — and multiplies per TA. Future optimization
Q: does centrality need full recompute every cycle, or can it run on a slower cadence than ingest? (Correctness says
full; cost says maybe decouple.)

---
## ⚠️ SCORING DISPATCH IS PER-SCRIPT, NOT PER-FLAG — verified, and it's an UNGUARDED foot-gun
VERIFIED by code inspection: the rising methodology is selected by WHICH SCRIPT you run, NOT by --ta. --ta only
filters which HCPs are scored; it does NOT select the model. No script has a TA-model guard.
- rising_star_scoring.py (MOMENTUM): hardcoded INSERT INTO hcp_rising_star_ranks_v3. No atopic/composite/rising_model
  guard. Computes momentum + writes hcp_rising_star_ranks_v3 for WHATEVER --ta it's given. Default --ta nsclc.
- rising_composite_scoring.py (EMERGENCE): hardcoded INSERT INTO hcp_rising_composite_v1. --w-emergence 0.75
  --w-network 0.25. Default --ta atopic-dermatitis.
CORRECTNESS RULE: run the RIGHT SCRIPT per TA. NSCLC → rising_star_scoring.py (+momentum chain). AD →
rising_composite_scoring.py (+emergence_scoring). --ta nsclc on rising_star_scoring = correct (what we ran this cycle).
FOOT-GUN (no guardrail): rising_star_scoring.py --ta atopic-dermatitis would SILENTLY compute momentum for AD and
write hcp_rising_star_ranks_v3 (a table AD's frontend doesn't read) — no error, wrong/orphaned output. Vice versa too.
HARDENING TODO (automation era): each rising scorer should ASSERT its TA's config rising_model matches the script's
model, and REFUSE otherwise (rising_star_scoring refuses if rising_model != 'momentum'; rising_composite refuses if
!= 'emergence_composite'). This makes the per-TA dispatch (§33) enforceable instead of convention-only. Until then,
the automated weekly task MUST look up rising_model per TA and call the matching script — there is no safety net if it
calls the wrong one.

---
## 🎯 TARGET ARCHITECTURE — ONE rising-score entrypoint, --ta dispatches the methodology (Garrett's stated goal)
DESIRED END STATE: a single command where --ta selects both the TA AND (via config) its methodology:
    python scripts/score/rising_score.py --ta nsclc              -> momentum chain
    python scripts/score/rising_score.py --ta atopic-dermatitis  -> emergence composite
Correctness enforced BY CONSTRUCTION — impossible to cross-wire, because the dispatcher looks up the model. This
replaces the current convention-only, per-script, unguarded dispatch (the foot-gun above).

IMPLEMENTATION (bounded Code task; does NOT rewrite the scoring math):
- Build a THIN DISPATCHER `rising_score.py --ta <slug> [--dry-run] [--execute]` that:
  1. Reads the TA's rising_model from per-TA config (the field specced in §33: 'momentum' | 'emergence_composite').
  2. Dispatches:
     - 'momentum' -> orchestrate the 5-script chain in order: network_centrality_scoring (hist_2016_2020) →
       network_centrality_scoring (recent_2021_2025) → scientific_momentum_scoring → network_momentum_scoring →
       rising_star_scoring  (all --ta <slug>).
     - 'emergence_composite' -> orchestrate emergence_scoring → rising_composite_scoring (--ta <slug>).
  3. Passes --dry-run/--execute through. Prints which model it dispatched (visible confirmation).
- The existing 7 scripts remain UNCHANGED underneath — the dispatcher just orchestrates. Low risk, high payoff.
- BONUS (belt-and-suspenders): each underlying script also asserts its model matches the TA's config and refuses
  otherwise, so even direct calls are guarded. (The dispatcher makes wrong calls unnecessary; the assert makes them
  impossible.)
RESULT: the automated weekly reingest calls `rising_score.py --ta X` per TA — correct methodology guaranteed, no
human/automation memory required. This IS the concrete implementation of the §33 per-TA dispatch requirement.

---
## 🎯 NEXT: established_score.py dispatcher (same one-command pattern as rising_score.py)
Established needs the same single-entrypoint treatment: `established_score.py --ta <slug> [--dry-run|--execute]`.
STRUCTURALLY SIMPLER than rising: Established is (mostly) TA-model-AGNOSTIC — same 3-signal methodology across TAs
(Scientific Influence 60% + Network Influence 40% + Pharma informational 0%), so NO per-landscape model fork — just
orchestrate the fixed chain threaded by --ta. Provisional chain (MAP FROM CODE before building — retrofit notes exist):
  1. publication_leadership_scoring.py --ta <slug>  → hcp_publication_leadership_v2
     ⚠️ playbook flag: "reads established set from hcp_established_ranks_v2 — needs wiring to hcp_cohort_classification_v2"
  2. network_centrality_scoring.py --ta <slug> --window-type 10yr  → hcp_network_centrality_v2 (10yr — DIFFERENT window
     than rising's hist_2016_2020/recent_2021_2025)
  3. pharma_engagement_scoring.py --ta <slug>  → hcp_pharma_engagement_v2
     (Corrected 2026-08-31: the "playbook: PENDING retrofit" note here was stale — the script
     takes `--ta` at pharma_engagement_scoring.py:159.)
  4. recompute_established_ranks_v3.py --ta <slug> --w-scientific 0.60 --w-network 0.40 --w-pharma 0.0
     → hcp_established_ranks_v3 (THE established board; frontend reads this + detail via api.ts)
BEFORE BUILDING: map the real chain from code (confirm scripts/flags/windows/weights + resolve the wiring gaps above,
same diagnostic-first approach that surfaced the rising chain). Then Code builds the dispatcher (pure orchestrator,
fail-fast, per-script flag conventions verified — momentum-style vs --execute-style).

SHARED-CENTRALITY OPTIMIZATION: both rising (momentum: hist_2016_2020 + recent_2021_2025) and established (10yr) call
network_centrality_scoring.py — different windows. A unified `score.py --ta <slug>` running BOTH cohorts could compute
each needed centrality window ONCE and share it, instead of re-fetching the graph per cohort. Consider when building
established_score.py — possibly a single cohort-agnostic scoring dispatcher that runs rising+established for a --ta,
sharing centrality. (Centrality is the expensive step — ~30-40 min/window — so sharing matters at multi-TA scale.)

THIS CYCLE: Established impact is MINIMAL — 0 of the 425 new HCPs classified established (all rising/community/
too_young). Only the 3 dedup survivors might shift. So Established scoring is NOT needed for this cycle's diff (which
is rising-driven). Build established_score.py as the next architectural piece; it doesn't block today's payoff.
