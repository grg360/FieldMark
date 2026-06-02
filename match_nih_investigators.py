"""
match_nih_investigators.py — Match NIH grant PIs from nih_grants.raw_payload to hcps_v2.

Extracts principal_investigators from each grant's raw_payload, runs a tiered
matching cascade, writes matches to nih_grant_investigators, unmatched rows to
nih_unmatched_researchers, and backfills hcps_v2.nih_profile_id on first match.

Required environment variables:
- DATABASE_URL

Usage:
    python match_nih_investigators.py
    python match_nih_investigators.py --dry-run
"""

from __future__ import annotations

import argparse
import json
import os
import re
from collections import defaultdict
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any, DefaultDict, Dict, List, Optional, Tuple

import psycopg
from dotenv import load_dotenv
from psycopg.rows import dict_row

CHECKPOINT_PATH = "nih_match_checkpoint.json"
BATCH_SIZE = 500
DRY_RUN_GRANT_LIMIT = 1000

UPSERT_INVESTIGATOR_SQL = """
INSERT INTO public.nih_grant_investigators (
  core_project_num,
  hcp_id,
  role,
  match_confidence,
  match_method,
  raw_nih_name,
  raw_nih_institution
)
VALUES (%s, %s::uuid, %s, %s, %s, %s, %s)
ON CONFLICT (core_project_num, hcp_id, role) DO UPDATE SET
  match_confidence = EXCLUDED.match_confidence,
  match_method = EXCLUDED.match_method,
  raw_nih_name = EXCLUDED.raw_nih_name,
  raw_nih_institution = EXCLUDED.raw_nih_institution,
  matched_at = NOW()
"""

BACKFILL_PROFILE_ID_SQL = """
UPDATE public.hcps_v2
SET nih_profile_id = %s
WHERE id = %s::uuid
  AND nih_profile_id IS NULL
"""


def utc_now_iso() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def get_required_env(name: str) -> str:
    value = os.getenv(name, "").strip()
    if not value:
        raise EnvironmentError(f"Missing required environment variable: {name}")
    return value


def normalize_name(name: str) -> str:
    """Lowercase, strip whitespace, keep letters/spaces/hyphens, collapse spaces."""
    if not name:
        return ""
    s = name.strip().lower()
    s = re.sub(r"[^a-z\s\-']", " ", s)
    s = re.sub(r"\s+", " ", s).strip()
    s = re.sub(r"\b[a-z]\.\s*$", "", s).strip()
    s = re.sub(r"\s+", " ", s).strip()
    return s


def normalize_institution(inst: str) -> str:
    """Lowercase, strip whitespace, collapse spaces, strip trailing punctuation."""
    if not inst:
        return ""
    s = inst.strip().lower()
    s = re.sub(r"\s+", " ", s)
    s = re.sub(r"[.,;:\-]+$", "", s.strip())
    return s


def first_name_matches(pi_first: str, hcp_first: Optional[str]) -> bool:
    """
    Match on the FIRST TOKEN of first names, with abbreviation fallback.

    "James" matches "James"            → True (exact)
    "James" matches "James J"          → True (first token = "james" on both)
    "James M." matches "James"         → True (first token = "james")
    "James" matches "Jennifer"         → False (first tokens differ)
    "J" matches "James"                → True (abbreviation fallback)
    "J." matches "James"               → True (after normalization, "j" abbreviates "james")
    """
    pi_norm = normalize_name(pi_first)
    hcp_norm = normalize_name(hcp_first or "")
    if not pi_norm or not hcp_norm:
        return False

    # Split into tokens and take the first token of each side
    pi_first_token = pi_norm.split()[0] if pi_norm.split() else ""
    hcp_first_token = hcp_norm.split()[0] if hcp_norm.split() else ""

    if not pi_first_token or not hcp_first_token:
        return False

    # Exact match on first token
    if pi_first_token == hcp_first_token:
        return True

    # Abbreviation fallback: one side is a single character that matches the
    # other side's first character
    pi_is_abbrev = len(pi_first_token) == 1
    hcp_is_abbrev = len(hcp_first_token) == 1

    if pi_is_abbrev and not hcp_is_abbrev:
        return hcp_first_token[0] == pi_first_token[0]
    if hcp_is_abbrev and not pi_is_abbrev:
        return pi_first_token[0] == hcp_first_token[0]

    return False


def institution_exact(org_name: str, hcp_institution: Optional[str]) -> bool:
    left = normalize_institution(org_name)
    right = normalize_institution(hcp_institution or "")
    return bool(left and right and left == right)


def institution_overlap(org_name: str, hcp_institution: Optional[str]) -> bool:
    left = normalize_institution(org_name)
    right = normalize_institution(hcp_institution or "")
    if not left or not right:
        return False
    return left in right or right in left


def pi_role(is_contact_pi: bool) -> str:
    """Map NIH contact flag to nih_grant_investigators.role (schema: pi | co_pi)."""
    return "pi" if is_contact_pi else "co_pi"


def to_db_confidence(confidence: str) -> str:
    """Map internal tier confidence to schema-allowed values."""
    if confidence == "exact":
        return "high"
    if confidence in {"high", "medium", "review_pending"}:
        return confidence
    return "review_pending"


def raw_pi_name(pi: Dict[str, Any]) -> str:
    full = (pi.get("full_name") or "").strip()
    if full:
        return full
    parts = [
        (pi.get("first_name") or "").strip(),
        (pi.get("middle_name") or "").strip(),
        (pi.get("last_name") or "").strip(),
    ]
    return " ".join(p for p in parts if p)


def extract_principal_investigators(raw_payload: Any) -> List[Dict[str, Any]]:
    if raw_payload is None:
        return []
    payload = raw_payload
    if isinstance(payload, str):
        try:
            payload = json.loads(payload)
        except json.JSONDecodeError:
            return []
    if not isinstance(payload, dict):
        return []
    pis = payload.get("principal_investigators") or []
    if not isinstance(pis, list):
        return []
    return [p for p in pis if isinstance(p, dict)]


@dataclass
class HcpRecord:
    id: str
    first_name: str
    last_name: str
    last_name_key: str
    institution_normalized: str
    nih_profile_id: Optional[int]


@dataclass
class MatchOutcome:
    hcp_id: str
    confidence: str
    method: str
    backfill_profile_id: bool


@dataclass
class BatchStats:
    matched: int = 0
    exact: int = 0
    high: int = 0
    medium: int = 0
    unmatched: int = 0
    profile_ids_backfilled: int = 0


@dataclass
class RunStats:
    grants_processed: int = 0
    investigators_processed: int = 0
    matched: int = 0
    exact: int = 0
    high: int = 0
    medium: int = 0
    unmatched: int = 0
    profile_ids_backfilled: int = 0
    profile_id_conflicts: int = 0

    def absorb_batch(self, batch: BatchStats) -> None:
        self.matched += batch.matched
        self.exact += batch.exact
        self.high += batch.high
        self.medium += batch.medium
        self.unmatched += batch.unmatched
        self.profile_ids_backfilled += batch.profile_ids_backfilled


class HcpIndex:
    def __init__(self, rows: List[HcpRecord]) -> None:
        self.by_id: Dict[str, HcpRecord] = {}
        self.by_profile_id: Dict[int, HcpRecord] = {}
        self.by_last_name: DefaultDict[str, List[HcpRecord]] = defaultdict(list)
        for row in rows:
            self.by_id[row.id] = row
            if row.nih_profile_id is not None:
                self.by_profile_id[int(row.nih_profile_id)] = row
            self.by_last_name[row.last_name_key].append(row)

    def candidates_for_pi(self, pi: Dict[str, Any]) -> List[HcpRecord]:
        last_key = normalize_name(str(pi.get("last_name") or ""))
        if not last_key:
            return []
        return [
            hcp
            for hcp in self.by_last_name.get(last_key, [])
            if first_name_matches(str(pi.get("first_name") or ""), hcp.first_name)
        ]


def load_checkpoint(path: str) -> Dict[str, Any]:
    try:
        with open(path, encoding="utf-8") as fh:
            data = json.load(fh)
    except (FileNotFoundError, json.JSONDecodeError):
        data = {}
    if not isinstance(data, dict):
        data = {}
    data.setdefault("last_batch_index", -1)
    data.setdefault("started_at", utc_now_iso())
    data.setdefault("last_updated_at", utc_now_iso())
    return data


def save_checkpoint(path: str, state: Dict[str, Any]) -> None:
    state["last_updated_at"] = utc_now_iso()
    with open(path, "w", encoding="utf-8") as fh:
        json.dump(state, fh, indent=2)


def load_hcp_index(conn: psycopg.Connection) -> HcpIndex:
    with conn.cursor(row_factory=dict_row) as cur:
        cur.execute(
            """
            SELECT
              id::text AS id,
              first_name,
              last_name,
              last_name_lower,
              institution_normalized,
              nih_profile_id
            FROM public.hcps_v2
            """
        )
        rows = cur.fetchall()

    records: List[HcpRecord] = []
    for row in rows:
        last_name_key = normalize_name(str(row.get("last_name") or "")) or str(
            row.get("last_name_lower") or ""
        ).strip().lower()
        profile_id = row.get("nih_profile_id")
        records.append(
            HcpRecord(
                id=str(row["id"]),
                first_name=str(row.get("first_name") or ""),
                last_name=str(row.get("last_name") or ""),
                last_name_key=last_name_key,
                institution_normalized=str(row.get("institution_normalized") or ""),
                nih_profile_id=int(profile_id) if profile_id is not None else None,
            )
        )
    return HcpIndex(records)


def count_grants(conn: psycopg.Connection) -> int:
    with conn.cursor() as cur:
        cur.execute("SELECT COUNT(*) AS total FROM public.nih_grants")
        row = cur.fetchone()
        if row is None:
            return 0
        if isinstance(row, dict):
            return int(row["total"])
        return int(row[0])


def fetch_grant_batch(
    conn: psycopg.Connection,
    offset: int,
    limit: int,
) -> List[Dict[str, Any]]:
    with conn.cursor(row_factory=dict_row) as cur:
        cur.execute(
            """
            SELECT core_project_num, org_name, raw_payload
            FROM public.nih_grants
            ORDER BY core_project_num
            OFFSET %s
            LIMIT %s
            """,
            (offset, limit),
        )
        return list(cur.fetchall())


def match_pi(
    pi: Dict[str, Any],
    org_name: Optional[str],
    index: HcpIndex,
) -> Optional[MatchOutcome]:
    profile_id = pi.get("profile_id")
    if profile_id is not None:
        try:
            pid = int(profile_id)
        except (TypeError, ValueError):
            pid = None
        if pid is not None:
            hcp = index.by_profile_id.get(pid)
            if hcp is not None:
                return MatchOutcome(
                    hcp_id=hcp.id,
                    confidence="exact",
                    method="profile_id",
                    backfill_profile_id=False,
                )

    candidates = index.candidates_for_pi(pi)
    org = (org_name or "").strip()

    if org:
        exact_inst = [
            hcp for hcp in candidates if institution_exact(org, hcp.institution_normalized)
        ]
        if len(exact_inst) == 1:
            return MatchOutcome(
                hcp_id=exact_inst[0].id,
                confidence="exact",
                method="name_institution_exact",
                backfill_profile_id=True,
            )

        overlap_inst = [
            hcp for hcp in candidates if institution_overlap(org, hcp.institution_normalized)
        ]
        if len(overlap_inst) == 1:
            return MatchOutcome(
                hcp_id=overlap_inst[0].id,
                confidence="high",
                method="name_institution_overlap",
                backfill_profile_id=True,
            )
        if len(overlap_inst) > 1:
            return None
    else:
        if len(candidates) == 1:
            return MatchOutcome(
                hcp_id=candidates[0].id,
                confidence="medium",
                method="name_only",
                backfill_profile_id=True,
            )

    return None


def queue_profile_backfill(
    hcp_id: str,
    profile_id: Any,
    index: HcpIndex,
    pending: Dict[str, int],
    stats: RunStats,
) -> None:
    if profile_id is None:
        return
    try:
        pid = int(profile_id)
    except (TypeError, ValueError):
        return

    hcp = index.by_id.get(hcp_id)
    if hcp is None:
        return

    existing = hcp.nih_profile_id
    if existing is not None and int(existing) != pid:
        stats.profile_id_conflicts += 1
        print(
            f"WARNING: profile_id conflict for hcp {hcp_id}: "
            f"existing={existing}, new={pid}",
            flush=True,
        )
        return

    if existing is None and hcp_id not in pending:
        pending[hcp_id] = pid


def apply_profile_backfills(
    conn: psycopg.Connection,
    index: HcpIndex,
    pending: Dict[str, int],
    dry_run: bool,
) -> int:
    if not pending:
        return 0

    applied = 0
    if dry_run:
        return len(pending)

    with conn.cursor() as cur:
        for hcp_id, profile_id in pending.items():
            cur.execute(BACKFILL_PROFILE_ID_SQL, (profile_id, hcp_id))
            if cur.rowcount > 0:
                applied += 1
                hcp = index.by_id[hcp_id]
                hcp.nih_profile_id = profile_id
                index.by_profile_id[profile_id] = hcp
    pending.clear()
    return applied


def flush_batch_writes(
    conn: psycopg.Connection,
    investigator_rows: List[Tuple[Any, ...]],
    unmatched_rows: List[Tuple[Any, ...]],
    dry_run: bool,
) -> None:
    if dry_run:
        return

    with conn.cursor() as cur:
        if investigator_rows:
            cur.executemany(UPSERT_INVESTIGATOR_SQL, investigator_rows)

        if unmatched_rows:
            with cur.copy(
                """
                COPY public.nih_unmatched_researchers (
                  core_project_num,
                  raw_nih_name,
                  normalized_name,
                  raw_nih_institution,
                  role,
                  unmatched_reason
                ) FROM STDIN
                """
            ) as copy:
                for row in unmatched_rows:
                    copy.write_row(row)


def process_batch(
    grants: List[Dict[str, Any]],
    index: HcpIndex,
    stats: RunStats,
    pending_backfills: Dict[str, int],
) -> Tuple[BatchStats, List[Tuple[Any, ...]], List[Tuple[Any, ...]]]:
    batch = BatchStats()
    investigator_rows: List[Tuple[Any, ...]] = []
    unmatched_rows: List[Tuple[Any, ...]] = []

    for grant in grants:
        core_project_num = str(grant["core_project_num"])
        org_name = grant.get("org_name")
        pis = extract_principal_investigators(grant.get("raw_payload"))

        for pi in pis:
            stats.investigators_processed += 1
            raw_name = raw_pi_name(pi)
            role = pi_role(bool(pi.get("is_contact_pi")))
            outcome = match_pi(pi, org_name, index)

            if outcome is None:
                batch.unmatched += 1
                unmatched_rows.append(
                    (
                        core_project_num,
                        raw_name,
                        normalize_name(raw_name),
                        org_name,
                        role,
                        "ambiguous_or_no_match",
                    )
                )
                continue

            batch.matched += 1
            if outcome.confidence == "exact":
                batch.exact += 1
            elif outcome.confidence == "high":
                batch.high += 1
            elif outcome.confidence == "medium":
                batch.medium += 1

            investigator_rows.append(
                (
                    core_project_num,
                    outcome.hcp_id,
                    role,
                    to_db_confidence(outcome.confidence),
                    outcome.method,
                    raw_name,
                    org_name,
                )
            )

            if outcome.backfill_profile_id:
                before = len(pending_backfills)
                queue_profile_backfill(
                    outcome.hcp_id,
                    pi.get("profile_id"),
                    index,
                    pending_backfills,
                    stats,
                )
                if len(pending_backfills) > before:
                    batch.profile_ids_backfilled += 1

    return batch, investigator_rows, unmatched_rows


def print_batch_progress(
    batch_num: int,
    total_batches: int,
    batch_stats: BatchStats,
) -> None:
    print(
        f"Batch {batch_num}/{total_batches}: "
        f"{batch_stats.matched} matched "
        f"({batch_stats.exact} exact, {batch_stats.high} high, {batch_stats.medium} medium), "
        f"{batch_stats.unmatched} unmatched, "
        f"{batch_stats.profile_ids_backfilled} profile_ids backfilled",
        flush=True,
    )


def print_final_stats(stats: RunStats) -> None:
    rate = (
        (stats.matched / stats.investigators_processed) * 100.0
        if stats.investigators_processed
        else 0.0
    )
    print("\n=== Final statistics ===", flush=True)
    print(f"Total grants processed: {stats.grants_processed}", flush=True)
    print(f"Total investigator rows processed: {stats.investigators_processed}", flush=True)
    print(
        f"Matched: {stats.matched} "
        f"(exact={stats.exact}, high={stats.high}, medium={stats.medium})",
        flush=True,
    )
    print(f"Unmatched: {stats.unmatched}", flush=True)
    print(f"Profile IDs backfilled: {stats.profile_ids_backfilled}", flush=True)
    print(f"Profile ID conflicts (warning): {stats.profile_id_conflicts}", flush=True)
    print(f"Average match rate: {rate:.1f}%", flush=True)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Match NIH grant investigators to hcps_v2.")
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Validate matching without writing; processes up to 1000 grants.",
    )
    return parser.parse_args()


def main() -> int:
    load_dotenv()
    args = parse_args()
    dry_run = bool(args.dry_run)

    database_url = get_required_env("DATABASE_URL")
    stats = RunStats()
    pending_backfills: Dict[str, int] = {}

    checkpoint = load_checkpoint(CHECKPOINT_PATH)
    start_batch_index = int(checkpoint.get("last_batch_index", -1)) + 1
    if dry_run:
        start_batch_index = 0

    with psycopg.connect(database_url, row_factory=dict_row) as conn:
        conn.autocommit = False
        print("Loading hcps_v2 index...", flush=True)
        index = load_hcp_index(conn)
        print(f"Loaded {len(index.by_id)} HCP records.", flush=True)

        total_grants = count_grants(conn)
        if dry_run:
            total_grants = min(total_grants, DRY_RUN_GRANT_LIMIT)

        if total_grants == 0:
            print("No grants to process.", flush=True)
            return 0

        total_batches = (total_grants + BATCH_SIZE - 1) // BATCH_SIZE
        print(
            f"Processing {total_grants} grants in {total_batches} batches "
            f"(starting at batch {start_batch_index + 1}).",
            flush=True,
        )

        for batch_index in range(start_batch_index, total_batches):
            offset = batch_index * BATCH_SIZE
            limit = min(BATCH_SIZE, total_grants - offset)
            grants = fetch_grant_batch(conn, offset, limit)
            if not grants:
                break

            batch_stats, investigator_rows, unmatched_rows = process_batch(
                grants, index, stats, pending_backfills
            )
            stats.grants_processed += len(grants)
            stats.absorb_batch(batch_stats)

            if not dry_run:
                flush_batch_writes(conn, investigator_rows, unmatched_rows, dry_run=False)
                apply_profile_backfills(conn, index, pending_backfills, dry_run=False)
                conn.commit()
                checkpoint["last_batch_index"] = batch_index
                save_checkpoint(CHECKPOINT_PATH, checkpoint)
            else:
                apply_profile_backfills(conn, index, pending_backfills, dry_run=True)
                pending_backfills.clear()

            print_batch_progress(batch_index + 1, total_batches, batch_stats)

    print_final_stats(stats)
    if dry_run:
        print("\nDry run complete — no database writes or checkpoint updates.", flush=True)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
