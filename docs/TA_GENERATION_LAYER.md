# The TA Generation Layer — what `reingest_cycle.py` does NOT produce

**Written:** 2026-08-24, from a live audit of the repo and database while standing up Colorectal Cancer.
**Companions:** `TA_BUILD_GUIDE.md` (runbook), `CRC_VALIDATION_ANCHORS.md` (acceptance test).

---

## The finding

**A completed reingest cycle produces a corpus, identities, and ONE board.**

Roughly a dozen further scripts produce everything else a demo shows — scientific positions,
research themes, collaborators, open-payments rollups, congress presenters, NIH grants, DOL
matches, web signals, and the Established and Community boards.

**None of them is orchestrated.** Most need a `--ta` flag added or a hardcoded view generalised
before they can run for a new TA at all, and **five are billed** (Anthropic on positions,
synthesis, theme extraction and bucketing; Tavily + Anthropic on web signals).

Stage 13's narratives are the only generation step inside the cycle, and they are gated on a
board that three of the missing scripts are responsible for producing.

---

## The thirteen surfaces

| Surface | Script | `--ta` | Billed | In cycle |
|---|---|---|---|---|
| `hcp_scientific_positions_v1` | `narrative/extract_scientific_positions.py` | yes | **Anthropic** (sonnet-4-6) | **no** |
| ↳ synthesis second pass | `narrative/generate_scientific_position_synthesis.py` | yes | **Anthropic** (sonnet-4-6) | **no** |
| belief claims | *no populating script* | — | — | n/a |
| `hcp_top_collaborators_v2` | `aggregate/compute_top_collaborators.py` | yes | no | **no** |
| `hcp_web_signals_v1` | `social/extract_web_signals.py` | **no** | **Tavily + Anthropic** | **no** |
| `hcp_research_themes_v2` | `classify/extract_research_themes.py` → `classify/bucket_themes.py` | yes | **Anthropic** (both) | **no** |
| `congress_confirmed_presenters` | `congress/ingest_asco_abstracts.py` | **no** | no | **no** |
| `nih_grants` / `nih_grant_investigators` | `ingest/ingest_nih_grants.py` → `enrich/match_nih_investigators.py` | **no** | no | **no** |
| `dol_matches_v2` / social capture | `social/dol_matching.py`, `social/scheduled_capture.py` | **no** | no | **no** |
| `hcp_open_payments_summary` / `_by_ta` / `_top_companies` | `aggregate/open_payments_aggregator.py` | yes | no | **no** |
| `hcp_nsclc_evidence_tier_v1` | **VIEW** — not script-populated | — | — | n/a |
| `community_board_nsclc_v1` | **VIEW** — not script-populated | — | — | n/a |
| `hcp_canonical_topic_share_v1` | **VIEW** — TA-generic, no hardcoding | — | — | n/a |
| `institution_ta_roster_v1` | **VIEW** — TA-generic, no hardcoding | — | — | n/a |

Two notes on the table:

**Scientific positions is a two-pass surface.** `extract_scientific_positions.py` extracts the
positions; `generate_scientific_position_synthesis.py` builds the synthesis on top of them. Both
are billed, both take `--ta`, neither is orchestrated. Running only the first leaves the surface
half-built.

**Belief claims are not generated.** `hcp_belief_claims` does not exist in the database. The belief
system is `msl_belief_claim_reactions`, populated by MSLs in-app. There is nothing to run for a new
TA. (See also the open question in `brief-belief-rail-mislabel`: the brief rail currently reads
research themes, not belief claims.)

---

## Hardcoded to `nsclc`

Everything in this section must be generalised before CRC can use the surface.

### Views — name *and* definition

Checked all 20 views in the `public` schema. Exactly two are hardcoded:

| View | What is hardcoded |
|---|---|
| `community_board_nsclc_v1` | the NSCLC **UUID** literal (`c0065b03-…`) in the definition, plus `nsclc` in the name |
| `hcp_nsclc_evidence_tier_v1` | the `'nsclc'` **slug literal** in the definition, plus `nsclc` in the name |

`hcp_canonical_topic_share_v1` and `institution_ta_roster_v1` were checked and are **clean** —
TA-generic definitions, no literals.

**`community_board_nsclc_v1` has a script consumer.** `social/extract_web_signals.py:243` selects
`FROM community_board_nsclc_v1` directly, so web signals are structurally NSCLC-only regardless of
any flag added to that script. The view has to be generalised first.

### Scripts

- **`congress/ingest_asco_abstracts.py:62` and `:68`** — an `NSCLC` constant is bound into both
  roster queries (`WHERE r.therapeutic_area_id=%s`). No `--ta` flag.
- **`assets/build_asset_matches.py`** — not hardcoded internally, but the orchestrator gates it:
  `ASSET_MATCHES_TA = "nsclc"` in `reingest_cycle.py`, and stage 10 renders
  `[SKIPPED: NSCLC-only, ta=<slug>]` for anything else. Asset matching is unavailable to CRC by
  construction.

### Config files

- **`config/congresses.json`** — `ta_relevance` is keyed `nsclc` only, on all 15 congresses
  (7 high / 3 moderate / 5 low). No other TA appears.
- **`config/assets.json`** — the only TA-shaped field is `nsclc_indication_count`. There is no
  generic TA key; the file is an NSCLC artefact.

---

## Scoring chains not in the cycle

`score/rising_score.py` runs **only** the chain for the TA's `RISING_MODEL`. For CRC that is
`momentum`, writing `hcp_rising_star_ranks_v3` via five steps
(`network_centrality_scoring` ×2, `scientific_momentum_scoring`, `network_momentum_scoring`,
`rising_star_scoring`) — all of which do take `--ta`.

Nothing in the cycle runs anything else:

| Script | `--ta` | Note |
|---|---|---|
| `score/established_scoring.py` | **NO FLAG AT ALL** | see below |
| `score/community_scoring.py` | yes | community board |
| `score/pharma_engagement_scoring.py` | — | |
| `score/publication_leadership_scoring.py` | — | |
| `score/score_ranking.py` | — | |
| `score/capture_percentiles.py` | — | |

**`established_scoring.py` has no `--ta` flag, and the Established board is the primary validation
gate for any new TA.** `CRC_VALIDATION_ANCHORS.md` Group 1 is a pass/fail gate defined entirely in
terms of who surfaces high in global Established — Kopetz, Tabernero, Van Cutsem, Yoshino, André,
Cremolini, Yaeger. That gate cannot be evaluated until this script can be pointed at a TA.

This is the single highest-priority item in this document.

---

## TA-config tables with zero CRC rows

Four tables are TA-keyed, consumed by live surfaces, and populated **by hand or by migration — no
script writes them**:

| Table | rare-disease | hepatology | nsclc | atopic-dermatitis | **CRC** |
|---|---:|---:|---:|---:|---:|
| `ta_drug_keywords` | 47 | 23 | 21 | 14 | **0** |
| `ta_clinical_taxonomies` | 26 | 8 | 7 | — | **0** |
| `ta_hcpcs_codes` | 21 | 27 | 49 | — | **0** |
| `ta_cohort_counts_cache` | 1 | 1 | 1 | — | **0** |

Related: `config/therapeutic_areas/colorectal-cancer.json` ships with `nppes.taxonomies = []`,
recorded in its own `_query_note`. NPPES matching for CRC will not work until it is populated.

---

## Remaining unflagged scripts

TA-relevant, not orchestrated, and with no `--ta` flag:

- `classify/hcp_institution_linker.py`
- `classify/trial_investigator_matcher.py`
- `classify/trial_ta_mapping.py`
- `aggregate/medicare_aggregator.py`
- `enrich/established_npi_resolver.py`
- `enrich/nppes_matcher.py`

---

## Dependency order for making this orchestratable

The order matters: orchestrating first would wire up scripts that cannot be pointed at a TA, and
generalising the views after parameterising the scripts would leave `extract_web_signals` still
bound to the NSCLC board.

**1. TA-parameterise the scripts.** Add `--ta` to `established_scoring.py` (first — it is the
validation gate), then the percentile/ranking chain, `community_scoring.py`'s remaining consumers,
`extract_web_signals.py`, `ingest_asco_abstracts.py`, and the NIH/DOL scripts.

**2. Generalise the two hardcoded views.** `community_board_nsclc_v1` and
`hcp_nsclc_evidence_tier_v1` need TA-parameterised equivalents. `extract_web_signals.py` cannot be
TA-scoped until the board view is, so this gates step 1's web-signals item.

**3. Populate the four TA-config tables** for CRC — `ta_drug_keywords`, `ta_clinical_taxonomies`,
`ta_hcpcs_codes`, `ta_cohort_counts_cache` — plus `nppes.taxonomies` in the TA config JSON. These
are content decisions, not code, and they can proceed in parallel with 1 and 2.

**4. Only then orchestrate.** Extend `reingest_cycle.py` past stage 13 with the generation layer,
with the same discipline the existing stages have: per-stage completion notes, non-blocking where a
failure must not gate the data cycle, and the billed stages gated behind an explicit flag the way
build mode gates stage 13.

> Designed 2026-08-25 as a separate second orchestrator (`scripts/generate_cycle.py`) rather than an
> extension of `reingest_cycle.py` — see [`GENERATE_CYCLE_DESIGN.md`](GENERATE_CYCLE_DESIGN.md) for
> the dependency order, billed-stage cost shape, verified-resume model, completion guards, and the
> slug/name/id resolution trap. Not yet built.

---

## Open defects found during this audit

**Stage 8f is executed but absent from the dry-run plan.**
`reingest_cycle.py:1145` runs `run_stage(8, "in_corpus_pub_count(8f)", cmd_in_corpus_pub_count(...))`,
populating `hcps_v2.in_corpus_pub_count` from `author_pub_flat`. `print_plan` jumps from 8e to 9, so
`--dry-run` never shows it.

This is the same omission class as the stages 12/13/13.5 gap fixed in `234b5bf` — that fix appended
only the stages named in the task and did not re-audit the 8-series. Not yet fixed.

> Re-confirmed still present 2026-08-25 during the CRC first build. Execution-side orchestrator
> findings from that build — stage 6's per-row write cost, child-stdout buffering, missing
> completion guards and the absent `--stop-after` — are recorded separately in
> [`ORCHESTRATOR_DEBT.md`](ORCHESTRATOR_DEBT.md).

---

*Audit method: `pg_class`/`pg_get_viewdef` for object types and view definitions; repo-wide grep for
table writers, `--ta` flags and billed API clients; `reingest_cycle.py`'s `SCRIPTS` map and stage
gates for orchestration membership.*
