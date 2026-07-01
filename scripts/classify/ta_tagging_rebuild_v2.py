from __future__ import annotations

import argparse
import json
import logging
import os
import statistics
import time
from collections import Counter, defaultdict
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Set, Tuple

from dotenv import load_dotenv
from supabase import Client, create_client

READ_PAGE_SIZE = 500
WRITE_BATCH_SIZE = 500
CONCEPT_SCORE_THRESHOLD = 0.4
WEIGHTED_RELEVANT_THRESHOLD = 5.0
FRACTION_THRESHOLD = 0.30
OUTPUT_LOG_PATH = "ta_tagging_rebuild_log.json"

CANONICALS = [
    {"label": "Loomba", "hcp_id": "8a5ed89d-df8a-4b7c-a5f7-37f602b63577", "expected_ta": "Hepatology"},
    {"label": "Sanyal", "hcp_id": "be751618-9371-4ce1-8760-c579599fd30e", "expected_ta": "Hepatology"},
    {"label": "Chalasani", "hcp_id": "22388b63-dc82-44d7-abaa-24ab8f4ab8eb", "expected_ta": "Hepatology"},
    {"label": "Kowdley", "hcp_id": "272ff3bc-0464-499b-9ab2-1ceae503e415", "expected_ta": "Hepatology"},
]

logger = logging.getLogger("ta_tagging_rebuild")
logging.basicConfig(level=logging.INFO, format="%(message)s")


def env(name: str) -> str:
    v = os.getenv(name)
    if not v:
        raise EnvironmentError(f"Missing env var: {name}")
    return v


def sb() -> Client:
    return create_client(env("SUPABASE_URL"), env("SUPABASE_KEY"))


def recency_multiplier(pub_year: Optional[int]) -> float:
    if pub_year is None:
        return 0.5
    if pub_year >= 2020:
        return 1.5
    if pub_year >= 2015:
        return 1.0
    return 0.5


def fetch_curated_concepts(client: Client) -> Dict[str, Set[str]]:
    """Return {ta_id: set(openalex_concept_ids)}."""
    print("Loading curated_ta_concepts...")
    rows = client.table("curated_ta_concepts").select("therapeutic_area_id,openalex_concept_id").execute().data or []
    by_ta: Dict[str, Set[str]] = defaultdict(set)
    for r in rows:
        ta_id = str(r.get("therapeutic_area_id") or "")
        c_id = str(r.get("openalex_concept_id") or "")
        if ta_id and c_id:
            by_ta[ta_id].add(c_id)
    for ta_id, concepts in by_ta.items():
        print(f"  TA {ta_id}: {len(concepts)} curated concepts")
    return dict(by_ta)


def fetch_ta_names(client: Client) -> Dict[str, str]:
    rows = client.table("therapeutic_areas").select("id,name").execute().data or []
    return {str(r["id"]): str(r["name"]) for r in rows if r.get("id")}


def compute_pub_ta_scores(
    client: Client, curated: Dict[str, Set[str]]
) -> Dict[str, Dict[str, Tuple[float, Optional[int]]]]:
    """For each publication, compute its TA relevance scores.
    Returns: {pub_id: {ta_id: (ta_score, pub_year)}}
    Only pubs with at least one non-zero TA score are stored.
    """
    print("\n=== Phase 2: Computing per-publication TA scores ===")
    pub_ta_scores: Dict[str, Dict[str, Tuple[float, Optional[int]]]] = {}
    offset = 0
    total_pubs_scanned = 0
    total_pubs_with_score = 0
    start = time.time()

    while True:
        page = (
            client.table("publications_v2")
            .select("id,openalex_concepts,pub_year")
            .not_.is_("openalex_concepts", "null")
            .order("id")
            .range(offset, offset + READ_PAGE_SIZE - 1)
            .execute()
            .data
            or []
        )
        if not page:
            break

        for row in page:
            pub_id = str(row.get("id") or "")
            if not pub_id:
                continue
            concepts = row.get("openalex_concepts") or []
            if not isinstance(concepts, list) or not concepts:
                continue
            pub_year = row.get("pub_year")
            try:
                pub_year_int = int(pub_year) if pub_year is not None else None
            except (TypeError, ValueError):
                pub_year_int = None

            # Build lookup of this pub's concepts that meet score threshold
            pub_concept_scores: Dict[str, float] = {}
            for c in concepts:
                if not isinstance(c, dict):
                    continue
                c_id = c.get("id")
                try:
                    c_score = float(c.get("score") or 0)
                except (TypeError, ValueError):
                    continue
                if c_id and c_score >= CONCEPT_SCORE_THRESHOLD:
                    pub_concept_scores[str(c_id)] = c_score

            if not pub_concept_scores:
                continue

            # For each TA, sum concept scores that match curated list
            ta_scores: Dict[str, Tuple[float, Optional[int]]] = {}
            for ta_id, curated_set in curated.items():
                matched_sum = sum(
                    score for c_id, score in pub_concept_scores.items() if c_id in curated_set
                )
                if matched_sum > 0:
                    ta_scores[ta_id] = (matched_sum, pub_year_int)

            if ta_scores:
                pub_ta_scores[pub_id] = ta_scores
                total_pubs_with_score += 1

            total_pubs_scanned += 1

        offset += len(page)
        if total_pubs_scanned % 25000 < READ_PAGE_SIZE:
            elapsed = time.time() - start
            rate = total_pubs_scanned / elapsed if elapsed > 0 else 0
            print(
                f"  Scanned {total_pubs_scanned} pubs | {total_pubs_with_score} with TA score | "
                f"{rate:.0f} pubs/sec"
            )

        if len(page) < READ_PAGE_SIZE:
            break

    elapsed = time.time() - start
    print(
        f"Phase 2 complete: {total_pubs_scanned} pubs scanned, {total_pubs_with_score} "
        f"have at least one TA score. Elapsed: {elapsed:.1f}s"
    )
    return pub_ta_scores


def aggregate_hcp_ta_signals(
    client: Client,
    pub_ta_scores: Dict[str, Dict[str, Tuple[float, Optional[int]]]],
) -> Tuple[Dict[Tuple[str, str], Dict[str, float]], Dict[str, int]]:
    """Iterate publication_authors_v2 and aggregate per-HCP per-TA signals.

    Returns:
        hcp_ta_aggregates: {(hcp_id, ta_id): {weighted_relevant, relevant_count}}
        hcp_total_pubs: {hcp_id: total_pub_count}
    """
    print("\n=== Phase 3: Aggregating per-HCP per-TA signals ===")
    hcp_ta_aggregates: Dict[Tuple[str, str], Dict[str, float]] = defaultdict(
        lambda: {"weighted_relevant": 0.0, "relevant_count": 0}
    )
    hcp_total_pubs: Dict[str, int] = defaultdict(int)

    offset = 0
    total_rows = 0
    start = time.time()

    while True:
        page = (
            client.table("publication_authors_v2")
            .select("hcp_id,publication_id")
            .order("publication_id")
            .range(offset, offset + READ_PAGE_SIZE - 1)
            .execute()
            .data
            or []
        )
        if not page:
            break

        for row in page:
            hcp_id = str(row.get("hcp_id") or "")
            pub_id = str(row.get("publication_id") or "")
            if not hcp_id or not pub_id:
                continue
            hcp_total_pubs[hcp_id] += 1
            ta_scores = pub_ta_scores.get(pub_id)
            if not ta_scores:
                continue
            for ta_id, (ta_score, pub_year) in ta_scores.items():
                mult = recency_multiplier(pub_year)
                agg = hcp_ta_aggregates[(hcp_id, ta_id)]
                agg["weighted_relevant"] += ta_score * mult
                agg["relevant_count"] += 1

        total_rows += len(page)
        offset += len(page)
        if total_rows % 100000 < READ_PAGE_SIZE:
            elapsed = time.time() - start
            rate = total_rows / elapsed if elapsed > 0 else 0
            print(
                f"  Scanned {total_rows} authorship rows | "
                f"{len(hcp_total_pubs)} HCPs tracked | "
                f"{len(hcp_ta_aggregates)} (hcp,ta) buckets | {rate:.0f} rows/sec"
            )

        if len(page) < READ_PAGE_SIZE:
            break

    elapsed = time.time() - start
    print(
        f"Phase 3 complete: {total_rows} authorship rows scanned, "
        f"{len(hcp_total_pubs)} distinct HCPs, "
        f"{len(hcp_ta_aggregates)} (hcp,ta) buckets. Elapsed: {elapsed:.1f}s"
    )
    return dict(hcp_ta_aggregates), dict(hcp_total_pubs)


def apply_gate_and_emit(
    hcp_ta_aggregates: Dict[Tuple[str, str], Dict[str, float]],
    hcp_total_pubs: Dict[str, int],
) -> List[Dict[str, Any]]:
    """Apply two-condition gate, return rows to upsert."""
    print("\n=== Phase 4: Applying two-condition gate ===")
    now_iso = datetime.now(timezone.utc).isoformat()
    out_rows: List[Dict[str, Any]] = []
    rejected = 0

    for (hcp_id, ta_id), agg in hcp_ta_aggregates.items():
        weighted = agg["weighted_relevant"]
        rel_count = int(agg["relevant_count"])
        total = hcp_total_pubs.get(hcp_id, 0)
        if total == 0:
            rejected += 1
            continue
        fraction = rel_count / total
        passes_weighted = weighted >= WEIGHTED_RELEVANT_THRESHOLD
        passes_fraction = fraction >= FRACTION_THRESHOLD
        if not (passes_weighted or passes_fraction):
            rejected += 1
            continue
        out_rows.append(
            {
                "hcp_id": hcp_id,
                "therapeutic_area_id": ta_id,
                "publication_count": rel_count,
                "assigned_at": now_iso,
            }
        )

    print(
        f"Phase 4 complete: {len(out_rows)} rows pass gate, {rejected} rejected. "
        f"Total candidate (hcp,ta) buckets: {len(hcp_ta_aggregates)}"
    )
    return out_rows


def write_rows(client: Client, rows: List[Dict[str, Any]]) -> int:
    """Batch upsert to hcp_therapeutic_areas_v2 with silent-success check."""
    if not rows:
        return 0
    inserted = 0
    for i in range(0, len(rows), WRITE_BATCH_SIZE):
        batch = rows[i : i + WRITE_BATCH_SIZE]
        try:
            response = (
                client.table("hcp_therapeutic_areas_v2")
                .upsert(batch, on_conflict="hcp_id,therapeutic_area_id")
                .execute()
            )
            if not response.data:
                raise RuntimeError(
                    f"hcp_therapeutic_areas_v2 upsert returned empty data ({len(batch)} rows) - "
                    f"writes may have been silently dropped"
                )
            inserted += len(response.data)
            print(f"Inserted batch {i // WRITE_BATCH_SIZE + 1} ({inserted}/{len(rows)})")
        except Exception as exc:
            logger.error(f"Upsert failed for batch at offset {i}: {exc}")
            raise
    return inserted


def compute_level_1_stats(
    rows: List[Dict[str, Any]],
    hcp_ta_aggregates: Dict[Tuple[str, str], Dict[str, float]],
    ta_names: Dict[str, str],
) -> Dict[str, Any]:
    by_ta_counts: Counter = Counter()
    weighted_values_by_ta: Dict[str, List[float]] = defaultdict(list)
    pub_count_by_ta: Dict[str, List[int]] = defaultdict(list)
    for r in rows:
        ta_name = ta_names.get(r["therapeutic_area_id"], r["therapeutic_area_id"])
        by_ta_counts[ta_name] += 1
        agg = hcp_ta_aggregates.get((r["hcp_id"], r["therapeutic_area_id"]))
        if agg:
            weighted_values_by_ta[ta_name].append(agg["weighted_relevant"])
        pub_count_by_ta[ta_name].append(r["publication_count"])

    weighted_stats = {}
    for ta_name, vals in weighted_values_by_ta.items():
        if vals:
            weighted_stats[ta_name] = {
                "mean": statistics.fmean(vals),
                "median": statistics.median(vals),
                "min": min(vals),
                "max": max(vals),
                "count": len(vals),
            }

    pub_count_stats = {}
    for ta_name, vals in pub_count_by_ta.items():
        if vals:
            pub_count_stats[ta_name] = {
                "mean": statistics.fmean(vals),
                "median": statistics.median(vals),
                "min": min(vals),
                "max": max(vals),
            }

    return {
        "hcps_tagged_per_ta": dict(by_ta_counts),
        "weighted_relevant_stats_per_ta": weighted_stats,
        "publication_count_stats_per_ta": pub_count_stats,
        "total_rows": len(rows),
        "distinct_hcps_tagged": len({r["hcp_id"] for r in rows}),
    }


def compute_canonical_check(
    rows: List[Dict[str, Any]],
    hcp_ta_aggregates: Dict[Tuple[str, str], Dict[str, float]],
    hcp_total_pubs: Dict[str, int],
    ta_names: Dict[str, str],
) -> List[Dict[str, Any]]:
    ta_id_by_name = {v: k for k, v in ta_names.items()}
    row_lookup = {(r["hcp_id"], r["therapeutic_area_id"]): r for r in rows}
    out = []
    for c in CANONICALS:
        ta_id = ta_id_by_name.get(c["expected_ta"])
        entry = {
            "label": c["label"],
            "hcp_id": c["hcp_id"],
            "expected_ta": c["expected_ta"],
            "tagged": False,
            "weighted_relevant": None,
            "relevant_count": None,
            "total_pubs": hcp_total_pubs.get(c["hcp_id"]),
            "fraction": None,
        }
        if ta_id:
            agg = hcp_ta_aggregates.get((c["hcp_id"], ta_id))
            if agg:
                entry["weighted_relevant"] = agg["weighted_relevant"]
                entry["relevant_count"] = int(agg["relevant_count"])
                total = hcp_total_pubs.get(c["hcp_id"], 0)
                entry["fraction"] = (entry["relevant_count"] / total) if total > 0 else None
            entry["tagged"] = (c["hcp_id"], ta_id) in row_lookup
        out.append(entry)
        print(f"Canonical {c['label']}: {json.dumps(entry, default=str)}")
    return out


def run(execute: bool) -> None:
    load_dotenv()
    client = sb()
    started = time.time()
    mode = "execute" if execute else "dry_run"
    errors: List[str] = []

    # Phase 1: reference data
    curated = fetch_curated_concepts(client)
    ta_names = fetch_ta_names(client)
    if not curated:
        raise RuntimeError("curated_ta_concepts is empty - cannot proceed")

    # Phase 2: per-pub TA scores
    pub_ta_scores = compute_pub_ta_scores(client, curated)

    # Phase 3: per-HCP aggregation
    hcp_ta_aggregates, hcp_total_pubs = aggregate_hcp_ta_signals(client, pub_ta_scores)

    # Phase 4: apply gate
    rows = apply_gate_and_emit(hcp_ta_aggregates, hcp_total_pubs)

    # Stats
    level_1 = compute_level_1_stats(rows, hcp_ta_aggregates, ta_names)
    print("\n=== Level 1 stats ===")
    print(json.dumps(level_1, indent=2, default=str))

    print("\n=== Level 2 canonicals ===")
    level_2 = compute_canonical_check(rows, hcp_ta_aggregates, hcp_total_pubs, ta_names)

    # Phase 5: write
    rows_inserted: Optional[int] = None
    if not execute:
        print("\n[DRY-RUN] Skipping write.")
    else:
        confirm = input(
            f"\nAbout to UPSERT {len(rows)} rows into hcp_therapeutic_areas_v2. "
            f"Continue? (yes/no): "
        )
        if confirm != "yes":
            print("Execution cancelled.")
            errors.append("execute_cancelled_by_user")
        else:
            try:
                rows_inserted = write_rows(client, rows)
                print(f"\nWrite complete: {rows_inserted}/{len(rows)} rows inserted.")
            except Exception as exc:
                errors.append(f"write_failed: {repr(exc)}")
                print(f"Write failed: {exc}")

    # Log
    elapsed = time.time() - started
    log_payload = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "mode": mode,
        "elapsed_seconds": elapsed,
        "level_1_stats": level_1,
        "level_2_canonicals": level_2,
        "errors": errors,
    }
    if rows_inserted is not None:
        log_payload["rows_inserted"] = rows_inserted
    with open(OUTPUT_LOG_PATH, "w", encoding="utf-8") as f:
        json.dump(log_payload, f, indent=2, default=str)
    print(f"\nSaved log: {OUTPUT_LOG_PATH}")


if __name__ == "__main__":
    p = argparse.ArgumentParser(description="Rebuild hcp_therapeutic_areas_v2 from publication concepts")
    p.add_argument("--execute", action="store_true", default=False, help="Enable writes (default dry-run)")
    args = p.parse_args()
    run(args.execute)
