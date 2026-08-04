# NSCLC Cohort & Part D Anchor — Evidence Tiers

*A record of what the NSCLC community cohort actually is, what evidence supports
membership, and why the previous NSCLC attribution was wrong. Findings and
measurements are from 2026-08-04. This is reasoning, not a build spec — the
structure in §7 is proposed, not implemented. Every number below is load-bearing;
it settled a question or bounds one still open.*

## 1. The problem found

The community profile header displayed two figures: "NSCLC-rel. therapy spend
$10.44M / 3yr" and "NSCLC-rel. therapy vol. ~63 est · 2023." Both are
reproducible — verified today at 899/899 and 692/692 against source — so this is
not a computation defect. The defect is the NSCLC attribution, which the data
cannot support.

Each figure sums a provider's Medicare billing across a curated drug set (the J
and Q codes in `ta_hcpcs_codes` with category `drug_admin`, minus denosumab
J0897 and leuprolide J9217). That set is **general solid-tumour oncology** —
carboplatin, paclitaxel, pembrolizumab, nivolumab, gemcitabine, docetaxel,
bevacizumab — every one of which is given across most solid tumours. CMS claims
carry no indication field, so there is no basis for assigning any of that spend
to a tumour type. A provider is not a tumour type.

The consequence propagates into the score. The two figures are normalised into
`spend_signal` and `volume_signal`, which together carry **40% of the community
composite**, so the ranking inherited the same unsupported attribution rather
than merely displaying it.

Two smaller defects compound this. The exclusion of denosumab and leuprolide
lives **only in an out-of-tree recompute script**; `ta_hcpcs_codes` still
contains both codes, so anything reading the table directly re-includes a bone
agent and a prostate agent. And `is_primary_signal` is miscalibrated — it is set
true for cisplatin, docetaxel, and both bevacizumab biosimilars, all broadly
cross-indication, so the flag is not distinguishing lung-specificity but
something else.

## 2. How cohort membership actually worked

Membership is set by `community_classification.py` through six gates, **none of
them NSCLC-specific**: US country, an NPI present, `cohort_classification IS
NULL`, any therapeutic-area link, any Medicare or Open Payments row, and not
AMC-affiliated. The classification is a single global column, not a per-TA
decision.

The only NSCLC-specific element anywhere in the path is the
`hcp_therapeutic_areas_v2` link to the NSCLC TA, and that link is anchored to
nothing measurable. Of the 6,434 community HCPs carrying it, **zero** have a
publication on it, only **23%** bill any drug in the 31-code set, and **34%**
have no traceable NSCLC signal in any table at all. No committed script writes
those links; their provenance is legacy.

The clean specialty distribution is therefore an accident of where those links
landed, not a property of the rule. The cohort is 4,907 medical oncology, 943
hem-onc, 285 hematology, and a sub-1% tail — but the *same* global rule admitted
19,338 gastroenterologists under Hepatology and 7,561 neonatologists under Rare
Disease. Had the NSCLC link-assignment been as broad as Hepatology's, the NSCLC
cohort would be as contaminated. Gate 3 (`cohort_classification IS NULL`) also
makes classification append-only: once set, an HCP is never re-evaluated or
demoted, so membership only ever grows.

## 3. What was ruled out as an anchor

Five candidate anchors were considered and rejected, each for a concrete reason:

- **Regimen inference from Part B drug co-occurrence.** There is no patient
  linkage, so co-billed codes are not co-administered to a patient; ramucirumab
  is entirely absent below the reporting floor; and 30% of providers billing the
  NSCLC backbone also bill breast agents.
- **The 31-code drug set.** General solid-tumour oncology, as in §1.
- **Disease prevalence.** The CMS by-Provider file carries only
  `Bene_CC_PH_Cancer6_V2_Pct` — six cancers combined into one percentage, with
  no lung breakout.
- **Procedure codes.** Bronchoscopy and EBUS belong to pulmonology and thoracic
  surgery, not to the community medical oncologist this cohort is about.
- **Pemetrexed/durvalumab Part B billing.** Only 56 of 6,434 (0.9%) — too small
  to draw a cohort boundary.

Why Part B administered-drug data cannot attribute spend to a tumour type at all —
and the discipline governing the administered-volume signal that does survive — is
recorded in [MEDICARE_ATTRIBUTION_SIGNAL.md](MEDICARE_ATTRIBUTION_SIGNAL.md).

## 4. The Part D anchor — the finding that works

The anchor that succeeds is the **Medicare Part D Prescribers by Provider and
Drug** file. Two properties make it work where Part B failed.

First, **suppression is on 11 claims, not 11 beneficiaries.** Oral targeted
therapies are dispensed monthly, so a single patient generates roughly twelve
claims a year; a physician with just two EGFR patients clears the floor and
becomes visible. Second, **Part D includes Medicare Advantage**, whereas Part B
is fee-for-service only — so the anchor sees panels that the administered-drug
data structurally cannot.

One implementation hazard, which cost a full round trip today: **match on
`Gnrc_Name` by prefix, not exact string.** CMS records salt forms —
"Osimertinib Mesylate", "Alectinib Hcl", "Afatinib Dimaleate", "Capmatinib
Hydrochloride", "Tepotinib Hcl". An exact-match list of bare stems silently
returns zero rows for the largest drug in the set.

The lung-anchored stems — drugs used in NSCLC and essentially nothing else — are:
osimertinib, alectinib, lorlatinib, sotorasib, adagrasib, capmatinib, tepotinib,
mobocertinib, dacomitinib, brigatinib, ceritinib, crizotinib, afatinib,
erlotinib, gefitinib, amivantamab, and lazertinib.

Deliberately **excluded** from the anchor are selpercatinib and pralsetinib
(RET-fusion, which spans thyroid) and entrectinib and repotrectinib (NTRK, which
spans solid tumours). These are real NSCLC drugs but not lung-exclusive, so they
belong in a supporting tier rather than the anchor.

## 5. Measured results

Against the cohort of 6,479 US community HCPs:

**Anchored physicians by year:** 549 in 2022, 553 in 2023, 727 in 2024. The 2024
rise is unexplained and should be verified against the national prescriber count
before anyone describes it as growth — it may be a data-completeness artefact.

**Persistence.** 485 physicians are anchored in one year only, 267 in two years,
and 270 in all three. The union across all three years is 1,022.

**Oral oncology mix** (cohort mean share of 30-day fills) is dominated by other
tumours, with lung last:

| Category | Mean share of oral fills |
|---|---|
| Breast | 51.6% |
| Heme | 29.9% |
| Prostate | 11.4% |
| GI / renal | 4.1% |
| Lung | 3.1% |

Because lung is the *smallest* category on average, a high lung share is a
genuine outlier rather than the top of a gentle distribution — which is exactly
what makes it a usable signal.

**Lung share of oral oncology fills**, banded: 100 physicians at 30%+, 31 at
15–30%, 119 at 5–15%, 477 under 5%, and 3,002 with none. These bands are computed
on `Tot_30day_Fills`, not `Tot_Clms`: raw claim counts overstate lung because
osimertinib is dispensed monthly while anastrozole is often a 90-day fill.

**Composition of the cohort:**

| Segment | Count |
|---|---|
| Lung-weighted, 30%+ oral share | 100 |
| Anchored, all three years | 270 |
| Anchored, two or more years | 537 |
| Anchored, any year | 1,022 |
| Solid-tumour candidates, no lung oral | ~2,100 |
| Heme-dominant, no lung oral (excludable) | 610 |
| No Part D and no Part B evidence | 2,072 |

## 6. The 2,072

The last row deserves its own note. These 2,072 physicians — 32% of the cohort —
have no Part D prescribing of any kind and no Part B drug rows. They are not
miscategorised specialists: 2,165 of the wider no-oral group are listed as
Medical Oncology. The likely explanations are structural rather than clinical —
billing under an institutional or organisational NPI, Medicare Advantage-heavy
panels invisible to fee-for-service Part B, or retirement/relocation that
append-only classification never demotes.

The honest position is that the platform holds **no evidence** about these
physicians. Any score they currently carry is computed from absent data, and the
tier structure below places them accordingly rather than pretending otherwise.

## 7. Proposed structure (not yet built)

The correction is to stop treating NSCLC as cohort identity and treat it as an
overlay on a base universe. The base universe is **community medical oncology,
Medicare-evident**. NSCLC evidence then grades each member:

- **Anchored** — a lung-only oral therapy prescribed, graded by number of years.
- **Supported** — NSCLC-compatible infused agents, thoracic-enriched therapy, or
  pemetrexed Part B billing.
- **Candidate** — a solid-tumour oral practice with no lung-specific evidence.
- **Excluded** — heme-dominant.
- **Unresolved** — no Medicare evidence at all (the §6 group).

The governing discipline is on absence: a physician treating NSCLC patients whose
tumours carry no targetable mutation prescribes no oral targeted therapy at all.
**Absence of a lung oral is never disproof of lung practice** — it drops a
physician to Candidate or Unresolved, never to Excluded.

## 8. Architectural implication

The base population is one thing; disease evidence is an overlay on top of it.
The same community oncologist appears under NSCLC via osimertinib and under breast
via ribociclib, from the same prescribing file. For adult oncology, then, a new
therapeutic area is largely **a new anchor-drug list run against data already on
disk** — not a new data acquisition.

This degrades predictably as you leave oncology, where there are fewer
single-indication oral anchors to key on, and it fails entirely for paediatrics,
because Medicare is a 65-and-over programme. Rare Disease is the hardest case on
the roadmap for exactly this reason, and should not be scoped as if the oncology
overlay pattern will carry over.

## 9. Open items

- **The 40% score weight.** An outside advisor argued that general-oncology scale
  should not dominate an NSCLC ranking regardless of how the inputs are labelled,
  and proposed lexicographic tiering instead of a weighted blend. Unresolved.
- **Circularity of the 66% "traceable NSCLC signal" boundary.** The TA-scoped
  rows used to measure it may be inherited from the same unanchored TA link
  rather than being independent evidence, in which case the 66% overstates how
  much is genuinely anchored.
- **Part D coverage.** 2022 and 2023 are on disk; only 2024 was used for the
  oral-mix analysis. The multi-year picture should be recomputed before the mix
  shares are treated as stable.
- **Final labelling pass on the two Practice Shape figures.** The interim relabel
  has landed — the header now reads "Selected oncology therapy spend" and
  "Largest single-agent patient count," each with a qualifier that the underlying
  claims carry no indication and are not NSCLC-specific. Only the *final*
  labelling pass is deferred, until the evidence-tier model in §7 is decided, so
  the definitive labels are written once against it.
