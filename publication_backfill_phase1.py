import argparse
import json
import os
import random
import time
from collections import defaultdict
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Tuple

import psycopg
from dotenv import load_dotenv
from psycopg.rows import dict_row
from supabase import Client, create_client


OUTPUT_LOG_PATH = r"C:\Users\garre\Desktop\FieldMark\publication_backfill_phase1_log.json"
PAGE_SIZE = 1000
WRITE_BATCH_SIZE = 500

CANONICALS = [
    {"label": "Loomba", "hcp_id": "9339ead6-2023-4e69-9eda-2914553a2e20"},
    {"label": "Garassino", "hcp_id": "dc645bf0-b7e0-4c3c-9aaf-9e7bc35d6331"},
    {"label": "Chalasani", "hcp_id": "6f9dd309-bd67-4260-a9c2-8a22129f988c"},
]


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--dry-run", action="store_true", default=False)
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
    not_null_columns: Optional[List[str]] = None,
) -> List[Dict[str, Any]]:
    rows: List[Dict[str, Any]] = []
    offset = 0
    page_size = 200  # smaller default to avoid PostgREST statement timeouts
    while True:
        try:
            q = client.table(table).select(columns).order("id").range(offset, offset + page_size - 1)
            if not_null_columns:
                for col in not_null_columns:
                    q = q.not_.is_(col, "null")
            batch = q.execute().data or []
        except Exception as exc:
            if "57014" in str(exc) and page_size > 100:
                page_size = 100
                continue
            raise
        if not batch:
            break
        rows.extend(batch)
        if len(batch) < page_size:
            break
        offset += page_size
    return rows


def fetch_publications_direct(
    database_url: str,
    with_hcp_id_filter: bool,
) -> List[Dict[str, Any]]:
    """
    Fetch publications via direct Postgres connection.
    - if with_hcp_id_filter: returns rows with hcp_id IS NOT NULL AND authorships IS NOT NULL
    - else: returns rows with authorships IS NOT NULL (any hcp_id state)
    Returns list of dicts with id, hcp_id (when applicable), authorships.
    """
    if with_hcp_id_filter:
        sql = """
            SELECT id, hcp_id, authorships
            FROM publications
            WHERE hcp_id IS NOT NULL
              AND authorships IS NOT NULL
        """
    else:
        sql = """
            SELECT id, authorships
            FROM publications
            WHERE authorships IS NOT NULL
        """
    rows: List[Dict[str, Any]] = []
    with psycopg.connect(database_url, row_factory=dict_row) as conn:
        with conn.cursor() as cur:
            # Disable statement timeout for this bulk fetch.
            # Supabase's connection pool defaults to 8 second timeout
            # which is insufficient for fetching 145K JSONB-heavy rows.
            cur.execute("SET statement_timeout = 0")

            # Use a server-side cursor (named cursor) so results stream
            # rather than buffering the entire result set in memory.
            cur.execute(sql)
            progress_started = time.time()
            for row in cur:
                # convert UUIDs and other types to strings/native python
                if "id" in row and row["id"] is not None:
                    row["id"] = str(row["id"])
                if "hcp_id" in row and row["hcp_id"] is not None:
                    row["hcp_id"] = str(row["hcp_id"])
                rows.append(dict(row))
                if len(rows) % 10000 == 0:
                    elapsed = time.time() - progress_started
                    rate = len(rows) / elapsed if elapsed > 0 else 0
                    print(
                        f"  ... {len(rows):,} rows fetched "
                        f"({elapsed:.1f}s elapsed, {rate:,.0f} rows/sec)"
                    )
    return rows


def normalize_name(v: Any) -> str:
    return " ".join(str(v or "").strip().lower().split())


def parse_authorships(value: Any) -> List[Dict[str, Any]]:
    if value is None:
        return []
    if isinstance(value, list):
        return [x for x in value if isinstance(x, dict)]
    if isinstance(value, str):
        try:
            parsed = json.loads(value)
            if isinstance(parsed, list):
                return [x for x in parsed if isinstance(x, dict)]
        except json.JSONDecodeError:
            return []
    return []


if __name__ == "__main__":
    started = time.time()
    args = parse_args()
    execute = bool(args.execute and not args.dry_run)
    mode = "execute" if execute else "dry_run"
    errors: List[str] = []

    load_dotenv()
    client = init_supabase()

    # Load HCP base data
    hcps_rows = fetch_all_pages(client, "hcps", "id,first_name,last_name,openalex_author_id", not_null_columns=None)
    hcp_name_by_id: Dict[str, Dict[str, str]] = {}
    existing_openalex_by_hcp: Dict[str, str] = {}
    for h in hcps_rows:
        hcp_id = str(h.get("id") or "")
        if not hcp_id:
            continue
        hcp_name_by_id[hcp_id] = {
            "first_name": str(h.get("first_name") or "").strip(),
            "last_name": str(h.get("last_name") or "").strip(),
        }
        existing_id = str(h.get("openalex_author_id") or "").strip()
        if existing_id:
            existing_openalex_by_hcp[hcp_id] = existing_id

    # Step 1A: Resolve HCP -> OpenAlex author id from linked publications
    database_url = get_required_env("DATABASE_URL")
    print("Fetching publications with hcp_id and authorships via direct Postgres...")
    fetch_started = time.time()
    pubs_linked_rows = fetch_publications_direct(database_url, with_hcp_id_filter=True)
    print(f"  Fetched {len(pubs_linked_rows)} rows in {time.time() - fetch_started:.1f}s")

    votes_by_hcp: Dict[str, List[Dict[str, Any]]] = defaultdict(list)
    publications_analyzed = 0

    for pub in pubs_linked_rows:
        hcp_id = str(pub.get("hcp_id") or "").strip()
        if not hcp_id or hcp_id not in hcp_name_by_id:
            continue
        publications_analyzed += 1
        first_name = hcp_name_by_id[hcp_id]["first_name"]
        last_name = hcp_name_by_id[hcp_id]["last_name"]
        if not first_name or not last_name:
            continue

        target_full = normalize_name(f"{first_name} {last_name}")
        target_last = normalize_name(last_name)
        target_first_initial = normalize_name(first_name)[:1]
        if not target_last or not target_first_initial:
            continue

        authorships = parse_authorships(pub.get("authorships"))
        matched_candidates: List[Tuple[str, str]] = []
        for authorship in authorships:
            author = authorship.get("author") or {}
            if not isinstance(author, dict):
                continue
            author_id = str(author.get("id") or "").strip()
            display_name = normalize_name(author.get("display_name"))
            if not author_id or not display_name:
                continue

            confidence = ""
            if display_name == target_full:
                confidence = "high"
            else:
                tokens = display_name.split()
                if len(tokens) >= 2:
                    first_token = tokens[0]
                    last_token = tokens[-1]
                    if last_token == target_last and first_token[:1] == target_first_initial:
                        confidence = "medium"
            if confidence:
                matched_candidates.append((author_id, confidence))

        if not matched_candidates:
            continue

        max_rank = max(2 if c[1] == "high" else 1 for c in matched_candidates)
        best_conf = "high" if max_rank == 2 else "medium"
        best_candidates = [c for c in matched_candidates if c[1] == best_conf]
        if len(best_candidates) != 1:
            continue
        best_author_id, confidence = best_candidates[0]
        votes_by_hcp[hcp_id].append(
            {"openalex_author_id": best_author_id, "confidence": confidence}
        )

    resolved_by_hcp: Dict[str, Dict[str, Any]] = {}
    ambiguous_hcps: List[str] = []
    resolved_high = 0
    resolved_medium = 0
    resolved_low = 0

    for hcp_id, votes in votes_by_hcp.items():
        by_id: Dict[str, Dict[str, int]] = {}
        for v in votes:
            aid = v["openalex_author_id"]
            conf = v["confidence"]
            if aid not in by_id:
                by_id[aid] = {"total": 0, "high": 0, "medium": 0}
            by_id[aid]["total"] += 1
            by_id[aid][conf] += 1

        max_total = max(x["total"] for x in by_id.values())
        top_ids = [aid for aid, stats in by_id.items() if stats["total"] == max_total]
        if len(top_ids) > 1:
            top_with_high = [aid for aid in top_ids if by_id[aid]["high"] > 0]
            if len(top_with_high) == 1:
                top_ids = top_with_high
            elif len(top_with_high) > 1:
                top_ids = top_with_high
        if len(top_ids) != 1:
            ambiguous_hcps.append(hcp_id)
            continue

        winner_id = top_ids[0]
        # Compute confidence based on the percentage of high-confidence
        # votes for the winning OpenAlex ID. This better represents
        # confidence than the strict "all-or-nothing" rule, since HCPs
        # like Loomba have many exact matches plus a small number of
        # abbreviated-name matches.
        winner_high = by_id[winner_id]["high"]
        winner_total = by_id[winner_id]["total"]
        high_pct = (winner_high / winner_total) if winner_total > 0 else 0.0
        if high_pct >= 0.80:
            resolution_confidence = "high"
        elif high_pct >= 0.50 or winner_high == 0:
            resolution_confidence = "medium"
        else:
            resolution_confidence = "low"
        if resolution_confidence == "high":
            resolved_high += 1
        elif resolution_confidence == "medium":
            resolved_medium += 1
        else:
            # initialize a new counter for low-confidence resolutions
            resolved_low += 1

        resolved_by_hcp[hcp_id] = {
            "openalex_author_id": winner_id,
            "openalex_resolution_method": "authorship_extract",
            "openalex_resolution_confidence": resolution_confidence,
            "vote_count": by_id[winner_id]["total"],
            "high_votes": by_id[winner_id]["high"],
            "medium_votes": by_id[winner_id]["medium"],
            "total_votes_all_candidates": len(votes),
        }

    # Step 2 prep map: openalex id -> hcp id (existing + newly resolved)
    merged_openalex_by_hcp = dict(existing_openalex_by_hcp)
    for hcp_id, res in resolved_by_hcp.items():
        merged_openalex_by_hcp[hcp_id] = res["openalex_author_id"]

    openalex_to_hcp: Dict[str, str] = {}
    for hcp_id, aid in merged_openalex_by_hcp.items():
        if aid:
            openalex_to_hcp[str(aid)] = hcp_id

    # Step 2B: publication_authors backfill
    print("Fetching all publications with authorships via direct Postgres...")
    fetch_started = time.time()
    pubs_auth_rows = fetch_publications_direct(database_url, with_hcp_id_filter=False)
    print(f"  Fetched {len(pubs_auth_rows)} rows in {time.time() - fetch_started:.1f}s")

    insert_rows: List[Dict[str, Any]] = []
    projected_rows_by_hcp: Dict[str, int] = defaultdict(int)

    for pub in pubs_auth_rows:
        publication_id = str(pub.get("id") or "").strip()
        if not publication_id:
            continue
        authorships = parse_authorships(pub.get("authorships"))
        for authorship in authorships:
            author = authorship.get("author") or {}
            if not isinstance(author, dict):
                continue
            author_id = str(author.get("id") or "").strip()
            if not author_id or author_id not in openalex_to_hcp:
                continue
            hcp_id = openalex_to_hcp[author_id]
            raw_affiliations = authorship.get("raw_affiliation_strings")
            first_affiliation = None
            if isinstance(raw_affiliations, list) and raw_affiliations:
                first_affiliation = raw_affiliations[0]
            insert_rows.append(
                {
                    "publication_id": publication_id,
                    "hcp_id": hcp_id,
                    "author_position": authorship.get("author_position"),
                    "is_corresponding": authorship.get("is_corresponding"),
                    "openalex_author_id": author_id,
                    "affiliation_at_publication": first_affiliation,
                    "match_method": "openalex_id_match",
                    "match_confidence": "high",
                }
            )
            projected_rows_by_hcp[hcp_id] += 1

    # Validation: Level 1
    step1_stats = {
        "publications_analyzed_with_hcp_and_authorships": publications_analyzed,
        "hcps_with_at_least_one_vote": len(votes_by_hcp),
        "hcps_resolved_openalex_id": len(resolved_by_hcp),
        "resolved_high_confidence": resolved_high,
        "resolved_medium_confidence": resolved_medium,
        "resolved_low_confidence": resolved_low,
        "hcps_ambiguous_no_resolution": len(ambiguous_hcps),
    }

    step2_stats = {
        "publications_with_authorships_scanned": len(pubs_auth_rows),
        "publication_authors_rows_projected": len(insert_rows),
        "publication_authors_rows_inserted": 0,
        "publication_authors_insert_errors": 0,
    }

    print("Level 1 stats:")
    print(json.dumps(step1_stats, indent=2))

    # Validation: Level 2 canonicals
    canonical_outputs: List[Dict[str, Any]] = []
    for c in CANONICALS:
        hcp_id = c["hcp_id"]
        name_bits = hcp_name_by_id.get(hcp_id, {})
        resolved = resolved_by_hcp.get(hcp_id)
        out = {
            "label": c["label"],
            "hcp_id": hcp_id,
            "hcp_name": f"{name_bits.get('first_name', '')} {name_bits.get('last_name', '')}".strip(),
            "resolved_openalex_author_id": resolved["openalex_author_id"] if resolved else None,
            "resolution_confidence": resolved["openalex_resolution_confidence"] if resolved else None,
            "vote_count": resolved["vote_count"] if resolved else 0,
            "projected_publication_authors_rows": projected_rows_by_hcp.get(hcp_id, 0),
        }
        canonical_outputs.append(out)
        print(
            f"Canonical {c['label']}: name={out['hcp_name']}, "
            f"openalex_id={out['resolved_openalex_author_id']}, "
            f"confidence={out['resolution_confidence']}, "
            f"votes={out['vote_count']}, "
            f"projected_pub_auth_rows={out['projected_publication_authors_rows']}"
        )

    # Validation: Level 3 random sample (5 printed)
    resolved_hcp_ids = list(resolved_by_hcp.keys())
    rng = random.Random(42)
    if len(resolved_hcp_ids) > 5:
        sample5_ids = rng.sample(resolved_hcp_ids, 5)
    else:
        sample5_ids = resolved_hcp_ids
    print("Random sample (5 resolved HCPs):")
    for hid in sample5_ids:
        res = resolved_by_hcp[hid]
        name_bits = hcp_name_by_id.get(hid, {})
        print(
            f"{hid} | {name_bits.get('first_name', '')} {name_bits.get('last_name', '')} | "
            f"openalex={res['openalex_author_id']} | "
            f"confidence={res['openalex_resolution_confidence']} | votes={res['vote_count']}"
        )

    # Execute writes
    if not execute:
        print("[DRY-RUN] Skipping database writes.")
    else:
        confirm = input(
            "About to update hcps openalex fields and backfill publication_authors. Continue? (yes/no): "
        )
        if confirm != "yes":
            print("Execution cancelled.")
            errors.append("execute_cancelled_by_user")
        else:
            now_iso = datetime.now(timezone.utc).isoformat()

            # Step 1A writes: update hcps
            hcp_updates = []
            for hcp_id, res in resolved_by_hcp.items():
                hcp_updates.append(
                    {
                        "id": hcp_id,
                        "openalex_author_id": res["openalex_author_id"],
                        "openalex_resolution_method": "authorship_extract",
                        "openalex_resolution_confidence": res["openalex_resolution_confidence"],
                        "openalex_resolved_at": now_iso,
                    }
                )

            # PostgREST upsert does INSERT-then-UPDATE which fails not-null
            # constraints on unspecified columns. Use per-row UPDATE instead
            # since these IDs all exist in the database already.
            hcp_updates_per_progress = 500
            hcp_updated_count = 0
            hcp_error_count = 0
            for idx, row in enumerate(hcp_updates):
                row_id = row["id"]
                update_payload = {k: v for k, v in row.items() if k != "id"}
                try:
                    client.table("hcps").update(update_payload).eq("id", row_id).execute()
                    hcp_updated_count += 1
                except Exception as exc:
                    hcp_error_count += 1
                    errors.append(f"hcps_update_row_{row_id}: {repr(exc)}")
                    print(f"HCP update failed for {row_id}: {exc}")

                if (idx + 1) % hcp_updates_per_progress == 0 or (idx + 1) == len(hcp_updates):
                    print(
                        f"Updated {hcp_updated_count}/{len(hcp_updates)} hcps "
                        f"({hcp_error_count} errors)"
                    )

            # Step 2B writes: publication_authors upsert do nothing on conflict
            for start_idx in range(0, len(insert_rows), WRITE_BATCH_SIZE):
                batch = insert_rows[start_idx : start_idx + WRITE_BATCH_SIZE]
                try:
                    client.table("publication_authors").upsert(
                        batch,
                        on_conflict="publication_id,hcp_id",
                        ignore_duplicates=True,
                    ).execute()
                    step2_stats["publication_authors_rows_inserted"] += len(batch)
                except Exception as exc:
                    step2_stats["publication_authors_insert_errors"] += len(batch)
                    errors.append(f"publication_authors_insert_batch_{start_idx}: {repr(exc)}")
                    print(f"publication_authors batch failed at offset {start_idx}: {exc}")

    # Log random sample of 10 resolved HCPs
    if len(resolved_hcp_ids) > 10:
        sample10_ids = rng.sample(resolved_hcp_ids, 10)
    else:
        sample10_ids = resolved_hcp_ids
    random_sample_10: List[Dict[str, Any]] = []
    for hid in sample10_ids:
        res = resolved_by_hcp[hid]
        name_bits = hcp_name_by_id.get(hid, {})
        random_sample_10.append(
            {
                "hcp_id": hid,
                "hcp_name": f"{name_bits.get('first_name', '')} {name_bits.get('last_name', '')}".strip(),
                "openalex_author_id": res["openalex_author_id"],
                "resolution_confidence": res["openalex_resolution_confidence"],
                "vote_count": res["vote_count"],
                "high_votes": res["high_votes"],
                "medium_votes": res["medium_votes"],
            }
        )

    elapsed_seconds = time.time() - started
    log_payload = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "mode": mode,
        "elapsed_seconds": elapsed_seconds,
        "step1_stats": step1_stats,
        "step2_stats": step2_stats,
        "canonicals": canonical_outputs,
        "random_sample_10_resolved_hcps": random_sample_10,
        "errors": errors,
    }
    with open(OUTPUT_LOG_PATH, "w", encoding="utf-8") as f:
        json.dump(log_payload, f, indent=2)
    print(f"Saved log: {OUTPUT_LOG_PATH}")
