# TA completeness — NSCLC vs colorectal-cancer, measured 2026-08-31

What a therapeutic area needs to be a complete app surface, derived by diffing the only TA built
end to end (`nsclc`, `c0065b03-…`) against the newest (`colorectal-cancer`, `a2b28e54-…`).

**Read-only.** No script was run, no migration applied, no billed job invoked, nothing committed.
Every count below is a live `count(*)` against the named table on 2026-08-31. Companion:
`docs/ta_completeness_manifest.draft.yaml`.

---

## Step 1 — the object set

Enumerated from `pg_class` / `pg_attribute`: every relation carrying `therapeutic_area_id`,
`therapeutic_area`, `therapeutic_area_slug` or `ta_slug`, **plus** every relation whose name
carries a TA token. **85 relations.** (A prior query reported 56; that number matches my LIVE
count, not the total — the difference is 29 excluded objects, all listed below.)

**Proposed classification — 56 LIVE, 11 SUPERSEDED, 18 BACKUP.** Nothing is dropped silently.

### BACKUP — 18, proposed for exclusion

| Object | Reason |
|---|---|
| `ad_stale_detour_tags_backup`, `hcps_v2_ad_july_detour_backup`, `pub_authors_v2_ad_july_detour_backup` | name carries `detour` |
| `hcp_established_ranks_v3_nsclc_contaminated_backup`, `publications_v2_ad_contaminated_backup` | name carries `contaminated` |
| `hcp_publication_leadership_v2_nsclc_presweep_backup` | name carries `presweep` |
| `hcp_cohort_classification_v2_pre_crc`, `hcp_established_ranks_v3_pre_crc`, `hcp_rising_star_ranks_v3_pre_crc` | snapshots taken before the CRC build |
| `hcp_open_payments_by_ta_backup_20260520`, `rising_ranks_fixedwin_backup_20260805` | dated `_backup` |
| `nsclc_oracle_counts_20260720`, `nsclc_oracle_counts_postcleanup_20260720`, `nsclc_oracle_hcpset_20260720`, `nsclc_oracle_merges_20260720` | dated reconciliation oracles |
| `ad_pubs_delete_list`, `hcps_v2_ad_july_delete_list` | one-off delete worklists |
| `openalex_author_inventory_pre_ad_backup` | `_backup` |

### SUPERSEDED — 11, proposed for exclusion

| Object | Superseded by |
|---|---|
| `hcp_scores`, `hcp_narratives`, `hcp_therapeutic_areas`, `publication_therapeutic_areas`, `hcp_medicare_by_ta`, `hcp_open_payments_by_ta` | the `_v2` of the same name |
| `hcp_established_ranks_v2`, `hcp_rising_star_ranks_v2`, `hcp_rising_star_ranks_deduped_v2` | `_v3` tables |
| `hcp_normalized_scores` | a view over the retired v1 scoring |
| `ad_yearly` | AD-build working table |

**Two more I propose moving to SUPERSEDED that my name-based pass classified LIVE.**
`hcp_established_snapshots` (55,633 NSCLC rows) and `hcp_rising_star_snapshots` (2,263) are
replaced by `hcp_established_board_snapshots` / `hcp_rising_board_snapshots`.
`migrations/2026_08_17_board_snapshots_v2.sql:9-11` states it: *"hcp_rising_star_snapshots
recorded the OUTPUTS of scoring (ranks and percentiles) and none of the variables the board is
GATED on."* `take_weekly_snapshot.py` writes only the `_board_` pair (`:261`, `:609`) and never
the old two. Both are counted LIVE in the totals below; **your call.**

`hcp_community_snapshots` is a third case and I propose keeping it LIVE-but-frozen:
`take_weekly_snapshot.py:709` — *"hcp_community_snapshots (160,712 rows through 2026-08-05) is
retained as the…"* — it is deliberately retained and no longer written.

---

## Step 2 — the diff

Zeros first, then the thin set. Ratio = CRC rows ÷ NSCLC rows.

### CRC = 0 — 21 LIVE objects

| Object | NSCLC rows | NSCLC HCPs | CRC |
|---|---|---|---|
| `hcp_score_ranks_v2` | 254,243 | 75,992 | 0 |
| `hcp_canonical_topic_share_v1` (view) | 234,857 | 84,505 | 0 |
| `hcp_established_board_snapshots` | 107,472 | 25,765 | 0 |
| `publication_theme_v1` | 64,155 | — | 0 |
| `hcp_established_snapshots` † | 55,633 | 25,711 | 0 |
| `reingest_snapshot_v2` | 43,535 | 43,535 | 0 |
| `hcp_community_snapshots` † | 25,920 | 6,525 | 0 |
| `hcp_scores_v2` | 25,737 | 25,737 | 0 |
| `hcp_scientific_emergence_v1` | 16,620 | 16,620 | 0 |
| `hcp_established_scores_v2` | 11,389 | 11,389 | 0 |
| `hcp_medicare_by_ta_v2` | 4,413 | 4,413 | 0 |
| `hcp_pharma_engagement_v2` | 3,460 | 3,460 | 0 |
| `clinical_trials_ta_v2` | 2,463 | — | 0 |
| `hcp_rising_star_snapshots` † | 2,263 | 1,763 | 0 |
| `hcp_leadership_evidence` | 955 | 140 | 0 |
| `ta_hcpcs_codes` | 49 | — | 0 |
| `congress_confirmed_presenters` | 47 | 47 | 0 |
| `ta_clinical_taxonomies` | 7 | — | 0 |
| `msl_belief_claim_reactions` | 1 | 1 | 0 |
| `pulse_ai_synthesis` | 1 | — | 0 |
| `ta_cohort_counts_cache` | 1 | — | 0 |

† proposed SUPERSEDED / frozen — see Step 1.

### CRC non-zero but materially thin — 8 LIVE objects

**This set matters as much as the zeros: a thin layer looks built and is not.**

| Object | NSCLC | CRC | ratio | NSCLC HCPs → CRC HCPs |
|---|---|---|---|---|
| `hcp_board_movement_v1` (view) | 118,328 | 1,193 | **0.010** | 26,771 → 1,193 |
| `hcp_scientific_positions_v1` | 19,585 | 393 | **0.020** | **568 → 15** |
| `hcp_ai_overviews` | 598 | 15 | **0.025** | 569 → 15 |
| `hcp_narratives_v2` | 4,879 | 340 | **0.070** | 4,693 → 340 |
| `hcp_open_payments_by_ta_v2` | 3,601 | 270 | **0.075** | 3,601 → 270 |
| `hcp_research_themes_v2` | 10,640 | 1,120 | **0.105** | **1,064 → 115** |
| `hcp_rising_board_snapshots` | 10,856 | 1,193 | **0.110** | 2,378 → 1,193 |
| `theme_to_canonical_v1` | 9,049 | 1,098 | **0.121** | — |

### CRC at or above parity — 15 objects, no gap

`publication_therapeutic_areas_v2` (1.67), `hcp_established_ranks_v3` (1.47), `ta_drug_keywords`
(1.38), `hcp_publication_leadership_v2` (1.42), `hcp_cohort_classification_v2` (1.24),
`hcp_therapeutic_areas_v2` (1.23), `hcp_scientific_momentum_v1` (1.23), `hcp_top_collaborators_v2`
(1.25), `hcp_community_scores_v2` (1.06), `hcp_network_momentum_v1` (1.02), `theme_canonical_v1`
(1.00), `therapeutic_area_ingestion_config` (1.00), `live_therapeutic_areas` (1.00),
`hcp_rising_star_ranks_v3` (0.94), `institution_ta_roster_v1` (0.62),
`hcp_network_centrality_v2` (0.61), `curated_ta_concepts` (0.65).

### Empty for both TAs — 8 objects

`hcp_rising_composite_v1` (AD-only by design), `msl_contributions`, `reingest_diff_v2`,
`reingest_diff_summary_v2`, and the four `mv_social_*_by_ta` matviews. **Not a CRC gap** — these
are empty for NSCLC too, so NSCLC-as-reference says nothing about them.

### No TA column at all

`community_board_nsclc_v1` and `hcp_nsclc_evidence_tier_v1` — the TA is in the *name*. Both are
lung-only by construction and are Phase 3 work in `docs/canonical/TA_NEUTRAL_DB_LAYER.md`.

---

## Step 3 — producers

Read from the scripts, not inferred from names.

### Runs inside `ta_cycle.py`

`publication_therapeutic_areas_v2`, `hcp_therapeutic_areas_v2` (stage 4, `ta_tagging_rebuild_v2.py`),
`hcp_cohort_classification_v2` (8d), `hcp_publication_leadership_v2` / `hcp_network_centrality_v2` /
`hcp_scientific_momentum_v1` / `hcp_network_momentum_v1` / `hcp_rising_star_ranks_v3` (stage 9,
`rising_score.py`), `hcp_established_board_snapshots` + `hcp_rising_board_snapshots` (stage 9.5,
`take_weekly_snapshot.py`), `hcp_narratives_v2` (stage 13).

### Runs inside `generate_cycle.py`

G1 `hcp_research_themes_v2` (`extract_research_themes.py`) · G2 `theme_canonical_v1` +
`theme_to_canonical_v1` (`bucket_themes.py`) · G3 `hcp_top_collaborators_v2` · G4
`hcp_scientific_positions_v1` (`extract_scientific_positions.py`) · G5 `hcp_ai_overviews`
(`generate_scientific_position_synthesis.py`) · G6 `hcp_open_payments_by_ta_v2`
(`open_payments_aggregator.py`) · G7 `hcp_community_scores_v2` · G8 `hcp_narratives_v2`.

### By hand — outside both cycles

| Object | Producer | Note |
|---|---|---|
| `publication_theme_v1` | `scripts/label_pub_themes.py` | **never run for CRC** — the reason `hcp_canonical_topic_share_v1` is empty, since the view reads it |
| `clinical_trials_ta_v2` | `scripts/classify/trial_ta_mapping.py` | creates its own DDL at `:143` |
| `hcp_medicare_by_ta_v2` | `scripts/aggregate/medicare_aggregator.py` | **`generate_cycle.py:610` says it: "medicare_aggregator.py has no --ta"** |
| `hcp_leadership_evidence` | `scripts/social/scrape_leadership_signals.py` | |
| `congress_confirmed_presenters` | `scripts/congress/ingest_asco_abstracts.py:94-115` | DROP + INSERT, ASCO-specific |
| `hcp_scientific_emergence_v1` | `scripts/score/emergence_scoring.py` | |
| `hcp_pharma_engagement_v2` | `scripts/score/pharma_engagement_scoring.py` | takes `--ta` (`:159`) |
| `hcp_score_ranks_v2` | `scripts/score/score_ranking.py` | no `--ta` |
| `reingest_snapshot_v2` | `scripts/score/reingest_diff.py --snapshot` | |
| `ta_cohort_counts_cache` | `scripts/generate_cycle.py:1233` | |
| `pulse_ai_synthesis` | `sql/pulse_ai_synthesis.sql` | hand-run SQL, no script |

### No producer found

- **`hcp_established_snapshots`, `hcp_rising_star_snapshots`** — no producer found. Searched
  `scripts/**/*.py` for the table names and for insert/upsert/`execute_values` near them; found
  only `sql/schema_full.sql` and the `2026_08_17_board_snapshots_v2` migration/revert pair. This
  is consistent with them being superseded rather than orphaned.
- **`hcp_scores_v2`, `hcp_established_scores_v2`** — `established_scoring.py:646` writes
  `hcp_established_scores_v2`, but that script is dead: nothing under `scripts/` invokes it and
  the only reference is a comment in `export_telescope_data.py`. Searched `scripts/**/*.py`,
  `sql/`, `migrations/`. `hcp_scores_v2` has **no writer found** — `rerun_ranks.py:9` reads it,
  `dedup_merge.py:542` re-points FKs on merge, neither creates rows.
- **`hcp_board_movement_v1`** — a view; not written directly. Not searched for a producer.
- **`msl_belief_claim_reactions`, `msl_contributions`** — user-generated, written by the app.
  No pipeline producer, correctly.

---

## Step 4 — classification of the CRC gaps

**AUTOMATABLE — 8.** A script exists, takes a TA, no human judgment, not billed.
`publication_theme_v1` · `clinical_trials_ta_v2` · `hcp_pharma_engagement_v2` ·
`hcp_scientific_emergence_v1` · `reingest_snapshot_v2` · `ta_cohort_counts_cache` ·
`hcp_board_movement_v1` (view, follows its inputs) · `hcp_canonical_topic_share_v1` (view,
follows `publication_theme_v1`).

**BILLED — 4.** Automatable but costs money per run; must require an explicit flag.
`hcp_scientific_positions_v1` (G4) · `hcp_ai_overviews` (G5) · `hcp_research_themes_v2` (G1) ·
`hcp_narratives_v2` (G8). All four are the thin set, not the zero set — they have run for CRC,
partially.

**FOUNDER-GATED — 2.** `ta_hcpcs_codes` (49 NSCLC rows, 0 CRC) and `ta_clinical_taxonomies`
(7 → 0). Both require clinical curation. `ta_drug_keywords` is the same class and is **already
done** for CRC (29 rows vs NSCLC's 21) — proof the pattern works.

**UNKNOWN — 7.** Could not determine; not guessed.
`hcp_score_ranks_v2` (producer `score_ranking.py` has no `--ta`; unclear whether the table is
still read) · `hcp_scores_v2` (no writer found) · `hcp_established_scores_v2` (writer is dead) ·
`hcp_medicare_by_ta_v2` (producer exists, has no `--ta` — mechanically blocked) ·
`hcp_leadership_evidence` · `congress_confirmed_presenters` (ASCO-shaped; unclear whether CRC
needs its own congress ingest) · `pulse_ai_synthesis` (hand-run SQL).

**NOT A GAP — 3.** `hcp_established_snapshots`, `hcp_rising_star_snapshots` (superseded),
`hcp_community_snapshots` (deliberately frozen).

---

## What this says about "complete"

Of 56 LIVE TA-scoped objects, CRC is at parity on 17, thin on 8, and empty on 21 — but only
**14 of those 21 are real gaps** once superseded and frozen objects come out.

The critical path is short and specific:

1. **`label_pub_themes.py` for CRC.** One unbilled script. It unblocks `publication_theme_v1`
   *and* `hcp_canonical_topic_share_v1`, which is the ledger drawer's PRACTICE layer — currently
   showing its named absence on every CRC row.
2. **The four billed G-stages re-run to completion.** They ran partially: positions reached 15 of
   CRC's HCPs against NSCLC's 568. Thin, not absent.
3. **`medicare_aggregator.py` needs a `--ta` flag.** The only gap that is mechanically blocked
   rather than merely unrun, and the codebase already knows: `generate_cycle.py:610`.
4. **Two founder-gated curations**, `ta_hcpcs_codes` and `ta_clinical_taxonomies`. Nothing can
   automate these and nothing downstream of them is honest until they exist.

---

# Amendment — reconciliation before ratification, 2026-08-31

Three questions put to the draft above. Read-only: no producer was run, no billed job invoked,
nothing committed. DB claims come from a `set_session(readonly=True)` connection. Searches that
returned nothing are written down as returning nothing.

The manifest's structure is unchanged. Where an answer implies a manifest change, it is stated
as a proposal at the end of its section.

---

## A1 — Arithmetic

### A1.1 The two missing artifacts

17 parity + 8 thin + 21 empty + 8 empty-both = **54**. The remaining two are the pair under
**"No TA column at all"**, which is a section of the diff but not a bucket of it:

| Object | Kind | Status |
|---|---|---|
| `community_board_nsclc_v1` | view (`pg_class.relkind='v'`, verified) | LIVE, unclassifiable by this method |
| `hcp_nsclc_evidence_tier_v1` | view (`relkind='v'`, verified) | LIVE, unclassifiable by this method |

They carry no `therapeutic_area_id`, `therapeutic_area`, `therapeutic_area_slug` or `ta_slug`
column, so there is no predicate to count CRC rows with. They entered the 85-relation set on the
name rule alone. Both are lung-only by construction and are Phase 3 work in
`docs/canonical/TA_NEUTRAL_DB_LAYER.md`. **Their status is not "no gap" — it is "the diff cannot
express them."** That is a third outcome and the draft has no column for it.

**Two counting errors in the same section, for the record.** The header "CRC at or above parity —
15 objects" undercounts its own list, which names **17**; Step 4's "at parity on 17" is the
correct figure and the totals depend on it. And three of the 17 sit *below* 1.0 —
`institution_ta_roster_v1` (0.62), `hcp_network_centrality_v2` (0.61), `curated_ta_concepts`
(0.65) — so "at or above parity" is false for them. They are "no gap" by judgment, not by ratio.
Rename the bucket **NO GAP** and the arithmetic stops depending on a claim that isn't true.

### A1.2 The 14 LIVE artifacts with no manifest entry

56 LIVE produced **42** manifest entries (`grep -c "^  - name:"`). 56 − 42 = **14**, accounted
for individually below. 42 + 14 = 56; the arithmetic closes exactly.

**There was no folding rule, and none can be claimed retroactively.** Three views hold their own
entries — `hcp_canonical_topic_share_v1`, `hcp_board_movement_v1`, `institution_ta_roster_v1` —
so "a view that follows its base table is folded into that entry" was demonstrably not the rule
in force. Exactly one true fold exists in the omitted set (`live_therapeutic_areas` over
`therapeutic_area_ingestion_config`, confirmed through `pg_depend`/`pg_rewrite`), and it was
never stated as one.

| # | Object | Bucket | Why it has no entry | Verdict |
|---|---|---|---|---|
| 1 | `msl_belief_claim_reactions` | empty (1 NSCLC row) | Step 3 states it: user-generated, no pipeline producer. `generate_cycle.py:1264` — *"the system is `msl_belief_claim_reactions`, filled by MSLs in-app."* | Reason is stated; **entry still missing.** Add it with `classification: user_generated` so the decision is recorded rather than inferred. |
| 2 | `curated_ta_concepts` | parity (nsclc 37 / crc 24) | **No reason stated anywhere.** | **Belongs in the manifest.** See below — the most consequential of the 14. |
| 3 | `therapeutic_area_ingestion_config` | parity (1 row per TA × 4) | **No reason stated.** | Belongs in. It is the TA registry row itself. |
| 4 | `live_therapeutic_areas` | parity (3 rows) | **No reason stated.** A view over #3, filtered to `is_visible_in_ui`. | Belongs in — or is the one legitimate fold, said out loud. |
| 5–12 | the eight empty-for-both | empty-both | Trailing YAML comment only, no entries | See **A3**. Five of the eight are not empty. |
| 13–14 | `community_board_nsclc_v1`, `hcp_nsclc_evidence_tier_v1` | no TA column | Trailing YAML comment only | See A1.1. |

**On `curated_ta_concepts` — this omission is load-bearing.** It is a founder-curated OpenAlex
concept list, the same class as `ta_drug_keywords`, which *does* have an entry. It is a hard
precondition for the corpus stage, not an optional input:

- `scripts/classify/ta_tagging_rebuild_v2.py:923` — `raise RuntimeError("curated_ta_concepts is empty - cannot proceed")`
- read at `ta_tagging_rebuild_v2.py:422` (TA-scoped) and `:430` (all TAs)
- `scripts/generate_cycle.py:458` cites the same guard by name
- also read by `scoring_pipeline.py:376` and `established_scoring.py:140`

A manifest that measures `publication_ta_membership` but omits the curation that stage 4 refuses
to run without cannot tell you why a new TA's corpus stage failed. It should be
`classification: founder_gated`, `depends_on: []`, and a dependency of `publication_ta_membership`.

---

## A2 — `hcp_scores_v2`: who writes it

### A2.1 The producer is found: `scripts/score/scoring_pipeline.py`

The draft's "no writer found" is **wrong**, and the reason it was wrong is worth keeping:

```
scoring_pipeline.py:1153   scores_table = get_table_name("hcp_scores", target_version)
scoring_pipeline.py:55-58  def get_table_name(base_name, target_version):
                               if target_version == "v2": return f"{base_name}_v2"
scoring_pipeline.py:1201   response = supabase.table(scores_table).upsert(...)
```

**The literal string `hcp_scores_v2` never appears at the write site — the name is constructed at
runtime.** The only literal occurrence in that file is a comment at `:894`. Any search shaped as
"the table name near an insert" returns nothing, which is exactly what happened. This is a search
method failure, not an absent producer, and it will recur: `get_table_name` is the file's
convention.

Corroborated independently of the code:
- `docs/TA_BUILD_DEBT.md:798` — *"normalized_score: produced by scoring_pipeline.py per TA -> writes hcp_scores_v2"*
- `docs/Umbra/SCRIPT_CATALOG - 28May26.md:125` — *"The Rising Star scoring engine… Writes to hcp_scores_v2."*

### A2.2 The widened search, with the empty results written down

| Search | Result |
|---|---|
| `pg_proc` bodies, all non-system schemas, `prokind in ('f','p')`, matching `hcp_scores_v2` | **0 rows — empty** |
| Same, restricted to `INSERT INTO / UPDATE / DELETE FROM / TRUNCATE` against it | **0 rows — empty** |
| `pg_trigger`, non-internal, on the table | **0 rows — empty** |
| `*.sql` repo-wide | DDL only: `sql/schema_full.sql:7465` (CREATE), `:11326` (PK), `:13534` (index), `:15516`/`:15524` (FKs), `:16907`/`:16913` (RLS), `:20086-88` (grants); `sql/rebuild/phase1_schema.sql:116`, `phase1_rls_policies.sql:20`, `phase1_addendum_4_schema_reconciliation.sql:45` (ALTER TABLE adding `congress_score`, `msl_signal_score`). **No DML anywhere.** |
| `migrations/` | no writer |

So: nothing in the database writes it. One Python script does, by a constructed name.

### A2.3 Newest row, and what that says

`max(scored_at)` = **2026-05-29** — 94 days stale as of today.

| TA | rows | scored_at |
|---|---|---|
| hepatology | 53,769 | 2026-05-29 |
| nsclc | 25,737 | 2026-05-29 |
| rare-disease | 1 | 2026-05-29 |

**No `atopic-dermatitis` rows and no `colorectal-cancer` rows.** The table predates both of the
last two TA builds. The producer works and takes a TA; it simply has not been run since May.
CRC's zero here is the same zero AD has, and AD shipped anyway.

### A2.4 What reads it, transitively

- **Database:** exactly one dependent relation via `pg_depend`/`pg_rewrite` — the view
  `hcp_rising_star_ranks_v2` (234,725 rows), itself on this report's **SUPERSEDED** list.
  Nothing else.
- **Python:** `rerun_ranks.py:14` reads it to recompute ranks; `dedup_merge.py:542` re-points
  `hcp_id` on a merge. Neither creates rows.
- **Frontend:** `frontend/src/lib/api.ts:1655`, inside `getHCPDetail` (declared `:1594`).
  **`getHCPDetail` is exported and called nowhere.** A repo-wide search excluding `node_modules`
  finds only its own definition plus historical mentions in `Handovers/` and `docs/`. The live
  route `/hcp/:id` (`App.tsx:914`) renders `ProfileDispatch`; the detail-screen era it belonged to
  is gone.

**No live surface reads `hcp_scores_v2`.** Its two surviving read paths are a superseded view and
dead frontend code. Note that `docs/DATA_COMPLETENESS_AUDIT.md:15-16` still lists `getHCPDetail`
as **OPEN · VISIBLE-WRONG** on live AD detail pages — that audit is stale on this point; the
function is no longer reachable.

### A2.5 `hcp_established_scores_v2` — the script is **not dead**

The draft called `established_scoring.py` dead on the evidence that nothing under `scripts/`
invokes it. That evidence is true and incomplete. It is a **documented manual step**:

- `TA_EXPANSION_ROADMAP.md:117` — *"12. **Run established_scoring.py --execute** for new TA. (~5 min runtime)"*
- `TA_EXPANSION_ROADMAP.md:118` — *"13. **Run scoring_pipeline.py --target-version v2** for new TA. (25 min runtime)"* — the same script from A2.1, also a roadmap step
- `ATOPIC_DERMATITIS_BUILD.md:95` — *"Established scoring for AD | ⏳ Pending | Uses existing `established_scoring.py --ta` flag"* — planned, tracked, not done
- `KNOWN_ISSUES.md:28`, `:292` discuss its live behaviour
- `RESTRUCTURE_SCRIPTS.ps1:158-159` keeps both in the maintained set

Neither cycle orchestrator calls it because **it is a roadmap step, not a cycle stage.** The
accurate description is *alive, `--ta`-capable, run by hand, and skipped for both AD and CRC.*

Write site is literal, so the original grep found it correctly:
`established_scoring.py:646` — `client.table("hcp_established_scores_v2").upsert(batch, on_conflict="hcp_id,therapeutic_area_id")`.

`max(scored_at)` = **2026-05-27**. nsclc 11,389 / hepatology 11,389. No AD, no CRC.

Readers: one dependent view, `hcp_established_ranks_v2` (44,724 rows, **SUPERSEDED**);
`dedup_merge.py:543` FK repoint. `pg_proc`: **0 — empty**. `pg_trigger`: **0 — empty**.
`docs/DATA_COMPLETENESS_AUDIT.md:68` independently states *"0 remaining `hcp_established_scores_v2`
readers"* after the v3 repoint. **No live reader.**

### A2.6 The same trace corrects `hcp_score_ranks_v2`

Both halves of the draft's UNKNOWN entry need amending.

**It has a `--ta`-scoped producer.** `score_ranking.py` is not a standalone script —
`compute_and_write_ranks()` (defined `:116`, upsert `:220`) is imported and called by
`scoring_pipeline.py:51`/`:1444` and `established_scoring.py:29`/`:789`, both of which take
`--ta`. Ranks are written as a side effect of per-TA scoring and inherit its scoping.
Classification should move **unknown → automatable**.

**It is read, by a live pipeline.** `reingest_diff.py:19-28` sources cohort, rank and score from
`hcp_score_ranks_v2` to build `reingest_snapshot_v2`. Its frontend read (`api.ts:1716`) is inside
the same dead `getHCPDetail`, but the pipeline read is real.

**Consequence for the manifest:** `reingest_snapshot`'s `depends_on: [established_board,
rising_board]` is wrong. It depends on `score_ranks_legacy`. CRC cannot get a reingest snapshot
until `scoring_pipeline.py` is run for CRC — which is the same unblock as A2.3, so two of the
draft's UNKNOWNs collapse into one action.

---

## A3 — The eight empty for both

**The category is not homogeneous, and five of the eight are not empty.** Total row counts, taken
today:

| Object | Total rows | Producer exists? | Anything read it? |
|---|---|---|---|
| `hcp_rising_composite_v1` | **11,125** (all AD) | **yes, and it runs** | **yes — many, live** |
| `msl_contributions` | 0 | no | no |
| `reingest_diff_v2` | 0 | yes, never invoked in diff mode | no |
| `reingest_diff_summary_v2` | 0 | yes, never invoked in diff mode | no |
| `mv_social_hot_topics_by_ta` | **126** | **yes — refreshed today** | readers exist but are dead code |
| `mv_social_share_of_voice_by_ta` | **2,178** | **yes — refreshed today** | readers exist but are dead code |
| `mv_social_trending_topics_by_ta` | **161** | **yes — refreshed today** | readers exist but are dead code |
| `mv_social_voice_emergence_by_ta` | **699** | **yes — refreshed today** | readers exist but are dead code |

### 1. `hcp_rising_composite_v1` — empty for CRC *by configuration*, and correctly so

11,125 rows, every one `atopic-dermatitis`, `computed_at` 2026-07-08 → 2026-08-19.

**Producer** `scripts/score/rising_composite_scoring.py` (`:221` DELETE, `:231` INSERT), invoked
by `rising_score.py:111` inside `ta_cycle` stage 9 — but only on one branch.

**Readers, live and numerous:** RPCs `get_rising_composite_filtered(_count)` and
`get_community_directory_filtered(_count)`; the view `institution_ta_roster_v1` (which *is* a
manifest entry, ratio 0.62); `api.ts:1278`, `:1920`, `:2010`, `:2061`, `:3916`, `:3968`;
`institutionRegistry.ts:223`; `home.ts:1308`; `generate_narratives_v2.py:552`/`:727`/`:1607`;
`export_telescope_data.py:193`/`:221`/`:289`; `extract_research_themes.py:103`;
`capture_percentiles.py:50`.

The draft's "AD-only by design" is right, but the design is written down and worth quoting —
`rising_score.py:45-49`:

```python
RISING_MODEL: Dict[str, str] = {
    "nsclc": "momentum",
    "colorectal-cancer": "momentum",
    "atopic-dermatitis": "emergence_composite",
}
```

CRC is a **momentum** TA. `EMERGENCE_STEPS` (`:109-112`) runs only for `emergence_composite`.
**This is the one artifact of the eight whose emptiness is provably correct rather than merely
unexplained.**

### 2. `msl_contributions` — no producer, no reader, 0 rows

Only writer is the DB function `merge_hcp_pair`, which re-points `hcp_id` on a dedup merge and
creates nothing. No reader in `frontend/src`, none in `scripts/`. It carries a
`therapeutic_area_slug` column, so it entered the object set by column rather than by name. An
empty table nothing writes and nothing reads.

### 3–4. `reingest_diff_v2` / `reingest_diff_summary_v2` — producer exists, diff arm never run

`reingest_diff.py:67` `DIFF_TABLE`, `:68` `SUMMARY_TABLE`; takes `--ta` (`:616`) and `--diff`
(`:619`). The **`--snapshot` arm has run** — `reingest_snapshot_v2` holds 43,535 NSCLC rows — the
**`--diff` arm has not, for any TA.** The intended consumer is named at `reingest_diff.py:6`
(*"watchlists - filter reingest_diff_v2 by hcp_id"*) but no code does it. No frontend reference.
Unbuilt for everyone, so not a CRC gap and not something NSCLC could have revealed.

### 5–8. The four `mv_social_*_by_ta` — **the draft's most misleading line**

They are not empty. They were **refreshed today, 2026-08-31.** They are keyed on a *different TA
vocabulary*:

| Matview | `oncology` | `hepatology` | NULL slug | last refresh |
|---|---|---|---|---|
| `mv_social_hot_topics_by_ta` | 122 | 4 | — | 2026-08-31 |
| `mv_social_share_of_voice_by_ta` | 1,798 | 380 | — | 2026-08-31 |
| `mv_social_trending_topics_by_ta` | 28 | — | 133 | 2026-08-31 |
| `mv_social_voice_emergence_by_ta` | 661 | 38 | — | 2026-08-31 |

There is no `nsclc` row and no `colorectal-cancer` row, **and there never will be.** The social
layer aggregates at *specialty* grain; NSCLC and CRC coverage lives inside `oncology`.
`SocialPage.tsx:9` says so — the corpus covers *"oncology and hepatology
(`social_posts_v2.therapeutic_areas`)"*.

**Producer:** the DB function `refresh_social_analytics()` refreshes all four; called from
`scripts/social/social_update.py:196`.

**Readers:** `api.ts:3085`, `:3164`, `:3172`, `:3178`, `:3392` — in `getRisingVoices` (`:3073`),
`getSocialAnalytics` (`:3152`), `getSocialCandidates` (`:3379`). Each maps a UI TA name through a
hardcoded three-entry table:

```ts
const slugMap = { Oncology: "oncology", Hepatology: "hepatology", "Rare Disease": "rare-disease" };
const mvSlug = slugMap[taSlug] ?? taSlug.toLowerCase();
```

A TA-scoped caller passing `"NSCLC"` or `"Colorectal Cancer"` falls through to `.toLowerCase()`
and matches zero rows — silently, with no error.

**But all three functions are exported and called nowhere** (repo-wide, `node_modules` excluded).
The shipped social surface reads the base tables directly: `SocialPage.tsx`,
`socialLatest.ts:32-45`, `socialVoice.ts:63-75`, `CongressDetailPage.tsx:303` — all
`social_posts_v2` / `social_users_v2`, never the matviews.

**Verdict: a live producer refreshing four matviews daily underneath readers that no longer
exist.** That is the inverse of the failure the question anticipated.

### Direct answer to the question as posed

> *An artifact empty for both TAs with a live reader is a gap the NSCLC diff cannot see.*

Of the eight, **exactly one has live readers — `hcp_rising_composite_v1` — and it is not a gap**,
because CRC is a momentum TA by configuration. The other seven have no live reader at all.
**The feared blind spot contains no CRC gap.** What it contains is three artifacts with producers
and no consumers (the `reingest_diff` pair, the four matviews) and one with neither
(`msl_contributions`).

---

## A4 — The failure mode the method actually has

It is the mirror image of the one A3 was written to catch, and it is already in the draft as a
gap.

**`hcp_scientific_emergence_v1` is not a CRC gap.** Its producer, `emergence_scoring.py`, is
`EMERGENCE_STEPS[0]` in `rising_score.py:109-112` — it runs *only* on the `emergence_composite`
branch. CRC is `momentum` (`RISING_MODEL`, quoted above). CRC's zero is correct by configuration,
exactly like `hcp_rising_composite_v1`.

Why it read as a gap:

| TA | rows | computed_at |
|---|---|---|
| nsclc | 16,620 | 2026-08-19 |
| atopic-dermatitis | 3,052 | 2026-07-08 → 2026-08-19 |

**NSCLC is a momentum TA and has 16,620 emergence rows.** Someone ran `emergence_scoring.py` for
NSCLC out of band on 2026-08-19 — and only the first of the two emergence steps, since
`hcp_rising_composite_v1` holds no NSCLC rows at all.

So the reference TA carries an artifact its own configured model does not produce, and the diff
read that surplus as a CRC deficit. **NSCLC-as-reference is not a clean baseline; it is a TA plus
its experiments.** Any artifact whose production is branch-conditional must be checked against the
branch config before its NSCLC/CRC delta means anything.

`hcp_scientific_emergence_v1` should move out of **AUTOMATABLE — 8** and into a new
**NOT A GAP — configuration** class alongside `hcp_rising_composite_v1`. That takes the draft's
AUTOMATABLE set from 8 to 7 and its "14 real gaps" to 13.

---

## A5 — Proposed manifest changes, none applied

Structure untouched, as instructed. For the ratification decision:

1. **Add 4 entries.** `curated_ta_concepts` (`founder_gated`; a dependency of
   `publication_ta_membership`), `therapeutic_area_ingestion_config`, `live_therapeutic_areas`
   (or state the fold), `msl_belief_claim_reactions` (`user_generated`).
2. **Add the 8 empty-for-both as entries**, not a trailing comment — five of them have producers
   and one has live readers, which a comment cannot record.
3. **`hcp_scores_legacy`:** `producer: null` → `scripts/score/scoring_pipeline.py`,
   flags `["--ta <slug>", "--target-version v2"]`; `classification: unknown` → `automatable`;
   note that the write site constructs the table name via `get_table_name`.
4. **`established_scores_legacy`:** drop "producer is DEAD"; record it as a manual roadmap step
   (`TA_EXPANSION_ROADMAP.md:117`), `runs_in: by_hand`.
5. **`score_ranks_legacy`:** `unknown` → `automatable`; producer is
   `score_ranking.compute_and_write_ranks()` called from the two `--ta` scoring scripts.
6. **`reingest_snapshot`:** `depends_on` → `[score_ranks_legacy]`.
7. **`scientific_emergence`:** `automatable` → not-a-gap-by-configuration; cite
   `rising_score.py:45-49`.
8. **Add a `not_applicable` classification** for branch-conditional artifacts, and a status
   distinct from "no gap" for the two name-carrying views the diff cannot express.
9. **Record the vocabulary mismatch** on the four matviews — `ta_slug` is specialty-grain
   (`oncology`), not TA-grain, so a `:ta_slug` bind will read 0 forever. A `coverage_query` that
   can only ever return 0 is not a coverage query.

**One structural caution.** Every `coverage_query` binds `:ta_id` or `:ta_slug`. For the four
matviews that bind is unsatisfiable by construction, and for `hcp_rising_composite_v1` and
`hcp_scientific_emergence_v1` a 0 is the correct answer for a momentum TA. A manifest that reports
those as gaps on every future run will train its reader to ignore it.
