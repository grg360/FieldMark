"""
FieldMark - one-time backfill of hcps_v2.identity_hash for pre-hash HCPs.

~268,853 existing HCPs predate the identity_hash column and carry identity_hash IS NULL.
Because create_hcps_v2.py's incremental idempotency turns on an identity_hash existence
check, those NULL-hash rows are invisible to it - the check is inert for ~95% of the
corpus. This backfill populates identity_hash for them, which (a) hardens incremental
idempotency and (b) doubles as a duplicate-detection pass: any two existing HCPs that
compute the SAME hash are an undetected duplicate pair, surfaced here as a FINDING.

SINGLE SOURCE OF TRUTH FOR THE HASH - RECOVER FROM INVENTORY, NOT hcps_v2
------------------------------------------------------------------------
This script does NOT implement hashing. For each HCP it recovers the person's INVENTORY
shard rows (via their hcp_openalex_authors_v2 links) and feeds them straight back through
create_hcps_v2.py's own derive_cluster_metadata() - the exact code path the engine uses at
insert time - and reads .identity_hash. Same inputs, same function, one source of truth.

Recovery MUST come from inventory, not from hcps_v2 scalar columns: the engine hashes on
institution_ror (the ROR id), but build_hcp_row does NOT persist institution_ror to hcps_v2
(only institution_normalized, the institution NAME). It also hashes on the cluster's
most-frequent display_name, not on hcps_v2.first_name/last_name. Recovering from hcps_v2
columns would feed the engine the wrong inputs and every name+institution hash would differ
from what the engine recomputes on reingest - silently breaking idempotency. (Hash rule, for
reference: ORCID present -> hash canonical ORCID; else sha256hex(normalized_name || '|' ||
institution_ror), or normalized institution name if no ROR; nameonly rows anchored on their
primary OpenAlex id.)

An HCP with no v2 link shards / no inventory rows is UNRECOVERABLE: its hash inputs cannot be
reconstructed from inventory, so it is reported and left NULL - never guessed from hcps_v2.

COLLISIONS ARE REPORTED, NEVER AUTO-MERGED
------------------------------------------
identity_hash is UNIQUE NOT NULL. If a computed hash already belongs to a DIFFERENT hcp_id
(pre-existing owner, or an earlier row in this same run), the colliding row is NOT written,
nothing is merged, and the run does not crash. The pair is recorded to a CSV + counted in
the summary, for later review with the (already-validated) dedup tools. This backfill
surfaces duplicates; it does not resolve them.

IDEMPOTENT: every write is guarded by `WHERE identity_hash IS NULL`, and only NULL-hash rows
are selected, so a re-run after a full backfill finds ~0 rows.

WRITES: partial .update().eq()...is_(identity_hash, null), one independent statement per row
(never upsert, never one giant transaction) - consistent with create_hcps_v2.py and the
delete-timeout lessons.

Flags: --dry-run | --execute (required, exclusive), --limit N, --summary-out PATH,
        --collisions-csv PATH, --target-version {v1,v2}.

Env: SUPABASE_URL, SUPABASE_KEY (via python-dotenv).
"""

from __future__ import annotations

import argparse
import csv
import json
import os
import sys
import time
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Tuple

from dotenv import load_dotenv

# --- Reuse the engine's code as the single source of truth. ---------------------------
# Ensure this script's directory is importable so `create_hcps_v2` resolves whether the
# script is launched from the repo root or from scripts/classify/.
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from collections import defaultdict  # noqa: E402
from create_hcps_v2 import (  # noqa: E402  (import after sys.path tweak, intentional)
    INVENTORY_SELECT,
    derive_cluster_metadata,
    fetch_identity_hash_map,
    get_required_env,
    get_table_name,
    init_supabase,
    normalize_openalex_author_id,
)


PAGE_SIZE = 1000
RECOVERY_BATCH = 200      # HCPs per batched shard+inventory recovery round
PROGRESS_EVERY = 500
DEFAULT_COLLISIONS_CSV = "identity_hash_collisions.csv"

# ---------------------------------------------------------------------------------------
# RECOVERY SOURCE = openalex_author_inventory, NOT hcps_v2 scalar columns.
#
# The engine's identity_hash is derived at insert time from the person's INVENTORY shards
# (most-frequent display_name, most-frequent ROR, ORCID, nameonly anchor) inside
# derive_cluster_metadata. Critically, build_hcp_row does NOT persist institution_ror to
# hcps_v2 (it stores only institution_normalized, the institution NAME). So the ROR the
# engine hashed on is NOT recoverable from hcps_v2 - reading hcps_v2 columns would hash the
# institution name instead and every name+institution hash would be wrong.
#
# Therefore we recover each HCP's inventory shard rows (via its hcp_openalex_authors_v2
# links) and feed them straight back through the engine's OWN derive_cluster_metadata. Same
# inputs, same function, same hash the engine will recompute on reingest.
#
# hcps_v2 columns below are read ONLY for human-readable collision-report context.
# ---------------------------------------------------------------------------------------
HCP_SELECT_COLUMNS = (
    "id,preferred_display_name,first_name,last_name,institution_normalized,institution_canonical"
)


def eprint(*args: Any, **kwargs: Any) -> None:
    print(*args, file=sys.stderr, **kwargs)


def parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser(
        description="Backfill hcps_v2.identity_hash for NULL-hash HCPs (report-only collisions).",
    )
    mode = p.add_mutually_exclusive_group(required=True)
    mode.add_argument("--dry-run", action="store_true",
                      help="Compute all hashes, detect collisions, WRITE NOTHING; report + collision CSV.")
    mode.add_argument("--execute", action="store_true", help="Perform the identity_hash writes.")
    p.add_argument("--limit", type=int, default=None, metavar="N", help="Process only N NULL-hash rows (testing).")
    p.add_argument("--target-version", choices=["v1", "v2"], default="v2",
                   help="Schema version (default v2 -> hcps_v2).")
    p.add_argument("--collisions-csv", default=DEFAULT_COLLISIONS_CSV, metavar="PATH",
                   help=f"Where to write the collision findings (default {DEFAULT_COLLISIONS_CSV}).")
    p.add_argument("--summary-out", default=None, metavar="PATH",
                   help="Also write the run-summary JSON to this path.")
    return p.parse_args()


# ============================================================
# Reads
# ============================================================


def fetch_null_hash_hcps(
    supabase,
    hcps_table: str,
    limit: Optional[int],
) -> List[Dict[str, Any]]:
    """All hcps_v2 rows WHERE identity_hash IS NULL, keyset-paginated by the unique id."""
    out: List[Dict[str, Any]] = []
    last_id: Optional[str] = None
    while True:
        q = (
            supabase.table(hcps_table)
            .select(HCP_SELECT_COLUMNS)
            .is_("identity_hash", "null")
            .order("id")
            .limit(PAGE_SIZE)
        )
        if last_id is not None:
            q = q.gt("id", last_id)
        batch = q.execute().data or []
        if not batch:
            break
        for row in batch:
            out.append(row)
            if limit is not None and len(out) >= limit:
                return out
        last_id = batch[-1].get("id")
        if not last_id or len(batch) < PAGE_SIZE:
            break
    return out


def fetch_shards_for_hcps(supabase, link_table: str, hcp_ids: List[str]) -> Dict[str, List[str]]:
    """hcp_id -> [normalized openalex_author_id] from the v2 link table, batched.

    Composite-PK table with NO id column -> select PK columns only, never select("id").
    """
    out: Dict[str, List[str]] = defaultdict(list)
    for i in range(0, len(hcp_ids), RECOVERY_BATCH):
        chunk = hcp_ids[i:i + RECOVERY_BATCH]
        rows = (
            supabase.table(link_table)
            .select("hcp_id,openalex_author_id")
            .in_("hcp_id", chunk)
            .execute()
            .data
            or []
        )
        for r in rows:
            oid = normalize_openalex_author_id(r.get("openalex_author_id"))
            if oid:
                out[str(r.get("hcp_id"))].append(oid)
    return out


def fetch_inventory_rows(supabase, oa_ids: List[str]) -> Dict[str, Dict[str, Any]]:
    """normalized openalex_author_id -> inventory row (engine-shaped, INVENTORY_SELECT)."""
    out: Dict[str, Dict[str, Any]] = {}
    for i in range(0, len(oa_ids), RECOVERY_BATCH):
        chunk = oa_ids[i:i + RECOVERY_BATCH]
        rows = (
            supabase.table("openalex_author_inventory")
            .select(INVENTORY_SELECT)
            .in_("openalex_author_id", chunk)
            .execute()
            .data
            or []
        )
        for r in rows:
            oid = normalize_openalex_author_id(r.get("openalex_author_id"))
            if oid:
                out[oid] = r
    return out


def recover_identity_hash(shard_inventory_rows: List[Dict[str, Any]]) -> str:
    """Recover an HCP's identity_hash by feeding its inventory shards back through the
    engine's OWN derive_cluster_metadata - the exact code path used at insert time.

    Rows are sorted by openalex_author_id ascending to match the order the engine saw them
    (fetch_unlinked_inventory orders by openalex_author_id, and clustering appends in that
    order), so most_frequent tie-breaks resolve identically. flat_stats/ror_country are
    irrelevant to the hash, so empty dicts are passed.
    """
    ordered = sorted(
        shard_inventory_rows,
        key=lambda r: normalize_openalex_author_id(r.get("openalex_author_id")),
    )
    return derive_cluster_metadata(ordered, {}, {}).identity_hash


def fetch_hcp_context(supabase, hcps_table: str, hcp_id: str) -> Tuple[str, str]:
    """(display_name, institution) for a pre-existing hash owner, for the collision report."""
    rows = (
        supabase.table(hcps_table)
        .select("preferred_display_name,first_name,last_name,institution_normalized,institution_canonical")
        .eq("id", hcp_id)
        .limit(1)
        .execute()
        .data
        or []
    )
    if not rows:
        return ("", "")
    return (display_name_of(rows[0]), institution_of(rows[0]))


# ============================================================
# Report-context helpers (human-readable only; NOT hash inputs)
# ============================================================


def display_name_of(row: Dict[str, Any]) -> str:
    pref = (row.get("preferred_display_name") or "").strip()
    if pref:
        return pref
    parts = [str(row.get("first_name") or "").strip(), str(row.get("last_name") or "").strip()]
    return " ".join(p for p in parts if p).strip()


def institution_of(row: Dict[str, Any]) -> str:
    for col in ("institution_canonical", "institution_normalized"):
        v = row.get(col)
        if isinstance(v, str) and v.strip():
            return v.strip()
        if v:
            return str(v)
    return ""


# ============================================================
# Writes
# ============================================================


def write_identity_hash(
    supabase,
    hcps_table: str,
    hcp_id: str,
    identity_hash: str,
    ts_iso: str,
) -> Tuple[bool, Optional[str]]:
    """UPDATE hcps_v2 SET identity_hash=... WHERE id=... AND identity_hash IS NULL.

    Returns (written, error). Partial .update().eq(), never upsert. The IS NULL guard makes
    the write idempotent and safe against a row that got hashed concurrently. A unique-
    constraint violation here (a race that a pre-check missed) is surfaced to the caller as
    a collision signal, not a crash.
    """
    try:
        resp = (
            supabase.table(hcps_table)
            .update({"identity_hash": identity_hash, "updated_at": ts_iso})
            .eq("id", hcp_id)
            .is_("identity_hash", "null")
            .execute()
        )
        # Empty data => the guard matched no row (already hashed by a concurrent run): a
        # benign no-op, not an error.
        return (bool(resp.data), None)
    except Exception as exc:  # noqa: BLE001 - report, never crash the run
        return (False, str(exc))


# ============================================================
# Collision reporting
# ============================================================


COLLISION_FIELDS = [
    "computed_hash",
    "existing_hcp_id",
    "existing_display_name",
    "existing_institution",
    "colliding_hcp_id",
    "colliding_display_name",
    "colliding_institution",
]


def write_collisions_csv(path: str, collisions: List[Dict[str, Any]]) -> None:
    with open(path, "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=COLLISION_FIELDS)
        w.writeheader()
        for c in collisions:
            w.writerow({k: c.get(k, "") for k in COLLISION_FIELDS})


# ============================================================
# Main
# ============================================================


def main() -> None:
    args = parse_args()
    if args.limit is not None and args.limit < 1:
        raise SystemExit("--limit N requires N >= 1")
    dry_run = bool(args.dry_run)
    target_version = args.target_version

    load_dotenv()
    supabase = init_supabase()
    _ = get_required_env("SUPABASE_URL")  # fail fast if env is missing

    hcps_table = get_table_name("hcps", target_version)
    link_table = get_table_name("hcp_openalex_authors", target_version)
    ts_iso = datetime.now(timezone.utc).isoformat()
    t0 = time.perf_counter()

    print(f"Backfill identity_hash - table={hcps_table}, mode={'DRY-RUN' if dry_run else 'EXECUTE'}")

    # Seed the hash->owner map from ALREADY-hashed rows (the engine's own reader). These are
    # the pre-existing owners a computed hash can collide with.
    print(f"\nLoading existing identity_hash owners from {hcps_table}...")
    hash_to_owner: Dict[str, str] = fetch_identity_hash_map(supabase, target_version)
    print(f"  Already-hashed HCPs: {len(hash_to_owner):,}")

    print(f"\nFetching NULL-hash HCP rows from {hcps_table}...")
    null_rows = fetch_null_hash_hcps(supabase, hcps_table, args.limit)
    print(f"  NULL-hash HCPs to process: {len(null_rows):,}"
          + (f" (--limit {args.limit})" if args.limit else ""))

    # Cache of hcp_id -> (display, institution) for rows we've seen this run, so an
    # intra-run collision can name the earlier owner without a refetch.
    seen_context: Dict[str, Tuple[str, str]] = {}

    hashes_computed = 0
    hashes_written = 0
    collisions: List[Dict[str, Any]] = []
    errors: List[str] = []
    to_write: List[Tuple[str, str]] = []  # (hcp_id, identity_hash) - planned writes
    unrecoverable: List[str] = []          # HCPs with no recoverable inventory shards

    processed = 0
    for start in range(0, len(null_rows), RECOVERY_BATCH):
        batch = null_rows[start:start + RECOVERY_BATCH]
        batch_ids = [str(r["id"]) for r in batch]
        for r in batch:
            seen_context[str(r["id"])] = (display_name_of(r), institution_of(r))

        # Batched recovery source: link shards -> inventory rows (engine-shaped).
        shards = fetch_shards_for_hcps(supabase, link_table, batch_ids)
        all_oa = sorted({oid for oids in shards.values() for oid in oids})
        inv_by_oid = fetch_inventory_rows(supabase, all_oa)

        for r in batch:
            processed += 1
            hid = str(r["id"])
            shard_rows = [inv_by_oid[o] for o in shards.get(hid, []) if o in inv_by_oid]
            if not shard_rows:
                # No v2 link shards / no inventory rows -> the engine's hash inputs are not
                # recoverable from inventory for this HCP. Do NOT guess from hcps_v2 columns
                # (that is what produced the wrong ROR-less hash); report and skip.
                unrecoverable.append(hid)
                continue
            try:
                h = recover_identity_hash(shard_rows)
            except Exception as exc:  # noqa: BLE001
                errors.append(f"recover hcp={hid}: {exc}")
                eprint(f"[recover] hcp={hid}: {exc}")
                continue
            hashes_computed += 1

            owner = hash_to_owner.get(h)
            if owner is not None and owner != hid:
                # Collision: this hash already belongs to a different HCP (pre-existing or an
                # earlier row this run). Report, do not write, do not merge, keep going.
                owner_disp, owner_inst = seen_context.get(owner) or fetch_hcp_context(supabase, hcps_table, owner)
                this_disp, this_inst = seen_context[hid]
                collisions.append({
                    "computed_hash": h,
                    "existing_hcp_id": owner,
                    "existing_display_name": owner_disp,
                    "existing_institution": owner_inst,
                    "colliding_hcp_id": hid,
                    "colliding_display_name": this_disp,
                    "colliding_institution": this_inst,
                })
                continue

            # Claim the hash for this HCP so a later identical hash this run is caught too.
            hash_to_owner[h] = hid
            to_write.append((hid, h))

            if not dry_run:
                written, err = write_identity_hash(supabase, hcps_table, hid, h, ts_iso)
                if err is not None:
                    # A unique violation past the pre-check is a race-collision: record it
                    # (owner unknown from here) and release our optimistic claim.
                    if "duplicate" in err.lower() or "unique" in err.lower():
                        collisions.append({
                            "computed_hash": h,
                            "existing_hcp_id": "(race: pre-existing owner)",
                            "existing_display_name": "",
                            "existing_institution": "",
                            "colliding_hcp_id": hid,
                            "colliding_display_name": seen_context[hid][0],
                            "colliding_institution": seen_context[hid][1],
                        })
                        hash_to_owner.pop(h, None)
                    else:
                        errors.append(f"write hcp={hid}: {err}")
                        eprint(f"[write] hcp={hid}: {err}")
                elif written:
                    hashes_written += 1

            if processed % PROGRESS_EVERY == 0 or processed == len(null_rows):
                elapsed = time.perf_counter() - t0
                print(f"  [{processed}/{len(null_rows)}] computed={hashes_computed:,} "
                      f"written={hashes_written:,} collisions={len(collisions):,} "
                      f"unrecoverable={len(unrecoverable):,} errors={len(errors)} ({elapsed:.0f}s)")

    would_write = len(to_write)

    # Collision findings CSV is written in BOTH modes (it is a report, not a DB write).
    if collisions:
        write_collisions_csv(args.collisions_csv, collisions)

    summary = {
        "mode": "backfill_identity_hash",
        "dry_run": dry_run,
        "target_version": target_version,
        "timestamp": ts_iso,
        "total_null_hash_hcps": len(null_rows),
        "hashes_computed": hashes_computed,
        "hashes_written": hashes_written if not dry_run else 0,
        "hashes_would_write": would_write if dry_run else None,
        "collisions_found": len(collisions),
        "collisions_csv": (os.path.abspath(args.collisions_csv) if collisions else None),
        "unrecoverable_hcps": len(unrecoverable),
        "errors": len(errors),
    }

    print("\n" + "=" * 72)
    print("BACKFILL identity_hash - SUMMARY")
    print("=" * 72)
    print(json.dumps(summary, indent=2, sort_keys=True))
    if dry_run:
        print(f"\n*** DRY RUN: no writes. Would write {would_write:,} identity_hash value(s). ***")
    if collisions:
        print(f"\n{len(collisions):,} COLLISION(S) - duplicate HCP pairs found. NOT merged; review with "
              f"the dedup suite. CSV: {os.path.abspath(args.collisions_csv)}")
    if unrecoverable:
        print(f"\n{len(unrecoverable):,} UNRECOVERABLE HCP(s): no v2 link shards / inventory rows, so the "
              f"engine's hash inputs could not be recovered from inventory. Left NULL (not guessed). "
              f"First few: {unrecoverable[:10]}")
    if errors:
        print(f"\n{len(errors)} error(s):")
        for e in errors[:15]:
            print(f"  {e}")
    print(f"\nWall time: {time.perf_counter() - t0:.1f}s")

    if args.summary_out:
        with open(args.summary_out, "w", encoding="utf-8") as f:
            json.dump(summary, f, indent=2, sort_keys=True)
        print(f"Run-summary written to: {args.summary_out}")


if __name__ == "__main__":
    main()
