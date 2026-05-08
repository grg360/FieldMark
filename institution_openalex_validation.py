import json
import os
import random
import time
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

import psycopg
from dotenv import load_dotenv
from psycopg.rows import dict_row


OUTPUT_LOG_PATH = r"C:\Users\garre\Desktop\FieldMark\institution_openalex_validation_log.json"
SAMPLE_SIZE = 50


def get_required_env(name: str) -> str:
    value = os.getenv(name)
    if not value:
        raise EnvironmentError(f"Missing required environment variable: {name}")
    return value


def fetch_noisy_hcps(database_url: str) -> List[Dict[str, Any]]:
    sql = """
        SELECT
          h.id,
          h.first_name,
          h.last_name,
          h.openalex_author_id,
          h.institution,
          h.country
        FROM hcps h
        WHERE h.openalex_author_id IS NOT NULL
          AND h.institution IS NOT NULL
          AND (
            h.institution ILIKE 'department of%%'
            OR h.institution ILIKE 'division of%%'
            OR LENGTH(h.institution) > 100
          )
        ORDER BY h.id
        LIMIT 50 OFFSET 0;
    """
    rows: List[Dict[str, Any]] = []
    with psycopg.connect(database_url, row_factory=dict_row) as conn:
        with conn.cursor() as cur:
            cur.execute("SET statement_timeout = 0")
            cur.execute(sql)
            for row in cur:
                row_dict = dict(row)
                row_dict["id"] = str(row_dict.get("id"))
                rows.append(row_dict)
    return rows


def fetch_most_recent_publication(database_url: str, hcp_id: str) -> Optional[Dict[str, Any]]:
    sql = """
        SELECT
          p.id AS publication_id,
          p.pub_year,
          p.title,
          p.authorships
        FROM publication_authors pa
        JOIN publications p ON p.id = pa.publication_id
        WHERE pa.hcp_id = %s
        ORDER BY p.pub_year DESC NULLS LAST, p.id DESC
        LIMIT 1;
    """
    with psycopg.connect(database_url, row_factory=dict_row) as conn:
        with conn.cursor() as cur:
            cur.execute("SET statement_timeout = 0")
            cur.execute(sql, (hcp_id,))
            row = cur.fetchone()
            if not row:
                return None
            out = dict(row)
            out["publication_id"] = str(out.get("publication_id"))
            return out


def parse_authorships(authorships_raw: Any) -> List[Dict[str, Any]]:
    if isinstance(authorships_raw, list):
        return [x for x in authorships_raw if isinstance(x, dict)]
    if isinstance(authorships_raw, str):
        try:
            parsed = json.loads(authorships_raw)
        except json.JSONDecodeError:
            return []
        if isinstance(parsed, list):
            return [x for x in parsed if isinstance(x, dict)]
    return []


def normalize_openalex_author_id(value: Any) -> str:
    s = str(value or "").strip()
    if not s:
        return ""
    if s.startswith("https://openalex.org/"):
        return s
    return f"https://openalex.org/{s.split('/')[-1]}"


def find_hcp_institutions(authorships: List[Dict[str, Any]], openalex_author_id: str) -> List[Dict[str, Any]]:
    target = normalize_openalex_author_id(openalex_author_id)
    if not target:
        return []
    for authorship in authorships:
        author = authorship.get("author")
        if not isinstance(author, dict):
            continue
        author_id = normalize_openalex_author_id(author.get("id"))
        if author_id != target:
            continue
        institutions = authorship.get("institutions") or []
        if isinstance(institutions, list):
            return [inst for inst in institutions if isinstance(inst, dict)]
        return []
    return []


def main() -> None:
    started = time.time()
    random.seed(42)
    load_dotenv()
    database_url = get_required_env("DATABASE_URL")

    hcps = fetch_noisy_hcps(database_url)
    total_analyzed = len(hcps)

    has_recent_publication = 0
    has_structured_institution = 0
    has_institution_with_ror = 0
    has_institution_with_country_code = 0
    errors: List[str] = []
    results: List[Dict[str, Any]] = []

    for hcp in hcps:
        row: Dict[str, Any] = {
            "hcp_id": hcp.get("id"),
            "first_name": hcp.get("first_name"),
            "last_name": hcp.get("last_name"),
            "openalex_author_id": hcp.get("openalex_author_id"),
            "hcp_institution": hcp.get("institution"),
            "hcp_country": hcp.get("country"),
            "publication_id": None,
            "pub_year": None,
            "title": None,
            "has_recent_publication": False,
            "has_structured_institution": False,
            "openalex_institutions": [],
            "error": None,
        }
        try:
            most_recent = fetch_most_recent_publication(database_url, str(hcp.get("id")))
            if not most_recent:
                results.append(row)
                continue

            has_recent_publication += 1
            row["has_recent_publication"] = True
            row["publication_id"] = most_recent.get("publication_id")
            row["pub_year"] = most_recent.get("pub_year")
            row["title"] = most_recent.get("title")

            authorships = parse_authorships(most_recent.get("authorships"))
            institutions = find_hcp_institutions(authorships, hcp.get("openalex_author_id"))
            if institutions:
                has_structured_institution += 1
                row["has_structured_institution"] = True

                extracted: List[Dict[str, Any]] = []
                for inst in institutions:
                    inst_row = {
                        "openalex_institution_id": inst.get("id"),
                        "display_name": inst.get("display_name"),
                        "country_code": inst.get("country_code"),
                        "ror": inst.get("ror"),
                        "type": inst.get("type"),
                    }
                    extracted.append(inst_row)
                row["openalex_institutions"] = extracted

                first_inst = extracted[0] if extracted else {}
                if first_inst.get("ror"):
                    has_institution_with_ror += 1
                if first_inst.get("country_code"):
                    has_institution_with_country_code += 1

        except Exception as exc:
            row["error"] = repr(exc)
            errors.append(f'hcp_{hcp.get("id")}: {repr(exc)}')

        results.append(row)

    def pct(n: int) -> float:
        return (n / total_analyzed * 100.0) if total_analyzed > 0 else 0.0

    print("Coverage breakdown:")
    print(f"  HCPs analyzed: {total_analyzed}")
    print(f"  Has recent publication: {has_recent_publication}/{total_analyzed} ({pct(has_recent_publication):.1f}%)")
    print(
        f"  Has structured institution in authorships: "
        f"{has_structured_institution}/{total_analyzed} ({pct(has_structured_institution):.1f}%)"
    )
    print(
        f"  Has institution with ROR ID: "
        f"{has_institution_with_ror}/{total_analyzed} ({pct(has_institution_with_ror):.1f}%)"
    )
    print(
        f"  Has institution with country_code: "
        f"{has_institution_with_country_code}/{total_analyzed} ({pct(has_institution_with_country_code):.1f}%)"
    )
    print("")

    sample_size = min(10, len(results))
    sample_rows = random.sample(results, sample_size) if sample_size > 0 else []
    print("Sample (10 random):")
    for row in sample_rows:
        first_inst = row["openalex_institutions"][0] if row["openalex_institutions"] else {}
        noisy = str(row.get("hcp_institution") or "")
        noisy_short = (noisy[:80] + "...") if len(noisy) > 80 else noisy
        print(f'  HCP: {row.get("first_name") or ""} {row.get("last_name") or ""}'.strip())
        print(f'  Hcps.institution (noisy): "{noisy_short}"')
        print(f'  Most recent pub year: {row.get("pub_year") if row.get("pub_year") is not None else ""}')
        print(f'  OpenAlex institution: "{first_inst.get("display_name") or ""}"')
        print(f'  Country: {first_inst.get("country_code") or ""}')
        print(f'  ROR ID: {first_inst.get("ror") or "none"}')
        print("")

    elapsed_seconds = time.time() - started
    log_payload = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "elapsed_seconds": elapsed_seconds,
        "results": results,
        "summary": {
            "hcps_analyzed": total_analyzed,
            "has_recent_publication": has_recent_publication,
            "has_structured_institution_in_authorships": has_structured_institution,
            "has_institution_with_ror_id": has_institution_with_ror,
            "has_institution_with_country_code": has_institution_with_country_code,
        },
        "errors": errors,
    }
    with open(OUTPUT_LOG_PATH, "w", encoding="utf-8") as f:
        json.dump(log_payload, f, indent=2)
    print(f"Saved log: {OUTPUT_LOG_PATH}")


if __name__ == "__main__":
    main()
