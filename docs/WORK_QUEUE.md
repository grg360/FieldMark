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
   declared non-null, which hid it). The established and rising profiles
   presumably have their own narrative dependency — check whether they
   guard it, and whether their `*Profile`/RPC types honestly mark the
   narrative object nullable.
