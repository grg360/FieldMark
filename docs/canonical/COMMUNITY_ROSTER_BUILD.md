# Community Roster Build — Sequenced Spec

**Branch:** foundation-rebuild · **Status:** decided, grounded, ready to build (not started)

> **Per-TA consumer:** `CRC_COMMUNITY_BUILD.md` (2026-09-03) applies this document's roster
> semantics to colorectal. A CRC board must be born as a roster and never pass through a
> ranked phase. That document also carries the measurement showing CRC Community is blocked
> upstream of everything here, on NPI coverage (1,415 vs NSCLC's 9,849).

This is the build plan for converting the Community cohort from a **ranked leaderboard** to an
**intelligence roster**. It is grounded in Code's live diagnostic report (not reconstructed from
memory). Execute the phases in order — each gates the next. Every phase is its own commit (or a
small number of them). Methodology page updates in the SAME commit as any scoring/rank change
(process rule — the residue investigation proved docs drift from code otherwise).

---

## THE DECISION (why we're doing this — carry the reasoning, don't re-litigate)

Community stops being ranked. The data to rank community *clinical influence* — referral
centrality, adoption timing, local practice leadership — does not exist in public sources and
cannot be ingested. Verified against data: KOL-adjacency covers only the academic ~27% (and the
wrong 27% — co-authorship needs a publication, which 87% of community HCPs lack); Part-D adoption
timing collapses to 3 annual points with near-zero launch-era community prescribers; referral
centrality is absent from all held data. Confirmed by the domain advisor and by Code's data
sightline.

So: **no composite score, no cross-modality scalar, no rank.** Community becomes a tiered,
fact-rich, filterable/sortable roster. The advisor's tier-first structure survives; the score
does not.

**The moat thesis (for positioning, not this build):** community influence should eventually come
from FIELD INTELLIGENCE — MSL-captured observations as institutional memory, captured as
structured facts first, scored only if/when validated. Referral data is commercially licensable
(H1 / Definitive Healthcare / IQVIA OneKey) but that is a customer-discovery-gated FUTURE decision,
not part of this build.

**Key principle that governs every display decision:** missing modality = UNKNOWN, not zero. The
empty/sparse state is the COMMON state and gets a graceful quiet treatment, never a prominent zero.

---

## WHAT THE REPORT CHANGED FROM OUR ASSUMPTIONS (read before building)

1. **There are THREE divergent rank definitions shipping simultaneously**, not one:
   - Tiered ledger rank (`community_ledger`) → ledger, home chips, profile hero
   - Raw `community_ranks_v2.rank` → HCPCard/card feed, institutions, telescope, web-signals, snapshots
   - `min(rank)-across-scopes` → telescope / institution edges
   The build removes/reconciles all three. This is the bulk of the work.

2. **Pre-work is real** (I had wrongly thought it mostly done):
   - Snapshot revert: small, done-able (1 DELETE + 2 flag flips).
   - Hussein: gate-COUPLED — his suppression mechanism *is* the old gate; must be handled inside
     the gate transition, not before it.
   - Split-identity dedup: a genuine, not-fully-scoped sub-project that TOUCHES BOARD MEMBERSHIP.
     Must precede the roster's first honest snapshot.

3. **The scrub is bigger than the expected consumer list** — two static exports and a snapshot
   pipeline bake rank in; 3,005 narratives (70% assert rank language) need regen.

---

## PHASE 0 — PRE-WORK (clean the ground; each reversible)

### 0a. Snapshot revert (small, do first)
The 2026-08-07 demo recording inserted 4 fabricated `hcp_rising_star_seeded` rows at
`snapshot_date='2026-06-22'` (Meador, Lau, Le, Schoenfeld with fabricated pre-rescore percentiles),
and `homeWhatMoved.ts` points at that date so WHAT_MOVED renders the ILLUSTRATIVE chip.
- **Action:** `DELETE ... WHERE snapshot_date='2026-06-22'` + flip the two constants back so the
  logged memory shows the honest empty state until the next real weekly snapshot.
- **Scope:** rising-star snapshot artifact only — does NOT touch community tables. Baseline
  hygiene so no fabricated rows exist when new baseline snapshots get taken.
- **Reversible:** yes. Own commit.

### 0b. Split-identity dedup (the hard sub-project — gates the first honest community snapshot)
Root cause is a **pipeline gap, not a merge backlog:** NPPES-sourced records are never
identity-hashed (`identity_hash` NULL), so they never enter the dedup matcher. **40,097 NPI-bearing
records have NULL hash.** Split-identity signature (OpenAlex-only last-name + first-token vs.
NPPES-only) measures ~6,077 name-pairs upper bound — inflated by common names; true duplicate count
must be confirmed by the matcher AFTER hash backfill, not assumed (5,159 OpenAlex records / 3,177
NPPES records).
- **Sequence:** backfill `identity_hash` (via existing `scripts/classify/backfill_identity_hash.py`)
  → re-run the matcher → `dedup_merge.py`.
- **Blast radius:** touches board membership DIRECTLY. `dedup_merge.py:505` re-points
  `hcp_community_scores_v2` rows to the survivor. The cohort-collision case (a community NPPES twin
  + a rising/established publication twin) would put an academic on the community board's unresolved
  tier UNLESS the community score/rank artifacts are stripped — which the script does NOT do
  automatically today (the Aditi merge was done by hand). Plus `hcp_cohort_classification_v2` has no
  FK, so stub deletes orphan taxonomy rows unless swept explicitly.
- **Why it precedes the roster:** a snapshot taken before dedup bakes in the collisions. The
  roster's first honest snapshot must come AFTER dedup.
- **This is not a mechanical step.** Scope it as its own task: (1) backfill hashes, (2) re-run
  matcher, report the TRUE duplicate count, (3) confirm the cohort-collision artifact-strip is
  handled (script change, since it's currently manual), (4) confirm orphan taxonomy sweep. Do NOT
  run `dedup_merge.py` blind — it needs the artifact-strip and orphan-sweep additions first.
- **Own commit(s).** Highest-risk phase; verify board membership before/after.

---

## PHASE 1 — THE GATE TRANSITION (build the new membership foundation + handle Hussein)

Consolidate the **nine enforcement points across seven code objects** into one gate view,
`community_board_nsclc_v1`:

| # | carrier | where |
|---|---|---|
| 1–4 | `get_community_filtered` (6- & 7-param) + `get_community_filtered_count` (4- & 5-param) | live RPCs, `sql/community_qualification_gate.sql` |
| 5 | `COMMUNITY_GATE_OR` constant | `api.ts:751`, applied at `:1854` (profile cohort resolution), `:2424` (getCommunityScoreBreakdown), `:2648` (searchHCPs) |
| 6–7 | duplicated predicate in `generate_narratives_v2.py` | constant at `:185`, applied in batch selector (`:836–866`) and single-HCP check (`:2252`) |
| 8 (by omission) | `community_ledger` has NO gate — serves all 12,971 US-scored rows, filtered only by tier |

**Gate logic — G2:** `NSCLC Part-B beneficiaries > 0 OR any Part-D oncology`. Fresh numbers:
old gate 5,360 → **G2 4,914.** 989 leave (every one a pharma-only qualifier — paid, zero claims
footprint; zero volume-qualified members leave). 543 join (285 candidate, 140 unresolved, 70
heme_dominant, 45 anchored + 3 supported) — the D-only prescribers the old Part-B-flavored gate
was blind to.

**Hussein, handled INSIDE this transition (gate-coupled):** Maen Hussein is a genuine dual identity
— community #1 (`b7a02d2d`, the Medicare/NPI record) AND established #529 (`f96c18a6`, 19 pubs,
Sarah Cannon). For the demo the publication record was suppressed from search only by relabeling
the dead `hcps_v2.cohort_classification` column to 'community' — `searchHCPs` drops
community-classified rows that fail the community gate, and `f96c18a6` has no ranks row so it falls
out. **The suppression's entire mechanism IS the old gate.** The roster build replaces that gate
with `community_board_nsclc_v1.qualifies` — so rebuild it in place and the suppression either
silently breaks (Hussein reappears untracked) or gets faithfully re-encoded into the new gate's
semantics. **Action:** handle Hussein explicitly in the gate transition — one UPDATE, logged. Decide:
does the dedup (Phase 0b) resolve the dual identity properly, making the manual suppression
unnecessary? Likely yes — this is exactly a cohort-collision case. So Hussein may be a dedup
outcome, not a separate UPDATE. Confirm during Phase 0b.

**Own commit.** After this, `community_board_nsclc_v1` is the single source of membership; the nine
carriers all read it.

---

## PHASE 2 — THE SCORING CHANGE (kill the composite; freeze the corpse)

- Kill the **pharma qualification gate** (it double-counted: gate + 30% weight).
- Drop **pharma** and **career-years** from scoring entirely (career-years was
  missing→0-coerced noise for 13% of the board anyway; demote to displayed context).
- **No composite score, no cross-modality scalar.** Per-modality reach (Part-B beneficiaries;
  Part-D presence) survives ONLY as displayed facts, never averaged into one orderable number.
- **Freeze/NULL** `composite_score` / `normalized_score` — do NOT mirror the new ordering into them.
  A stale column that looks live is the residue bug we fixed today; make any stray read obviously
  dead, not silently plausible.
- **Methodology page, SAME commit:** the community section says plainly **"Community is not ranked"**
  + the one-sentence why (CMS observability measures throughput; throughput isn't influence;
  Established/Rising are ranked because scientific influence is observable, community clinical
  influence needs field knowledge we don't yet have). This replaces the current 40/30/15/10/5
  section.
- Fix the self-contradictory `2026_07_30_community_rescore_columns.sql` migration comment (marks
  `patient_volume` "do not use for scoring" while the live board used it) — correct the record.

**Own commit** (scoring + Methodology together).

---

## PHASE 3 — THE THREE-RANK RECONCILIATION + SCRUB (the big one)

Three rank definitions ship simultaneously; the roster removes all three. Convert or remove EVERY
consumer. The scrub is the highest-risk part of the whole build — a surviving reader that still
asserts a community rank is the residue-mismatch trap (a profile asserting a rank the roster no
longer produces).

**Default roster ordering:** tier (anchored → supported → unverified) then **state → last name**
(non-evaluative, matches MSL territory model). Active sort is always a visibly-labeled view-state,
never an implied rank.

### Expected consumers (all real, confirmed):
- **Profile hero** — two variants, `CommunityHcpProfile` and `PracticeFirstProfile`, both via
  `community_hcp_profile` RPC rendering "Rank N of M" + score. → convert to roster facts (tier +
  reach facts, no rank/score).
- **api.ts cohort resolution** — `:1846`. → membership from `community_board_nsclc_v1`, no rank read.
- **HCPCard** — `#rank`/`#global_rank`/score numeral. → drop rank/score numerals for community;
  show tier + facts.
- **Home chips** — `community_tiered_ranks` → `HomePage.tsx:442`. → convert to tier/roster framing.
- **Narrative generation** — see Phase 4.
- **Search** — reads the ranks view for MEMBERSHIP ONLY; result scores come from
  `hcps_v2.cohort_score`, not the community tables. → point membership at the new gate view;
  confirm no community rank ordering survives.

### Beyond the expected list — the SWEEP found (these are the nasty ones):
- **`CohortLedger/cohortLedger.ts`** — the board itself, ordered by `community_ledger` rank with
  **keyset-on-rank pagination.** Removing rank breaks pagination → re-key pagination to the new
  default sort (state → last name, stable). Not just a display change — the pagination mechanism
  assumes a rank.
- **`InstitutionRoute.tsx:310`** — institution rosters SORT community members by `us_rank`, fed by
  the `institution_primary_links` migration reading `hcp_community_ranks_v2`. → re-sort by the
  roster default; drop the rank dependency.
- **`TelescopeField` + `frontend/src/data/telescope_nsclc_nodes.json`** — community rank is BAKED
  INTO a static export (~3,716 rank fields) by `export_telescope_data.py`, which also SELECTS cohort
  by rank-percentile. **A DB-side scrub won't touch this — it needs a RE-EXPORT** with the rank
  selection/fields removed. Static-export consumer #1.
- **`export_web_signals.py:237`** — the enrichment target set is literally `WHERE rank <= 200 ORDER
  BY rank` — **rank DECIDES WHO GETS ENRICHED.** → replace the target-selection with a
  membership/tier-based criterion (not rank). Static-export consumer #2. This one has real
  consequence: it controls which HCPs get enrichment, so the replacement criterion is a real
  decision (enrich by tier? by reach threshold? all anchored?).
- **`take_weekly_snapshot.py:164`** — copies rank + both scores into `hcp_community_snapshots`
  (160,712 rows live); the snapshot SHAPE assumes a rank. → change the snapshot shape to the
  roster's fact set (no rank), OR stop snapshotting community rank. Decide: does community need
  weekly snapshots at all if it's not ranked (WHAT-MOVED for a roster = tier transitions + new
  facts, not position changes)?
- **`getCommunityScoreBreakdown` (api.ts:2400)** — appears to be DEAD code (exported, no call site;
  superseded when the profile heroes moved to the RPC). → DELETE, don't migrate. Confirm no call
  site first.
- **`ledger_meta` RPC** — reads the scores table for suppression ceilings. → confirm what it needs
  post-scoring-change; likely reads a column that's now frozen.

### Confirmed absent (no work): watchlist/tracked chips render rank only for RISING — no community
rank there.

**Multiple commits** — group logically (DB consumers, frontend consumers, the two static re-exports,
the snapshot change). The two static exports (telescope JSON, web_signals) are separate work from
the DB scrub — they need script re-runs, not just query changes.

---

## PHASE 4 — NARRATIVE REGEN (large, real)

Generated by `generate_narratives_v2.py`. **3,005 NSCLC community narratives; 2,094 (~70%) assert
rank/score/percentile/influence language** — verified not regex noise (real prose: "velocity ranking
in the 90th percentile within her therapeutic area"). Two things must move:

1. **Target selection is itself a rank consumer** — the community selector pulls top-N by rank
   through the gated ranks view. → move target-selection off `ORDER BY rank` to the new membership
   definition (all qualifying community HCPs, or a tier-based selection — decide).
2. **The prompt** — regen under a **roster-safe prompt (v1.1)**: facts + tier + reach facts, NO
   rank/percentile/influence assertions. The script's own comments cite the since-removed
   `pharma_engagement_pctile` (v1.0 residue) — v1.1 drops all of it.

- **Regen all 3,005** (or at least the 2,094 that assert rank language — but a clean regen of all
  3,005 under v1.1 is cleaner and avoids a mixed corpus).
- This is genuinely first-class build work, not cleanup — a surviving narrative asserting a rank is
  the same live contradiction as a surviving surface.

**Own commit(s).**

---

## PHASE 5 — VERIFICATION (before calling it done)

- Roster renders: tier grouping + facts, default sort state→last name, no rank/score anywhere.
- No surface asserts a community rank — walk profile hero (both variants), HCPCard, home chips,
  ledger, institution rosters, telescope, search results.
- Both static exports re-run and rank-free (telescope JSON, web_signals target set).
- Methodology says "Community is not ranked."
- Legacy `composite_score`/`normalized_score` frozen/nulled — any stray read visibly dead.
- Narrative spot-check: sample regenerated community narratives assert NO rank/percentile/influence
  language.
- Board membership correct post-dedup (Phase 0b) — no cohort-collision academics on the community
  board.
- The sparse/empty state renders gracefully everywhere (the common case).

---

## BUILD ORDER SUMMARY (dependency-critical)

```
0a snapshot revert (small, independent)
0b DEDUP sub-project  ← gates everything (touches membership; first honest snapshot needs it)
     backfill identity_hash → re-run matcher (report true dup count) → add artifact-strip +
     orphan-sweep to dedup_merge → run it → verify membership
1  GATE transition (community_board_nsclc_v1, 9 carriers, Hussein handled here — likely a dedup
     outcome, confirm in 0b)
2  SCORING change (kill pharma gate, drop pharma+career, freeze legacy columns, Methodology same
     commit, fix migration comment)
3  THREE-RANK RECONCILIATION + SCRUB (expected consumers + the sweep: cohortLedger keyset
     pagination, InstitutionRoute sort, telescope RE-EXPORT, web_signals RE-EXPORT, snapshot shape,
     delete dead getCommunityScoreBreakdown, ledger_meta) — multiple commits
4  NARRATIVE REGEN (move target-selection off rank + roster-safe v1.1 prompt + regen 3,005)
5  VERIFICATION
```

---

## DECISIONS STILL OPEN (resolve during the build, flagged so they're not missed)

1. **`export_web_signals.py` target replacement** — rank currently decides who gets enriched
   (`WHERE rank <= 200`). What replaces it? Enrich by tier (all anchored)? By reach threshold? All
   qualifying members? This is a real criterion decision, not mechanical.
2. **Community weekly snapshots** — does a non-ranked roster need weekly snapshots? WHAT-MOVED for a
   roster = tier transitions + new facts, not position changes. Decide whether to reshape the
   snapshot or stop snapshotting community.
3. **Narrative regen scope** — all 3,005 (clean, avoids mixed corpus) vs. only the 2,094 that assert
   rank language. Lean: all 3,005.
4. **Hussein** — likely resolves as a dedup outcome (cohort-collision case) rather than a manual
   UPDATE. Confirm in Phase 0b; if dedup handles it, no separate Hussein step.
5. **`pharma_engagement` is a lifetime, all-TA figure for 99.8% of the roster** — measured
   2026-08-28: 52,066 community HCPs fall through `community_scoring.py:403-406` to
   `total_payments_lifetime`, which is not TA-scoped at any level, against 45 on the TA-scoped
   payment total and 56 on speaker/consulting. It is a displayed fact, not a scored input, so no
   rank moves — but a dermatologist's psoriasis payments currently render as pharma engagement on
   a colorectal profile. Three options and a recommendation are written up in
   [`COMMUNITY_PHARMA_ENGAGEMENT_FALLBACK.md`](COMMUNITY_PHARMA_ENGAGEMENT_FALLBACK.md).
   Belongs with Phase 2's displayed-facts work; nothing has been changed.

---

## WORKING CONVENTIONS (carry into the build session)

One recommendation with reasoning, not menus. Honest pushback. No time estimates. PowerShell.
Garrett runs all git himself. Verify live state before reasoning (stale numbers bit repeatedly —
this whole spec exists because remembered figures didn't reproduce). Prompts labeled [TO CODE] etc.
Keep it tight. Commit in clean units; run `git log origin/foundation-rebuild..HEAD --oneline` to
confirm work actually landed (work believed committed was found uncommitted multiple times).
Methodology updates in the SAME commit as scoring changes. The empty/sparse state is the common
state — design for it, don't treat it as an edge case.
