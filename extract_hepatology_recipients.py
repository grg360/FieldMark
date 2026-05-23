"""
Extract hepatology-drug recipient NPIs from Open Payments parquet files.

Standalone utility for Path 4a: filters Open Payments to NPIs who received
substantive payments for hepatology-relevant drugs. Output CSV is then fed
to nppes_workstream_b_ingest.py via --npi-filter to constrain the community
HCP cohort.

Threshold criteria:
- Total payments >= $500 across 3 years
- Excludes "Food and Beverage" and "Travel and Lodging" categories
- Drug must match (case-insensitive) any drug_name or drug_brand_name
  in the Hepatology TA from ta_drug_keywords

Output: CSV with columns npi, total_payments_3yr, payment_count,
distinct_drugs, most_recent_payment_date.

Requires SUPABASE_URL, SUPABASE_KEY in .env (to read Hepatology drug list).

Usage:
  python extract_hepatology_recipients.py
  python extract_hepatology_recipients.py --threshold 1000 --output hepa_npis.csv
"""

from __future__ import annotations

import argparse
import csv
import os
from typing import List, Set

import duckdb
from dotenv import load_dotenv
from supabase import create_client


PARQUET_FILES = [
    r"C:\Users\garre\Desktop\FieldMark\OpenPayments\op_general_pgyr2022.parquet",
    r"C:\Users\garre\Desktop\FieldMark\OpenPayments\op_general_pgyr2023.parquet",
    r"C:\Users\garre\Desktop\FieldMark\OpenPayments\op_general_pgyr2024.parquet",
]

HEPATOLOGY_TA_ID = "9b31947b-5ce2-41fd-bed8-0c09b9e5ad3e"

EXCLUDED_CATEGORIES = [
    "Food and Beverage",
    "Travel and Lodging",
]

DEFAULT_OUTPUT_PATH = r"C:\Users\garre\Desktop\FieldMark\hepatology_recipient_npis.csv"
DEFAULT_THRESHOLD = 500.0


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Extract hepatology-drug recipient NPIs from Open Payments."
    )
    parser.add_argument(
        "--threshold",
        type=float,
        default=DEFAULT_THRESHOLD,
        help="Minimum total payments across 3 years (default $500)",
    )
    parser.add_argument(
        "--output",
        default=DEFAULT_OUTPUT_PATH,
        help="Output CSV path",
    )
    return parser.parse_args()


def get_required_env(name: str) -> str:
    value = os.getenv(name)
    if not value:
        raise EnvironmentError(f"Missing required environment variable: {name}")
    return value


def fetch_hepatology_drug_terms() -> List[str]:
    """Fetch hepatology drug names + brand names + generic names from ta_drug_keywords."""
    client = create_client(get_required_env("SUPABASE_URL"), get_required_env("SUPABASE_KEY"))
    response = (
        client.table("ta_drug_keywords")
        .select("drug_name,drug_brand_name,drug_generic_name")
        .eq("therapeutic_area_id", HEPATOLOGY_TA_ID)
        .execute()
    )
    terms: Set[str] = set()
    for row in response.data or []:
        for col in ("drug_name", "drug_brand_name", "drug_generic_name"):
            v = row.get(col)
            if v and str(v).strip():
                terms.add(str(v).strip().lower())
    return sorted(terms)


def sql_literal(value: str) -> str:
    return "'" + value.replace("'", "''") + "'"


def main() -> int:
    args = parse_args()
    load_dotenv()

    print(f"Fetching hepatology drug list from ta_drug_keywords...")
    drug_terms = fetch_hepatology_drug_terms()
    print(f"  Loaded {len(drug_terms)} hepatology drug terms (name + brand + generic)")
    for term in drug_terms:
        print(f"    {term}")

    print(f"\nThreshold: total payments >= ${args.threshold:,.2f}")
    print(f"Excluded categories: {', '.join(EXCLUDED_CATEGORIES)}")
    print(f"Output: {args.output}")

    con = duckdb.connect()
    con.execute("SET memory_limit = '4GB'")

    parquet_list_sql = ", ".join(sql_literal(p) for p in PARQUET_FILES)
    con.execute(
        f"""
        CREATE VIEW op_payments AS
        SELECT * FROM read_parquet([{parquet_list_sql}])
        """
    )

    # Build the LIKE pattern set for hepatology drugs
    drug_match_clauses = " OR ".join(
        f"lower(drug_name) LIKE '%{term.replace(chr(39), chr(39)+chr(39))}%'"
        for term in drug_terms
    )
    excluded_cats_sql = ", ".join(sql_literal(c) for c in EXCLUDED_CATEGORIES)

    print("\nRunning DuckDB query (this scans ~3 years of Open Payments)...")
    query = f"""
    SELECT
      npi,
      SUM(payment_amount_usd) AS total_payments_3yr,
      COUNT(*) AS payment_count,
      COUNT(DISTINCT drug_name) AS distinct_drugs,
      COUNT(DISTINCT manufacturer_name) AS distinct_companies,
      MAX(CASE WHEN payment_date IS NOT NULL AND payment_date <> ''
               THEN strptime(payment_date, '%m/%d/%Y') ELSE NULL END
      ) AS most_recent_payment_date
    FROM op_payments
    WHERE npi IS NOT NULL
      AND CAST(npi AS VARCHAR) <> ''
      AND drug_name IS NOT NULL
      AND drug_name <> ''
      AND ({drug_match_clauses})
      AND nature_of_payment NOT IN ({excluded_cats_sql})
      AND drug_indicator IN ('Drug', 'Biological')
    GROUP BY npi
    HAVING SUM(payment_amount_usd) >= {args.threshold}
    ORDER BY SUM(payment_amount_usd) DESC
    """

    result = con.execute(query)
    cols = [d[0] for d in result.description]
    rows = result.fetchall()

    print(f"\nFound {len(rows):,} NPIs with hepatology payments >= ${args.threshold:,.2f}")

    # Write CSV
    with open(args.output, "w", newline="", encoding="utf-8") as f:
        writer = csv.writer(f)
        writer.writerow(cols)
        for row in rows:
            writer.writerow([
                str(row[0]) if row[0] is not None else "",
                f"{row[1]:.2f}" if row[1] is not None else "",
                row[2] if row[2] is not None else "",
                row[3] if row[3] is not None else "",
                row[4] if row[4] is not None else "",
                row[5].date().isoformat() if row[5] is not None else "",
            ])

    print(f"\nWrote CSV: {args.output}")

    # Summary stats
    if rows:
        amounts = [float(r[1]) for r in rows if r[1] is not None]
        print(f"\nPayment distribution:")
        print(f"  Min:    ${min(amounts):>12,.2f}")
        print(f"  Median: ${sorted(amounts)[len(amounts) // 2]:>12,.2f}")
        print(f"  Mean:   ${sum(amounts) / len(amounts):>12,.2f}")
        print(f"  Max:    ${max(amounts):>12,.2f}")
        print(f"  Total:  ${sum(amounts):>12,.2f}")

        # Bucket distribution
        buckets = {
            "$500-$1K": 0,
            "$1K-$5K": 0,
            "$5K-$25K": 0,
            "$25K-$100K": 0,
            "$100K+": 0,
        }
        for amt in amounts:
            if amt < 1000:
                buckets["$500-$1K"] += 1
            elif amt < 5000:
                buckets["$1K-$5K"] += 1
            elif amt < 25000:
                buckets["$5K-$25K"] += 1
            elif amt < 100000:
                buckets["$25K-$100K"] += 1
            else:
                buckets["$100K+"] += 1

        print(f"\nDistribution:")
        for label, count in buckets.items():
            print(f"  {label:>12s}: {count:>6,}")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
