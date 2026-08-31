# Rising exclusivity — what the OR-15 removal left behind

**Change:** 2026-08-26. `rising_star_scoring.fetch_input_signals()` lost the clause
`OR (cc.cohort = 'established' AND cc.career_age <= 15)`. Rising Star membership is now
`hcp_cohort_classification_v2.cohort = 'rising_eligible'` and nothing else — career age 3–10 plus
the per-TA publication floor. The three customer-facing cohorts are mutually exclusive in fact and
not only in `docs/canonical/fieldmark-methodology-page.md`.

**Measured, NSCLC, `--vis-window recent_roll`, before any re-run:**

| | OR-15 (2026-08-05 → 08-26) | `rising_eligible` only |
|---|---:|---:|
| Eligible pool | 1,934 (1,142 established + 792 rising_eligible) | 792 |
| Board | 336 | 149 |
| US (`us_rank` not null) | 76 | 42 |

Not pure attrition. **133 survive, 203 leave, and 16 `rising_eligible` HCPs who fail the wider gate
enter** — the two visibility percentiles are recomputed over the smaller pool and clear P50 against
it. Membership moves in both directions.

This file records what the change did **not** fix. Nothing below is a regression introduced by the
change; each is a pre-existing shape that the change enlarged, exposed, or made unreachable.

---

## 1. ~103 NSCLC HCPs now land on no board at all

**Existing gap, enlarged.** Of the 203 HCPs leaving the rising board, **100 carry an `established`
row in `hcp_score_ranks_v2`** and route cleanly to the academic profile. The other **~103 do not**.
They are classified `established` by the v2 taxonomy but hold no established score rank, so
`ProfileDispatch` falls through rule 1 and rule 2 to **community by exhaustion**.

For a publishing academic without an NPI, that surface has nothing to show — it is built on
Medicare, payments and practice shape. The gap is already documented at `ProfileDispatch.tsx:23-28`
("Sized 2026-08-17 against the rising floor change"), and the answer recorded there still stands:
**a surface that describes publishing academics holding no board position** — not a wider spine.
Widening rule 2 back toward extractor coverage re-imports the US-scoped failure that
`migrations/2026_08_14_profile_spine_board_membership.sql` exists to prevent.

What this change did was move ~103 people from a profile that rendered into one that does not.
**Size it against the real number before deciding**, on the TA in question — the 103 is NSCLC only
and was derived from the 2026-08-26 measurement, not from a post-re-run count.

## 2. `RisingHcpProfile`'s dual-board section is now dead code — log, do not delete

`RisingHcpProfile` renders an HCP's **established** rank as a section inside the rising profile, for
members holding both. `migrations/2026_08_19_hcp_rising_profile_scope.sql` exists specifically to
make `est_us` resolve correctly there (it had been pinned to region/US, so a dual-board member with
no US row fell through).

With the boards disjoint, **that section can no longer populate for anyone.** It is not deleted,
for two reasons:

1. The section is the layout slot the design authority (`docs/design/Rising Surface.dc.html`)
   reserves for it. Removing the code without a layout decision leaves a hole, not a tidier page.
2. The migration that fixed its scope resolution is applied and correct. Deleting the consumer
   strands a correct RPC behaviour with no caller, which is how the `hcp_community_ranks_v2`
   regression happened.

**Revisit with the Rising surface, not on its own.** If exclusivity survives contact with customers,
delete the section and the `est_us` branch together, in that order, and leave the migration applied.

## 3. `homeWhatMoved` deltas carry a synthetic component after the first post-change snapshot

`getWhatMoved()` compares the 2026-06-08 rows in `hcp_rising_star_snapshots` against current
`hcp_rising_star_ranks_v3`, both `us_rank IS NOT NULL`, on the **`rising_star_percentile` delta**.

The 203 departures drop out of the intersection cleanly — the join handles it, and no false movement
is produced by their absence. The problem is the surviving movers. **`rising_star_percentile` is
percentiled over the BOARD**, and the board halves (336 → 149). Every survivor's `idxDelta` therefore
mixes real movement with a denominator change, and the two are not separable from the stored value.

The existing DATA RULE at the head of `homeWhatMoved.ts` already refuses to rank on `us_rank` deltas
for exactly this reason — "cohort attrition between snapshots mechanically inflates rank climbs" —
and `us_rank` renders as position only. **The same reasoning now applies to the percentile delta**,
which is the one thing the surface *does* rank on.

Not live today: `WHAT_MOVED_SEEDED` is `false` and 2026-06-08 is pre-rescore, so the honest empty
state renders. **It goes live the moment a post-change weekly snapshot yields risers.** Options, in
preference order:

1. Re-baseline — take a post-change capture and compare against that, discarding the cross-gate
   comparison entirely. Cleanest; costs one snapshot cycle of history.
2. Gate the comparison on `cohort_gate_applied` (new, see below) and render the empty state when the
   two sides disagree. Honest, and self-maintaining for the next gate change.
3. Rank on `rising_star_raw` instead, which is not board-relative. Changes what the surface means.

Do not ship the surface across the 08-26 boundary without picking one.

## 4. The mixed denominator — widened here, deliberately not fixed

`MIN_COMPONENT_PERCENTILE = 50` is now applied against **two different populations inside one
four-way AND**:

- `scientific_visibility_percentile`, `network_visibility_percentile` — computed in
  `build_results()` over the **eligible pool** (792).
- `scientific_momentum_percentile`, `network_momentum_percentile` — arrive **already percentiled**
  from `hcp_scientific_momentum_v1` / `hcp_network_momentum_v1`. Neither scorer joins
  `hcp_cohort_classification_v2` at all; both gate on `hcp_industry_classification_v1.classification
  = 'ACADEMIC'` AND `(CURRENT_YEAR - hcps_v2.career_first_pub_year_v2) <= MAX_CAREER_YEARS` (15) —
  **a population that still contains every established HCP the rising gate just excluded.**

The mixture predates this change (it was logged when the coherence gate shipped on 2026-08-20). This
change did not create it and does not fix it, but it **widened the gap**: the two sides of the AND
were previously drawn from pools of 1,934 and ~the same 15-year population; they are now 792 and
unchanged.

**Why not fixed here.** Aligning the momentum scorers to the rising cohort means re-scoping four
scorers and every board that reads their output, including Established, which shares
`hcp_network_centrality_v2`. That is its own change with its own measurement, not a rider on a gate
removal.

**Note also** that the two sides read career age from different sources — the gate from
`hcp_cohort_classification_v2.career_age`, the momentum pool from
`hcps_v2.career_first_pub_year_v2`. After this change the rising gate no longer reads career age
directly, so the divergence stops mattering *at the gate*, but it still sets the momentum pool.

---

## Shipped with the change

- **`hcp_rising_board_snapshots.cohort_gate_applied`** (`migrations/2026_08_26_rising_snapshot_cohort_gate.sql`).
  The four `*_applied` threshold columns record int literals read out of source at capture time; the
  cohort gate is a SQL predicate and was invisible to that mechanism. On 2026-08-26 the pool went
  1,934 → 792 while **all four recorded constants stayed identical**. The visibility percentiles are
  pool-relative and are comparable only between captures sharing this value. Existing rows are
  backfilled to `rising_eligible|established_career_age<=15`; new captures write `rising_eligible`.
  Bump `take_weekly_snapshot.COHORT_GATE_APPLIED` whenever the gate moves.

- **`take_weekly_snapshot.py` pool narrowed to match.** The snapshot pool query carried the OR-15
  clause verbatim. Left alone, every future capture would have recorded 1,142 established HCPs as
  "in the pool, off the board" for a board they are no longer eligible for — an exclusion reason that
  is no longer the reason.

- **The 203 orphaned `rising_star` narratives are RETAINED.** `hcp_narratives_v2` is keyed
  `(hcp_id, slug, cohort)`; the 336 current board members hold 336 `rising_star` narratives, 34
  `established` and 13 `community`. 203 of the `rising_star` rows now belong to HCPs off the board.
  **They are unreachable by design** — every reader selects by cohort spine, so they cannot render —
  and are kept as history rather than deleted. Anyone auditing narrative coverage should count
  against board membership, not against `hcp_narratives_v2`. The 34 dual holders keep only their
  established narrative, which is the intended outcome.

- **The cohort gate joined the capture fingerprint.** `find_existing_capture_id()` reused a
  `capture_id` on matching board `computed_at` alone. The pool can change without the board being
  rescored — which is precisely the state between this commit landing and `rising_star_scoring.py`
  being re-run. A snapshot taken in that window would have matched the 08-20 capture, reused its id,
  and `DO UPDATE` a narrowed pool on top of a wider one, leaving one `capture_id` holding 1,142
  rows written under the old gate alongside rows stamped with the new one. `cohort_gate_applied` is
  now part of the lookup: different gate, different capture, always.

## RUN ORDER

1. **`migrations/2026_08_26_rising_snapshot_cohort_gate.sql` first.** `take_weekly_snapshot.py`
   names `cohort_gate_applied` in `RISING_INSERT`; until the column exists, every rising capture
   fails.
2. **`python scripts/score/rising_star_scoring.py --ta nsclc`** — `--dry-run --debug-top 30` first
   is worth the minute. Expect `[gate] eligible 792 -> board 149`, and on the real run
   `[upsert] de-listed 203 stale row(s)`. That delete is correct and fires inside the upsert
   transaction; the empty-result guard does not suppress it.
3. **`take_weekly_snapshot.py`** last, so the capture describes the board that now exists. Its
   banner will print `COHORT_GATE_APPLIED = rising_eligible` alongside the four unchanged
   thresholds.

Nothing in this commit has been run. The numbers above come from recomputing `build_results()`
against the live tables on 2026-08-26 without writing.

## Not shipped, and why

- **`migrations/2026_08_17_board_snapshots_v2.sql:110-111`** carries column comments
  (`career_age -- vs MAX_CAREER_YEARS`, `cohort_classification -- rising_eligible | established`)
  that now read as the rising boundary. The migration is **applied**; its body is history and is not
  edited. The corrected `COMMENT ON COLUMN` for `max_career_years_applied` ships in the 08-26
  migration instead, which is where a live database reads it from.

- **`docs/canonical/fieldmark-methodology-page.md:7`**, **`MethodologyPage.tsx:168`** and
  **`ScoringExplainedModal.tsx:257`** promise mutually exclusive cohorts. They were the accurate
  statements the code failed to honour. **They become true and are left untouched.**

- **`docs/canonical/fieldmark-methodology-page.md:62-67`** still documents the four Rising archetypes, removed
  2026-08-05. Pre-existing and out of scope for this commit; flagged so it is not mistaken for
  collateral from the gate change.
