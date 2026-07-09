import argparse
import json
import os
import time
from collections import Counter
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Sequence, Tuple

import sys
import io

# Force UTF-8 stdout/stderr on Windows where default cp1252 chokes on
# Unicode characters that appear in pharma data (e.g. Bristol-Myers Squibb
# uses a Unicode hyphen, accented HCP names, etc.)
if sys.stdout.encoding != "utf-8":
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")
if sys.stderr.encoding != "utf-8":
    sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding="utf-8", errors="replace")

import duckdb
from dotenv import load_dotenv
from supabase import Client, create_client
from tqdm import tqdm


def get_table_name(base_name: str, target_version: str) -> str:
    if target_version == "v2":
        return f"{base_name}_v2"
    return base_name


PARQUET_FILES = [
    r"C:\Users\garre\Desktop\FieldMark\OpenPayments\op_general_pgyr2022.parquet",
    r"C:\Users\garre\Desktop\FieldMark\OpenPayments\op_general_pgyr2023.parquet",
    r"C:\Users\garre\Desktop\FieldMark\OpenPayments\op_general_pgyr2024.parquet",
]
OUTPUT_LOG_PATH = r"C:\Users\garre\Desktop\FieldMark\open_payments_aggregator_log_may6.json"
PAGE_SIZE = 1000
WRITE_BATCH_SIZE = 500
DELETE_GUARD_ID = "00000000-0000-0000-0000-000000000000"

SPEAKER_CATEGORIES = [
    "Compensation for services other than consulting, including serving as faculty or as a speaker at a venue other than a continuing education program",
    "Compensation for serving as faculty or as a speaker for a medical education program",
]

CANONICALS = [
    {
        "label": "Loomba",
        "hcp_id": "9339ead6-2023-4e69-9eda-2914553a2e20",
        "npi": "1578593521",
        "expected_ta": "Hepatology",
    },
    {
        "label": "Sanyal",
        "hcp_id": "32495742-222a-45c6-bb96-cc44d5227e7e",
        "npi": "1629168273",
        "expected_ta": "Hepatology",
    },
    {
        "label": "Chalasani",
        "hcp_id": "6f9dd309-bd67-4260-a9c2-8a22129f988c",
        "npi": "1588628002",
        "expected_ta": "Hepatology",
    },
    {
        "label": "Garassino",
        "hcp_id": "dc645bf0-b7e0-4c3c-9aaf-9e7bc35d6331",
        "npi": "1053999599",
        "expected_ta": "NSCLC",
    },
    {
        "label": "Silverberg",
        "hcp_id": "f5a0351e-2af3-4169-acf2-019aab06673a",
        "npi": "1831325521",
        "expected_ta": "Atopic Dermatitis",
    },
]


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--execute", action="store_true", default=False)
    parser.add_argument(
        "--target-version",
        choices=["v1", "v2"],
        default="v1",
        help="Schema version. v1=legacy tables, v2=rebuild tables.",
    )
    parser.add_argument(
        "--ta",
        type=str,
        default=None,
        metavar="SLUG",
        help="Scope computation/writes to one therapeutic area (e.g. atopic-dermatitis).",
    )
    return parser.parse_args()


def get_required_env(name: str) -> str:
    value = os.getenv(name)
    if not value:
        raise EnvironmentError(f"Missing required environment variable: {name}")
    return value


def init_supabase() -> Client:
    return create_client(get_required_env("SUPABASE_URL"), get_required_env("SUPABASE_KEY"))


def fetch_all_pages(
    client: Client,
    table: str,
    columns: str,
    not_null_column: Optional[str] = None,
    target_version: str = "v1",
    order_column: str = "id",
) -> List[Dict[str, Any]]:
    rows: List[Dict[str, Any]] = []
    offset = 0
    page_size = PAGE_SIZE
    while True:
        try:
            q = client.table(table).select(columns).order(order_column).range(offset, offset + page_size - 1)
            if not_null_column:
                q = q.not_.is_(not_null_column, "null")
            batch = q.execute().data or []
        except Exception as exc:
            if "57014" in str(exc) and page_size > 250:
                page_size = 250
                continue
            raise
        if not batch:
            break
        rows.extend(batch)
        if len(batch) < page_size:
            break
        offset += page_size
    return rows


def fetch_ta_drug_keywords(client: Client) -> List[Dict[str, Any]]:
    return (
        client.table("ta_drug_keywords")
        .select("id,therapeutic_area_id,drug_name,drug_brand_name,drug_generic_name")
        .execute()
        .data
        or []
    )


def fetch_therapeutic_areas(client: Client) -> List[Dict[str, Any]]:
    return client.table("therapeutic_areas").select("id,name,slug").execute().data or []


def resolve_ta_slug(client: Client, slug: str) -> Tuple[str, str]:
    rows = (
        client.table("therapeutic_areas")
        .select("id,name,slug")
        .eq("slug", slug)
        .execute()
        .data
        or []
    )
    if not rows:
        raise RuntimeError(f"No therapeutic_area found with slug='{slug}'")
    return str(rows[0]["id"]), str(rows[0]["name"])


def assert_ta_write_scope(
    *,
    scoped_ta_id: str,
    scoped_hcp_ids: set,
    summary_rows: List[Dict[str, Any]],
    by_ta_rows: List[Dict[str, Any]],
    top_companies_rows: List[Dict[str, Any]],
    by_drug_rows: List[Dict[str, Any]],
) -> None:
    bad_by_ta = [
        r for r in by_ta_rows if str(r.get("therapeutic_area_id")) != scoped_ta_id
    ]
    if bad_by_ta:
        raise RuntimeError(
            f"SAFETY VIOLATION: {len(bad_by_ta)} by_ta row(s) have therapeutic_area_id != {scoped_ta_id}"
        )
    for label, rows in (
        ("summary", summary_rows),
        ("top_companies", top_companies_rows),
        ("by_drug", by_drug_rows),
    ):
        bad = [r for r in rows if str(r.get("hcp_id")) not in scoped_hcp_ids]
        if bad:
            raise RuntimeError(
                f"SAFETY VIOLATION: {len(bad)} {label} row(s) have hcp_id outside scoped TA HCP set"
            )


def sql_literal(value: str) -> str:
    return "'" + value.replace("'", "''") + "'"


def rows_to_dicts(cursor_result: Any) -> List[Dict[str, Any]]:
    cols = [d[0] for d in cursor_result.description]
    out = []
    for row in cursor_result.fetchall():
        out.append({cols[i]: row[i] for i in range(len(cols))})
    return out


def bucket_amount(x: float) -> str:
    if x == 0:
        return "0"
    if 0 < x <= 100:
        return "0-100"
    if x <= 1000:
        return "100-1K"
    if x <= 10000:
        return "1K-10K"
    if x <= 100000:
        return "10K-100K"
    if x <= 1000000:
        return "100K-1M"
    return "1M+"


if __name__ == "__main__":
    started = time.time()
    args = parse_args()
    execute = bool(args.execute)
    target_version: str = args.target_version
    ta_slug: Optional[str] = args.ta
    mode = "execute" if execute else "dry_run"
    errors: List[str] = []

    load_dotenv()
    client = init_supabase()

    scoped_ta_id: Optional[str] = None
    scoped_ta_name: Optional[str] = None
    scoped_hcp_ids: Optional[set] = None
    if ta_slug:
        scoped_ta_id, scoped_ta_name = resolve_ta_slug(client, ta_slug)
        print(f"\n{'=' * 60}")
        print(f"TA-SCOPED RUN: {scoped_ta_name} (ta_id={scoped_ta_id})")
        print("Only HCPs in this TA will be computed/written.")
        print(f"{'=' * 60}\n")

    con = duckdb.connect()
    con.execute("SET memory_limit = '4GB'")

    # Phase 2a/b: hcps cohort and mapping
    hcps_npi_rows = fetch_all_pages(
        client,
        get_table_name("hcps", target_version),
        "id,npi_number",
        not_null_column="npi_number",
        target_version=target_version,
    )
    npi_set = {str(r.get("npi_number")).strip() for r in hcps_npi_rows if str(r.get("npi_number") or "").strip()}
    npi_to_hcp = {str(r["npi_number"]).strip(): str(r["id"]) for r in hcps_npi_rows if r.get("npi_number")}
    print(f"Loaded {len(npi_set)} FieldMark NPIs")

    # Phase 2c/d/e
    ta_drug_keywords = fetch_ta_drug_keywords(client)
    therapeutic_areas = fetch_therapeutic_areas(client)
    ta_name_by_id = {str(r["id"]): str(r["name"]) for r in therapeutic_areas if r.get("id")}
    ta_id_by_name = {str(r["name"]): str(r["id"]) for r in therapeutic_areas if r.get("id")}
    if target_version == "v2":
        # v2 schema: hcp_therapeutic_areas_v2 has composite PK (hcp_id, therapeutic_area_id),
        # no surrogate id column. Paginate by hcp_id.
        hcp_ta_rows = fetch_all_pages(
            client,
            get_table_name("hcp_therapeutic_areas", target_version),
            "hcp_id,therapeutic_area_id",
            target_version=target_version,
            order_column="hcp_id",
        )
    else:
        hcp_ta_rows = fetch_all_pages(
            client,
            get_table_name("hcp_therapeutic_areas", target_version),
            "id,hcp_id,therapeutic_area_id",
            target_version=target_version,
        )

    if scoped_ta_id:
        hcp_ta_rows = [
            r
            for r in hcp_ta_rows
            if str(r.get("therapeutic_area_id") or "") == scoped_ta_id
        ]
        scoped_hcp_ids = {
            str(r.get("hcp_id"))
            for r in hcp_ta_rows
            if r.get("hcp_id")
        }
        print(f"[SCOPE] hcp_ta_rows filtered to TA: {len(hcp_ta_rows):,} rows, {len(scoped_hcp_ids):,} HCPs")
        hcps_npi_rows = [
            r for r in hcps_npi_rows if str(r.get("id")) in scoped_hcp_ids
        ]
        npi_set = {
            str(r.get("npi_number")).strip()
            for r in hcps_npi_rows
            if str(r.get("npi_number") or "").strip()
        }
        npi_to_hcp = {
            str(r["npi_number"]).strip(): str(r["id"])
            for r in hcps_npi_rows
            if r.get("npi_number")
        }
        ta_drug_keywords = [
            r
            for r in ta_drug_keywords
            if str(r.get("therapeutic_area_id") or "") == scoped_ta_id
        ]
        print(
            f"[SCOPE] NPI cohort scoped to TA HCPs: {len(npi_set):,} NPIs; "
            f"drug keywords for TA: {len(ta_drug_keywords):,}"
        )

    hcp_to_tas: Dict[str, set] = {}
    for r in hcp_ta_rows:
        h = str(r.get("hcp_id") or "")
        t = str(r.get("therapeutic_area_id") or "")
        if not h or not t:
            continue
        if h not in hcp_to_tas:
            hcp_to_tas[h] = set()
        hcp_to_tas[h].add(t)

    # Phase 3: register in duckdb
    parquet_list_sql = ", ".join(sql_literal(p) for p in PARQUET_FILES)
    con.execute(
        f"""
        CREATE VIEW op_payments AS
        SELECT * FROM read_parquet([{parquet_list_sql}])
        """
    )

    con.execute("CREATE TEMP TABLE fieldmark_npis (npi VARCHAR PRIMARY KEY)")
    con.executemany("INSERT INTO fieldmark_npis VALUES (?)", [(n,) for n in sorted(npi_set)])

    con.execute("CREATE TEMP TABLE hcp_npi_map (hcp_id VARCHAR, npi VARCHAR)")
    con.executemany(
        "INSERT INTO hcp_npi_map VALUES (?, ?)",
        [(hcp_id, npi) for npi, hcp_id in npi_to_hcp.items()],
    )

    con.execute(
        """
        CREATE TEMP TABLE drug_keywords (
          keyword_id VARCHAR,
          therapeutic_area_id VARCHAR,
          drug_name VARCHAR,
          drug_brand_name VARCHAR,
          drug_generic_name VARCHAR
        )
        """
    )
    con.executemany(
        "INSERT INTO drug_keywords VALUES (?, ?, ?, ?, ?)",
        [
            (
                str(r.get("id") or ""),
                str(r.get("therapeutic_area_id") or ""),
                str(r.get("drug_name") or ""),
                str(r.get("drug_brand_name") or ""),
                str(r.get("drug_generic_name") or ""),
            )
            for r in ta_drug_keywords
        ],
    )

    con.execute("CREATE TEMP TABLE hcp_ta (hcp_id VARCHAR, therapeutic_area_id VARCHAR)")
    con.executemany(
        "INSERT INTO hcp_ta VALUES (?, ?)",
        [
            (str(r.get("hcp_id") or ""), str(r.get("therapeutic_area_id") or ""))
            for r in hcp_ta_rows
            if r.get("hcp_id") and r.get("therapeutic_area_id")
        ],
    )

    # Phase 4
    con.execute(
        """
        CREATE TEMP TABLE filtered_payments AS
        SELECT
          op.npi,
          op.program_year,
          op.payment_amount_usd,
          op.payment_date,
          op.nature_of_payment,
          op.manufacturer_name,
          op.drug_indicator,
          op.drug_name,
          op.drug_slot,
          hmap.hcp_id
        FROM op_payments op
        INNER JOIN hcp_npi_map hmap ON op.npi = hmap.npi
        """
    )
    filtered_payment_rows = con.execute("SELECT COUNT(*) AS c FROM filtered_payments").fetchone()[0]
    print(f"filtered_payments rows: {filtered_payment_rows}")

    pharma_filter = "(drug_indicator IN ('Drug','Biological') OR drug_indicator IS NULL OR drug_slot = 0)"
    speaker_list_sql = ", ".join(sql_literal(x) for x in SPEAKER_CATEGORIES)

    # Phase 5 summary agg
    summary_query = f"""
    SELECT
      hcp_id,
      SUM(CASE WHEN {pharma_filter} AND nature_of_payment NOT IN ('Food and Beverage','Travel and Lodging') THEN payment_amount_usd ELSE 0 END) AS total_payments_3yr,
      SUM(CASE WHEN {pharma_filter} AND nature_of_payment IN ({speaker_list_sql}) THEN payment_amount_usd ELSE 0 END) AS speaker_bureau_3yr,
      SUM(CASE WHEN {pharma_filter} AND nature_of_payment = 'Consulting Fee' THEN payment_amount_usd ELSE 0 END) AS consulting_3yr,
      SUM(CASE WHEN {pharma_filter} AND nature_of_payment = 'Honoraria' THEN payment_amount_usd ELSE 0 END) AS honoraria_3yr,
      SUM(CASE WHEN {pharma_filter} AND nature_of_payment = 'Education' THEN payment_amount_usd ELSE 0 END) AS education_3yr,
      SUM(CASE WHEN {pharma_filter} AND nature_of_payment = 'Royalty or License' THEN payment_amount_usd ELSE 0 END) AS royalty_3yr,
      SUM(CASE WHEN {pharma_filter} AND nature_of_payment = 'Food and Beverage' THEN payment_amount_usd ELSE 0 END) AS food_beverage_3yr,
      SUM(CASE WHEN {pharma_filter} AND nature_of_payment = 'Travel and Lodging' THEN payment_amount_usd ELSE 0 END) AS travel_lodging_3yr,
      SUM(CASE WHEN {pharma_filter} AND program_year = 2022 THEN payment_amount_usd ELSE 0 END) AS py2022_total,
      SUM(CASE WHEN {pharma_filter} AND program_year = 2023 THEN payment_amount_usd ELSE 0 END) AS py2023_total,
      SUM(CASE WHEN {pharma_filter} AND program_year = 2024 THEN payment_amount_usd ELSE 0 END) AS py2024_total,
      SUM(CASE WHEN {pharma_filter} THEN payment_amount_usd ELSE 0 END) AS total_payments_lifetime,
      SUM(CASE WHEN {pharma_filter} THEN 1 ELSE 0 END) AS total_payments_count_lifetime,
      COUNT(DISTINCT CASE WHEN {pharma_filter} THEN manufacturer_name ELSE NULL END) AS distinct_companies_lifetime,
      MAX(CASE WHEN {pharma_filter} AND payment_date IS NOT NULL AND payment_date <> '' THEN strptime(payment_date, '%m/%d/%Y') ELSE NULL END) AS most_recent_payment_date
    FROM filtered_payments
    GROUP BY hcp_id
    """
    summary_rows_raw = rows_to_dicts(con.execute(summary_query))
    summary_rows: List[Dict[str, Any]] = []
    for r in summary_rows_raw:
        py2022_total = float(r.get("py2022_total") or 0.0)
        py2024_total = float(r.get("py2024_total") or 0.0)
        trend = None
        if py2022_total != 0:
            trend = ((py2024_total - py2022_total) / py2022_total) * 100.0
        summary_rows.append(
            {
                "hcp_id": r["hcp_id"],
                "total_payments_3yr": float(r.get("total_payments_3yr") or 0.0),
                "speaker_bureau_3yr": float(r.get("speaker_bureau_3yr") or 0.0),
                "consulting_3yr": float(r.get("consulting_3yr") or 0.0),
                "honoraria_3yr": float(r.get("honoraria_3yr") or 0.0),
                "education_3yr": float(r.get("education_3yr") or 0.0),
                "royalty_3yr": float(r.get("royalty_3yr") or 0.0),
                "food_beverage_3yr": float(r.get("food_beverage_3yr") or 0.0),
                "travel_lodging_3yr": float(r.get("travel_lodging_3yr") or 0.0),
                "py2022_total": py2022_total,
                "py2023_total": float(r.get("py2023_total") or 0.0),
                "py2024_total": py2024_total,
                "total_payments_lifetime": float(r.get("total_payments_lifetime") or 0.0),
                "total_payments_count_lifetime": int(r.get("total_payments_count_lifetime") or 0),
                "distinct_companies_lifetime": int(r.get("distinct_companies_lifetime") or 0),
                "most_recent_payment_date": (
                    r["most_recent_payment_date"].date().isoformat()
                    if r.get("most_recent_payment_date") is not None
                    else None
                ),
                "year_over_year_trend_pct": trend,
            }
        )

    # Phase 6 by_ta agg
    by_ta_query = f"""
    SELECT
      fp.hcp_id,
      dk.therapeutic_area_id,
      SUM(fp.payment_amount_usd) AS ta_payments_3yr,
      COUNT(*) AS ta_payments_count_3yr,
      COUNT(DISTINCT dk.keyword_id) AS ta_distinct_drugs_3yr,
      COUNT(DISTINCT fp.manufacturer_name) AS ta_distinct_companies_3yr,
      SUM(CASE WHEN fp.nature_of_payment IN ({speaker_list_sql}) THEN fp.payment_amount_usd ELSE 0 END) AS ta_speaker_bureau_3yr,
      SUM(CASE WHEN fp.nature_of_payment = 'Consulting Fee' THEN fp.payment_amount_usd ELSE 0 END) AS ta_consulting_3yr,
      SUM(CASE WHEN fp.nature_of_payment = 'Honoraria' THEN fp.payment_amount_usd ELSE 0 END) AS ta_honoraria_3yr
    FROM filtered_payments fp
    INNER JOIN hcp_ta ht
      ON ht.hcp_id = fp.hcp_id
    INNER JOIN drug_keywords dk
      ON dk.therapeutic_area_id = ht.therapeutic_area_id
     AND (
       lower(fp.drug_name) = lower(dk.drug_name)
       OR (dk.drug_brand_name IS NOT NULL AND dk.drug_brand_name <> '' AND lower(fp.drug_name) LIKE '%' || lower(dk.drug_brand_name) || '%')
     )
    WHERE fp.drug_indicator IN ('Drug','Biological')
      AND fp.drug_name IS NOT NULL
      AND fp.drug_name <> ''
    GROUP BY fp.hcp_id, dk.therapeutic_area_id
    """
    by_ta_rows_raw = rows_to_dicts(con.execute(by_ta_query))
    by_ta_rows = [
        {
            "hcp_id": r["hcp_id"],
            "therapeutic_area_id": r["therapeutic_area_id"],
            "ta_payments_3yr": float(r.get("ta_payments_3yr") or 0.0),
            "ta_payments_count_3yr": int(r.get("ta_payments_count_3yr") or 0),
            "ta_distinct_drugs_3yr": int(r.get("ta_distinct_drugs_3yr") or 0),
            "ta_distinct_companies_3yr": int(r.get("ta_distinct_companies_3yr") or 0),
            "ta_speaker_bureau_3yr": float(r.get("ta_speaker_bureau_3yr") or 0.0),
            "ta_consulting_3yr": float(r.get("ta_consulting_3yr") or 0.0),
            "ta_honoraria_3yr": float(r.get("ta_honoraria_3yr") or 0.0),
        }
        for r in by_ta_rows_raw
    ]

    # Phase 6.5 top_companies agg - aggregate per HCP per manufacturer, keep top 10
    top_companies_query = f"""
    WITH per_company AS (
      SELECT
        hcp_id,
        manufacturer_name,
        SUM(payment_amount_usd) AS total_amount_usd,
        COUNT(*) AS payment_count,
        MAX(CASE WHEN payment_date IS NOT NULL AND payment_date <> '' THEN strptime(payment_date, '%m/%d/%Y') ELSE NULL END) AS most_recent_payment_date
      FROM filtered_payments
      WHERE {pharma_filter}
        AND manufacturer_name IS NOT NULL
        AND manufacturer_name <> ''
      GROUP BY hcp_id, manufacturer_name
    ),
    ranked AS (
      SELECT
        hcp_id,
        manufacturer_name,
        total_amount_usd,
        payment_count,
        most_recent_payment_date,
        ROW_NUMBER() OVER (PARTITION BY hcp_id ORDER BY total_amount_usd DESC, manufacturer_name ASC) AS rank_by_amount
      FROM per_company
    )
    SELECT *
    FROM ranked
    WHERE rank_by_amount <= 10
    """
    top_companies_rows_raw = rows_to_dicts(con.execute(top_companies_query))
    top_companies_rows = [
        {
            "hcp_id": r["hcp_id"],
            "manufacturer_name": r["manufacturer_name"],
            "total_amount_usd": float(r.get("total_amount_usd") or 0.0),
            "payment_count": int(r.get("payment_count") or 0),
            "most_recent_payment_date": (
                r["most_recent_payment_date"].date().isoformat()
                if r.get("most_recent_payment_date") is not None
                else None
            ),
            "rank_by_amount": int(r.get("rank_by_amount") or 0),
        }
        for r in top_companies_rows_raw
    ]

    # Phase 6.6 by_drug agg - aggregate per HCP per drug per manufacturer
    # for all pharmaceutical/biologic payments excluding food/travel.
    by_drug_query = f"""
    SELECT
      hcp_id,
      UPPER(drug_name) AS drug_name,
      COALESCE(NULLIF(TRIM(manufacturer_name), ''), 'UNKNOWN') AS manufacturer_name,
      SUM(payment_amount_usd) AS total_amount_usd,
      COUNT(*) AS payment_count,
      MAX(CASE WHEN payment_date IS NOT NULL AND payment_date <> ''
               THEN strptime(payment_date, '%m/%d/%Y') ELSE NULL END
      ) AS most_recent_payment_date,
      SUM(CASE WHEN program_year = 2022 AND CAST(strftime(strptime(payment_date, '%m/%d/%Y'), '%m') AS INTEGER) BETWEEN 1 AND 3 THEN payment_amount_usd ELSE 0 END) AS q_2022_q1,
      SUM(CASE WHEN program_year = 2022 AND CAST(strftime(strptime(payment_date, '%m/%d/%Y'), '%m') AS INTEGER) BETWEEN 4 AND 6 THEN payment_amount_usd ELSE 0 END) AS q_2022_q2,
      SUM(CASE WHEN program_year = 2022 AND CAST(strftime(strptime(payment_date, '%m/%d/%Y'), '%m') AS INTEGER) BETWEEN 7 AND 9 THEN payment_amount_usd ELSE 0 END) AS q_2022_q3,
      SUM(CASE WHEN program_year = 2022 AND CAST(strftime(strptime(payment_date, '%m/%d/%Y'), '%m') AS INTEGER) BETWEEN 10 AND 12 THEN payment_amount_usd ELSE 0 END) AS q_2022_q4,
      SUM(CASE WHEN program_year = 2023 AND CAST(strftime(strptime(payment_date, '%m/%d/%Y'), '%m') AS INTEGER) BETWEEN 1 AND 3 THEN payment_amount_usd ELSE 0 END) AS q_2023_q1,
      SUM(CASE WHEN program_year = 2023 AND CAST(strftime(strptime(payment_date, '%m/%d/%Y'), '%m') AS INTEGER) BETWEEN 4 AND 6 THEN payment_amount_usd ELSE 0 END) AS q_2023_q2,
      SUM(CASE WHEN program_year = 2023 AND CAST(strftime(strptime(payment_date, '%m/%d/%Y'), '%m') AS INTEGER) BETWEEN 7 AND 9 THEN payment_amount_usd ELSE 0 END) AS q_2023_q3,
      SUM(CASE WHEN program_year = 2023 AND CAST(strftime(strptime(payment_date, '%m/%d/%Y'), '%m') AS INTEGER) BETWEEN 10 AND 12 THEN payment_amount_usd ELSE 0 END) AS q_2023_q4,
      SUM(CASE WHEN program_year = 2024 AND CAST(strftime(strptime(payment_date, '%m/%d/%Y'), '%m') AS INTEGER) BETWEEN 1 AND 3 THEN payment_amount_usd ELSE 0 END) AS q_2024_q1,
      SUM(CASE WHEN program_year = 2024 AND CAST(strftime(strptime(payment_date, '%m/%d/%Y'), '%m') AS INTEGER) BETWEEN 4 AND 6 THEN payment_amount_usd ELSE 0 END) AS q_2024_q2,
      SUM(CASE WHEN program_year = 2024 AND CAST(strftime(strptime(payment_date, '%m/%d/%Y'), '%m') AS INTEGER) BETWEEN 7 AND 9 THEN payment_amount_usd ELSE 0 END) AS q_2024_q3,
      SUM(CASE WHEN program_year = 2024 AND CAST(strftime(strptime(payment_date, '%m/%d/%Y'), '%m') AS INTEGER) BETWEEN 10 AND 12 THEN payment_amount_usd ELSE 0 END) AS q_2024_q4,
      SUM(CASE WHEN program_year = 2022 THEN payment_amount_usd ELSE 0 END) AS py2022_total,
      SUM(CASE WHEN program_year = 2024 THEN payment_amount_usd ELSE 0 END) AS py2024_total
    FROM filtered_payments
    WHERE {pharma_filter}
      AND drug_name IS NOT NULL
      AND drug_name <> ''
      AND nature_of_payment NOT IN ('Food and Beverage')
    GROUP BY hcp_id, UPPER(drug_name), COALESCE(NULLIF(TRIM(manufacturer_name), ''), 'UNKNOWN')
    """
    by_drug_rows_raw = rows_to_dicts(con.execute(by_drug_query))
    by_drug_rows = []
    for r in by_drug_rows_raw:
        py2022 = float(r.get("py2022_total") or 0.0)
        py2024 = float(r.get("py2024_total") or 0.0)
        trend = None
        if py2022 != 0:
            trend = ((py2024 - py2022) / py2022) * 100.0
        payments_by_quarter = {
            "2022-Q1": float(r.get("q_2022_q1") or 0.0),
            "2022-Q2": float(r.get("q_2022_q2") or 0.0),
            "2022-Q3": float(r.get("q_2022_q3") or 0.0),
            "2022-Q4": float(r.get("q_2022_q4") or 0.0),
            "2023-Q1": float(r.get("q_2023_q1") or 0.0),
            "2023-Q2": float(r.get("q_2023_q2") or 0.0),
            "2023-Q3": float(r.get("q_2023_q3") or 0.0),
            "2023-Q4": float(r.get("q_2023_q4") or 0.0),
            "2024-Q1": float(r.get("q_2024_q1") or 0.0),
            "2024-Q2": float(r.get("q_2024_q2") or 0.0),
            "2024-Q3": float(r.get("q_2024_q3") or 0.0),
            "2024-Q4": float(r.get("q_2024_q4") or 0.0),
        }
        by_drug_rows.append({
            "hcp_id": r["hcp_id"],
            "drug_name": r["drug_name"],
            "manufacturer_name": r["manufacturer_name"],
            "total_amount_usd": float(r.get("total_amount_usd") or 0.0),
            "payment_count": int(r.get("payment_count") or 0),
            "py2022_total": float(r.get("py2022_total") or 0.0),
            "py2023_total": float(r.get("py2023_total") or 0.0),
            "py2024_total": float(r.get("py2024_total") or 0.0),
            "payments_by_quarter": payments_by_quarter,
            "most_recent_payment_date": (
                r["most_recent_payment_date"].date().isoformat()
                if r.get("most_recent_payment_date") is not None
                else None
            ),
            "year_over_year_trend_pct": trend,
        })

    print(f"Computed {len(by_drug_rows)} by_drug rows")

    print(f"Computed {len(summary_rows)} summary rows, {len(by_ta_rows)} by_ta rows, {len(top_companies_rows)} top_companies rows, {len(by_drug_rows)} by_drug rows")

    if scoped_ta_id and scoped_hcp_ids is not None:
        assert_ta_write_scope(
            scoped_ta_id=scoped_ta_id,
            scoped_hcp_ids=scoped_hcp_ids,
            summary_rows=summary_rows,
            by_ta_rows=by_ta_rows,
            top_companies_rows=top_companies_rows,
            by_drug_rows=by_drug_rows,
        )
        print("[SCOPE] Pre-write assertion passed: all rows are within target TA scope.")

    # Phase 8 - Level 1 stats
    hcp_with_summary = len(summary_rows)
    hcp_with_by_ta = len({r["hcp_id"] for r in by_ta_rows})
    total_bucket_counts: Counter[str] = Counter()
    speaker_bucket_counts: Counter[str] = Counter()
    for r in summary_rows:
        total_bucket_counts[bucket_amount(float(r["total_payments_3yr"]))] += 1
        speaker_bucket_counts[bucket_amount(float(r["speaker_bureau_3yr"]))] += 1
    ta_row_counts: Counter[str] = Counter()
    for r in by_ta_rows:
        ta_row_counts[ta_name_by_id.get(r["therapeutic_area_id"], r["therapeutic_area_id"])] += 1

    level_1_stats = {
        "hcp_count_summary_rows": hcp_with_summary,
        "hcp_count_with_by_ta_rows": hcp_with_by_ta,
        "total_payments_3yr_buckets": dict(total_bucket_counts),
        "speaker_bureau_3yr_buckets": dict(speaker_bucket_counts),
        "by_ta_row_count": dict(ta_row_counts),
    }
    print("Level 1 stats:", level_1_stats)

    # Phase 8 - Level 2 canonical validation
    summary_by_hcp = {r["hcp_id"]: r for r in summary_rows}
    by_ta_index = {(r["hcp_id"], r["therapeutic_area_id"]): r for r in by_ta_rows}
    level_2_canonicals: List[Dict[str, Any]] = []

    for c in CANONICALS:
        entry: Dict[str, Any] = {
            "label": c["label"],
            "hcp_id": c["hcp_id"],
            "npi": c["npi"],
            "expected_ta": c["expected_ta"],
            "summary_exists": False,
            "summary_metrics": None,
            "expected_ta_row_exists": False,
            "expected_ta_payments_3yr": None,
            "error": None,
        }
        try:
            s = summary_by_hcp.get(c["hcp_id"])
            if s:
                entry["summary_exists"] = True
                entry["summary_metrics"] = {
                    "total_payments_3yr": s["total_payments_3yr"],
                    "speaker_bureau_3yr": s["speaker_bureau_3yr"],
                    "consulting_3yr": s["consulting_3yr"],
                }
            ta_id = ta_id_by_name.get(c["expected_ta"])
            if ta_id and (c["hcp_id"], ta_id) in by_ta_index:
                entry["expected_ta_row_exists"] = True
                entry["expected_ta_payments_3yr"] = by_ta_index[(c["hcp_id"], ta_id)]["ta_payments_3yr"]
        except Exception as exc:
            entry["error"] = repr(exc)
            errors.append(f"canonical_validation_{c['label']}: {repr(exc)}")
        level_2_canonicals.append(entry)
        print("Canonical:", entry)

    for name, first_like in [("Wakelee", "Heather%"), ("Lam", "%")]:
        entry: Dict[str, Any] = {
            "label": name,
            "lookup_method": "supabase_hcps_name_lookup",
            "found_hcps": [],
            "summary_rows": [],
            "by_ta_rows": [],
            "error": None,
        }
        try:
            q = (
                client.table(get_table_name("hcps", target_version))
                .select("id,npi_number,first_name,last_name")
                .eq("last_name", name)
            )
            if name == "Wakelee":
                q = q.ilike("first_name", first_like)
            rows = q.execute().data or []
            entry["found_hcps"] = rows
            for r in rows:
                hid = str(r.get("id"))
                if hid in summary_by_hcp:
                    entry["summary_rows"].append(summary_by_hcp[hid])
                entry["by_ta_rows"].extend([x for x in by_ta_rows if x["hcp_id"] == hid])
        except Exception as exc:
            entry["error"] = repr(exc)
            errors.append(f"canonical_lookup_{name}: {repr(exc)}")
        level_2_canonicals.append(entry)
        print("Canonical merged check:", entry)

    # Phase 8 - Level 3 unmatched per TA
    level_3_unmatched: Dict[str, List[Dict[str, Any]]] = {}
    unmatched_ta_items: Sequence[Tuple[str, str]]
    if scoped_ta_id and scoped_ta_name:
        unmatched_ta_items = [(scoped_ta_id, scoped_ta_name)]
    else:
        unmatched_ta_items = list(ta_name_by_id.items())
    for ta_id, ta_name in unmatched_ta_items:
        unmatched_query = f"""
        SELECT
          fp.drug_name,
          COUNT(*) AS payment_count,
          SUM(fp.payment_amount_usd) AS total_amount_usd
        FROM filtered_payments fp
        INNER JOIN hcp_ta ht
          ON ht.hcp_id = fp.hcp_id
         AND ht.therapeutic_area_id = {sql_literal(ta_id)}
        LEFT JOIN drug_keywords dk
          ON dk.therapeutic_area_id = {sql_literal(ta_id)}
         AND (
           lower(fp.drug_name) = lower(dk.drug_name)
           OR (dk.drug_brand_name IS NOT NULL AND dk.drug_brand_name <> '' AND lower(fp.drug_name) LIKE '%' || lower(dk.drug_brand_name) || '%')
         )
        WHERE fp.drug_indicator IN ('Drug','Biological')
          AND fp.drug_name IS NOT NULL
          AND fp.drug_name <> ''
          AND dk.keyword_id IS NULL
        GROUP BY fp.drug_name
        ORDER BY SUM(fp.payment_amount_usd) DESC
        LIMIT 50
        """
        rows = rows_to_dicts(con.execute(unmatched_query))
        normalized = [
            {
                "drug_name": r["drug_name"],
                "payment_count": int(r["payment_count"]),
                "total_amount_usd": float(r["total_amount_usd"] or 0.0),
            }
            for r in rows
        ]
        level_3_unmatched[ta_name] = normalized
        print(f"Top unmatched for {ta_name} (count={len(normalized)})")
        for row in normalized:
            print(f"  {row['drug_name']}: count={row['payment_count']} amount={row['total_amount_usd']}")

    rows_inserted: Optional[Dict[str, int]] = None

    # Phase 9 writes
    if not execute:
        print("[DRY-RUN] Skipping Supabase write.")
    else:
        if target_version == "v2":
            confirm = input(
                f"About to UPSERT into hcp_open_payments_summary_v2, hcp_open_payments_by_ta_v2, "
                f"hcp_open_payments_top_companies_v2, and hcp_open_payments_by_drug_v2.\n"
                f"Will write {len(summary_rows)} summary rows, {len(by_ta_rows)} by_ta rows, "
                f"{len(top_companies_rows)} top_companies rows, "
                f"and {len(by_drug_rows)} by_drug rows. Continue? (yes/no): "
            )
        else:
            confirm = input(
                f"About to TRUNCATE and rewrite hcp_open_payments_summary and hcp_open_payments_by_ta.\n"
                f"Will write {len(summary_rows)} summary rows and {len(by_ta_rows)} by_ta rows. Continue? (yes/no): "
            )
        if confirm != "yes":
            print("Execution cancelled.")
        else:
            inserted_summary = 0
            inserted_by_ta = 0
            summary_table = get_table_name("hcp_open_payments_summary", target_version)
            by_ta_table = get_table_name("hcp_open_payments_by_ta", target_version)
            top_companies_table = get_table_name("hcp_open_payments_top_companies", target_version)

            if target_version == "v1":
                # truncate (delete-all)
                trunc_summary_resp = (
                    client.table(summary_table).delete().neq("id", DELETE_GUARD_ID).execute()
                )
                trunc_summary_count = len(trunc_summary_resp.data or [])
                print(f"Truncated hcp_open_payments_summary ({trunc_summary_count})")

            for start_idx in tqdm(
                range(0, len(summary_rows), WRITE_BATCH_SIZE), desc="summary", unit="batch"
            ):
                batch = summary_rows[start_idx : start_idx + WRITE_BATCH_SIZE]
                try:
                    if target_version == "v2":
                        response = client.table(summary_table).upsert(batch, on_conflict="hcp_id").execute()
                        if not response.data:
                            raise RuntimeError(
                                f"Summary upsert returned empty data ({len(batch)} rows) - "
                                f"writes may have been silently dropped"
                            )
                        inserted_summary += len(response.data)
                    else:
                        client.table(summary_table).insert(batch).execute()
                        inserted_summary += len(batch)
                    print(
                        f"Inserted summary batch {start_idx // WRITE_BATCH_SIZE + 1} "
                        f"({inserted_summary}/{len(summary_rows)})"
                    )
                except Exception as exc:
                    errors.append(f"summary_insert_batch_{start_idx}: {repr(exc)}")
                    print(f"Summary batch failed at offset {start_idx}: {exc}")

            if target_version == "v1":
                trunc_by_ta_resp = (
                    client.table(by_ta_table).delete().neq("id", DELETE_GUARD_ID).execute()
                )
                trunc_by_ta_count = len(trunc_by_ta_resp.data or [])
                print(f"Truncated hcp_open_payments_by_ta ({trunc_by_ta_count})")

            for start_idx in tqdm(
                range(0, len(by_ta_rows), WRITE_BATCH_SIZE), desc="by_ta", unit="batch"
            ):
                batch = by_ta_rows[start_idx : start_idx + WRITE_BATCH_SIZE]
                try:
                    if target_version == "v2":
                        response = client.table(by_ta_table).upsert(
                            batch, on_conflict="hcp_id,therapeutic_area_id"
                        ).execute()
                        if not response.data:
                            raise RuntimeError(
                                f"By_ta upsert returned empty data ({len(batch)} rows) - "
                                f"writes may have been silently dropped"
                            )
                        inserted_by_ta += len(response.data)
                    else:
                        client.table(by_ta_table).insert(batch).execute()
                        inserted_by_ta += len(batch)
                    print(
                        f"Inserted by_ta batch {start_idx // WRITE_BATCH_SIZE + 1} "
                        f"({inserted_by_ta}/{len(by_ta_rows)})"
                    )
                except Exception as exc:
                    errors.append(f"by_ta_insert_batch_{start_idx}: {repr(exc)}")
                    print(f"by_ta batch failed at offset {start_idx}: {exc}")

            inserted_top_companies = 0

            if target_version == "v1":
                trunc_top_companies_resp = (
                    client.table(top_companies_table).delete().neq("id", DELETE_GUARD_ID).execute()
                )
                trunc_top_companies_count = len(trunc_top_companies_resp.data or [])
                print(f"Truncated hcp_open_payments_top_companies ({trunc_top_companies_count})")

            for start_idx in tqdm(
                range(0, len(top_companies_rows), WRITE_BATCH_SIZE), desc="top_companies", unit="batch"
            ):
                batch = top_companies_rows[start_idx : start_idx + WRITE_BATCH_SIZE]
                try:
                    if target_version == "v2":
                        response = client.table(top_companies_table).upsert(
                            batch, on_conflict="hcp_id,manufacturer_name"
                        ).execute()
                        if not response.data:
                            raise RuntimeError(
                                f"Top_companies upsert returned empty data ({len(batch)} rows) - "
                                f"writes may have been silently dropped"
                            )
                        inserted_top_companies += len(response.data)
                    else:
                        client.table(top_companies_table).insert(batch).execute()
                        inserted_top_companies += len(batch)
                    print(
                        f"Inserted top_companies batch {start_idx // WRITE_BATCH_SIZE + 1} "
                        f"({inserted_top_companies}/{len(top_companies_rows)})"
                    )
                except Exception as exc:
                    errors.append(f"top_companies_insert_batch_{start_idx}: {repr(exc)}")
                    print(f"top_companies batch failed at offset {start_idx}: {exc}")

            inserted_by_drug = 0
            by_drug_table = get_table_name("hcp_open_payments_by_drug", target_version)

            for start_idx in tqdm(
                range(0, len(by_drug_rows), WRITE_BATCH_SIZE), desc="by_drug", unit="batch"
            ):
                batch = by_drug_rows[start_idx : start_idx + WRITE_BATCH_SIZE]
                try:
                    if target_version == "v2":
                        response = client.table(by_drug_table).upsert(
                            batch, on_conflict="hcp_id,drug_name,manufacturer_name"
                        ).execute()
                        if not response.data:
                            raise RuntimeError(
                                f"By_drug upsert returned empty data ({len(batch)} rows) - "
                                f"writes may have been silently dropped"
                            )
                        inserted_by_drug += len(response.data)
                    else:
                        client.table(by_drug_table).insert(batch).execute()
                        inserted_by_drug += len(batch)
                    print(
                        f"Inserted by_drug batch {start_idx // WRITE_BATCH_SIZE + 1} "
                        f"({inserted_by_drug}/{len(by_drug_rows)})"
                    )
                except Exception as exc:
                    errors.append(f"by_drug_insert_batch_{start_idx}: {repr(exc)}")
                    print(f"by_drug batch failed at offset {start_idx}: {exc}")

            rows_inserted = {
                "summary_rows_inserted": inserted_summary,
                "by_ta_rows_inserted": inserted_by_ta,
                "top_companies_rows_inserted": inserted_top_companies,
                "by_drug_rows_inserted": inserted_by_drug,
            }
            print(
                f"Execute complete. Inserted summary={inserted_summary}/{len(summary_rows)}, "
                f"by_ta={inserted_by_ta}/{len(by_ta_rows)}, "
                f"top_companies={inserted_top_companies}/{len(top_companies_rows)}, "
                f"by_drug={inserted_by_drug}/{len(by_drug_rows)}"
            )

    elapsed_seconds = time.time() - started
    log_payload: Dict[str, Any] = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "mode": mode,
        "ta_scope": ta_slug or "all",
        "scoped_ta_id": scoped_ta_id,
        "elapsed_seconds": elapsed_seconds,
        "cohort_size": len(npi_set),
        "filtered_payment_rows": int(filtered_payment_rows),
        "summary_rows_computed": len(summary_rows),
        "by_ta_rows_computed": len(by_ta_rows),
        "top_companies_rows_computed": len(top_companies_rows),
        "by_drug_rows_computed": len(by_drug_rows),
        "level_1_stats": level_1_stats,
        "level_2_canonicals": level_2_canonicals,
        "level_3_unmatched": level_3_unmatched,
        "errors": errors,
    }
    if rows_inserted is not None:
        log_payload["rows_inserted"] = rows_inserted

    with open(OUTPUT_LOG_PATH, "w", encoding="utf-8") as f:
        json.dump(log_payload, f, indent=2)
    print(f"Saved log: {OUTPUT_LOG_PATH}")
