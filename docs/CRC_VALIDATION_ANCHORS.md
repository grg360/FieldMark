# CRC Validation Anchors — pre-registered before the corpus exists

**TA:** Colorectal Cancer · slug `colorectal-cancer`
**Written:** 2026-08-24, **before** any CRC ingestion. Nothing in this document was informed by a board.
**Purpose:** the acceptance test for the CRC build, per `TA_BUILD_GUIDE.md` STEP 3.

> This document is only worth something because it predates the board. Group 2 in particular is a
> falsifiable prediction; recorded after the fact it would be a post-hoc story about whatever the ranking
> happened to produce. **Do not edit the expectations below after the first board runs.** Record outcomes
> in the results section at the bottom instead.

---

## Scope this test assumes

**In:** colon cancer, rectal cancer, rectosigmoid / colorectal NOS.
**Out:** anal cancer, appendiceal cancer, small bowel cancer, GIST, GI NETs.

Scope was chosen by *who the ranking surfaces*, not by taxonomy. Appendiceal was the close call and was
excluded because it would disproportionately surface CRS/HIPEC surgeons, peritoneal-surface specialists
and pseudomyxoma researchers — real experts, wrong answers for a Medical Affairs user buying colorectal
intelligence. Anal was an easy exclusion: predominantly HPV-driven squamous-cell disease against a CRC
universe that is overwhelmingly adenocarcinoma, with a substantially different investigator graph.

---

## GROUP 1 — The pass/fail gate

These must surface high in global Established. **If they do not, stop and trace. Do not ship, do not tune
the scorer to make them appear.** Absence here means the corpus, identity resolution, disease attribution
or scoring is broken upstream — and a scorer adjusted to rescue a broken corpus hides the defect instead
of fixing it.

| Anchor | Base | What their absence would indicate |
|---|---|---|
| Scott Kopetz | MD Anderson, US | Core corpus failure. BRAF/molecular CRC and major trial leadership — if he is missing, retrieval or attribution is broken outright. |
| Josep Tabernero | VHIO / Vall d'Hebron, Spain | Core corpus failure, or Europe under-weighted. |
| Eric Van Cutsem | KU Leuven, Belgium | Core corpus failure. Among the most-cited figures in the field; absence implies a date window or citation-enrichment failure. |
| Takayuki Yoshino | NCC Hospital East, Japan | APAC attribution failure. Also Deputy Director / Chief of GI Oncology at NCC. |
| Thierry André | France | MSI/dMMR immunotherapy literature not ingesting, or France under-weighted. |
| Chiara Cremolini | University of Pisa, Italy | Contemporary metastatic-CRC literature missing; Italy under-weighted. |
| Rona Yaeger | MSK, US | Molecular/targeted CRC literature not attributing correctly. |

A bibliometric analysis of CRC targeted-therapy research is independently consistent with this group:
Van Cutsem most cited; Tabernero and Kopetz leading on both volume and citations; collaboration clusters
centred on Tabernero, Kopetz and Elez. The 2026 BREAKWATER program places Kopetz, Tabernero, Yoshino,
Van Cutsem, Eng, Elez and the Milan investigators on the same BRAF-mutant CRC work — so a healthy
co-authorship graph should show these names connected, not scattered.

---

## GROUP 2 — The falsifiable prediction

**The claim:** these people rise on *recent* work rather than lifetime publication mass. If they do,
FieldMark is doing something a conventional bibliometric leaderboard would not. If they sit low while
Group 1 sits high, the platform is reproducing a citation ranking and the Rising machinery is not earning
its keep.

This is the prediction the whole build is worth testing. It is recorded here before the board exists.

| Anchor | Base | Why they should rise on recent work |
|---|---|---|
| Andrea Cercek | MSK, US | dMMR/MSI rectal immunotherapy — recent and practice-changing rather than accumulated. |
| Jeanne Tie | Australia | ctDNA / MRD in CRC. Also the only Australian anchor — a geographic check. |
| Elena Elez | VHIO, Spain | Next-generation targeted/molecular CRC. |
| Andrea Sartore-Bianchi | Niguarda / Milan, Italy | HER2 and molecular selection. |
| Yoshiaki Nakamura | Japan | Japanese precision-CRC network around Yoshino; high recent productivity. |
| Hideaki Bando | Japan | Same network. |
| Hiroya Taniguchi | Japan | Same network. |

**Read the components, not just the rank.** A Group 2 name that rises should rise on scientific and
network *momentum*, not on visibility alone. If they rise on visibility with flat momentum, the board is
measuring output volume wearing a different label.

---

## GROUP 3 — Contamination probes

The scope decision above is only real if it is measurable. These three names test it.

| Probe | The test | Expected |
|---|---|---|
| **Cathy Eng** (Vanderbilt) | Genuine CRC figure who is *also* a major anal-cancer expert. | Surfaces as CRC Established. Her anal-cancer body of work must NOT inflate her CRC score. |
| **Michael Overman** (MD Anderson) | Genuine CRC figure who is *also* central in small-bowel cancer. | Surfaces as CRC Established. Small-bowel work must NOT count toward CRC. |
| **Luis Diaz Jr.** (MSK) | dMMR/liquid-biopsy work is now substantially tumor-agnostic. | Present, but an *implausibly* high rank indicates the query is pulling pan-cancer MSI papers rather than CRC papers — the Tier 4 failure mode. |

### Pre-ingest measurement — RECORD THESE BEFORE THE FIRST RUN

"Her anal work shouldn't inflate her CRC score" is only checkable against a number written down first.
From PubMed, before ingestion:

| Measure | Value | Date measured |
|---|---|---|
| Eng — CRC-only publication count | _______ | _______ |
| Eng — anal-cancer publication count | _______ | _______ |
| Overman — CRC-only publication count | _______ | _______ |
| Overman — small-bowel publication count | _______ | _______ |

After ingest, Eng's and Overman's CRC-tagged publication counts should approximate the CRC-only figures
above, not the totals. A material overshoot is contamination, not enthusiasm.

---

## GROUP 4 — Negative controls

Names that should **not** rank top on a CRC board but plausibly might if retrieval pulls "GI oncology"
broadly rather than colorectal specifically. This is the failure the NSCLC corpus actually had — mesothelioma,
gastric, renal and melanoma entered via unanchored drug terms.

Fill in 2–3 well-known GI oncologists whose work is predominantly **gastric or pancreatic**:

| Negative control | Predominant disease | Expected |
|---|---|---|
| _______ | Gastric | Absent or low. High = query is pulling GI broadly. |
| _______ | Pancreatic | Absent or low. High = query is pulling GI broadly. |
| _______ | Gastric / oesophageal | Absent or low. |

---

## Structural cautions — check components before concluding the corpus is wrong

Two anchors may score oddly for reasons that are not defects. Diagnose before reacting.

- **Alberto Bardelli** (Italy) — translational scientist, not a treating medical oncologist. Resistance,
  liquid biopsy, tumour evolution. Heavy citation weight, but his co-authorship community sits partly
  apart from the clinical-trial network. A surprising rank here may be a community-structure artifact,
  the same class as the eigenvector nationalisation defect found in NSCLC.
- **Qian Shi** (Mayo) — cooperative-group biostatistics. Appears as senior author across many trial
  reports, which can read as senior-author breadth without the scientific-influence profile the scorer
  expects.

Neither is in Group 1 or 2. They are watch items.

---

## Rectal-specific check

A query that silently drops the surgical and radiation rectal literature — total mesorectal excision,
short-course radiotherapy, watch-and-wait, organ preservation — would still pass a validation set made
only of medical oncologists.

| Anchor | Base | Why |
|---|---|---|
| **Julio Garcia-Aguilar** | MSK, US | Rectal cancer, organ preservation, surgical research. Surfaces only if the rectal surgical corpus ingested correctly. |

Radiation oncologists and colorectal surgeons appearing on the board is **correct**, not contamination.
They are real CRC opinion leaders. Do not mistake this for the appendiceal problem — the distinction is
that these people are publishing about colon and rectal cancer, while CRS/HIPEC specialists are publishing
about a different disease.

---

## Results — fill in AFTER the first board, do not edit the sections above

**Board date:** _______  **Corpus size:** _______  **Established cohort size:** _______

### Group 1 outcome
| Anchor | Global rank | Established? | Pass |
|---|---|---|---|
| Kopetz | | | |
| Tabernero | | | |
| Van Cutsem | | | |
| Yoshino | | | |
| André | | | |
| Cremolini | | | |
| Yaeger | | | |

Any FAIL → stop and trace upstream. Do not proceed to Group 2.

### Group 2 outcome
| Anchor | Rising rank | Sci momentum | Net momentum | Sci visibility | Net visibility |
|---|---|---|---|---|---|
| Cercek | | | | | |
| Tie | | | | | |
| Elez | | | | | |
| Sartore-Bianchi | | | | | |
| Nakamura | | | | | |
| Bando | | | | | |
| Taniguchi | | | | | |

**Verdict on the prediction:** _______

### Group 3 outcome
| Probe | CRC pubs tagged | Pre-ingest CRC-only count | Overshoot? |
|---|---|---|---|
| Eng | | | |
| Overman | | | |
| Diaz — rank plausible? | | | |

### Group 4 outcome
| Negative control | Rank | Pass |
|---|---|---|

---

*Companion docs: `TA_BUILD_GUIDE.md` (runbook), `TA_NEW_PLAYBOOK_COMPLETE.md` (deep reference).*
