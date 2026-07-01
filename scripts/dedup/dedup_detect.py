"""
FieldMark — Phase 1 duplicate detection (read-only, no DB writes).

Identifies strict duplicate HCP candidate pairs in hcps_v2 and writes
dedup_candidates_phase1.csv.

Usage:
  python dedup_detect.py
  python dedup_detect.py --limit-clusters 50
"""

from __future__ import annotations

import argparse
import csv
import itertools
from collections import Counter, defaultdict
from typing import Any, Dict, Iterable, List, Optional, Sequence, Set, Tuple

from dotenv import load_dotenv
from supabase import Client, create_client

READ_PAGE_SIZE = 1000
OUTPUT_CSV = "dedup_candidates_phase1.csv"

CANONICAL_KOL_LAST_NAMES = {
    "loomba",
    "sanyal",
    "chalasani",
    "kowdley",
    "garassino",
    "wakelee",
    "heymach",
}


def get_required_env(name: str) -> str:
    import os

    v = os.getenv(name)
    if not v:
        raise EnvironmentError(f"Missing required environment variable: {name}")
    return v


def init_supabase() -> Client:
    return create_client(get_required_env("SUPABASE_URL"), get_required_env("SUPABASE_KEY"))


def norm(value: Any) -> str:
    return " ".join(str(value or "").strip().split())


def lower(value: Any) -> str:
    return norm(value).lower()


def strip_initials(first_name: Any) -> str:
    """
    Strip trailing initials:
      "Kris V." -> "Kris"
      "John D." -> "John"
    """
    parts = norm(first_name).split()
    while parts and len(parts[-1].replace(".", "")) == 1 and parts[-1].replace(".", "").isalpha():
        parts.pop()
    return " ".join(parts).strip().lower()


def fetch_all_hcps(client: Client) -> List[Dict[str, Any]]:
    rows: List[Dict[str, Any]] = []
    last_id: Optional[str] = None
    while True:
        q = (
            client.table("hcps_v2")
            .select(
                "id,first_name,last_name,total_career_pubs,npi_number,"
                "institution_normalized,country,nppes_practice_state"
            )
            .order("id")
            .limit(READ_PAGE_SIZE)
        )
        if last_id is not None:
            q = q.gt("id", last_id)
        batch = q.execute().data or []
        if not batch:
            break
        rows.extend(batch)
        last_id = str(batch[-1]["id"])
        if len(batch) < READ_PAGE_SIZE:
            break
    return rows


def fetch_pub_author_counts(client: Client) -> Dict[str, int]:
    counts: Dict[str, int] = defaultdict(int)
    last_pub_id: Optional[str] = None
    while True:
        q = (
            client.table("publication_authors_v2")
            .select("publication_id,hcp_id")
            .order("publication_id")
            .limit(READ_PAGE_SIZE)
        )
        if last_pub_id is not None:
            q = q.gt("publication_id", last_pub_id)
        batch = q.execute().data or []
        if not batch:
            break
        for row in batch:
            hcp_id = row.get("hcp_id")
            if hcp_id:
                counts[str(hcp_id)] += 1
        last_pub_id = str(batch[-1]["publication_id"])
        if len(batch) < READ_PAGE_SIZE:
            break
    return dict(counts)


def is_publication_record(hcp: Dict[str, Any], pub_author_count: int) -> bool:
    career_pubs = int(hcp.get("total_career_pubs") or 0)
    return career_pubs >= 100 or pub_author_count >= 50


def is_npi_stub_record(hcp: Dict[str, Any], pub_author_count: int) -> bool:
    has_npi = bool(norm(hcp.get("npi_number")))
    return has_npi and pub_author_count < 20


def geographic_recommendation(primary: Dict[str, Any], stub: Dict[str, Any]) -> Tuple[bool, str]:
    p_country = lower(primary.get("country"))
    s_country = lower(stub.get("country"))
    p_state = lower(primary.get("nppes_practice_state"))
    s_state = lower(stub.get("nppes_practice_state"))

    if not p_country and not s_country and not p_state and not s_state:
        return (False, "merge_review")

    p_is_us = p_country in {"us", "usa", "united states"}
    s_is_us = s_country in {"us", "usa", "united states"}

    if (p_is_us and s_country and not s_is_us) or (s_is_us and p_country and not p_is_us):
        return (False, "skip_geographic_mismatch")

    if p_is_us and s_is_us:
        return (True, "merge_high_confidence")

    if p_country and s_country and p_country == s_country:
        return (True, "merge_high_confidence")

    return (False, "merge_review")


def build_candidate_row(
    cluster_id: int,
    primary: Dict[str, Any],
    stub: Dict[str, Any],
    primary_pub_count: int,
    stub_pub_count: int,
) -> Dict[str, Any]:
    geographic_match, action = geographic_recommendation(primary, stub)
    return {
        "cluster_id": cluster_id,
        "primary_hcp_id": primary["id"],
        "stub_hcp_id": stub["id"],
        "last_name": norm(primary.get("last_name")),
        "primary_first_name": norm(primary.get("first_name")),
        "stub_first_name": norm(stub.get("first_name")),
        "primary_career_pubs": int(primary.get("total_career_pubs") or 0),
        "primary_pub_author_count": primary_pub_count,
        "primary_npi": norm(primary.get("npi_number")),
        "primary_country": norm(primary.get("country")),
        "primary_state": norm(primary.get("nppes_practice_state")),
        "primary_institution": norm(primary.get("institution_normalized")),
        "stub_career_pubs": int(stub.get("total_career_pubs") or 0),
        "stub_pub_author_count": stub_pub_count,
        "stub_npi": norm(stub.get("npi_number")),
        "stub_country": norm(stub.get("country")),
        "stub_state": norm(stub.get("nppes_practice_state")),
        "stub_institution": norm(stub.get("institution_normalized")),
        "geographic_match": geographic_match,
        "recommended_action": action,
    }


def write_csv(path: str, rows: Sequence[Dict[str, Any]]) -> None:
    fieldnames = [
        "cluster_id",
        "primary_hcp_id",
        "stub_hcp_id",
        "last_name",
        "primary_first_name",
        "stub_first_name",
        "primary_career_pubs",
        "primary_pub_author_count",
        "primary_npi",
        "primary_country",
        "primary_state",
        "primary_institution",
        "stub_career_pubs",
        "stub_pub_author_count",
        "stub_npi",
        "stub_country",
        "stub_state",
        "stub_institution",
        "geographic_match",
        "recommended_action",
    ]
    with open(path, "w", encoding="utf-8", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(rows)


def main() -> None:
    parser = argparse.ArgumentParser(description="Phase 1 strict duplicate detector for hcps_v2.")
    parser.add_argument(
        "--limit-clusters",
        type=int,
        default=None,
        help="Optional cap on emitted candidate clusters for quick tests.",
    )
    args = parser.parse_args()

    load_dotenv()
    client = init_supabase()

    print("Loading hcps_v2...")
    hcps = fetch_all_hcps(client)
    print(f"Loaded {len(hcps):,} HCP rows")

    print("Loading publication_authors_v2 counts...")
    pub_author_counts = fetch_pub_author_counts(client)
    print(f"Loaded publication-author counts for {len(pub_author_counts):,} HCP ids")

    last_name_freq: Counter[str] = Counter()
    by_last_name: Dict[str, List[Dict[str, Any]]] = defaultdict(list)
    for h in hcps:
        ln = lower(h.get("last_name"))
        if not ln:
            continue
        last_name_freq[ln] += 1
        by_last_name[ln].append(h)

    candidates: List[Dict[str, Any]] = []
    cluster_id = 0

    for ln, group in by_last_name.items():
        # Keep global common-name guard.
        if last_name_freq[ln] >= 50:
            continue
        # Cap group iteration size to reduce false positives.
        if len(group) > 10:
            continue
        # Need at least a pair.
        if len(group) < 2:
            continue

        for a, b in itertools.combinations(group, 2):
            a_first = strip_initials(a.get("first_name"))
            b_first = strip_initials(b.get("first_name"))
            if not a_first or not b_first or a_first != b_first:
                continue

            a_pub = int(pub_author_counts.get(str(a["id"]), 0))
            b_pub = int(pub_author_counts.get(str(b["id"]), 0))

            a_is_pub = is_publication_record(a, a_pub)
            b_is_pub = is_publication_record(b, b_pub)
            a_is_stub = is_npi_stub_record(a, a_pub)
            b_is_stub = is_npi_stub_record(b, b_pub)

            pair_is_candidate = (a_is_pub and b_is_stub) or (b_is_pub and a_is_stub)
            if not pair_is_candidate:
                continue

            primary, stub = (a, b) if a_is_pub else (b, a)
            primary_pub, stub_pub = (a_pub, b_pub) if a_is_pub else (b_pub, a_pub)

            cluster_id += 1
            candidates.append(
                build_candidate_row(cluster_id, primary, stub, primary_pub, stub_pub)
            )

            if args.limit_clusters is not None and len(candidates) >= args.limit_clusters:
                break

        if args.limit_clusters is not None and len(candidates) >= args.limit_clusters:
            break

    write_csv(OUTPUT_CSV, candidates)

    action_counts = Counter(c["recommended_action"] for c in candidates)
    print("\n=== Dedup Phase 1 Detection Summary ===")
    print(f"Total candidates found: {len(candidates):,}")
    print("Breakdown by recommended_action:")
    for k, v in sorted(action_counts.items(), key=lambda kv: (-kv[1], kv[0])):
        print(f"  {k}: {v:,}")

    print("\nSample 20 candidates:")
    for row in candidates[:20]:
        print(row)

    print("\nTop 20 by primary_career_pubs:")
    top20 = sorted(candidates, key=lambda r: int(r["primary_career_pubs"]), reverse=True)[:20]
    for row in top20:
        print(
            f"cluster={row['cluster_id']} last={row['last_name']} "
            f"primary={row['primary_first_name']} {row['last_name']} "
            f"career_pubs={row['primary_career_pubs']} action={row['recommended_action']}"
        )

    found_kols: Set[str] = set()
    for row in candidates:
        ln = lower(row.get("last_name"))
        if ln in CANONICAL_KOL_LAST_NAMES:
            found_kols.add(ln)
    print("\nCanonical KOLs found in candidates:")
    if found_kols:
        for name in sorted(found_kols):
            print(f"  {name.title()}")
    else:
        print("  (none)")

    print(f"\nWrote CSV: {OUTPUT_CSV}")


if __name__ == "__main__":
    main()
