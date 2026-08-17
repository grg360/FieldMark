# Affiliation re-derivation — Steps 1–2 results

**Date:** 2026-08-14 · **Branch:** `resurfacing`
**Step 1:** COMPLETE (wrote 7,928 new `ror_to_country` rows — reference data only)
**Step 2:** COMPLETE — **0.65 decay VALIDATED**, with one methodology change required before Step 3
**Step 3:** HELD. Nothing re-derived, no `hcps_v2` column added or written.

---

## Step 1 — ROR→country gap: closed

`scripts/enrich/backfill_ror_country_openalex.py` (new). Batches 50 RORs per OpenAlex
`/institutions` call via the OR-filter, writes with `ON CONFLICT (ror_id) DO NOTHING` — it
can only add mappings, never overwrite one.

| | |
|---|---|
| Distinct RORs in recent (2023+) papers | 15,838 |
| Already mapped before | 7,786 (49.2%) |
| Requested from OpenAlex | 8,052 |
| Found in OpenAlex | 8,043 |
| **Written (had `country_code`)** | **7,928** |
| Found but no `country_code` | 115 |
| Not in OpenAlex at all | 9 |
| API time | **41 seconds** (162 requests) |

### Resulting coverage

| Level | Before | After |
|---|---|---|
| Distinct recent RORs mapped | 7,786 / 15,838 (49.2%) | **15,714 / 15,838 (99.2%)** |
| HCP-rows unresolvable to a country | 13,331 | **154** |

**124 RORs remain unmappable** — 115 exist in OpenAlex with a null `country_code`, 9 are
absent entirely (`00hr1eg19, 00wg3s094, 00za3wc71, 02v39xy13, 031j0at32, 040ss6920,
049byzx03, 049rn4865, 04mknbs38`). These are genuinely missing upstream, not a gap in our
fetch. They affect 154 HCP-rows (0.08%) — acceptable, and they will fall to `unknown`
confidence rather than being silently mislabelled.

### Knock-on effect on the delta

Filling the map materially changed the expected re-derivation outcome:

| Outcome | Pre-backfill | Post-backfill |
|---|---|---|
| Country unchanged | 168,019 | 171,379 |
| **Country changed** | 7,295 | **8,319** |
| Country filled in (was null) | 2,933 | **11,726** |
| Winner ROR unmapped | 13,331 | **154** |

**~20,045 people now get a corrected or newly-populated country**, up from ~10,228 in the
scoping report. The `filled_in` bucket quadrupled — those were people whose current
institution simply had no country mapping. Doing Step 1 first was the right call.

---

## Step 2 — decay validation: 0.65 confirmed

`scripts/enrich/validate_affiliation_rederivation.py` (new, **read-only**, pure SELECT).
Runs the proposed methodology and prints the full weighted breakdown per person.

Set: the 2 named movers plus 9 more, chosen for directional mix — EU→US, US→EU, JP→US,
KR→US, EU→CA, and 5 intra-EU. Every one verified against public record (sources below),
not asserted from recall.

### Scorecard — all 11 resolve correctly

| Person | Stored (wrong) | Re-derived | Verdict | Public record |
|---|---|---|---|---|
| **Marina Garassino** | IT · INT Milan | **US · U Chicago** | ✅ correct | moved ~2021 |
| **Misako Nagasaka** | JP · St. Marianna | **US · UC Irvine** | ✅ correct | at UCI |
| **Arndt Vogel** | DE · Hannover | **CA · Toronto General** | ✅ correct | announced Sept 2023, Longo Chair |
| **Ramón Bataller** | US · UPMC | **ES · IDIBAPS/Clínic** | ✅ correct | Chief of Hepatology, Clínic Barcelona |
| **Laura Mezquita** | FR · Gustave Roussy | **ES · H. Clínic** | ✅ correct | GR 2015–2020, now Clínic/IDIBAPS |
| **Luigi Terracciano** | CH · Basel | **IT · Humanitas** | ✅ correct | Basel to Aug 2020, Humanitas Sept 2020 |
| **Ángela Lamarca** | GB · Manchester | **ES · FJD Madrid** | ✅ correct | left The Christie May 2022 |
| **Clemens Aigner** | DE · Ruhrlandklinik | **AT · MedUni Vienna** | ✅ correct | took Vienna chair 1 July 2023 |
| **Andreas Kremer** | DE · Erlangen | **CH · USZ Zurich** | ✅ correct | Erlangen to June 2021, USZ July 2021 |
| **Keunchil Park** | KR · Samsung | **KR — held** | ✅ correctly NOT changed | still Samsung Medical Center |
| **Jeffrey Lazarus** | ES · ISGlobal | **US · CUNY** | ⚠️ true dual | holds **both** posts concurrently |

**10 corrected moves, 1 correctly-held non-move, 1 genuine dual affiliation.
Zero false positives.**

### Decay sweep — the result is robust, and decay earns its place

Country-level winner at each decay constant:

| Person | 0.40 | 0.50 | **0.65** | 0.80 | 1.00 (flat) |
|---|---|---|---|---|---|
| Aigner | AT | AT | **AT** | AT | AT |
| Bataller | ES | ES | **ES** | ES | ES |
| Garassino | US | US | **US** | US | US |
| Kremer | CH | CH | **CH** | CH | CH |
| **Lamarca** | ES | ES | **ES** | ES | **GB ❌** |
| Lazarus | US | US | **US** | US | US |
| Mezquita | ES | ES | **ES** | ES | ES |
| Nagasaka | US | US | **US** | US | US |
| Park | KR | KR | **KR** | KR | KR |
| Terracciano | IT | IT | **IT** | IT | IT |
| Vogel | CA | CA | **CA** | CA | CA |

Two conclusions:

1. **0.65 is validated and not overfitted.** Anything in 0.40–0.80 gives identical, correct
   answers on all 11. We are not balanced on a knife edge — the 3-year window does most of
   the work and the exact constant is not load-bearing.
2. **Decay is still necessary.** Flat weighting (1.0) fails on Lamarca, returning her old
   UK affiliation. Her Manchester collaborations continue in volume after the 2022 move;
   only recency-weighting separates "still co-authoring with" from "works there".

**Recommend keeping 0.65** — it sits mid-range with correct answers either side.

---

## The one change required before Step 3

### Roll up to COUNTRY before picking the country winner

Institution-level ROR fragmentation is systematic: one real employer is split across
several ROR entities, splitting its vote.

| Person | Fragmented as | Institution-level dominance | Country-level |
|---|---|---|---|
| Bataller | IDIBAPS + Hospital Clínic | 0.30 | **0.67** |
| Vogel | Toronto General + Princess Margaret | 0.33 | **0.65** |
| Nagasaka | UC Irvine + UCI Medical Center + UC Irvine Health | 0.47 | **0.64** |
| Kremer | U Zurich + University Hospital Zurich | 0.53 | **0.75** |
| Aigner | CCC Vienna + MedUni Vienna | 0.58 | **0.79** |

Two consequences, one of them serious:

1. **Confidence is understated.** At institution level, 5 of 11 verified-correct movers
   land below the 0.6 "high" threshold purely because their employer has multiple RORs.
2. **It produces a wrong answer.** **Keunchil Park** resolves to *US · MD Anderson* at
   institution level (n=12, dom 0.44) — but to *KR* once his Samsung Medical Center and
   Sungkyunkwan rows are summed. Public record (ILCN, Samsung Medical Center) confirms he
   is still Korea-based. **Country-level rollup is what prevents this false positive.**

**Required change:** compute `current_country` from a country-level weight rollup, and
`current_institution` from the institution-level winner, as two separate aggregations —
not by reading the country off the winning institution. This is a change to the aggregation
step only; the window, decay, clamp and tie-break are unchanged.

After the change, all 11 land at country dominance ≥0.50 and 10 of 11 at ≥0.60.

### Two smaller notes for the run

- **Dual affiliations read as high confidence.** Lazarus scores 0.75 country dominance but
  genuinely holds both the ISGlobal and CUNY posts. Dominance measures publication
  concentration, not exclusivity — a person can be 75% concentrated and still fully hold two
  jobs. Suggest `institution_secondary` be populated whenever the runner-up clears ~0.20 of
  total weight, regardless of confidence tier, so the UI can show both. Not a blocker.
- **Non-employers appear as institutions.** Mezquita's third-ranked entry is "Breast Cancer
  Research Foundation" (n=7) — a funder, not an employer. It did not change her result, but
  a funder can outrank a real employer for someone with fewer papers. Worth a follow-up
  filter; not a Step 3 blocker.

### Side finding: the moves already created split identities

Looking up the validation set surfaced duplicate HCP records keyed to the *new* location:

| Fragment | Country | Pubs |
|---|---|---|
| Arndt Vogel | CA | 5 |
| Arndt Vogel | CA | 3 |
| Ramón Bataller | ES | 7 |
| Jeffrey V. Lazarus | US | 3 |

When these people moved, their new-institution shards failed to cluster onto the existing
HCP and became separate provisional records. This is the split-identity dedup issue, and
relocation looks like one of its generators. Out of scope here — flagging because
re-derivation will make these twins more visible, not less.

---

## Status and what Step 3 would run

**Held, awaiting your go.** When approved, Step 3 runs the full corpus (290,480) with:

- 3-year window (2023+), decay 0.65, `LEAST(pub_year, current_year)` clamp
- **country-level rollup for `current_country`**, institution-level winner for
  `current_institution` (the change above)
- Additive columns only: `current_country`, `current_institution*`,
  `affiliation_confidence`, `affiliation_as_of`, `affiliation_evidence_n`,
  `affiliation_dominance`, `affiliation_derived_at`
- `institution_secondary` + `institution_history` for runner-up and trail
- **Existing `country` / `institution_*` untouched**

Expected: ~8,319 country corrections, ~11,726 fills, ~98,902 marked stale. Runtime ~5–15
minutes inline.

Two calls for you:

1. **Confirm the country-rollup change** — it is a correctness fix (it is what holds Park at
   KR), but it does differ from the methodology in the approved scope doc, so I am not
   folding it in silently.
2. **Confirm scope** — full corpus (290,480) vs ranked cohorts (32,627). Still recommend
   full; the compute is negligible.

---

## Sources

- [Arndt Vogel — Toronto appointment announcement](https://x.com/ArndtVogel/status/1700137244382601503?lang=en) · [U Toronto IMS](https://ims.utoronto.ca/faculty/arndt-vogel)
- [Ramón Bataller — Clínic Barcelona](https://www.clinicbarcelona.org/en/professionals/ramon-bataller-1) · [Pitt Liver Center (prior post)](https://livercenter.pitt.edu/2017/04/26/dr-ramon-bataller-m-d-ph-d-appointed-section-chief-of-medical-hepatology-within-the-department-of-medicines-division-of-gastroenterology-hepatology-and-nutrition/)
- [Laura Mezquita — Clínic Barcelona](https://www.clinicbarcelona.org/en/professionals/laura-mezquita)
- [Luigi Terracciano — Humanitas University](https://www.hunimed.eu/member/luigi-maria-terracciano/)
- [Ángela Lamarca — ESMO biography](https://www.esmo.org/about-esmo/biographies/angela-lamarca) · [Fundación Jiménez Díaz](https://www.fjd.es/en/cuadro-medico/angela-lamarca-lete)
- [Clemens Aigner — MedUni Vienna, July 2023](https://www.meduniwien.ac.at/web/en/about-us/news/2023/news-in-june-2023/clemens-aigner-uebernimmt-professur-fuer-thoraxchirurgie/)
- [Andreas Kremer — University Hospital Zurich](https://www.aasld.org/the-liver-meeting/andreas-e-kremer)
- [Keunchil Park — ILCN, Samsung Medical Center](https://www.ilcn.org/keunchil-park-md-phd/)
- [Jeffrey V. Lazarus — ISGlobal](https://www.isglobal.org/en/our-team/-/profiles/12802) · [Wikipedia](https://en.wikipedia.org/wiki/Jeffrey_V._Lazarus)
