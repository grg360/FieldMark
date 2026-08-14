# Affiliation re-derivation — Step 3 (full corpus) results

**Date:** 2026-08-14 · **Branch:** `resurfacing` · **Status:** APPLIED to live DB

Country-rollup fix applied. Full corpus re-derived (290,480). Existing `country` and
`institution_*` untouched and verified byte-identical to the pre-run snapshot.

**Runtime: 76 seconds** (46s staging build + 30s apply) — against a 5–15 minute estimate.

---

## What ran

| Artifact | Purpose |
|---|---|
| `sql/affiliation/01_add_columns.sql` | Additive DDL — 8 new columns + 2 indexes |
| `sql/affiliation/02_build_staging.sql` | Re-derivation into `hcp_affiliation_rederived_v1` (244,850 rows) |
| `sql/affiliation/03_apply.sql` | `UPDATE ... FROM` staging; stamps `unknown` for the rest |

The country rollup is implemented as specified: weights are summed **by country first**,
the winner is picked from that rollup, and `current_institution` is then the top-weighted
ROR *within the winning country* — so country and institution can never disagree.

### Preservation verified

`hcps_v2.country` distribution after the run is identical to before:
US 79,894 · CN 75,959 · (blank) 19,393 · JP 18,024 · IT 11,239 · DE 7,780. No SET clause
in `03_apply.sql` touches `country`, `institution_normalized`, `institution_raw`,
`institution_ror` or `institution_canonical`.

---

## 1. Deltas

| Outcome | Count | % of corpus |
|---|---|---|
| **Corrected** (moved off a stale label) | **9,147** | 3.1% |
| **Newly populated** (was null) | **16,338** | 5.6% |
| **Held** (no change) | **219,365** | 75.5% |
| **Stale** (no recent papers) | **53,360** | 18.4% |
| **Unknown** (no ROR'd affiliation ever) | **45,630** | 15.7% |

25,485 records gained a corrected or newly-populated country. (Corrected + newly-populated
+ held = 244,850 = the staged set; the remaining 45,630 have no publication affiliation to
derive from.)

### Stale bucket — how stale, actually

`affiliation_as_of` for the 53,360 stale records:

| Last seen | Count |
|---|---|
| 2021–2022 | 31,028 |
| 2018–2020 | 20,176 |
| 2015–2017 | 2,148 |
| 2001–2014 | 8 |

Reassuring: the stale bucket is overwhelmingly *recently* stale — a 4-to-5-year publication
gap, not decade-old records. The UI's "as of 2021" will be an honest and mostly-recent claim.

---

## 2. Confidence distribution

### Full corpus (290,480)

| Confidence | Count | % |
|---|---|---|
| medium | 102,965 | 35.4% |
| high | 88,525 | 30.5% |
| stale | 53,360 | 18.4% |
| unknown | 45,630 | 15.7% |

### Ranked cohorts (32,627 distinct)

| Confidence | Count | % |
|---|---|---|
| **high** | **13,862** | **42.5%** |
| medium | 8,541 | 26.2% |
| unknown | 6,451 | 19.8% |
| stale | 3,773 | 11.6% |

Ranked cohorts are materially healthier than the corpus — 42.5% high vs 30.5%, and stale
is 11.6% vs 18.4%. Per board:

| Board | high | medium | stale | unknown |
|---|---|---|---|---|
| Established v3 (19,470) | 12,412 (63.8%) | 5,150 | 1,895 | 13 |
| Rising v3 (619) | 597 (96.4%) | 21 | 1 | 0 |
| Community board (12,970) | 1,271 | 3,384 | 1,877 | **6,438 (49.6%)** |

Cohort deltas: **1,294 corrected** (253 of them high-confidence), 920 newly populated,
23,962 held.

---

## 3. EU / non-US impact — the report's prediction did NOT hold

The scoping report predicted re-derivation would correct a non-US overcount. **It does not.**
On the 228,512 rows where both old and new values exist:

| | Stale label | Re-derived | Net |
|---|---|---|---|
| US | 39,720 | 39,189 | **−531** |
| Non-US | 188,792 | 189,323 | **+531** |
| EU | 48,187 | 48,113 | **−74** |

Gross flow: 2,046 moved *to* US, 2,577 moved *from* US. 971 joined EU, 1,045 left EU.

Restricting to high-confidence records only (84,850 comparable) does not change the picture:
US 13,490 → 13,283 (−207), EU 17,046 → 17,032 (−14).

**Conclusion: the net geographic correction is a rounding error (0.23% of comparable rows),
and it runs slightly *toward* non-US, not away from it.** Migration is close to symmetric —
roughly as many people move to the US as leave it, so the aggregate country counts were
never meaningfully skewed by staleness. The value of this work is **per-person accuracy**,
not corpus-level geography. Anyone planning territory sizing off the old numbers should know
they were approximately right in aggregate while being wrong about ~9,000 specific people.

Largest migration pairs: US→CN 1,400 · CN→US 680 · HK→CN 431 · CN→HK 171 · JP→US 153 ·
KR→US 151 · TW→CN 122 · US→GB 113.

---

## 4. Spot-check — all 11 validated movers landed correctly

Read back from `hcps_v2` after apply:

| Person | Preserved | Re-derived | Institution | Conf |
|---|---|---|---|---|
| Garassino | IT | **US** | University of Chicago | high |
| Nagasaka | JP | **US** | University of California, Irvine | high |
| Vogel | DE | **CA** | Toronto General Hospital | high |
| Bataller | US | **ES** | IDIBAPS | high |
| Mezquita | FR | **ES** | Hospital Clínic de Barcelona | high |
| Terracciano | CH | **IT** | Humanitas University | high |
| Lamarca | GB | **ES** | Fundación Jiménez Díaz | high |
| Aigner | DE | **AT** | Comprehensive Cancer Center Vienna | high |
| Kremer | DE | **CH** | University of Zurich | high |
| Lazarus | ES | **US** | The Graduate Center, CUNY | high |
| **Park** | KR | **KR — held** | Samsung Medical Center | medium |

Park is the proof the rollup works: institution-level picking gave US/MD Anderson (dom 0.44);
country rollup holds him at KR and captures MD Anderson as `institution_secondary`. The
secondary column populated for 14,109 people and reads correctly across the set — Vogel→Hannover,
Nagasaka→St. Marianna, Lazarus→ISGlobal, Bataller→UPMC, Kremer→Erlangen, Lamarca→Manchester.

`institution_history` is well-formed. Vogel's shows the rollup explicitly: Toronto General
(14.64, CA) + Princess Margaret (7.44, CA) = 22.08 outweighing Hannover (14.34, DE) — a
result institution-level picking would have gotten wrong.

### Invariant checks — all clean

| Check | Result |
|---|---|
| Country set but institution null | 0 |
| `high` confidence with n<3 | 0 |
| Null confidence | 0 |
| `affiliation_as_of` > 2026 (clamp failure) | 0 |
| Dominance > 1.0 | 0 |

The zero future-dated `as_of` confirms the `LEAST(pub_year, current_year)` clamp did its job
against the 337,068 rows dated 2026 and 223 dated 2027–28.

---

## 5. Anomalies the 11-person validation did not surface

### 5.1 Corrections are thin-evidence dominated — the headline caveat

The 11 validators were all prolific KOLs with 20–60 recent papers. The corpus is not like that.

| Confidence of the 9,147 corrections | Count | % | avg papers |
|---|---|---|---|
| medium | 7,070 | 77.3% | **1.3** |
| stale | 1,127 | 12.3% | 1.6 |
| **high** | **950** | **10.4%** | 5.5 |

**Only 950 of 9,147 corrections are high-confidence.** The medium tier corpus-wide is
dominated by n=1 (56,649) and n=2 (45,538) — people whose entire recent record is one or two
papers, where a single paper at a new address flips the country.

This is not a defect — it is the confidence gradient doing exactly the job it was designed
for, and the rule already refuses to call these `high`. But it does reframe the deliverable:
**treat ~950 corrections as confirmed relocations and the other ~8,200 as leads.** Any UI
should gate "current-confirmed" on `affiliation_confidence = 'high'` as specified, and no
downstream consumer should treat the raw 9,147 as verified moves.

### 5.2 US→CN (1,400) is the largest single flow, and sits in the worst name-collision zone

Inspection shows a genuine returnee pattern — researchers trained at MD Anderson, NIH, UCSF,
UCLA now publishing from Harbin Medical, Sun Yat-sen, Tianjin Medical, with high dominance
(0.8–0.96) and solid evidence counts. Plausible and well-documented as a real phenomenon.

But the names in this bucket are `Li X`, `Min Li`, `Jun Li`, `Chen Liu`, `Jing Wang`,
`Qi Wang` — the highest-frequency Han Chinese name forms, exactly where identity clustering
is most likely to have merged distinct people. From the affiliation data alone, "returned to
China" and "two people conflated into one record" are indistinguishable.

Mitigating evidence: ORCID-anchored identities are slightly *over*-represented among
corrections (6.8%) versus held records (6.0%), which argues against conflation driving the
correction set as a whole. But the US→CN cluster specifically warrants a dedup pass before
anyone acts on it.

### 5.3 HK→CN (431) is an institution-name collision, not migration

All 431 share one stored institution: **"Union Hospital"** — resolving to Wuhan Union
Hospital (37), Huazhong UST (24), Jilin University (8), Sun Yat-sen (7), Shanghai Jiao Tong
(6) and others. "Union Hospital" is shared by Hong Kong Union Hospital and several mainland
hospitals; the stale HK label came from a mis-resolved ROR. Here the re-derivation is
**fixing** a pre-existing error rather than tracking a move — but the underlying cluster may
still contain conflated identities. Same caveat as 5.2.

### 5.4 Community board is half `unknown` — by design, but worth stating

6,438 of 12,970 community-board HCPs (49.6%) have no ROR'd affiliation at all. That is
expected: community HCPs are identified through NPPES/CMS, not publications, so there is no
publication affiliation to re-derive. It does mean **affiliation confidence is not a usable
signal on the community surface** — roughly half that board will show `unknown` forever.
Established (13 unknown of 19,470) and Rising (0) are unaffected.

### 5.5 Funders appear as institutions

Confirmed at scale what the validation flagged on one person: Mezquita's `institution_secondary`
is "Breast Cancer Research Foundation" — a funder, not an employer. It did not change her
country, but for someone with few papers a funder can outrank a real employer. Worth a
filter pass on the institution winner; it does not affect country and is not urgent.

---

## Status

Applied and verified. Nothing downstream repoints — `country` remains the field every
existing consumer reads, so this run changed no UI, no ranking and no export.

Suggested next steps, in order:

1. **Gate any UI adoption on `affiliation_confidence = 'high'`** (§5.1). The 950
   high-confidence corrections are safe to surface as "current-confirmed"; the rest should
   read "as of {affiliation_as_of}".
2. **Dedup pass over the US→CN and HK→CN clusters** (§5.2, §5.3) before those corrections
   inform anything.
3. **Funder filter** on the institution winner (§5.5) — low priority.

Open question I did not decide: nothing repoints today, so `current_country` is inert until
you choose which surfaces read it. Recommend Established/Rising first (63.8% / 96.4% high
confidence) and holding Community back until §5.4 is resolved.
