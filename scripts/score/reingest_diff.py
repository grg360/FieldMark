"""
FieldMark - reingest "what changed" delta engine for a therapeutic area.

This is the DATA engine behind the Field Intelligence / dynamism feed. It does NOT render
UI. It produces STRUCTURED per-HCP deltas for two downstream consumers:
  (a) watchlists - filter reingest_diff_v2 by hcp_id;
  (b) the Claude API layer - narrate each delta into "why this matters" (writes the
      reserved-but-NULL why_context column later).

MECHANISM: snapshot / rescore / diff
  1. --snapshot : capture per-HCP scoring state for a TA into reingest_snapshot_v2, keyed by
                  (snapshot_id, captured_at). One snapshot BEFORE a reingest cycle.
  2. (the reingest + rescore cycle runs between snapshots - NOT this script's job)
  3. --diff --before <id> --after <id> : take/point-to a second snapshot, compute the delta
                  between the two snapshots for the same TA, write per-HCP change rows to
                  reingest_diff_v2 and one run-level row to reingest_diff_summary_v2.

SCHEMA MAPPING (audited against the live tables - see --print-ddl for the DDL this expects):
  * cohort + rank + score all live together in hcp_score_ranks_v2, at global scope
    (scope_type='global', scope_value IS NULL) which contains every ranked HCP in the TA:
      cohort_classification <- hcp_score_ranks_v2.cohort
      cohort_score          <- hcp_score_ranks_v2.score_at_rank  (the HCP's normalized_score)
      rank                  <- hcp_score_ranks_v2.rank           (1-based within scope)
  * pub_count               <- hcps_v2.total_career_pubs         (career total, cross-TA)
  * hcp_display_name        <- hcps_v2.preferred_display_name (fallback last_name)
  NOTE: hcps_v2 also has cohort_classification / cohort_score columns, but those are
  single-valued per HCP (cross-TA) and are NOT used - a per-TA diff must read the per-TA
  hcp_score_ranks_v2 rows.

GOTCHAS honored: .insert()/.update() never .upsert(); no ILIKE (uuid/slug .eq only); no
select("id") on composite-PK tables (reingest_snapshot_v2 / reingest_diff_v2 have composite
PKs and no id); batched writes, not one giant transaction.

VALIDATION: --self-check captures the TA's state twice with no cycle in between and asserts
the diff is EMPTY (0 changed HCPs). compute_hcp_diffs() is a pure function so this is also
unit-testable offline.

Env: SUPABASE_URL, SUPABASE_KEY (via python-dotenv).
"""

from __future__ import annotations

import argparse
import json
import os
import sys
import time
import uuid
from collections import Counter
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Sequence, Tuple

from dotenv import load_dotenv
from supabase import Client, create_client


# ============================================================
# Constants
# ============================================================

PAGE_SIZE = 1000
IN_CHUNK = 200
WRITE_BATCH = 500

SNAPSHOT_TABLE = "reingest_snapshot_v2"
DIFF_TABLE = "reingest_diff_v2"
SUMMARY_TABLE = "reingest_diff_summary_v2"

# The feed is TA-wide, so we snapshot the global scope (which by construction contains every
# ranked HCP in the TA). Country/region scopes also exist in hcp_score_ranks_v2.
SCOPE_TYPE = "global"

DEFAULT_RANK_THRESHOLD = 10  # min |rank change| to count as a mover

# change_type enum (mirrored in the DDL CHECK constraint)
CT_NEW_RISING_STAR = "new_rising_star"     # cohort transition INTO rising
CT_COHORT_PROMOTION = "cohort_promotion"   # rising -> established
CT_RANK_MOVER_UP = "rank_mover_up"         # rank improved by >= threshold
CT_RANK_MOVER_DOWN = "rank_mover_down"     # rank worsened by >= threshold
CT_NEW_ENTRANT = "new_entrant"             # hcp_id absent from the before-snapshot
CT_NEW_PUBLICATIONS = "new_publications"   # pub_count increased
CT_DROPPED_OUT = "dropped_out"             # hcp_id in before-snapshot but absent from after

# magnitude tiers so the feed can rank by significance across HCPs (biggest movers first).
# Cohort transitions sit above rank moves; presence changes (entry/exit) form a mid tier.
MAG_PROMOTION_BASE = 1000
MAG_RISING_STAR_BASE = 900
MAG_NEW_ENTRANT_BASE = 500
MAG_DROPPED_OUT_BASE = 500
# A drop-out's newsworthiness scales with how prominent the HCP WAS: a top-ranked KOL
# falling off ranking is real MSL intelligence; a rank-9000 exit is noise. Ranks better
# (lower) than this reference get a magnitude bonus (prominence_ref - before_rank).
DROPPED_OUT_PROMINENCE_REF = 100

# activity_level thresholds on total_hcps_changed
ACTIVITY_QUIET_MAX = 5    # <= quiet
ACTIVITY_BUSY_MIN = 30    # >= busy; between -> moderate


# ============================================================
# DDL (mirror of the authoritative migration:
#   migrations/2026_07_20_reingest_diff_v2.sql
# Apply that migration to create the tables; --print-ddl echoes this copy for convenience.
# Keep the two in sync.)
# ============================================================

DDL = f"""
-- reingest snapshot: per-HCP scoring state for a TA at a point in time.
CREATE TABLE IF NOT EXISTS {SNAPSHOT_TABLE} (
  snapshot_id  UUID NOT NULL,
  hcp_id       UUID NOT NULL,  -- plain uuid, NO FK: immutable event log; dedup hard-deletes
                               -- stub hcp_ids and a cascade would erase merged-HCP history.
  ta_slug      TEXT NOT NULL,
  cohort       TEXT,
  cohort_score NUMERIC,
  rank         INTEGER,
  pub_count    INTEGER,
  captured_at  TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (snapshot_id, hcp_id)        -- composite PK, NO id column
);
CREATE INDEX IF NOT EXISTS idx_{SNAPSHOT_TABLE}_snapshot ON {SNAPSHOT_TABLE} (snapshot_id);
CREATE INDEX IF NOT EXISTS idx_{SNAPSHOT_TABLE}_ta ON {SNAPSHOT_TABLE} (ta_slug, captured_at);

-- reingest diff: one row per CHANGED HCP per diff run.
CREATE TABLE IF NOT EXISTS {DIFF_TABLE} (
  diff_run_id      UUID NOT NULL,
  ta_slug          TEXT NOT NULL,
  computed_at      TIMESTAMPTZ NOT NULL,
  hcp_id           UUID NOT NULL,  -- plain uuid, NO FK (immutable event log; may be
                                   -- historical after a dedup merge). Frontend handles that.
  hcp_display_name TEXT,
  change_type      TEXT NOT NULL CHECK (change_type IN (
                     'new_rising_star','cohort_promotion','rank_mover_up',
                     'rank_mover_down','new_entrant','new_publications','dropped_out')),
  before_cohort    TEXT,
  after_cohort     TEXT,
  before_rank      INTEGER,
  after_rank       INTEGER,
  rank_delta       INTEGER,        -- positive = moved UP the leaderboard (rank number fell)
  before_pub_count INTEGER,
  after_pub_count  INTEGER,
  pub_delta        INTEGER,
  magnitude        NUMERIC NOT NULL,  -- sort key: significance, not just presence
  why_context      TEXT,              -- RESERVED, NULL for now (Claude layer fills later)
  PRIMARY KEY (diff_run_id, hcp_id)   -- composite PK, NO id column
);
-- watchlist consumer: filter by hcp_id
CREATE INDEX IF NOT EXISTS idx_{DIFF_TABLE}_hcp ON {DIFF_TABLE} (hcp_id);
-- feed consumer: latest changes for a TA, biggest first
CREATE INDEX IF NOT EXISTS idx_{DIFF_TABLE}_feed ON {DIFF_TABLE} (ta_slug, computed_at, magnitude);
CREATE INDEX IF NOT EXISTS idx_{DIFF_TABLE}_run ON {DIFF_TABLE} (diff_run_id, magnitude);

-- reingest diff summary: one row per diff run (the "Scientific Weather" pulse seed).
CREATE TABLE IF NOT EXISTS {SUMMARY_TABLE} (
  diff_run_id        UUID PRIMARY KEY,
  ta_slug            TEXT NOT NULL,
  computed_at        TIMESTAMPTZ NOT NULL,
  new_rising_stars   INTEGER NOT NULL DEFAULT 0,
  promotions         INTEGER NOT NULL DEFAULT 0,
  movers_up          INTEGER NOT NULL DEFAULT 0,
  movers_down        INTEGER NOT NULL DEFAULT 0,
  new_entrants       INTEGER NOT NULL DEFAULT 0,
  dropped_outs       INTEGER NOT NULL DEFAULT 0,
  hcps_with_new_pubs INTEGER NOT NULL DEFAULT 0,
  total_hcps_changed INTEGER NOT NULL DEFAULT 0,
  activity_level     TEXT NOT NULL CHECK (activity_level IN ('quiet','moderate','busy'))
);
CREATE INDEX IF NOT EXISTS idx_{SUMMARY_TABLE}_ta ON {SUMMARY_TABLE} (ta_slug, computed_at);
""".strip()


# ============================================================
# Env / client
# ============================================================


def eprint(*args: Any, **kwargs: Any) -> None:
    print(*args, file=sys.stderr, **kwargs)


def get_required_env(name: str) -> str:
    v = os.getenv(name)
    if not v:
        raise EnvironmentError(f"Missing required env var: {name}")
    return v


def init_supabase() -> Client:
    return create_client(get_required_env("SUPABASE_URL"), get_required_env("SUPABASE_KEY"))


def get_table_name(base: str, target_version: str) -> str:
    return f"{base}_v2" if target_version == "v2" else base


# ============================================================
# Snapshot capture (reads)
# ============================================================


@dataclass
class SnapshotRow:
    hcp_id: str
    cohort: Optional[str]
    cohort_score: Optional[float]
    rank: Optional[int]
    pub_count: Optional[int]


def resolve_ta_id(supabase: Client, ta_slug: str) -> str:
    rows = (
        supabase.table("therapeutic_areas")
        .select("id,slug")
        .eq("slug", ta_slug)   # slug is unique + lowercase; no ILIKE
        .limit(1)
        .execute()
        .data
        or []
    )
    if not rows:
        raise SystemExit(f"No therapeutic_areas row for slug '{ta_slug}'")
    return str(rows[0]["id"])


def _int_or_none(v: Any) -> Optional[int]:
    if v is None or v == "":
        return None
    try:
        return int(v)
    except (TypeError, ValueError):
        return None


def _float_or_none(v: Any) -> Optional[float]:
    if v is None or v == "":
        return None
    try:
        return float(v)
    except (TypeError, ValueError):
        return None


def capture_snapshot(supabase: Client, ta_id: str, target_version: str) -> Dict[str, SnapshotRow]:
    """Read the TA's current global-scope scoring state into {hcp_id: SnapshotRow}.

    cohort/rank/score come from hcp_score_ranks_v2 (global scope); pub_count from hcps_v2.
    hcp_score_ranks_v2 has a surrogate uuid PK, so we keyset by id (unique) - no straddle
    bug. If an HCP somehow has >1 global row (two cohorts), we keep the better (lower) rank.
    """
    ranks_table = get_table_name("hcp_score_ranks", target_version)
    by_hcp: Dict[str, SnapshotRow] = {}

    last_id: Optional[str] = None
    while True:
        q = (
            supabase.table(ranks_table)
            .select("id,hcp_id,cohort,rank,score_at_rank")
            .eq("therapeutic_area_id", ta_id)
            .eq("scope_type", SCOPE_TYPE)
            .is_("scope_value", "null")
            .order("id")
            .limit(PAGE_SIZE)
        )
        if last_id is not None:
            q = q.gt("id", last_id)
        batch = q.execute().data or []
        if not batch:
            break
        for r in batch:
            hid = str(r.get("hcp_id"))
            rank = _int_or_none(r.get("rank"))
            existing = by_hcp.get(hid)
            # Keep the better (lower) rank if a duplicate cohort row appears.
            if existing is not None and existing.rank is not None and (rank is None or rank >= existing.rank):
                continue
            by_hcp[hid] = SnapshotRow(
                hcp_id=hid,
                cohort=r.get("cohort"),
                cohort_score=_float_or_none(r.get("score_at_rank")),
                rank=rank,
                pub_count=None,  # filled from hcps_v2 below
            )
        last_id = str(batch[-1].get("id"))
        if len(batch) < PAGE_SIZE:
            break

    # Enrich pub_count from hcps_v2 (career total).
    hcp_ids = list(by_hcp.keys())
    for i in range(0, len(hcp_ids), IN_CHUNK):
        chunk = hcp_ids[i:i + IN_CHUNK]
        rows = (
            supabase.table(get_table_name("hcps", target_version))
            .select("id,total_career_pubs")
            .in_("id", chunk)
            .execute()
            .data
            or []
        )
        for r in rows:
            hid = str(r.get("id"))
            if hid in by_hcp:
                by_hcp[hid].pub_count = _int_or_none(r.get("total_career_pubs"))

    return by_hcp


def fetch_display_names(supabase: Client, hcp_ids: Sequence[str], target_version: str) -> Dict[str, str]:
    """hcp_id -> display name (preferred_display_name, fallback last_name)."""
    out: Dict[str, str] = {}
    ids = list(hcp_ids)
    for i in range(0, len(ids), IN_CHUNK):
        chunk = ids[i:i + IN_CHUNK]
        rows = (
            supabase.table(get_table_name("hcps", target_version))
            .select("id,preferred_display_name,last_name")
            .in_("id", chunk)
            .execute()
            .data
            or []
        )
        for r in rows:
            hid = str(r.get("id"))
            name = (r.get("preferred_display_name") or "").strip() or (r.get("last_name") or "").strip()
            out[hid] = name
    return out


# ============================================================
# Snapshot persistence
# ============================================================


def persist_snapshot(
    supabase: Client,
    snapshot_id: str,
    ta_slug: str,
    rows: Dict[str, SnapshotRow],
    captured_at: str,
    errors: List[str],
) -> int:
    payloads = [
        {
            "snapshot_id": snapshot_id,
            "hcp_id": r.hcp_id,
            "ta_slug": ta_slug,
            "cohort": r.cohort,
            "cohort_score": r.cohort_score,
            "rank": r.rank,
            "pub_count": r.pub_count,
            "captured_at": captured_at,
        }
        for r in rows.values()
    ]
    return _insert_batched(supabase, SNAPSHOT_TABLE, payloads, errors)


def load_snapshot(supabase: Client, snapshot_id: str) -> Tuple[Dict[str, SnapshotRow], Optional[str]]:
    """Read a persisted snapshot back into {hcp_id: SnapshotRow}; also return its ta_slug.

    Composite-PK table (no id) - keyset by hcp_id, which is unique within one snapshot_id.
    """
    by_hcp: Dict[str, SnapshotRow] = {}
    ta_slug: Optional[str] = None
    last_hcp: Optional[str] = None
    while True:
        q = (
            supabase.table(SNAPSHOT_TABLE)
            .select("hcp_id,ta_slug,cohort,cohort_score,rank,pub_count")
            .eq("snapshot_id", snapshot_id)
            .order("hcp_id")
            .limit(PAGE_SIZE)
        )
        if last_hcp is not None:
            q = q.gt("hcp_id", last_hcp)
        batch = q.execute().data or []
        if not batch:
            break
        for r in batch:
            hid = str(r.get("hcp_id"))
            ta_slug = ta_slug or r.get("ta_slug")
            by_hcp[hid] = SnapshotRow(
                hcp_id=hid,
                cohort=r.get("cohort"),
                cohort_score=_float_or_none(r.get("cohort_score")),
                rank=_int_or_none(r.get("rank")),
                pub_count=_int_or_none(r.get("pub_count")),
            )
        last_hcp = str(batch[-1].get("hcp_id"))
        if len(batch) < PAGE_SIZE:
            break
    return by_hcp, ta_slug


# ============================================================
# Diff (PURE - no DB, unit-testable, drives --self-check)
# ============================================================


def _classify_change(
    before: Optional[SnapshotRow],
    after: SnapshotRow,
    rank_threshold: int,
) -> Optional[Tuple[str, float, Optional[int], Optional[int]]]:
    """Decide the single primary change_type for one HCP present in the AFTER snapshot.

    Returns (change_type, magnitude, rank_delta, pub_delta) or None when nothing changed.
    rank_delta = before_rank - after_rank  (positive = moved UP the leaderboard).
    An HCP may satisfy several conditions; we pick the most narratively significant by the
    precedence below, while the row still carries every before/after/delta field. Only the
    two named cohort transitions have change_types; other transitions surface via rank/pub.
    """
    if before is None:
        # Brand new to the ranked feed. after_cohort (e.g. 'rising') is still recorded.
        return (CT_NEW_ENTRANT, float(MAG_NEW_ENTRANT_BASE), None, None)

    rank_delta = (
        before.rank - after.rank
        if before.rank is not None and after.rank is not None
        else None
    )
    pub_delta = (
        after.pub_count - before.pub_count
        if before.pub_count is not None and after.pub_count is not None
        else None
    )
    abs_rank = abs(rank_delta) if rank_delta is not None else 0

    # Precedence: cohort transitions > rank moves > pub bumps.
    if before.cohort == "rising" and after.cohort == "established":
        return (CT_COHORT_PROMOTION, MAG_PROMOTION_BASE + abs_rank, rank_delta, pub_delta)
    if before.cohort != "rising" and after.cohort == "rising":
        return (CT_NEW_RISING_STAR, MAG_RISING_STAR_BASE + abs_rank, rank_delta, pub_delta)
    if rank_delta is not None and rank_delta >= rank_threshold:
        return (CT_RANK_MOVER_UP, float(abs_rank), rank_delta, pub_delta)
    if rank_delta is not None and rank_delta <= -rank_threshold:
        return (CT_RANK_MOVER_DOWN, float(abs_rank), rank_delta, pub_delta)
    if pub_delta is not None and pub_delta > 0:
        return (CT_NEW_PUBLICATIONS, float(pub_delta), rank_delta, pub_delta)
    return None


def compute_hcp_diffs(
    before: Dict[str, SnapshotRow],
    after: Dict[str, SnapshotRow],
    rank_threshold: int,
) -> List[Dict[str, Any]]:
    """Pure delta between two snapshots. One dict per CHANGED HCP (missing diff_run_id/
    computed_at/hcp_display_name - those are added at persist time).

    HCPs present in `after` are classified by _classify_change. HCPs present in `before` but
    absent from `after` fell out of ranking -> a 'dropped_out' row (both-direction transitions
    are real MSL intelligence: a KOL declining or graduating out of a cohort matters as much
    as one rising in).
    """
    out: List[Dict[str, Any]] = []
    for hid, a in after.items():
        b = before.get(hid)
        decision = _classify_change(b, a, rank_threshold)
        if decision is None:
            continue
        change_type, magnitude, rank_delta, pub_delta = decision
        out.append({
            "hcp_id": hid,
            "change_type": change_type,
            "before_cohort": b.cohort if b else None,
            "after_cohort": a.cohort,
            "before_rank": b.rank if b else None,
            "after_rank": a.rank,
            "rank_delta": rank_delta,
            "before_pub_count": b.pub_count if b else None,
            "after_pub_count": a.pub_count,
            "pub_delta": pub_delta,
            "magnitude": magnitude,
            "why_context": None,   # reserved for the Claude narration layer
        })

    # Drop-outs: in the before-snapshot, gone from after. Magnitude scales with prior
    # prominence (a top-ranked exit is newsworthy; a long-tail exit is not).
    for hid, b in before.items():
        if hid in after:
            continue
        magnitude = float(MAG_DROPPED_OUT_BASE)
        if b.rank is not None:
            magnitude += max(0, DROPPED_OUT_PROMINENCE_REF - b.rank)
        out.append({
            "hcp_id": hid,
            "change_type": CT_DROPPED_OUT,
            "before_cohort": b.cohort,
            "after_cohort": None,
            "before_rank": b.rank,
            "after_rank": None,
            "rank_delta": None,       # no after rank to diff against
            "before_pub_count": b.pub_count,
            "after_pub_count": None,
            "pub_delta": None,
            "magnitude": magnitude,
            "why_context": None,
        })

    # Biggest movers first.
    out.sort(key=lambda d: d["magnitude"], reverse=True)
    return out


def summarize_diffs(diff_rows: Sequence[Dict[str, Any]]) -> Dict[str, Any]:
    """Run-level aggregate. The five mutually-exclusive change_type counts partition the
    changed HCPs; hcps_with_new_pubs is CROSS-CUTTING (any row with pub_delta > 0, even if
    its primary change_type is something bigger)."""
    by_type = Counter(d["change_type"] for d in diff_rows)
    hcps_with_new_pubs = sum(1 for d in diff_rows if (d.get("pub_delta") or 0) > 0)
    total = len(diff_rows)
    if total <= ACTIVITY_QUIET_MAX:
        activity = "quiet"
    elif total >= ACTIVITY_BUSY_MIN:
        activity = "busy"
    else:
        activity = "moderate"
    return {
        "new_rising_stars": by_type.get(CT_NEW_RISING_STAR, 0),
        "promotions": by_type.get(CT_COHORT_PROMOTION, 0),
        "movers_up": by_type.get(CT_RANK_MOVER_UP, 0),
        "movers_down": by_type.get(CT_RANK_MOVER_DOWN, 0),
        "new_entrants": by_type.get(CT_NEW_ENTRANT, 0),
        "dropped_outs": by_type.get(CT_DROPPED_OUT, 0),
        "hcps_with_new_pubs": hcps_with_new_pubs,
        "total_hcps_changed": total,
        "activity_level": activity,
    }


# ============================================================
# Diff persistence
# ============================================================


def _insert_batched(supabase: Client, table: str, payloads: Sequence[Dict[str, Any]], errors: List[str]) -> int:
    """Batched .insert() (never upsert; never one giant transaction)."""
    written = 0
    for i in range(0, len(payloads), WRITE_BATCH):
        chunk = list(payloads[i:i + WRITE_BATCH])
        try:
            resp = supabase.table(table).insert(chunk).execute()
            written += len(resp.data) if resp.data else 0
        except Exception as exc:  # noqa: BLE001
            errors.append(f"{table} insert batch i={i} n={len(chunk)}: {exc}")
            eprint(f"[{table} insert] batch i={i}: {exc}")
    return written


def persist_diffs(
    supabase: Client,
    diff_run_id: str,
    ta_slug: str,
    computed_at: str,
    diff_rows: Sequence[Dict[str, Any]],
    display_names: Dict[str, str],
    errors: List[str],
) -> int:
    payloads = [
        {
            "diff_run_id": diff_run_id,
            "ta_slug": ta_slug,
            "computed_at": computed_at,
            "hcp_id": d["hcp_id"],
            "hcp_display_name": display_names.get(d["hcp_id"]),
            "change_type": d["change_type"],
            "before_cohort": d["before_cohort"],
            "after_cohort": d["after_cohort"],
            "before_rank": d["before_rank"],
            "after_rank": d["after_rank"],
            "rank_delta": d["rank_delta"],
            "before_pub_count": d["before_pub_count"],
            "after_pub_count": d["after_pub_count"],
            "pub_delta": d["pub_delta"],
            "magnitude": d["magnitude"],
            "why_context": d["why_context"],
        }
        for d in diff_rows
    ]
    return _insert_batched(supabase, DIFF_TABLE, payloads, errors)


def persist_summary(
    supabase: Client,
    diff_run_id: str,
    ta_slug: str,
    computed_at: str,
    summary: Dict[str, Any],
    errors: List[str],
) -> None:
    payload = {"diff_run_id": diff_run_id, "ta_slug": ta_slug, "computed_at": computed_at, **summary}
    _insert_batched(supabase, SUMMARY_TABLE, [payload], errors)


# ============================================================
# --self-check (idempotency/sanity: identical snapshots -> empty diff)
# ============================================================


def self_check(supabase: Client, ta_slug: str, target_version: str, rank_threshold: int) -> bool:
    """Capture the TA's state twice with no cycle between and assert the diff is empty.
    Reads only - persists nothing."""
    ta_id = resolve_ta_id(supabase, ta_slug)
    print(f"[self-check] capturing '{ta_slug}' twice (no cycle between)...")
    snap_a = capture_snapshot(supabase, ta_id, target_version)
    snap_b = capture_snapshot(supabase, ta_id, target_version)
    diffs = compute_hcp_diffs(snap_a, snap_b, rank_threshold)
    print(f"[self-check] captured {len(snap_a):,}/{len(snap_b):,} HCPs; diff rows: {len(diffs)}")
    ok = len(diffs) == 0
    print("[self-check] PASS: identical snapshots -> empty diff." if ok
          else f"[self-check] FAIL: expected 0 diffs, got {len(diffs)} (first: {diffs[:3]})")
    return ok


# ============================================================
# CLI
# ============================================================


def parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser(description="Reingest 'what changed' delta engine for a TA.")
    p.add_argument("--ta", metavar="SLUG", help="Therapeutic area slug (required except --print-ddl).")
    mode = p.add_mutually_exclusive_group()
    mode.add_argument("--snapshot", action="store_true", help="Capture a snapshot now -> reingest_snapshot_v2.")
    mode.add_argument("--diff", action="store_true", help="Compute delta between --before and --after snapshots.")
    mode.add_argument("--self-check", action="store_true", help="Capture twice (no cycle) and assert empty diff.")
    mode.add_argument("--print-ddl", action="store_true", help="Print the CREATE TABLE DDL and exit.")
    p.add_argument("--before", metavar="SNAPSHOT_ID", help="Before snapshot_id (with --diff).")
    p.add_argument("--after", metavar="SNAPSHOT_ID", help="After snapshot_id (with --diff).")
    p.add_argument("--rank-threshold", type=int, default=DEFAULT_RANK_THRESHOLD,
                   help=f"Min |rank change| to count as a mover (default {DEFAULT_RANK_THRESHOLD}).")
    p.add_argument("--dry-run", action="store_true", help="Compute + print, write nothing.")
    p.add_argument("--target-version", choices=["v1", "v2"], default="v2", help="Schema version (default v2).")
    p.add_argument("--summary-out", metavar="PATH", default=None, help="Also write run JSON summary here.")
    return p.parse_args()


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def main() -> None:
    args = parse_args()

    if args.print_ddl:
        print(DDL)
        return

    if not args.ta and not args.self_check:
        raise SystemExit("--ta <slug> is required.")
    if not (args.snapshot or args.diff or args.self_check):
        raise SystemExit("Pick a mode: --snapshot | --diff | --self-check | --print-ddl.")

    load_dotenv()
    supabase = init_supabase()
    target_version = args.target_version
    errors: List[str] = []
    t0 = time.perf_counter()

    # ---- self-check ----
    if args.self_check:
        raise SystemExit(0 if self_check(supabase, args.ta, target_version, args.rank_threshold) else 1)

    # ---- snapshot ----
    if args.snapshot:
        ta_id = resolve_ta_id(supabase, args.ta)
        snapshot_id = str(uuid.uuid4())
        captured_at = _now_iso()
        rows = capture_snapshot(supabase, ta_id, target_version)
        print(f"Snapshot {snapshot_id} - ta={args.ta} scope={SCOPE_TYPE} HCPs={len(rows):,}")
        if args.dry_run:
            print("*** DRY RUN: snapshot not persisted. ***")
        else:
            n = persist_snapshot(supabase, snapshot_id, args.ta, rows, captured_at, errors)
            print(f"Wrote {n:,} rows to {SNAPSHOT_TABLE}.")
        print(f"snapshot_id: {snapshot_id}")
        print(f"Wall time: {time.perf_counter() - t0:.1f}s")
        if errors:
            print(f"Errors: {len(errors)}"); [print(f"  {e}") for e in errors[:10]]
        return

    # ---- diff ----
    if args.diff:
        if not args.before or not args.after:
            raise SystemExit("--diff requires --before <snapshot_id> and --after <snapshot_id>.")
        before, ta_before = load_snapshot(supabase, args.before)
        after, ta_after = load_snapshot(supabase, args.after)
        if not before:
            raise SystemExit(f"Before snapshot {args.before} is empty / not found.")
        if not after:
            raise SystemExit(f"After snapshot {args.after} is empty / not found.")
        if ta_before and ta_after and ta_before != ta_after:
            raise SystemExit(f"Snapshot TA mismatch: before={ta_before} after={ta_after} (diff is per-TA).")
        ta_slug = args.ta or ta_after or ta_before

        diff_run_id = str(uuid.uuid4())
        computed_at = _now_iso()
        diff_rows = compute_hcp_diffs(before, after, args.rank_threshold)
        summary = summarize_diffs(diff_rows)
        display_names = fetch_display_names(supabase, [d["hcp_id"] for d in diff_rows], target_version)

        print(f"Diff {diff_run_id} - ta={ta_slug} before={args.before} after={args.after}")
        print(f"  before HCPs={len(before):,} after HCPs={len(after):,} changed={len(diff_rows):,}")
        print(f"  summary: {json.dumps(summary, sort_keys=True)}")
        print("  top movers:")
        for d in diff_rows[:10]:
            print(f"    [{d['magnitude']:.0f}] {display_names.get(d['hcp_id'], d['hcp_id'])}: {d['change_type']} "
                  f"cohort {d['before_cohort']}->{d['after_cohort']} rank {d['before_rank']}->{d['after_rank']} "
                  f"pubs {d['before_pub_count']}->{d['after_pub_count']}")

        if args.dry_run:
            print("*** DRY RUN: no writes. ***")
        else:
            n = persist_diffs(supabase, diff_run_id, ta_slug, computed_at, diff_rows, display_names, errors)
            persist_summary(supabase, diff_run_id, ta_slug, computed_at, summary, errors)
            print(f"Wrote {n:,} rows to {DIFF_TABLE} + 1 row to {SUMMARY_TABLE}.")
        print(f"diff_run_id: {diff_run_id}")
        print(f"Wall time: {time.perf_counter() - t0:.1f}s")
        if errors:
            print(f"Errors: {len(errors)}"); [print(f"  {e}") for e in errors[:10]]

        if args.summary_out:
            with open(args.summary_out, "w", encoding="utf-8") as f:
                json.dump({"diff_run_id": diff_run_id, "ta_slug": ta_slug, "computed_at": computed_at,
                           **summary, "dry_run": args.dry_run}, f, indent=2, sort_keys=True)
            print(f"Run-summary written to: {args.summary_out}")
        return


if __name__ == "__main__":
    main()
