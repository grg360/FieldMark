# NSCLC community cohort — the scoring freeze (2026-08-06)

**Report only. No changes made.** Question posed: `community_scoring.py`
gates on the dead `hcps_v2.cohort_classification = 'community'` column, is off
the weekly cycle, and its output (`hcp_community_scores_v2`) is the sole feed
for `community_ledger` and — transitively — `hcp_community_ranks_v2` and
`hcp_nsclc_evidence_tier_v1`, which are both **views** over it. Membership is
frozen at whatever the dead column held the last time someone ran the script
by hand. The v2 taxonomy holds 49,979 NSCLC community members; the ledger can
see 6,435 of them (12.9%). Same freeze as rising, on a 7.8× larger population.

Confirmed live 2026-08-06:

| | count |
|---|---|
| v2-community, NSCLC-scoped (`hcp_cohort_classification_v2`) | 49,979 |
| currently scored (still v2-community) | 6,435 |
| **unscored** | **43,544** |

---

## 1. What a gate move to `hcp_cohort_classification_v2` actually surfaces

The scoring script writes a score row for every (hcp, TA) pair with a TA link —
so all 43,479 unscored entrants with an NSCLC link *would* get a score row.
But a score row is not board visibility: the read-layer NSCLC gate
(`patient_volume >= 500 OR pharma_engagement > 0`, plus US + TA link) decides
who the ledger shows. Applying every threshold to the 43,544:

| filter | passes |
|---|---|
| unscored v2-community (NSCLC link) | 43,479 |
| has an NPI number | **1,260** |
| US country | 6,537 |
| any clinical activity (Part D or Part B drug row) | 268 |
| NSCLC volume ≥ 500 | 55 |
| lifetime pharma > 0 | 700 |
| **clears the read gate AND US AND TA-linked → reaches the board** | **701** |

**The freeze is real but the board-visible population behind it is ~701, not
43,544.** The reason is upstream, not the freeze: **only 1,260 of the 43,479
have an NPI at all.** The rest entered the corpus through publications
(OpenAlex) and were classified "community" by career-structure (low pub count,
not rising/established) but were never NPI-matched — so they have no Medicare,
Part D, or Open Payments footprint and nothing for a CMS-derived community
score to rank. They are community *by taxonomy*, invisible *by data*, and a
gate move does not conjure a clinical record for them.

### Evidence-tier landing of the 701 new board entrants

Simulated with the exact grade logic of `hcp_nsclc_evidence_tier_v1`:

| tier | new entrants | (current board) |
|---|---|---|
| unresolved | 489 | 2,217 |
| candidate | 184 | 2,597 |
| **anchored** | **19** | 980 |
| **supported** | **9** | 88 |
| — | — | heme_dominant 598 |

The **default ledger is anchored + supported**, so of the 701, the default
view grows by **28**. The full board (all tiers) grows by 701 — a ~15% lift on
the 4,722 currently qualifying, concentrated in the candidate/unresolved tail.

## Is there a Marmarelis in the 43,544?

In the community sense — a high-volume NSCLC treater invisible only because of
the freeze — **yes, about 28 of them**, the anchored/supported entrants. Named,
top by NSCLC Medicare volume:

| name | state | NSCLC 3yr benef. | anchor drug(s) |
|---|---|---|---|
| Joseph McLaughlin | CT | 1,922 | osimertinib |
| Sendhilnathan Ramalingam | NC | 1,153 | osimertinib |
| Rohit Bishnoi | FL | 729 | capmatinib, osimertinib |
| Anthony P. Conley | TX | 614 | afatinib |
| Toby C. Campbell | WI | 610 | afatinib, alectinib, capmatinib, ceritinib, osimertinib (+) |
| Shetal Patel | NC | 379 | osimertinib |

McLaughlin (1,922 EGFR-treated beneficiaries on osimertinib) and Campbell
(five distinct targeted-therapy stems) are genuine high-signal community
treaters the frozen board cannot see today. This is a real Friday finding —
but it is ~28 names on the default view, not a hidden thousand. The
scientific-momentum "Marmarelis at #1" story does not repeat here, because the
community board is CMS-derived; it has no momentum axis to surface.

## 2. Runtime and cost of a full run

**API/LLM cost: $0.** `community_scoring.py` is pure arithmetic
(min-max normalize + weighted composite) — no model calls.

**Runtime: read-bound, ~15–25 min single-threaded.** It already pages the full
tables today; the gate move barely changes the read volume:

| table read (full, 1000/page) | rows | pages |
|---|---|---|
| `publication_authors_v2` | 2,030,914 | 2,031 |
| `hcp_therapeutic_areas_v2` | 286,446 | 287 |
| `hcp_medicare_by_ta_v2` | 19,520 | 20 |
| `hcp_open_payments_summary_v2` | 30,185 | 31 |

`publication_authors_v2` dominates (~2,031 PostgREST round-trips) and is read
in full **regardless** of the gate. The gate move changes only the in-memory
community id-set (6.5k → 59.5k, negligible) and the write count (6,435 →
~49,979 NSCLC upserts = ~100 batched calls). No cost cliff.

## 3. Do the evidence-tier view and Part D anchor cover new entrants?

**No re-run required.** Both `hcp_nsclc_evidence_tier_v1` and
`hcp_community_ranks_v2` are **views** whose cohort CTE reads
`hcp_community_scores_v2` — the instant an entrant gets a score row, both views
recompute it live and tier it. The claims substrate is already broad: the Part
D ingest (`part_d_oncology_ingest.py`) scopes its cohort to *every NPI in
hcps_v2*, not to community members, and `hcp_hcpcs_detail` is likewise
HCP-keyed across the corpus. Of the 6,537 US unscored, 218 already have Part D
rows and 890 have HCPCS rows — those tier correctly today with no ingest work.
Running the Part D / HCPCS ingests again is a data-*freshness* action (new
program years, newly-NPI'd HCPs), not a prerequisite for tiering the entrant
set. The NPI-less majority tier as `unresolved` honestly.

## 4. Should `community_scoring.py` be on the weekly cycle?

It is **not** in `reingest_cycle.py`'s STAGES today (unlike rising/established,
which recompute weekly). Given $0 API cost and ~20 min wall-clock, the dollars
argument for adding it is trivial. Two real conditions before it goes on-cycle:

1. **Gate fix first.** On-cycle with the dead-column gate would faithfully
   re-freeze the same 6,435 every week. The gate must move to
   `hcp_cohort_classification_v2` (this is the sixth sighting of the dead
   column; the other five are logged) as part of the same change, or the stage
   is a no-op.
2. **Snapshot discipline.** The script re-normalizes 0–100 within cohort every
   run, so ranks shift each run exactly as rising's did. It must take a
   weekly snapshot the way `take_weekly_snapshot.py` does for the other two
   cohorts, and couple to the Medicare/OP refresh stages that feed it (run
   *after* them, like narratives run after scoring).

**Per-cycle cost if added: $0 API, ~20 min wall-clock**, non-blocking (same
WARN-not-FAIL treatment as the other billed/heavy stages).

---

### Recommendation (not executed)

The board-visible upside is bounded (~701 full board, ~28 on the default
ledger) and the true blocker is NPI coverage upstream, not the freeze. But the
28 anchored/supported entrants are real, named, high-volume treaters worth
surfacing before Friday. A one-off `--execute` run with the gate pointed at
the v2 taxonomy would surface them today at $0 and ~20 min; making it a weekly
stage should wait on the gate fix + snapshot discipline above.
