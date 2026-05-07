import argparse
import json
import os
import random
import time
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional, Set, Tuple
from urllib.error import HTTPError, URLError
from urllib.parse import quote_plus
from urllib.request import Request, urlopen
from uuid import uuid4

import psycopg
from dotenv import load_dotenv
from psycopg.rows import dict_row
from supabase import Client, create_client


CHECKPOINT_PATH = r"C:\Users\garre\Desktop\FieldMark\phase3_checkpoint.json"
OUTPUT_LOG_PATH = r"C:\Users\garre\Desktop\FieldMark\publication_backfill_phase3_log.json"
OPENALEX_WORKS_BASE = "https://api.openalex.org/works"

BATCH_SIZE = 200
CHECKPOINT_EVERY = 50
CANONICAL_LOOMBA_ID = "9339ead6-2023-4e69-9eda-2914553a2e20"


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--dry-run", action="store_true", default=False)
    parser.add_argument("--execute", action="store_true", default=False)
    parser.add_argument("--reset-checkpoint", action="store_true", default=False)
    parser.add_argument("--limit", type=int, default=None)
    parser.add_argument("--confidence-min", choices=["high", "medium", "low"], default="medium")
    return parser.parse_args()


def get_required_env(name: str) -> str:
    value = os.getenv(name)
    if not value:
        raise EnvironmentError(f"Missing required environment variable: {name}")
    return value


def init_supabase() -> Client:
    return create_client(get_required_env("SUPABASE_URL"), get_required_env("SUPABASE_KEY"))


def parse_iso_datetime(value: Any) -> Optional[datetime]:
    if not value:
        return None
    s = str(value).strip()
    if not s:
        return None
    try:
        return datetime.fromisoformat(s.replace("Z", "+00:00"))
    except ValueError:
        return None


def normalize_doi(value: Any) -> Optional[str]:
    if value is None:
        return None
    s = str(value).strip().lower()
    if not s:
        return None
    for prefix in ("https://doi.org/", "http://doi.org/", "doi.org/", "doi:"):
        if s.startswith(prefix):
            s = s[len(prefix) :].strip()
    return s or None


def load_checkpoint() -> Set[str]:
    if not os.path.exists(CHECKPOINT_PATH):
        return set()
    with open(CHECKPOINT_PATH, "r", encoding="utf-8") as f:
        payload = json.load(f)
    return {str(x) for x in (payload.get("processed_hcp_ids") or [])}


def save_checkpoint(processed_hcp_ids: Set[str]) -> None:
    with open(CHECKPOINT_PATH, "w", encoding="utf-8") as f:
        json.dump({"processed_hcp_ids": sorted(processed_hcp_ids)}, f, indent=2)


def fetch_phase3_hcps(database_url: str) -> List[Dict[str, Any]]:
    sql = """
        SELECT
          id,
          first_name,
          last_name,
          openalex_author_id,
          openalex_resolution_confidence
        FROM hcps
        WHERE openalex_author_id IS NOT NULL
    """
    rows: List[Dict[str, Any]] = []
    with psycopg.connect(database_url, row_factory=dict_row) as conn:
        with conn.cursor() as cur:
            cur.execute("SET statement_timeout = 0")
            cur.execute(sql)
            for row in cur:
                row["id"] = str(row["id"])
                rows.append(dict(row))
    return rows


def fetch_publications_index(database_url: str) -> Tuple[Dict[str, str], Dict[str, str], Dict[str, Dict[str, Any]]]:
    sql = """
        SELECT
          id,
          doi,
          pubmed_id,
          openalex_enriched_at,
          authorships,
          citation_counts_by_year,
          citation_count
        FROM publications
    """
    doi_to_pub_id: Dict[str, str] = {}
    openalex_id_to_pub_id: Dict[str, str] = {}
    pub_meta: Dict[str, Dict[str, Any]] = {}
    with psycopg.connect(database_url, row_factory=dict_row) as conn:
        with conn.cursor() as cur:
            cur.execute("SET statement_timeout = 0")
            cur.execute(sql)
            for row in cur:
                pub_id = str(row["id"])
                doi_norm = normalize_doi(row.get("doi"))
                if doi_norm and doi_norm not in doi_to_pub_id:
                    doi_to_pub_id[doi_norm] = pub_id
                pubmed_id = str(row.get("pubmed_id") or "").strip()
                if pubmed_id.startswith("https://openalex.org/W") and pubmed_id not in openalex_id_to_pub_id:
                    openalex_id_to_pub_id[pubmed_id] = pub_id
                pub_meta[pub_id] = {
                    "openalex_enriched_at": row.get("openalex_enriched_at"),
                    "authorships": row.get("authorships"),
                    "citation_counts_by_year": row.get("citation_counts_by_year"),
                    "citation_count": row.get("citation_count"),
                }
    return doi_to_pub_id, openalex_id_to_pub_id, pub_meta


def fetch_hcp_openalex_map(database_url: str) -> Dict[str, str]:
    sql = """
        SELECT id, openalex_author_id
        FROM hcps
        WHERE openalex_author_id IS NOT NULL
    """
    out: Dict[str, str] = {}
    with psycopg.connect(database_url, row_factory=dict_row) as conn:
        with conn.cursor() as cur:
            cur.execute("SET statement_timeout = 0")
            cur.execute(sql)
            for row in cur:
                hcp_id = str(row["id"])
                aid = str(row["openalex_author_id"] or "").strip()
                if aid:
                    out[aid] = hcp_id
    return out


def fetch_existing_pubauth_counts(database_url: str) -> Dict[str, int]:
    sql = """
        SELECT hcp_id, COUNT(*) AS c
        FROM publication_authors
        GROUP BY hcp_id
    """
    out: Dict[str, int] = {}
    with psycopg.connect(database_url, row_factory=dict_row) as conn:
        with conn.cursor() as cur:
            cur.execute("SET statement_timeout = 0")
            cur.execute(sql)
            for row in cur:
                out[str(row["hcp_id"])] = int(row["c"])
    return out


def call_openalex_works(author_id: str, cursor: str, mailto: str) -> Dict[str, Any]:
    url = (
        f"{OPENALEX_WORKS_BASE}?filter=author.id:{quote_plus(author_id)}"
        f"&per-page=200&cursor={quote_plus(cursor)}&mailto={quote_plus(mailto)}"
    )
    req = Request(url, headers={"User-Agent": "FieldMark-Phase3/1.0"})
    with urlopen(req, timeout=40) as resp:
        body = resp.read().decode("utf-8")
    return json.loads(body)


def fetch_all_works_for_author(author_id: str, mailto: str) -> List[Dict[str, Any]]:
    all_works: List[Dict[str, Any]] = []
    cursor = "*"
    while True:
        last_error = None
        response = None
        for attempt in range(3):
            time.sleep(0.1)
            try:
                response = call_openalex_works(author_id, cursor, mailto)
                break
            except HTTPError as exc:
                if 500 <= exc.code < 600:
                    last_error = exc
                    time.sleep(2**attempt)
                    continue
                raise
            except (URLError, TimeoutError, ConnectionError) as exc:
                last_error = exc
                time.sleep(2**attempt)
                continue
        if response is None:
            raise RuntimeError(f"OpenAlex works fetch failed: {repr(last_error)}")

        works = response.get("results") or []
        all_works.extend(works)
        next_cursor = ((response.get("meta") or {}).get("next_cursor"))
        if not works or not next_cursor:
            break
        cursor = str(next_cursor)
    return all_works


def flush_publication_batches(
    client: Client,
    pub_rows: List[Dict[str, Any]],
    pubauth_rows: List[Dict[str, Any]],
    execute: bool,
    errors: List[str],
) -> Tuple[int, int]:
    pubs_written = 0
    pubauth_written = 0
    if not execute:
        return 0, 0

    # Split publications into NEW (have ingested_at, full payload) vs
    # UPDATE (just enrichment fields). New rows have 'ingested_at' set
    # to now; updates do not include 'ingested_at'.
    new_pubs = [r for r in pub_rows if "ingested_at" in r]
    update_pubs = [r for r in pub_rows if "ingested_at" not in r]

    # Insert new publications in batches
    for start_idx in range(0, len(new_pubs), BATCH_SIZE):
        batch = new_pubs[start_idx : start_idx + BATCH_SIZE]
        if not batch:
            continue
        try:
            client.table("publications").insert(batch).execute()
            pubs_written += len(batch)
        except Exception as exc:
            errors.append(f"publications_insert_batch_{start_idx}: {repr(exc)}")

    # Update existing publications per-row (avoids INSERT-then-UPDATE
    # constraint issues from PostgREST upsert behavior)
    for row in update_pubs:
        row_id = row["id"]
        update_payload = {k: v for k, v in row.items() if k != "id"}
        try:
            client.table("publications").update(update_payload).eq("id", row_id).execute()
            pubs_written += 1
        except Exception as exc:
            errors.append(f"publications_update_{row_id}: {repr(exc)}")

    # publication_authors uses upsert with ignore_duplicates which is
    # fine because the unique constraint catches duplicates and the
    # row is fully specified (no NULL columns hitting constraints).
    for start_idx in range(0, len(pubauth_rows), BATCH_SIZE):
        batch = pubauth_rows[start_idx : start_idx + BATCH_SIZE]
        if not batch:
            continue
        try:
            client.table("publication_authors").upsert(
                batch,
                on_conflict="publication_id,hcp_id",
                ignore_duplicates=True,
            ).execute()
            pubauth_written += len(batch)
        except Exception as exc:
            errors.append(f"publication_authors_upsert_batch_{start_idx}: {repr(exc)}")

    return pubs_written, pubauth_written


if __name__ == "__main__":
    started = time.time()
    args = parse_args()
    execute = bool(args.execute and not args.dry_run)
    mode = "execute" if execute else "dry_run"
    errors: List[str] = []

    load_dotenv()
    client = init_supabase()
    database_url = get_required_env("DATABASE_URL")
    polite_mailto = os.getenv("OPENALEX_MAILTO", "garrett@fieldmark.app")

    if args.reset_checkpoint and os.path.exists(CHECKPOINT_PATH):
        os.remove(CHECKPOINT_PATH)
    processed_hcp_ids = load_checkpoint()

    confidence_rank = {"high": 3, "medium": 2, "low": 1}
    min_rank = confidence_rank[args.confidence_min]

    print("Loading HCP cohort via direct Postgres...")
    hcps = fetch_phase3_hcps(database_url)
    cohort = []
    for h in hcps:
        conf = str(h.get("openalex_resolution_confidence") or "").lower()
        if conf not in confidence_rank:
            continue
        if confidence_rank[conf] < min_rank:
            continue
        if str(h["id"]) in processed_hcp_ids:
            continue
        if not str(h.get("openalex_author_id") or "").strip():
            continue
        cohort.append(h)
    if args.limit is not None:
        cohort = cohort[: args.limit]
    cohort_size = len(cohort)
    print(f"Cohort size to process: {cohort_size}")

    print("Loading heavy read indexes via direct Postgres...")
    doi_to_pub_id, openalex_id_to_pub_id, pub_meta = fetch_publications_index(database_url)
    openalex_author_to_hcp = fetch_hcp_openalex_map(database_url)
    existing_pubauth_counts = fetch_existing_pubauth_counts(database_url)

    total_publications_ingested = 0
    total_publication_authors_created = 0
    processed_count = 0

    per_hcp_metrics: Dict[str, Dict[str, int]] = {}

    pub_buffer: List[Dict[str, Any]] = []
    pubauth_buffer: List[Dict[str, Any]] = []

    progress_started = time.time()
    for hcp in cohort:
        hcp_id = str(hcp["id"])
        openalex_author_id = str(hcp.get("openalex_author_id") or "").strip()
        per_hcp_metrics[hcp_id] = {
            "new_publications": 0,
            "updated_publications": 0,
            "publication_authors_rows_added": 0,
            "works_seen": 0,
        }

        try:
            works = fetch_all_works_for_author(openalex_author_id, polite_mailto)
            per_hcp_metrics[hcp_id]["works_seen"] = len(works)
        except Exception as exc:
            errors.append(f"hcp_{hcp_id}_works_fetch: {repr(exc)}")
            processed_hcp_ids.add(hcp_id)
            processed_count += 1
            continue

        now_iso = datetime.now(timezone.utc).isoformat()
        stale_cutoff = datetime.now(timezone.utc) - timedelta(days=30)

        for work in works:
            openalex_work_id = str(work.get("id") or "").strip()
            doi_norm = normalize_doi(work.get("doi"))
            publication_id: Optional[str] = None

            if doi_norm and doi_norm in doi_to_pub_id:
                publication_id = doi_to_pub_id[doi_norm]
            elif openalex_work_id and openalex_work_id in openalex_id_to_pub_id:
                publication_id = openalex_id_to_pub_id[openalex_work_id]

            title = work.get("title")
            pub_year = work.get("publication_year")
            cited_by_count = work.get("cited_by_count")
            authorships = work.get("authorships")
            primary_location = work.get("primary_location")
            publication_type = work.get("type")
            concepts = work.get("concepts")
            open_access = work.get("open_access")
            counts_by_year = work.get("counts_by_year")

            journal = None
            if isinstance(primary_location, dict):
                source = primary_location.get("source")
                if isinstance(source, dict):
                    journal = source.get("display_name")

            if publication_id is None:
                publication_id = str(uuid4())
                row = {
                    "id": publication_id,
                    "hcp_id": None,
                    "pubmed_id": openalex_work_id or None,
                    "title": title,
                    "journal": journal,
                    "pub_year": pub_year,
                    "citation_count": cited_by_count,
                    "doi": doi_norm,
                    "ingested_at": now_iso,
                    "citation_counts_by_year": counts_by_year,
                    "authorships": authorships,
                    "primary_location": primary_location,
                    "publication_type": publication_type,
                    "openalex_concepts": concepts,
                    "open_access": open_access,
                    "openalex_enriched_at": now_iso,
                }
                pub_buffer.append(row)
                total_publications_ingested += 1
                per_hcp_metrics[hcp_id]["new_publications"] += 1
                if doi_norm and doi_norm not in doi_to_pub_id:
                    doi_to_pub_id[doi_norm] = publication_id
                if openalex_work_id and openalex_work_id not in openalex_id_to_pub_id:
                    openalex_id_to_pub_id[openalex_work_id] = publication_id
                pub_meta[publication_id] = {
                    "openalex_enriched_at": now_iso,
                    "authorships": authorships,
                    "citation_counts_by_year": counts_by_year,
                    "citation_count": cited_by_count,
                }
            else:
                meta = pub_meta.get(publication_id, {})
                last_enriched = parse_iso_datetime(meta.get("openalex_enriched_at"))
                stale = (last_enriched is None) or (last_enriched < stale_cutoff)
                need_update = False
                if stale:
                    need_update = True
                if meta.get("authorships") in (None, []):
                    need_update = True
                if meta.get("citation_counts_by_year") in (None, []):
                    need_update = True
                if meta.get("citation_count") is None:
                    need_update = True

                if need_update:
                    row = {
                        "id": publication_id,
                        "authorships": authorships,
                        "citation_counts_by_year": counts_by_year,
                        "citation_count": cited_by_count,
                        "primary_location": primary_location,
                        "publication_type": publication_type,
                        "openalex_concepts": concepts,
                        "open_access": open_access,
                        "openalex_enriched_at": now_iso,
                    }
                    pub_buffer.append(row)
                    per_hcp_metrics[hcp_id]["updated_publications"] += 1
                    pub_meta[publication_id] = {
                        "openalex_enriched_at": now_iso,
                        "authorships": authorships,
                        "citation_counts_by_year": counts_by_year,
                        "citation_count": cited_by_count,
                    }

            if isinstance(authorships, list):
                for authorship in authorships:
                    if not isinstance(authorship, dict):
                        continue
                    author = authorship.get("author") or {}
                    if not isinstance(author, dict):
                        continue
                    author_id = str(author.get("id") or "").strip()
                    if not author_id:
                        continue
                    mapped_hcp_id = openalex_author_to_hcp.get(author_id)
                    if not mapped_hcp_id:
                        continue
                    raw_aff = authorship.get("raw_affiliation_strings")
                    aff0 = raw_aff[0] if isinstance(raw_aff, list) and raw_aff else None
                    pubauth_buffer.append(
                        {
                            "publication_id": publication_id,
                            "hcp_id": mapped_hcp_id,
                            "author_position": authorship.get("author_position"),
                            "is_corresponding": authorship.get("is_corresponding"),
                            "openalex_author_id": author_id,
                            "affiliation_at_publication": aff0,
                            "match_method": "openalex_id_match",
                            "match_confidence": "high",
                        }
                    )
                    total_publication_authors_created += 1
                    if mapped_hcp_id == hcp_id:
                        per_hcp_metrics[hcp_id]["publication_authors_rows_added"] += 1

            if len(pub_buffer) >= BATCH_SIZE or len(pubauth_buffer) >= BATCH_SIZE:
                wrote_pubs, wrote_pubauth = flush_publication_batches(
                    client, pub_buffer, pubauth_buffer, execute, errors
                )
                if execute:
                    # counts already tracked as logical created/ingested; no-op for wrote_*.
                    _ = wrote_pubs + wrote_pubauth
                pub_buffer = []
                pubauth_buffer = []

        # Per-HCP durability: flush buffers before marking this HCP
        # processed in the checkpoint. This ensures we don't checkpoint
        # an HCP whose writes haven't been persisted.
        if pub_buffer or pubauth_buffer:
            flush_publication_batches(client, pub_buffer, pubauth_buffer, execute, errors)
            pub_buffer = []
            pubauth_buffer = []

        processed_hcp_ids.add(hcp_id)
        processed_count += 1

        if processed_count % CHECKPOINT_EVERY == 0:
            save_checkpoint(processed_hcp_ids)
            elapsed = time.time() - progress_started
            rate = processed_count / elapsed if elapsed > 0 else 0.0
            remaining = max(cohort_size - processed_count, 0)
            eta = (remaining / rate) if rate > 0 else None
            eta_str = f"{eta:.1f}s" if eta is not None else "unknown"
            print(
                f"Processed {processed_count}/{cohort_size} | elapsed={elapsed:.1f}s "
                f"rate={rate:.2f} hcp/s eta={eta_str} | "
                f"publications_ingested={total_publications_ingested} "
                f"publication_authors_rows={total_publication_authors_created}"
            )

    # Final flush and checkpoint
    if pub_buffer or pubauth_buffer:
        flush_publication_batches(client, pub_buffer, pubauth_buffer, execute, errors)
    save_checkpoint(processed_hcp_ids)

    if not execute:
        print("[DRY-RUN] Skipping DB writes; counts above are projected.")

    # Canonicals output: Loomba + 3 random others
    canonical_results: List[Dict[str, Any]] = []
    loomba_metric = per_hcp_metrics.get(
        CANONICAL_LOOMBA_ID,
        {"new_publications": 0, "updated_publications": 0, "publication_authors_rows_added": 0, "works_seen": 0},
    )
    loomba_total_biblio = existing_pubauth_counts.get(CANONICAL_LOOMBA_ID, 0) + loomba_metric["publication_authors_rows_added"]
    canonical_results.append(
        {
            "label": "Loomba",
            "hcp_id": CANONICAL_LOOMBA_ID,
            "new_publications_ingested": loomba_metric["new_publications"],
            "publication_authors_rows_added": loomba_metric["publication_authors_rows_added"],
            "total_bibliography_size_after_run": loomba_total_biblio,
        }
    )

    other_ids = [hid for hid in per_hcp_metrics.keys() if hid != CANONICAL_LOOMBA_ID]
    rng = random.Random(42)
    if len(other_ids) > 3:
        sample_ids = rng.sample(other_ids, 3)
    else:
        sample_ids = other_ids
    for hid in sample_ids:
        m = per_hcp_metrics[hid]
        total_after = existing_pubauth_counts.get(hid, 0) + m["publication_authors_rows_added"]
        canonical_results.append(
            {
                "label": "random",
                "hcp_id": hid,
                "new_publications_ingested": m["new_publications"],
                "publication_authors_rows_added": m["publication_authors_rows_added"],
                "total_bibliography_size_after_run": total_after,
            }
        )

    print("Canonical/sample metrics:")
    print(json.dumps(canonical_results, indent=2))

    elapsed_seconds = time.time() - started
    log_payload = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "mode": mode,
        "elapsed_seconds": elapsed_seconds,
        "cohort_size": cohort_size,
        "processed_count": processed_count,
        "total_publications_ingested": total_publications_ingested,
        "total_publication_authors_rows_created": total_publication_authors_created,
        "errors": errors,
        "canonical_results": canonical_results,
    }
    with open(OUTPUT_LOG_PATH, "w", encoding="utf-8") as f:
        json.dump(log_payload, f, indent=2)
    print(f"Saved log: {OUTPUT_LOG_PATH}")
