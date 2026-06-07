# KNOWN_ISSUES Updates — Jun 6, 2026 (evening session)

This document captures the entries to add, move, or update in `KNOWN_ISSUES.md`
following the Jun 6 evening session (RPC v2→v3 cutover, industry classifier v1,
Scientific Momentum v1, Network Momentum methodology lock).

Apply as a manual paste-merge against the live `KNOWN_ISSUES.md`.

---

## Header update

Change the existing `Last updated` line to:

```
Last updated: Jun 6, 2026 (evening — Rising Star methodology and v3 RPC cutover)
```

---

## 🔴 Critical — additions and updates

### Customer avoidance is the primary project risk
**Discovered:** Recurring; surfaced explicitly Jun 5, 2026; still unaddressed Jun 6

**Symptom:** Three full working sessions on Jun 6 (Established RPC cutover, industry
classifier, Scientific Momentum methodology). All real progress. None of it
involves showing the product to a real MSL prospect. Each session pushes the
platform toward higher methodological rigor while customer feedback remains
absent.

**Path forward:** Unchanged. First outreach to biotech or specialty pharma MSL.
Established cohort is demoable now. Rising Star v3 will be demoable soon and is
no longer a precondition to outreach.

**Status:** Still pending. The "we're not quite ready yet" pattern has now
absorbed an additional full working day.

---

### Themes filter UI ships but pass 2 not committed
*(unchanged from previous version — still pending)*

---

## 🟡 Data quality — additions and updates

### Takefumi Komiya — possible OpenAlex author conflation
**Discovered:** Jun 6, 2026

**Symptom:** Ranks #1 US in Scientific Momentum (NSCLC) with 9 → 20 senior-author
publications and citation volume delta of 661. Affiliation is Parkview Health
(community health system in Fort Wayne, Indiana). Pattern is unusual — community
hospital affiliation paired with academic-level publication output suggests
possible OpenAlex aggregation of multiple HCPs sharing the name.

**Path forward:** Spot-check his publication list, h-index, and lifetime metrics
to determine whether one or multiple authors are conflated. If conflated, this
is a manifestation of the broader 4.6% misattribution rate already noted in
memory.

**Status:** Flagged for diligence. Not blocking — even if conflated, the rest of
the Scientific Momentum top 20 US stands independently.

---

### Industry classifier known false-negative tail (deferred)
**Discovered:** Jun 6, 2026

**Symptom:** v1 classifier accepts edge cases as ACADEMIC by default:
- "Takeda General Hospital" (not Takeda Pharma) — would correctly stay ACADEMIC,
  but pattern is fragile
- Joint pharma-academic centers beyond Pfizer-Granada and Novartis Genomics
  Institute
- Lesser-known biotech subsidiaries (MedImmune classified as ACADEMIC since not
  in pattern list — would need explicit add)
- Industry research-affiliated postdocs at academic institutions

**Path forward:** Only revisit if a specific HCP surfaces as a misclassification
in production Rising Star output. Manual override table to be added if needed.

**Status:** Accepted as v1 tail. Pattern list intentionally constrained to high-
confidence matches; classifier solves the "AstraZeneca scientist surfacing as
top Rising Star" problem and does not need to be a publication-quality ontology.

---

### Industry/government classifier v1 shipped — Jun 6
*(Move to Resolved section — see below)*

---

## 🔵 Methodology / strategic — additions and updates

### Rising Star scoring framework — Scientific Momentum v1 SHIPPED, Network Momentum DESIGNED, composite scoring PENDING
**Discovered:** Jun 5, 2026 (advisor proposal); Scientific Momentum shipped Jun 6;
Network Momentum methodology locked Jun 6 (computation pending centrality
completion)

**Updated status:**

1. **Year-bounded historical centrality** — SHIPPED. `network_centrality_scoring.py`
   modified to accept `--start-year` and `--end-year`. `hist_2016_2020` window
   computed (55,749 NSCLC HCPs). `recent_2021_2025` window dry-run validated;
   real write in progress at session end.

2. **Industry employee filter** — SHIPPED as `hcp_industry_classification_v1`.
   269,392 HCPs classified. Rising Star scoring filters to ACADEMIC only.

3. **Scientific Momentum scoring** — SHIPPED as `hcp_scientific_momentum_v1`.
   1,907 eligible NSCLC HCPs. Methodology locked at:
   - 50% Publication Velocity Delta (senior-author count)
   - 30% Citation Volume Delta (recent total citations − historical total)
   - 20% Authorship Progression Delta (senior author % shift)

   Eligibility gates: ACADEMIC classification, career_years <= 15,
   >= 5 publications in each window.

   Citation rate delta retained as diagnostic column (`early_citation_rate`,
   `recent_citation_rate`) but NOT scored — found to systematically penalize
   high-velocity rising stars due to time-since-publication asymmetry.
   Replaced with citation volume after validation case Xiuning Le moved from
   rank 1709 (rate-based) to rank 24 / 98.79th percentile (volume-based).

4. **Network Momentum scoring** — DESIGNED, not yet implemented. Methodology:
   - 50% Eigenvector Percentile Delta
   - 30% Degree Percentile Delta
   - 20% Betweenness Percentile Delta

   Eligibility: ACADEMIC, career_years <= 15, present in both centrality
   windows with >= 20 collaborators in each.

   Target table: `hcp_network_momentum_v1` (SQL prepared, awaiting recent
   centrality write to complete before running).

5. **Rising Star v3 cohort recompute** — PENDING. Will combine Scientific
   Momentum + Network Momentum with the visibility floor (current Scientific
   Influence + Network Influence) per the 70/30 framework. Output table
   `hcp_rising_star_ranks_v3` (or equivalent naming) parallel to Established v3.

6. **Trajectory thresholds** — PENDING. Empirical, requires distribution review
   of the composite momentum scores. Will define Breakout Candidate ↑↑ /
   Accelerating ↑ / Steady → / Plateauing ↓ cutoffs.

7. **RPC + frontend cutover** — PENDING. Same v2→v3 pattern as Established.
   `get_rising_star_filtered` RPC needs repoint, frontend pill layout and
   `ScoreBreakdownV3Rising` component creation.

8. **Trajectory scrape (Tavily, top 250 NSCLC)** — PENDING. Sequence-locked to
   run AFTER Rising Star v3 scoring lands. Score first, scrape second.
   Evidence enrichment only, not a scoring driver.

9. **Evidence rendering on detail page** — PENDING.

**Validation HCPs:**
- Xiuning Le (MD Anderson) — Scientific Momentum percentile 98.79
  ✓ Validated. Used as primary canary during methodology development.
- Daniel Almquist — was tagged #1 rising star in earlier (broken) v2 scoring.
  Validation question: does he survive under v3? Pending.
- US top 20 currently includes: Komiya (flagged for conflation check),
  Marmarelis (Penn), Han (Stanford), Le (MD Anderson), Lamberti (Dana-Farber),
  Patil (Colorado), Manochakian (Mayo FL), Leal (Emory), Yang (MGH),
  Sanborn (Providence), Okusanya (Jefferson), Ernani (Mayo AZ), Lam (Hopkins),
  Wong (UCSF), Elamin (MD Anderson), Mott (MD Anderson), Parikh (Mayo),
  Hall (UVA), Singh (Penn), Riess (UC Davis).

**Estimated remaining effort to demoable Rising Star:** 2-4 hours for steps 4-7
once centrality finishes. Step 8 deferred (depends on Tavily Basic purchase).

---

## ⚪ Pipeline / ops — additions and updates

### Schema drift in hcp_scientific_momentum_v1 — Cursor invented column names
**Discovered:** Jun 6, 2026

**Symptom:** During Scientific Momentum script generation, Cursor produced an
INSERT statement referencing columns not present in the originally-spec'd table
schema (`early_start_year`, `early_end_year`, `recent_start_year`,
`recent_end_year`, `early_senior_pubs`, `recent_senior_pubs`,
`early_senior_author_pct`, `recent_senior_author_pct`,
`pub_velocity_percentile`, `citation_velocity_percentile`,
`authorship_progression_percentile`, `enrichment_run_id`). Cycled through
multiple ALTER attempts before eventually dropping and recreating the table to
match the script's expected schema.

**Lesson for future tables:** When generating scoring scripts via Cursor, ask
Cursor to output the full intended INSERT column list FIRST, then create the
table matching that list. Avoids the schema-chase pattern.

**Status:** Resolved by DROP + CREATE. No data loss (table was empty).

---

### Anthropic prompt caching not enabled
*(unchanged from previous version — still pending)*

---

## ✅ Resolved (recent — Jun 6 evening session)

### Established feed RPC repointed to v3 — Jun 6
The `get_established_filtered` RPC (both 6-arg and 7-arg overloads) was reading
from `hcp_established_ranks_v2` and ordering by `normalized_score DESC`, despite
the rest of the application already reading v3 cohort scores via separate
enrichment. Result: card badges showed v3 scores but feed order and #N rank
badges showed v2 ordering (Heymach incorrectly at #1 US, Jänne at #9, etc.).

Fix: Rewrote both RPCs to source `rank` and `cohort_score` from
`hcp_established_ranks_v3`, JOIN `hcps_v2` for HCP fields, LEFT JOIN
`hcp_author_metrics_for_cards_v2` for the 7-arg variant. Dropped the LEFT JOIN
to `hcp_established_ranks_v2` after a `scope_value IS NOT DISTINCT FROM` join
caused PostgREST 500 timeouts (Supabase SQL editor tolerated the slow query;
PostgREST's 8-second timeout did not). `trial_score` now returns NULL on
Established feed responses.

Post-fix verified: Jänne #1 US, Ramalingam #2, Riely #3, Ou #4, Herbst #5,
Heymach #8. Pagination and sort behavior intact.

Commit: not yet — migration file `migrations/2026_05_28_get_established_filtered_v3.sql`
created by Cursor but ALTER history was DROP + CREATE in Supabase directly.

### trial_score now NULL on Established feed responses — Jun 6
Side effect of the RPC repoint above. `trial_score` was the only v2-specific
field still rendered on cards. Was removed from the join path to fix the
PostgREST timeout. Card pills for Established are now SCIENTIFIC / NETWORK /
PHARMA — `trial_score` is unused by the rendered UI. Dead references in the
codebase should be cleaned up in a separate pass.

**Status:** Cleanup deferred. Not blocking — no rendered UI references the field.

### Industry/government classifier v1 shipped — Jun 6
`hcp_industry_classification_v1` table created and populated for 269,392 HCPs.
Pattern-based substring + regex matching against `institution_normalized`.

Distribution:
- ACADEMIC medium: 224,436 (83%)
- INDUSTRY high: 2,612 (1%)
- INDUSTRY low: 28
- GOVERNMENT high: 1,236 (0.5%)
- GOVERNMENT medium: 3
- UNKNOWN low: 41,077 (15%)

Classifier script: `hcp_industry_classifier.py`. Rising Star scoring filters
`WHERE classification = 'ACADEMIC'`. Established scoring will filter
`WHERE classification IN ('ACADEMIC', 'GOVERNMENT')` once incorporated (deferred
— Established v3 is already locked, doesn't need re-running unless we want to
exclude the 1,236 GOVERNMENT HCPs from that cohort).

Two prefix-overlap false positives surfaced and fixed in dry-run:
- "Bayer" matching "Bayero University Kano" → fixed with `Bayer (` paren-anchor
- "National Cancer Institute" matching "Osaka International Cancer Institute" →
  fixed with `\bNational Cancer Institute\b` word-boundary regex

### Scientific Momentum v1 shipped — Jun 6
`hcp_scientific_momentum_v1` table created. 1,907 eligible NSCLC ACADEMIC HCPs
with career_years <= 15 and >= 5 publications in each of 2016-2020 and 2021-2025
windows.

Methodology shipped:
- 50% Publication Velocity Delta (senior-author paper count, recent − early)
- 30% Citation Volume Delta (total citations, recent − early)
- 20% Authorship Progression Delta (senior author %, recent − early)

Citation rate delta retained as diagnostic but explicitly excluded from
scoring after validation showed it systematically penalizes high-velocity
rising stars (Le moved from rank 1709 under rate to rank 24 under volume).

US top 20 includes Le (MD Anderson), Marmarelis (Penn), Han (Stanford),
Lamberti (Dana-Farber), Patil (Colorado), Manochakian (Mayo FL), and other
plausible US academic rising stars. Komiya (Parkview Health) ranks #1 US and
is flagged for OpenAlex conflation check.

### Year-bounded historical centrality computed — Jun 6
`network_centrality_scoring.py` modified to accept explicit `--start-year` and
`--end-year` flags. `hist_2016_2020` window computed for NSCLC (55,749 HCPs
in graph, 584,781 co-authorship edges). Top historical-network names align
with expected era leaders (Wistuba, Yi-Long Wu, Nakagawa, Heymach, Park).

`recent_2021_2025` window write in progress at session close.

---

## How to use this doc

Same as before — append issues as discovered, move to Resolved at fix time,
review at start of working sessions for prioritization.

