"""
FieldMark — Link HCPs to reference institutions via match_pattern substring matching.

Reads reference_institutions and hcps_v2 institution fields. Writes to
hcp_institutions_v2.

Requires: SUPABASE_URL, SUPABASE_KEY (python-dotenv loads .env).
hcp_institutions_v2 must already exist in Supabase (create manually).

Examples:
  python hcp_institution_linker.py --dry-run
  python hcp_institution_linker.py --execute
"""

from __future__ import annotations

import argparse
import json
from collections import Counter, defaultdict
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Sequence, Set, Tuple

from dotenv import load_dotenv
from supabase import Client, create_client

READ_PAGE_SIZE = 1000
WRITE_BATCH_SIZE = 500
TOP_INSTITUTIONS_N = 10
MAYO_SAMPLE_N = 5

LOOMBA_HCP_ID = "8a5ed89d-df8a-4b7c-a5f7-37f602b63577"

RefLookupEntry = Tuple[str, str, Any, bool]


# ---------------------------------------------------------------------------
# Env / client
# ---------------------------------------------------------------------------


def env(name: str) -> str:
    import os

    v = os.getenv(name)
    if not v:
        raise EnvironmentError(f"Missing env var: {name}")
    return v


def sb() -> Client:
    return create_client(env("SUPABASE_URL"), env("SUPABASE_KEY"))


# ---------------------------------------------------------------------------
# Pagination
# ---------------------------------------------------------------------------


def fetch_hcps_page(client: Client, last_id: Optional[str]) -> List[Dict[str, Any]]:
    q = (
        client.table("hcps_v2")
        .select(
            "id,institution_normalized,institution_raw,institution_history,"
            "institution_secondary"
        )
        .order("id")
        .limit(READ_PAGE_SIZE)
    )
    if last_id is not None:
        q = q.gt("id", last_id)
    return q.execute().data or []


# ---------------------------------------------------------------------------
# Reference lookup / matching
# ---------------------------------------------------------------------------


def build_ref_lookup(institutions: Sequence[Dict[str, Any]]) -> List[RefLookupEntry]:
    """Expand match_patterns into (institution_id, lowercase_pattern, type, is_coe) tuples."""
    lookup: List[RefLookupEntry] = []
    for inst in institutions:
        inst_id = str(inst.get("id") or "")
        if not inst_id:
            continue
        inst_type = inst.get("institution_type")
        is_coe = bool(inst.get("is_coe"))
        patterns = inst.get("match_patterns")
        if patterns is None:
            continue
        if isinstance(patterns, str):
            try:
                patterns = json.loads(patterns)
            except json.JSONDecodeError:
                patterns = [patterns]
        if not isinstance(patterns, list):
            patterns = [patterns]
        for pattern in patterns:
            pattern_lower = str(pattern).strip().lower()
            if pattern_lower:
                lookup.append((inst_id, pattern_lower, inst_type, is_coe))
    return lookup


def match_hcp(
    hcp: Dict[str, Any], ref_lookup: Sequence[RefLookupEntry]
) -> List[Tuple[str, str, str, float]]:
    """Returns list of (institution_id, match_pattern, source, confidence)."""
    sources: List[Tuple[str, Any, float]] = [
        ("institution_normalized", hcp.get("institution_normalized"), 1.0),
        ("institution_raw", hcp.get("institution_raw"), 0.85),
        ("institution_secondary", hcp.get("institution_secondary"), 0.7),
    ]

    inst_history = hcp.get("institution_history") or []
    if isinstance(inst_history, list):
        for h in inst_history:
            if isinstance(h, dict) and h.get("institution"):
                sources.append(("institution_history", h["institution"], 0.5))
            elif isinstance(h, str):
                sources.append(("institution_history", h, 0.5))

    best_match_per_institution: Dict[str, Tuple[str, str, float]] = {}

    for source_field, value, source_conf in sources:
        if not value:
            continue
        value_lower = str(value).lower()
        for inst_id, pattern, _inst_type, _is_coe in ref_lookup:
            if pattern in value_lower:
                match_conf = source_conf
                existing = best_match_per_institution.get(inst_id)
                if not existing or match_conf > existing[2]:
                    best_match_per_institution[inst_id] = (pattern, source_field, match_conf)

    return [
        (inst_id, pat, src, conf)
        for inst_id, (pat, src, conf) in best_match_per_institution.items()
    ]


# ---------------------------------------------------------------------------
# Writes
# ---------------------------------------------------------------------------


def upsert_links(client: Client, rows: List[Dict[str, Any]]) -> int:
    if not rows:
        return 0
    written = 0
    for start in range(0, len(rows), WRITE_BATCH_SIZE):
        batch = rows[start : start + WRITE_BATCH_SIZE]
        response = (
            client.table("hcp_institutions_v2")
            .upsert(batch, on_conflict="hcp_id,reference_institution_id")
            .execute()
        )
        if not response.data:
            raise RuntimeError(
                f"hcp_institutions_v2 upsert returned empty data ({len(batch)} rows) - "
                "writes may have been silently dropped"
            )
        written += len(response.data)
    return written


# ---------------------------------------------------------------------------
# Validation
# ---------------------------------------------------------------------------


def find_mayo_institution_id(
    institutions: Sequence[Dict[str, Any]],
) -> Optional[str]:
    for inst in institutions:
        name = str(inst.get("canonical_name") or "").lower()
        if "mayo clinic" in name:
            return str(inst["id"])
        patterns = inst.get("match_patterns") or []
        if isinstance(patterns, str):
            try:
                patterns = json.loads(patterns)
            except json.JSONDecodeError:
                patterns = [patterns]
        if not isinstance(patterns, list):
            patterns = [patterns]
        for p in patterns:
            if "mayo clinic" in str(p).lower():
                return str(inst["id"])
    return None


def run_validation(
    institutions: Sequence[Dict[str, Any]],
    link_rows: Sequence[Dict[str, Any]],
    matched_hcp_ids: Set[str],
    hcp_ids_with_normalized: Set[str],
    loomba_matches: List[Dict[str, Any]],
    mayo_sample_rows: List[Dict[str, Any]],
) -> None:
    inst_by_id = {str(i["id"]): i for i in institutions if i.get("id")}

    type_to_hcps: Dict[str, Set[str]] = defaultdict(set)
    inst_hcp_counts: Counter[str] = Counter()

    for row in link_rows:
        hcp_id = str(row["hcp_id"])
        ref_id = str(row["reference_institution_id"])
        inst_hcp_counts[ref_id] += 1
        inst = inst_by_id.get(ref_id, {})
        inst_type = str(inst.get("institution_type") or "unknown")
        type_to_hcps[inst_type].add(hcp_id)

    print("\n--- Validation ---")
    print("Per institution_type (unique HCPs matched):")
    for inst_type in sorted(type_to_hcps):
        print(f"  {inst_type}: {len(type_to_hcps[inst_type])} unique HCPs matched")

    print(f"\nTop {TOP_INSTITUTIONS_N} institutions by HCP link count:")
    for ref_id, count in inst_hcp_counts.most_common(TOP_INSTITUTIONS_N):
        inst = inst_by_id.get(ref_id, {})
        name = inst.get("canonical_name") or ref_id
        itype = inst.get("institution_type") or "unknown"
        print(f"  {name} | {itype} | {count}")

    print(f"\nCanonical sanity — all matches for Loomba ({LOOMBA_HCP_ID}):")
    if not loomba_matches:
        print("  (no matches)")
    for row in loomba_matches:
        inst = inst_by_id.get(str(row["reference_institution_id"]), {})
        print(
            f"  {inst.get('canonical_name', row['reference_institution_id'])} | "
            f"pattern={row.get('match_pattern')!r} | source={row.get('match_source')} | "
            f"confidence={row.get('match_confidence')}"
        )

    print("\nMayo Clinic pattern — sample matches:")
    if not mayo_sample_rows:
        print("  (no Mayo Clinic institution or no matches found)")
    for row in mayo_sample_rows:
        print(
            f"  hcp_id={row['hcp_id']} | pattern={row.get('match_pattern')!r} | "
            f"source={row.get('match_source')} | confidence={row.get('match_confidence')}"
        )

    unmatched = hcp_ids_with_normalized - matched_hcp_ids
    print(
        f"\nUnmatched HCPs (institution_normalized populated, no reference match): "
        f"{len(unmatched)}"
    )


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------


def main() -> None:
    load_dotenv()
    parser = argparse.ArgumentParser(description="Link HCPs to reference institutions.")
    group = parser.add_mutually_exclusive_group(required=True)
    group.add_argument("--dry-run", action="store_true", help="Match and validate; no writes.")
    group.add_argument("--execute", action="store_true", help="Match, validate, and upsert links.")
    args = parser.parse_args()
    execute = args.execute

    client = sb()
    now_iso = datetime.now(timezone.utc).isoformat()

    print("Loading reference_institutions...")
    institutions = (
        client.table("reference_institutions")
        .select("id,canonical_name,match_patterns,institution_type,is_coe")
        .execute()
        .data
        or []
    )
    ref_lookup = build_ref_lookup(institutions)
    print(f"  {len(institutions)} institutions, {len(ref_lookup)} pattern tuples")

    mayo_inst_id = find_mayo_institution_id(institutions)

    upsert_rows: List[Dict[str, Any]] = []
    matched_hcp_ids: Set[str] = set()
    hcp_ids_with_normalized: Set[str] = set()
    loomba_matches: List[Dict[str, Any]] = []
    mayo_sample_rows: List[Dict[str, Any]] = []

    hcps_scanned = 0
    last_id: Optional[str] = None

    print("Scanning hcps_v2...")
    while True:
        batch = fetch_hcps_page(client, last_id)
        if not batch:
            break

        page_links = 0
        for hcp in batch:
            hcps_scanned += 1
            hcp_id = str(hcp.get("id") or "")
            if not hcp_id:
                continue

            if hcp.get("institution_normalized"):
                hcp_ids_with_normalized.add(hcp_id)

            for inst_id, pattern, source, conf in match_hcp(hcp, ref_lookup):
                row = {
                    "hcp_id": hcp_id,
                    "reference_institution_id": inst_id,
                    "match_pattern": pattern,
                    "match_source": source,
                    "match_confidence": conf,
                    "linked_at": now_iso,
                }
                upsert_rows.append(row)
                matched_hcp_ids.add(hcp_id)
                page_links += 1

                if hcp_id == LOOMBA_HCP_ID:
                    loomba_matches.append(row)
                if mayo_inst_id and inst_id == mayo_inst_id and len(mayo_sample_rows) < MAYO_SAMPLE_N:
                    mayo_sample_rows.append(row)

        last_id = str(batch[-1]["id"])
        print(
            f"  page: scanned {hcps_scanned} HCPs, page_links={page_links}, "
            f"cumulative_links={len(upsert_rows)}"
        )
        if len(batch) < READ_PAGE_SIZE:
            break

    print(
        f"\nMatching complete: {hcps_scanned} HCPs scanned, "
        f"{len(matched_hcp_ids)} HCPs with >=1 institution, {len(upsert_rows)} links."
    )

    if execute:
        print(f"Upserting {len(upsert_rows)} rows to hcp_institutions_v2...")
        written = upsert_links(client, upsert_rows)
        print(f"Upserted {written} rows.")
    else:
        print("\nDry run — no database writes.")

    run_validation(
        institutions=institutions,
        link_rows=upsert_rows,
        matched_hcp_ids=matched_hcp_ids,
        hcp_ids_with_normalized=hcp_ids_with_normalized,
        loomba_matches=loomba_matches,
        mayo_sample_rows=mayo_sample_rows,
    )


if __name__ == "__main__":
    main()
