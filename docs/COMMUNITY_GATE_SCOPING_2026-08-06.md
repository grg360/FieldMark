# Community qualification gate — per-TA scoping (2026-08-06)

The standing rule (`sql/community_qualification_gate.sql`, 2026-07-25): the gate
is **NSCLC-only** — `patient_volume >= 500 OR pharma_engagement > 0`, applied at
the read layer (four `get_community_filtered*` overloads, the app-layer
`COMMUNITY_GATE_OR` constant, and narrative selection). Other TAs were
deliberately left ungated "until their own distributions are examined." This
file is that examination, for every TA with community substrate. All figures
measured live 2026-08-06, US scope.

**Bottom line: no gate change is needed today, anywhere.**
- **AD** (visible): no gate — different substrate, and the failure mode the
  gate exists for cannot occur on a non-ranked directory.
- **Hepatology** (not visible): the NSCLC gate shape transfers when it goes
  visible; floor to be derived then (300–500 band).
- **Rare disease** (not visible): must NOT receive any volume floor — the
  volume axis does not exist there; 71% of the board is unmeasured, not
  unqualified.

---

## NSCLC — live gate, working as designed (baseline)

| measure | value |
|---|---|
| US board rows | 6,480 |
| qualify under the live rule | 4,722 (72.9%) |
| both-zero (career-stage floor alone) | 1,414 (21.8%) |
| sub-500 volume, no engagement | 344 |
| volume distribution (holders) | p25 310 · p50 757 · p75 1,580 · p90 2,809 |

The both-zero 21.8% is the misclassified-academic signature (Ozols, Karp,
Shanafelt) the gate was built to remove from a **ranked board**. No change.

## Atopic Dermatitis — visible; the TA the standing rule was waiting on

AD community does **not** live in `hcp_community_ranks_v2` (zero rows). It is
the `community_practitioners` NPPES directory — 19,351 dermatology-taxonomy
practitioners (16,275 general dermatology; procedural, MOHS, dermpath,
pediatric derm making up the rest), rendered by
`get_community_directory_filtered` and labelled in code and copy as
"DIRECTORY, not a ranking."

Neither NSCLC gate axis transfers as-is:

- **patient_volume: the axis does not exist for AD.**
  `hcp_medicare_by_ta_v2` covers NSCLC and hepatology only, and it measures
  Part B administered drugs. AD's core agents (dupilumab and the other
  biologics/JAKs) are predominantly self-administered pharmacy-benefit drugs —
  a Part B volume axis will never measure AD practice. Building one would
  require Part D ingestion, a separate project.
- **pharma_engagement: the axis exists**, NPI-keyed via
  `community_practitioner_payments`: 14,165 of 19,351 (73.2%) hold a 3-yr Open
  Payments record > 0, and 11,506 (59.5%) hold **AD-drug-specific** payments
  (p25 $149 · median $545 · p75 $1,559 · p90 $3,402 over 3 yrs).

**Recommendation: no qualification gate for AD.** The NSCLC gate exists
because a career-stage scoring floor ranked misclassified academics onto a
ranked leaderboard. The AD directory cannot exhibit that failure mode:
membership is taxonomy-selected (NPPES dermatology codes) with a career
ceiling already applied at build time (career_stage_years fully populated,
zero rows over 30), and nothing ranks. If a qualification cut is ever wanted,
`ad_drug_payments_3yr > 0` is the ready axis (11,506 rows) — but it should
ship as a visible directory **filter**, not a silent read-layer exclusion; on
a directory, silent exclusion reads as data loss, not curation.

## Hepatology — not visible; gate shape transfers when it is

20,400 US board rows in `hcp_community_ranks_v2`.

| measure | value |
|---|---|
| would qualify under the NSCLC rule | 15,009 (73.6%) |
| both-zero (career-floor signature) | 4,205 (20.6%) |
| sub-500 volume, no engagement | 1,186 |
| volume distribution (13,155 holders) | p25 294 · p50 621 · p75 1,074 · p90 1,647 |

The both-zero share (20.6%) matches NSCLC's (21.8%) — the same misclassified
population exists and the same gate logic applies. The volume distribution is
thinner: a 500 floor sits at ~p43 of hepatology volume-holders vs ~p38 for
NSCLC, so a straight copy is slightly more aggressive there. When hepatology
becomes visible, extend the per-TA predicate with a floor derived from where
its career-floor-only tail actually sits — the 300–500 band is where to look.
Nothing to do while it stays invisible.

## Rare disease — not visible; the volume floor must never extend here

13,298 US board rows. `patient_volume` is zero/null for **all** of them — the
Medicare→TA drug mapping does not exist for rare disease (1 row in
`hcp_medicare_by_ta_v2`). The NSCLC rule would keep only 3,863 (29.1%), all
via pharma engagement — the 71% cut previously observed. Those 9,435 both-zero
rows are **unmeasured, not unqualified**: absence of a volume axis is not
absence of a practice. A rare-disease gate needs its own qualification axis
built first; until then it stays ungated by design.

---

## What this means for the code

Nothing changes today. The read-layer predicate (`therapeutic_area_id <>
NSCLC OR volume/engagement`) is already a no-op for every other TA's rows, in
all four RPC overloads, `frontend/src/lib/api.ts`, and
`scripts/narrative/generate_narratives_v2.py`. This file supersedes the
"examine when visible" TODO for AD (examined: no gate) and pre-stages the
hepatology decision.
