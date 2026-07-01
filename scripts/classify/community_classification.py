"""
FieldMark — Classify Community cohort HCPs in hcps_v2.

Identifies HCPs meeting Community eligibility and sets cohort_classification = 'community'.
Run before community_scoring.py.

Requires: SUPABASE_URL, SUPABASE_KEY (python-dotenv loads .env).

Examples:
  python community_classification.py --dry-run
  python community_classification.py --execute
"""

from __future__ import annotations

import argparse
from collections import defaultdict
from typing import Any, Dict, List, Optional, Set, Tuple

from dotenv import load_dotenv
from supabase import Client, create_client

READ_PAGE_SIZE = 1000
UPDATE_BATCH_SIZE = 500

AMC_ENTITY_TYPES = {"aamc_medical_school", "nci_cancer_center"}


def env(name: str) -> str:
    import os

    v = os.getenv(name)
    if not v:
        raise EnvironmentError(f"Missing env var: {name}")
    return v


def sb() -> Client:
    return create_client(env("SUPABASE_URL"), env("SUPABASE_KEY"))


def norm(v: Any) -> str:
    return " ".join(str(v or "").strip().split())


def lower(v: Any) -> str:
    return norm(v).lower()


def fetch_pages(
    client: Client,
    table: str,
    columns: str,
    *,
    order_column: str = "id",
    page_size: int = READ_PAGE_SIZE,
    filters: Optional[List[Tuple[str, str, Any]]] = None,
) -> List[Dict[str, Any]]:
    rows: List[Dict[str, Any]] = []
    last_cursor: Optional[str] = None
    while True:
        q = client.table(table).select(columns).order(order_column).limit(page_size)
        if filters:
            for op, col, val in filters:
                if op == "eq":
                    q = q.eq(col, val)
                elif op == "is":
                    q = q.is_(col, val)
        if last_cursor is not None:
            q = q.gt(order_column, last_cursor)
        batch = q.execute().data or []
        if not batch:
            break
        rows.extend(batch)
        last_cursor = str(batch[-1][order_column])
        if len(batch) < page_size:
            break
    return rows


def load_amc_exclusions(client: Client) -> Set[str]:
    ref_rows = (
        client.table("reference_institutions").select("id,institution_type").execute().data or []
    )
    amc_inst_ids = {
        str(r["id"])
        for r in ref_rows
        if r.get("id") and lower(r.get("institution_type")) in AMC_ENTITY_TYPES
    }
    if not amc_inst_ids:
        return set()

    links = fetch_pages(
        client,
        "hcp_institutions_v2",
        "hcp_id,reference_institution_id",
        order_column="hcp_id",
    )
    excluded: Set[str] = set()
    for r in links:
        hid = str(r.get("hcp_id") or "")
        rid = str(r.get("reference_institution_id") or "")
        if hid and rid in amc_inst_ids:
            excluded.add(hid)
    return excluded


def find_eligible_hcp_ids(client: Client) -> Set[str]:
    print("Loading hcps_v2...")
    hcps = fetch_pages(
        client,
        "hcps_v2",
        "id,country,npi_number,cohort_classification",
        order_column="id",
    )

    print("Loading TA links...")
    hcp_tas = fetch_pages(
        client,
        "hcp_therapeutic_areas_v2",
        "hcp_id,therapeutic_area_id",
        order_column="hcp_id",
    )
    tas_by_hcp: Dict[str, Set[str]] = defaultdict(set)
    for r in hcp_tas:
        hid = str(r.get("hcp_id") or "")
        tid = str(r.get("therapeutic_area_id") or "")
        if hid and tid:
            tas_by_hcp[hid].add(tid)

    print("Loading Open Payments and Medicare summaries...")
    op_summary_rows = fetch_pages(
        client,
        "hcp_open_payments_summary_v2",
        "hcp_id",
        order_column="hcp_id",
    )
    med_summary_rows = fetch_pages(
        client,
        "hcp_medicare_summary_v2",
        "hcp_id",
        order_column="hcp_id",
    )
    op_hcp_ids = {str(r.get("hcp_id")) for r in op_summary_rows if r.get("hcp_id")}
    med_hcp_ids = {str(r.get("hcp_id")) for r in med_summary_rows if r.get("hcp_id")}

    print("Loading AMC exclusion set...")
    excluded_amc = load_amc_exclusions(client)

    eligible: Set[str] = set()
    gate_counts = {
        "not_us": 0,
        "no_npi": 0,
        "already_classified": 0,
        "no_ta": 0,
        "no_payments_or_medicare": 0,
        "amc_linked": 0,
    }

    for h in hcps:
        hid = str(h.get("id") or "")
        if not hid:
            continue
        country = lower(h.get("country"))
        if country not in ("us", "usa"):
            gate_counts["not_us"] += 1
            continue
        if not norm(h.get("npi_number")):
            gate_counts["no_npi"] += 1
            continue
        if h.get("cohort_classification") is not None:
            gate_counts["already_classified"] += 1
            continue
        if hid not in tas_by_hcp:
            gate_counts["no_ta"] += 1
            continue
        if hid not in op_hcp_ids and hid not in med_hcp_ids:
            gate_counts["no_payments_or_medicare"] += 1
            continue
        if hid in excluded_amc:
            gate_counts["amc_linked"] += 1
            continue
        eligible.add(hid)

    print("\nGate rejections (informational):")
    for k, v in gate_counts.items():
        print(f"  {k}: {v:,}")
    print(f"\nEligible for Community classification: {len(eligible):,}")
    return eligible


def apply_classification(client: Client, eligible_ids: Set[str]) -> int:
    if not eligible_ids:
        return 0
    ids = sorted(eligible_ids)
    updated = 0
    for i in range(0, len(ids), UPDATE_BATCH_SIZE):
        chunk = ids[i : i + UPDATE_BATCH_SIZE]
        resp = (
            client.table("hcps_v2")
            .update({"cohort_classification": "community"})
            .in_("id", chunk)
            .execute()
        )
        if resp.data is None:
            raise RuntimeError(
                f"hcps_v2 update returned no data ({len(chunk)} ids) - writes may have been silently dropped"
            )
        updated += len(resp.data) if resp.data else len(chunk)
    return updated


def main() -> None:
    parser = argparse.ArgumentParser(description="Classify Community cohort HCPs")
    mode = parser.add_mutually_exclusive_group(required=True)
    mode.add_argument("--dry-run", action="store_true")
    mode.add_argument("--execute", action="store_true")
    args = parser.parse_args()
    dry_run = bool(args.dry_run)

    load_dotenv()
    client = sb()

    eligible_ids = find_eligible_hcp_ids(client)

    if dry_run:
        print(f"\n[DRY RUN] Would classify {len(eligible_ids):,} HCPs as community")
    else:
        print(f"\nClassifying {len(eligible_ids):,} HCPs as community...")
        updated = apply_classification(client, eligible_ids)
        print(f"Total classified: {updated:,}")

    print(f"\nTotal eligible (would classify / classified): {len(eligible_ids):,}")


if __name__ == "__main__":
    main()
