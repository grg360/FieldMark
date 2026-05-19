# FieldMark Session Handoff — May 12, 2026 (Late Night)

**Picks up from:** `session_handoff_2026_05_12_evening.md` (8pm checkpoint)
**Session ran:** ~8:30pm to ~11:30pm
**Next session:** May 13, 2026

---

## TL;DR — Three substantive changes landed tonight

1. **Slope-based citation trajectory metric replaced the horizon-expanded average-density version.** New function consumes `publications.citation_counts_by_year` directly. Per-paper slope from last 3 complete years (2023, 2024, 2025), age band 2-7 years, requires ≥2 qualifying papers per HCP. The function and supporting code change (publications SELECT, gate removal) are in `scoring_pipeline.py`.

2. **Composite weights reweighted toward trajectory.** Citation trajectory went from 20% → 35%. Pub velocity from 25% → 15% (deweighting the known-degenerate dimension). H-index from 5% → 0% (high h-index correlates with established, not rising). Trial unchanged at 25%. Sums to 100%.

3. **Scoring re-ran with both changes.** `hcp_scores` table now reflects slope-based trajectory + new weights.

---

## What the empirical output shows

**Hepatology**: Trajectory dimension is working. New top 10 surfaces Juan Pablo Arab (CitTraj=98), Diana Romero, Seung Up Kim, Cynthia Guy, Ulrich Beuers, C. Wendy Spearman — all with strong slope signal. These are genuinely-rising hepatology figures.

**BUT**: The top 20-30 also surfaces clearly Established hepatologists with high career publication counts whose recent work is gaining citations:
- Arun J. Sanyal at #11 (1383 career pubs) — NASH guideline author, established
- Naga Chalasani at #36 (841 career pubs) — NAFLD guideline lead, established
- Manal Abdelmalek at #12 (346 career pubs) — Mayo NASH leader
- Christos Mantzoros at #31 (958 career pubs) — established endocrine/NASH
- Christopher Bowlus at #27 (430 career pubs) — established
- Philip Newsome at #29 (561 career pubs) — major MASH researcher
- Mazen Noureddin at #69 (540 career pubs) — established
- Vincent Wong at #91 (519 career pubs) — major NAFLD researcher

The trajectory metric correctly identifies "researchers whose work is gaining citations now" — but that includes both early-career rising stars AND established senior researchers whose recent papers are gaining attention because they're senior. The methodology needs an additional filter to separate these.

**NSCLC**: Trajectory column is overwhelmingly 4.42 (the normalized "no qualifying data" value). 35% weight on a dimension that's mostly absent didn't change rankings much. Still dominated by trial activity.

**Rare Disease**: Same as NSCLC, possibly worse. CitTraj is uniformly 4.42 across nearly the entire top 100. Structural data limitation (small research communities, few citing papers).

---

## The next clear move (tomorrow's first task)

**Add total_career_pubs penalty to career_multiplier function.**

Current `first_pub_year_override_multiplier(first_pub_year)` returns 1.30 / 1.15 / 1.00 / 0.75 based on first_pub_year. It needs a second signal because first_pub_year is data-coverage-limited for the senior researchers we're trying to filter out.

Proposed:

```python
def first_pub_year_override_multiplier(
    first_pub_year: Optional[int],
    total_career_pubs: Optional[int]
) -> float:
    # Establishment override: high career publication count signals established
    # KOL regardless of (possibly data-coverage-limited) first_pub_year.
    if total_career_pubs is not None and total_career_pubs >= 200:
        return 0.75
    
    # Standard career-age based logic
    if first_pub_year is None:
        return 1.0
    if first_pub_year >= 2020:
        return 1.30
    if 2017 <= first_pub_year <= 2019:
        return 1.15
    if 2011 <= first_pub_year <= 2016:
        return 1.0
    return 0.75
```

The threshold (200) is a judgment call. Decision rationale:
- Sanyal 1383, Chalasani 841, Mantzoros 958, Wong 519, Noureddin 540, Newsome 561, Abdelmalek 346, Bowlus 430 — all caught at threshold = 200
- Lower threshold (100) catches more but risks penalizing mid-career rising stars
- Higher threshold (300) misses Abdelmalek

This also requires updating the call site in `compute_scores` to pass total_career_pubs as the second argument.

Estimated work: 15 minutes code + 15 minutes Cursor cycle + 15 minutes scoring re-run = ~45 minutes total.

**Important framing note for the methodology**: This is NOT "filter out old people." The legitimate framing is "deweight HCPs with substantial career publication accomplishment because they're already on every traditional KOL database — Rising Stars is for HCPs MSL teams need help identifying."

---

## Database state at end of session

- `hcps`: unchanged from 8pm checkpoint
- `hcp_scores`: re-computed with slope-based trajectory + new weights
- `scoring_pipeline.py` modifications:
  - Line ~316: `citation_trajectory_raw` function replaced with slope-based version
  - Around line ~480: external citation_trajectory gating removed (function has internal gate)
  - Around line ~580: composite weights changed to 15/35/25/10/10/0/5
  - publications SELECT now includes citation_counts_by_year

---

## Key empirical findings tonight

**Citation trajectory data is sufficient for the methodology to work.** Earlier worry that data was too sparse was wrong. 5,167 HCPs across the database have ≥2 trajectory-qualifying papers. Of those, 308 have meaningful trajectory signal (CitTraj > 5) in Hepatology alone. The data is there.

**The issue was the methodology surfacing the wrong cohort, not the data being missing.** Hours of work tonight worked toward this realization. The slope-based metric + reweighting validated that the methodology produces real signal — but career_multiplier (currently based on broken first_pub_year only) doesn't filter rising vs established correctly.

**Garrett caught the critical issue with one question**: "These last names you're referencing; are they not established HCPs?" Claude had been treating "recognizable researcher" as validation of the methodology when the actual question is "rising vs established." Without that pushback, Claude would have recommended additional methodology changes built on top of the wrong-cohort foundation.

**The validation cohort framework was deferred again.** The hand-curated cohort that would actually answer "is this the right rising star" still hasn't been built. This is the v1.0 ship blocker that no methodology fix can solve alone.

---

## On the project's overall solvability

Direct answer to Garrett's question at session end: yes, the platform is solvable.

**Hepatology is solvable this week.** With total_career_pubs penalty applied tomorrow, the Rising Stars view becomes defensible. One code change away.

**NSCLC and Rare Disease are solvable over 4-8 weeks.** Trajectory data is sparser in these TAs. Paths forward:
- Run phase 3 broader to recover 7,261 publications with "enriched but no year-by-year stored" (script-side fix, no new API calls)
- Consider TA-specific composite weights (NSCLC/RD lean more on trial activity, less on trajectory until data matures)
- Quarterly refresh as citation data ages and accrues

**Pub velocity is still degenerate** (May 3 P0 finding). Deweighted to 15% tonight but not fixed. Needs eventual redesign (CAGR, z-score, weighted regression — multiple plausible formulations).

**Validation cohort building is the deferred workstream.** Should start in parallel with engineering work. No technical dependencies — curation exercise, possibly with Avalere Health network input.

**Shipping with one strong TA (Hepatology) is a real option.** Doesn't require methodology to work equally across all three TAs at v1.0.

---

## Tomorrow's options (you decide)

### Option A: Apply total_career_pubs penalty, re-run, validate Hepatology

The cleanest single piece of work. Predictable outcome. 45 minutes.

After this lands, Hepatology Rising Stars view should be defensible. Sanyal/Chalasani/Mantzoros/Newsome/Noureddin/Wong fall out of top 20. Arab/Beuers/Spearman/Kim/Guy stay. The view becomes what the methodology says it should be.

### Option B: Apply total_career_pubs penalty AND start NSCLC investigation

After A lands, investigate NSCLC: why is trajectory data so sparse there? Is it the never_enriched bucket (papers phase 3 didn't reach) or the enriched-but-empty bucket (OpenAlex doesn't have it)? Diagnostic SQL determines fix path.

### Option C: Start the validation cohort

Different workstream entirely. Hand-curate 30-50 known rising stars + 30-50 known established KOLs per TA. Use as empirical anchor for all future methodology calls. Could be done in parallel with A.

This has been deferred since v1.2. It's the most important deferred workstream.

### My recommendation

**A first, then evaluate.** Hepatology is so close to defensible. Land that win. Then assess NSCLC/Rare Disease and validation cohort with the cleanest possible Hepatology baseline in front of you.

The validation cohort can start any time. It doesn't need to wait. If Garrett has Avalere colleagues who could help curate 30-50 hepatology rising stars / established KOLs, that conversation could start tomorrow alongside the technical work.

---

## Files modified tonight

- `C:\Users\garre\Desktop\FieldMark\scoring_pipeline.py`
  - `citation_trajectory_raw` function: complete rewrite to slope-based
  - `compute_scores`: external trajectory gate removed, weights updated to 15/35/25/10/10/0/5
  - `run_pipeline`: publications SELECT adds citation_counts_by_year column

No database modifications tonight beyond `hcp_scores` re-computation.

---

## Tomorrow's first command

If picking Option A:

Cursor prompt to apply total_career_pubs penalty to career_multiplier. Then:

```
python scoring_pipeline.py
```

Expected output: Hepatology top 10 retains Juan Pablo Arab (#1 trajectory leader), Diana Romero, Seung Up Kim, Cynthia Guy, Ulrich Beuers, Wendy Spearman. Loses Sanyal (1383 pubs), Chalasani (841), Mantzoros (958) from top 30. The list becomes what Rising Stars should mean.

---

## Meta — what tonight taught us

Garrett pushed back at the right moments tonight. Specifically:

1. "These last names you're referencing; are they not established HCPs?" — caught Claude amplifying the wrong cohort

2. "I'm just going to pray that this doesn't signal 5 HCPs within a very active disease state like NSCLC" — set the expectations for what "viable" looks like

3. "What data do we need?" — forced concrete diagnostic instead of vague "we need more data"

4. "What is the one common denominator for established HCPs? Isn't it Career Age?" — surfaced the establishment-filter design question

5. "We basically design the scoring to show the very best and the weed out the old people" — gave Claude the chance to push back on framing that would have created legal/reputational risk if implemented as stated

Tomorrow-Garrett: keep this pattern. The platform is genuinely improved by your domain pushback. Claude tends toward pattern-matching on technical signals without your judgment on what those signals mean clinically/commercially.

Sleep well. See you tomorrow.

---

*End of handoff.*
