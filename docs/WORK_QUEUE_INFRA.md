# FieldMark — infrastructure queue

Companion to WORK_QUEUE.md. None of this is demo-blocking.

---

## Autonomy: derived layers on a cadence

Audited 3 August. The reingest cycle runs stages 1–12 weekly; almost
everything downstream of scoring runs only when a person remembers.

**Tier A — weekly, in-cycle, free.** No budget decision. Do this
first; it closes most of the gap.

- `take_weekly_snapshot.py` — written June, never scheduled.
  Idempotent SQL, seconds, no API. Blocks every "movement since"
  comparison (Home's WHAT MOVED, The Week's rank block) from ever
  becoming weekly. **Rising only** — established and community do not
  rescore in the cycle, so snapshotting them weekly inserts ~102,720
  duplicate-valued rows per week and corrupts trajectory maths.
- Established + community scoring, network centrality, momentum, top
  collaborators, publication leadership — deterministic recomputes,
  currently run by hand.
- Medicare aggregation — already adjacent to stage 12, formalise as
  cycle-owned.

**Tier B — monthly, deterministic, no API.**

- Open Payments aggregation + `hcp_pharma_engagement_v2`. CMS data is
  annual; last run 6 July. Also needs a join-once-by-NPI top-up, same
  pattern as `hcpcs_detail_topup`.
- Trial discovery crawl.

**Tier C — cost-gated, needs a budget decision.**

Positions → synthesis → themes → narratives, in that dependency
order. All four use `claude-sonnet-4-6` with DELETE-and-rebuild and no
changed-HCP filter. Full-scope rebuild is ~1,800 + ~181 + ~2,800 +
thousands of calls.

The decision: run the family monthly at full scope on a fixed budget,
or wire `compute_affected_hcps` into each so only HCPs whose top-N
papers changed get re-run. Given the citation-ranked top-10 cap means
almost nothing changes week to week for established KOLs, incremental
is clearly right — but it is a build, not a config.

**Tier D — human gate.** Trial investigator linker. Automate the
crawl, but route name-matches through
`trial_investigator_match_proposals_v2` for acceptance before they
land. No rejection state exists today.

---

## Known defects

- **Position extractor is capped and stale.** `PAPERS_PER_HCP = 10`,
  citation-ranked, senior/first-author, `pub_year >= 2020`. Heymach's
  eligible pool is 35 papers; the extractor read 10. Median across the
  cohort is 10 — the cap itself. Last run 10 July, never since
  incremental ingestion. Compounding bias: citation-ranked selection
  means recent papers cannot crack the top 10 until they accrue
  citations, so new senior-author work is invisible twice over.
  Consider reserving slots for recency.

- **`career_first_pub_year_v2` derives from a
  disambiguation-polluted OpenAlex author profile.** Recomputes
  cleanly wrong every cycle. Not materially distorting the boards —
  1 of 129 on the rising board — but it feeds `career_age_years` and
  the rising eligibility gate.

- **Timeline mis-links recur.** All 311 pre-2001 links landed in a
  single window on 2026-07-22; the disambiguation pass creates them.
  269 unranked deleted 3 August; 42 across 7 ranked HCPs held in
  `docs/TIMELINE_RANKED_MISLINK_REVIEW.md` for per-link review.
  Monthly check — if `max(linked_at)` for pre-2001 publications
  advances past 2026-07-22, new ones are landing.

- **Pipeline watchdog.** Non-blocking stages 10, 11 and 12 WARN and
  let the cycle exit 0, so failures never reach Task Scheduler.
  `pipeline_runs` now has rows from stage 12 — a "no successful run in
  8 days" check would make silence detectable from inside the product.

- **Institution linker misses exact canonical names.** 77 ranked HCPs
  across five institutions: Icahn 19, Northwestern 21, UCSF 13, Boston
  Children's 12, Cincinnati Children's 12.

- **Five registry alias-pairs** are the same institution twice.
  Merging resolves 80 of 91 primary-link ties. MUSC / University of
  South Carolina is a match-pattern over-reach bug.

- **No ADVOCACY classification bucket.** ACADEMIC is the fallback for
  anything unmatched, so advocacy organisations pass every ACADEMIC
  gate. Korey Capozza (National Eczema Association) ranks #2 on the AD
  rising board.

- **`total_career_pubs` is redefined mid-cycle** — stage 2 sets a
  cluster count, stage 8a overwrites with OpenAlex `works_count`.

- **Cron depends on machine power state.** `WakeToRun` set true
  2026-08-02 after the 27 July slot silently skipped. Scheduled
  infrastructure on a desktop is the underlying fragility.

---

## Debt

- Rising and community narratives still on prompt v1.0. The positions
  treatment is a prompt change, not a refresh.
- SkyView rename stages 3 and 4 — route segment and file names.
- Dead-component prune: 26 components mounted nowhere, plus the old
  Pulse subcomponents superseded 2 August.
- `schema_full.sql` is behind the live database.
- `hcps_v2` has no physician opt-out mechanism. The v1 read policy had
  `USING (opt_out = false)`; v2 does not. Relevant before public
  signup.
- `.gitignore` — widen `nppes_backfill_ids*` to `nppes_*_ids*.txt`.
