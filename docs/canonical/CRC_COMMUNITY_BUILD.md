# CRC Community Build — sequenced spec

**TA:** Colorectal Cancer · slug `colorectal-cancer` · **Branch:** foundation-rebuild
**Written:** 2026-09-03. **Revised the same day** after Instance B's provenance report falsified the
first version's premise — see "WHY NPI COVERAGE IS 1.3% — CORRECTED".
**Status:** measured, ordered, blocked on founder input #1.

## Where this sits in the document set

This document does not re-derive anything already decided elsewhere. It exists because the
four documents below each hold one piece of the CRC Community problem and none of them holds
the ordering, which turns out to be the whole difficulty.

| document | what it owns | what this doc takes from it |
|---|---|---|
| `TA_NEW_PLAYBOOK.md` | The canonical TA build process. §7 Frontend Repoint, §9 the parity matrix. NSCLC is the frozen reference TA and the regression oracle. | The parent process. CRC Community is a Part II parity gap, not a new pipeline. |
| `TA_NEUTRAL_DB_LAYER.md` | §B THE RENAME — `community_board_nsclc_v1` → `community_board_v1` + `ta_id`, with the shim view, and the full caller inventory (7 DB functions, `lib/api.ts` ×2, `lib/home.ts`, 7 scripts). §C THE PARAMETER — `p_ta_id uuid`, required, no default. | The entire de-NSCLC-ing design. **Do not redesign it here.** This build is its first consumer. |
| `TA_GENERALIZATION_INVENTORY.md` | The hard-coded NSCLC UUID in all four `get_community_filtered`/`_count` overloads, catalogued as **W3**. | The defect register entry. This build closes W3. |
| `COMMUNITY_ROSTER_BUILD.md` | Community is a **tiered roster, not a ranked leaderboard** — no composite score, no rank. Missing modality = UNKNOWN, never zero. | The semantics of what a CRC board must be. A CRC board must be born as a roster; it must never pass through a ranked phase. |
| `CRC_VALIDATION_ANCHORS.md` | Pre-registered CRC expectations, written 2026-08-24 before ingestion. | The acceptance test. Do not edit it to match what this build produces. |

Companion state: `claude/state-provenance-defect-2026-09-02.md` (project docs) — the repair that
lifted the hard stop this build depends on.

---

## THE MEASUREMENT (2026-09-03, live)

| | colorectal-cancer | nsclc |
|---|---|---|
| HCPs assigned to TA | 106,551 | 86,436 |
| **with an NPI** | **1,415 (1.3%)** | **9,849 (11.4%)** |
| already in `hcp_part_d_oncology_v1` | 238 | 4,838 |
| rows in `ta_hcpcs_codes` | 0 | 49 |
| rows in `hcp_medicare_by_ta_v2` | 0 | 4,413 |
| live community board | none | 4,913 |

**Read the second row.** Community membership is entirely Medicare-derived and Medicare is keyed
on NPI. NSCLC converts 9,849 NPIs into a 4,913-member board — roughly half. At the same ratio
CRC's ceiling today is about **700 people out of 106,551**.

So the binding constraint is not the board view, not the tier view, not the HCPCS code set. It is
**NPI coverage**, and everything else is downstream of it. A perfect build on 1,415 NPIs produces
a board that is technically correct and substantively empty — which, by this platform's own
standards, is worse than the honest greyed-out tab shipping today.

---

## WHY NPI COVERAGE IS 1.3% — CORRECTED 2026-09-03

**The first version of this document was wrong about this, and the error is worth keeping.**
It said the blocker was that `nppes_matcher.py` had never run for colorectal, and specified two
phases of matcher work. That was inferred from the script's name. It is not what happened.

**`nppes_matcher.py` has never written an NPI to anyone, for any therapeutic area.**
`npi_match_proposals` holds 20,225 rows and nothing in `scripts/` applies them;
`npi_match_proposals_v2`, the table that has an `applied_at` column, is empty. The matcher
produces proposals that no code consumes.

### Where NSCLC's 9,849 NPIs actually came from

`npi_source` cannot answer this — 9,845 of 9,845 read `'script'`. Reconciled instead against
`nppes_enrichment_log_v2` (11,451 rows, carries `match_reason`) and against each writer:

| writer | NSCLC NPI holders | evidence |
|---|---|---|
| `ingest/nppes_workstream_b_ingest.py` | 6,702 | no log row; 6,432 have zero career pubs; 6,563 have an `hcp_nppes_detail_v2` row; 4,262 sit in `hcp_part_d_oncology_v1` |
| `enrich/targeted_nppes_enrichment.py` | 3,095 | `match_reason` = "Applied targeted publication-source-to-NPPES enrichment update" |
| logged "multiple plausible matches; skipped" but holds an NPI | 118 | arrived by another path after the skip |
| duplicate-NPI conflicts | ~29 | one log row each |
| `enrich/established_npi_resolver.py` | 0 | writes `npi_source='human'`; no NSCLC row carries it |
| `enrich/nppes_matcher.py` | **0** | — |

By cohort:

| cohort | with NPI | NPPES-native (workstream B) | name-matched |
|---|---|---|---|
| community | 7,694 | **6,553 (85%)** | 1,141 |
| established | 1,610 | 137 | 1,473 |
| rising_eligible | 528 | 12 | 516 |

**Community NPI coverage was never a matching achievement.** Matching built the *established*
cohort. Community is 85% NPPES-native records minted straight from the registry.

### The actual blocker is one line of config

`nppes_workstream_b_ingest.py` is cleanly TA-parameterised — `:289` loops `list_ta_configs()`,
`:291-292` reads `cfg["nppes"]["taxonomies"]`, `:293-294` skips any TA with an empty list. No
NSCLC literal anywhere in the file. Unlike **W3**, there is nothing to de-pin.

It keys on **NPPES taxonomy codes and nothing else**. No practice state, no surname blocking, no
publication record. It does not match people; it creates them from the registry.

```
nsclc              "taxonomies": ["207RX0202X"]        Medical Oncology
colorectal-cancer  "taxonomies": []                     "UNSET - no taxonomy codes selected yet"
```

That empty array is the whole reason CRC community NPI coverage is 1.3%.

### The state-provenance work was not the lever, and is not wasted

The blocking-key change (three-column block key, per-candidate `block_basis`, confirmation gate,
persisted `match_basis`) is correct and sits uncommitted in the working tree. Its dry run
confirmed the ceiling: `institution_state` reaches 854 of 51,666 CRC HCPs (1.65%), 869 carry any
block key, 18 confirm, and 50,797 never reach the matcher for want of any state at all. Keep the
change; it makes the matcher honest for whenever something consumes its proposals. It is not the
route to CRC coverage.

---

## THE CLAIM PROBLEM — READ BEFORE CHOOSING A TAXONOMY SET

A row in `hcp_therapeutic_areas_v2` is a claim: *this physician is a colorectal cancer HCP.*
Populating it from a taxonomy code asserts disease-area membership from a specialty code, with no
colorectal publication, no colorectal claim and no colorectal drug behind it.

That is the same defect shape as `nppes_practice_state` (asserted NPPES provenance it did not
have), `themes_tag` (asserted a TA the themes were not scoped to), and `BLOCK_TA_SLUG` (asserted a
physician's TA from a drug's label) — at three orders of magnitude more rows.

**It also reframes NSCLC.** 6,553 of community's 7,694 NPI holders have zero career publications
and were minted from a single taxonomy code. The NSCLC community board already *is* "US medical
oncologists who prescribe." That may be defensible — community is about practice reach, not
scientific output, and the evidence tier is what discriminates — but nobody wrote it down as the
definition, and it should be written down before it is replicated at 42,227.

**The question is therefore not "which codes."** It is: *is the CRC community cohort the people
who **treat** colorectal cancer, or the people who **could**?* NSCLC answered "could" implicitly,
with one code, and nobody noticed. Answer it explicitly for CRC and the code list falls out of the
answer.

### The pool, measured

42,227 NPPES individuals across the core six; 29,317 already exist in `hcps_v2`, 12,910 would be
new. Only 619 are linked to colorectal today; 7,658 are linked to nsclc.

| code | specialty | NPPES | already HCPs | new | note |
|---|---|---|---|---|---|
| `207RG0100X` | Gastroenterology | 21,325 | 21,315 | 10 | **half the pool, weakest claim** — mostly screening colonoscopy, not treatment |
| `207RX0202X` | Medical Oncology | 7,233 | 7,231 | 2 | NSCLC's only code |
| `2085R0001X` | Radiation Oncology | 6,991 | 520 | 6,471 | large new population, same question as gastro |
| `207RH0000X` | Hematology & Oncology | 2,897 | 1,490 | 1,407 | defensible |
| `208C00000X` | Colon & Rectal Surgery | 2,703 | 36 | 2,667 | the most specific code in the set |
| `2086X0206X` | Surgical Oncology | 2,584 | 195 | 2,389 | defensible |
| `208600000X` | Surgery, general | 43,724 | 819 | 42,905 | **excluded. Largest and weakest — hernia, trauma, breast, endocrine.** |

`208600000X` also does not belong in the matcher's *confirming* taxonomy set. It confirms
"surgeon," not "treats colorectal cancer," and on an institution-blocked candidate that is two
weak signals rather than one strong one. It may serve candidate generation, or confirm in
combination with a second independent signal (institution agreement, or a CRC publication already
in the corpus) — never alone.

---

## BUILD ORDER — REVISED 2026-09-03

### Phase 1 — Fix `nppes_workstream_b_ingest.py:356-358` (gates everything)

The script treats "this NPI already has an HCP record" as "nothing to do," so it never adds a TA
link to an existing record. That defect is invisible on the first TA and fatal on every one after,
and it is the only reason a hand-written backfill looks necessary.

**Fix the skip; do not route around it.** A manual `INSERT…SELECT` into
`hcp_therapeutic_areas_v2` is a second, unlogged path into the same table, and in six months
nobody will be able to tell which rows came from where. Fixed, the script does the whole job
through **one control point** (`taxonomies` in the TA config) with **one provenance trail**
(`nppes_enrichment_log_v2`).

Same argument as the registry column beating the computed key.

### Phase 2 — Provenance on the TA link

`hcp_therapeutic_areas_v2` must record **how** a link was derived — publication-derived versus
taxonomy-derived. Without it the CRC TA population becomes overwhelmingly taxonomy-asserted and
nothing downstream, boards included, can tell the difference.

This is `institution_state_source` again, for the same reason, and it must land **before** the
first taxonomy-derived link is written, not after.

### Phase 3 — Set the CRC taxonomy set and run workstream B

Founder input #6 below. Run after phases 1 and 2, `--dry-run` first.

Expect ~842 of the stateless population (13.8%) to share first+last with a core-6 NPPES record;
workstream B does not identity-hash the NPPES side, so it will mint roughly that many new split
identities on top of the ~3,177 already on the books. Budget for that, or fix the hashing first.

### Phase 4 — Medicare inputs

Two independent arms of `qualifies`. Do both; neither alone is sufficient.

**4a. Part D vocabulary.** `part_d_oncology_drugs_v1` already carries **regorafenib** and
**trifluridine** in `gi_renal`. Confirmed from both sides: of the 29,317 existing core-6 NPI
holders, 4,825 are in Part D oncology, 1,629 on `gi_renal`, and 260 on regorafenib/trifluridine —
which is the 238 already visible. Missing: **capecitabine** (the most-prescribed colorectal oral
there is, and the drug that actually moves this number), **encorafenib**, **fruquintinib**.
`sotorasib` and `adagrasib` sit in `lung` and are shared KRAS G12C agents.

> **Capecitabine needs a grade, not an anchor.** It spans colorectal and breast. Under the
> `hcp_nsclc_evidence_tier_v1` scheme `anchor_grade = 'strict'` means indication-specific; a
> cross-indication drug graded strict would anchor breast prescribers onto a CRC board. Grade it
> `dominant` or `cross_indication` and let the tier logic weight it. **Founder input.**

**4b. HCPCS code set.** `ta_hcpcs_codes` has 0 CRC rows, so `hcp_medicare_by_ta_v2` has 0 and
`patient_volume` is 0 for every CRC HCP. Feeds `medicare_aggregator.py:197`.

### Phase 5 — The code objects (only now)

Unchanged from the first version of this document. Execute against `TA_NEUTRAL_DB_LAYER.md` §B
and §C; this build is that design's first consumer.

1. `community_board_nsclc_v1` → `community_board_v1` + `ta_id`, with the shim view (§B.2, §B.3).
2. `hcp_nsclc_evidence_tier_v1` → a TA-parameterised tier view. **The tier vocabulary is per-TA
   and is the real work**: NSCLC's tiers are defined by pemetrexed `J9305`/`J9304`, durvalumab
   `J9173`, and lung-only oral anchors.
3. Remove the `p_ta_id = 'c0065b03-…'` literal from all four `get_community_filtered` /
   `get_community_filtered_count` overloads — closes **W3**. The literal survived the 2026-09-02
   filtered-family rewrite (`docs/state_provenance/04_filtered_family.sql:73`); a rewrite is not
   a de-pin.
4. `heme_dominant` is an NSCLC tier concept and does not transfer. Decide the CRC fifth tier.

**Grants do not survive a DROP.** Every function dropped must have `anon`, `authenticated`,
`service_role` re-granted in the same file, with a before/after grant check. A lost grant on
`get_community_filtered` renders as an empty Community tab, not as an error. Pattern:
`docs/state_provenance/08_grant_check_AFTER.sql`.

### Phase 6 — Verification

- `CRC_VALIDATION_ANCHORS.md` is the acceptance test. Record outcomes in its results section;
  do not edit its expectations.
- The board is a **roster**, per `COMMUNITY_ROSTER_BUILD.md`: no rank, no composite score.
- NSCLC is the regression oracle: its board must still return 4,913, byte-for-byte.
- **A TA link is not board membership.** Phases 1–3 build the population; phase 4 decides who
  qualifies. Report both numbers separately and never let the population number stand in for the
  board.
- Every empty modality must say which absence it is.

## PROVENANCE OF EVERY TA LINK — MEASURED 2026-09-03

`hcp_therapeutic_areas_v2.source` added, backfilled read-only, not yet applied.
Two values, because there are exactly two writers of that table:
`ta_tagging_rebuild_v2.py` (publication concepts) and `nppes_workstream_b_ingest.py`
(NPPES taxonomy). A third value would be wider than the evidence.

| | rows | share |
|---|---|---|
| `publication` | 343,925 | 87.7% |
| `nppes_taxonomy` | 40,119 | 10.2% |
| NULL — could not determine | 8,320 | 2.1% |
| **total** | **392,364** | |

| TA | links | publication | nppes_taxonomy | unknown |
|---|---|---|---|---|
| hepatology | 170,189 | 149,586 | 20,393 | 210 |
| colorectal-cancer | 106,551 | 106,550 | 0 | 1 |
| nsclc | 86,436 | 75,882 | 6,432 | 4,122 |
| atopic-dermatitis | 15,846 | 11,907 | 0 | 3,939 |
| rare-disease | 13,342 | **0** | 13,294 | 48 |

**Three findings here matter more than the backfill itself.**

**`rare-disease` has zero publication-derived links.** Its entire 13,342-link population is a
specialty-code assertion with no publication evidence behind any of it. If that TA is ever taken
live, that is where it starts.

**`nsclc` carries 4,122 links of undeterminable basis — 4.8% of the reference TA.** NSCLC is the
regression oracle and the parity template for every subsequent build. One link in twenty in it has
unknown provenance.

**The `nppes_taxonomy` backfill is an elimination, not a record.** Workstream B left no log, so the
value was written only where the elimination is airtight: has an NPI, zero corpus publications,
zero career pubs — unreachable by the publication-concept writer, leaving one candidate. It agrees
with the writer-side count of 6,432 for nsclc. Two independent derivations agreeing is what makes
the rest credible.

The 8,320 NULLs stay NULL. 8,219 are HCPs with publications, none tagged to this TA — could be a
taxonomy assertion onto a publishing physician, or a publication tag rewritten since (three backup
tables in this schema are evidence that re-tagging happens). 85 have no publications and no NPI.
16 have `total_career_pubs > 0` but no `publication_authors_v2` rows. **NULL means unknown. It is
never a default and never written deliberately.**

### The constraint

```sql
ALTER TABLE public.hcp_therapeutic_areas_v2
  ADD CONSTRAINT hcp_ta_v2_source_known_value_or_unknown
  CHECK (source IS NULL OR source IN ('publication', 'nppes_taxonomy'));
```

Not `NOT VALID`, and it does not need to be: the column is added in the same transaction and
starts entirely NULL, so all 392,364 rows satisfy it at creation. It validates immediately and is
enforced from that moment, with **no grandfathered cohort left to detonate on a later UPDATE** —
which is exactly what `nppes_state_implies_npi` did to the city clear on 2026-09-02
(`docs/state_provenance/13b_clear_city.sql`, resolved in `18_replace_constraint.sql`).

`source IS NULL OR …` is the load-bearing clause. It makes the 8,320 undetermined rows legal
rather than violations.

The constraint was renamed from `hcp_ta_v2_source_vocab`, which read as "this column holds a value
from the vocabulary" — overstating what it checks. The name now states the true, weaker rule.
Same discipline as `nppes_state_has_nppes_provenance`.

## THE AD LANDMINE — DEFUSED, RECORDED

`nppes_workstream_b_ingest.py` had **no TA selector**. It processed the union of every TA config
with a non-empty `taxonomies` list. Running it for colorectal today would also have created
**17,296 Atopic Dermatitis records** — a deprioritised TA whose 15,846 links came from a different
script entirely (`ingest_community_dermatologists.py`), arriving unannounced under a run nobody
asked for.

`--ta` is now required, has no default, and takes exactly one TA per run, resolved before the
parquet load so a bad invocation fails in under a second. A CRC run cannot reach AD. Missing flag,
unknown slug, and empty-taxonomies all fail with a message naming what is wrong; the
empty-taxonomies message points at founder inputs #1 and #2 in this document and refuses to guess.

Verified: the NSCLC control re-run under `--ta nsclc` returns byte-identical numbers to the union
run (7,233 matching, 2 new records, 104 TA links) with Atopic Dermatitis absent. The flag scopes
the work without changing the answer.

**The general lesson for `TA_NEW_PLAYBOOK.md`:** a pipeline script that loops every configured TA
is a landmine the moment a second TA exists. One TA per run, named explicitly, no default.

### About those 104

104 existing NSCLC HCPs lack an nsclc link and would gain one. **103 of them have publications** —
so their corpus record did not place them in NSCLC, and a taxonomy code would. That is founder
input #1 in miniature: *treat* versus *could*. With `--ta` in place they are written only if
someone deliberately runs nsclc, so nothing forces that decision now.

## THE ENRICHMENT WEEK — 2026-09-08. How the rules were derived.

The first live enrichment run for CRC. Read this for the reasoning; the numbers are
CRC's and will not transfer, but every rule below was derived from a measurement and
each would have to be re-derived to be safely changed.

**Outcome.** 969 candidates at a floor of 25 → 244 written, 130 ambiguous, 515 no-match,
61 duplicate-NPI, 19 gate-held. **34 of the 244 were then reverted, then 10 more.** Live:
**200 writes**, taking CRC from 1,415 NPIs to **1,615 of 106,551 (1.52%)**. Against
NSCLC's 11.4% that is a rounding error, and it confirms the provenance finding: enrichment
is the precision path, not the volume path. Volume needs workstream B.

**Three revert tranches, three different failures.** `docs/npi_enrichment/01`, `02`, `04`.

| tranche | n | what fired |
|---|---|---|
| 1 | 17 | The candidate filter trusted `hcps_v2.country`. It said US for physicians at Wuhan, Harbin, Changchun, Shaanxi and Western University. |
| 2 | 17 | The matched NPPES taxonomy was implausible for CRC — Community Health Worker, Speech-Language Pathologist, Dentist, and four registered as "Student in an Organized Health Care Education Program". The taxonomy is evidence we matched a **different human**. |
| 3 | 10 | Live only because they predated the surname gate. Under the rules as they now stand they would not have been written; a write today's rules forbid should not survive on its timestamp. Several are probably correct and all are restorable. |

Two of an original 19 in tranche 1 were **not** reverted: a regex without word boundaries
matched `western university` inside "Northwestern University" and `india` inside
"Indiana". Both were US physicians. The classifier that finds a defect can be the defect.

**The invariant now holding, and worth re-checking after any future run:** every live
written NPI either carries an independent confirming signal (130) or sits below the
surname threshold on a rare name (70). Zero satisfy neither.

### Two config keys, because one list was doing two jobs

`nppes.taxonomies` was split into `population_taxonomies` and `confirming_taxonomies`
(`scripts/utils/ta_nppes_config.py`, one implementation, read by the matcher, the enricher
and workstream B). **This is the transferable lesson.**

- **Population** — who counts as a member of the TA. Workstream B *creates* a record per
  matching NPPES individual, so narrow is correct and breadth is catastrophic:
  `208600000X` "Surgery" admits 42,905 people and would define colorectal cancer as
  "surgery".
- **Confirming** — what corroborates a name match that already exists. It *admits nobody*.
  Narrow is therefore wrong, and the cost is invisible: a six-code list held 26 correct-
  looking writes, including MSK, Cornell, Fox Chase and Stanford colorectal surgeons,
  because their NPPES code was `208600000X`.

The same code belongs on one list and not the other. Specifying one number for both is
what produced the error. Codes proposed but not accepted live in
`confirming_taxonomies_candidates` with the argument for and against recorded — JSON has
no comments, so a held candidate is a data row a reviewer can read, not a bare code.

### The surname finding: the cliff is at 10, not 1,000

Ambiguity rate by surname block — of attempts where NPPES returned something verifiable,
how often it returned *several*:

| block | <10 | 10–99 | 100–299 | 300–999 | 1,000–1,999 | ≥2,000 |
|---|---|---|---|---|---|---|
| % ambiguous | **12.9** | **57.1** | 66.7 | 58.8 | 57.1 | 69.2 |

One step, 4.4×, between <10 and 10–99; a plateau above it. The intuitive threshold of
1,000 sits in the middle of the plateau and separates almost nothing. **A round number
would have been wrong and would have looked reasonable.**

It **gates, it does not reject**: above the threshold a match needs a confirming signal.
Rejecting outright would have discarded 43 of 55, and inspection showed most were correct
people failing only because the confirmer list was too narrow. Reads
`hcp_surname_block_v1`; the enricher refuses to run the gate if the view is missing rather
than silently treating every surname as rare.

### `hcp_country_disagreement_v1` — record the contradiction, do not resolve it

4,050 HCPs (1,299 CRC-linked, **9.0% of the US-flagged CRC population**) say `country='US'`
while their resolved institution country or `current_country` says otherwise. The filter
now skips them — resolved non-US disqualifies, **unresolved does not**, because treating
unknown as non-US is the same error facing the other way.

They are also written down, with both sides stored and neither declared correct. If the
filter had simply absorbed the contradiction, the next consumer of `hcps_v2.country` would
inherit the identical bug, invisibly, because the one process that noticed had quietly
routed around it. Same principle as `institution_state_source` and
`hcp_therapeutic_areas_v2.source`: the provenance travels as data.

---

## THE CRC EVIDENCE MODEL — 2026-09-09, clinical advisor, second pass

**Not built. This is the design and the reasoning behind it.** The tier view is designed
after workstream B: with 3 bevacizumab providers in our data, no composite below is
measurable.

### Why lung's approach does not transfer

NSCLC's evidence tiers work at **molecule level**. Pemetrexed `J9305`, durvalumab
`J9173`, and the lung-only oral anchors are indication-specific enough that one code
implies the disease. That is a property of lung's drug vocabulary, not a property of the
method.

Colorectal has no such molecule available in the data:

- `J9303` panitumumab, `J9055` cetuximab and `J9400` ziv-aflibercept — the three codes
  that would carry a `strict` tier — have **zero rows in the CMS Physician & Other
  Practitioners by-Provider-and-Service file for 2021, 2022 and 2023**. Verified against
  the source parquets before any join, and re-validated against the raw CSV (J9303 0 rows,
  J9055 0, J9400 0, against J9035 1,854 and J9263 516 in the same file).
- Fruquintinib, the only `strict` Part D oral, was approved 2023-11-08 — seven weeks of
  the latest year we hold.
- Everything else colorectal touches — oxaliplatin, irinotecan, 5-FU, leucovorin,
  bevacizumab, capecitabine — is cross-indication by itself.

**So colorectal requires pattern-level specificity where lung got molecule-level.** No
single CRC code is diagnostic; a *combination* of them, on one provider in one year, is.
That is the whole design, and it is why the NSCLC view cannot simply be parameterised —
it has no concept of co-occurrence.

### PRACTICE fingerprint, not regimen fingerprint

**The terminology matters and the earlier drafts got it wrong.** We have no patient-level
linkage. Every claims table we hold is aggregated to provider × code × year. When
oxaliplatin, 5-FU and leucovorin all appear under one NPI in one year, that means *this
provider administered all three during that year*. It does **not** mean any patient
received them together, and FOLFOX is a statement about a patient.

Call it a **practice fingerprint**: evidence about what a practice does, not what a
regimen was. The distinction is load-bearing in two directions —

- it is **weaker** than a regimen claim, so nothing downstream may say "this HCP gives
  FOLFOX"; and
- it is **sufficient** for our actual question, which is whether this provider treats
  colorectal cancer, not which protocol they used.

Getting this wrong would put an unsupported clinical claim on a named physician's
profile — the same defect class as `nppes_practice_state`, `themes_tag`, and every other
column in this system that asserted more than its evidence.

### Suppression is evidence, not just loss

CMS redacts any provider × HCPCS × place-of-service row with fewer than 11 distinct
beneficiaries. That erases the tail — but it also means **every row that survives
represents ≥11 distinct beneficiaries**.

So a provider showing three or four surviving oncology signals in a single NPI-year is
not a coincidence of small numbers. It is ≥11 beneficiaries on each, independently. The
redaction that costs us coverage is the same mechanism that makes the surviving pattern
strong. **Multiple surviving signals in one NPI-year is a treatment footprint.**

### The composite anchors

**Anchor A — oxaliplatin backbone**
Medical Oncology or Hematology/Oncology taxonomy, plus the bevacizumab family
(`J9035`, `Q5107`, `Q5118`, `Q5126`, `Q5129`), plus oxaliplatin `J9263`, plus 5-FU
`J9190` — preferably with `96416` (prolonged chemotherapy infusion pump) or leucovorin
`J0640`.

**Anchor B — irinotecan backbone**
The same, with irinotecan `J9206` in place of oxaliplatin.

**PLACEHOLDER — the relative weight of Anchor B is not currently established. Do not
cite a ratio from this document until this section is rewritten.**

A version of this section claimed B was a markedly weaker tier: half A's size, "loses
two-thirds of its members to the persistence test where A loses a third", and losing 22%
to the taxonomy gate against A's 14%. **Those numbers were computed on a broken gate and
are withdrawn.**

The fault: `nppes_workstream_b_ingest.py` selected 19,043 records on NPPES taxonomy and
never persisted the taxonomy, so `hcps_v2.npi_taxonomy` was NULL on every one and the
gate silently excluded the entire registry-derived population. Fixed 2026-09-09 (producer
+ 19,043-row backfill).

**What the corrected figures show is a much smaller gap than the withdrawn claim.** On the
first read against parquet-derived taxonomy, B was 58% of A rather than 50%, and the
persistence ratios were 23% against 25% — nearly identical, not two-thirds against a
third. The taxonomy-gate-cost asymmetry came from the same distorted comparison and is
withdrawn with the rest.

There may still be a real difference — B remains smaller in absolute terms and sits
closer to the FOLFIRINOX boundary, where irinotecan + 5-FU without a platinum is
pancreatic vocabulary, which is a clinical argument independent of any measurement. But
that is a hypothesis now, not a finding. Rewrite this against the fixed gate, and state
plainly which claims are clinical reasoning and which are measured.

**Why the VEGF component is load-bearing, and must not be dropped for coverage.**
Oxaliplatin + irinotecan + 5-FU + pump, *without* bevacizumab, is the FOLFIRINOX
vocabulary — and FOLFIRINOX is pancreatic. Drop the VEGF requirement to catch more
people and the pattern stops being colorectal-heavy and starts pulling pancreatic
oncology. Bevacizumab is what makes the combination lean CRC. It is the discriminating
element, not a bonus one.

### Cross-channel corroboration

Part B and Part D are independent observation channels. An HCP with **Lonsurf
(trifluridine), regorafenib or capecitabine in Part D** *and* a coherent Part B footprint
is far better evidenced than one with either alone — the two channels can fail
independently, so agreement between them is not double-counting.

This is also the only route that survives our Part B coverage problem, since Part D
prescriber data has no site-of-care gap.

### Cross-year persistence is its own dimension

Not a tie-breaker. A pattern appearing in two separate years is stronger than the same
pattern in one, because year is an independent trial. The advisor's ladder:

| evidence | tier |
|---|---|
| supported pattern in 1 year | **supported** |
| supported pattern in ≥2 years | **strong supported** |
| composite anchor in ≥1 year | **anchored** |
| composite anchor in ≥2 years | **high-confidence anchored** |

### Evidence FAMILIES, not code counts — and the trap

Corroboration must be counted in **families**, of which there are five:

1. **Cytotoxic backbone** — oxaliplatin, irinotecan
2. **Fluoropyrimidine + modulation + delivery** — 5-FU, leucovorin, `96416` pump
3. **Targeted / VEGF** — bevacizumab and its biosimilars
4. **Oral therapy (Part D)** — capecitabine, trifluridine, regorafenib, encorafenib,
   fruquintinib
5. **Specialty and setting** — Med Onc / Heme-Onc taxonomy, practice context

**THE TRAP, written down because it is easy and wrong:** counting 5-FU + leucovorin +
oxaliplatin + pump as *four independent corroborations*. They are **one clinical
construct** — a fluoropyrimidine backbone with its modulator and its delivery method,
plus the platinum it is given with. A provider billing all four has demonstrated one
thing, not four. Counting codes instead of families inflates confidence exactly where the
codes cluster, which is precisely where they always cluster.

Family 2 in particular is *internally* correlated: leucovorin without 5-FU is unusual,
and `96416` without an infusional fluoropyrimidine is close to meaningless. Treat the
family as one signal with internal consistency checks, never as three.

### What NOT to do

**Never promote oxaliplatin or bevacizumab alone to `anchor` to compensate for the
missing J-codes.** The temptation will be real: the anchor tier is empty, these two codes
are present and oncology-flavoured, and promoting either would immediately populate a
board. Both are broadly cross-indication — bevacizumab spans colorectal, lung, renal,
ovarian, cervical and glioblastoma; oxaliplatin spans colorectal, gastric and pancreatic.
Promoting either would rebuild, at the tier level, exactly the defect
`NSCLC_COHORT_EVIDENCE_TIERS.md` §1 found in `is_primary_signal` — a flag set true for
cisplatin and docetaxel, "not distinguishing lung-specificity but something else."

**For bevacizumab the case is far stronger than cross-indication, and it is measured.**
Of the **2,094 providers billing the bevacizumab family nationally in the 2023 CMS file**:

| taxonomy | providers | |
|---|---|---|
| `207W00000X` Ophthalmology | **1,608** | |
| `207WX0107X` Ophthalmology, Retina | **745** | |
| `207RH0003X` IM, Hematology & Oncology | 198 | |
| any of the four original CRC population codes | 85 | |

That is **intravitreal Avastin for macular degeneration**. By provider count, bevacizumab
is not merely cross-indication across tumour types — it is **majority not oncology at
all**. The ophthalmologists outnumber every oncology encoding combined by roughly ten to
one.

So bevacizumab alone is not a weak colorectal signal; it is a *retina* signal with an
oncology tail. **Promoted alone to anchor, it would admit an ophthalmology practice ahead
of a colorectal one** — and it would do so confidently, in volume, with a code that looks
unimpeachably oncological to anyone reading the code list rather than the claims.

This is also why the VEGF component works *inside* the composite and only there. Paired
with oxaliplatin or irinotecan and a fluoropyrimidine under an oncology taxonomy, the
retina population is excluded by construction — a retina specialist bills none of the
other three. The composite is not bevacizumab plus corroboration; it is a conjunction in
which bevacizumab is only meaningful because of what it is conjoined with.

An empty anchor tier that says so is correct. A populated one built from cross-indication
codes is a board that looks finished and is wrong.

---

## FOUNDER INPUTS REQUIRED

These stop the build until answered. Nothing downstream of them can be guessed.

1. **The definition question, which governs everything below it.** Is the CRC community cohort
   the people who *treat* colorectal cancer, or the people who *could*? NSCLC answered "could"
   implicitly with one code. Answer it explicitly and items 2 and 3 mostly resolve themselves.
2. **The CRC taxonomy set** for `nppes_workstream_b_ingest.py`. The per-code table above is the
   decision surface. Gastroenterology (21,325, half the pool) and Radiation Oncology (6,991) are
   the two real calls; `208600000X` is excluded.
3. **The matcher's confirming-taxonomy set** — same list, different purpose. `208600000X`
   confirms only alongside a second independent signal, never alone.
4. **CRC HCPCS code set** for `ta_hcpcs_codes` (advisor prompt already scoped).
5. **Capecitabine's `anchor_grade`**, and grades for encorafenib and fruquintinib.
6. **The CRC tier definitions** — what counts as anchored, supported, candidate for colorectal.
7. **The CRC fifth tier**, replacing `heme_dominant`.
8. **Split-identity budget** — accept ~842 new twins from workstream B, or fix NPPES-side identity
   hashing first.

## WHAT THIS BUILD DELIBERATELY DOES NOT DO

- It does not ship a CRC board on 1,415 NPIs to make the tab light up. The greyed tab is an honest
  named absence and is preferable to a board that is 1% of its population.
- It does not add a degraded non-NSCLC fallback. `community_roster_v1.sql` decided 2026-08-11:
  "A future TA gets its own board view + a revisit here, not a degraded fallback." That still holds.
- It does not populate `hcp_therapeutic_areas_v2` by hand. A taxonomy-derived TA link is a claim
  about a physician's disease area; it goes through the one script that logs what it did, or it
  does not go in.
- It does not let a population number stand in for a board. Phases 1-3 build who *could* qualify;
  phase 4 decides who *does*. Report them separately, always.
- It does not repeat this document's own first error. Version one named `nppes_matcher.py` as the
  blocker because of its name, and specified two phases of work on a script that has never written
  an NPI to anyone. **Trace the writer before planning around it.**
