# `generate_cycle.py` — design for the Phase 2 generation orchestrator

**Written:** 2026-08-25, during the CRC first build.
**Companions:** [`TA_GENERATION_LAYER.md`](TA_GENERATION_LAYER.md) (what the cycle does not produce),
[`ORCHESTRATOR_DEBT.md`](ORCHESTRATOR_DEBT.md) (phase 1 execution debt), `TA_BUILD_GUIDE.md` (runbook).

A second orchestrator that runs after `reingest_cycle.py` completes and produces the surfaces a demo
actually shows. **Design only — no code has been written.**

**Scope:** the stages that already take `--ta` and do not depend on the two NSCLC-hardcoded views.
Explicitly out of scope and reported as blocked, not designed around: `extract_web_signals.py`
(selects `FROM community_board_nsclc_v1`), anything needing `hcp_nsclc_evidence_tier_v1`, congress
ingest, NIH grants, DOL matching, and `established_scoring.py` (no `--ta` flag at all).

---

## ⚠️ The slug / name / id resolution trap

**Read this before writing a single query.** The generation layer keys therapeutic area
**three different ways**, and one of them is not internally consistent.

| Table | Column | Type |
|---|---|---|
| `hcp_scientific_positions_v1` | `therapeutic_area_id` | **uuid** |
| `hcp_top_collaborators_v2` | `therapeutic_area_id` | **uuid** |
| `hcp_community_scores_v2` | `therapeutic_area_id` | **uuid** |
| `hcp_open_payments_by_ta_v2` | `therapeutic_area_id` | **uuid** |
| `hcp_narratives_v2` | `therapeutic_area_slug` | **text — slug** |
| `hcp_research_themes_v2` | `therapeutic_area` | **text — neither** |
| `theme_canonical_v1` | `therapeutic_area` | **text — neither** |
| `theme_to_canonical_v1` | `therapeutic_area` | **text — neither** |
| `hcp_ai_overviews` | `therapeutic_area` | **text** |

### Every text-keyed TA column, with live values

Sixteen columns carry a TA as text. Eleven are populated (probed 2026-08-25):

| Column | NSCLC | Atopic Dermatitis | Other |
|---|---|---|---|
| `hcp_narratives_v2.therapeutic_area_slug` | `nsclc` | `atopic-dermatitis` | `hepatology`, `rare-disease` |
| `hcp_established_board_snapshots.therapeutic_area_slug` | `nsclc` | `atopic-dermatitis` | — |
| `hcp_rising_board_snapshots.therapeutic_area_slug` | `nsclc` | — | — |
| `hcp_leadership_evidence.therapeutic_area` | `nsclc` | — | — |
| `msl_belief_claim_reactions.therapeutic_area_slug` | `nsclc` | — | — |
| `pulse_ai_synthesis.ta_slug` | `nsclc` | — | — |
| `reingest_snapshot_v2.ta_slug` | `nsclc` | — | — |
| `msl_profiles.default_ta_slug` | — | — | **`oncology`** ⚠ |
| **`hcp_research_themes_v2.therapeutic_area`** | **`NSCLC`** | **`Atopic Dermatitis`** | — |
| **`theme_canonical_v1.therapeutic_area`** | **`NSCLC`** | — | — |
| **`hcp_ai_overviews.therapeutic_area`** | **`NSCLC`** | **`atopic-dermatitis`** | — |

Empty, so convention unobserved: `theme_to_canonical_v1.therapeutic_area`,
`msl_contributions.therapeutic_area_slug`, `reingest_diff_v2.ta_slug`,
`reingest_diff_summary_v2.ta_slug`, and the view `hcp_board_movement_v1.therapeutic_area_slug`.
Array-typed, outside the scalar pattern: `msl_profiles.allowed_ta_slugs`,
`msl_profiles.therapeutic_areas`, `social_posts_v2.therapeutic_areas`.

### The rule that emerges

**Everything uses the lowercase slug except the three generation-layer tables, which each opted
out with their own literal.** The exceptions are exactly the tables written by the billed
generation scripts — themes, theme canon, and AI overviews. The slug is the platform convention;
the generation layer departed from it three times, independently, in three different ways.

**`hcp_ai_overviews` is the worst of them — it is internally inconsistent.** One column, two
conventions, split by TA:

```
hcp_ai_overviews.therapeutic_area  →  'NSCLC'  (598 rows)
                                   →  'atopic-dermatitis'  (87 rows)
```

NSCLC as the uppercase abbreviation, AD as the slug. These are not different casings of one form —
they are different *kinds* of string. And note AD is written three different ways across one
pipeline: `atopic-dermatitis` in overviews, `Atopic Dermatitis` in themes, `atopic-dermatitis` in
narratives.

**`msl_profiles.default_ta_slug = 'oncology'`** ⚠ is the only value in the entire schema that is
neither a built TA's slug nor a generation-layer literal. Out of scope for this design, but it is
the kind of thing that surfaces later as a mysteriously empty surface.

Against `therapeutic_areas`, where NSCLC is `slug='nsclc'`, `name='Lung Cancer'`:

- **NSCLC themes are stored as `'NSCLC'`** — which is *neither* the slug (`nsclc`, and case differs)
  *nor* the name (`Lung Cancer`).
- **AD themes are stored as `'Atopic Dermatitis'`** — which *is* the name.

**The same column follows different conventions for different TAs.** There is no rule to apply. For
CRC the value is presumably `'Colorectal Cancer'` (the name), but NSCLC already broke that pattern,
so it must be **read from the data, never assumed**.

### Why this is a silent, two-directional failure

The resume logic in §3 and the guards in §4 both compare a query result against an expectation. A
mis-resolved key breaks both, in opposite directions, with no error either time:

| Direction | What happens | How it reads |
|---|---|---|
| **Verification query mis-resolved** | Returns 0 for a stage that fully completed | "not done" → **re-runs a billed stage and pays twice** |
| **Skip / `--skip-existing` query mis-resolved** | Returns 0 rows to exclude, or matches nothing to skip | "done" → **silently skips work that never ran** |

Neither raises. One burns money, the other ships an empty surface. This is the same class as the
`career_first_pub_year` vs `career_first_pub_year_v2` confusion that made 8c write zero rows and
report success.

### Required mitigation

1. Resolve `(slug, name, id)` **once** at startup from `therapeutic_areas`, and additionally
   **probe the live distinct values** of every text-keyed column for the target TA rather than
   deriving them.
2. Carry all three forms in one resolved object; never pass a bare string to a stage.
3. **Assert at startup that each text-keyed table's resolved value actually matches ≥1 row for a
   known-good TA** (e.g. `nsclc`), so a convention change fails loudly at second zero rather than
   silently at stage seven.
4. Treat "verification returned 0" as **ambiguous, not negative** — distinguish
   *stage-did-not-run* from *key-did-not-resolve* before acting on it.

---

## Two premise corrections

Recorded because both change the cost math and the plan.

### 1. Narrative caps

`ESTABLISHED_DEFAULT_TOP_N = 100` and `COMMUNITY_DEFAULT_TOP_N = 500`
(`generate_narratives_v2.py:236`, `:239`). The cycle overrides established to 200. `--rising-top`
defaults to `None`. **Rising is the only genuinely uncapped arm** — not rising *and* community, as
was assumed.

### 2. Three in-scope stages are gated on out-of-scope work

Traced transitively, per the 8b/8c lesson that "nothing reads this table" is the wrong test:

- **`extract_scientific_positions --cohort established`** reads `hcp_established_ranks_v3` (`:136`),
  produced only by `established_scoring.py`, which has no `--ta`. The default `--cohort` is `both`,
  so a default invocation silently produces rising positions and **zero** established ones.
- **`open_payments_aggregator`** builds its TA slice with
  `INNER JOIN drug_keywords dk ON dk.therapeutic_area_id = ht.therapeutic_area_id` (`:480`).
  `ta_drug_keywords` has **0 CRC rows** → `hcp_open_payments_by_ta_v2` gets 0 CRC rows. Confirmed
  empty in the live DB.
- **`community_scoring`** reads `hcp_open_payments_by_ta_v2` and `hcp_medicare_by_ta_v2`
  (`:346`, `:353`) — **both 0 rows for CRC**, and `medicare_aggregator.py` has no `--ta` either.
  Two of its five displayed facts land null.

**The honestly-buildable set for CRC today is: themes → buckets, collaborators, positions (rising
only) → synthesis, narratives 13a.** That is still most of a demo.

---

## 1. Dependency order

| # | Stage | Reads | Writes | Blocked? |
|---|---|---|---|---|
| G1 | `extract_research_themes` | `hcps_v2`, `publications_v2` | `hcp_research_themes_v2` | **needs a `TA_CONFIGS` entry** |
| G2 | `bucket_themes` | `hcp_research_themes_v2`, `theme_canonical_v1` | `theme_canonical_v1`, `theme_to_canonical_v1` | needs G1; **key derivation broken off-nsclc** |
| G3 | `compute_top_collaborators` | `publication_authors_v2`, `publications_v2` | `hcp_top_collaborators_v2` | no |
| G4 | `extract_scientific_positions` | `hcp_rising_star_ranks_v3`, `hcp_established_ranks_v3`, `publications_v2`, `msl_hcp_notes` | `hcp_scientific_positions_v1` | **established arm blocked** |
| G5 | `generate_scientific_position_synthesis` | `hcp_scientific_positions_v1` | `hcp_ai_overviews` | needs G4 |
| G6 | `open_payments_aggregator` | OpenPayments parquet, `ta_drug_keywords` | `hcp_open_payments_summary_v2`, `_by_ta_v2`, `_top_companies` | **TA slice blocked** |
| G7 | `community_scoring` | `hcp_cohort_classification_v2`, G6's tables, `hcp_medicare_by_ta_v2` | `hcp_community_scores_v2` | **degraded** |
| G8 | `generate_narratives_v2` | all three boards + `hcp_research_themes_v2` + `hcp_scientific_positions_v1` + `hcp_rising_composite_v1` | `hcp_narratives_v2` | needs G1–G7 |

**Execution order: G3 → G1 → G2 → G4 → G5 → G6 → G7 → G8.**

G3 first because it has no generation-layer dependencies at all (only phase 1 stage 5's
`publication_authors_v2`) and is unbilled — it is the free win that validates the orchestrator's
plumbing before spending a token.

### G1 and G2 are not runnable for CRC today (corrected 2026-08-25)

Both were originally recorded here as "no blockers". Both are wrong.

**G1 — `extract_research_themes.py` needs a `TA_CONFIGS` entry, which is a cohort-scoping decision,
not boilerplate.** The TA key is *not* derived from the slug or the name; it is a hardcoded literal
per TA (`:113`, `:118`):

```python
#   tag              -> therapeutic_area TEXT write value + delete/exists scope
TA_CONFIGS = {
    "nsclc":             {"tag": "NSCLC",             "selection": {"rising": ...},  "default_scope": "rising"},
    "atopic-dermatitis": {"tag": "Atopic Dermatitis", "selection": {"region": ..., "global": ..., "rising-global": ...}, "default_scope": "region"},
}
DEFAULT_TA = "nsclc"
```

There are exactly two keys; the string `colorectal` does not appear in the file. **CRC's value is
not `'Colorectal Cancer'` or anything else — it does not exist, and whatever you put in `tag`
*becomes* the value.** A CRC entry needs `tag`, `domain`, `generic_negative`, `theme_examples`, and
— the substantive part — a `selection` SQL defining which HCPs to extract for.

Two flag behaviours worth knowing:

- `--ta` is declared `choices=tuple(TA_CONFIGS.keys())` (`:595`), so `--ta colorectal-cancer` is
  **rejected by argparse**. The failure is loud. Good.
- `default=DEFAULT_TA` means **omitting `--ta` silently runs NSCLC** — on a billed script. The
  orchestrator must always pass `--ta` explicitly, never rely on the default.

**G2 — `bucket_themes.py` derives its key mechanically, and disagrees with G1 for every TA except
nsclc.** At `:484`:

```python
ta_upper = ta.upper()
```

So G2 looks for `slug.upper()` while G1 wrote `tag`. They coincide **only** for nsclc
(`'nsclc'.upper() == 'NSCLC' == tag`). For atopic-dermatitis, G1 wrote `'Atopic Dermatitis'` and G2
searches for `'ATOPIC-DERMATITIS'`, hitting `:305`:

```python
raise RuntimeError(f"No themes found for therapeutic_area={ta_upper}")
```

**This is confirmed by the data, not inferred:** AD has 3,499 rows in `hcp_research_themes_v2` and
**zero** in `theme_canonical_v1`. G2 has never run successfully for any TA but NSCLC, and cannot
until the two key derivations are reconciled. For CRC, G2 will look for `'COLORECTAL-CANCER'`
regardless of the `tag` chosen — so unless `tag` is set to exactly that string, G2 fails.

This is the resolution trap in its purest form: two adjacent stages of one pipeline, each deriving
the same logical key by a different rule, agreeing by coincidence on the only TA anyone has run.

#### DECISION — CRC `tag` = `'COLORECTAL-CANCER'`

**Chosen because it is the only value that satisfies both derivations without a code change.**
G1 will write whatever literal is placed in `TA_CONFIGS["colorectal-cancer"]["tag"]`; G2 will look
for `'colorectal-cancer'.upper()` — i.e. `'COLORECTAL-CANCER'` — and nothing else. Setting `tag` to
that string is what makes G1 and G2 agree, so the themes chain runs end-to-end for CRC with one
config line and no edits to `bucket_themes.py`.

**This is a workaround, not the fix.** It does not repair the underlying defect — it conforms to it.
Specifically:

- It leaves G2's `ta.upper()` derivation and G1's hardcoded literal still disagreeing in general.
  The next TA hits exactly the same wall unless its `tag` is also spelled `SLUG.UPPER()`.
- It bakes a fourth spelling into `hcp_research_themes_v2.therapeutic_area`, which will then hold
  `NSCLC`, `Atopic Dermatitis`, and `COLORECTAL-CANCER` — three conventions in one column,
  strengthening the very inconsistency documented above.
- It does nothing for the orphaned AD rows (below); AD's `tag` is `'Atopic Dermatitis'` and would
  still need either a data migration or a G2 change.

**The real fix** is to make one derivation authoritative — most cheaply, have `bucket_themes.py`
read `TA_CONFIGS[slug]["tag"]` from the same source G1 writes from, rather than computing
`ta.upper()` independently. That is a small change and it retires the class. Recorded here so the
workaround is not mistaken for a resolution when someone reads this in six months.

#### LIVE GAP — AD's 3,499 theme rows are orphaned

Found while scoping CRC, in a **shipped** TA:

| | `hcp_research_themes_v2` | `theme_canonical_v1` |
|---|---:|---:|
| NSCLC | 10,640 | 25 |
| **Atopic Dermatitis** | **3,499** | **0** |

G2 has never succeeded for AD and, per the derivation mismatch above, cannot — it searches
`'ATOPIC-DERMATITIS'` and raises `RuntimeError: No themes found`. So AD's extracted themes were
paid for (billed Anthropic extraction) and have never been bucketed into canonical themes. Any
surface reading `theme_canonical_v1` or `theme_to_canonical_v1` is NSCLC-only today, silently.

This is not a CRC problem and does not block the CRC build. It is an existing defect in a live TA
that the CRC scoping happened to surface, and it will not fix itself.

**What breaks on wrong order — all silent, none raise:**

- **G8 before G1/G2/G4** — the highest-cost failure. Narratives assemble context from themes and
  positions; running first produces narratives that are structurally valid and materially thinner,
  at full token cost, with no error. Re-running means paying twice. (Related: the community context
  assembly has been disabled since 2026-08-11 when `score_fields` was removed — that arm is already
  degraded independent of ordering.)
- **G2 before G1** — nothing to bucket; writes zero canonical themes and exits clean.
- **G5 before G4** — reads an empty `hcp_scientific_positions_v1`; produces no overviews, exits 0.
- **G7 before G6** — community's payment facts land null. Since the composite was removed in Phase 2
  (`community_scoring.py:60` — "no normalization, no weighting, no composite"), this does not corrupt
  a score; it blanks displayed facts.
- **G4 before phase 1 stage 9** — the rising board does not exist; positions targets zero HCPs.

The transitive lesson from 8b/8c holds: G8's dependency on G1 is invisible if you only ask "what
writes `hcp_narratives_v2`". It shows up only in the context assembler.

---

## 2. Billed stages and cost shape

Five stages call Anthropic, all on `claude-sonnet-4-6` (**$3.00 / $15.00 per MTok**). Three are
unbilled: G3, G6, G7.

| Stage | Unit of billing | Cap | Pre-flight count query |
|---|---|---|---|
| G1 themes | 1 call per HCP | `--limit` | `SELECT COUNT(*) FROM hcp_therapeutic_areas_v2 hta WHERE therapeutic_area_id=:ta AND NOT EXISTS (SELECT 1 FROM hcp_research_themes_v2 t WHERE t.hcp_id=hta.hcp_id AND t.therapeutic_area=:ta_text)` |
| G2 buckets | 1 call per pass batch | `--pass-2-batch-size` | `SELECT COUNT(DISTINCT theme_name) FROM hcp_research_themes_v2 WHERE therapeutic_area=:ta_text` |
| G4 positions | 1 call per HCP | `--limit` (default 200) | `SELECT COUNT(*) FROM hcp_rising_star_ranks_v3 WHERE therapeutic_area_id=:ta AND us_rank<=100` |
| G5 synthesis | 1 call per HCP | `--limit` | `SELECT COUNT(DISTINCT hcp_id) FROM hcp_scientific_positions_v1 WHERE therapeutic_area_id=:ta` |
| G8a rising | 1 call per HCP | **none** | `SELECT COUNT(*) FROM hcp_rising_star_ranks_v3 WHERE therapeutic_area_id=:ta` |
| G8b established | 1 call per HCP | 200 (cycle) / 100 (script) | `SELECT LEAST(200, COUNT(*)) FROM hcp_established_ranks_v3 WHERE therapeutic_area_id=:ta AND scope_type='global'` |
| G8c community | 1 call per HCP | 500 | `SELECT LEAST(500, COUNT(*)) FROM hcp_community_scores_v2 WHERE therapeutic_area_id=:ta` |

> `:ta_text` above is the **probed** text value from the resolution trap section — not the slug and
> not necessarily the name.

**G8a is the exposure.** Whole-board, no cap. On CRC that is the full `hcp_rising_star_ranks_v3` row
count for the TA — orders of magnitude above the 200/500 arms. The orchestrator should print that
number in the plan and require `--yes` past a threshold.

Two design notes on estimation:

- **Do not reuse the built-in estimator.** Its 600-input-token constant is roughly 3–5× low, and no
  usage is stamped at write time, so historical cost is estimable rather than answerable. For real
  numbers, call `client.messages.count_tokens` on one rendered prompt per stage and multiply by the
  work-set count — a cheap, exact input-side estimate. Output side stays an assumption; record
  `response.usage` at write time and the next TA's estimate becomes real.
- **These are textbook Batch API jobs** — non-latency-sensitive, thousands of independent calls,
  **50% cost reduction**. Worth considering for G8a specifically, where the volume is unbounded. It
  changes the resumability design (poll `processing_status`, key results by `custom_id`, results
  arrive unordered), so it is a real decision, not a free switch.

---

## 3. Resumability — verify, never count

Phase 1's checkpoint counted batches instead of verifying the DB and cost 345 of 368 publications in
a proven A/B, which is why `--reset-checkpoint` is unconditional. Phase 2 must not repeat it.

The rule: a stage is complete when **the target table says so**, not when a counter says so. Record
per-stage state in `.generate_work/<slug>/generate_state.json`, and on `--resume-from`, re-run the
verification query and skip only if it passes.

| Stage | Verification query (skip only if > 0 and ≥ expected) |
|---|---|
| G1 | `SELECT COUNT(DISTINCT hcp_id) FROM hcp_research_themes_v2 WHERE therapeutic_area=:ta_text` |
| G2 | `SELECT COUNT(*) FROM theme_to_canonical_v1 WHERE therapeutic_area=:ta_text` |
| G3 | `SELECT COUNT(DISTINCT hcp_id) FROM hcp_top_collaborators_v2 WHERE therapeutic_area_id=:ta` |
| G4 | `SELECT COUNT(DISTINCT hcp_id) FROM hcp_scientific_positions_v1 WHERE therapeutic_area_id=:ta` |
| G5 | `SELECT COUNT(*) FROM hcp_ai_overviews WHERE hcp_id IN (SELECT hcp_id FROM hcp_scientific_positions_v1 WHERE therapeutic_area_id=:ta)` |
| G6 | `SELECT COUNT(*) FROM hcp_open_payments_by_ta_v2 WHERE therapeutic_area_id=:ta` |
| G7 | `SELECT COUNT(*) FROM hcp_community_scores_v2 WHERE therapeutic_area_id=:ta` |
| G8 | `SELECT cohort, COUNT(*) FROM hcp_narratives_v2 WHERE therapeutic_area_slug=:slug GROUP BY cohort` |

Three properties this needs that phase 1's checkpoint lacked:

1. **Verified, not asserted.** State records *what the query returned*, and resume re-runs it. A
   truncated DB, a manual delete, or a rolled-back transaction all correctly force a re-run.
2. **Partial-aware.** Store `expected` alongside `actual`. `actual < expected` means resume that
   stage in top-up mode (each script already has `--skip-existing` / `--force` / `--resume`), not
   skip it.
3. **Per-cohort for G8.** `hcp_narratives_v2` is keyed `(hcp_id, slug, cohort)`. Recording stage 8 as
   one boolean would let a completed 13a mask a never-run 13c.

**Note the key forms above are mixed on purpose** — G1/G2 use `:ta_text`, G3–G7 use the uuid, G8 uses
the slug. Getting any one of them wrong produces a silent zero. See the trap section.

Three queries above need specific care:

**G5 routes through `hcp_scientific_positions_v1` on the uuid deliberately — do not "simplify" it.**
`hcp_ai_overviews.therapeutic_area` is the internally-mixed column (NSCLC as `'NSCLC'`, AD as
`'atopic-dermatitis'`), so *any* query filtering it directly is a landmine. Joining via
`hcp_scientific_positions_v1.therapeutic_area_id` is safe by construction because that column is a
uuid. This began as a coincidence of drafting; it is now a deliberate constraint. The obvious
"cleanup" — replacing the subquery with `WHERE therapeutic_area = :ta_text` — would work for
whichever TA happened to be tested and silently return zero for the other.

**G2's query is the one query in this design with no empirical backing.** `theme_to_canonical_v1` is
empty, so its convention has never been observed. Worse, per the G1/G2 correction above,
`bucket_themes.py` writes `slug.upper()` — meaning the right predicate is almost certainly
`therapeutic_area = upper(:slug)`, *not* the `:ta_text` that G1 uses. Do not trust this guard until
G2 has successfully run once and the value can be read back.

**G1's `:ta_text` must come from `TA_CONFIGS[slug]["tag"]`**, not from the database and not from the
slug — it is the script's own literal, and for CRC it will be whatever gets written into that dict.

---

## 4. Completion guards

Modelled on stage 4's `"curated_ta_concepts is empty - cannot proceed"` — a **precondition** that
fails before spending, plus a **postcondition** scoped to this run's batch.

| Stage | Precondition (fail fast) | Postcondition (batch-scoped) |
|---|---|---|
| G1 | TA has ≥1 HCP with ≥1 publication | `COUNT(DISTINCT hcp_id)` for this TA ≥ 90% of work-set |
| G2 | G1 wrote ≥1 theme row for this TA | `theme_to_canonical_v1` rows for this TA > 0 |
| G3 | `publication_authors_v2` non-empty for this TA's pubs | collaborator rows > 0 for this TA |
| G4 | **cohort's board table has ≥1 row for this TA** — refuse `--cohort established` when `hcp_established_ranks_v3` is empty rather than writing zero rows | positions rows for this TA ≥ 90% of targeted HCPs |
| G5 | `hcp_scientific_positions_v1` non-empty for this TA | overviews ≥ 90% of distinct positioned HCPs |
| G6 | **`ta_drug_keywords` has ≥1 row for this TA** — the exact analogue of the stage-4 guard | `hcp_open_payments_by_ta_v2` rows > 0 |
| G7 | `hcp_cohort_classification_v2` has ≥1 `cohort='community'` row for this TA | community score rows > 0 |
| G8 | themes, positions, and the target board all non-empty for this TA | per-cohort narrative count ≥ 90% of that cohort's target |

**G6's precondition is the highest-value guard in the set** — it converts today's silent zero into a
one-second failure naming `ta_drug_keywords`, and it would have caught the CRC gap before anyone ran
community scoring.

Every postcondition is scoped by `therapeutic_area_id`/`slug`/`:ta_text` and compared against *this
run's* work-set — never a whole-table null check, which would fail permanently on the other TAs'
pre-existing rows and be disabled within a month.

---

## 5. Flags

| Flag | Default | Notes |
|---|---|---|
| `--ta SLUG` | **required** | no default; resolves slug/name/id **and probes text-key values** once |
| `--dry-run` | **default when neither given** | prints plan, work-set counts, token estimate, spends nothing |
| `--execute` | off | required to write |
| `--stop-after STAGE` | none | the flag phase 1 lacks — `max_stage = min(max_stage, stop_after)` |
| `--resume-from STAGE` | none | re-verifies every prior stage rather than trusting state |
| `--yes` | off | **required for any billed stage in a non-TTY**, mirroring build mode's Gate C |
| `--allow-billed` | **off** | unbilled stages (G3, G6, G7) run freely; G1/G2/G4/G5/G8 refuse without it |

`--allow-billed` defaulting to off is the one addition beyond the requested set. It makes the safe
path the default path, lets an operator build the whole unbilled substrate and inspect it before
committing spend, and it is the generation-layer analogue of build mode's stage-13 ceiling — exactly
the discipline `TA_GENERATION_LAYER.md` §4 asks for.

---

## 6. What a new TA still needs by hand after this runs

**This script must not imply completeness.** It should print this list on every successful finish,
with live counts.

**Config content (no script writes these):**

| Table | CRC rows | Consequence while empty |
|---|---:|---|
| `ta_drug_keywords` | **0** | G6's TA slice returns 0 rows → community payment facts blank |
| `ta_clinical_taxonomies` | **0** | |
| `ta_hcpcs_codes` | **0** | Medicare TA slice unavailable |
| `ta_cohort_counts_cache` | **0** | |
| `config/therapeutic_areas/colorectal-cancer.json` → `nppes.taxonomies` | `[]` | **NPPES matching does not work for CRC at all** |

**Code work that must land before these surfaces exist:**

- `established_scoring.py` — **no `--ta` flag**. The Established board cannot be built for CRC, which
  blocks G4's established arm, G8b, and — per `CRC_VALIDATION_ANCHORS.md` Group 1 — the pass/fail
  acceptance gate itself (Kopetz, Tabernero, Van Cutsem, Yoshino, André, Cremolini, Yaeger). This
  remains the single highest-priority item.
- `medicare_aggregator.py` — no `--ta`; blocks `hcp_medicare_by_ta_v2`.
- `community_board_nsclc_v1` and `hcp_nsclc_evidence_tier_v1` — NSCLC-hardcoded views;
  `extract_web_signals.py` cannot be TA-scoped until the board view is.
- Congress ingest, NIH grants, DOL matching — no `--ta`.

**Out of scope by nature:** belief claims have no populating script — `hcp_belief_claims` does not
exist; the system is `msl_belief_claim_reactions`, filled by MSLs in-app.

---

## Ranking by value-to-effort

1. **G3 collaborators** — unbilled, no generation dependencies, one table, immediate visible surface.
   Build the orchestrator around this stage first; it proves plan/verify/guard end-to-end for free.
2. **G1 → G2 themes** — billed but capped by `--limit`, feeds both the profile UI and G8's context.
   Highest surface-per-token in the set, **but not runnable today**: G1 needs a `TA_CONFIGS` entry
   (including a selection SQL — a cohort-scoping decision), and G2's `slug.upper()` key derivation
   disagrees with G1's literal for every TA except nsclc. Both are code changes, not config. See the
   correction under §1. Still ranked #2 by value; the effort estimate is higher than first recorded.
3. **G4 (rising) → G5 synthesis** — the profile centrepiece. Scope to `--cohort rising_star`
   explicitly; the default `both` will silently half-fail.
4. **G8a rising narratives** — the demo's headline text, but the only uncapped billed arm. Worth
   running last and deliberately, after 2 and 3 are in place so the context is complete and you pay
   once.
5. **G6 → G7 → G8c community** — blocked on two empty config tables and one unflagged script.
   Roughly 70% of community's intended signal is structurally unavailable today. Community should not
   be on a demo path until `ta_drug_keywords` and Medicare are resolved.
6. **G4 (established) → G8b** — fully blocked upstream. Nothing to build here until
   `established_scoring.py` takes `--ta`.

**Sequencing implication: 1–4 gets a CRC demo built almost entirely on the rising board**, which is
the one board phase 1 actually produces. That is a coherent product story, and it is achievable
without touching any of the blocked work.

---

*Design recorded 2026-08-25. Evidence: repo read of the eight in-scope scripts for flags, reads and
writes; `information_schema` for TA key column types; live `GROUP BY` over the text-keyed columns for
their actual values; live row counts for `ta_drug_keywords`, `hcp_open_payments_by_ta_v2` and
`hcp_medicare_by_ta_v2`. Model pricing from the Anthropic model table current at time of writing.*
