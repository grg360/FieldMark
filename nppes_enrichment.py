import argparse
import json
import os
import random
import time
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

import duckdb
from dotenv import load_dotenv
from supabase import Client, create_client


INDIVIDUALS_PARQUET_PATH = r"C:\Users\garre\Desktop\FieldMark\NPPES\nppes_individual_providers.parquet"
ORGANIZATIONS_PARQUET_PATH = r"C:\Users\garre\Desktop\FieldMark\NPPES\nppes_organizations.parquet"
OUTPUT_LOG_PATH = r"C:\Users\garre\Desktop\FieldMark\nppes_enrichment_log.json"
PAGE_SIZE = 1000
WRITE_BATCH_SIZE = 500

NAME_PATTERN_REGEX = (
    "(HEALTH SYSTEM|MEDICAL CENTER|HOSPITAL|UNIVERSITY OF|REGIONAL|CLINIC NETWORK|HEALTHCARE SYSTEM)"
)

CANONICALS = [
    {"label": "Loomba", "hcp_id": "9339ead6-2023-4e69-9eda-2914553a2e20"},
    {"label": "Garassino", "hcp_id": "dc645bf0-b7e0-4c3c-9aaf-9e7bc35d6331"},
    {"label": "Chalasani", "hcp_id": "6f9dd309-bd67-4260-a9c2-8a22129f988c"},
]


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--execute", action="store_true", default=False)
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
) -> List[Dict[str, Any]]:
    rows: List[Dict[str, Any]] = []
    offset = 0
    page_size = PAGE_SIZE
    while True:
        try:
            q = client.table(table).select(columns).order("id").range(offset, offset + page_size - 1)
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


def fetch_first_publication_year_per_hcp(client: Client) -> Dict[str, int]:
    """
    Returns mapping of hcp_id -> earliest publication_year for HCPs that
    have publications. Uses Postgres aggregation via the supabase client.
    """
    # Use the Supabase rpc-like pattern via direct query through PostgREST.
    # Fetch all publications with hcp_id and publication_year, paginated.
    rows: List[Dict[str, Any]] = []
    offset = 0
    page_size = 200
    while True:
        try:
            batch = (
                client.table("publications")
                .select("hcp_id,pub_year")
                .not_.is_("hcp_id", "null")
                .not_.is_("pub_year", "null")
                .range(offset, offset + page_size - 1)
                .execute()
                .data
                or []
            )
        except Exception:
            if page_size > 100:
                page_size = 100
                continue
            raise
        if not batch:
            break
        rows.extend(batch)
        if len(batch) < page_size:
            break
        offset += page_size

    # Aggregate to min publication_year per hcp_id
    result: Dict[str, int] = {}
    for row in rows:
        hcp_id = str(row.get("hcp_id") or "")
        year = row.get("pub_year")
        if not hcp_id or year is None:
            continue
        try:
            year_int = int(year)
        except (TypeError, ValueError):
            continue
        if year_int < 1950 or year_int > 2030:
            continue  # skip implausible years
        existing = result.get(hcp_id)
        if existing is None or year_int < existing:
            result[hcp_id] = year_int
    return result


def rows_to_dicts(cursor_result: Any) -> List[Dict[str, Any]]:
    cols = [d[0] for d in cursor_result.description]
    out: List[Dict[str, Any]] = []
    for row in cursor_result.fetchall():
        out.append({cols[i]: row[i] for i in range(len(cols))})
    return out


if __name__ == "__main__":
    started = time.time()
    args = parse_args()
    execute = bool(args.execute)
    mode = "execute" if execute else "dry_run"
    errors: List[str] = []

    load_dotenv()
    client = init_supabase()
    con = duckdb.connect()
    con.execute("SET memory_limit = '4GB'")

    # Phase 1: cohort
    hcps_rows = fetch_all_pages(
        client,
        "hcps",
        "id,npi_number,first_name,last_name",
        not_null_column="npi_number",
    )
    cohort_rows = []
    for r in hcps_rows:
        npi = str(r.get("npi_number") or "").strip()
        if not npi:
            continue
        cohort_rows.append(
            {
                "hcp_id": str(r["id"]),
                "npi": npi,
                "first_name": r.get("first_name"),
                "last_name": r.get("last_name"),
            }
        )
    print(f"Cohort size: {len(cohort_rows)}")
    # Fetch first publication year per HCP for career stage fallback
    print("Fetching first publication year per HCP for career stage fallback...")
    first_pub_year_by_hcp = fetch_first_publication_year_per_hcp(client)
    print(f"  HCPs with publication history: {len(first_pub_year_by_hcp)}")

    con.execute(
        """
        CREATE TEMP TABLE cohort (
          hcp_id VARCHAR,
          npi VARCHAR,
          first_name VARCHAR,
          last_name VARCHAR
        )
        """
    )
    con.executemany(
        "INSERT INTO cohort VALUES (?, ?, ?, ?)",
        [(r["hcp_id"], r["npi"], r.get("first_name"), r.get("last_name")) for r in cohort_rows],
    )

    # Phase 2: individuals parquet filtered to cohort NPIs
    con.execute(
        f"""
        CREATE TEMP TABLE individual_filtered AS
        SELECT
          c.hcp_id,
          c.npi,
          trim(i.enumeration_date) AS enumeration_date,
          trim(i.is_sole_proprietor) AS is_sole_proprietor,
          trim(i.practice_address) AS practice_address,
          trim(i.practice_city) AS practice_city,
          trim(i.practice_state) AS practice_state,
          substr(trim(i.practice_zip), 1, 5) AS practice_zip,
          trim(i.taxonomy_1) AS taxonomy_1,
          trim(i.taxonomy_2) AS taxonomy_2,
          trim(i.taxonomy_3) AS taxonomy_3,
          trim(i.taxonomy_4) AS taxonomy_4,
          trim(i.taxonomy_5) AS taxonomy_5
        FROM read_parquet('{INDIVIDUALS_PARQUET_PATH}') i
        INNER JOIN cohort c ON trim(i.npi) = c.npi
        """
    )
    individual_found = int(con.execute("SELECT COUNT(*) FROM individual_filtered").fetchone()[0])
    print(f"HCPs with NPPES individual data found: {individual_found} / {len(cohort_rows)}")

    # Phase 3: organizations parquet
    con.execute(
        f"""
        CREATE TEMP TABLE organizations AS
        SELECT
          trim(npi) AS org_npi,
          trim(organization_name_legal) AS organization_name_legal,
          trim(organization_name_other) AS organization_name_other,
          trim(practice_address) AS practice_address,
          trim(practice_city) AS practice_city,
          trim(practice_state) AS practice_state,
          substr(trim(practice_zip), 1, 5) AS practice_zip,
          trim(taxonomy_1) AS taxonomy_1
        FROM read_parquet('{ORGANIZATIONS_PARQUET_PATH}')
        """
    )
    org_count = int(con.execute("SELECT COUNT(*) FROM organizations").fetchone()[0])
    print(f"Total org count: {org_count}")

    # Phase 4: matching + selection
    con.execute(
        f"""
        CREATE TEMP TABLE org_candidates AS
        SELECT
          i.hcp_id,
          i.npi,
          i.practice_address AS hcp_practice_address,
          i.practice_city AS hcp_practice_city,
          i.practice_state AS hcp_practice_state,
          i.practice_zip AS hcp_practice_zip,
          o.org_npi,
          o.organization_name_legal,
          o.organization_name_other,
          o.practice_address AS org_practice_address,
          o.practice_city AS org_practice_city,
          o.practice_state AS org_practice_state,
          o.practice_zip AS org_practice_zip,
          o.taxonomy_1 AS org_taxonomy_1,
          CASE
            WHEN upper(coalesce(i.practice_address, '')) = upper(coalesce(o.practice_address, ''))
                 AND coalesce(i.practice_address, '') <> '' THEN 'exact_address'
            WHEN upper(coalesce(i.practice_city, '')) = upper(coalesce(o.practice_city, ''))
                 AND coalesce(i.practice_city, '') <> '' THEN 'zip_city'
            ELSE 'zip_only'
          END AS match_quality,
          CASE
            WHEN regexp_matches(
              upper(coalesce(o.organization_name_legal, '') || ' ' || coalesce(o.organization_name_other, '')),
              '{NAME_PATTERN_REGEX}'
            )
            THEN 1 ELSE 0
          END AS name_pattern_match,
          length(
            trim(
              coalesce(nullif(o.organization_name_legal, ''), nullif(o.organization_name_other, ''), '')
            )
          ) AS name_length,
          CASE
            WHEN upper(coalesce(i.practice_address, '')) = upper(coalesce(o.practice_address, ''))
                 AND coalesce(i.practice_address, '') <> '' THEN 3
            WHEN upper(coalesce(i.practice_city, '')) = upper(coalesce(o.practice_city, ''))
                 AND coalesce(i.practice_city, '') <> '' THEN 2
            ELSE 1
          END AS quality_rank
        FROM individual_filtered i
        INNER JOIN organizations o
          ON upper(coalesce(i.practice_state, '')) = upper(coalesce(o.practice_state, ''))
         AND coalesce(i.practice_zip, '') <> ''
         AND i.practice_zip = o.practice_zip
        WHERE
          (
            upper(coalesce(i.practice_city, '')) = upper(coalesce(o.practice_city, ''))
            AND coalesce(i.practice_city, '') <> ''
          )
          OR (
            coalesce(i.practice_address, '') <> ''
            AND coalesce(o.practice_address, '') <> ''
            AND (
              upper(i.practice_address) LIKE '%' || upper(o.practice_address) || '%'
              OR upper(o.practice_address) LIKE '%' || upper(i.practice_address) || '%'
            )
          )
          OR i.practice_zip = o.practice_zip
        """
    )

    con.execute(
        """
        CREATE TEMP TABLE best_org_match AS
        WITH ranked AS (
          SELECT
            oc.*,
            ROW_NUMBER() OVER (
              PARTITION BY oc.hcp_id
              ORDER BY
                oc.quality_rank DESC,
                oc.name_pattern_match DESC,
                CASE WHEN oc.name_length = 0 THEN 999999 ELSE oc.name_length END ASC,
                coalesce(oc.organization_name_legal, oc.organization_name_other, '') ASC
            ) AS rn
          FROM org_candidates oc
        ),
        ambiguity AS (
          SELECT
            hcp_id,
            COUNT(*) AS candidate_count,
            MIN(quality_rank) AS min_quality_rank,
            MAX(quality_rank) AS max_quality_rank,
            MIN(name_pattern_match) AS min_name_pattern_match,
            MAX(name_pattern_match) AS max_name_pattern_match,
            MIN(CASE WHEN name_length = 0 THEN 999999 ELSE name_length END) AS min_name_length,
            MAX(CASE WHEN name_length = 0 THEN 999999 ELSE name_length END) AS max_name_length
          FROM org_candidates
          GROUP BY hcp_id
        )
        SELECT
          r.hcp_id,
          r.org_npi,
          r.organization_name_legal,
          r.organization_name_other,
          r.org_practice_address,
          r.org_practice_city,
          r.org_practice_state,
          r.org_practice_zip,
          r.org_taxonomy_1,
          CASE
            WHEN r.quality_rank = 3
                 AND a.candidate_count >= 3
                 AND a.min_quality_rank = a.max_quality_rank
                 AND a.min_name_pattern_match = a.max_name_pattern_match
                 AND (a.max_name_length - a.min_name_length) <= 3
              THEN 'ambiguous'
            WHEN r.match_quality IS NULL OR r.match_quality = '' THEN 'none'
            ELSE r.match_quality
          END AS selected_match_quality
        FROM ranked r
        LEFT JOIN ambiguity a ON a.hcp_id = r.hcp_id
        WHERE r.rn = 1
        """
    )

    # Phase 5: co-located count
    con.execute(
        """
        CREATE TEMP TABLE colocated AS
        SELECT
          i.hcp_id,
          i.practice_state,
          i.practice_zip,
          i.practice_city,
          CASE
            WHEN coalesce(i.practice_state, '') = '' OR coalesce(i.practice_zip, '') = '' OR coalesce(i.practice_city, '') = ''
              THEN 0
            ELSE GREATEST(
              COUNT(*) OVER (
                PARTITION BY upper(i.practice_state), i.practice_zip, upper(i.practice_city)
              ) - 1,
              0
            )
          END AS co_located_npi_count
        FROM individual_filtered i
        """
    )

    # Phase 6/7 final enrich
    final_rows = rows_to_dicts(
        con.execute(
            """
            SELECT
              c.hcp_id,
              c.npi,
              i.enumeration_date,
              i.is_sole_proprietor,
              i.practice_address,
              i.practice_city,
              i.practice_state,
              i.practice_zip,
              i.taxonomy_1,
              i.taxonomy_2,
              i.taxonomy_3,
              i.taxonomy_4,
              i.taxonomy_5,
              bm.org_npi AS matched_org_npi,
              bm.organization_name_legal AS matched_organization_name_legal,
              bm.organization_name_other AS matched_organization_name_other,
              bm.org_practice_address AS matched_org_practice_address,
              bm.org_practice_city AS matched_org_practice_city,
              bm.org_practice_state AS matched_org_practice_state,
              bm.org_practice_zip AS matched_org_practice_zip,
              bm.org_taxonomy_1 AS matched_org_taxonomy_1,
              coalesce(bm.selected_match_quality, 'none') AS org_match_quality,
              coalesce(col.co_located_npi_count, 0) AS co_located_npi_count
            FROM cohort c
            LEFT JOIN individual_filtered i ON i.hcp_id = c.hcp_id
            LEFT JOIN best_org_match bm ON bm.hcp_id = c.hcp_id
            LEFT JOIN colocated col ON col.hcp_id = c.hcp_id
            """
        )
    )

    today = datetime.now(timezone.utc).date()
    enriched_rows: List[Dict[str, Any]] = []
    for r in final_rows:
        org_name = (r.get("matched_organization_name_legal") or r.get("matched_organization_name_other") or "").upper()
        sole = (r.get("is_sole_proprietor") or "").strip().upper()
        coloc = int(r.get("co_located_npi_count") or 0)

        # Define academic medical center patterns
        AMC_PATTERNS = (
            "UNIVERSITY OF", " UNIVERSITY", "SCHOOL OF MEDICINE",
            "TRUSTEES OF", "REGENTS OF",
            # Major AMC abbreviations
            "UCSD", "UCLA", "UCSF", "USC ", "USC-",
            "MGH", " BWH", "BWH ", "BWH-",
            "MD ANDERSON", "MAYO CLINIC", "MAYO MEDICAL",
            "CLEVELAND CLINIC", "JOHNS HOPKINS",
            "MEMORIAL SLOAN", "DANA-FARBER", "DANA FARBER",
            "FRED HUTCH", "STANFORD", "DUKE UNIVERSITY", "DUKE MEDICAL",
            "VANDERBILT", "EMORY", "NORTHWESTERN", "OHSU", "MUSC",
            " I.U.", "I.U. ", "I.U.-", "INDIANA UNIVERSITY",
            " U.W.", "U.W. ", "WASHINGTON UNIVERSITY",
            " NYU", "NYU ", "NYU-",
            " COLUMBIA UNIV", "COLUMBIA UNIV",
            " UAB", "UAB ", "UAB-",
            "CLARIAN",  # Old name of Indiana University Health
            "PARTNERS HEALTHCARE", "MASS GENERAL",
        )

        # Define hospital/health system patterns (excluding obvious AMCs already caught)
        HOSPITAL_PATTERNS = (
            "HOSPITAL", "MEDICAL CENTER", "HEALTH SYSTEM",
            "HEALTHCARE SYSTEM", "REGIONAL HEALTH",
        )

        # Define group practice patterns
        GROUP_PATTERNS = (
            "GROUP", "ASSOCIATES", "PRACTICE", "P.A.", "PLLC", "LLC", "P.C.",
        )

        has_org_match = (r.get("org_match_quality") or "none") not in ("none", "")

        # Decision order: academic first, then hospital, then group, then sole
        # proprietor (which is a Medicare billing structure, not a practice
        # setting Ã¢â‚¬â€ only relevant when no clear org match exists), then
        # co-located fallback, then unknown.

        if has_org_match and any(p in org_name for p in AMC_PATTERNS):
            practice_setting = "academic_medical_center"
        elif has_org_match and any(p in org_name for p in HOSPITAL_PATTERNS):
            practice_setting = "hospital_affiliated"
        elif has_org_match and any(p in org_name for p in GROUP_PATTERNS):
            practice_setting = "group_practice"
        elif sole == "Y":
            practice_setting = "solo_practice"
        elif not has_org_match and coloc == 1:
            practice_setting = "solo_practice"
        elif not has_org_match and 2 <= coloc <= 10:
            practice_setting = "small_group"
        elif not has_org_match and coloc > 10:
            practice_setting = "ambiguous_group"
        else:
            practice_setting = "unknown"

        years_in_practice: Optional[int] = None
        career_stage = "unknown"
        career_stage_source = None  # tracks whether enumeration_date or publications was used

        date_raw = (r.get("enumeration_date") or "").strip()
        enum_year: Optional[int] = None
        if date_raw:
            parsed = None
            for fmt in ("%Y-%m-%d", "%m/%d/%Y", "%Y%m%d"):
                try:
                    parsed = datetime.strptime(date_raw, fmt).date()
                    break
                except ValueError:
                    continue
            if parsed is not None:
                enum_year = parsed.year
                years_from_enum = max(int((today - parsed).days // 365), 0)
            else:
                years_from_enum = None
        else:
            years_from_enum = None

        # Determine career start year Ã¢â‚¬â€ prefer publications when enumeration looks
        # like an early-adopter case (2005-2007 = NPI system rollout era)
        pub_first_year = first_pub_year_by_hcp.get(r["hcp_id"])

        if enum_year is not None and 2005 <= enum_year <= 2007 and pub_first_year is not None and pub_first_year < enum_year:
            # NPI early adopter with earlier publications Ã¢â‚¬â€ use publications as career proxy
            years_in_practice = max(today.year - pub_first_year, 0)
            career_stage_source = "publications_fallback"
        elif years_from_enum is not None:
            years_in_practice = years_from_enum
            career_stage_source = "enumeration_date"
        elif pub_first_year is not None:
            # No enumeration date at all but has publications
            years_in_practice = max(today.year - pub_first_year, 0)
            career_stage_source = "publications_only"

        if years_in_practice is not None:
            if years_in_practice <= 7:
                career_stage = "early_career"
            elif years_in_practice <= 20:
                career_stage = "mid_career"
            else:
                career_stage = "established"

        # Select organization name: prefer legal, fall back to other
        org_legal = r.get("matched_organization_name_legal") or ""
        org_other = r.get("matched_organization_name_other") or ""
        selected_org_name = org_legal.strip() if org_legal.strip() else (org_other.strip() if org_other.strip() else None)

        enriched = {
            "hcp_id": r["hcp_id"],
            "nppes_enumeration_date": r.get("enumeration_date") or None,
            "nppes_is_sole_proprietor": r.get("is_sole_proprietor") or None,
            "nppes_practice_address": r.get("practice_address") or None,
            "nppes_practice_city": r.get("practice_city") or None,
            "nppes_practice_state": r.get("practice_state") or None,
            "nppes_practice_zip": r.get("practice_zip") or None,
            "nppes_organization_name": selected_org_name,
            "nppes_organization_npi": r.get("matched_org_npi") or None,
            "nppes_organization_match_quality": r.get("org_match_quality") or "none",
            "nppes_co_located_npi_count": coloc,
            "nppes_practice_setting": practice_setting,
            "nppes_career_stage": career_stage,
            "nppes_career_stage_years": years_in_practice,
        }
        enriched_rows.append(enriched)

    # Phase 8 validations
    hcp_with_individual = sum(1 for r in enriched_rows if (r.get("nppes_practice_zip") or ""))
    hcp_with_org = sum(1 for r in enriched_rows if (r.get("nppes_organization_match_quality") or "none") != "none")

    match_quality_counts: Dict[str, int] = {}
    practice_setting_counts: Dict[str, int] = {}
    career_stage_counts: Dict[str, int] = {}
    for r in enriched_rows:
        mq = r.get("nppes_organization_match_quality") or "none"
        ps = r.get("nppes_practice_setting") or "unknown"
        cs = r.get("nppes_career_stage") or "unknown"
        match_quality_counts[mq] = match_quality_counts.get(mq, 0) + 1
        practice_setting_counts[ps] = practice_setting_counts.get(ps, 0) + 1
        career_stage_counts[cs] = career_stage_counts.get(cs, 0) + 1

    level_1_stats = {
        "cohort_size": len(cohort_rows),
        "hcps_with_individual_nppes_fields": hcp_with_individual,
        "hcps_with_org_match": hcp_with_org,
        "hcps_by_match_quality": match_quality_counts,
        "practice_setting_distribution": practice_setting_counts,
        "career_stage_distribution": career_stage_counts,
    }
    print("Level 1 stats:", json.dumps(level_1_stats, indent=2))

    by_hcp_id = {r["hcp_id"]: r for r in enriched_rows}
    level_2_canonicals = []
    for c in CANONICALS:
        record = by_hcp_id.get(c["hcp_id"])
        entry = {"label": c["label"], "hcp_id": c["hcp_id"], "record": record}
        level_2_canonicals.append(entry)
        print(f"Canonical {c['label']}:")
        print(json.dumps(record, indent=2, default=str))

    unknown_rows = [r for r in enriched_rows if (r.get("nppes_practice_setting") or "") == "unknown"]
    rng = random.Random(42)
    if len(unknown_rows) > 10:
        level_3_unknown = rng.sample(unknown_rows, 10)
    else:
        level_3_unknown = unknown_rows
    print("Level 3 unknown practice_setting sample:")
    for r in level_3_unknown:
        print(
            f"{r['hcp_id']} | "
            f"{r.get('nppes_practice_city')} {r.get('nppes_practice_state')} {r.get('nppes_practice_zip')}"
        )

    # Phase 9 execute
    rows_written = {"inserted_count": 0, "updated_count": 0, "errors": 0}
    if not execute:
        print("[DRY-RUN] Skipping Supabase write.")
    else:
        confirm = input(
            f"About to upsert {len(enriched_rows)} hcps rows with NPPES enrichment fields. Continue? (yes/no): "
        )
        if confirm != "yes":
            print("Execution cancelled.")
            errors.append("execute_cancelled_by_user")
        else:
            now_iso = datetime.now(timezone.utc).isoformat()
            payload = []
            for r in enriched_rows:
                row = dict(r)
                # hcps primary key is `id`, not `hcp_id` — rename for upsert
                row["id"] = row.pop("hcp_id")
                row["nppes_enriched_at"] = now_iso
                payload.append(row)

            # PostgREST upsert does INSERT-then-UPDATE which fails not-null
            # constraints on unspecified columns. Use per-row UPDATE instead
            # since these IDs all exist in the database already.
            updates_per_progress = 500
            for idx, row in enumerate(payload):
                row_id = row["id"]
                update_payload = {k: v for k, v in row.items() if k != "id"}
                try:
                    client.table("hcps").update(update_payload).eq("id", row_id).execute()
                    rows_written["updated_count"] += 1
                except Exception as exc:
                    rows_written["errors"] += 1
                    errors.append(f"update_row_{row_id}: {repr(exc)}")
                    print(f"Update failed for {row_id}: {exc}")

                if (idx + 1) % updates_per_progress == 0 or (idx + 1) == len(payload):
                    print(
                        f"Updated {rows_written['updated_count']}/{len(payload)} rows "
                        f"({rows_written['errors']} errors)"
                    )

    elapsed = time.time() - started
    log_payload = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "mode": mode,
        "elapsed_seconds": elapsed,
        "cohort_size": len(cohort_rows),
        "individual_found_count": individual_found,
        "org_count": org_count,
        "level_1_stats": level_1_stats,
        "level_2_canonicals": level_2_canonicals,
        "level_3_unknown_practice_setting_sample": level_3_unknown,
        "rows_written": rows_written if execute else None,
        "errors": errors,
    }

    with open(OUTPUT_LOG_PATH, "w", encoding="utf-8") as f:
        json.dump(log_payload, f, indent=2, default=str)
    print(f"Saved log: {OUTPUT_LOG_PATH}")
