from __future__ import annotations

"""
FieldMark OpenAlex pipeline: DOI citation enrichment and HCP career publication counts.

1) For each publication with a DOI and no openalex_enriched_at yet, batch-fetch OpenAlex work
   metadata and update citation_count plus related OpenAlex fields.
2) For each HCP (optionally only those without total_career_pubs), search OpenAlex authors
   by name; on a confident match, store works_count as total_career_pubs on hcps.

Environment: SUPABASE_URL, SUPABASE_KEY, PUBMED_EMAIL (polite pool mailto for OpenAlex).
"""

import argparse
import json
import logging
import os
import re
import time
from dataclasses import dataclass
from datetime import datetime, timezone
from difflib import SequenceMatcher
from pathlib import Path
from typing import Dict, List, Optional, Sequence, Set

import requests
from dotenv import load_dotenv
from supabase import Client, create_client

# ============================================================
# Table routing (v1 vs v2)
# ============================================================

def get_table_name(base_name: str, target_version: str) -> str:
    """
    Returns the correct table name based on --target-version flag.
    v1 returns base_name unchanged. v2 appends _v2 suffix.
    """
    if target_version == "v2":
        return f"{base_name}_v2"
    return base_name


OPENALEX_BASE_URL = "https://api.openalex.org"
FETCH_PAGE_SIZE = 1000
PROGRESS_EVERY = 100
SLEEP_SECONDS = 0.2
DEFAULT_TIMEOUT_SECONDS = 20
AUTHOR_MATCH_SCORE_THRESHOLD = 0.75

BATCH_SIZE = 100  # OpenAlex's max OR values per filter
BATCH_SLEEP_SECONDS = 0.0  # No sleep with OpenAlex API key (well under 100 req/sec limit)
CHECKPOINT_FILE_V1 = "openalex_checkpoint_v1.json"
CHECKPOINT_FILE_V2 = "openalex_checkpoint_v2.json"


def get_checkpoint_file(target_version: str) -> str:
    """Returns the appropriate checkpoint filename for the target schema version."""
    if target_version == "v2":
        return CHECKPOINT_FILE_V2
    return CHECKPOINT_FILE_V1


CHECKPOINT_EVERY_N_BATCHES = 10
PROGRESS_EVERY_N_BATCHES = 10

logger = logging.getLogger(__name__)


@dataclass
class PipelineStats:
    total_loaded: int = 0
    processed: int = 0
    updated: int = 0
    unchanged: int = 0
    not_found_or_missing_citations: int = 0
    failed: int = 0


def get_required_env(name: str) -> str:
    value = os.getenv(name)
    if not value:
        raise EnvironmentError(f"Missing required environment variable: {name}")
    return value


def env_flag_true(name: str) -> bool:
    value = os.getenv(name, "").strip().lower()
    return value in {"1", "true", "yes", "y", "on"}


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


def normalize_name_key(value: Optional[str]) -> str:
    if not value:
        return ""
    value = re.sub(r"[^A-Za-z\s\-']", " ", value).strip()
    return " ".join(value.split()).strip().lower()


def build_http_session() -> requests.Session:
    session = requests.Session()
    session.mount("https://", requests.adapters.HTTPAdapter(max_retries=0))
    session.mount("http://", requests.adapters.HTTPAdapter(max_retries=0))
    session.headers.update({"User-Agent": "FieldMark/1.0 (mailto:garrett.groesbeck@gmail.com)"})
    return session


def init_supabase() -> Client:
    supabase_url = get_required_env("SUPABASE_URL")
    supabase_key = get_required_env("SUPABASE_KEY")
    return create_client(supabase_url, supabase_key)


def fetch_publications_with_doi(supabase: Client, target_version: str = "v1") -> List[Dict]:
    """
    Returns publications with non-null DOI that have not been enriched by the new
    pipeline (no openalex_enriched_at timestamp). This catches both the
    original-pipeline-only cohort and any publications where the new pipeline failed
    to write.
    """
    publications_table = get_table_name("publications", target_version)
    publications: List[Dict] = []
    offset = 0

    while True:
        try:
            response = (
                supabase.table(publications_table)
                .select("id,doi,citation_count")
                .not_.is_("doi", "null")
                .is_("openalex_enriched_at", "null")
                .range(offset, offset + FETCH_PAGE_SIZE - 1)
                .execute()
            )
        except Exception as exc:
            raise RuntimeError(f"Failed loading publications page at offset {offset}: {exc}") from exc

        batch = response.data or []
        if not batch:
            break

        for row in batch:
            doi = normalize_doi(row.get("doi"))
            if doi:
                row["doi"] = doi
                publications.append(row)

        if len(batch) < FETCH_PAGE_SIZE:
            break
        offset += FETCH_PAGE_SIZE

    return publications


def format_eta(total_seconds: float) -> str:
    if total_seconds < 0:
        total_seconds = 0
    minutes = int(total_seconds // 60)
    hours = minutes // 60
    remaining_minutes = minutes % 60
    return f"{hours}h {remaining_minutes}m"


def load_checkpoint(target_version: str = "v1") -> Set[str]:
    """Load processed publication IDs from checkpoint file. Returns empty set if file doesn't exist."""
    path = Path(get_checkpoint_file(target_version))
    if not path.is_file():
        return set()
    try:
        raw = path.read_text(encoding="utf-8")
        data = json.loads(raw)
        if not isinstance(data, list):
            logger.warning("Checkpoint file %s: expected JSON list, got %s", get_checkpoint_file(target_version), type(data).__name__)
            return set()
        return {str(x) for x in data}
    except json.JSONDecodeError as exc:
        logger.warning("Checkpoint file %s corrupt or invalid JSON (%s); starting fresh", get_checkpoint_file(target_version), exc)
        return set()
    except OSError as exc:
        logger.warning("Could not read checkpoint file %s (%s); starting fresh", get_checkpoint_file(target_version), exc)
        return set()


def save_checkpoint(processed_ids: Set[str], target_version: str = "v1") -> None:
    """Write processed publication IDs to checkpoint file as JSON list."""
    path = Path(get_checkpoint_file(target_version))
    try:
        path.write_text(json.dumps(sorted(processed_ids), indent=2), encoding="utf-8")
    except OSError as exc:
        logger.warning("Could not write checkpoint file %s: %s", get_checkpoint_file(target_version), exc)


def fetch_openalex_works_batch(
    session: requests.Session,
    dois: List[str],
    polite_mailto: str,
) -> Optional[Dict[str, Dict]]:
    """
    Fetch up to 100 OpenAlex works by DOI in a single API call.
    Returns dict mapping normalized DOI -> work payload for DOIs found in OpenAlex.
    DOIs not in the response are simply absent from the returned dict.
    Returns None if the batch call fails entirely (transient error after retry).
    """
    if len(dois) > BATCH_SIZE:
        raise ValueError(f"DOI batch size {len(dois)} exceeds maximum {BATCH_SIZE}")
    if not dois:
        return {}

    dois_input_set = set(dois)
    filter_value = "doi:" + "|".join(dois)
    openalex_api_key = os.getenv("OPENALEX_API_KEY")
    params: Dict[str, str] = {
        "filter": filter_value,
        "per-page": "100",
        "mailto": polite_mailto,
    }
    if openalex_api_key:
        params["api_key"] = openalex_api_key
    url = f"{OPENALEX_BASE_URL}/works"

    def do_get() -> requests.Response:
        return session.get(url, params=params, timeout=(10, 30))

    def apply_429_backoff(resp: requests.Response) -> Optional[requests.Response]:
        if resp.status_code == 429:
            time.sleep(5)
            resp = do_get()
        if resp.status_code == 429:
            time.sleep(15)
            resp = do_get()
        if resp.status_code == 429:
            logger.warning("OpenAlex batch: persistent HTTP 429 after backoff; batch failed")
            return None
        return resp

    try:
        try:
            response = do_get()
        except requests.RequestException as exc:
            logger.warning("OpenAlex batch: request error on first attempt: %s", exc)
            time.sleep(5)
            try:
                response = do_get()
            except requests.RequestException as exc2:
                logger.warning("OpenAlex batch: second attempt failed after 5s wait: %s", exc2)
                return None
        response = apply_429_backoff(response)
        if response is None:
            return None
        response.raise_for_status()
    except requests.HTTPError as exc:
        if response.status_code >= 500:
            time.sleep(5)
            try:
                try:
                    response = do_get()
                except requests.RequestException as exc2:
                    logger.warning("OpenAlex batch: request error on 5xx retry: %s", exc2)
                    return None
                response = apply_429_backoff(response)
                if response is None:
                    return None
                response.raise_for_status()
            except (requests.HTTPError, requests.RequestException) as exc3:
                logger.warning("OpenAlex batch: failed after 5xx retry: %s", exc3)
                return None
        else:
            logger.warning("OpenAlex batch: HTTP error %s: %s", response.status_code, exc)
            return None
    except requests.RequestException as exc:
        logger.warning("OpenAlex batch: unexpected request error after status handling: %s", exc)
        return None

    try:
        payload = response.json()
    except ValueError as exc:
        logger.warning("OpenAlex batch: invalid JSON in response: %s", exc)
        return None

    results = payload.get("results") if isinstance(payload, dict) else None
    if not isinstance(results, list):
        logger.warning("OpenAlex batch: missing or invalid 'results' in response")
        return None

    out: Dict[str, Dict] = {}
    for work in results:
        if not isinstance(work, dict):
            continue
        doi_raw = work.get("doi")
        if not isinstance(doi_raw, str):
            continue
        norm = normalize_doi(doi_raw)
        if norm and norm in dois_input_set:
            out[norm] = work
    return out


def extract_cited_by_count(work_payload: Optional[Dict]) -> Optional[int]:
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


def extract_publication_fields(work_payload: Dict) -> Dict:
    """
    Extract the fields we capture from an OpenAlex work payload.
    Returns dict with keys matching the publications table columns:
    citation_count, citation_counts_by_year, authorships, primary_location,
    publication_type, openalex_concepts, open_access.
    Each value is either the parsed value or None if not present.
    """
    cby = work_payload.get("counts_by_year")
    citation_counts_by_year = cby if isinstance(cby, list) else None

    auth = work_payload.get("authorships")
    authorships = auth if isinstance(auth, list) else None

    ploc = work_payload.get("primary_location")
    primary_location = ploc if isinstance(ploc, dict) else None

    ptype = work_payload.get("type")
    publication_type = ptype if isinstance(ptype, str) else None

    concepts = work_payload.get("concepts")
    openalex_concepts = concepts if isinstance(concepts, list) else None

    oa = work_payload.get("open_access")
    open_access = oa if isinstance(oa, dict) else None

    return {
        "citation_count": extract_cited_by_count(work_payload),
        "citation_counts_by_year": citation_counts_by_year,
        "authorships": authorships,
        "primary_location": primary_location,
        "publication_type": publication_type,
        "openalex_concepts": openalex_concepts,
        "open_access": open_access,
    }


def build_publication_update_row(
    publication_id: str,
    fields: Dict,
) -> Dict:
    """
    Build a single publication update row from extracted OpenAlex fields.
    Returns dict including the id and all non-None enrichment fields.
    """
    row: Dict = {"id": publication_id}
    if fields.get("citation_count") is not None:
        row["citation_count"] = fields["citation_count"]
    for key in (
        "citation_counts_by_year",
        "authorships",
        "primary_location",
        "openalex_concepts",
        "open_access",
    ):
        if fields.get(key) is not None:
            row[key] = fields[key]
    if fields.get("publication_type") is not None:
        row["publication_type"] = fields["publication_type"]

    row["openalex_enriched_at"] = datetime.now(timezone.utc).isoformat()
    return row


def upsert_publications_batch(
    supabase: Client,
    rows: List[Dict],
    target_version: str = "v1",
) -> int:
    """
    Upsert a batch of publication enrichment rows via Supabase.
    Returns the count of rows successfully written.
    On batch failure, falls back to per-row writes to identify offenders.
    """
    if not rows:
        return 0
    publications_table = get_table_name("publications", target_version)
    try:
        supabase.table(publications_table).upsert(rows, on_conflict="id").execute()
        return len(rows)
    except Exception as exc:
        logger.warning("Bulk upsert failed (%s); falling back to per-row writes", exc)
        written = 0
        for row in rows:
            try:
                supabase.table(publications_table).upsert(row, on_conflict="id").execute()
                written += 1
            except Exception as exc2:
                logger.warning("Failed publication %s: %s", row.get("id"), exc2)
        return written


def search_openalex_authors(
    session: requests.Session,
    name_query: str,
    polite_mailto: str,
) -> List[Dict]:
    openalex_api_key = os.getenv("OPENALEX_API_KEY")
    try:
        params = {
            "search": name_query,
            "per-page": "10",
            "mailto": polite_mailto,
        }
        if openalex_api_key:
            params["api_key"] = openalex_api_key
        response = session.get(
            f"{OPENALEX_BASE_URL}/authors",
            params=params,
            timeout=DEFAULT_TIMEOUT_SECONDS,
        )
        response.raise_for_status()
        payload = response.json()
    except (requests.RequestException, ValueError):
        return []
    time.sleep(SLEEP_SECONDS)
    results = payload.get("results", [])
    return results if isinstance(results, list) else []


def pick_confident_author_match(
    candidates: Sequence[Dict],
    first_name: Optional[str],
    last_name: Optional[str],
) -> Optional[Dict]:
    if not candidates or not last_name:
        return None
    first_norm = normalize_name_key(first_name)
    last_norm = normalize_name_key(last_name)
    if not last_norm:
        return None

    best_candidate: Optional[Dict] = None
    best_score = 0.0

    for candidate in candidates:
        display_name = normalize_name_key(candidate.get("display_name"))
        try:
            works_count = int(candidate.get("works_count", 0) or 0)
        except (TypeError, ValueError):
            works_count = 0
        if not display_name or works_count <= 0:
            continue
        if last_norm not in display_name:
            continue
        name_score = SequenceMatcher(
            None,
            f"{first_norm} {last_norm}".strip(),
            display_name,
        ).ratio()
        pub_count_score = 1.0 if works_count >= 3 else (works_count / 3.0)
        total_score = (0.8 * name_score) + (0.2 * pub_count_score)
        if total_score > best_score:
            best_score = total_score
            best_candidate = candidate

    if best_score < AUTHOR_MATCH_SCORE_THRESHOLD:
        return None
    return best_candidate


def process_hcp(
    supabase: Client,
    session: requests.Session,
    hcp: Dict,
    polite_mailto: str,
) -> bool:
    """
    If a confident OpenAlex author match exists, set hcps.total_career_pubs and
    hcps.first_pub_year from OpenAlex.
    Returns True when the hcp row was updated.
    """
    hcp_id = hcp.get("id")
    if not hcp_id:
        return False
    first_name = (hcp.get("first_name") or "").strip() or None
    last_name = (hcp.get("last_name") or "").strip() or None
    if not last_name:
        return False
    name_query = " ".join(p for p in (first_name, last_name) if p)
    if not name_query:
        return False

    candidates = search_openalex_authors(session, name_query, polite_mailto=polite_mailto)
    author = pick_confident_author_match(candidates, first_name, last_name)
    if not author:
        return False

    try:
        works_count = int(author.get("works_count", 0) or 0)
    except (TypeError, ValueError):
        return False
    if works_count < 0:
        return False

    earliest_year: Optional[int] = None
    counts_by_year = author.get("counts_by_year")
    if isinstance(counts_by_year, list):
        candidate_years: List[int] = []
        for item in counts_by_year:
            if not isinstance(item, dict):
                continue
            try:
                year = int(item.get("year"))
                year_works_count = int(item.get("works_count", 0) or 0)
            except (TypeError, ValueError):
                continue
            if year_works_count > 0:
                candidate_years.append(year)
        if candidate_years:
            earliest_year = min(candidate_years)

    try:
        supabase.table("hcps").update(
            {"total_career_pubs": works_count, "first_pub_year": earliest_year}
        ).eq("id", hcp_id).execute()
    except Exception as exc:
        raise RuntimeError(f"Failed updating total_career_pubs/first_pub_year for HCP {hcp_id}: {exc}") from exc
    return True


def run_career_enrichment(
    supabase: Client,
    session: requests.Session,
    polite_mailto: str,
) -> None:
    """Set total_career_pubs from OpenAlex for HCPs that do not have it yet."""
    try:
        response = supabase.table("hcps").select("id,first_name,last_name,total_career_pubs").execute()
    except Exception as exc:
        raise RuntimeError(f"Failed to load hcps for career enrichment: {exc}") from exc

    hcps = response.data or []
    need_enrichment = [h for h in hcps if h.get("total_career_pubs") is None]
    if not need_enrichment:
        print("Career pub enrichment: all HCPs already have total_career_pubs (or none to process).")
        return

    print(f"Career pub enrichment: attempting OpenAlex author match for {len(need_enrichment)} HCPs without total_career_pubs...")
    updated = 0
    for idx, hcp in enumerate(need_enrichment, start=1):
        try:
            if process_hcp(supabase, session, hcp, polite_mailto):
                updated += 1
        except Exception as exc:
            print(f"Warning: process_hcp failed for hcp_id={hcp.get('id')}: {exc}")
        if idx % 50 == 0:
            print(f"  Career enrichment progress: {idx}/{len(need_enrichment)} (updated={updated})")
        time.sleep(SLEEP_SECONDS)

    print(f"Career pub enrichment done: {updated} HCPs updated with total_career_pubs.")


def _print_doi_batch_progress(
    stats: PipelineStats,
    batch_index: int,
    total_batches: int,
    start_time: float,
) -> None:
    elapsed = time.time() - start_time
    avg_per_batch = elapsed / max(batch_index, 1)
    remaining_batches = max(total_batches - batch_index, 0)
    eta = format_eta(avg_per_batch * remaining_batches)
    print(
        f"[batch {batch_index}/{total_batches}] "
        f"Processed: {stats.processed} | Updated: {stats.updated} | Unchanged: {stats.unchanged} | "
        f"Not found/missing citations: {stats.not_found_or_missing_citations} | Failed: {stats.failed} | "
        f"Elapsed: {elapsed:.0f}s | ETA: {eta}"
    )


def run_pipeline(
    skip_doi_enrichment: bool = False,
    skip_career_enrichment: bool = False,
    reset_checkpoint: bool = False,
    target_version: str = "v1",
) -> None:
    load_dotenv()
    supabase = init_supabase()
    session = build_http_session()
    polite_mailto = get_required_env("PUBMED_EMAIL")

    if skip_doi_enrichment:
        print("SKIP_DOI_ENRICHMENT enabled: skipping DOI citation enrichment phase.")
    else:
        if reset_checkpoint:
            checkpoint_path = Path(get_checkpoint_file(target_version))
            if checkpoint_path.exists():
                checkpoint_path.unlink()
                print("Checkpoint reset; processing full cohort.")
        print("Loading unenriched publications with DOI (openalex_enriched_at is null)...")
        publications = fetch_publications_with_doi(supabase, target_version)
        processed_ids = load_checkpoint(target_version)
        publications_to_process = [p for p in publications if str(p["id"]) not in processed_ids]
        stats = PipelineStats(total_loaded=len(publications))
        already = len(publications) - len(publications_to_process)
        k = len(publications_to_process)
        print(
            f"Loaded {stats.total_loaded} publications, {already} already in checkpoint, processing {k}"
        )
        start_time = time.time()

        if not publications_to_process:
            print("Nothing to process (all IDs in checkpoint or no rows).")
        else:
            total_batches = (k + BATCH_SIZE - 1) // BATCH_SIZE
            batch_index = 0
            for batch_start in range(0, k, BATCH_SIZE):
                batch_index += 1
                batch = publications_to_process[batch_start : batch_start + BATCH_SIZE]
                doi_to_pub: Dict[str, Dict] = {p["doi"]: p for p in batch if p.get("doi")}
                dois: List[str] = list(dict.fromkeys(doi_to_pub.keys()))

                works_map = fetch_openalex_works_batch(session, dois, polite_mailto=polite_mailto)
                if works_map is None:
                    stats.failed += len(batch)
                    time.sleep(BATCH_SLEEP_SECONDS)
                    if batch_index % CHECKPOINT_EVERY_N_BATCHES == 0:
                        save_checkpoint(processed_ids, target_version)
                    if batch_index % PROGRESS_EVERY_N_BATCHES == 0 or batch_index == total_batches:
                        _print_doi_batch_progress(stats, batch_index, total_batches, start_time)
                    continue

                pending_updates: List[Dict] = []
                pending_update_ids: List[str] = []
                for publication in batch:
                    publication_id = publication.get("id")
                    doi = publication.get("doi")

                    if not publication_id or not doi:
                        stats.failed += 1
                        continue
                    work = works_map.get(doi)
                    if work is None:
                        stats.not_found_or_missing_citations += 1
                        processed_ids.add(str(publication["id"]))
                        continue
                    fields = extract_publication_fields(work)
                    has_any_field = any(value is not None for value in fields.values())
                    if not has_any_field:
                        stats.not_found_or_missing_citations += 1
                        processed_ids.add(str(publication["id"]))
                        continue
                    pending_updates.append(build_publication_update_row(str(publication_id), fields))
                    pending_update_ids.append(str(publication["id"]))

                if pending_updates:
                    written = upsert_publications_batch(supabase, pending_updates, target_version)
                    stats.updated += written
                    if written < len(pending_updates):
                        stats.failed += (len(pending_updates) - written)
                    for pid in pending_update_ids:
                        processed_ids.add(pid)

                stats.processed += len(batch)
                time.sleep(BATCH_SLEEP_SECONDS)

                if batch_index % CHECKPOINT_EVERY_N_BATCHES == 0:
                    save_checkpoint(processed_ids, target_version)
                if batch_index % PROGRESS_EVERY_N_BATCHES == 0 or batch_index == total_batches:
                    _print_doi_batch_progress(stats, batch_index, total_batches, start_time)

        save_checkpoint(processed_ids, target_version)

        print("\n=== OpenAlex DOI Enrichment Summary ===")
        print(f"Total loaded: {stats.total_loaded}")
        print(f"Processed: {stats.processed}")
        print(f"Updated: {stats.updated}")
        print(f"Unchanged: {stats.unchanged}")
        print(f"Not found/missing citation count: {stats.not_found_or_missing_citations}")
        print(f"Failed: {stats.failed}")

    if target_version == "v2":
        print(
            "\nSKIPPING career enrichment phase: target-version is v2. "
            "v2 career enrichment is handled by career_enrichment_from_clusters.py "
            "(multi-shard aggregation). This script's single-shard career enrichment "
            "is incompatible with the v2 multi-shard architecture."
        )
    elif not skip_career_enrichment:
        print("\nStarting HCP total_career_pubs enrichment (OpenAlex author match)...")
        run_career_enrichment(supabase, session, polite_mailto)
    else:
        print("Career enrichment skipped per --skip-career-enrichment flag.")


if __name__ == "__main__":
    try:
        logging.basicConfig(level=logging.WARNING, format="%(levelname)s %(message)s")
        parser = argparse.ArgumentParser(description="FieldMark OpenAlex enrichment pipeline")
        parser.add_argument(
            "--skip-doi-enrichment",
            action="store_true",
            help="Skip DOI citation enrichment and run only HCP career enrichment.",
        )
        parser.add_argument(
            "--skip-career-enrichment",
            action="store_true",
            help="Skip the HCP career enrichment phase (run only DOI enrichment).",
        )
        parser.add_argument(
            "--reset-checkpoint",
            action="store_true",
            help="Delete the checkpoint file before starting (forces re-processing of all matching publications).",
        )
        parser.add_argument(
            "--target-version",
            choices=["v1", "v2"],
            default="v1",
            help="Schema version to write to. v1=legacy tables, v2=rebuild tables.",
        )
        args = parser.parse_args()
        run_pipeline(
            skip_doi_enrichment=args.skip_doi_enrichment or env_flag_true("SKIP_DOI_ENRICHMENT"),
            skip_career_enrichment=args.skip_career_enrichment,
            reset_checkpoint=args.reset_checkpoint,
            target_version=args.target_version,
        )
    except Exception as error:
        print(f"[ERROR] OpenAlex pipeline failed: {error}")
        raise
