import argparse
import json
import os
import statistics
import time
from collections import Counter
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Tuple

import duckdb
from dotenv import load_dotenv
from supabase import Client, create_client


def get_table_name(base_name: str, target_version: str) -> str:
    if target_version == "v2":
        return f"{base_name}_v2"
    return base_name


PARQUET_FILES = [
    r"C:\Users\garre\Desktop\FieldMark\Medicare\medicare_provider_service_2021.parquet",
    r"C:\Users\garre\Desktop\FieldMark\Medicare\medicare_provider_service_2022.parquet",
    r"C:\Users\garre\Desktop\FieldMark\Medicare\medicare_provider_service_2023.parquet",
]
OUTPUT_LOG_PATH = r"C:\Users\garre\Desktop\FieldMark\medicare_aggregator_log_may6.json"
PAGE_SIZE = 1000
WRITE_BATCH_SIZE = 500
DELETE_GUARD_ID = "00000000-0000-0000-0000-000000000000"
PROGRAM_YEARS = [2021, 2022, 2023]

CANONICALS = [
    {
        "label": "Loomba",
        "hcp_id": "9339ead6-2023-4e69-9eda-2914553a2e20",
        "expected_ta": "Hepatology",
    },
    {
        "label": "Sanyal",
        "hcp_id": "32495742-222a-45c6-bb96-cc44d5227e7e",
        "expected_ta": "Hepatology",
    },
    {
        "label": "Chalasani",
        "hcp_id": "6f9dd309-bd67-4260-a9c2-8a22129f988c",
        "expected_ta": "Hepatology",
    },
    {
        "label": "Garassino",
        "hcp_id": "dc645bf0-b7e0-4c3c-9aaf-9e7bc35d6331",
        "expected_ta": "NSCLC",
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


def sql_literal(value: str) -> str:
    return "'" + value.replace("'", "''") + "'"


def rows_to_dicts(cursor_result: Any) -> List[Dict[str, Any]]:
    cols = [d[0] for d in cursor_result.description]
    out = []
    for row in cursor_result.fetchall():
        out.append({cols[i]: row[i] for i in range(len(cols))})
    return out


def patterns_to_vector(val: Any) -> List[str]:
    if val is None:
        return []
    if isinstance(val, list):
        return [str(x).strip() for x in val if str(x).strip()]
    if isinstance(val, str):
        try:
            parsed = json.loads(val)
            if isinstance(parsed, list):
                return [str(x).strip() for x in parsed if str(x).strip()]
        except json.JSONDecodeError:
            if val.strip():
                return [val.strip()]
        return []
    return []


def bucket_total_beneficiaries(x: Any) -> str:
    if x is None:
        return "0"
    try:
        xi = int(x)
    except (TypeError, ValueError):
        return "unknown"
    if xi == 0:
        return "0"
    if 1 <= xi <= 100:
        return "1-100"
    if xi <= 500:
        return "100-500"
    if xi <= 2000:
        return "500-2000"
    if xi <= 10000:
        return "2000-10000"
    return "10000+"


def _tolist_top_codes(val: Any) -> List[str]:
    if val is None:
        return []
    if isinstance(val, list):
        return [str(x) for x in val]
    if isinstance(val, str):
        return [val]
    return [str(val)]


if __name__ == "__main__":
    started = time.time()
    args = parse_args()
    execute = bool(args.execute)
    target_version: str = args.target_version
    mode = "execute" if execute else "dry_run"
    errors: List[str] = []

    load_dotenv()
    client = init_supabase()
    con = duckdb.connect()
    con.execute("SET memory_limit = '4GB'")

    # Phase 2a,b: cohort and NPI mapping
    hcps_npi_rows = fetch_all_pages(
        client,
        get_table_name("hcps", target_version),
        "id,npi_number",
        not_null_column="npi_number",
        target_version=target_version,
    )
    npi_set = {str(r.get("npi_number")).strip() for r in hcps_npi_rows if str(r.get("npi_number") or "").strip()}
    npi_to_hcp = {str(r["npi_number"]).strip(): str(r["id"]) for r in hcps_npi_rows if r.get("npi_number")}
    hcp_to_npi = {str(r["id"]): str(r["npi_number"]).strip() for r in hcps_npi_rows if r.get("npi_number")}
    print(f"Loaded {len(npi_set)} FieldMark NPIs")

    ta_hcpcs_rows_raw = fetch_all_pages(
        client,
        "ta_hcpcs_codes",
        (
            "id,therapeutic_area_id,hcpcs_code,code_category,is_primary_signal,"
            "requires_specialty_match,specialty_match_patterns"
        ),
    )

    therapeutic_areas = fetch_all_pages(client, "therapeutic_areas", "id,name")
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
    hcp_to_tas: Dict[str, set] = {}
    for r in hcp_ta_rows:
        h = str(r.get("hcp_id") or "")
        t = str(r.get("therapeutic_area_id") or "")
        if not h or not t:
            continue
        hcp_to_tas.setdefault(h, set()).add(t)

    parquet_list_sql = ", ".join(sql_literal(p) for p in PARQUET_FILES)
    con.execute(
        f"""
        CREATE VIEW medicare_records AS
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
        CREATE TEMP TABLE hcpcs_codes (
          code_id VARCHAR,
          therapeutic_area_id VARCHAR,
          hcpcs_code VARCHAR,
          code_category VARCHAR,
          is_primary_signal BOOLEAN,
          requires_specialty_match BOOLEAN,
          specialty_match_patterns VARCHAR[]
        )
        """
    )
    hcpcs_insert: List[Tuple[Any, ...]] = []
    for r in ta_hcpcs_rows_raw:
        patt = patterns_to_vector(r.get("specialty_match_patterns"))
        cat = r.get("code_category")
        cat_s = cat if isinstance(cat, str) and cat else ""
        ips = bool(r.get("is_primary_signal")) if r.get("is_primary_signal") is not None else False
        rsm = (
            bool(r.get("requires_specialty_match"))
            if r.get("requires_specialty_match") is not None
            else False
        )
        hcpcs_insert.append(
            (
                str(r.get("id") or ""),
                str(r.get("therapeutic_area_id") or ""),
                str(r.get("hcpcs_code") or "").strip(),
                cat_s,
                ips,
                rsm,
                patt,
            )
        )
    con.executemany(
        "INSERT INTO hcpcs_codes VALUES (?, ?, ?, ?, ?, ?, ?)",
        hcpcs_insert,
    )

    con.execute(
        """
        CREATE TEMP TABLE hcp_ta (hcp_id VARCHAR, therapeutic_area_id VARCHAR)
        """
    )
    con.executemany(
        "INSERT INTO hcp_ta VALUES (?, ?)",
        [
            (h, tid)
            for h, tset in hcp_to_tas.items()
            for tid in tset
        ],
    )

    con.execute(
        """
        CREATE TEMP TABLE filtered_medicare AS
        SELECT
          mr.npi,
          mr.program_year,
          mr.provider_type,
          mr.provider_state,
          mr.provider_ruca,
          mr.hcpcs_code,
          mr.hcpcs_drug_indicator,
          mr.place_of_service,
          mr.total_beneficiaries,
          mr.total_services,
          mr.avg_medicare_payment,
          hmap.hcp_id
        FROM medicare_records mr
        INNER JOIN hcp_npi_map hmap ON mr.npi = hmap.npi
        """
    )

    fm_count = int(con.execute("SELECT COUNT(*) FROM filtered_medicare").fetchone()[0])
    print(f"filtered_medicare rows: {fm_count}")

    con.execute(
        """
        CREATE TEMP TABLE top_hcpcs_per_hcp AS
        WITH hcp_hcpcs_volume AS (
          SELECT
            hcp_id,
            hcpcs_code,
            SUM(COALESCE(total_services, 0)) AS code_services,
            ROW_NUMBER() OVER (
              PARTITION BY hcp_id
              ORDER BY SUM(COALESCE(total_services, 0)) DESC NULLS LAST
            ) AS rn
          FROM filtered_medicare
          WHERE hcpcs_code IS NOT NULL AND CAST(hcpcs_code AS VARCHAR) <> ''
          GROUP BY hcp_id, hcpcs_code
        )
        SELECT
          hcp_id,
          list(hcpcs_code ORDER BY code_services DESC NULLS LAST) AS top_codes
        FROM hcp_hcpcs_volume
        WHERE rn <= 10
        GROUP BY hcp_id
        """
    )

    con.execute(
        """
        CREATE TEMP TABLE predominant_specialty_per_hcp AS
        WITH specialty_volume AS (
          SELECT
            hcp_id,
            provider_type,
            SUM(COALESCE(total_services, 0)) AS sp_services,
            ROW_NUMBER() OVER (
              PARTITION BY hcp_id
              ORDER BY SUM(COALESCE(total_services, 0)) DESC NULLS LAST
            ) AS rn
          FROM filtered_medicare
          WHERE provider_type IS NOT NULL AND CAST(provider_type AS VARCHAR) <> ''
          GROUP BY hcp_id, provider_type
        )
        SELECT hcp_id, provider_type AS predominant_specialty
        FROM specialty_volume
        WHERE rn = 1
        """
    )

    con.execute(
        """
        CREATE TEMP TABLE predominant_state_per_hcp AS
        WITH vol AS (
          SELECT
            hcp_id,
            provider_state,
            SUM(COALESCE(total_services, 0)) AS st_services,
            ROW_NUMBER() OVER (
              PARTITION BY hcp_id
              ORDER BY SUM(COALESCE(total_services, 0)) DESC NULLS LAST
            ) AS rn
          FROM filtered_medicare
          WHERE provider_state IS NOT NULL AND CAST(provider_state AS VARCHAR) <> ''
          GROUP BY hcp_id, provider_state
        )
        SELECT hcp_id, provider_state AS predominant_state
        FROM vol
        WHERE rn = 1
        """
    )

    con.execute(
        """
        CREATE TEMP TABLE predominant_ruca_per_hcp AS
        WITH vol AS (
          SELECT
            hcp_id,
            provider_ruca,
            SUM(COALESCE(total_services, 0)) AS r_services,
            ROW_NUMBER() OVER (
              PARTITION BY hcp_id
              ORDER BY SUM(COALESCE(total_services, 0)) DESC NULLS LAST
            ) AS rn
          FROM filtered_medicare
          WHERE provider_ruca IS NOT NULL AND CAST(provider_ruca AS VARCHAR) <> ''
          GROUP BY hcp_id, provider_ruca
        )
        SELECT hcp_id, provider_ruca AS predominant_ruca
        FROM vol
        WHERE rn = 1
        """
    )

    con.execute(
        """
        CREATE TEMP TABLE medicare_main_agg AS
        SELECT
          hcp_id,
          SUM(total_beneficiaries) AS total_beneficiaries_3yr,
          SUM(COALESCE(total_services, 0)) AS total_services_3yr,
          SUM(total_beneficiaries * COALESCE(avg_medicare_payment, 0)) AS total_medicare_payment_3yr,
          COUNT(DISTINCT hcpcs_code) AS total_distinct_hcpcs_codes_3yr,
          SUM(CASE WHEN program_year = 2021 THEN total_beneficiaries ELSE 0 END) AS beneficiaries_2021,
          SUM(CASE WHEN program_year = 2022 THEN total_beneficiaries ELSE 0 END) AS beneficiaries_2022,
          SUM(CASE WHEN program_year = 2023 THEN total_beneficiaries ELSE 0 END) AS beneficiaries_2023,
          SUM(CASE WHEN program_year = 2023 THEN COALESCE(total_services, 0) ELSE 0 END) AS services_last_year
        FROM filtered_medicare
        GROUP BY hcp_id
        """
    )

    con.execute(
        """
        CREATE TEMP TABLE unique_bene_est AS
        WITH max_per_code AS (
          SELECT hcp_id, hcpcs_code, MAX(total_beneficiaries) AS max_benes
          FROM filtered_medicare
          GROUP BY hcp_id, hcpcs_code
        )
        SELECT hcp_id, SUM(max_benes) AS total_beneficiaries_3yr_unique_est
        FROM max_per_code
        GROUP BY hcp_id
        """
    )

    con.execute(
        """
        CREATE TEMP TABLE primary_place_of_service_per_hcp AS
        SELECT hcp_id, place_of_service AS primary_place_of_service
        FROM (
          SELECT
            hcp_id,
            place_of_service,
            pos_services,
            ROW_NUMBER() OVER (
              PARTITION BY hcp_id
              ORDER BY pos_services DESC NULLS LAST
            ) AS rn
          FROM (
            SELECT
              hcp_id,
              place_of_service,
              SUM(COALESCE(total_services, 0)) AS pos_services
            FROM filtered_medicare
            WHERE place_of_service IS NOT NULL
            GROUP BY hcp_id, place_of_service
          ) pos_agg
        ) ranked_pos
        WHERE rn = 1
        """
    )

    summary_raw = rows_to_dicts(
        con.execute(
            """
            SELECT
              m.hcp_id,
              m.total_beneficiaries_3yr,
              m.total_services_3yr,
              m.total_medicare_payment_3yr,
              m.total_distinct_hcpcs_codes_3yr,
              m.beneficiaries_2021,
              m.beneficiaries_2022,
              m.beneficiaries_2023,
              m.services_last_year,
              CASE
                WHEN m.beneficiaries_2021 = 0 THEN NULL
                ELSE ((m.beneficiaries_2023 - m.beneficiaries_2021) * 100.0 / m.beneficiaries_2021)
              END AS beneficiaries_yoy_trend_pct,
              COALESCE(u.total_beneficiaries_3yr_unique_est, 0) AS total_beneficiaries_3yr_unique_est,
              t.top_codes AS top_hcpcs_codes,
              ps.predominant_specialty,
              pst.predominant_state,
              pr.predominant_ruca,
              pos.primary_place_of_service
            FROM medicare_main_agg m
            LEFT JOIN unique_bene_est u ON u.hcp_id = m.hcp_id
            LEFT JOIN top_hcpcs_per_hcp t ON t.hcp_id = m.hcp_id
            LEFT JOIN predominant_specialty_per_hcp ps ON ps.hcp_id = m.hcp_id
            LEFT JOIN predominant_state_per_hcp pst ON pst.hcp_id = m.hcp_id
            LEFT JOIN predominant_ruca_per_hcp pr ON pr.hcp_id = m.hcp_id
            LEFT JOIN primary_place_of_service_per_hcp pos ON pos.hcp_id = m.hcp_id
            """
        )
    )

    enriched_summary: List[Dict[str, Any]] = []
    for r in summary_raw:
        top_codes = _tolist_top_codes(r.get("top_hcpcs_codes"))
        npi_val = hcp_to_npi.get(str(r["hcp_id"]))
        row = {
            "hcp_id": str(r["hcp_id"]),
            "npi": npi_val,
            "total_beneficiaries_3yr": int(r.get("total_beneficiaries_3yr") or 0),
            "total_services_3yr": int(r.get("total_services_3yr") or 0),
            "total_medicare_payment_3yr": float(r.get("total_medicare_payment_3yr") or 0.0),
            "total_distinct_hcpcs_codes_3yr": int(r.get("total_distinct_hcpcs_codes_3yr") or 0),
            "beneficiaries_2021": int(r.get("beneficiaries_2021") or 0),
            "beneficiaries_2022": int(r.get("beneficiaries_2022") or 0),
            "beneficiaries_2023": int(r.get("beneficiaries_2023") or 0),
            "beneficiaries_last_year": int(r.get("beneficiaries_2023") or 0),
            "services_last_year": int(r.get("services_last_year") or 0),
            "beneficiaries_yoy_trend_pct": (
                float(r["beneficiaries_yoy_trend_pct"])
                if r.get("beneficiaries_yoy_trend_pct") is not None
                else None
            ),
            "primary_place_of_service": r.get("primary_place_of_service"),
            "top_hcpcs_codes": top_codes,
            "total_beneficiaries_3yr_unique_est": int(r.get("total_beneficiaries_3yr_unique_est") or 0),
            "predominant_specialty": r.get("predominant_specialty"),
            "predominant_state": r.get("predominant_state"),
            "predominant_ruca": r.get("predominant_ruca"),
        }
        enriched_summary.append(row)

    con.execute(
        """
        CREATE TEMP TABLE primary_matches AS
        SELECT
          fm.hcp_id,
          hc.therapeutic_area_id,
          fm.program_year,
          fm.hcpcs_code,
          hc.code_category,
          fm.total_beneficiaries,
          fm.total_services,
          fm.avg_medicare_payment,
          CAST('primary' AS VARCHAR) AS match_tier
        FROM filtered_medicare fm
        INNER JOIN hcp_ta ht ON ht.hcp_id = fm.hcp_id
        INNER JOIN hcpcs_codes hc
          ON hc.therapeutic_area_id = ht.therapeutic_area_id
         AND hc.hcpcs_code = fm.hcpcs_code
         AND hc.is_primary_signal = TRUE
        WHERE fm.total_beneficiaries IS NOT NULL AND fm.total_beneficiaries > 0
        """
    )

    con.execute(
        """
        CREATE TEMP TABLE specialty_matches AS
        SELECT
          fm.hcp_id,
          hc.therapeutic_area_id,
          fm.program_year,
          fm.hcpcs_code,
          hc.code_category,
          fm.total_beneficiaries,
          fm.total_services,
          fm.avg_medicare_payment,
          CAST('specialty' AS VARCHAR) AS match_tier
        FROM filtered_medicare fm
        INNER JOIN hcp_ta ht ON ht.hcp_id = fm.hcp_id
        INNER JOIN hcpcs_codes hc
          ON hc.therapeutic_area_id = ht.therapeutic_area_id
         AND hc.hcpcs_code = fm.hcpcs_code
         AND hc.requires_specialty_match = TRUE
         AND hc.is_primary_signal = FALSE
        WHERE fm.total_beneficiaries IS NOT NULL AND fm.total_beneficiaries > 0
          AND fm.provider_type IS NOT NULL
          AND EXISTS (
            SELECT 1
            FROM unnest(hc.specialty_match_patterns) AS u(pattern)
            WHERE LOWER(CAST(fm.provider_type AS VARCHAR)) LIKE '%' || LOWER(CAST(pattern AS VARCHAR)) || '%'
          )
        """
    )

    con.execute(
        """
        CREATE TEMP TABLE all_matches AS
        SELECT * FROM primary_matches
        UNION ALL
        SELECT * FROM specialty_matches
        """
    )

    by_ta_query = """
    SELECT
      am.hcp_id,
      am.therapeutic_area_id,
      SUM(am.total_beneficiaries) AS ta_beneficiaries_3yr_high_confidence,
      SUM(COALESCE(am.total_services, 0)) AS ta_services_3yr_high_confidence,
      SUM(am.total_beneficiaries * COALESCE(am.avg_medicare_payment, 0)) AS ta_payments_3yr_high_confidence,
      COUNT(DISTINCT am.hcpcs_code) AS ta_distinct_codes_3yr_high_confidence,
      SUM(CASE WHEN am.code_category = 'drug_admin' THEN COALESCE(am.total_services, 0) ELSE 0 END)
        AS ta_drug_admin_volume_3yr,
      SUM(CASE WHEN am.code_category = 'procedure' THEN COALESCE(am.total_services, 0) ELSE 0 END)
        AS ta_procedure_volume_3yr,
      SUM(CASE WHEN am.program_year = 2021 THEN am.total_beneficiaries ELSE 0 END) AS benes_2021,
      SUM(CASE WHEN am.program_year = 2023 THEN am.total_beneficiaries ELSE 0 END) AS benes_2023
    FROM all_matches am
    GROUP BY am.hcp_id, am.therapeutic_area_id
    """

    by_ta_rows_raw = rows_to_dicts(con.execute(by_ta_query))
    by_ta_rows: List[Dict[str, Any]] = []
    for r in by_ta_rows_raw:
        ben1 = int(r.get("benes_2021") or 0)
        ben3 = int(r.get("benes_2023") or 0)
        if ben1 != 0:
            trend = ((ben3 - ben1) / ben1) * 100.0
        else:
            trend = None
        bh = int(round(float(r.get("ta_beneficiaries_3yr_high_confidence") or 0)))
        sh = int(round(float(r.get("ta_services_3yr_high_confidence") or 0)))
        payh = float(r.get("ta_payments_3yr_high_confidence") or 0)
        dh = int(r.get("ta_distinct_codes_3yr_high_confidence") or 0)

        row = {
            "hcp_id": str(r["hcp_id"]),
            "therapeutic_area_id": str(r["therapeutic_area_id"]),
            "ta_beneficiaries_3yr_high_confidence": bh,
            "ta_beneficiaries_3yr_total": bh,
            "ta_services_3yr_high_confidence": sh,
            "ta_services_3yr_total": sh,
            "ta_payments_3yr_high_confidence": payh,
            "ta_payments_3yr_total": payh,
            "ta_distinct_codes_3yr_high_confidence": dh,
            "ta_distinct_codes_3yr_total": dh,
            "ta_drug_admin_volume_3yr": int(r.get("ta_drug_admin_volume_3yr") or 0),
            "ta_procedure_volume_3yr": int(r.get("ta_procedure_volume_3yr") or 0),
            "ta_beneficiaries_yoy_trend_pct": trend,
            "calculated_at": datetime.now(timezone.utc).isoformat(),
        }
        by_ta_rows.append(row)

    print(f"Computed {len(enriched_summary)} summary rows, {len(by_ta_rows)} by_ta rows")

    now_iso = datetime.now(timezone.utc).isoformat()

    def summary_row_for_insert(r: Dict[str, Any]) -> Dict[str, Any]:
        trend = r.get("beneficiaries_yoy_trend_pct")
        return {
            "hcp_id": r["hcp_id"],
            "npi": r.get("npi"),
            "total_beneficiaries_3yr": r.get("total_beneficiaries_3yr"),
            "total_beneficiaries_3yr_unique_est": r.get("total_beneficiaries_3yr_unique_est"),
            "total_services_3yr": r.get("total_services_3yr"),
            "total_medicare_payment_3yr": r.get("total_medicare_payment_3yr"),
            "total_distinct_hcpcs_codes_3yr": r.get("total_distinct_hcpcs_codes_3yr"),
            "beneficiaries_2021": r.get("beneficiaries_2021"),
            "beneficiaries_2022": r.get("beneficiaries_2022"),
            "beneficiaries_2023": r.get("beneficiaries_2023"),
            "beneficiaries_yoy_trend_pct": trend,
            "primary_place_of_service": r.get("primary_place_of_service"),
            "predominant_specialty": r.get("predominant_specialty"),
            "predominant_state": r.get("predominant_state"),
            "predominant_ruca": r.get("predominant_ruca"),
            "top_hcpcs_codes": r.get("top_hcpcs_codes") or [],
            "medicare_calculated_at": now_iso,
            "medicare_program_years": PROGRAM_YEARS,
        }

    def by_ta_row_for_insert(r: Dict[str, Any]) -> Dict[str, Any]:
        row = {
            "hcp_id": r["hcp_id"],
            "therapeutic_area_id": r["therapeutic_area_id"],
            "ta_beneficiaries_3yr_high_confidence": int(r["ta_beneficiaries_3yr_high_confidence"]),
            "ta_services_3yr_high_confidence": int(r["ta_services_3yr_high_confidence"]),
            "ta_payments_3yr_high_confidence": r["ta_payments_3yr_high_confidence"],
            "ta_distinct_codes_3yr_high_confidence": int(r["ta_distinct_codes_3yr_high_confidence"]),
            "ta_beneficiaries_3yr_total": int(r["ta_beneficiaries_3yr_total"]),
            "ta_services_3yr_total": int(r["ta_services_3yr_total"]),
            "ta_payments_3yr_total": r["ta_payments_3yr_total"],
            "ta_distinct_codes_3yr_total": int(r["ta_distinct_codes_3yr_total"]),
            "ta_drug_admin_volume_3yr": int(r["ta_drug_admin_volume_3yr"]),
            "ta_procedure_volume_3yr": int(r["ta_procedure_volume_3yr"]),
            "ta_beneficiaries_yoy_trend_pct": r.get("ta_beneficiaries_yoy_trend_pct"),
        }
        ts_val = r.get("calculated_at") or now_iso
        if target_version == "v2":
            row["aggregated_at"] = ts_val
        else:
            row["calculated_at"] = ts_val
        return row

    summary_insert_payload = [summary_row_for_insert(r) for r in enriched_summary]
    by_ta_insert_payload = [by_ta_row_for_insert(r) for r in by_ta_rows]

    summary_by_hcp = {r["hcp_id"]: r for r in enriched_summary}
    by_ta_index = {(r["hcp_id"], r["therapeutic_area_id"]): r for r in by_ta_rows}

    hcp_with_summary = len(enriched_summary)
    hcp_with_by_ta = len({r["hcp_id"] for r in by_ta_rows})

    bene_buckets: Counter[str] = Counter()
    for r in enriched_summary:
        bene_buckets[bucket_total_beneficiaries(r.get("total_beneficiaries_3yr"))] += 1

    ta_row_counts: Counter[str] = Counter()
    ta_beneficiaries_values: Dict[str, List[float]] = {}
    for r in by_ta_rows:
        tname = ta_name_by_id.get(r["therapeutic_area_id"], r["therapeutic_area_id"])
        ta_row_counts[tname] += 1
        ta_beneficiaries_values.setdefault(tname, []).append(float(r["ta_beneficiaries_3yr_high_confidence"]))

    per_ta_stats: Dict[str, Dict[str, Any]] = {}
    for name, vals in ta_beneficiaries_values.items():
        if not vals:
            per_ta_stats[name] = {"mean": None, "median": None, "rows": 0}
        else:
            per_ta_stats[name] = {
                "mean": statistics.fmean(vals),
                "median": statistics.median(vals),
                "rows": len(vals),
            }

    level_1_stats = {
        "hcp_count_summary_rows": hcp_with_summary,
        "hcp_count_with_by_ta_rows": hcp_with_by_ta,
        "total_beneficiaries_3yr_buckets": dict(bene_buckets),
        "by_ta_row_count": dict(ta_row_counts),
        "by_ta_ta_beneficiaries_mean_median_high_confidence": per_ta_stats,
    }
    print("Level 1 stats:", json.dumps(level_1_stats, indent=2))

    level_2_canonicals: List[Dict[str, Any]] = []
    for c in CANONICALS:
        entry: Dict[str, Any] = {
            "label": c["label"],
            "hcp_id": c["hcp_id"],
            "expected_ta": c["expected_ta"],
            "summary_exists": False,
            "expected_ta_row_exists": False,
            "summary_metrics": None,
            "expected_ta_row_metrics": None,
            "expected_ta_beneficiaries_3yr_high_confidence": None,
            "top_10_hcpcs_codes": None,
            "predominant_specialty": None,
            "error": None,
        }
        try:
            s = summary_by_hcp.get(c["hcp_id"])
            if s:
                entry["summary_exists"] = True
                entry["summary_metrics"] = {
                    "total_beneficiaries_3yr": s.get("total_beneficiaries_3yr"),
                    "total_services_3yr": s.get("total_services_3yr"),
                    "total_medicare_payment_3yr": s.get("total_medicare_payment_3yr"),
                }
                entry["top_10_hcpcs_codes"] = s.get("top_hcpcs_codes")
                entry["predominant_specialty"] = s.get("predominant_specialty")
            ta_id = ta_id_by_name.get(c["expected_ta"])
            if ta_id and (c["hcp_id"], ta_id) in by_ta_index:
                bt = by_ta_index[(c["hcp_id"], ta_id)]
                entry["expected_ta_row_exists"] = True
                entry["expected_ta_row_metrics"] = bt
                entry["expected_ta_beneficiaries_3yr_high_confidence"] = bt.get(
                    "ta_beneficiaries_3yr_high_confidence"
                )
            else:
                entry["expected_ta_row_metrics"] = None
        except Exception as exc:
            entry["error"] = repr(exc)
            errors.append(f"canonical_validation_{c['label']}: {repr(exc)}")
        print(f"Canonical {c['label']}: ", json.dumps(entry, indent=2, default=str))

        level_2_canonicals.append(entry)

    level_3_unmatched: Dict[str, List[Dict[str, Any]]] = {}
    for ta_id, ta_name in ta_name_by_id.items():
        q = f"""
        SELECT
          fm.hcpcs_code,
          SUM(fm.total_beneficiaries) AS total_beneficiaries
        FROM filtered_medicare fm
        INNER JOIN hcp_ta ht
          ON ht.hcp_id = fm.hcp_id
         AND ht.therapeutic_area_id = {sql_literal(ta_id)}
        LEFT JOIN hcpcs_codes hc
          ON hc.therapeutic_area_id = {sql_literal(ta_id)}
         AND hc.hcpcs_code = fm.hcpcs_code
        WHERE fm.hcpcs_code IS NOT NULL AND CAST(fm.hcpcs_code AS VARCHAR) <> ''
          AND hc.hcpcs_code IS NULL
        GROUP BY fm.hcpcs_code
        ORDER BY SUM(fm.total_beneficiaries) DESC NULLS LAST
        LIMIT 50
        """
        rows_um = rows_to_dicts(con.execute(q))
        level_3_unmatched[ta_name] = [
            {
                "hcpcs_code": r.get("hcpcs_code"),
                "total_beneficiaries": int(r.get("total_beneficiaries") or 0),
            }
            for r in rows_um
        ]
        print(f"Top unmatched HCPCS for {ta_name} (showing up to {len(rows_um)})")
        for row in level_3_unmatched[ta_name]:
            print(f"  {row['hcpcs_code']}: benes={row['total_beneficiaries']}")

    rows_inserted: Optional[Dict[str, int]] = None

    if not execute:
        print("[DRY-RUN] Skipping Supabase write.")
    else:
        if target_version == "v2":
            confirm = input(
                "About to UPSERT to hcp_medicare_summary_v2 and hcp_medicare_by_ta_v2.\n"
                f"Will write {len(summary_insert_payload)} summary rows and "
                f"{len(by_ta_insert_payload)} by_ta rows. Continue? (yes/no): "
            )
        else:
            confirm = input(
                "About to TRUNCATE and rewrite hcp_medicare_summary and hcp_medicare_by_ta.\n"
                f"Will write {len(summary_insert_payload)} summary rows and {len(by_ta_insert_payload)} by_ta rows. Continue? (yes/no): "
            )
        if confirm != "yes":
            print("Execution cancelled.")
            errors.append("execute_cancelled_by_user")
        else:
            inserted_summary = 0
            inserted_by_ta = 0
            summary_table = get_table_name("hcp_medicare_summary", target_version)
            by_ta_table = get_table_name("hcp_medicare_by_ta", target_version)

            if target_version == "v1":
                try:
                    trunc_summary_resp = (
                        client.table(summary_table).delete().neq("id", DELETE_GUARD_ID).execute()
                    )
                    trunc_summary_count = len(trunc_summary_resp.data or [])
                    print(f"Truncated hcp_medicare_summary ({trunc_summary_count})")
                except Exception as exc:
                    errors.append(f"truncate_summary: {repr(exc)}")
                    print(f"Truncate summary failed: {exc}")

            try:
                for start_idx in range(0, len(summary_insert_payload), WRITE_BATCH_SIZE):
                    batch = summary_insert_payload[start_idx : start_idx + WRITE_BATCH_SIZE]
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
                            f"({inserted_summary}/{len(summary_insert_payload)})"
                        )
                    except Exception as exc:
                        errors.append(f"summary_insert_batch_{start_idx}: {repr(exc)}")
                        print(f"Summary batch failed at offset {start_idx}: {exc}")
            except Exception as exc:
                errors.append(f"summary_insert_fatal: {repr(exc)}")
                print(f"Summary insert aborted: {exc}")

            if target_version == "v1":
                try:
                    trunc_by_ta_resp = (
                        client.table(by_ta_table).delete().neq("id", DELETE_GUARD_ID).execute()
                    )
                    trunc_by_ta_count = len(trunc_by_ta_resp.data or [])
                    print(f"Truncated hcp_medicare_by_ta ({trunc_by_ta_count})")
                except Exception as exc:
                    errors.append(f"truncate_by_ta: {repr(exc)}")
                    print(f"Truncate by_ta failed: {exc}")

            try:
                for start_idx in range(0, len(by_ta_insert_payload), WRITE_BATCH_SIZE):
                    batch = by_ta_insert_payload[start_idx : start_idx + WRITE_BATCH_SIZE]
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
                            f"({inserted_by_ta}/{len(by_ta_insert_payload)})"
                        )
                    except Exception as exc:
                        errors.append(f"by_ta_insert_batch_{start_idx}: {repr(exc)}")
                        print(f"by_ta batch failed at offset {start_idx}: {exc}")
            except Exception as exc:
                errors.append(f"by_ta_insert_fatal: {repr(exc)}")
                print(f"By_ta insert aborted: {exc}")

            rows_inserted = {
                "summary_rows_inserted": inserted_summary,
                "by_ta_rows_inserted": inserted_by_ta,
            }
            print(
                f"Execute complete. Inserted summary={inserted_summary}/{len(summary_insert_payload)}, "
                f"by_ta={inserted_by_ta}/{len(by_ta_insert_payload)}"
            )

    elapsed_seconds = time.time() - started
    log_payload: Dict[str, Any] = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "mode": mode,
        "elapsed_seconds": elapsed_seconds,
        "cohort_size": len(npi_set),
        "filtered_medicare_rows": fm_count,
        "summary_rows_computed": len(enriched_summary),
        "by_ta_rows_computed": len(by_ta_rows),
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
