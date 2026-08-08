# FieldMark — work queue

As of 2026-08-03, end of day. Ordered by what unblocks what.

---

## In flight

**Academic profile restructure** — Code building now. Absorbs the
Field Insights register migration, the `getEstablishedScoreBreakdown`
argument bug, and the Belief Profile header count mismatch.

**Publications redesign** — frames ready, not started. Last of the
three migration builds.

---

## Then: the surface audit

Offline, surface by surface. Capture as a file, not a chat list.

Known items already, so they are not rediscovered:

- Publication timeline has no year labels
- Home: FOLLOW-UPS OVERDUE 6 / OPEN 6 reads as twelve at a glance
- SkyView is called three things — nav SKYVIEW, strip chip
  Telescope, canvas Skyview. Rename stages 3 and 4 unrun (route
  segment `/telescope/`, file and component names)
- Congress: "TA Relevance" should read "NSCLC Relevance"; Hot
  Topics does not match the height of the two Voices components
- Community profile — confirm whether it is on the current register
- Bundle is a single 5.59MB chunk (1.14MB gzipped), no code
  splitting. Every route pays for the whole app. Grew 32% over the
  weekend.

Use the **absence vocabulary** as the checklist — one phrase per
absent state, never a blank, never a zero, never a bare em-dash.
Most polish items will be violations of it.

---

## Build: trials

Data is audited. 280 open lung trials with a ranked NSCLC
investigator, 38 of 51 roster assets matching on exact intervention
names, 69 industry-sponsored. Status refresh runs weekly as stage 11;
discovery is still a manual crawl, last run 2 August.

Three things to resolve before it surfaces:

1. **No correction path on `trial_investigators_v2`.**
   `match_confidence` uses `GREATEST(new, existing)` and there is no
   delete, so a wrong match is permanent and fixable only by manual
   SQL. No `verified_by_human`. Stricter than `dol_matches_v2`, which
   at least has the gate. Apply the same provenance treatment as NPI.
2. **The role field cannot say Principal Investigator.** ~63 PI rows
   per trial — CT.gov labels every site PI that way. Claiming someone
   leads a trial when they run one site is the wrong claim.
3. **The 13 "zero-trial" assets all have trials.** Tarlatamab 15,
   Crizotinib 14. They are absent because no ranked US established
   investigator matched. "No open trials" is false; "no ranked
   investigator matched" is true.

Product decision: Drugs Index section, or standalone surface? The
Drugs Index has no drug→HCP linkage today, and trials would supply it
via a stated fact on ClinicalTrials.gov rather than an inference from
substring matching.

---

## Build: Medicare regimen signal

Substrate landed 3 August — `hcp_hcpcs_detail` topped up and
self-maintaining as stage 12, `hcp_medicare_by_ta_v2` rebuilt on
honest semantics, Administered Volume rendering.

The advisor's framing — make the signal regimen-aware, not merely
drug-weighted:

```
Pemetrexed alone/repeatedly                   High
Pemetrexed + platinum                         Very high
Pemetrexed + platinum + pembrolizumab         Very high

Docetaxel alone                               Low–moderate
Ramucirumab alone                             Moderate
Docetaxel + ramucirumab                       High

Carboplatin alone                             Very low
Carboplatin + paclitaxel                      Low–moderate
Carboplatin + nab-paclitaxel + pembrolizumab  High
```

The constraint: CMS aggregates per provider, per HCPCS code, per
year, with **no patient linkage**. A regimen cannot be observed, only
inferred from co-occurrence — overlapping beneficiary counts,
consistent proportions, year-over-year stability.

Two steps:

1. **Co-occurrence, descriptively.** "Bills pemetrexed, carboplatin
   and pembrolizumab in the same year, at proportions consistent with
   combination use" is a fact. Buildable now, useful alone.
2. **Regimen inference** on top, with the advisor's ordinal rubric,
   and his review of the output before it renders.

---

## Build: "Contributed to / Research footprint" section

For HCPs with no first/senior-authored NSCLC corpus, who get no
scientific-positioning surface at all today (~23% of the ranked set).
A deliberate build, **not** a filter flip on the extractor.

Origin: the middle-author question (2026-08-03). Dropping the
first/senior filter in `extract_scientific_positions.py` was rejected —
the ownership claim lives in `generate_scientific_position_synthesis.py`,
hardcoded to "senior or first-authored" and asking for themes "the
investigator has advanced." A contributing position would feed an
advocacy synthesis that asserts ownership no matter how honestly the
row beneath it is labelled. That dilutes the cards that matter to buy
rows in a list. We stay at 77% coverage of a trusted claim.

The scoped feature is different: contributing positions rendered under
an explicit **non-advocacy** header, never flowing into Strongly
Advocates / Frequently Raises. Full staging — migration, extractor
CASE, synthesis partition, and the card/drawer labels (`Contributing
Author` / `Contributed to` with framing gloss) — is in
`docs/design/middle-author-attribution-proposal.md` (pieces 1-4 plus a
new UI section).

---

## Deferred: evidence-tier follow-ups (2026-08-04)

Logged during the community evidence-tier build. Not for tonight.

1. **Narrative coverage gap under evidence tiers.** 5,868 of the 6,480
   community cohort (91%) have no `hcp_narratives_v2` row for `nsclc`.
   `generate_narratives_v2.py` selects top-N **by rank**, which was fine
   when the ledger ranked by score and nobody scrolled far. With evidence
   tiers, an ANCHORED physician at rank ~900 is now a legitimate
   destination and has no narrative. The generation cut may need to follow
   **tier** rather than rank (e.g. all anchored + supported, then top-N of
   the rest). The profile renders a coverage-fact absence in the WHY THIS
   PRACTITIONER slot in the meantime.

2. **Same crash on the other cohort profiles?** The community profile
   dereferenced `p.narrative` unguarded (fixed 2026-08-04; the type was
   declared non-null, which hid it). Community practice-first
   (`PracticeFirstProfile`) had the identical deref — surfaced by the
   now-honest nullable type and fixed 2026-08-04 with the same `?.` guard.
   STILL OPEN: the established/academic profile (`HcpProfileBrief`) and any
   rising profile — not yet verified for the same narrative dependency or
   for honestly marking the narrative object nullable.


## Community rank: the definitional fork (Part D scoring)

STATUS: Queued — scoping session, not a build. Not urgent (demo done,
nothing ships on this). Do NOT start as a code task.

THE FORK — one unmade decision under two symptoms:
The platform runs two rank systems that disagree, both honest:
- Tier-first order (ledger + community_tiered_ranks RPC): orders by
  evidence tier (anchored → supported → …) → recurrence → evidence
  rank. Composite score is only a tiebreak here.
- Part-B composite (hcp_community_ranks_v2): patient_volume =
  ta_beneficiaries_3yr_total @ 0.40, pharma 0.30, setting 0.15,
  career 0.10, pubs 0.05. Zero Part D input, ever (grep-confirmed
  Aug 7: community_scoring.py has no tier/part_d/anchor reference).
They answer different questions — "evidence of NSCLC practice" vs
"measured volume of it" — and both got labelled "rank." The scoping
session's FIRST job is to pick what community rank means. The code
falls out of the answer; it cannot be tuned into existence.

EVIDENCE ON THE TABLE (from Aug 7 audit — start here, don't re-derive):
- 176 community HCPs: anchored oral practice, patient_volume = 0,
  parked ~#2,000s composite.
- Score plateau ~38.45: with volume zeroed, the 176 compress into an
  undifferentiated band. Mohamed (432 lung fills) and Weinhold (12
  fills) land ~same score — composite flattens a 40× real difference
  to noise.
- Uyeki is NOT the exemplar. #62, 5,394 Part B beneficiaries — orals
  ON TOP of a large infusion practice. System sees him every way. The
  gap's real victims are Mohamed-shaped: oral-only, Part-B-invisible.
- McLaughlin discrepancy (logged post-demo-prep) is this fork
  surfacing, not a standalone bug.

THE GOVERNING CONSTRAINT:
~70% of the US community board has zero Part D by construction. Folding
Part D volume into the composite naively re-ranks the whole cohort
around a signal most structurally lack — the Open-Payments trap
(ranking a cohort on a signal 7% have), which we've caught before. The
tier system already dodges this by keeping Part D parallel, not folded.
Candidate resolution to test, not assume: promote the tier to
authoritative, make the composite the tiebreak it already functionally
is, relabel both surfaces so they stop implying one rank exists. May be
small in code, large in decision. Do not scope a month of work before
confirming the answer isn't "declare one system authoritative + name
them honestly."

WHAT THE SESSION MUST DECIDE (in order):
1. What does community rank mean — evidence, or measured volume?
2. Given (1), do the two systems reconcile into one, or stay
   deliberately separate and get relabelled?
3. Only if volume: how does a Part-D-native signal enter without
   capsizing the 70% who lack it — parallel layer, or weighted with
   an absence-honest floor?

CONSTRAINTS: schema-first. Absence vocabulary — zero Part D is
suppressed / no-Part-D-patients / unmatched, three different facts,
never a bare zero. Report before any build. This entry is the problem
statement; the session starts from here.