"""
ingest_community_dermatologists.py — One-time NPPES-first load of US dermatologists
into community_practitioners.

Filters NPPES individual providers (entity_type_code=1) in the US with any
dermatology taxonomy (207N*) across taxonomy_1..5, links overlaps to hcps_v2
via NPI, and upserts the full US derm directory.

Usage:
    python scripts/ingest/ingest_community_dermatologists.py --dry-run
    python scripts/ingest/ingest_community_dermatologists.py --execute
    python scripts/ingest/ingest_community_dermatologists.py --dry-run --limit 100

Required environment variables (.env): SUPABASE_URL, SUPABASE_KEY
"""

from __future__ import annotations

import argparse
import os
import re
from collections import Counter
from datetime import datetime
from typing import Any, Dict, List, Optional, Sequence, Tuple

import pandas as pd
from dotenv import load_dotenv
from supabase import Client, create_client

PARQUET_PATH = r"C:\Users\garre\Desktop\FieldMark\NPPES\nppes_individual_providers.parquet"
CURRENT_YEAR = 2026
SOURCE = "nppes_community"
UPSERT_BATCH_SIZE = 500
NPI_PAGE_SIZE = 1000
DERM_PREFIX = "207N"

TAXONOMY_LABELS: Dict[str, str] = {
    "207N00000X": "Dermatology",
    "207ND0101X": "Dermatology, Procedural",
    "207ND0900X": "Dermatopathology",
    "207NP0225X": "Pediatric Dermatology",
    "207NS0135X": "Dermatology, MOHS-Micrographic Surgery",
    "207NI0002X": "Clinical & Laboratory Dermatological Immunology",
}

PARQUET_COLUMNS = [
    "npi",
    "entity_type_code",
    "last_name",
    "first_name",
    "middle_name",
    "name_suffix",
    "credentials",
    "practice_address",
    "practice_city",
    "practice_state",
    "practice_zip",
    "practice_country_code",
    "enumeration_date",
    "sex_code",
    "is_sole_proprietor",
    "taxonomy_1",
    "taxonomy_2",
    "taxonomy_3",
    "taxonomy_4",
    "taxonomy_5",
    "primary_taxonomy_switch_1",
    "primary_taxonomy_switch_2",
    "primary_taxonomy_switch_3",
    "primary_taxonomy_switch_4",
    "primary_taxonomy_switch_5",
]


def get_required_env(name: str) -> str:
    value = os.getenv(name)
    if not value:
        raise EnvironmentError(f"Missing required environment variable: {name}")
    return value


def init_supabase() -> Client:
    return create_client(get_required_env("SUPABASE_URL"), get_required_env("SUPABASE_KEY"))


def ns(value: Any) -> str:
    return " ".join(str(value or "").strip().split())


def normalize_npi(value: Any) -> Optional[str]:
    digits = "".join(ch for ch in str(value or "") if ch.isdigit())
    if len(digits) == 10:
        return digits
    return None


def is_derm_taxonomy(code: Any) -> bool:
    return str(code or "").strip().upper().startswith(DERM_PREFIX)


def taxonomy_label(code: Optional[str]) -> str:
    if not code:
        return "Dermatology"
    return TAXONOMY_LABELS.get(code.strip().upper(), "Dermatology")


def parse_enumeration_year(value: Any) -> Optional[int]:
    raw = ns(value)
    if not raw:
        return None
    if re.fullmatch(r"\d{4}", raw):
        return int(raw)
    for fmt in ("%Y-%m-%d", "%m/%d/%Y", "%m-%d-%Y", "%Y/%m/%d"):
        try:
            return datetime.strptime(raw, fmt).year
        except ValueError:
            continue
    match = re.search(r"(19|20)\d{2}", raw)
    if match:
        return int(match.group(0))
    return None


def parse_sole_proprietor(value: Any) -> Optional[bool]:
    token = ns(value).upper()
    if token == "YES":
        return True
    if token == "NO":
        return False
    return None


def primary_derm_taxonomy(row: pd.Series) -> Optional[str]:
    """Prefer primary-flagged 207N* code; else first 207N* across taxonomy_1..5."""
    primary_codes: List[str] = []
    all_derm_codes: List[str] = []
    for i in range(1, 6):
        code = ns(row.get(f"taxonomy_{i}"))
        if not is_derm_taxonomy(code):
            continue
        code_up = code.upper()
        all_derm_codes.append(code_up)
        switch = ns(row.get(f"primary_taxonomy_switch_{i}")).upper()
        if switch == "Y":
            primary_codes.append(code_up)
    if primary_codes:
        return primary_codes[0]
    return all_derm_codes[0] if all_derm_codes else None


def dermatology_filter_mask(df: pd.DataFrame) -> pd.Series:
    entity_ok = df["entity_type_code"].astype(str).str.strip().eq("1")
    country_ok = df["practice_country_code"].astype(str).str.strip().str.upper().eq("US")
    has_derm = pd.Series(False, index=df.index)
    for i in range(1, 6):
        has_derm |= df[f"taxonomy_{i}"].astype(str).str.upper().str.startswith(DERM_PREFIX)
    return entity_ok & country_ok & has_derm


def load_dermatologists(limit: Optional[int] = None) -> pd.DataFrame:
    df = pd.read_parquet(PARQUET_PATH, columns=PARQUET_COLUMNS, dtype_backend="numpy_nullable")
    missing = [c for c in PARQUET_COLUMNS if c not in df.columns]
    if missing:
        raise RuntimeError(f"NPPES parquet missing required columns: {missing}")

    mask = dermatology_filter_mask(df)
    filtered = df.loc[mask].copy()
    if limit is not None:
        filtered = filtered.head(limit)
    return filtered


def fetch_existing_npi_map(client: Client) -> Dict[str, str]:
    """Returns {npi_number: hcp_id} from hcps_v2."""
    out: Dict[str, str] = {}
    offset = 0
    while True:
        batch = (
            client.table("hcps_v2")
            .select("id,npi_number")
            .not_.is_("npi_number", "null")
            .order("id")
            .range(offset, offset + NPI_PAGE_SIZE - 1)
            .execute()
            .data
            or []
        )
        if not batch:
            break
        for row in batch:
            npi = normalize_npi(row.get("npi_number"))
            hid = row.get("id")
            if npi and hid:
                out[npi] = str(hid)
        if len(batch) < NPI_PAGE_SIZE:
            break
        offset += NPI_PAGE_SIZE
    return out


def build_rows(df: pd.DataFrame, npi_to_hcp: Dict[str, str]) -> List[Dict[str, Any]]:
    rows: List[Dict[str, Any]] = []
    for _, raw in df.iterrows():
        npi = normalize_npi(raw.get("npi"))
        if not npi:
            continue
        taxonomy_code = primary_derm_taxonomy(raw)
        enum_year = parse_enumeration_year(raw.get("enumeration_date"))
        career_stage_years = CURRENT_YEAR - enum_year if enum_year is not None else None
        rows.append(
            {
                "npi_number": npi,
                "first_name": ns(raw.get("first_name")) or None,
                "last_name": ns(raw.get("last_name")) or None,
                "middle_name": ns(raw.get("middle_name")) or None,
                "name_suffix": ns(raw.get("name_suffix")) or None,
                "credentials": ns(raw.get("credentials")) or None,
                "primary_taxonomy_code": taxonomy_code,
                "primary_taxonomy_label": taxonomy_label(taxonomy_code),
                "practice_city": ns(raw.get("practice_city")) or None,
                "practice_state": ns(raw.get("practice_state")) or None,
                "practice_zip": ns(raw.get("practice_zip")) or None,
                "practice_address": ns(raw.get("practice_address")) or None,
                "sex_code": ns(raw.get("sex_code")) or None,
                "enumeration_date": ns(raw.get("enumeration_date")) or None,
                "career_stage_years": career_stage_years,
                "is_sole_proprietor": parse_sole_proprietor(raw.get("is_sole_proprietor")),
                "source": SOURCE,
                "matched_hcp_id": npi_to_hcp.get(npi),
            }
        )
    return rows


def upsert_practitioners(client: Client, rows: Sequence[Dict[str, Any]]) -> int:
    if not rows:
        return 0
    written = 0
    for i in range(0, len(rows), UPSERT_BATCH_SIZE):
        batch = list(rows[i : i + UPSERT_BATCH_SIZE])
        resp = (
            client.table("community_practitioners")
            .upsert(batch, on_conflict="npi_number")
            .execute()
        )
        if not resp.data:
            raise RuntimeError(
                f"community_practitioners upsert returned empty data ({len(batch)} rows)"
            )
        written += len(resp.data)
    return written


def print_report(rows: Sequence[Dict[str, Any]]) -> None:
    total = len(rows)
    matched = sum(1 for r in rows if r.get("matched_hcp_id"))
    net_new = total - matched

    label_counts = Counter(r.get("primary_taxonomy_label") or "Dermatology" for r in rows)
    state_counts = Counter(r.get("practice_state") or "?" for r in rows)

    print(f"\nTotal dermatologists matched by filter: {total:,}")
    print(f"  Matched to existing hcps_v2 (matched_hcp_id set): {matched:,}")
    print(f"  Net-new community practitioners: {net_new:,}")

    print("\nBreakdown by primary_taxonomy_label:")
    for label, count in label_counts.most_common():
        print(f"  {label}: {count:,}")

    print("\nTop 10 practice_state:")
    for state, count in state_counts.most_common(10):
        print(f"  {state}: {count:,}")


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Ingest US dermatologists from NPPES into community_practitioners"
    )
    parser.add_argument("--dry-run", action="store_true", help="Compute and report; no DB writes")
    parser.add_argument("--execute", action="store_true", help="Write results to DB")
    parser.add_argument("--limit", type=int, default=None, help="Process only first N filtered rows")
    args = parser.parse_args()

    write = args.execute and not args.dry_run
    if not args.dry_run and not args.execute:
        print("Safe default: no write. Pass --dry-run or --execute.")

    load_dotenv()
    client = init_supabase()

    print(f"Loading NPPES parquet: {PARQUET_PATH}")
    derm_df = load_dermatologists(limit=args.limit)
    print(f"Filtered dermatologists: {len(derm_df):,}")

    print("Fetching existing hcps_v2 NPI map...")
    npi_to_hcp = fetch_existing_npi_map(client)
    print(f"Loaded {len(npi_to_hcp):,} NPIs from hcps_v2")

    rows = build_rows(derm_df, npi_to_hcp)
    print_report(rows)

    if write:
        print(f"\nUpserting {len(rows):,} rows into community_practitioners ...")
        written = upsert_practitioners(client, rows)
        print(f"Upserted {written:,} rows into community_practitioners")
    else:
        print(f"\n[dry-run] would have upserted {len(rows):,} rows into community_practitioners")


if __name__ == "__main__":
    main()
