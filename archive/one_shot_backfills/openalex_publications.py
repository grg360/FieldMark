from __future__ import annotations

"""
Publications-only OpenAlex citation backfill.

Loads publications where doi IS NOT NULL AND citation_count IS NULL,
fetches cited_by_count from OpenAlex per DOI, and updates ONLY
publications.citation_count. Does not touch hcps or other columns.

Environment: SUPABASE_URL, SUPABASE_KEY; optional OPENALEX_MAILTO or
PUBMED_EMAIL for polite pool; optional OPENALEX_API_KEY.
"""

import argparse
import json
import os
import time
from pathlib import Path
from typing import Any, Dict, List, Optional, Set, Tuple
from urllib.parse import quote

import requests
from dotenv import load_dotenv
import psycopg
from supabase import Client, create_client

OPENALEX_BASE_URL = "https://api.openalex.org"
FETCH_PAGE_SIZE = 1000
CHECKPOINT_EVERY = 500
PROGRESS_EVERY = 1000
SLEEP_SECONDS = 0.15
DEFAULT_TIMEOUT = (5, 20)
CHECKPOINT_FILENAME = "openalex_publications_checkpoint.json"
EXPECTED_TOTAL_DEFAULT = 199_996


def get_required_env(name: str) -> str:
    value = os.getenv(name)
    if not value:
        raise EnvironmentError(f"Missing required environment variable: {name}")
    return value


def polite_mailto() -> str:
    """Prefer dedicated OpenAlex mailto, then PubMed email, then placeholder."""
    for key in ("OPENALEX_MAILTO", "PUBMED_EMAIL", "CONTACT_EMAIL"):
        v = os.getenv(key, "").strip()
        if v:
            return v
    return "contact@fieldmark.health"


def normalize_doi(doi_value: Optional[str]) -> Optional[str]:
    if not doi_value:
        return None
    doi = doi_value.strip().lower()
    if doi.startswith("https://doi.org/"):
        doi = doi.removeprefix("https://doi.org/")
    elif doi.startswith("http://doi.org/"):
        doi = doi.removeprefix("http://doi.org/")
    elif doi.startswith("doi:"):
        doi = doi.removeprefix("doi:").strip()
    doi = doi.strip()
    return doi or None


def publication_checkpoint_key(row: Dict[str, Any]) -> Optional[str]:
    pmid = row.get("pubmed_id")
    if pmid is not None and str(pmid).strip():
        return f"pmid:{str(pmid).strip()}"
    doi = normalize_doi(row.get("doi"))
    if doi:
        return f"doi:{doi}"
    pub_id = row.get("id")
    if pub_id:
        return f"id:{pub_id}"
    return None


def load_checkpoint(path: Path) -> Set[str]:
    if not path.is_file():
        return set()
    try:
        with path.open("r", encoding="utf-8") as f:
            data = json.load(f)
    except (json.JSONDecodeError, OSError) as exc:
        print(f"[WARN] Could not read checkpoint {path}: {exc}; starting fresh.")
        return set()
    keys = data.get("processed_keys")
    if isinstance(keys, list):
        return {str(k) for k in keys if k is not None}
    return set()


def save_checkpoint(path: Path, keys: Set[str]) -> None:
    payload = {"processed_keys": sorted(keys)}
    try:
        with path.open("w", encoding="utf-8") as f:
            json.dump(payload, f, indent=0)
    except OSError as exc:
        print(f"[WARN] Failed to write checkpoint {path}: {exc}")


def build_http_session(mailto: str) -> requests.Session:
    session = requests.Session()
    session.mount("https://", requests.adapters.HTTPAdapter(max_retries=0))
    session.mount("http://", requests.adapters.HTTPAdapter(max_retries=0))
    session.headers.update({"User-Agent": f"FieldMark/1.0 (mailto:{mailto})"})
    return session


def init_supabase() -> Client:
    return create_client(get_required_env("SUPABASE_URL"), get_required_env("SUPABASE_KEY"))


def fetch_publications_need_citations(supabase: Client) -> List[Dict[str, Any]]:
    rows: List[Dict[str, Any]] = []
    offset = 0
    while True:
        try:
            response = (
                supabase.table("publications")
                .select("id,doi,pubmed_id,citation_count")
                .not_.is_("doi", "null")
                .is_("citation_count", "null")
                .range(offset, offset + FETCH_PAGE_SIZE - 1)
                .execute()
            )
        except Exception as exc:
            raise RuntimeError(f"Failed loading publications at offset {offset}: {exc}") from exc
        batch = response.data or []
        if not batch:
            break
        for row in batch:
            doi = normalize_doi(row.get("doi"))
            if doi:
                row["doi"] = doi
                rows.append(row)
        if len(batch) < FETCH_PAGE_SIZE:
            break
        offset += FETCH_PAGE_SIZE
    return rows


def fetch_openalex_work_by_doi(
    session: requests.Session,
    doi: str,
    mailto: str,
) -> Tuple[Optional[Dict[str, Any]], str]:
    """
    Returns (work_dict_or_none, reason).
    reason: ok | 404 | 429 | bad_json | network | empty
    """
    encoded_doi = quote(doi, safe="")
    url = f"{OPENALEX_BASE_URL}/works/https://doi.org/{encoded_doi}"
    params: Dict[str, str] = {"mailto": mailto}

    last_error = "network"
    for attempt in range(2):
        try:
            response = session.get(url, params=params, timeout=DEFAULT_TIMEOUT)
            if response.status_code == 404:
                return None, "404"
            if response.status_code == 429:
                if attempt == 0:
                    time.sleep(5.0)
                    continue
                return None, "429"
            response.raise_for_status()
            try:
                payload = response.json()
            except ValueError:
                print(f"[WARN] Malformed JSON for DOI {doi!r}")
                return None, "bad_json"
            if not isinstance(payload, dict):
                return None, "bad_json"
            return payload, "ok"
        except requests.RequestException as exc:
            last_error = f"network:{exc}"
            if attempt == 0:
                time.sleep(0.5)
                continue
            print(f"[WARN] Network error for DOI {doi!r} after retry: {exc}")
            return None, "network"

    return None, last_error


def extract_cited_by_count(work_payload: Optional[Dict[str, Any]]) -> Optional[int]:
    if not work_payload:
        return None
    value = work_payload.get("cited_by_count")
    if value is None:
        return None
    try:
        parsed = int(value)
    except (TypeError, ValueError):
        return None
    return max(0, parsed)


def update_citation_count_by_doi(conn: psycopg.Connection, doi: str, citation_count: int) -> int:
    try:
        with conn.cursor() as cur:
            cur.execute(
                "UPDATE publications SET citation_count = %s WHERE doi = %s",
                (citation_count, doi),
            )
            rows_affected = cur.rowcount
            print(
                f"[DEBUG_WRITE] doi={doi} cit={citation_count} rowcount={rows_affected}",
                flush=True,
            )
            conn.commit()
            if rows_affected == 0:
                print(
                    f"[WARN] 0 rows updated for doi={doi}",
                    flush=True,
                )
                return 0
            return rows_affected
    except Exception as exc:
        conn.rollback()
        print(f"[WARN] DB update failed for doi={doi}: {exc}", flush=True)
        return 0


def run_publications_only(
    conn: psycopg.Connection,
    checkpoint_path: Path,
    progress_total: int,
    reset_checkpoint: bool,
) -> None:
    load_dotenv()
    mailto = polite_mailto()
    supabase = init_supabase()
    session = build_http_session(mailto)

    if reset_checkpoint and checkpoint_path.is_file():
        checkpoint_path.unlink(missing_ok=True)
        print(f"Removed checkpoint file {checkpoint_path}.")

    processed_keys = load_checkpoint(checkpoint_path)
    print(f"Loaded checkpoint: {len(processed_keys)} keys already processed.")

    print("Loading publications (doi NOT NULL, citation_count NULL)...")
    all_rows = fetch_publications_need_citations(supabase)
    queue: List[Dict[str, Any]] = []
    for row in all_rows:
        key = publication_checkpoint_key(row)
        if not key or key in processed_keys:
            continue
        queue.append(row)

    total_queued = len(queue)
    denominator = progress_total if progress_total > 0 else max(total_queued, 1)
    rows_by_doi: Dict[str, List[Dict[str, Any]]] = {}
    for row in queue:
        doi = row.get("doi")
        if not doi:
            continue
        rows_by_doi.setdefault(str(doi), []).append(row)
    total_unique_dois = len(rows_by_doi)
    print(
        f"Queued {total_queued} publications across {total_unique_dois} unique DOIs "
        f"(denominator for progress: {denominator})."
    )

    updated = 0
    skipped = 0
    since_checkpoint = 0
    processed_this_run = 0
    t0 = time.time()

    for idx, (doi, doi_rows) in enumerate(rows_by_doi.items(), start=1):
        sample_key = doi_rows[0].get("pubmed_id")
        print(
            f"DEBUG: Processing DOI group {idx}/{total_unique_dois}: doi={doi} sample_pubmed_id={sample_key}",
            flush=True,
        )

        work, reason = fetch_openalex_work_by_doi(session, doi, mailto)
        print(
            f"[DEBUG_FETCH] doi={doi} reason={reason} "
            f"work_keys={list(work.keys()) if work else None}",
            flush=True,
        )
        citations = extract_cited_by_count(work)
        print(f"[DEBUG_EXTRACT] citations={citations}", flush=True)

        if reason == "404" or reason == "bad_json":
            skipped += len(doi_rows)
        elif citations is None:
            skipped += len(doi_rows)
        else:
            rows_updated = update_citation_count_by_doi(conn, doi, citations)
            if rows_updated > 0:
                updated += rows_updated
            else:
                skipped += len(doi_rows)

        for row in doi_rows:
            ck = publication_checkpoint_key(row)
            if ck:
                processed_keys.add(ck)
                since_checkpoint += 1
            processed_this_run += 1

        if since_checkpoint >= CHECKPOINT_EVERY:
            save_checkpoint(checkpoint_path, processed_keys)
            since_checkpoint = 0

        if processed_this_run > 0 and processed_this_run % PROGRESS_EVERY == 0:
            print(
                f"Processed {processed_this_run}/{denominator} publications, "
                f"{updated} citation_counts updated, {skipped} skipped",
                flush=True,
            )

        time.sleep(1.0)

    if since_checkpoint > 0:
        save_checkpoint(checkpoint_path, processed_keys)

    elapsed = time.time() - t0
    print("\n=== OpenAlex publications-only summary ===")
    print(f"Publications attempted this run: {processed_this_run}")
    print(f"Citation counts updated: {updated}")
    print(f"Skipped (404, no count, DB error, malformed DOI, etc.): {skipped}")
    print(f"Checkpoint keys total: {len(processed_keys)}")
    print(f"Elapsed: {elapsed / 3600:.2f} h")
    print("This script does not read or write the hcps table.")


def main() -> None:
    load_dotenv()
    parser = argparse.ArgumentParser(description="OpenAlex citation_count backfill for publications only.")
    parser.add_argument(
        "--checkpoint",
        type=Path,
        default=Path(CHECKPOINT_FILENAME),
        help=f"Checkpoint JSON path (default: {CHECKPOINT_FILENAME})",
    )
    parser.add_argument(
        "--progress-total",
        type=int,
        default=EXPECTED_TOTAL_DEFAULT,
        help="Denominator shown in progress lines (default: 199996).",
    )
    parser.add_argument(
        "--reset-checkpoint",
        action="store_true",
        help="Delete checkpoint file before run.",
    )
    args = parser.parse_args()
    conn: Optional[psycopg.Connection] = None
    try:
        conn = psycopg.connect(get_required_env("DATABASE_URL"))
        run_publications_only(
            conn=conn,
            checkpoint_path=args.checkpoint.resolve(),
            progress_total=args.progress_total,
            reset_checkpoint=args.reset_checkpoint,
        )
    finally:
        if conn is not None:
            conn.close()


if __name__ == "__main__":
    try:
        main()
    except Exception as err:
        print(f"[ERROR] openalex_publications failed: {err}")
        raise
