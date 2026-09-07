# CRC Community Build — sequenced spec

**TA:** Colorectal Cancer · slug `colorectal-cancer` · **Branch:** foundation-rebuild
**Written:** 2026-09-03, after the state provenance repair cleared the `nppes_matcher` hard stop.
**Status:** measured, ordered, not started.

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

## WHY NPI COVERAGE IS 1.3%

`nppes_matcher.py` has never run for colorectal. It never ran because it was hard-stopped by the
state provenance defect: the matcher indexes on `(last_name_norm, practice_state)` at
`nppes_matcher.py:105` and reads `COALESCE(nppes_practice_state, derived_state)` at `:150`,
treating the result as NPPES-sourced. With 14,678 institution-derived values sitting in that
column, running it would have produced confident matches to different same-surname physicians and
written their NPIs — and therefore their Medicare claims and Open Payments — onto named
individuals.

**That hard stop was lifted 2026-09-03.** `nppes_practice_state` now holds only NPPES-sourced
values (2 rows, both corroborated), enforced by `nppes_state_has_nppes_provenance`.

### The consequence nobody has accounted for

The clear removed the values the matcher was **blocking on**. `derived_state` has no producer
(1,479 of 381,329 rows, 0.4%, every repo reference a read). So post-clear, most CRC HCPs present
the matcher with no state at all, and the matcher as written will generate almost no candidates
for them.

**The matcher needs `institution_state` added as a candidate-generation key.** This is sound
record linkage and it is the correct use of the column built by the provenance repair: a weak
signal is legitimate for *narrowing* a candidate set and illegitimate for *deciding* a match.
Concretely — block on `COALESCE(nppes_practice_state, derived_state, institution_state)`, and
require independent confirmation (specialty, taxonomy, institution agreement) before writing an
NPI on any row whose block key came from `institution_state`. Record which basis produced each
match so the weaker ones stay auditable, exactly as `state_basis` does on the read side.

**Do not skip the confirmation half.** Restoring the blocking key without it recreates the exact
failure the provenance repair existed to prevent, one layer down.

---

## BUILD ORDER

Each phase gates the next. Phases 1–3 are data and machine time; phase 4 is code. Doing phase 4
first yields a 238-member CRC board, which is the wrong thing to look at and the wrong thing to
show anyone.

### Phase 1 — Matcher: blocking key + confirmation (gates everything)

- Add `institution_state` to the block key in `nppes_matcher.py`.
- Require independent confirmation for institution-blocked candidates; record the basis per match.
- `--dry-run` first and mandatory, per `TA_NEW_PLAYBOOK.md` MULTI-TA STANDARD ADDENDUM.
- Acceptance: dry-run reports candidate and confirmed counts per basis; zero NPIs written until
  the confirmed/institution-blocked sample is eyeballed by the founder.

### Phase 2 — Run the matcher for CRC

- Target: move `with_npi` from 1,415 toward NSCLC's order of magnitude.
- Acceptance: a sampled review of institution-blocked matches before the run is accepted.
  **Absence is never zero** — report how many CRC HCPs remain unmatched and why.

### Phase 3 — Medicare inputs

Two independent arms of `qualifies`. Do both; neither alone is sufficient.

**3a. Part D vocabulary.** `part_d_oncology_drugs_v1` already carries **regorafenib** and
**trifluridine** in `gi_renal`, which is why 238 CRC HCPs are already present. Missing:
**capecitabine** (the most-prescribed colorectal oral there is), **encorafenib**, **fruquintinib**.
`sotorasib` and `adagrasib` sit in `lung` and are shared KRAS G12C agents.

> **Capecitabine needs a grade, not an anchor.** It spans colorectal and breast. Under the
> `hcp_nsclc_evidence_tier_v1` scheme `anchor_grade = 'strict'` means indication-specific; a
> cross-indication drug graded strict would anchor breast prescribers onto a CRC board. Grade it
> `dominant` or `cross_indication` and let the tier logic weight it. This is a **founder input**,
> not a code decision.

Then re-run `part_d_oncology_ingest.py` (`--dry-run` first).

**3b. HCPCS code set.** `ta_hcpcs_codes` has 0 CRC rows, which is why `hcp_medicare_by_ta_v2` has
0 and `patient_volume` is 0 for every CRC HCP. This is the founder-curated set already scoped in
the advisor prompt. Feeds `medicare_aggregator.py:197`.

### Phase 4 — The code objects (only now)

Execute against `TA_NEUTRAL_DB_LAYER.md` §B and §C. This build is that design's first consumer,
so treat gaps found here as amendments to that document, not local workarounds.

1. `community_board_nsclc_v1` → `community_board_v1` + `ta_id`, with the shim view. §B.2 and §B.3
   — the shim is not optional; §B.1 documents what breaks at the instant of deployment.
2. `hcp_nsclc_evidence_tier_v1` → a TA-parameterised tier view. **The tier vocabulary is
   per-TA and is the real work here**: the NSCLC tiers are defined by pemetrexed `J9305`/`J9304`,
   durvalumab `J9173`, and lung-only oral anchors. CRC needs its own anchored/supported/candidate
   definitions from the phase 3 inputs. See `TA_NEUTRAL_DB_LAYER.md` §E on what is genuinely
   per-TA.
3. Remove the `p_ta_id = 'c0065b03-…'` literal from all four `get_community_filtered` /
   `get_community_filtered_count` overloads — this closes **W3** in
   `TA_GENERALIZATION_INVENTORY.md`. Note the literal survived the 2026-09-02 filtered-family
   rewrite (`docs/state_provenance/04_filtered_family.sql:73`); a rewrite is not a de-pin.
4. `heme_dominant` is an NSCLC tier concept and does not transfer. Decide the CRC fifth tier
   rather than inheriting it.

**Grants do not survive a DROP.** Every function dropped in phase 4 must have `anon`,
`authenticated`, `service_role` re-granted in the same file, and a before/after grant check must
run — 18 of 18 objects, all three roles. A lost grant on `get_community_filtered` renders as an
empty Community tab, not as an error. The pattern is `docs/state_provenance/08_grant_check_AFTER.sql`.

### Phase 5 — Verification

- `CRC_VALIDATION_ANCHORS.md` is the acceptance test. Record outcomes in its results section;
  do not edit its expectations.
- The board is a **roster**, per `COMMUNITY_ROSTER_BUILD.md`: no rank, no composite score, tiers
  and facts only. Confirm no ranked artefact reached the CRC path.
- NSCLC is the regression oracle: its board must still return 4,913 and its numbers must not move
  byte-for-byte, per `TA_NEW_PLAYBOOK.md` §0 core mental model.
- Every empty modality must say which absence it is. A blank panel is the third bad state.

---

## FOUNDER INPUTS REQUIRED

These stop the build until answered. Nothing downstream of them can be guessed.

1. **CRC HCPCS code set** for `ta_hcpcs_codes` (advisor prompt already scoped).
2. **Capecitabine's `anchor_grade`**, and grades for encorafenib and fruquintinib.
3. **The CRC tier definitions** — what counts as anchored, supported, candidate for colorectal.
4. **Sample review** of institution-blocked matcher candidates before phase 2 is accepted.
5. **The CRC fifth tier**, replacing `heme_dominant`.

---

## WHAT THIS BUILD DELIBERATELY DOES NOT DO

- It does not ship a CRC board on 1,415 NPIs to make the tab light up. The greyed tab is an honest
  named absence and is preferable to a board that is 1% of its population.
- It does not add a degraded non-NSCLC fallback. `community_roster_v1.sql` decided 2026-08-11:
  "A future TA gets its own board view + a revisit here, not a degraded fallback." That still holds.
- It does not treat the state provenance repair as finished business. Phase 1 is that repair's
  second half: having made the column honest, the matcher must be taught to use the honest column.
