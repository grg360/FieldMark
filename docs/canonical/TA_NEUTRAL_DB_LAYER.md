# TA-neutral database layer — design

Date: 2026-08-30. Branch: foundation-rebuild. **Design only — nothing in here is built.**

Goal is not "make CRC work". Goal is that TA #4 cannot hit this wall. Every inventory
figure below comes from the live catalog (`pg_proc` / `pg_get_functiondef`, `pg_class`,
`pg_get_viewdef`, `pg_attribute`), not from grepping the repo — the repo disagrees with
the database in at least one load-bearing place (see A.4).

---

## A. THE FULL INVENTORY

### A.1 A third pattern exists

The brief names two patterns. The catalog shows a third, and it is the largest.

**PATTERN 3 — TA as free text, in three incompatible casings.** Nineteen live relations
carry the TA as a string rather than an FK. Two competing column names
(`therapeutic_area` vs `therapeutic_area_slug`), and the *values* disagree per table:

| Table | Column | Values held |
|---|---|---|
| `hcp_ai_overviews` | `therapeutic_area` | `NSCLC` (598) · `atopic-dermatitis` (87) · `colorectal-cancer` (15) |
| `hcp_research_themes_v2` | `therapeutic_area` | `NSCLC` (10,640) · `Atopic Dermatitis` (3,499) · `COLORECTAL-CANCER` (1,120) |
| `hcp_leadership_evidence` | `therapeutic_area` | `nsclc` (955) |
| `hcp_narratives_v2` | `therapeutic_area_slug` | `nsclc` · `hepatology` · `colorectal-cancer` · `atopic-dermatitis` · `rare-disease` |
| `theme_canonical_v1` | `therapeutic_area` | `NSCLC` (25) · `COLORECTAL-CANCER` (25) |

The same TA is `NSCLC`, `nsclc`, and (in `therapeutic_areas.name`) `Lung Cancer`. The same
column holds an uppercase abbreviation for one TA and a lowercase slug for another. This is
why `established_ledger` line 121 reads `o.therapeutic_area = 'NSCLC'` while line 131 reads
`n.therapeutic_area_slug = 'nsclc'` — both correct, against different conventions, four
lines apart.

**This matters more than Patterns 1 and 2 because it cannot be fixed by a rename or a
parameter.** Parameterizing `established_ledger` with `p_ta_id` still leaves the question:
what string does `hcp_ai_overviews` want for that uuid? There is no answer derivable from
`therapeutic_areas` — `NSCLC` is not the name, not the slug, and not the id.

Full list of the 19: `hcp_ai_overviews`, `hcp_board_movement_v1` (view),
`hcp_established_board_snapshots`, `hcp_leadership_evidence`, `hcp_narratives_v2`,
`hcp_research_themes_v2`, `hcp_rising_board_snapshots`, `msl_belief_claim_reactions`,
`msl_contributions`, `mv_social_hot_topics_by_ta`, `mv_social_share_of_voice_by_ta`,
`mv_social_trending_topics_by_ta`, `mv_social_voice_emergence_by_ta`, `pulse_ai_synthesis`,
`reingest_diff_summary_v2`, `reingest_diff_v2`, `reingest_snapshot_v2`, `theme_canonical_v1`,
`theme_to_canonical_v1`.

### A.2 Objects whose NAME contains a TA slug or abbreviation

**Live, load-bearing (4 objects):**

| Object | Kind | Notes |
|---|---|---|
| `community_board_nsclc_v1` | view | Depends on the evidence-tier view. The single most-referenced TA-named object. |
| `hcp_nsclc_evidence_tier_v1` | view | Content is genuinely NSCLC-specific — see §E. |
| `get_nsclc_trials_surface()` | function | Zero arguments. TA is in the name only. |
| `get_community_directory_filtered(… p_ad_only boolean …)` | function param | Pattern 1 inside a *parameter name*; `_count` twin has it too. |

**Live, TA-named by data domain rather than by therapeutic area (9 objects):**
`hcp_part_d_oncology_v1`, `part_d_oncology_drugs_v1`, and their seven indexes
(`hcp_part_d_oncology_v1_pkey`, `ix_hcp_part_d_oncology_v1_{grade,npi,stem,year}`,
`part_d_oncology_drugs_v1_pkey`, `part_d_oncology_drugs_v1_drug_stem_int4range_excl`).
"Oncology" here names the CMS source extract, not a therapeutic area — but the *contents*
are lung-graded (§E). Judgement call in §B. (`idx_cpp_ad_drug` and `ad_yearly_hcp_id_year_idx`
were counted here in the first draft; the Phase 0 validator files them where they belong,
with the AD archive below.)

**Frontend, same pattern:** `frontend/src/data/telescope_nsclc_nodes.json`,
`telescope_nsclc_edges.json`, `telescope_ad_nodes.json`, `telescope_ad_edges.json` —
selected by a ternary on `taId === AD_TA_ID` in `TelescopeField.tsx:227`, which is the
frontend's version of the same wall.

**Archaeology — 23 backup/snapshot objects.** `nsclc_oracle_*_20260720` (4),
`*_pre_crc` (3), `*_contaminated_backup` (2), `*_presweep_backup`, `ad_pubs_delete_list`,
`ad_stale_detour_tags_backup`, `ad_yearly`, `hcps_v2_ad_july_delete_list`,
`hcps_v2_ad_july_detour_backup`, `openalex_author_inventory_pre_ad_backup`,
`pub_authors_v2_ad_july_detour_backup`, `publications_v2_ad_contaminated_backup`,
`social_{posts,users}_backup_pre_nash_cleanup`. **These must be explicitly exempted, not
quietly skipped** — see §D. A validator that flags twenty dead tables on every run gets
muted within a week, and then it protects nothing.

### A.3 Function bodies containing a TA slug literal

Fifteen functions, found via `pg_get_functiondef`. Comment-only matches excluded.
`normalize_institution` matched the scan on the word `'hepatology'` inside a specialty
word-list and is a **false positive** — noted because the validator will hit it too.

| Function | Args today | The literal |
|---|---|---|
| `established_ledger` | `p_limit, p_after_rank, p_states, p_countries` | `ta as (… where slug = 'nsclc')` L7; `o.therapeutic_area = 'NSCLC'` L121; `n.therapeutic_area_slug = 'nsclc'` L131, L137 |
| `rising_ledger` | same four | `ta as (… slug = 'nsclc')` L7; slug L110, L115 |
| `ledger_meta` | `p_cohort` | `ta as (… slug = 'nsclc')` L7; `from community_board_nsclc_v1` L41 |
| `community_ledger` | `p_limit, p_after_*, p_tiers, p_states` | no CTE — reaches the TA *through* `community_board_nsclc_v1` L21 and `hcp_nsclc_evidence_tier_v1` L23; slug L54, L58 |
| `rising_board` | none | `SELECT id FROM therapeutic_areas WHERE slug = 'nsclc'` L8 |
| `hcp_profile_spine` | `p_hcp_id` | `join therapeutic_areas ta … and ta.slug = 'nsclc'` L10 |
| `hcp_profile_brief` | `p_hcp_id` | slug L11; `therapeutic_area = 'NSCLC'` L71; slug L105 |
| `hcp_rising_profile` | `p_hcp_id` | slug L8; slug L40 |
| `community_hcp_profile` | `p_hcp_id` | slug L11; both TA-named views L25/L30; `nsclc_spend_3yr`/`nsclc_volume_2023_est` **column names** L38, L90; slug L66; JSON key `'nsclc'` L89 |
| `community_practice_profile` | `p_hcp_id` | slug L11; board view L33 |
| `hcp_administered_therapy` | `p_hcp_id` | slug L18 |
| `hcp_belief_claims` | `p_hcp_id` | `therapeutic_area = 'NSCLC'` L12 |
| `asset_overview` | `p_generic` | slug L38 |
| `asset_authors` | `p_generic, p_limit` | slug L28 |
| `asset_index_meta` | none | slug L11 |

**Plus three functions that already take `p_ta_id` and are still NSCLC-locked** — because
they select from the TA-named view, which pins them regardless of the parameter:
`get_community_filtered`, `get_community_filtered_count` (**two overloads**). This is the
sharpest illustration of why Patterns 1 and 2 have to be retired together: parameterizing
alone produced a function that *accepts* a TA and *ignores* it.

Population size for the validator: 278 functions in `public`; 38 mention
`therapeutic_area`; 15 of those take a `ta_id` argument; **23 do not**.

### A.4 The repo is behind the database

`migrations/2026_08_04_community_ledger_tiered.sql` defines `community_ledger` with
`with ta as (select id from therapeutic_areas where name = 'NSCLC')`. The live function has
no such CTE. That literal would today match **zero rows** — `therapeutic_areas.name` was
renamed to `Lung Cancer` on 2026-08-15. Whatever fixed it was applied without a migration
file, or with one not in `migrations/`. Two consequences:

- Any inventory built by grepping `migrations/` is wrong. §A was built from the catalog.
- The validator must run against the **live database**, not the repo (§D).

---

## B. THE RENAME

### B.1 What breaks at the moment of deployment — and it is worse than it looks

`pg_depend` tracks exactly **one** edge for these two views: `community_board_nsclc_v1` →
`hcp_nsclc_evidence_tier_v1`. None of the seven dependent functions appear.

That is because these are old-style SQL functions with string bodies (`AS $function$ … $function$`);
Postgres parses the body at *execution*, not at definition. So:

> `ALTER VIEW community_board_nsclc_v1 RENAME TO community_board_v1;` **succeeds silently.**
> Nothing errors. Then `community_ledger`, `ledger_meta`, `community_hcp_profile`,
> `community_practice_profile`, `get_community_filtered`, and both
> `get_community_filtered_count` overloads begin failing at call time with
> `relation "community_board_nsclc_v1" does not exist` — i.e. on the next page load, for
> every user, with no deploy-time signal.

**Rename-in-place is therefore off the table for both views.** Not because it is risky —
because it fails in the one way this whole exercise is trying to eliminate.

### B.2 Per object

| Object | Neutral name | Callers | Method |
|---|---|---|---|
| `community_board_nsclc_v1` | `community_board_v1` **+ `ta_id` column** | DB: 7 functions. Frontend: `lib/api.ts` ×2 `.from()`, `lib/home.ts` ×1. Scripts: `generate_cycle.py`, `narrative/generate_narratives_v2.py`, `narrative/sweep_stranded_narratives.py`, `score/community_scoring.py`, `social/extract_web_signals.py`, `ta_cycle.py`, `utilities/export_telescope_data.py` | New view; old name **kept as a shim view** `… as select * from community_board_v1 where ta_id = <nsclc uuid>`; migrate callers; drop shim |
| `hcp_nsclc_evidence_tier_v1` | `hcp_evidence_tier_v1` **+ `ta_id`** | DB: `community_board_v1`, `community_ledger`, `community_hcp_profile`. Frontend: `lib/communityProfile.ts` ×1 `.from()`. Scripts: `generate_cycle.py` | Same shim pattern. Content generalization is separate and blocked — §E |
| `get_nsclc_trials_surface()` | `trials_surface(p_ta_id uuid)` | `frontend/src/lib/trials.ts:290` only | New function; keep `get_nsclc_trials_surface()` as a one-line wrapper calling it with the NSCLC uuid; delete wrapper after the frontend cuts over |
| `p_ad_only` on `get_community_directory_filtered` / `_count` | `p_flagship_only`, or delete | `components/CommunityExplorer.tsx` | PostgREST binds by **argument name** — renaming the param breaks the caller at runtime, silently (the RPC 404s). Add the new name as a second overload, cut over, drop the old |
| `telescope_nsclc_*.json`, `telescope_ad_*.json` | `telescope/{slug}.{nodes,edges}.json`, loaded by slug | `TelescopeField.tsx:24-25, 227` | Frontend-only; replace the ternary with a map keyed on slug. Cheap, do it with the rest |
| `hcp_part_d_oncology_v1`, `part_d_oncology_drugs_v1` + 8 indexes | **Leave the names.** Rename only if §E moves them to a per-TA grain | `hcp_nsclc_evidence_tier_v1` | "Oncology" names the CMS Part D extract, not a TA. But the *grades* inside are lung-specific — that is a §E content problem wearing a naming costume. Fixing the name without fixing the content would be the worse outcome: a neutral-looking table that still only grades lung |

### B.3 The shim is not optional overhead

NSCLC is live and calling all of this right now. The shim view is what lets the DB change
and the frontend change be separate deploys. Without it the two must land in the same
instant, and Cloudflare auto-deploys `foundation-rebuild` — so they cannot.

Shim lifetime is bounded by the validator: an allowlist entry with an expiry date (§D),
not a TODO.

---

## C. THE PARAMETER

### C.1 `p_ta_id uuid`, required, no default — agreed, with one amendment

The instinct is right and the reason given is the correct reason: a `DEFAULT <nsclc uuid>`
reproduces exactly the silent-wrong being removed, and does it in the place hardest to see.

**Amendment: do not add the parameter to the existing signature. Give the function a new
name.** PostgREST resolves overloads by argument *names*, so
`established_ledger(p_limit, p_after_rank, p_states, p_countries)` and
`established_ledger(p_ta_id, p_limit, …)` coexist happily, and
`supabase.rpc("established_ledger", {p_limit: 50})` keeps resolving to the **old,
NSCLC-pinned one**. The frontend would look migrated and not be. Dropping the old signature
in the same transaction avoids that but forces the simultaneous deploy §B.3 rules out.

So: `board_established(p_ta_id uuid, …)`, `board_rising(…)`, `board_community(…)`,
`board_meta(p_ta_id uuid, p_cohort text)`. Old names survive as wrappers pinned to NSCLC
until the frontend cuts over, then get dropped. Same shape as the view shim, same expiry.

### C.2 uuid, not slug

Precedent in the codebase is already split — `get_*_filtered` take `p_ta_id uuid`;
`public_conversation`, `social_post_search`, `get_pulse_synthesis_facts` take `p_ta_slug text`.
Go with uuid for the boards:

- It is FK-checkable. A wrong uuid errors; a wrong slug returns empty, which is the failure
  mode this whole document is about.
- Slugs have already proven mutable here: the `nsclc` → `Lung Cancer` **name** change on
  2026-08-15 broke `community_ledger` (§A.4). The uuid did not move.
- The frontend already holds uuids: `TA_ID_MAP` in `lib/api.ts`, and `TAContext`'s
  `indicationTaId`.

The three `p_ta_slug` functions are the minority and are not on the demo path; converge
them in Phase 4, don't block on them.

### C.3 What the frontend passes, and where it gets it

The mechanism already exists and is already correct — it is simply not read.

`TAContext.deriveTAValue(parentSlug, indicationSlug)` (`lib/TAContext.tsx:65`) resolves
`indicationTaId` for **both** built TAs and is deliberately documented as the fix for the
"NSCLC-via-parent-slug / AD-via-indication asymmetry". `App.tsx:250` already feeds it into
the three cohort fetchers.

`CohortLedger` ignores all of it. It reads no TA on the data path: `LEDGER_TA_SLUG` is used
in exactly one place (the hero eyebrow, `:2238`), and its `stripRoute` is a hardcoded
literal `resolveFeedRoute({ta:"oncology", indication:"nsclc"})` at `:2018`. So the frontend
half of §C is:

1. `CohortLedger` derives its TA from the route/`TAContext` instead of the literal.
2. `loadLedgerPage` / `loadLedgerMeta` in `lib/cohortLedger.ts` grow a `taId` argument and
   pass `p_ta_id`.
3. The ledger needs a TA in its **URL** for this to survive a refresh —
   `/cohorts/ledger/:cohort` carries no TA today. Either `/cohorts/:ta/ledger/:cohort` or a
   `?ta=` param, matching what `InstitutionRoute` already does (`searchParams.get("ta")`).

Point 3 is the one piece of genuinely new design rather than plumbing, and it is worth
settling before Phase 2 rather than during.

### C.4 The two functions that cannot honestly take `p_ta_id`

`hcp_profile_spine(p_hcp_id)` and the rising-membership read behind `isOnRisingBoard` are
called from `/hcp/:id`, which **has no TA in the route at all**. Adding `p_ta_id` just moves
the hardcode into `ProfileDispatch.tsx`.

Two options; recommending the second:

- **(a)** Frontend resolves a TA first. `resolvePrimaryTaId(hcpId)` already exists in
  `lib/api.ts` (most publications wins). Costs a round-trip; picks one TA silently for a
  dual-TA HCP.
- **(b) Return the set.** `hcp_profile_spine(p_hcp_id)` returns rows of `(ta_id, spine)`
  rather than one verdict. `ProfileDispatch` picks — and can then *show* that the HCP is on
  the CRC established board and the lung community board, which is a real product answer to
  the `ProfileDispatch` cohort defect already logged. (b) is more work and is the only one
  that doesn't relocate the bug.

---

## D. THE VALIDATOR

### D.1 Where it runs

**Primary: a blocking preflight stage in `ta_cycle.py`. Secondary: a Claude Code
`PostToolUse` hook on SQL writes.** Not a test, not pre-commit — reasons below.

This repo has **no test suite, no `conftest.py`, no `pytest.ini`, no `.pre-commit-config.yaml`,
and no `.github/workflows`.** A rule whose enforcement requires first standing up CI is a
rule that will not exist when TA #4 arrives. The brief's own constraint — "it has to be
somewhere that actually runs" — selects against the conventional answers here.

`ta_cycle.py` is the right host on the merits, not just by elimination:

- It is **the thing you run for a new TA**. `--ta <slug>`, `--operation build`. TA #4's
  first act is a `ta_cycle --operation build` run. A preflight there is read by exactly the
  person who is about to create the next violation.
- It **already has the vocabulary**: numbered stages, fail-fast on non-zero exit,
  `OUTCOME_OK / SHORT / FAILED`, a `--dry-run` plan printer, `--stop-after`. A stage 0
  preflight needs no new machinery — it needs a `run_stage(0, "ta_neutrality", …)` call.
- It runs **against the live database**, which §A.4 proves is mandatory. `community_ledger`'s
  live body differs from its migration file; a repo-only linter would have passed it while
  the deployed function matched zero rows.

The hook is the fast-feedback half: catch it in the editor, hours before `ta_cycle` runs.
Per the known Windows constraint on this machine (no `pwsh`), it must be configured
**exec-form** — `command` + `args` calling `powershell.exe` — not `shell: powershell`.

Manual `--check-only` invocation covers the third case: reviewing a migration before applying it.

### D.2 The rules

One script, `scripts/utilities/validate_ta_neutrality.py`, read-only, exit 1 on any unexempted
violation. Rules 1–3 are the brief's; 4 and 5 come out of §A.

1. **No function body contains a TA slug literal.** Scan `pg_get_functiondef` over
   `public`, `prokind='f'`. Token list built **from `therapeutic_areas`** (slug, name,
   uppercased slug, uppercased name) — not a hand-maintained regex, so TA #4's own slug is
   covered the moment its row exists. Strip `--` comment lines before matching.
2. **No database object name contains a TA token.** `pg_class` (r/v/m/i/S) + `pg_proc` +
   `pg_type` + **argument names** (`pg_get_function_identity_arguments`) — `p_ad_only`
   only gets caught if arguments are scanned.
3. **Every TA-scoped function takes `p_ta_id`.** "TA-scoped" = body references
   `therapeutic_area`. Today: 38 scoped, 15 conforming, 23 not.
4. **No function reaches a TA through a TA-named object.** Catches
   `get_community_filtered` — takes `p_ta_id`, passes rules 1 and 3, and is NSCLC-locked
   anyway. Without this rule the validator would bless the exact defect that motivated it.
5. **TA text columns hold a canonical form.** For every relation in §A.1, every distinct
   value must equal a `therapeutic_areas.slug`. This is the only rule that finds
   `COLORECTAL-CANCER` / `NSCLC` / `Atopic Dermatitis` sitting in the same column family.

### D.3 The allowlist is part of the design

`scripts/utilities/ta_neutrality_allowlist.tsv` — one row per exemption:
`object · rule · reason · expires_on`.

- Archaeology (the 20 backups) — reason `archive`, no expiry, but **listed by name**. A
  wildcard on `%_backup` would hide the next real violation that happens to be named
  `_backup`.
- Migration shims (§B, §C) — reason `shim`, **with a date**. Past its expiry the validator
  flags it. This is what stops "temporary wrapper" from becoming permanent.
- `normalize_institution` — reason `false_positive` (the word `'hepatology'` in a specialty
  list).
- Genuinely per-TA content (§E) — reason `per_ta_content`, no expiry, and the entry names
  the config table that carries the per-TA rows. If that table doesn't exist yet, the entry
  can't be written, which is the point.

### D.4 What it flags today

MEASURED, not estimated — this is what `validate_ta_neutrality.py` printed against the live
catalog on 2026-08-30 with an empty allowlist. **96 findings** over 278 functions, 746
relations, 0 user types:

| Rule | Findings | Detail |
|---|---|---|
| 1 — slug literal in body | **28** sites across 15 functions | §A.3 table. Counted per literal, not per function: `established_ledger` alone has four |
| 1 — of which false positive | 2 | `normalize_institution` L23/L24 — one allowlist row covers both |
| 2 — TA-named object | **37** | 4 live load-bearing + 9 `part_d_oncology*` + 23 archive + `p_ad_only` on two overloads |
| 3 — TA-scoped, no `p_ta_id` | **22** of 38 scoped | 3 of the 22 take `p_ta_slug` (parameterised, wrong type); 1 is `merge_hcp_pair`, TA-agnostic by design |
| 4 — TA reached via TA-named object | **9** | 7 functions; `get_community_filtered_count` contributes two (both overloads) |

Allowlist reasons at seed: `debt` 58 · `archive` 23 · `per_ta_content` 9 ·
`slug_parameterised` 3 · `false_positive` 2 · `ta_agnostic` 1.

The first-draft estimate in this section was "roughly 55 live violations, 20 archive
exemptions". The real numbers are higher because the validator counts *sites* where the
draft counted objects, and because three archive objects were mis-filed as live. Rule 5
(non-canonical TA text, §A.1) is **specified but not implemented in Phase 0** — it needs a
per-column value scan rather than a catalog read, and it is the one rule that would report
against data rather than schema. It ships with Phase 4, where the fix lives.

---

## E. WHAT IS GENUINELY PER-TA

### E.1 The distinction

Three things get conflated:

1. **Object is TA-named, content is generic.** `get_nsclc_trials_surface` — a trials
   surface is a trials surface. Pure rename + parameter. No curation.
2. **Object is TA-named, content is TA-specific, structure is generic.**
   `hcp_nsclc_evidence_tier_v1`. Rename *and* move the content into data.
3. **Content is irreducibly per-TA.** The clinical curation itself. Never generalize —
   carry it as rows, curate per TA.

Only category 2 is interesting, and the evidence-tier view is the whole of it.

### E.2 What is actually NSCLC-specific inside `hcp_nsclc_evidence_tier_v1`

Read from the live view definition:

**Generic (the ladder's shape):** five tiers ordered
`anchored > supported > heme_dominant > candidate > unresolved`; a 1–5 `supported_rank`
ordering with a parallel label array; `recurrence_band` = `recurs` at ≥2 anchored years,
else `single_year`; the anchor-stem-of-record picked by most distinct years. None of that is
about lung.

**TA-specific (the content):**
- Part B HCPCS codes: `J9305`/`J9304` (pemetrexed) as supported-rank 1, `J9173` (durvalumab)
  as rank 2.
- `drug_group = 'lung'` and `drug_group = 'heme'` — the heme branch exists to *exclude*
  heme-dominant prescribers from a lung board.
- `anchor_grade ∈ {strict, dominant, cross_indication, supporting}` on
  `part_d_oncology_drugs_v1`, graded **relative to lung**: 14 strict stems (osimertinib,
  alectinib, sotorasib…), 1 dominant (crizotinib), 2 cross-indication (adagrasib,
  erlotinib), 4 supporting. The other 47 stems in that table — `breast`, `prostate`,
  `gi_renal`, `heme` — carry **no `anchor_grade` at all**, because grade is meaningless
  without a TA to grade against.
- Thresholds: `oral_floor = 24` 30-day fills; `lung_share ≥ 0.30`.

That last bullet is the proof that renaming the table is not enough.
`part_d_oncology_drugs_v1` looks TA-neutral in its *rows* (`gi_renal` includes regorafenib
and trifluridine — both CRC drugs) and is TA-locked in its *grades* (`anchor_grade` is
NULL for every one of them). A CRC evidence tier needs regorafenib graded `strict` **for
CRC** while it stays ungraded for lung. Same drug, same row today, two different grades
needed.

### E.3 How the neutral version carries per-TA content

**Do not invent a mechanism. This repo already has the right one, twice.**

- `ta_drug_keywords` — `therapeutic_area_id` + per-TA rows + `is_primary_signal` +
  `market_position`, `expected_recipient_profile`, `notes`. The CRC seed
  (`migrations/2026_08_28_seed_ta_drug_keywords_crc.sql`, 29 rows) is a model of the form:
  the clinical reasoning, the exclusions, and the traps all live in the migration next to
  the rows.
- `therapeutic_area_ingestion_config` — `therapeutic_area_id` + per-TA scalar/array config
  (`pubmed_query`, `nppes_taxonomy_codes`, `ctgov_condition_filters`, `scoring_weights`,
  `is_active`, `is_visible_in_ui`).

So the answer to "a `ta_id` column, a config table, or per-TA rows" is **all three, matched
to the grain of the thing**:

| Content | Mechanism | Grain |
|---|---|---|
| Drug → grade mapping | **per-TA rows.** `part_d_oncology_drugs_v1` gains `therapeutic_area_id`; PK becomes `(ta_id, drug_stem, valid_from_year)`. Regorafenib gets a lung row (ungraded) and a CRC row (`strict`) | one row per (TA, drug, year-range) |
| Part B anchor codes | **config table.** New `ta_evidence_tier_config`: `ta_id`, `partb_anchor_codes text[]`, `partb_supporting_codes text[]`, `oral_floor numeric`, `share_floor numeric`, `exclusion_group text` | one row per TA |
| Which group is the "wrong specialty" exclusion | same config row — `exclusion_group` generalizes the hardcoded `heme` branch | one row per TA |
| The view itself | **`ta_id` column.** `hcp_evidence_tier_v1` joins config + graded drugs, emits `ta_id` alongside `hcp_id` | one row per (HCP, TA) |

`drug_group` then stops meaning "lung/heme/breast" and means "the group this drug belongs
to *for this TA*", with the exclusion group named in config rather than in the view body.

**What is blocked on clinical curation, precisely:** the CRC rows for
`part_d_oncology_drugs_v1` (which stems are `strict` / `dominant` / `cross_indication` /
`supporting` for colorectal), the CRC row for `ta_evidence_tier_config` (which HCPCS codes
are the CRC anchors — the bevacizumab/Zaltrap Part B space, with the ophthalmology trap the
CRC keyword seed already documents), and the two thresholds. That is a curation task of the
same shape and roughly the same size as the `ta_drug_keywords` CRC seed already completed —
not a code task.

### E.4 One thing that should stay hardcoded

`therapeutic_areas` itself, and the `live_therapeutic_areas` view. Those *are* the registry.
The validator must exempt them or it will flag the definition of TA-ness as a TA violation.

---

## F. SEQUENCING

Ordering constraint throughout: **NSCLC is live and every step must be additive.** The only
destructive steps are the shim drops, and they come last, after the callers have moved.

**Phase 0 — validator, observe-only. SHIPPED 2026-08-30. No clinical input.**
`scripts/utilities/validate_ta_neutrality.py` + `ta_neutrality_allowlist.tsv`, wired as
`ta_cycle` stage 0 in **observe mode** (`TA_NEUTRALITY_STRICT = False`; flip the constant
when Phase 3 clears). Rules 1–4 implemented; rule 5 deferred to Phase 4 with its fix. The
allowlist is seeded with all 96 findings, so NEW starts at 0 and KNOWN can only go down.
The `PostToolUse` hook is NOT built — stage 0 was the half that had to exist first.

**Phase 1 — parameterize the pure-lookup functions. Ships today. No clinical input.**
The 11 functions whose TA is only a `therapeutic_areas` lookup: `established_ledger`,
`rising_ledger`, `ledger_meta`, `rising_board`, `hcp_profile_brief`, `hcp_rising_profile`,
`hcp_administered_therapy`, `hcp_belief_claims`, `asset_overview`, `asset_authors`,
`asset_index_meta`. New names taking `p_ta_id uuid` required; old names retained as
NSCLC-pinned wrappers with a dated allowlist entry. **NSCLC cannot break** — the wrapper
passes the same uuid the CTE resolved.

Deliberately excluded from Phase 1: the four community functions
(`community_ledger`, `community_hcp_profile`, `community_practice_profile`,
`get_community_filtered*`), because they reach their TA through the evidence-tier view and
are blocked behind Phase 3; and `hcp_profile_spine`, pending the §C.4 decision.

**Phase 2 — frontend passes the TA. Ships today. Depends on Phase 1.**
`CohortLedger` reads `TAContext` instead of its literal `stripRoute`; `lib/cohortLedger.ts`
threads `taId`; the ledger route grows a TA segment (§C.3, point 3 — decide before starting).
Cut the four `.from()` sites and `trials.ts` over to the neutral objects. **At the end of
Phase 2 the ledger renders any TA that has board rows** — which is Established and Rising for
CRC, and not Community.

**Phase 3 — evidence tier. BLOCKED on your clinical curation.**
`ta_evidence_tier_config` + `therapeutic_area_id` on `part_d_oncology_drugs_v1` +
`hcp_evidence_tier_v1` + `community_board_v1`, then the four community functions. The code
side can be written and tested against NSCLC-only content while the CRC rows are being
curated — the schema work is not blocked, only the CRC *content* is. Community CRC does not
render before this lands.

**Phase 4 — the text-column convention. Independent of 1–3; largest silent-wrong reservoir.**
Pick one form (recommend: `therapeutic_area_id uuid` FK, with slug as a view-level
convenience), migrate the 19 relations, backfill the three casings. Do this **after** Phase 2
so the boards are already TA-aware and the backfill can be verified against a working
multi-TA surface rather than in the abstract.

**Phase 5 — drop the shims, flip the validator to blocking.**
Wrappers and shim views go when their allowlist expiry passes and no caller remains. The
validator moves from warn to fail. From here, TA #4 hits a red stage 0 rather than a wall.

**Not sequenced, do whenever:** `telescope_*.json` by slug, `p_ad_only` rename. Both are
small, isolated, and block nothing.

### Honest summary of what this costs

Phases 0–2 are a few days and unblock CRC Established + Rising end to end. Phase 3 is the
real one, and its critical path is your clinical curation, not code. Phase 4 is the largest
mechanical change and the one most likely to surface further defects — it should be sized
separately once Phase 2 has proved the pattern.
