# The TA Generation Layer — what `reingest_cycle.py` does NOT produce

**Written:** 2026-08-24, from a live audit of the repo and database while standing up Colorectal Cancer.
**Corrected:** 2026-08-26 — the Established finding was wrong; see *Scoring chains not in the cycle*.
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

**One correction to the "needs a `--ta` flag" framing, added 2026-08-26.** It holds for the
generation-layer scripts tabulated below, but NOT for the Established scoring chain, which this
document originally got wrong in both directions — naming a dead-end script as the top blocker and
marking two already-parameterised scorers as unflagged. Established needs an orchestrator, not
flags. See *Scoring chains not in the cycle*, and read the 10yr trap there before running the chain
for any new TA.

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

> **CORRECTED 2026-08-26.** The original audit named `established_scoring.py`'s missing `--ta` flag
> as "the single highest-priority item in this document", and marked
> `publication_leadership_scoring.py` and `pharma_engagement_scoring.py` as having no `--ta`. All
> three claims were wrong. The Established board does not come from `established_scoring.py`, and
> the other two scripts have taken `--ta` all along. The corrected finding is below; **the real gap
> is orchestration, not a flag.**

`score/rising_score.py` runs **only** the chain for the TA's `RISING_MODEL`. For CRC that is
`momentum`, writing `hcp_rising_star_ranks_v3` via five steps
(`network_centrality_scoring` ×2, `scientific_momentum_scoring`, `network_momentum_scoring`,
`rising_star_scoring`) — all of which do take `--ta`.

Nothing in the cycle runs anything else:

| Script | `--ta` | Writes | Note |
|---|---|---|---|
| `score/recompute_established_ranks_v3.py` | **yes** | `hcp_established_ranks_v3` | **THE Established board.** Sole writer of the table every Established surface reads |
| `score/publication_leadership_scoring.py` | **yes** | `hcp_publication_leadership_v2` | 0.60 component of the Established composite |
| `score/network_centrality_scoring.py` | **yes** | `hcp_network_centrality_v2` | 0.40 component — but only at `--window-type 10yr`; see the trap below |
| `score/pharma_engagement_scoring.py` | **yes** | `hcp_pharma_engagement_v2` | weight 0.0, displayed on the ledger, not ranked on |
| `score/community_scoring.py` | yes | community board | `--ta` is optional; default is all community-classified TAs |
| `score/established_scoring.py` | no flag at all | `hcp_established_scores_v2` | **legacy dead end — see below.** Two hardcoded TA UUIDs (Hepatology, NSCLC) |
| `score/score_ranking.py` | n/a | `hcp_score_ranks_v2` | library, not a CLI — imported by `established_scoring.py` |
| `score/capture_percentiles.py` | no | — | `--label` / `--compare` only; a before/after chain verifier, not a scorer |

### `established_scoring.py` is not the Established board

It writes `hcp_established_scores_v2`, and **nothing live reads that table.** No RPC, no frontend
query, no other script. `dedup/dedup_merge.py:542` only remaps `hcp_id` on a merge. One view is
defined over it — `hcp_established_ranks_v2` — whose only consumer is two `LEFT JOIN`s in
`migrations/2026_05_28_get_established_filtered_v3.sql`, a superseded RPC.

It also draws its population from `hcps_v2.cohort_classification`, the unmaintained column that is
73.6% null — the same dead column the rising gate was moved off on 2026-08-05.

Adding `--ta` to it would parameterise a path nothing consumes. **Leave it alone.**

### `recompute_established_ranks_v3.py` is, and it already takes `--ta`

```
python scripts/score/recompute_established_ranks_v3.py --ta colorectal-cancer --dry-run --debug-top 30
```

Population is `hcp_cohort_classification_v2` where `cohort = 'established'` — the maintained per-TA
taxonomy — filtered to ACADEMIC plus GOVERNMENT-at-NCI/NIH. It writes global, per-country and
aggregate-region scope rows to `hcp_established_ranks_v3`, the table read by `established_ledger`,
`ledger_meta`, `hcp_profile_spine`, `hcp_profile_brief`, the trials and asset RPCs, `api.ts`,
`home.ts`, `institutionRegistry.ts`, `trials.ts`, `HcpPositionsPage` and `CongressDetailPage`.

It never reads `hcp_established_scores_v2`. The two scripts do not chain; they are alternative,
unrelated implementations and only one of them is wired to a surface.

`CRC_VALIDATION_ANCHORS.md` Group 1 — Kopetz, Tabernero, Van Cutsem, Yoshino, André, Cremolini,
Yaeger — is evaluable against a `--dry-run --debug-top 30` of this script as soon as its three
inputs exist for the TA. No code change is required to get there.

### THE REAL GAP: no Established dispatcher

`rising_score.py` is a pure orchestrator — it resolves the TA's model from config and sequences the
five momentum steps with the right window flags, so `--ta <slug> --execute` is the whole operator
interface. **There is no Established equivalent.** `reingest_cycle.py` stage 9 runs `rising_score.py`
and nothing else, and `take_weekly_snapshot.py:37` records Established as "write-on-change, not
weekly", which is why the omission has never surfaced on NSCLC.

So the three input scorers must be run by hand, in order, before the rank script:

```
python scripts/score/publication_leadership_scoring.py --ta <slug>
python scripts/score/network_centrality_scoring.py     --ta <slug> --window-type 10yr
python scripts/score/pharma_engagement_scoring.py      --ta <slug>
python scripts/score/recompute_established_ranks_v3.py --ta <slug> --dry-run --debug-top 30
```

An `established_score.py` dispatcher mirroring `rising_score.py` is the fix. It is a sequencing
wrapper over four scripts that already take `--ta`, not a scoring change — which is why this is a
smaller job than the original entry implied, and why it belongs in `GENERATE_CYCLE_DESIGN.md`'s
scope rather than ahead of it.

### THE 10YR TRAP — read this before running the chain for a new TA

`recompute_established_ranks_v3.fetch_network_scores()` reads:

```sql
SELECT hcp_id::text, network_influence_score
FROM hcp_network_centrality_v2
WHERE therapeutic_area_id = %s
  AND window_type = '10yr'
```

`network_centrality_scoring.py` defaults to `--window-type 10yr`, **but `rising_score.py` overrides
it on both of its invocations**, with `early_roll` and `recent_roll`. A TA that has only ever run
the rising chain therefore has `early_roll` and `recent_roll` rows and **no `10yr` rows at all**.

It does not fail. `fetch_network_scores()` returns an empty map, the network percentile resolves to
`None` for every HCP, and the composite — which **renormalises over the components that are
present** rather than treating missing as zero — silently becomes **publication leadership alone**.
A full-looking Established board, ranked on 60% of its formula, with nothing in the output saying so.

This is the same failure shape the script's own docstring warns about for the pharma component at
27% coverage, and it is why the pharma weight is 0.0 today.

**Before trusting any new TA's Established board, confirm `hcp_network_centrality_v2` has `10yr`
rows for that `therapeutic_area_id`.** The `--window-type 10yr` run is a separate invocation from
anything the reingest cycle performs.

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

**1. TA-parameterise the scripts.** ~~Add `--ta` to `established_scoring.py` (first — it is the
validation gate), then the percentile/ranking chain~~ — **corrected 2026-08-26: neither is
needed.** The Established chain is already fully `--ta` parameterised end to end
(`publication_leadership_scoring`, `network_centrality_scoring`, `pharma_engagement_scoring`,
`recompute_established_ranks_v3`); what it lacks is a dispatcher, which is step 4 work, not step 1
work. `established_scoring.py` writes a table nothing reads and should not be parameterised at all.
What genuinely needs `--ta` here: `extract_web_signals.py`, `ingest_asco_abstracts.py`, and the
NIH/DOL scripts.

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
