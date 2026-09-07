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
