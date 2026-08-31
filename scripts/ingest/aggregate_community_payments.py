"""
aggregate_community_payments.py — Aggregate Open Payments for community_practitioners
with AD-drug-specific signals from ta_drug_keywords.

Reads 2022-2024 general payment parquets, filters to community dermatologist NPIs,
aggregates per NPI, and upserts rows with payments into community_practitioner_payments.

Usage:
    python scripts/ingest/aggregate_community_payments.py --dry-run
    python scripts/ingest/aggregate_community_payments.py --execute

Required environment variables (.env): SUPABASE_URL, SUPABASE_KEY
"""

from __future__ import annotations

import argparse
import os
import re
import statistics
from collections import Counter
from typing import Any, Dict, List, Optional, Sequence, Set, Tuple

import duckdb
import pandas as pd
from dotenv import load_dotenv
from supabase import Client, create_client

PARQUET_FILES = [
    r"C:\Users\garre\Desktop\FieldMark\OpenPayments\op_general_pgyr2022.parquet",
    r"C:\Users\garre\Desktop\FieldMark\OpenPayments\op_general_pgyr2023.parquet",
    r"C:\Users\garre\Desktop\FieldMark\OpenPayments\op_general_pgyr2024.parquet",
]
AD_TA_ID = "9e4139d2-e062-4a58-8728-cdabb2d7dca1"
NPI_PAGE_SIZE = 1000
UPSERT_BATCH_SIZE = 500

PAYMENT_COLUMNS = [
    "npi",
    "program_year",
    "manufacturer_name",
    "payment_amount_usd",
    "nature_of_payment",
    "drug_name",
]

SPEAKER_PHRASES = (
    "compensation for services other than consulting",
)


def get_required_env(name: str) -> str:
    value = os.getenv(name)
    if not value:
        raise EnvironmentError(f"Missing required environment variable: {name}")
    return value


def init_supabase() -> Client:
    return create_client(get_required_env("SUPABASE_URL"), get_required_env("SUPABASE_KEY"))


def normalize_text(value: Any) -> str:
    raw = str(value or "").lower()
    raw = re.sub(r"[^\w\s]", " ", raw)
    return " ".join(raw.split())


def normalize_npi(value: Any) -> Optional[str]:
    digits = "".join(ch for ch in str(value or "") if ch.isdigit())
    if len(digits) == 10:
        return digits
    return None


def fetch_community_npis(client: Client) -> Set[str]:
    out: Set[str] = set()
    offset = 0
    while True:
        batch = (
            client.table("community_practitioners")
            .select("npi_number")
            .order("npi_number")
            .range(offset, offset + NPI_PAGE_SIZE - 1)
            .execute()
            .data
            or []
        )
        if not batch:
            break
        for row in batch:
            npi = normalize_npi(row.get("npi_number"))
            if npi:
                out.add(npi)
        if len(batch) < NPI_PAGE_SIZE:
            break
        offset += NPI_PAGE_SIZE
    return out


def fetch_ad_drug_aliases(client: Client, ta_id: str) -> List[Tuple[str, str, bool]]:
    """
    Returns list of (normalized_alias, display_drug_name, brand_only).
    brand_only=True means match this alias only (tacrolimus/Protopic exception).
    """
    # PRIMARY-ONLY, AND THE GATE IS CORRECT HERE (semantic recorded 2026-08-28).
    #
    # ta_drug_keywords.is_primary_signal means:
    #   primary   - a payment for this drug may INDEPENDENTLY establish TA engagement
    #   secondary - contributes only AFTER TA relevance is established elsewhere
    #
    # This script starts from community_practitioners, an NPPES-derived directory of
    # community dermatologists. It has NO independent evidence of AD engagement for these
    # NPIs -- no publication record, no hcp_therapeutic_areas_v2 membership, no board
    # position. The drug payment IS the evidence. So only a PRIMARY drug can carry that
    # weight on its own, and admitting secondary drugs here would let a cross-indication
    # payment manufacture a TA relevance that nothing else supports.
    #
    # THE SIBLING AGGREGATOR DELIBERATELY DOES NOT GATE, and that is not an inconsistency:
    # open_payments_aggregator INNER JOINs hcp_therapeutic_areas_v2 before the drug match,
    # so every HCP reaching its drug join has already satisfied "established elsewhere" --
    # exactly the precondition under which the semantic admits secondary drugs. Two correct
    # applications of one rule to two different evidentiary situations. See the matching
    # comment at that script's INNER JOIN before changing either.
    rows = (
        client.table("ta_drug_keywords")
        .select("drug_brand_name,drug_generic_name")
        .eq("therapeutic_area_id", ta_id)
        .eq("is_primary_signal", True)
        .execute()
        .data
        or []
    )
    aliases: List[Tuple[str, str, bool]] = []
    for row in rows:
        brand = str(row.get("drug_brand_name") or "").strip()
        generic = str(row.get("drug_generic_name") or "").strip()
        display = brand or generic or "Unknown"
        brand_norm = normalize_text(brand)
        generic_norm = normalize_text(generic)

        # Tacrolimus: brand-only matching to avoid systemic Prograf false positives.
        if generic_norm == "tacrolimus" or brand_norm == "protopic":
            if brand_norm:
                aliases.append((brand_norm, display, True))
            continue

        if brand_norm:
            aliases.append((brand_norm, display, False))
        if generic_norm:
            aliases.append((generic_norm, display, False))

    # Longest aliases first so specific names win over short substrings.
    aliases.sort(key=lambda item: len(item[0]), reverse=True)
    return aliases


def classify_nature(nature: Any) -> str:
    text = str(nature or "").lower()
    if (
        "speaker" in text
        or "faculty" in text
        or any(phrase in text for phrase in SPEAKER_PHRASES)
    ):
        return "speaker"
    if "consulting" in text:
        return "consulting"
    if "food" in text:
        return "food_beverage"
    if "travel" in text:
        return "travel"
    if "education" in text:
        return "education"
    return "other"


def matches_ad_drug(
    normalized_drug_name: str,
    aliases: Sequence[Tuple[str, str, bool]],
) -> Optional[str]:
    if not normalized_drug_name:
        return None
    for alias, display, brand_only in aliases:
        if alias and alias in normalized_drug_name:
            return display
    return None


def load_filtered_payments(community_npis: Set[str]) -> pd.DataFrame:
    if not community_npis:
        return pd.DataFrame(columns=PAYMENT_COLUMNS)

    con = duckdb.connect()
    con.execute(
        "CREATE TEMP TABLE community_npis (npi VARCHAR)"
    )
    con.executemany(
        "INSERT INTO community_npis VALUES (?)",
        [(npi,) for npi in sorted(community_npis)],
    )

    parquet_list = ", ".join(f"'{path.replace(chr(92), '/')}'" for path in PARQUET_FILES)
    query = f"""
        SELECT
          CAST(npi AS VARCHAR) AS npi,
          CAST(program_year AS INTEGER) AS program_year,
          manufacturer_name,
          CAST(payment_amount_usd AS DOUBLE) AS payment_amount_usd,
          nature_of_payment,
          drug_name
        FROM read_parquet([{parquet_list}])
        WHERE CAST(npi AS VARCHAR) IN (SELECT npi FROM community_npis)
    """
    df = con.execute(query).fetchdf()
    con.close()
    return df


def top_n_amounts(counter: Counter, n: int = 5) -> List[Dict[str, Any]]:
    return [
        {"name": name, "amount": round(float(amount), 2)}
        for name, amount in counter.most_common(n)
    ]


def aggregate_payments(
    payments: pd.DataFrame,
    ad_aliases: Sequence[Tuple[str, str, bool]],
) -> List[Dict[str, Any]]:
    if payments.empty:
        return []

    payments = payments.copy()
    payments["npi"] = payments["npi"].map(normalize_npi)
    payments = payments[payments["npi"].notna()]
    payments["payment_amount_usd"] = pd.to_numeric(
        payments["payment_amount_usd"], errors="coerce"
    ).fillna(0.0)
    payments["program_year"] = pd.to_numeric(
        payments["program_year"], errors="coerce"
    ).astype("Int64")
    payments["nature_bucket"] = payments["nature_of_payment"].map(classify_nature)
    payments["drug_name_norm"] = payments["drug_name"].map(normalize_text)
    payments["manufacturer_name"] = payments["manufacturer_name"].fillna("").astype(str)
    payments["drug_name"] = payments["drug_name"].fillna("").astype(str)

    results: List[Dict[str, Any]] = []

    for npi, group in payments.groupby("npi", sort=True):
        total = float(group["payment_amount_usd"].sum())
        if total <= 0:
            continue

        nature_sums = {
            "consulting": 0.0,
            "speaker": 0.0,
            "food_beverage": 0.0,
            "travel": 0.0,
            "education": 0.0,
            "other": 0.0,
        }
        for bucket, amount in (
            group.groupby("nature_bucket")["payment_amount_usd"].sum().items()
        ):
            nature_sums[bucket] = float(amount)

        manufacturer_totals: Counter = Counter()
        drug_totals: Counter = Counter()
        ad_drug_totals: Counter = Counter()
        ad_drug_amount = 0.0
        ad_drug_count = 0

        for row in group.itertuples(index=False):
            amount = float(row.payment_amount_usd or 0.0)
            if row.manufacturer_name:
                manufacturer_totals[row.manufacturer_name] += amount
            if row.drug_name:
                drug_totals[row.drug_name] += amount
            matched_drug = matches_ad_drug(row.drug_name_norm, ad_aliases)
            if matched_drug:
                ad_drug_amount += amount
                ad_drug_count += 1
                ad_drug_totals[matched_drug] += amount

        year_sums = {
            int(year): float(amount)
            for year, amount in group.groupby("program_year")["payment_amount_usd"].sum().items()
            if pd.notna(year)
        }

        results.append(
            {
                "npi_number": npi,
                "total_payments_3yr": round(total, 2),
                "payment_count_3yr": int(len(group)),
                "distinct_manufacturers": int(group["manufacturer_name"].replace("", pd.NA).dropna().nunique()),
                "distinct_drugs": int(group["drug_name"].replace("", pd.NA).dropna().nunique()),
                "consulting_3yr": round(nature_sums["consulting"], 2),
                "speaker_3yr": round(nature_sums["speaker"], 2),
                "food_beverage_3yr": round(nature_sums["food_beverage"], 2),
                "travel_3yr": round(nature_sums["travel"], 2),
                "education_3yr": round(nature_sums["education"], 2),
                "other_payments_3yr": round(nature_sums["other"], 2),
                "ad_drug_payments_3yr": round(ad_drug_amount, 2),
                "ad_drug_payment_count_3yr": int(ad_drug_count),
                "top_manufacturers": top_n_amounts(manufacturer_totals),
                "top_drugs": top_n_amounts(drug_totals),
                "payments_2022": round(year_sums.get(2022, 0.0), 2),
                "payments_2023": round(year_sums.get(2023, 0.0), 2),
                "payments_2024": round(year_sums.get(2024, 0.0), 2),
                "_ad_drug_totals": ad_drug_totals,
            }
        )

    return results


def upsert_payments(client: Client, rows: Sequence[Dict[str, Any]]) -> int:
    if not rows:
        return 0
    written = 0
    for i in range(0, len(rows), UPSERT_BATCH_SIZE):
        batch = [
            {k: v for k, v in row.items() if not k.startswith("_")}
            for row in rows[i : i + UPSERT_BATCH_SIZE]
        ]
        resp = (
            client.table("community_practitioner_payments")
            .upsert(batch, on_conflict="npi_number")
            .execute()
        )
        if not resp.data:
            raise RuntimeError(
                f"community_practitioner_payments upsert returned empty data ({len(batch)} rows)"
            )
        written += len(resp.data)
    return written


def print_dry_run_report(
    community_count: int,
    aggregated: Sequence[Dict[str, Any]],
) -> None:
    with_payments = list(aggregated)
    with_ad = [r for r in with_payments if float(r.get("ad_drug_payments_3yr") or 0) > 0]
    totals = [float(r["total_payments_3yr"]) for r in with_payments]

    print(f"\nCommunity practitioners loaded: {community_count:,}")
    print(
        f"Community derms with ANY Open Payments: {len(with_payments):,} "
        f"({(100.0 * len(with_payments) / community_count) if community_count else 0:.1f}%)"
    )
    print(f"Community derms with AD-drug payments: {len(with_ad):,}")

    if totals:
        print("\nTotal $ distribution (among derms with payments):")
        print(f"  min: ${min(totals):,.2f}")
        print(f"  median: ${statistics.median(totals):,.2f}")
        print(f"  max: ${max(totals):,.2f}")
        print(f"  sum: ${sum(totals):,.2f}")

    top15 = sorted(with_payments, key=lambda r: r["total_payments_3yr"], reverse=True)[:15]
    print("\nTop 15 community derms by total_payments_3yr:")
    print(f"{'NPI':<12} {'Total':>12} {'AD Drug':>12} {'Top Manufacturer':<40}")
    for row in top15:
        top_mfr = ""
        if row.get("top_manufacturers"):
            top_mfr = str(row["top_manufacturers"][0].get("name") or "")
        print(
            f"{row['npi_number']:<12} "
            f"{row['total_payments_3yr']:>12,.2f} "
            f"{row['ad_drug_payments_3yr']:>12,.2f} "
            f"{top_mfr[:39]:<40}"
        )

    ad_totals: Counter = Counter()
    for row in with_payments:
        ad_totals.update(row.get("_ad_drug_totals") or Counter())

    print("\nTop AD drugs by total $ across community derms:")
    for drug, amount in ad_totals.most_common(15):
        print(f"  {drug}: ${amount:,.2f}")


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Aggregate Open Payments for community_practitioners"
    )
    parser.add_argument("--dry-run", action="store_true", help="Compute and report; no DB writes")
    parser.add_argument("--execute", action="store_true", help="Write results to DB")
    args = parser.parse_args()

    write = args.execute and not args.dry_run
    if not args.dry_run and not args.execute:
        print("Safe default: no write. Pass --dry-run or --execute.")

    load_dotenv()
    client = init_supabase()

    print("Loading community practitioner NPIs...")
    community_npis = fetch_community_npis(client)
    print(f"Loaded {len(community_npis):,} community NPIs")

    print("Loading AD primary drug aliases...")
    ad_aliases = fetch_ad_drug_aliases(client, AD_TA_ID)
    print(f"Loaded {len(ad_aliases)} AD drug aliases from ta_drug_keywords")

    print("Reading and filtering Open Payments parquets (2022-2024)...")
    payments = load_filtered_payments(community_npis)
    print(f"Filtered payment rows: {len(payments):,}")

    print("Aggregating per NPI...")
    aggregated = aggregate_payments(payments, ad_aliases)
    print(f"NPIs with payments to write: {len(aggregated):,}")

    print_dry_run_report(len(community_npis), aggregated)

    if write:
        print(f"\nUpserting {len(aggregated):,} rows into community_practitioner_payments ...")
        written = upsert_payments(client, aggregated)
        print(f"Upserted {written:,} rows into community_practitioner_payments")
    else:
        print(
            f"\n[dry-run] would have upserted {len(aggregated):,} rows "
            "into community_practitioner_payments"
        )


if __name__ == "__main__":
    main()
