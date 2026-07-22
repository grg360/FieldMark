# WARM REINGEST TEST PLAN — NSCLC (the keystone de-risk before any cron)

**Purpose:** Prove ONCE, by hand, that a full pipeline re-run against an already-built TA (warm state)
does NOT corrupt identity, dedup, links, or ranks. Reingestion has NEVER been run. The ROADMAP validated
the sequence on COLD builds; the warm ("new data meets prior resolved state") path is designed-but-unproven.
Per ROADMAP §6, automation without verification gates is "an unattended way to corrupt the DB faster" — so
this test + its assertions are the prerequisite to scheduling anything.

**Guinea pig:** NSCLC — most mature TA, clearest validation HCPs, and FROZEN (so a controlled test disturbs
no active work). US/ASCII-name TA, so dedup fragmentation is *milder* than AD — meaning a clean NSCLC pass is
necessary-but-not-sufficient; AD (82% intl) is the harder warm case and must be tested separately before an
international TA is put on a cron.

**Golden rule (ROADMAP §4):** snapshot before anything, dry-run every write as a COUNT first, one stage at a
time, verify before proceeding, writes via terminal `run_sql.py` not the dashboard. NOTHING here runs
`inventory_openalex_authors.py --truncate` (§3 — wipes ALL TAs). Use the §3b SQL-native staged upsert only.

---

## PHASE 0 — SNAPSHOT THE ORACLE (before touching anything)

Capture NSCLC's current state as the regression baseline. Save each to a timestamped table or CSV.

**0.1 — Core counts**
```sql
-- HCP count tagged to NSCLC
SELECT count(*) FROM hcp_therapeutic_areas_v2 WHERE therapeutic_area_id = <NSCLC_TA_ID>;
-- total hcps_v2 (whole-DB guard — warm run must not inflate the universe unexpectedly)
SELECT count(*) FROM hcps_v2;
-- publication_authors_v2 link count for NSCLC HCPs
SELECT count(*) FROM publication_authors_v2 pa
JOIN hcp_therapeutic_areas_v2 ta ON ta.hcp_id = pa.hcp_id
WHERE ta.therapeutic_area_id = <NSCLC_TA_ID>;
```

**0.2 — Merged-survivor / dedup fingerprint** (the highest-value baseline)
```sql
-- every merge already recorded, with why it fired
SELECT id, survivor_hcp_id, merged_away_hcp_id, merge_reason, candidate_type, created_at
FROM <dedup_merge_log_table>            -- confirm actual name via information_schema
ORDER BY created_at;
-- count only; the warm re-run should ADD ~0 merges against already-merged identities
SELECT count(*) AS existing_merges FROM <dedup_merge_log_table>;
```
If there is no persisted merge log, snapshot the survivor set instead: the current `hcps_v2.id` set for
NSCLC + their `works_count` (from `hcp_author_metrics_v2`) — this is what a bad warm merge would alter.

**0.3 — Validation HCPs (byte-level oracle)** — snapshot each canonical NSCLC KOL's row:
`hcps_v2.id`, name, `works_count`, `total_career_pubs`, `career_first_pub_year_v2`, linked-pub count,
Established rank (US + global), and the 3-signal score (Scientific/Network/Pharma).
```sql
SELECT h.id, h.full_name, m.works_count, h.total_career_pubs, h.career_first_pub_year_v2,
       r.us_rank, r.global_rank, r.scientific_influence, r.network_influence, r.pharma_engagement
FROM hcps_v2 h
LEFT JOIN hcp_author_metrics_v2 m ON m.hcp_id = h.id
LEFT JOIN hcp_established_ranks_v3 r ON r.hcp_id = h.id
WHERE h.id IN (
  '2302d82f-c44a-498e-b0ab-6ca39a3f8964'  -- Heymach (canonical)
  -- + Jänne, Ramalingam, Spira, Xiuning Le  (resolve ids first)
);
```
Expected canonical top NSCLC Established (from live app): Riely #1, Ramalingam #2, Jänne #3, Hirsch #4 …
Heymach #7 US / #50 global, score 100 (Sci 99 / Net 100 / Pharma 95). **These must reproduce.**

**0.4 — FK integrity baseline** (dedup re-points ~39 FKs; prove none get orphaned)
```sql
-- enumerate every FK pointing at hcps_v2.id (the merger must handle ALL of them — §0c)
SELECT conrelid::regclass AS child_table, conname
FROM pg_constraint
WHERE contype='f'
  AND confrelid = 'hcps_v2'::regclass
ORDER BY 1;
-- orphan check template (run per child table after the run; baseline should be 0):
SELECT count(*) FROM <child> c
LEFT JOIN hcps_v2 h ON h.id = c.<hcp_fk_col>
WHERE c.<hcp_fk_col> IS NOT NULL AND h.id IS NULL;
```

**0.5 — Full-DB safety snapshots** (ROADMAP §3b/§4 discipline)
```sql
CREATE TABLE openalex_author_inventory_pre_warmtest_backup AS SELECT * FROM openalex_author_inventory;
-- optionally pg_dump hcps_v2 + the ~39 FK-child tables for NSCLC before executing any merge.
```

---

## PHASE 1 — STAGE-BY-STAGE WARM RE-RUN (NSCLC), with the risk rating per stage

Run the §1 canonical order. For each stage: **dry-run/COUNT first, execute, verify, then proceed.**
Risk ratings below are from reading §0c/§1/§3/§3b — they tell you where to watch hardest.

| # | Stage (script) | Warm risk | What to watch on the warm pass |
|---|---|---|---|
| 1 | `ingest_publications.py --ta nsclc` | LOW–MED | Only NEW PMIDs since the cold build should ingest. Confirm it doesn't re-insert existing pubs as new (dupe pubs → dupe authorships → phantom fragments downstream). Verify PMID de-dup on ingest. |
| 2 | `openalex_pipeline.py` | LOW | Re-enriches; recomputes `authorships`. Idempotent by nature. |
| 3 | inventory — **§3b staged SQL upsert ONLY** | LOW (proven) | `ON CONFLICT DO UPDATE`, `corpus_pub_count` over FULL footprint, **do NOT update `has_matching_hcp`/`matching_hcp_id`**. NEVER `--truncate`. This stage is warm-proven — trust but verify counts. |
| 4 | `run_step_c_create_hcps.py` | **HIGH** | Cold-designed to CREATE HCPs from clusters. On warm state, it must NOT re-create HCPs that already exist. **This is a top suspect** — if Step C isn't idempotent against existing hcps_v2, it spawns duplicate person-records for everyone, which dedup then has to clean. Dry-run `--limit 20` and inspect: does it try to create people who already exist? |
| 5 | `career_enrichment_from_clusters.py` | LOW | Recomputes from current state; safe if run in-order. |
| 6 | `ta_tagging_rebuild.py` | MED (⚠️ may be unwritten) | Confirm it EXISTS (ROADMAP flags this). Re-tagging should be idempotent (≥3 pubs/TA). Watch it doesn't drop existing tags. |
| 7 | `run_step_b_matching.py` | MED | Community-linkage only; ensure it re-links, doesn't duplicate. |
| 8 | `reconcile_step_c_duplicates_*` | **HIGH** | Merges dup HCPs Step C missed. If Step C (4) spawned warm duplicates, this is where they'd get reconciled — or where a bad merge happens. Diagnostic first, read the CSV, then apply. |
| 9 | `rebuild_publication_authors_v2.py` (Step F) | MED | **Scope to ALL NSCLC-tagged hcp_ids via `--hcp-ids-file`, NOT `--only-new-hcps`** (§1 warning: --only-new buried 34% of AD). Frozen-safe by construction. Watch link COUNT: should grow by new-pub links, not re-create existing links. |
| 9b | authorship-position derivation | LOW | Recompute first/senior author flags. Idempotent. |
| 10 | NPPES / Open Payments / Medicare aggregators | LOW–MED | Re-aggregate. Confirm `top_companies` third write-path populates (known v1 miss). |
| **10b** | **`dedup_detect.py` → `dedup_merge.py`** | **HIGHEST** | **THE keystone risk.** Detect is read-only (safe — always run it). Then STOP and read the candidate CSV: on warm NSCLC, it should propose **~zero merges against already-merged survivors**. Any proposed merge that touches an existing survivor = the warm-corruption path. `--dry-run` merge, inspect `[SURVIVOR SWAP]` logs, confirm no existing survivor is demoted. Only `--execute` if the candidate set is clean/empty. |
| 11 | career-metric re-derivation | LOW | Must run AFTER 10b (§210). Recompute. |
| 11b | `cohort_classification_v2.py` | LOW | Reclassify; idempotent. |
| 12 | scoring (rising/established/community) | LOW–MED | Recompute ranks. Rank MOVEMENT is expected (new data) — but must be *explainable*, not chaos. |
| 13 | `generate_narratives_v2.py --target-version v2` | LOW ($) | Billed (Claude API). Only re-narrate CHANGED HCPs on a real cron; for the test, optional/skip to save cost. |
| 14 | frontend — no change | — | NSCLC already visible. |

**Two stages I under-weighted before this §1 read — flagged now:**
- **Step C (4) is a bigger warm risk than dedup itself.** It *creates* HCPs. If it's not idempotent against
  existing rows, it manufactures the duplicates on every run and shifts the whole burden onto dedup. Test
  Step C's warm behavior FIRST and hardest — a dry-run that tries to create already-existing people is the
  tell. If Step C re-creates, reingestion is NOT ready regardless of how good dedup is.
- **The 191,551-wrong-HCP incident (§6) came from exactly this class of bug** run manually. A cron would do
  it at 3am. This is the concrete reason the test exists.

---

## PHASE 2 — DIFF & PASS/FAIL ASSERTIONS (the gate)

Re-run every Phase-0 query and compare. **Codify these as halt-on-failure assertions** — per §6, these
become the automation gates. The run PASSES only if ALL hold:

1. **Universe integrity:** `hcps_v2` total did not grow by anything except genuinely new people. NSCLC HCP
   count grew only by real new authors (new-paper coauthors), NOT by re-created duplicates of existing HCPs.
   *Assertion:* no existing NSCLC `hcps_v2.id` from the 0.3 snapshot disappeared or was duplicated.
2. **Dedup did not touch prior merges:** the warm `dedup_merge` added ~0 merges against already-merged
   survivors. No `[SURVIVOR SWAP]` on a previously-correct survivor. No prior merge came apart.
   *Assertion:* `merge_reason` set for existing survivors unchanged; survivor↔merged-away overlap == 0.
3. **FK integrity:** every FK child table (0.4) has ZERO orphaned rows pointing at a vanished hcp_id.
4. **Validation HCPs reproduce:** Heymach (and Jänne/Ramalingam/Spira/Le) — same `id`, same-or-explainably-
   higher `works_count`/links, rank stable (movement only from real new data, not from re-fragmentation).
   Heymach must remain ~#7 US / #50 global, score ~100. **If Heymach's identity or score breaks, STOP —
   reingestion is unsafe.**
5. **Link monotonicity:** `publication_authors_v2` NSCLC link count grew (new pubs linked) and did NOT lose
   links for pre-existing HCPs (the §1 --only-new-hcps under-linkage trap).
6. **Ranks moved explainably:** any top-N rank change traces to a real new publication/metric, not to an
   identity artifact. Spot-check the 3 biggest movers.

**If all 6 pass:** reingestion's warm path is proven on NSCLC. Proceed to codify the assertions as gates,
then (separately) test the AD warm run before any international TA goes on a schedule.

**If any fail:** you've caught the single most dangerous silent-corruption path IN A TEST, on a frozen TA,
before it touched a real user or a 3am cron. That is a win. Fix the offending stage's warm-idempotency,
re-snapshot, re-run.

---

## PHASE 3 — ONLY AFTER A CLEAN PASS: the automation prerequisites (§6)

Do NOT schedule a cron off a single clean run. Per ROADMAP §6, three things gate automation:
1. **Parameterization** — every stage takes `--ta`, reads config, nothing hardcoded. (Debt: 74 files w/
   hardcoded NSCLC; substrate scripts on Python constants — this is the streamlining work that = TA-crank +
   reingestion, one refactor.)
2. **Idempotency + resumability** — proven per-stage by this test; a failed step must be resumable, not a
   full-corpus redo.
3. **Verification-gates-as-code** — the 6 Phase-2 assertions become pipeline halts. *This is what makes a
   cron safe rather than a faster corruption engine.*

**Sequence to a cron:** manual-verified warm run (this plan) → assertions-as-gates → parameterized →
orchestrated → scheduled. The cron is the trivial LAST step onto a proven, gated pipeline — never the first.

---

## THE DIFF ARTIFACT IS ALSO THE PRODUCT

Note: the Phase-2 diff (who's new, whose rank moved, what newly linked) is not just a safety check — it IS
the "what changed this week" content for the dynamism/data loop. Design reingestion to PERSIST the delta
(snapshot/diff table), not just overwrite state. Reingestion that overwrites refreshes the numbers but throws
away the story; the story is the dynamism. Build the diff as a first-class output from the start.
