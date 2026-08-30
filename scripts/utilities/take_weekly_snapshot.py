"""
take_weekly_snapshot.py

Captures board state into hcp_rising_board_snapshots / hcp_established_board_snapshots
(migrations/2026_08_17_board_snapshots_v2.sql).

WHAT CHANGED (2026-08-17) AND WHY
---------------------------------
The previous version wrote the OUTPUTS of scoring -- ranks and percentiles -- and
none of the variables the boards are GATED on. When the rising board moved
619 -> 251 (MIN_VELOCITY_DELTA raised from > 0 to >= 3), the snapshot showed 368
departures with no recoverable reason.

The reason cannot be recovered later. hcp_scientific_momentum_v1,
hcp_network_momentum_v1 and hcp_cohort_classification_v2 are all OVERWRITTEN IN
PLACE -- one row per (hcp, TA), restamped every scoring cycle. Every prior value
of pub_velocity_delta / recent_senior_pubs / early_senior_pubs is destroyed each
run. A week not captured is permanently unanswerable, so this script's job is to
copy the gate inputs at the moment they are true.

THIS SCRIPT CAPTURES, IT NEVER RECOMPUTES. Every value is read from the tables
the scoring stage wrote. It must therefore run AFTER stage 9 (see
ta_cycle.py stage 9.5), and source_computed_at carries the scoring row's
own computed_at so a snapshot can be proven to match what shipped.

RISING CAPTURES THE ELIGIBLE POOL, NOT THE BOARD (~2,232 rows/TA vs 251).
is_on_board marks the members. Non-members are the point: 122 people currently
clear every gate but the momentum floor, and they are next week's entrants. You
cannot see an entrant coming if you only store the board.

The pool is the cohort gate AND the presence of a scientific-momentum row.
The cohort gate ALONE admits 23,062 HCPs for NSCLC -- 10x the storage for people
who have no momentum computation at all and therefore cannot be "one paper from
entry" in any meaningful sense. All 251 board members are inside the pool
(verified 2026-08-17: 0 outside).

ESTABLISHED IS WRITE-ON-CHANGE, not weekly. recompute_established_ranks_v3.py is
NOT part of the reingest cycle (stage 9 runs rising only) and its computed_at
moves roughly monthly, so a weekly capture would write ~4 identical copies per
real change. Scoped to global + US + EU5, the scopes anything actually renders.

COMMUNITY IS STOPPED and stays stopped -- see the note at the call site.

Usage:
    python scripts/utilities/take_weekly_snapshot.py --dry-run
    python scripts/utilities/take_weekly_snapshot.py
    python scripts/utilities/take_weekly_snapshot.py --ta nsclc
    python scripts/utilities/take_weekly_snapshot.py --date 2026-08-17

Idempotent: ON CONFLICT DO NOTHING on the snapshot_date key, so re-running the
same day is a no-op rather than a duplicate.

Env vars required:
    DATABASE_URL
"""

import argparse
import os
import re
import sys
from datetime import date
from pathlib import Path
from typing import Dict, List, Optional, Tuple
from uuid import uuid4

import psycopg2
from psycopg2.extras import execute_values
from dotenv import load_dotenv

load_dotenv()

REPO_ROOT = Path(__file__).resolve().parents[2]

# Established scopes worth archiving: the ones established_ledger, ledger_meta,
# the institution roster and the narrative generator's VISIBLE_SCOPES read.
# The other 74 region scopes are 15,180 of 38,012 live rows and render nowhere.
ESTABLISHED_REGION_SCOPES = ("US", "DE", "FR", "IT", "ES", "GB")

# Sentinel for scope_type='global', whose scope_value is NULL in the source. A
# NULL cannot participate in a PRIMARY KEY; hcp_board_movement_v1 maps it back.
GLOBAL_SCOPE_SENTINEL = "__global__"

# THRESHOLD PROVENANCE. These are read out of the scoring sources at run time
# rather than hardcoded here, so the recorded constant is provably the one in
# force. Hardcoding would reintroduce exactly the drift the columns exist to
# prevent -- the 619 -> 251 move WAS one of these numbers changing.
THRESHOLD_SOURCES: Dict[str, Tuple[str, str]] = {
    # 2026-08-20: MIN_VELOCITY_DELTA no longer exists. The rising gate is now
    # MIN_COMPONENT_PERCENTILE applied to all four components. read_int_constant
    # raises on a missing name by design, so leaving the old entry here would
    # have failed every future capture -- which is the intended behaviour, and
    # is how this was caught.
    "min_component_percentile": ("scripts/score/rising_star_scoring.py",    "MIN_COMPONENT_PERCENTILE"),
    "min_pubs_per_window": ("scripts/score/scientific_momentum_scoring.py", "MIN_PUBS_PER_WINDOW"),
    "max_career_years":    ("scripts/score/scientific_momentum_scoring.py", "MAX_CAREER_YEARS"),
    "min_collaborators":   ("scripts/score/network_momentum_scoring.py",    "MIN_COLLABORATORS_PER_WINDOW"),
}


# COHORT GATE PROVENANCE (2026-08-26). The four thresholds above are int literals
# in Python and are read out of source; the COHORT GATE is a SQL predicate and is
# not, so nothing in a capture recorded which population the pool-relative
# percentiles were taken over. That is the exact failure the threshold block exists
# to prevent: on 2026-08-26 the pool went 1,934 -> 792 while all four recorded
# constants stayed identical, which would have made a population change
# indistinguishable from no change at all.
#
# scientific_visibility_percentile and network_visibility_percentile are computed
# over the POOL, so they are only comparable between captures carrying the SAME
# value here. Bump this string whenever the gate above moves.
#
# Captures taken between 2026-08-05 (ba84d41) and 2026-08-26 carry
# 'rising_eligible|established_career_age<=15', backfilled by
# migrations/2026_08_26_rising_snapshot_cohort_gate.sql. That literal is NOT
# mirrored here: one owner per string, and the backfill is a one-time statement
# about rows that already exist.
COHORT_GATE_APPLIED = "rising_eligible"


def read_int_constant(rel_path: str, name: str) -> int:
    """Read a module-level int constant from a source file WITHOUT importing it.

    Importing would execute load_dotenv() and any other module-level work in the
    scoring scripts. Parsing is side-effect free and deterministic.

    Raises rather than defaulting: a renamed constant must fail the snapshot
    loudly, not silently record NULL provenance. A snapshot that cannot say
    which threshold was in force is the failure this whole table set exists to
    prevent.
    """
    path = REPO_ROOT / rel_path
    if not path.exists():
        raise SystemExit(f"threshold source missing: {rel_path} (looking for {name})")
    text = path.read_text(encoding="utf-8")
    m = re.search(rf"^{re.escape(name)}\s*=\s*(-?\d+)\s*$", text, re.MULTILINE)
    if not m:
        raise SystemExit(
            f"could not read {name} from {rel_path}. If it was renamed or made "
            f"non-literal, update THRESHOLD_SOURCES -- do not let the snapshot "
            f"record NULL provenance."
        )
    return int(m.group(1))


def load_thresholds() -> Dict[str, int]:
    values = {k: read_int_constant(p, n) for k, (p, n) in THRESHOLD_SOURCES.items()}
    print("Thresholds in force (read from source):")
    for k, v in values.items():
        rel, name = THRESHOLD_SOURCES[k]
        print(f"  {name:<28} = {v:<4} ({rel})")
    # Printed with the thresholds because it is one: the gate that decides the
    # pool the visibility percentiles are taken over. It is a predicate rather
    # than a literal, so it is declared here rather than read from source.
    print(f"  {'COHORT_GATE_APPLIED':<28} = {COHORT_GATE_APPLIED}")
    return values


def get_connection():
    url = os.environ.get("DATABASE_URL")
    if not url:
        print("ERROR: DATABASE_URL not set in environment or .env file")
        sys.exit(1)
    return psycopg2.connect(url)


def resolve_ta_ids(conn, ta_slug: Optional[str]) -> List[Tuple[str, str]]:
    """Return [(ta_id, slug)]. Default: every TA with rows on either board."""
    with conn.cursor() as cur:
        if ta_slug:
            cur.execute("SELECT id::text, slug FROM therapeutic_areas WHERE slug = %s", (ta_slug,))
            rows = cur.fetchall()
            if not rows:
                raise SystemExit(f"unknown TA slug: {ta_slug}")
            return [(r[0], r[1]) for r in rows]
        cur.execute(
            """
            SELECT ta.id::text, ta.slug
            FROM therapeutic_areas ta
            WHERE EXISTS (SELECT 1 FROM hcp_rising_star_ranks_v3 r WHERE r.therapeutic_area_id = ta.id)
               OR EXISTS (SELECT 1 FROM hcp_established_ranks_v3 e WHERE e.therapeutic_area_id = ta.id)
            ORDER BY ta.slug
            """
        )
        return [(r[0], r[1]) for r in cur.fetchall()]


# ─────────────────────────────────────────────────────────────────────────────
# RISING
# ─────────────────────────────────────────────────────────────────────────────

RISING_SELECT = """
    SELECT
        cc.hcp_id,
        cc.therapeutic_area_id,
        ta.slug,
        h.first_name,
        h.last_name,
        COALESCE(h.current_institution, h.institution_normalized)          AS institution,
        h.country                                                         AS country_at_snapshot,
        NULLIF(BTRIM(COALESCE(h.current_country, h.country)), '')         AS effective_country,
        (r.hcp_id IS NOT NULL)                                            AS is_on_board,
        -- Board members carry the ranks row's computed_at (what shipped);
        -- pool-only rows carry the momentum row's, which is what gated them.
        COALESCE(r.computed_at, sm.computed_at)                           AS source_computed_at,
        COALESCE(r.enrichment_run_id, sm.enrichment_run_id)               AS enrichment_run_id,
        r.rank                                                            AS global_rank,
        r.us_rank,
        r.rising_star_percentile,
        r.rising_star_raw,
        r.momentum_component,
        r.visibility_component,
        r.scientific_momentum_percentile,
        r.network_momentum_percentile,
        r.scientific_visibility_percentile,
        r.network_visibility_percentile,
        sm.pub_velocity_delta,
        sm.recent_senior_pubs,
        sm.early_senior_pubs,
        sm.recent_total_pubs,
        sm.early_total_pubs,
        nm.recent_collaborator_count,
        nm.early_collaborator_count,
        cc.career_age,
        cc.cohort                                                         AS cohort_classification,
        ic.classification                                                 AS industry_classification,
        sm.early_window_start,
        sm.early_window_end,
        sm.recent_window_start,
        sm.recent_window_end
    FROM hcp_cohort_classification_v2 cc
    JOIN therapeutic_areas ta
      ON ta.id = cc.therapeutic_area_id
    -- INNER: the pool is HCPs that have a momentum computation. The cohort gate
    -- alone is 23,062 for NSCLC; without a momentum row there is no delta and
    -- so no meaningful distance from the floor.
    JOIN hcp_scientific_momentum_v1 sm
      ON sm.hcp_id = cc.hcp_id AND sm.therapeutic_area_id = cc.therapeutic_area_id
    -- LEFT: a missing network-momentum row means the collaborator gate was
    -- failed. Recorded as NULL rather than excluded, so that reason survives.
    LEFT JOIN hcp_network_momentum_v1 nm
      ON nm.hcp_id = cc.hcp_id AND nm.therapeutic_area_id = cc.therapeutic_area_id
    LEFT JOIN hcp_rising_star_ranks_v3 r
      ON r.hcp_id = cc.hcp_id AND r.therapeutic_area_id = cc.therapeutic_area_id
    LEFT JOIN hcps_v2 h
      ON h.id = cc.hcp_id
    LEFT JOIN hcp_industry_classification_v1 ic
      ON ic.hcp_id = cc.hcp_id
    -- POOL GATE. Must MIRROR rising_star_scoring.fetch_input_signals() exactly.
    -- Narrowed 2026-08-26 alongside it: the OR-15 clause
    --   OR (cc.cohort = 'established' AND cc.career_age <= 15)
    -- came out of both places in one commit. Left here alone, every future capture
    -- would have recorded 1,142 established HCPs as "in the pool, off the board"
    -- for a board they are no longer eligible for -- an exclusion reason that is no
    -- longer the reason. If you change the scorer's gate, change this one in the
    -- same commit and bump COHORT_GATE_APPLIED.
    WHERE cc.therapeutic_area_id = %s
      AND cc.cohort = 'rising_eligible'
"""

RISING_INSERT = """
    INSERT INTO hcp_rising_board_snapshots (
        capture_id,
        snapshot_date, hcp_id, therapeutic_area_id, therapeutic_area_slug,
        first_name, last_name, institution_at_snapshot, country_at_snapshot,
        effective_country_at_snapshot,
        is_on_board, source_computed_at, enrichment_run_id, source,
        global_rank, us_rank,
        rising_star_percentile, rising_star_raw,
        momentum_component, visibility_component,
        scientific_momentum_percentile, network_momentum_percentile,
        scientific_visibility_percentile, network_visibility_percentile,
        pub_velocity_delta, recent_senior_pubs, early_senior_pubs,
        recent_total_pubs, early_total_pubs,
        recent_collaborator_count, early_collaborator_count,
        career_age, cohort_classification, industry_classification,
        early_window_start, early_window_end,
        recent_window_start, recent_window_end,
        min_component_percentile_applied, min_pubs_per_window_applied,
        min_collaborators_applied, max_career_years_applied,
        cohort_gate_applied
    ) VALUES %s
    -- KEYED ON capture_id (2026-08-20, migration
    -- 2026_08_20_rising_snapshot_capture_id.sql). A calendar day may hold several
    -- board states; capture_id is minted once per run and is constant across every
    -- row of that run, so each state is its own capture.
    --
    -- THE TWO KEYS THIS REPLACED both failed, for different reasons. The original
    -- (snapshot_date, hcp_id, TA) with DO NOTHING made the second capture of
    -- 2026-08-20 a total no-op -- the 251 -> 336 gate change went unrecorded while
    -- printing "inserted 0 rows". Its replacement keyed on source_computed_at,
    -- which is PER ROW (board members from the ranks table, off-board pool members
    -- from the momentum table), so off-board rows still collided and DO UPDATE
    -- overwrote 1,769 rows of the earlier capture with the later one's provenance.
    --
    -- DO UPDATE is correct HERE because capture_id is only ever reused
    -- deliberately, by find_existing_capture_id() below, when the scoring being
    -- captured is the same scoring already captured. That is a refresh in place.
    -- Every other run mints a new id and inserts.
    ON CONFLICT (capture_id, hcp_id, therapeutic_area_id)
    DO UPDATE SET
      is_on_board = EXCLUDED.is_on_board,
      global_rank = EXCLUDED.global_rank,
      us_rank = EXCLUDED.us_rank,
      rising_star_percentile = EXCLUDED.rising_star_percentile,
      rising_star_raw = EXCLUDED.rising_star_raw,
      momentum_component = EXCLUDED.momentum_component,
      visibility_component = EXCLUDED.visibility_component,
      scientific_momentum_percentile = EXCLUDED.scientific_momentum_percentile,
      network_momentum_percentile = EXCLUDED.network_momentum_percentile,
      scientific_visibility_percentile = EXCLUDED.scientific_visibility_percentile,
      network_visibility_percentile = EXCLUDED.network_visibility_percentile,
      pub_velocity_delta = EXCLUDED.pub_velocity_delta,
      recent_senior_pubs = EXCLUDED.recent_senior_pubs,
      early_senior_pubs = EXCLUDED.early_senior_pubs,
      recent_total_pubs = EXCLUDED.recent_total_pubs,
      early_total_pubs = EXCLUDED.early_total_pubs,
      recent_collaborator_count = EXCLUDED.recent_collaborator_count,
      early_collaborator_count = EXCLUDED.early_collaborator_count,
      min_component_percentile_applied = EXCLUDED.min_component_percentile_applied,
      cohort_gate_applied = EXCLUDED.cohort_gate_applied
"""


def find_existing_capture_id(conn, snapshot_date, ta_id, board_computed_at):
    """The capture_id already holding THIS scoring output, if there is one.

    IDEMPOTENCE LIVES HERE, NOT IN THE KEY. capture_id is minted per run, so
    without this check a second run against unchanged scoring would insert a
    complete duplicate capture. With it, the writer reuses the existing id and the
    ON CONFLICT DO UPDATE becomes a genuine refresh in place.

    THE FINGERPRINT IS THE BOARD'S computed_at. Board rows take source_computed_at
    from hcp_rising_star_ranks_v3, so it moves if and only if the scorer has re-run
    -- which is exactly when a new capture is warranted. Off-board rows are NOT
    usable for this: they take it from hcp_scientific_momentum_v1, which does not
    move when only the rising scorer runs, and keying on it is what corrupted the
    2026-08-20 captures.

    THE COHORT GATE IS PART OF THE FINGERPRINT (2026-08-26). computed_at alone is
    not enough, because the POOL can change without the BOARD being rescored. That
    is exactly the state this repo is in the moment the OR-15 removal lands and
    before rising_star_scoring.py is re-run: board rows still carry the 08-20
    scorer's timestamp, so a snapshot taken now would match the existing capture,
    reuse its id, and DO UPDATE a narrowed pool on top of a wider one -- leaving a
    single capture_id holding 1,142 established rows written under the old gate
    alongside rows stamped with the new one. A capture that describes two
    populations at once is worse than either.
    Different gate => different capture, always.

    Returns None when the scoring is new, and the caller mints a fresh uuid.
    """
    if board_computed_at is None:
        return None
    with conn.cursor() as cur:
        cur.execute(
            """
            SELECT capture_id
            FROM hcp_rising_board_snapshots
            WHERE snapshot_date = %s
              AND therapeutic_area_id = %s
              AND is_on_board
              AND source_computed_at = %s
              AND cohort_gate_applied IS NOT DISTINCT FROM %s
            LIMIT 1
            """,
            (snapshot_date, ta_id, board_computed_at, COHORT_GATE_APPLIED),
        )
        row = cur.fetchone()
    return row[0] if row else None


def execute_values_counted(cur, sql: str, values: list, page_size: int = 500) -> int:
    """execute_values, returning the TOTAL rows written rather than the last page's.

    THE COUNTER LIED (2026-08-20). execute_values sends one statement per page, so
    cur.rowcount afterwards reflects only the FINAL page. The 2026-08-20 morning
    capture wrote 2,232 rows in pages of 500 and reported "inserted 232" -- 4x500
    plus a 232-row remainder. That understatement is what made the evening
    capture's total collision look unremarkable: a number far below the pool size
    had already been normalised as what this script prints.

    Paging explicitly and summing is the whole fix. Under ON CONFLICT DO UPDATE
    the total counts inserts AND refreshes, which is why callers say "wrote"
    rather than "inserted" -- an unchanged re-capture legitimately reports the
    full row count, and reporting it as inserts would be the mirror-image lie.
    """
    total = 0
    for start in range(0, len(values), page_size):
        page = values[start : start + page_size]
        execute_values(cur, sql, page, page_size=len(page))
        total += cur.rowcount or 0
    return total


def take_rising_snapshot(conn, snapshot_date, ta_id, slug, thresholds, dry_run) -> int:
    print(f"\n=== Rising: {slug} @ {snapshot_date} ===")
    with conn.cursor() as cur:
        cur.execute(RISING_SELECT, (ta_id,))
        rows = cur.fetchall()

    if not rows:
        print("  no eligible-pool rows; skipping")
        return 0

    # Column offsets into RISING_SELECT. Named rather than inlined: an off-by-one
    # here would silently record the wrong variable as the gating one.
    HCP_ID, IS_ON_BOARD, PUB_VELOCITY_DELTA, RECENT_COLLAB = 0, 8, 21, 26
    floor = float(thresholds["min_component_percentile"])

    on_board = sum(1 for r in rows if r[IS_ON_BOARD])

    # ── THESE COUNTERS ARE A SECOND EXPRESSION OF THE BOARD GATE ─────────────
    # The authoritative one lives in rising_star_scoring.py (the delta floor) and
    # network_momentum_scoring.py (the per-window collaborator floor). Anything
    # restated in two places drifts, and a counter computed from a superseded
    # rule is the same failure the threshold-provenance columns exist to prevent
    # -- a number that looks authoritative and quietly is not.
    #
    # So the gate is RECONSTRUCTED here and CHECKED against what the scorer
    # actually produced, rather than trusted. Note what is and is not checkable:
    #
    #   "exit_exposed is a subset of on_board"      -- TAUTOLOGY. The predicate
    #   "entry_ready never exceeds pool minus board" -- TAUTOLOGY.
    # Both follow from the predicates themselves (one requires is_on_board, the
    # other requires NOT is_on_board), so asserting them can never fail and
    # catches nothing. They are documented, not asserted, for that reason.
    #
    # The invariant that CAN fail is set equality between the reconstructed gate
    # and actual membership. Verified exact on the 2026-08-17 capture: 251 == 251,
    # zero rows in either direction. If a fourth gate is added to the scorer,
    # reconstructed becomes a strict superset of actual and this fires.
    # RECONSTRUCTION DISARMED (2026-08-20) — READ THIS BEFORE TRUSTING THE COUNTERS.
    #
    # The gate is no longer reconstructible from the pool columns. It is now
    # MIN_COMPONENT_PERCENTILE against all four components, and two of those
    # (scientific and network VISIBILITY) are percentile ranks computed inside
    # rising_star_scoring.py over the eligible pool. They are written to
    # hcp_rising_star_ranks_v3 for BOARD MEMBERS ONLY, so for the ~1,700 pool
    # members who are off the board the deciding values do not exist anywhere.
    #
    # Reconstructing from pub_velocity_delta would be worse than not
    # reconstructing: it would compute a confident set-equality result against a
    # rule the scorer no longer applies. That is precisely the "number that looks
    # authoritative and quietly is not" this block was written to prevent, so the
    # honest move is to stop claiming the check.
    #
    # TO RESTORE IT, the scorer must persist the four component percentiles for
    # the whole eligible pool, not just the board. That is a real change (the
    # ranks table is board-only by construction) and is NOT done here.
    #
    # WHAT IS LOST: phantom/missed detection, and the exit-exposed / entry-ready
    # counters below, which were defined in units of senior-author papers. "One
    # paper from entry" has no meaning under a four-percentile floor -- an entrant
    # now approaches along four axes at once.
    GATE_RECONSTRUCTIBLE = False

    def gate_says_on_board(r) -> bool:  # pragma: no cover - disarmed, see above
        raise NotImplementedError(
            "rising gate is not reconstructible from snapshot columns since 2026-08-20"
        )

    actual = {r[HCP_ID] for r in rows if r[IS_ON_BOARD]}
    if GATE_RECONSTRUCTIBLE:
        reconstructed = {r[HCP_ID] for r in rows if gate_says_on_board(r)}
        phantom, missed = reconstructed - actual, actual - reconstructed
        # One senior-author paper from a membership change -- outbound and inbound.
        # NOT the delta axis alone: 22 people sit at delta = floor-1 while failing
        # the collaborator gate, and a paper does not admit them, so counting them
        # as "one short" overstates inbound churn.
        exit_exposed = sum(
            1 for r in rows
            if r[IS_ON_BOARD]
            and r[PUB_VELOCITY_DELTA] is not None and float(r[PUB_VELOCITY_DELTA]) == floor
        )
        entry_ready = sum(
            1 for r in rows
            if not r[IS_ON_BOARD]
            and r[PUB_VELOCITY_DELTA] is not None and float(r[PUB_VELOCITY_DELTA]) == floor - 1
            and r[RECENT_COLLAB] is not None
        )
    else:
        reconstructed, phantom, missed = set(), set(), set()
        exit_exposed = entry_ready = None

    print(f"  pool {len(rows):,} | on board {on_board:,}")
    if not GATE_RECONSTRUCTIBLE:
        print(
            "  gate check SKIPPED: the coherence gate (all four components >= "
            f"P{floor:g}) is not reconstructible from snapshot columns -- the two "
            "visibility percentiles are not stored for off-board pool members. "
            "Captured rows are unaffected. See GATE_RECONSTRUCTIBLE above."
        )
    elif phantom or missed:
        # Capture still proceeds -- the rows are irreplaceable and the stage is
        # non-blocking -- but refuse to print numbers derived from a rule that no
        # longer matches the scorer.
        print(
            f"  !! GATE DRIFT: reconstructed board {len(reconstructed):,} != actual {len(actual):,} "
            f"({len(phantom):,} reconstructed-not-actual, {len(missed):,} actual-not-reconstructed).\n"
            f"     The board gate changed underneath these counters. exit-exposed / entry-ready "
            f"SUPPRESSED as unreliable; the captured rows are unaffected and still correct.\n"
            f"     Reconcile gate_says_on_board() against rising_star_scoring.py and "
            f"network_momentum_scoring.py."
        )
    else:
        print(
            f"  exit-exposed {exit_exposed:,} (on board, delta={floor:g}) | "
            f"entry-ready {entry_ready:,} (delta={floor - 1:g}, all other gates clear)"
        )

    if dry_run:
        print("  [DRY RUN] nothing written")
        return 0

    # CAPTURE IDENTITY. Reuse the id already holding this exact scoring output if
    # there is one (a re-run against unmoved scoring is a refresh, not a new
    # state); otherwise mint one. row[9] is source_computed_at, and only board rows
    # carry the scorer's own timestamp -- see find_existing_capture_id().
    board_computed_at = next(
        (r[9] for r in rows if r[IS_ON_BOARD] and r[9] is not None), None
    )
    existing = find_existing_capture_id(conn, snapshot_date, ta_id, board_computed_at)
    capture_id = existing or str(uuid4())
    print(
        f"  capture {capture_id} "
        f"({'refreshing existing capture' if existing else 'new capture'}; "
        f"board scored {board_computed_at})"
    )

    values = [
        (
            capture_id,
            snapshot_date,
            row[0], row[1], row[2],                    # hcp_id, ta_id, slug
            row[3], row[4], row[5], row[6], row[7],    # identity
            row[8], row[9], row[10], "capture",        # membership + provenance
            row[11], row[12],                          # global_rank, us_rank
            row[13], row[14], row[15], row[16],        # score outputs
            row[17], row[18], row[19], row[20],        # component percentiles
            row[21], row[22], row[23],                 # delta + both sides
            row[24], row[25],                          # total pubs both windows
            row[26], row[27],                          # collaborators both windows
            row[28], row[29], row[30],                 # career_age, cohort, industry
            row[31], row[32], row[33], row[34],        # window bounds
            thresholds["min_component_percentile"],
            thresholds["min_pubs_per_window"],
            thresholds["min_collaborators"],
            thresholds["max_career_years"],
            COHORT_GATE_APPLIED,
        )
        for row in rows
    ]

    with conn.cursor() as cur:
        inserted = execute_values_counted(cur, RISING_INSERT, values)
    conn.commit()
    print(f"  wrote {inserted:,} rows of {len(values):,} (inserted or refreshed)")
    if inserted != len(values):
        print(
            f"  !! {len(values) - inserted:,} row(s) were neither inserted nor refreshed. "
            "Under the widened key this should not happen; investigate before "
            "trusting this capture."
        )
    return inserted


# ─────────────────────────────────────────────────────────────────────────────
# ESTABLISHED — write-on-change
# ─────────────────────────────────────────────────────────────────────────────

ESTABLISHED_SELECT = """
    SELECT
        r.hcp_id,
        r.therapeutic_area_id,
        ta.slug,
        h.first_name,
        h.last_name,
        COALESCE(h.current_institution, h.institution_normalized)  AS institution,
        h.country,
        NULLIF(BTRIM(COALESCE(h.current_country, h.country)), '')  AS effective_country,
        r.computed_at,
        r.enrichment_run_id,
        r.scope_type,
        COALESCE(r.scope_value, %s)                                AS scope_value,
        r.rank,
        r.cohort_score,
        r.scientific_influence_pctile,
        r.network_influence_pctile,
        r.pharma_engagement_pctile,
        cc.cohort                                                  AS cohort_classification,
        ic.classification                                          AS industry_classification,
        ic.matched_pattern,
        cc.career_age
    FROM hcp_established_ranks_v3 r
    JOIN therapeutic_areas ta
      ON ta.id = r.therapeutic_area_id
    LEFT JOIN hcps_v2 h
      ON h.id = r.hcp_id
    LEFT JOIN hcp_cohort_classification_v2 cc
      ON cc.hcp_id = r.hcp_id AND cc.therapeutic_area_id = r.therapeutic_area_id
    LEFT JOIN hcp_industry_classification_v1 ic
      ON ic.hcp_id = r.hcp_id
    WHERE r.therapeutic_area_id = %s
      AND (r.scope_type = 'global'
           OR (r.scope_type = 'region' AND r.scope_value = ANY(%s)))
"""

ESTABLISHED_INSERT = """
    INSERT INTO hcp_established_board_snapshots (
        snapshot_date, hcp_id, therapeutic_area_id, therapeutic_area_slug,
        first_name, last_name, institution_at_snapshot, country_at_snapshot,
        effective_country_at_snapshot,
        is_on_board, source_computed_at, enrichment_run_id, source,
        scope_type, scope_value, rank,
        cohort_score, scientific_influence_pctile,
        network_influence_pctile, pharma_engagement_pctile,
        cohort_classification, industry_classification,
        industry_matched_pattern, career_age
    ) VALUES %s
    ON CONFLICT (snapshot_date, hcp_id, therapeutic_area_id, scope_type, scope_value)
    DO NOTHING
"""


def established_needs_capture(conn, ta_id) -> Tuple[bool, str]:
    """Write-on-change: skip when the board has not been recomputed since the
    last capture. Established is recomputed roughly monthly and off-cycle, so a
    weekly run would otherwise write ~4 identical copies per real change."""
    with conn.cursor() as cur:
        cur.execute(
            "SELECT max(computed_at) FROM hcp_established_ranks_v3 WHERE therapeutic_area_id = %s",
            (ta_id,),
        )
        live = cur.fetchone()[0]
        cur.execute(
            "SELECT max(source_computed_at) FROM hcp_established_board_snapshots "
            "WHERE therapeutic_area_id = %s AND source = 'capture'",
            (ta_id,),
        )
        captured = cur.fetchone()[0]
    if live is None:
        return False, "no live established rows"
    if captured is None:
        return True, "no prior capture"
    if live > captured:
        return True, f"recomputed {live:%Y-%m-%d} > last capture {captured:%Y-%m-%d}"
    return False, f"unchanged since {captured:%Y-%m-%d}"


def take_established_snapshot(conn, snapshot_date, ta_id, slug, dry_run) -> int:
    needed, why = established_needs_capture(conn, ta_id)
    print(f"\n=== Established: {slug} @ {snapshot_date} ===")
    print(f"  write-on-change: {'CAPTURE' if needed else 'SKIP'} ({why})")
    if not needed:
        return 0

    with conn.cursor() as cur:
        cur.execute(
            ESTABLISHED_SELECT,
            (GLOBAL_SCOPE_SENTINEL, ta_id, list(ESTABLISHED_REGION_SCOPES)),
        )
        rows = cur.fetchall()

    print(f"  rows (global + {'/'.join(ESTABLISHED_REGION_SCOPES)}): {len(rows):,}")
    if not rows:
        return 0
    if dry_run:
        print("  [DRY RUN] nothing written")
        return 0

    values = [
        (
            snapshot_date,
            row[0], row[1], row[2],
            row[3], row[4], row[5], row[6], row[7],
            True,                  # established membership IS presence in the table
            row[8], row[9], "capture",
            row[10], row[11], row[12],
            row[13], row[14], row[15], row[16],
            row[17], row[18], row[19], row[20],
        )
        for row in rows
    ]

    with conn.cursor() as cur:
        # Established keeps ON CONFLICT DO NOTHING on its narrow, date-keyed PK --
        # it carries the same defect as rising did and is untreated (see the
        # migration note). The counter fix applies regardless: a partial write
        # here now shows as a shortfall instead of hiding in the last page.
        inserted = execute_values_counted(cur, ESTABLISHED_INSERT, values)
    conn.commit()
    print(f"  wrote {inserted:,} rows of {len(values):,}")
    if inserted != len(values):
        print(
            f"  NOTE: {len(values) - inserted:,} row(s) already present for this "
            "snapshot_date and were skipped (established is still date-keyed, "
            "ON CONFLICT DO NOTHING)."
        )
    return inserted


# ─────────────────────────────────────────────────────────────────────────────
# COMMUNITY — stopped, retained for history
# ─────────────────────────────────────────────────────────────────────────────
# Community snapshots STOPPED (Phase 3, 2026-08-11) and NOT revived by the
# 2026-08-17 rebuild. Community is not ranked -- there is no rank/composite/
# normalized_score to archive -- and the old arm read hcp_community_ranks_v2,
# which has since been DROPPED, so it would now fail outright.
# hcp_community_snapshots (160,712 rows through 2026-08-05) is retained as the
# historical record of the ranked era. A community WHAT-MOVED (tier transitions
# + fact changes) needs a THIRD table shape, not this one.


def report_history(conn) -> None:
    """One line per CAPTURE, not per calendar day.

    THE INSTRUMENT WAS LYING (2026-08-20). This grouped by snapshot_date, which
    assumes one board state per day -- the same assumption the primary key made and
    that a gate change falsifies. Once 2026-08-20 held two captures it summed them
    and printed 4,464 rows / 587 on board: a board that never existed.

    Grouping by created_at instead is WORSE, and was the actual trap. ON CONFLICT
    DO UPDATE does not touch created_at, so a capture completed in two passes
    carries two values -- capture a21259c1 shows 463 rows at 17:08 and 1,769 at
    18:04. Read as a grouping key that invents a third capture that never ran, and
    it did, for three consecutive runs, while the stored data was correct after the
    first one.

    capture_id is the only column that identifies a capture. created_at is honest
    row-level provenance -- when each row was physically written -- so it is shown
    as a DISPLAY column (the earliest write in the capture) and never grouped on.

    Established has no capture_id: its table is still date-keyed and carries the
    same defect, so it keeps the old grouping and is labelled as such.
    """
    print("\n=== Snapshot history ===")

    with conn.cursor() as cur:
        cur.execute(
            """
            SELECT snapshot_date, capture_id, min(source) AS source,
                   min(created_at) AS first_written,
                   count(DISTINCT created_at) AS write_passes,
                   count(*) AS rows,
                   count(*) FILTER (WHERE is_on_board) AS on_board,
                   max(min_velocity_delta_applied)::text AS mvd,
                   max(min_component_percentile_applied)::text AS mcp
            FROM hcp_rising_board_snapshots
            GROUP BY snapshot_date, capture_id
            ORDER BY snapshot_date DESC, min(created_at) DESC
            LIMIT 12
            """
        )
        rows = cur.fetchall()
    print("\nRising (v2) - one line per capture:")
    if not rows:
        print("  (empty)")
    for d, cid, src, first, passes, n, on_board, mvd, mcp in rows:
        gate = f"delta>={mvd}" if mvd else (f"P{mcp}" if mcp else "-")
        extra = f" ({passes} write passes)" if passes and passes > 1 else ""
        print(
            f"  {d} [{src:<7}] {str(cid)[:8]} {n:>7,} rows | {on_board:>6,} on board "
            f"| gate {gate:<9} | first written {first:%Y-%m-%d %H:%M}{extra}"
        )

    with conn.cursor() as cur:
        cur.execute(
            """
            SELECT snapshot_date, source, count(*),
                   count(*) FILTER (WHERE is_on_board)
            FROM hcp_established_board_snapshots
            GROUP BY snapshot_date, source
            ORDER BY snapshot_date DESC, source
            LIMIT 12
            """
        )
        rows = cur.fetchall()
    print("\nEstablished (v2) - grouped by DATE (no capture_id; still date-keyed):")
    if not rows:
        print("  (empty)")
    for d, src, n, on_board in rows:
        print(f"  {d} [{src:<7}] {n:>7,} rows | {on_board:>6,} on board")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--date", default=None, help="Override snapshot date (YYYY-MM-DD). Default: today.")
    parser.add_argument("--ta", default=None, help="Restrict to one TA slug. Default: all boarded TAs.")
    parser.add_argument("--dry-run", action="store_true", help="Report counts, write nothing.")
    args = parser.parse_args()

    snapshot_date = date.fromisoformat(args.date) if args.date else date.today()
    print(f"Snapshot date: {snapshot_date}{'  [DRY RUN]' if args.dry_run else ''}")

    thresholds = load_thresholds()

    conn = get_connection()
    try:
        tas = resolve_ta_ids(conn, args.ta)
        print(f"\nTAs in scope: {', '.join(s for _, s in tas)}")

        total = 0
        for ta_id, slug in tas:
            total += take_rising_snapshot(conn, snapshot_date, ta_id, slug, thresholds, args.dry_run)
            total += take_established_snapshot(conn, snapshot_date, ta_id, slug, args.dry_run)
        # take_community_snapshot -- intentionally absent, see note above.

        report_history(conn)
        print(f"\nSnapshot complete. Rows written: {total:,}")
    finally:
        conn.close()


if __name__ == "__main__":
    main()
