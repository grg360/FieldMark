"""
FieldMark - compute the AFFECTED-HCP set for an incremental cycle (read-only).

Emits affected.txt: one hcp_id uuid per line, consumed by the scoped runs:
  ta_tagging_rebuild_v2.py --candidate-hcp-ids-file affected.txt
  dedup_detect.py          --candidate-hcp-ids-file affected.txt

COMPLETENESS IS THE WHOLE REQUIREMENT. If this file misses an HCP, the scoped run silently
skips it. The affected set is the DISTINCT union of two groups for the current batch:

  A. Newly-created HCPs:  hcps_v2 WHERE ingestion_run_id = <run_id>.
  B. Pre-existing HCPs who authored any pub in the batch (a new pub can push a previously
     below-threshold HCP over a TA threshold, or introduce a new duplicate).

CRITICAL SEQUENCING CONSTRAINT - group B does NOT come from publication_authors_v2.
This step runs right after Step C, BEFORE Step F. Step F is what links pubs into
publication_authors_v2, and it runs LATER - so a publication_authors_v2 join returns NOTHING
for the batch pubs. Group B is therefore derived from the pubs' authorships JSON:
  publications_v2.authorships  ->  auth->'author'->>'id'  (OpenAlex author id, full URL)
  ->  hcp_openalex_authors_v2.openalex_author_id  ->  hcp_id
(This mirrors build_author_flat.sql, the authoritative authorships-extraction reference.)

IDENTIFYING BATCH PUBS: publications_v2 has NO ingestion_run_id column, so batch pubs cannot
be found by run id. Provide them explicitly:
  --pub-ids-file PATH   (RECOMMENDED - the pub uuids captured at ingest time; exact + safe)
  --ingested-after TS   (convenience - publications_v2.ingested_at >= TS; FRAGILE if cycles
                         overlap, since it captures whatever else landed in the window)

Env: SUPABASE_URL, SUPABASE_KEY (via python-dotenv).
"""

from __future__ import annotations

import argparse
import os
import sys
from typing import Any, Dict, List, Optional, Set

from dotenv import load_dotenv
from supabase import Client, create_client

READ_PAGE_SIZE = 1000
IN_CHUNK_SIZE = 100
DEFAULT_OUT = "affected.txt"


def eprint(*args: Any, **kwargs: Any) -> None:
    print(*args, file=sys.stderr, **kwargs)


def env(name: str) -> str:
    v = os.getenv(name)
    if not v:
        raise EnvironmentError(f"Missing env var: {name}")
    return v


def sb() -> Client:
    return create_client(env("SUPABASE_URL"), env("SUPABASE_KEY"))


def normalize_oa_id(value: Any) -> str:
    """Match hcp_openalex_authors_v2 storage format (full OpenAlex URL)."""
    s = str(value or "").strip()
    if not s:
        return ""
    if s.startswith("https://openalex.org/"):
        return s
    tail = s.split("/")[-1]
    return f"https://openalex.org/{tail}" if tail else ""


def read_ids_file(path: str) -> Set[str]:
    """One id per line; blank lines and '#' comments ignored."""
    out: Set[str] = set()
    with open(path, "r", encoding="utf-8") as f:
        for line in f:
            s = line.strip()
            if s and not s.startswith("#"):
                out.add(s)
    return out


def fetch_rows_in(
    client: Client,
    table: str,
    columns: str,
    filter_col: str,
    values: List[str],
    order_col: str,
) -> List[Dict[str, Any]]:
    """Chunked .in_() fetch with intra-chunk range pagination (read-only)."""
    out: List[Dict[str, Any]] = []
    vals = sorted(set(values))
    for i in range(0, len(vals), IN_CHUNK_SIZE):
        chunk = vals[i : i + IN_CHUNK_SIZE]
        offset = 0
        while True:
            batch = (
                client.table(table)
                .select(columns)
                .in_(filter_col, chunk)
                .order(order_col)
                .range(offset, offset + READ_PAGE_SIZE - 1)
                .execute()
                .data
                or []
            )
            if not batch:
                break
            out.extend(batch)
            if len(batch) < READ_PAGE_SIZE:
                break
            offset += READ_PAGE_SIZE
    return out


# ============================================================
# Group A: newly-created HCPs
# ============================================================


def fetch_new_hcp_ids(client: Client, run_id: str) -> Set[str]:
    """Group A: hcps_v2 ids created by this ingestion run."""
    out: Set[str] = set()
    last_id: Optional[str] = None
    while True:
        q = (
            client.table("hcps_v2")
            .select("id")
            .eq("ingestion_run_id", run_id)
            .order("id")
            .limit(READ_PAGE_SIZE)
        )
        if last_id is not None:
            q = q.gt("id", last_id)
        batch = q.execute().data or []
        if not batch:
            break
        for r in batch:
            rid = r.get("id")
            if rid:
                out.add(str(rid))
        last_id = str(batch[-1]["id"])
        if len(batch) < READ_PAGE_SIZE:
            break
    return out


# ============================================================
# Batch pub id resolution
# ============================================================


def fetch_pub_ids_by_ingested_after(client: Client, ts_iso: str) -> Set[str]:
    """publications_v2 ids with ingested_at >= ts. FRAGILE if cycles overlap."""
    out: Set[str] = set()
    last_id: Optional[str] = None
    while True:
        q = (
            client.table("publications_v2")
            .select("id,ingested_at")
            .gte("ingested_at", ts_iso)
            .order("id")
            .limit(READ_PAGE_SIZE)
        )
        if last_id is not None:
            q = q.gt("id", last_id)
        batch = q.execute().data or []
        if not batch:
            break
        for r in batch:
            rid = r.get("id")
            if rid:
                out.add(str(rid))
        last_id = str(batch[-1]["id"])
        if len(batch) < READ_PAGE_SIZE:
            break
    return out


# ============================================================
# Group B: authorships JSON -> OpenAlex author ids -> hcp_ids
# ============================================================


def fetch_pub_authorships(client: Client, pub_ids: Set[str]) -> List[Dict[str, Any]]:
    """publications_v2 (id, authorships) for the batch pubs."""
    return fetch_rows_in(
        client, "publications_v2", "id,authorships",
        "id", sorted(pub_ids), order_col="id",
    )


def extract_openalex_author_ids(pubs: List[Dict[str, Any]]) -> Set[str]:
    """OpenAlex author ids from authorships JSON (auth->'author'->>'id'), normalized to the
    full-URL form stored in hcp_openalex_authors_v2. Robust to missing/odd JSON shapes."""
    oa_ids: Set[str] = set()
    for pub in pubs:
        auths = pub.get("authorships")
        if not isinstance(auths, list):
            continue
        for a in auths:
            if not isinstance(a, dict):
                continue
            author = a.get("author")
            if not isinstance(author, dict):
                continue
            oid = normalize_oa_id(author.get("id"))
            if oid:
                oa_ids.add(oid)
    return oa_ids


def map_openalex_ids_to_hcps(client: Client, oa_ids: Set[str]) -> Set[str]:
    """Group B: hcp_ids linked to these OpenAlex author ids via hcp_openalex_authors_v2.
    Composite-PK table (no id column) -> select PK columns only."""
    rows = fetch_rows_in(
        client, "hcp_openalex_authors_v2", "hcp_id,openalex_author_id",
        "openalex_author_id", sorted(oa_ids), order_col="hcp_id",
    )
    out: Set[str] = set()
    for r in rows:
        hid = r.get("hcp_id")
        if hid:
            out.add(str(hid))
    return out


# ============================================================
# Verification
# ============================================================


def fetch_existing_hcp_ids(client: Client, hcp_ids: Set[str]) -> Set[str]:
    """Which of these ids actually exist in hcps_v2 (dangling-id sanity check)."""
    rows = fetch_rows_in(
        client, "hcps_v2", "id", "id", sorted(hcp_ids), order_col="id",
    )
    return {str(r["id"]) for r in rows if r.get("id")}


# ============================================================
# Core
# ============================================================


def compute_affected(
    client: Client,
    run_id: str,
    batch_pub_ids: Set[str],
    *,
    verify: bool = True,
) -> Dict[str, Any]:
    """Returns {union, group_a, group_b, counts, dangling}. Pure orchestration over the
    read helpers; no writes."""
    group_a = fetch_new_hcp_ids(client, run_id)

    pubs = fetch_pub_authorships(client, batch_pub_ids) if batch_pub_ids else []
    oa_ids = extract_openalex_author_ids(pubs)
    group_b = map_openalex_ids_to_hcps(client, oa_ids) if oa_ids else set()

    union = group_a | group_b

    dangling: List[str] = []
    if verify and union:
        present = fetch_existing_hcp_ids(client, union)
        dangling = sorted(union - present)

    counts = {
        "batch_pubs_requested": len(batch_pub_ids),
        "batch_pubs_found": len(pubs),
        "openalex_author_ids": len(oa_ids),
        "new_hcps_A": len(group_a),
        "group_B_total": len(group_b),
        "preexisting_affected_B_not_in_A": len(group_b - group_a),
        "total_distinct": len(union),
    }
    return {
        "union": union,
        "group_a": group_a,
        "group_b": group_b,
        "counts": counts,
        "dangling": dangling,
    }


def write_ids_file(path: str, ids: Set[str]) -> None:
    with open(path, "w", encoding="utf-8", newline="") as f:
        for hid in sorted(ids):
            f.write(f"{hid}\n")


def parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser(description="Compute the affected-HCP set file for a scoped incremental run.")
    p.add_argument("--run-id", required=True, metavar="UUID",
                   help="ingestion_run_id of the incremental Step C batch (group A: new HCPs).")
    src = p.add_argument_group("batch pub source (group B)")
    src.add_argument("--pub-ids-file", metavar="PATH",
                     help="RECOMMENDED: batch pub uuids, one per line (captured at ingest).")
    src.add_argument("--ingested-after", metavar="TS",
                     help="Alt: publications_v2.ingested_at >= TS (ISO). FRAGILE if cycles overlap.")
    p.add_argument("--allow-no-batch-pubs", action="store_true",
                   help="Acknowledge this cycle added NO new pubs -> group B is empty, output = "
                        "group A only. Required to proceed with no batch-pub source (guards "
                        "against silent incompleteness).")
    p.add_argument("--out", default=DEFAULT_OUT, metavar="PATH", help=f"Output path (default {DEFAULT_OUT}).")
    p.add_argument("--no-verify", action="store_true", help="Skip the hcps_v2 existence check.")
    return p.parse_args()


def main() -> None:
    args = parse_args()
    load_dotenv()
    client = sb()

    # Resolve batch pubs (group B source). Completeness guard: refuse to silently emit
    # group A only unless the cycle genuinely had no new pubs (--allow-no-batch-pubs).
    batch_pub_ids: Set[str] = set()
    if args.pub_ids_file:
        batch_pub_ids |= read_ids_file(args.pub_ids_file)
        print(f"Batch pubs from file: {len(batch_pub_ids):,}")
    if args.ingested_after:
        print("[WARN] --ingested-after is a time window; if cycles overlap it will capture "
              "unrelated pubs. Prefer --pub-ids-file (ids captured at ingest).")
        tw = fetch_pub_ids_by_ingested_after(client, args.ingested_after)
        batch_pub_ids |= tw
        print(f"Batch pubs from ingested_after={args.ingested_after}: {len(tw):,}")

    if not batch_pub_ids and not args.allow_no_batch_pubs:
        raise SystemExit(
            "No batch-pub source given. Group B (pre-existing authors of new pubs) would be "
            "EMPTY, which usually means the affected set is incomplete. Pass --pub-ids-file "
            "(recommended) or --ingested-after, or --allow-no-batch-pubs if this cycle truly "
            "added no new pubs."
        )

    result = compute_affected(client, args.run_id, batch_pub_ids, verify=not args.no_verify)
    counts = result["counts"]
    union = result["union"]
    group_a = result["group_a"]

    # Superset invariant: group A must be fully contained (never drop a new HCP).
    if not group_a.issubset(union):
        raise RuntimeError("INVARIANT VIOLATION: group A is not a subset of the union.")

    if result["dangling"]:
        raise SystemExit(
            f"SANITY FAILURE: {len(result['dangling'])} affected id(s) do not exist in hcps_v2 "
            f"(dangling). First few: {result['dangling'][:10]}. Not writing {args.out}."
        )

    write_ids_file(args.out, union)

    print("\n=== Affected-HCP set ===")
    print(f"  new_hcps (A):                    {counts['new_hcps_A']:,}")
    print(f"  preexisting_affected (B not A):  {counts['preexisting_affected_B_not_in_A']:,}")
    print(f"  group B total (new+existing):    {counts['group_B_total']:,}")
    print(f"  total_distinct (A union B):      {counts['total_distinct']:,}")
    print(f"  batch pubs found / requested:    {counts['batch_pubs_found']:,} / {counts['batch_pubs_requested']:,}")
    print(f"  openalex author ids extracted:   {counts['openalex_author_ids']:,}")
    print(f"  group A subset of union:         True")
    print(f"  dangling ids:                    {len(result['dangling'])}")
    print(f"\nWrote {len(union):,} hcp_id(s) to {args.out}")


if __name__ == "__main__":
    main()
