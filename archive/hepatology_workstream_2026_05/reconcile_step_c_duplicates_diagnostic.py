"""
FieldMark — read-only diagnostic for Step C name+institution collisions.

Finds the ~34 openalex_author_inventory rows with no hcp_openalex_authors link
and matches each to existing HCPs by parsed name + institution.

Usage:
  python reconcile_step_c_duplicates_diagnostic.py
"""

from __future__ import annotations

from collections import defaultdict
from typing import Any, Dict, List, Optional, Set, Tuple

from dotenv import load_dotenv

from preview_step_b_matching import (
    init_supabase,
    normalize_first_name,
    normalize_last_name,
    normalize_org_name,
    split_display_name_to_raw_parts,
)

PAGE_SIZE = 1000


def fetch_linked_openalex_ids(supabase) -> set:
    linked_ids: set = set()
    last_id: Optional[str] = None
    while True:
        q = (
            supabase.table("hcp_openalex_authors")
            .select("openalex_author_id")
            .order("openalex_author_id")
            .limit(PAGE_SIZE)
        )
        if last_id is not None:
            q = q.gt("openalex_author_id", last_id)
        batch = q.execute().data or []
        if not batch:
            break
        for row in batch:
            oa = row.get("openalex_author_id")
            if oa:
                linked_ids.add(oa)
        last_id = batch[-1]["openalex_author_id"]
        if len(batch) < PAGE_SIZE:
            break
    return linked_ids


def fetch_unlinked_inventory(supabase, linked_ids: set) -> List[Dict[str, Any]]:
    unlinked: List[Dict[str, Any]] = []
    last_id: Optional[str] = None
    while True:
        q = (
            supabase.table("openalex_author_inventory")
            .select(
                "openalex_author_id,display_name,last_known_institution,"
                "last_known_institution_ror,corpus_pub_count,first_seen_pub_year,last_seen_pub_year"
            )
            .order("openalex_author_id")
            .limit(PAGE_SIZE)
        )
        if last_id is not None:
            q = q.gt("openalex_author_id", last_id)
        batch = q.execute().data or []
        if not batch:
            break
        for row in batch:
            if row["openalex_author_id"] not in linked_ids:
                unlinked.append(row)
        last_id = batch[-1]["openalex_author_id"]
        if len(batch) < PAGE_SIZE:
            break
    return unlinked


def build_targeted_hcp_index(
    supabase,
    lookup_keys: Set[Tuple[str, str, str]],
) -> Dict[Tuple[str, str, str], List[Dict[str, Any]]]:
    """
    One keyset scan of hcps; bucket rows whose normalized (first, last, institution)
    is in lookup_keys. Avoids per-entry ilike queries that time out on large hcps.
    """
    index: Dict[Tuple[str, str, str], List[Dict[str, Any]]] = defaultdict(list)
    last_id: Optional[str] = None
    loaded = 0
    while True:
        q = (
            supabase.table("hcps")
            .select("id,first_name,last_name,institution,openalex_author_id,source")
            .order("id")
            .limit(PAGE_SIZE)
        )
        if last_id is not None:
            q = q.gt("id", last_id)
        batch = q.execute().data or []
        if not batch:
            break
        for hcp in batch:
            loaded += 1
            key = (
                normalize_first_name(hcp.get("first_name")),
                normalize_last_name(hcp.get("last_name")),
                normalize_org_name(hcp.get("institution")),
            )
            if key in lookup_keys:
                index[key].append(hcp)
        last_id = batch[-1].get("id")
        if not last_id or len(batch) < PAGE_SIZE:
            break
    print(f"  Scanned {loaded:,} HCPs; matched {len(lookup_keys)} lookup key(s) in index")
    return index


def hcp_openalex_display(hcp: Dict[str, Any]) -> str:
    v = hcp.get("openalex_author_id")
    if v is None or str(v).strip() == "":
        return "(none)"
    return str(v).strip()


def year_range(inv: Dict[str, Any]) -> str:
    first = inv.get("first_seen_pub_year")
    last = inv.get("last_seen_pub_year")
    if first is not None and last is not None:
        return f"{first}-{last}"
    if first is not None:
        return str(first)
    if last is not None:
        return str(last)
    return "?"


def main() -> None:
    load_dotenv()
    supabase = init_supabase()

    print("Loading linked openalex_author_id values from hcp_openalex_authors...")
    linked_ids = fetch_linked_openalex_ids(supabase)
    print(f"  Linked count: {len(linked_ids):,}")

    print("Scanning inventory for unlinked entries...")
    unlinked = fetch_unlinked_inventory(supabase, linked_ids)
    print(f"Unlinked inventory entries: {len(unlinked)}")
    # Expected: 34

    parsed: List[Dict[str, Any]] = []
    empty_name_parse: List[Dict[str, Any]] = []

    for inv in unlinked:
        first_raw, last_raw = split_display_name_to_raw_parts(inv.get("display_name"))
        inv_first_norm = normalize_first_name(first_raw)
        inv_last_norm = normalize_last_name(last_raw)
        inv_institution_norm = normalize_org_name(inv.get("last_known_institution"))
        entry = {
            "inventory": inv,
            "first_norm": inv_first_norm,
            "last_norm": inv_last_norm,
            "institution_norm": inv_institution_norm,
        }
        parsed.append(entry)
        if not inv_first_norm or not inv_last_norm:
            empty_name_parse.append(entry)

    if empty_name_parse:
        print(f"\n[warn] {len(empty_name_parse)} unlinked entries with empty parsed first or last name:")
        for e in empty_name_parse:
            inv = e["inventory"]
            print(f"  - {inv.get('display_name')!r} -> first={e['first_norm']!r} last={e['last_norm']!r}")

    lookup_keys: Set[Tuple[str, str, str]] = set()
    for entry in parsed:
        if entry["first_norm"] and entry["last_norm"]:
            lookup_keys.add((entry["first_norm"], entry["last_norm"], entry["institution_norm"]))

    print(f"\nBuilding targeted HCP index for {len(lookup_keys)} distinct name+institution key(s)...")
    hcp_index = build_targeted_hcp_index(supabase, lookup_keys)

    reconcilable: List[Tuple[Dict[str, Any], Dict[str, Any]]] = []
    no_match: List[Dict[str, Any]] = []
    ambiguous: List[Tuple[Dict[str, Any], List[Dict[str, Any]]]] = []

    for entry in parsed:
        if not entry["first_norm"] or not entry["last_norm"]:
            no_match.append(entry)
            continue

        key = (entry["first_norm"], entry["last_norm"], entry["institution_norm"])
        matches = hcp_index.get(key, [])

        if len(matches) == 0:
            no_match.append(entry)
        elif len(matches) == 1:
            reconcilable.append((entry, matches[0]))
        else:
            ambiguous.append((entry, matches))

    count_zero = len(no_match)
    count_one = len(reconcilable)
    count_ambiguous = len(ambiguous)

    no_oa = 0
    diff_oa = 0
    for entry, hcp in reconcilable:
        inv_oa = str(entry["inventory"].get("openalex_author_id") or "").strip()
        hcp_oa = str(hcp.get("openalex_author_id") or "").strip()
        if not hcp_oa:
            no_oa += 1
        elif hcp_oa != inv_oa:
            diff_oa += 1

    print()
    print("=" * 60)
    print("STEP C COLLISION RECONCILIATION - DIAGNOSTIC")
    print("=" * 60)
    print(f"Total unlinked inventory entries: {len(unlinked)}")
    print()
    print("Match distribution:")
    print(f"  0 HCP matches (no name+institution match): {count_zero:,}")
    print(f"  1 HCP match (reconcilable):                {count_one:,}")
    print(f"  2+ HCP matches (ambiguous):                {count_ambiguous:,}")
    print()
    print("Of the 1-match cases:")
    print(f"  Existing HCP has no openalex_author_id:      {no_oa:,}")
    print(f"  Existing HCP has a different openalex_id:    {diff_oa:,}")

    print()
    print("=" * 60)
    print("RECONCILABLE 1-MATCH CASES (review before write)")
    print("=" * 60)
    print()

    for entry, hcp in reconcilable:
        inv = entry["inventory"]
        inv_name = str(inv.get("display_name") or "").strip()
        inv_inst = str(inv.get("last_known_institution") or "").strip()
        inv_oa = str(inv.get("openalex_author_id") or "").strip()
        corpus = inv.get("corpus_pub_count")
        years = year_range(inv)
        hcp_first = str(hcp.get("first_name") or "").strip()
        hcp_last = str(hcp.get("last_name") or "").strip()
        hcp_inst = str(hcp.get("institution") or "").strip()
        hcp_id = str(hcp.get("id") or "")
        hcp_source = str(hcp.get("source") or "").strip() or "(none)"

        print(f"Inventory: {inv_name} | {inv_inst}")
        print(f"  -> {inv_oa} (corpus_pub_count={corpus}, years {years})")
        print(f"  EXISTING HCP: {hcp_first} {hcp_last} | {hcp_inst}")
        print(f"  HCP id: {hcp_id}")
        print(f"  HCP openalex_author_id: {hcp_openalex_display(hcp)}")
        print(f"  HCP source: {hcp_source}")
        print()

    print("=" * 60)
    print("NO-MATCH CASES (no existing HCP matches name+institution)")
    print("=" * 60)
    print()

    if not no_match:
        print("(none)")
        print()
    else:
        for entry in no_match:
            inv = entry["inventory"]
            inv_name = str(inv.get("display_name") or "").strip()
            inv_inst = str(inv.get("last_known_institution") or "").strip()
            inv_oa = str(inv.get("openalex_author_id") or "").strip()
            corpus = inv.get("corpus_pub_count")
            print(f"Inventory: {inv_name} | {inv_inst}")
            print(f"  -> {inv_oa} (corpus_pub_count={corpus})")
            print(
                f'  Parsed: first="{entry["first_norm"]}" last="{entry["last_norm"]}" '
                f'institution="{entry["institution_norm"]}"'
            )
            print()

    if ambiguous:
        print("=" * 60)
        print("AMBIGUOUS CASES (multiple HCPs match — manual review)")
        print("=" * 60)
        print()

        for entry, matches in ambiguous:
            inv = entry["inventory"]
            inv_name = str(inv.get("display_name") or "").strip()
            inv_inst = str(inv.get("last_known_institution") or "").strip()
            inv_oa = str(inv.get("openalex_author_id") or "").strip()
            print(f"Inventory: {inv_name} | {inv_inst}")
            print(f"  -> {inv_oa}")
            print(f"  HCP MATCHES ({len(matches)}):")
            for hcp in matches:
                hcp_first = str(hcp.get("first_name") or "").strip()
                hcp_last = str(hcp.get("last_name") or "").strip()
                hcp_inst = str(hcp.get("institution") or "").strip()
                hcp_id = str(hcp.get("id") or "")
                print(f"    - {hcp_first} {hcp_last} | {hcp_inst} | id={hcp_id}")
            print()


if __name__ == "__main__":
    main()
