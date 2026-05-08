import argparse
import json
import os
import random
import time
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Set, Tuple
from urllib.error import HTTPError, URLError
from urllib.parse import quote_plus
from urllib.request import Request, urlopen

import psycopg
from dotenv import load_dotenv
from psycopg.rows import dict_row
from supabase import Client, create_client


CHECKPOINT_PATH = r"C:\Users\garre\Desktop\FieldMark\phase2_checkpoint.json"
OUTPUT_LOG_PATH = r"C:\Users\garre\Desktop\FieldMark\publication_backfill_phase2_log.json"
OPENALEX_BASE = "https://api.openalex.org/authors"

CANONICAL_LOOMBA_ID = "9339ead6-2023-4e69-9eda-2914553a2e20"
PROGRESS_EVERY = 100


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--dry-run", action="store_true", default=False)
    parser.add_argument("--execute", action="store_true", default=False)
    parser.add_argument("--reset-checkpoint", action="store_true", default=False)
    parser.add_argument("--limit", type=int, default=None)
    return parser.parse_args()


def get_required_env(name: str) -> str:
    value = os.getenv(name)
    if not value:
        raise EnvironmentError(f"Missing required environment variable: {name}")
    return value


def init_supabase() -> Client:
    return create_client(get_required_env("SUPABASE_URL"), get_required_env("SUPABASE_KEY"))


def normalize_text(v: Any) -> str:
    return " ".join(str(v or "").strip().lower().split())


def word_overlap_score(a: str, b: str) -> float:
    wa = {x for x in normalize_text(a).split() if len(x) > 2}
    wb = {x for x in normalize_text(b).split() if len(x) > 2}
    if not wa or not wb:
        return 0.0
    inter = len(wa.intersection(wb))
    union = len(wa.union(wb))
    return inter / union if union > 0 else 0.0


def load_checkpoint() -> Set[str]:
    if not os.path.exists(CHECKPOINT_PATH):
        return set()
    with open(CHECKPOINT_PATH, "r", encoding="utf-8") as f:
        payload = json.load(f)
    ids = payload.get("processed_hcp_ids") or []
    return {str(x) for x in ids}


def save_checkpoint(processed_hcp_ids: Set[str]) -> None:
    payload = {"processed_hcp_ids": sorted(processed_hcp_ids)}
    with open(CHECKPOINT_PATH, "w", encoding="utf-8") as f:
        json.dump(payload, f, indent=2)


def fetch_phase2_cohort(database_url: str) -> List[Dict[str, Any]]:
    sql = """
        SELECT
          h.id,
          h.npi_number,
          h.first_name,
          h.last_name,
          h.nppes_organization_name,
          h.nppes_practice_state,
          h.nppes_practice_city,
          array_remove(array_agg(DISTINCT ta.name), NULL) AS ta_names
        FROM hcps h
        LEFT JOIN hcp_therapeutic_areas hta ON hta.hcp_id = h.id
        LEFT JOIN therapeutic_areas ta ON ta.id = hta.therapeutic_area_id
        WHERE h.npi_number IS NOT NULL
          AND h.openalex_author_id IS NULL
        GROUP BY
          h.id,
          h.npi_number,
          h.first_name,
          h.last_name,
          h.nppes_organization_name,
          h.nppes_practice_state,
          h.nppes_practice_city
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


def fetch_loomba_snapshot(database_url: str) -> Dict[str, Any]:
    sql = """
        SELECT id, first_name, last_name, openalex_author_id, openalex_resolution_confidence
        FROM hcps
        WHERE id = %s
        LIMIT 1
    """
    with psycopg.connect(database_url, row_factory=dict_row) as conn:
        with conn.cursor() as cur:
            cur.execute(sql, (CANONICAL_LOOMBA_ID,))
            row = cur.fetchone()
            if not row:
                return {"hcp_id": CANONICAL_LOOMBA_ID, "found": False}
            return {
                "hcp_id": str(row["id"]),
                "found": True,
                "first_name": row.get("first_name"),
                "last_name": row.get("last_name"),
                "openalex_author_id": row.get("openalex_author_id"),
                "openalex_resolution_confidence": row.get("openalex_resolution_confidence"),
            }


def call_openalex_with_retries(search_name: str, mailto: str) -> Dict[str, Any]:
    last_error = None
    for attempt in range(3):
        time.sleep(0.2)
        try:
            url = (
                f"{OPENALEX_BASE}?search={quote_plus(search_name)}"
                f"&per-page=10&mailto={quote_plus(mailto)}"
            )
            req = Request(url, headers={"User-Agent": "FieldMark-Phase2/1.0"})
            with urlopen(req, timeout=30) as resp:
                body = resp.read().decode("utf-8")
            return json.loads(body)
        except HTTPError as exc:
            if exc.code == 429:
                # Rate limited — back off aggressively. OpenAlex doesn't
                # always return Retry-After but when it does we honor it.
                retry_after_header = None
                try:
                    retry_after_header = exc.headers.get("Retry-After") if exc.headers else None
                except Exception:
                    retry_after_header = None
                if retry_after_header:
                    try:
                        backoff = int(retry_after_header)
                    except (TypeError, ValueError):
                        backoff = 60
                else:
                    backoff = 30 * (attempt + 1)  # 30s, 60s, 90s
                last_error = exc
                time.sleep(backoff)
                continue
            if 500 <= exc.code < 600:
                last_error = exc
                time.sleep(5 * (attempt + 1))  # 5s, 10s, 15s
                continue
            raise
        except (URLError, TimeoutError, ConnectionError) as exc:
            last_error = exc
            time.sleep(5 * (attempt + 1))  # 5s, 10s, 15s
            continue
    raise RuntimeError(f"OpenAlex request failed after retries: {repr(last_error)}")


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
    processed_ids = load_checkpoint()

    print("Fetching phase2 cohort via direct Postgres...")
    cohort_all = fetch_phase2_cohort(database_url)
    if args.limit is not None:
        cohort_all = cohort_all[: args.limit]

    cohort_to_process = [r for r in cohort_all if r["id"] not in processed_ids]
    cohort_size = len(cohort_to_process)
    print(f"Cohort size to process: {cohort_size}")

    results_by_hcp: Dict[str, Dict[str, Any]] = {}
    updates_payload: List[Dict[str, Any]] = []

    resolved_high = 0
    resolved_medium = 0
    resolved_low = 0
    ambiguous_count = 0
    ambiguous_no_candidates_returned = 0
    ambiguous_no_name_match = 0
    ambiguous_score_tie = 0
    ambiguous_api_error = 0
    candidates_returned_zero_count = 0
    processed_count = 0
    consecutive_api_errors = 0
    CIRCUIT_BREAKER_THRESHOLD = 20

    window_errors = 0
    window_processed = 0
    progress_started = time.time()

    for hcp in cohort_to_process:
        hcp_id = hcp["id"]
        first_name = str(hcp.get("first_name") or "").strip()
        last_name = str(hcp.get("last_name") or "").strip()
        if not first_name or not last_name:
            errors.append(f"hcp_{hcp_id}: missing first/last name")
            processed_ids.add(hcp_id)
            processed_count += 1
            window_errors += 1
            window_processed += 1
            continue

        ta_names = hcp.get("ta_names") or []
        ta_names_norm = [normalize_text(x) for x in ta_names if x]
        org_name = str(hcp.get("nppes_organization_name") or "").strip()
        target_full = normalize_text(f"{first_name} {last_name}")
        target_last = normalize_text(last_name)
        target_first_initial = normalize_text(first_name)[:1]

        chosen_author_id = None
        chosen_confidence = None
        chosen_score = None
        chosen_reason = None
        candidate_scores: List[Dict[str, Any]] = []

        try:
            response = call_openalex_with_retries(f"{first_name} {last_name}", polite_mailto)
            candidates = response.get("results") or []
            consecutive_api_errors = 0  # Reset on success
            if not candidates:
                candidates_returned_zero_count += 1

            for cand in candidates:
                display_name = normalize_text(cand.get("display_name"))
                cand_id = str(cand.get("id") or "").strip()
                if not cand_id or not display_name:
                    continue

                name_exact = display_name == target_full
                name_partial = False
                tokens = display_name.split()
                if not name_exact and len(tokens) >= 2 and target_last and target_first_initial:
                    name_partial = tokens[-1] == target_last and tokens[0][:1] == target_first_initial
                if not (name_exact or name_partial):
                    continue

                institutions = cand.get("last_known_institutions") or []
                inst_match = False
                country_match = False
                if isinstance(institutions, list):
                    for inst in institutions:
                        if not isinstance(inst, dict):
                            continue
                        inst_name = str(inst.get("display_name") or "")
                        inst_name_norm = normalize_text(inst_name)
                        if str(inst.get("country_code") or "").upper() == "US":
                            country_match = True
                        if org_name:
                            org_norm = normalize_text(org_name)
                            if org_norm and (
                                org_norm in inst_name_norm
                                or inst_name_norm in org_norm
                                or word_overlap_score(org_norm, inst_name_norm) >= 0.4
                            ):
                                inst_match = True

                topic_match = False
                concepts = cand.get("x_concepts") or []
                if isinstance(concepts, list):
                    for concept in concepts[:5]:
                        if not isinstance(concept, dict):
                            continue
                        c_name = normalize_text(concept.get("display_name"))
                        if any(ta and ta in c_name for ta in ta_names_norm):
                            topic_match = True
                            break

                score = 0.0
                score += 3.0 if name_exact else 1.5
                if inst_match:
                    score += 2.0
                if country_match:
                    score += 0.5
                if topic_match:
                    score += 0.75

                if name_exact and (inst_match or (country_match and topic_match)):
                    confidence = "high"
                elif (name_exact and country_match) or (name_partial and inst_match):
                    confidence = "medium"
                else:
                    confidence = "low"

                candidate_scores.append(
                    {
                        "openalex_author_id": cand_id,
                        "display_name": cand.get("display_name"),
                        "score": score,
                        "confidence": confidence,
                        "name_exact": name_exact,
                        "name_partial": name_partial,
                        "institution_match": inst_match,
                        "country_match": country_match,
                        "topic_match": topic_match,
                    }
                )

            candidate_scores.sort(key=lambda x: x["score"], reverse=True)

            if not candidate_scores:
                chosen_confidence = "ambiguous"
                if not candidates:
                    chosen_reason = "no_candidates_returned"
                    ambiguous_no_candidates_returned += 1
                else:
                    chosen_reason = "no_candidate_matched_name_rules"
                    ambiguous_no_name_match += 1
                ambiguous_count += 1
            elif len(candidate_scores) > 1 and abs(candidate_scores[0]["score"] - candidate_scores[1]["score"]) <= 0.5:
                chosen_confidence = "ambiguous"
                chosen_reason = "top_score_tie_within_0_5"
                ambiguous_count += 1
                ambiguous_score_tie += 1
            else:
                best = candidate_scores[0]
                cand_id = str(best["openalex_author_id"])
                if cand_id.startswith("https://openalex.org/"):
                    chosen_author_id = cand_id
                else:
                    chosen_author_id = f"https://openalex.org/{cand_id.split('/')[-1]}"
                chosen_confidence = best["confidence"]
                chosen_score = best["score"]
                chosen_reason = "best_candidate_by_score"
                if chosen_confidence == "high":
                    resolved_high += 1
                elif chosen_confidence == "medium":
                    resolved_medium += 1
                else:
                    resolved_low += 1

        except Exception as exc:
            window_errors += 1
            errors.append(f"hcp_{hcp_id}: {repr(exc)}")
            chosen_confidence = "ambiguous"
            chosen_reason = "persistent_openalex_error"
            ambiguous_count += 1
            ambiguous_api_error += 1
            consecutive_api_errors += 1
            if consecutive_api_errors >= CIRCUIT_BREAKER_THRESHOLD:
                print(f"CIRCUIT BREAKER: {consecutive_api_errors} consecutive API errors. Aborting to avoid wasted work.")
                save_checkpoint(processed_ids)
                # Save partial log
                log_payload = {
                    "generated_at": datetime.now(timezone.utc).isoformat(),
                    "mode": mode,
                    "elapsed_seconds": time.time() - started,
                    "cohort_size": cohort_size,
                    "processed_count": processed_count,
                    "resolved_high": resolved_high,
                    "resolved_medium": resolved_medium,
                    "resolved_low": resolved_low,
                    "ambiguous_count": ambiguous_count,
                    "ambiguous_breakdown": {
                        "no_candidates_returned": ambiguous_no_candidates_returned,
                        "no_name_match_among_candidates": ambiguous_no_name_match,
                        "score_tie_within_0_5": ambiguous_score_tie,
                        "persistent_api_error": ambiguous_api_error,
                    },
                    "candidates_returned_zero_count": candidates_returned_zero_count,
                    "errors": errors,
                    "circuit_breaker_tripped": True,
                }
                with open(OUTPUT_LOG_PATH, "w", encoding="utf-8") as f:
                    json.dump(log_payload, f, indent=2)
                print(f"Saved log: {OUTPUT_LOG_PATH}")
                raise SystemExit(2)

        row_result = {
            "id": hcp_id,
            "openalex_author_id": chosen_author_id,
            "openalex_resolution_method": "name_institution_search",
            "openalex_resolution_confidence": chosen_confidence or "ambiguous",
            "openalex_resolved_at": datetime.now(timezone.utc).isoformat(),
            "score": chosen_score,
            "reason": chosen_reason,
            "candidate_count": len(candidate_scores),
        }
        results_by_hcp[hcp_id] = row_result
        updates_payload.append(row_result)
        
        # Write immediately for durability — overnight runs need each
        # HCP's result persisted before moving on, so a crash doesn't
        # waste API budget.
        if execute:
            row_id = row_result["id"]
            update_payload = {
                k: v for k, v in row_result.items()
                if k not in ("id", "score", "reason", "candidate_count")
            }
            try:
                client.table("hcps").update(update_payload).eq("id", row_id).execute()
            except Exception as exc:
                errors.append(f"update_row_{row_id}: {repr(exc)}")

        processed_ids.add(hcp_id)
        processed_count += 1
        window_processed += 1

        if processed_count % PROGRESS_EVERY == 0:
            save_checkpoint(processed_ids)
            elapsed = time.time() - progress_started
            rate = processed_count / elapsed if elapsed > 0 else 0.0
            remaining = max(cohort_size - processed_count, 0)
            eta = (remaining / rate) if rate > 0 else None
            print(
                f"Processed {processed_count}/{cohort_size} | "
                f"elapsed={elapsed:.1f}s rate={rate:.2f} hcp/s "
                f"eta={eta:.1f}s" if eta is not None else
                f"Processed {processed_count}/{cohort_size} | elapsed={elapsed:.1f}s rate={rate:.2f} hcp/s eta=unknown"
            )
            print(
                f"  confidence: high={resolved_high} medium={resolved_medium} "
                f"low={resolved_low} ambiguous={ambiguous_count} "
                f"(no_results={ambiguous_no_candidates_returned} "
                f"no_match={ambiguous_no_name_match} "
                f"tie={ambiguous_score_tie} "
                f"api_err={ambiguous_api_error})"
            )
            window_error_rate = (window_errors / window_processed) if window_processed > 0 else 0.0
            if window_error_rate > 0.20:
                print(
                    f"WARNING: error rate {window_error_rate:.1%} in last {window_processed} HCP window."
                )
            window_errors = 0
            window_processed = 0

    save_checkpoint(processed_ids)

    if execute:
        # Writes happened inline during the main loop. Just print summary.
        update_errors = sum(1 for e in errors if e.startswith("update_row_"))
        print(f"Execute writes complete (inline). Update errors: {update_errors}")
    else:
        print("[DRY-RUN] Skipping hcps updates.")

    # Canonical output: Loomba + 5 random resolved this run
    loomba_snapshot = fetch_loomba_snapshot(database_url)
    resolved_this_run_ids = [
        rid
        for rid, r in results_by_hcp.items()
        if r.get("openalex_author_id") and r.get("openalex_resolution_confidence") in ("high", "medium", "low")
    ]
    rng = random.Random(42)
    if len(resolved_this_run_ids) > 5:
        sample_ids = rng.sample(resolved_this_run_ids, 5)
    else:
        sample_ids = resolved_this_run_ids

    canonical_results = [{"label": "Loomba", "record": loomba_snapshot}]
    for rid in sample_ids:
        canonical_results.append({"label": "random_resolved", "record": results_by_hcp[rid]})

    print("Canonical / sample results:")
    print(json.dumps(canonical_results, indent=2))

    elapsed_seconds = time.time() - started
    log_payload = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "mode": mode,
        "elapsed_seconds": elapsed_seconds,
        "cohort_size": cohort_size,
        "processed_count": processed_count,
        "resolved_high": resolved_high,
        "resolved_medium": resolved_medium,
        "resolved_low": resolved_low,
        "ambiguous_count": ambiguous_count,
        "ambiguous_breakdown": {
            "no_candidates_returned": ambiguous_no_candidates_returned,
            "no_name_match_among_candidates": ambiguous_no_name_match,
            "score_tie_within_0_5": ambiguous_score_tie,
            "persistent_api_error": ambiguous_api_error,
        },
        "candidates_returned_zero_count": candidates_returned_zero_count,
        "errors": errors,
        "canonical_results": canonical_results,
    }

    with open(OUTPUT_LOG_PATH, "w", encoding="utf-8") as f:
        json.dump(log_payload, f, indent=2)
    print(f"Saved log: {OUTPUT_LOG_PATH}")
