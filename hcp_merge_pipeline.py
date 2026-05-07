from __future__ import annotations

import argparse
import json
import os
from collections import Counter, defaultdict
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Dict, Iterable, List, Optional, Sequence, Tuple

from dotenv import load_dotenv
from supabase import Client, create_client

AUDIT_FILE = "dedupe_audit_output.json"
CHECKPOINT_FILE = "merge_checkpoint.json"
PROGRESS_EVERY = 500
CHECKPOINT_EVERY = 100
SAMPLE_COUNT = 10
FK_TABLES = [
    "publications",
    "hcp_scores",
    "hcp_therapeutic_areas",
    "trial_investigators",
    "hcp_narratives",
]

SOCIAL_FIELDS = [
    "twitter_handle",
    "twitter_followers",
    "twitter_bio",
    "twitter_following",
    "twitter_tweet_count",
    "twitter_verified",
    "twitter_enriched_at",
    "bluesky_handle",
    "bluesky_followers",
    "bluesky_bio",
    "bluesky_posts",
    "bluesky_enriched_at",
    "social_verified",
    "social_verification_method",
    "social_verification_reasoning",
    "social_verified_at",
]

SCHOLAR_FIELDS = [
    "scholar_h_index",
    "scholar_citations_total",
    "scholar_i10_index",
]


@dataclass
class MergeGroup:
    category: str  # "A" or "B"
    rows: List[Dict]


def get_required_env(name: str) -> str:
    value = os.getenv(name)
    if not value:
        raise EnvironmentError(f"Missing required environment variable: {name}")
    return value


def init_supabase() -> Client:
    return create_client(get_required_env("SUPABASE_URL"), get_required_env("SUPABASE_KEY"))


def ns(value: Optional[str]) -> str:
    return " ".join(str(value or "").strip().split())


def parse_dt(value: Optional[str]) -> datetime:
    if not value:
        return datetime(1970, 1, 1, tzinfo=timezone.utc)
    text = str(value).strip()
    if text.endswith("Z"):
        text = text[:-1] + "+00:00"
    try:
        dt = datetime.fromisoformat(text)
    except ValueError:
        return datetime(1970, 1, 1, tzinfo=timezone.utc)
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt


def parse_int(value: Optional[object], default: int = 0) -> int:
    try:
        if value is None:
            return default
        return int(value)
    except Exception:
        return default


def truthy(value: Optional[object]) -> bool:
    return bool(value is True)


def majority_non_null(rows: Sequence[Dict], field: str) -> Optional[str]:
    values = [ns(r.get(field)) for r in rows if ns(r.get(field))]
    if not values:
        return None
    counts = Counter(values)
    return counts.most_common(1)[0][0]


def any_non_null(rows: Sequence[Dict], field: str) -> Optional[object]:
    for r in rows:
        value = r.get(field)
        if value is None:
            continue
        if isinstance(value, str) and not value.strip():
            continue
        return value
    return None


def load_groups(audit_path: str) -> List[MergeGroup]:
    payload = json.load(open(audit_path, "r", encoding="utf-8"))
    groups: List[MergeGroup] = []
    for row in payload.get("groups_by_category", {}).get("safe_auto_merge", []):
        groups.append(MergeGroup(category="A", rows=row.get("rows", [])))
    for row in payload.get("groups_by_category", {}).get("likely_safe_needs_check", []):
        groups.append(MergeGroup(category="B", rows=row.get("rows", [])))
    return groups


def pick_canonical(rows: Sequence[Dict]) -> Dict:
    def sort_key(r: Dict) -> Tuple:
        updated = parse_dt(r.get("updated_at"))
        has_npi = 1 if ns(r.get("npi_number")) else 0
        has_inst = 1 if ns(r.get("institution_short")) else 0
        pubs = parse_int(r.get("total_career_pubs"), default=-1)
        uuid_text = str(r.get("id") or "")
        return (-updated.timestamp(), -has_npi, -has_inst, -pubs, uuid_text)

    return sorted(rows, key=sort_key)[0]


def build_alternative_affiliations(canonical: Dict, noncanon_rows: Sequence[Dict]) -> List[Dict]:
    out: List[Dict] = []
    seen = set()
    c_inst = ns(canonical.get("institution_short"))
    c_inst_full = ns(canonical.get("institution_full"))
    c_city = ns(canonical.get("city"))
    c_state = ns(canonical.get("state"))
    c_country = ns(canonical.get("country"))
    for row in noncanon_rows:
        item = {
            "institution_short": row.get("institution_short"),
            "institution_full": row.get("institution_full"),
            "city": row.get("city"),
            "state": row.get("state"),
            "country": row.get("country"),
            "source_row_id": row.get("id"),
        }
        key = (
            ns(item["institution_short"]),
            ns(item["institution_full"]),
            ns(item["city"]),
            ns(item["state"]),
            ns(item["country"]),
        )
        if not any(key):
            continue
        if (
            key[0] == c_inst
            and key[1] == c_inst_full
            and key[2] == c_city
            and key[3] == c_state
            and key[4] == c_country
        ):
            continue
        if key in seen:
            continue
        seen.add(key)
        out.append(item)
    return out


def consolidate_fields(canonical: Dict, rows: Sequence[Dict], category: str) -> Dict:
    rows_by_id = {str(r["id"]): r for r in rows if r.get("id")}
    noncanon_rows = [r for r in rows if str(r.get("id")) != str(canonical.get("id"))]

    merged = dict(canonical)
    merged["npi_number"] = canonical.get("npi_number") or any_non_null(rows, "npi_number")
    merged["institution_short"] = canonical.get("institution_short") or any_non_null(rows, "institution_short")
    merged["institution_full"] = canonical.get("institution_full") or any_non_null(rows, "institution_full")

    merged["city"] = canonical.get("city") or majority_non_null(rows, "city")
    merged["state"] = canonical.get("state") or majority_non_null(rows, "state")
    merged["country"] = canonical.get("country") or majority_non_null(rows, "country")

    first_pub_values = [parse_int(r.get("first_pub_year"), default=10**9) for r in rows if r.get("first_pub_year") is not None]
    merged["first_pub_year"] = min(first_pub_values) if first_pub_values else canonical.get("first_pub_year")

    total_pub_values = [parse_int(r.get("total_career_pubs"), default=-1) for r in rows if r.get("total_career_pubs") is not None]
    merged["total_career_pubs"] = max(total_pub_values) if total_pub_values else canonical.get("total_career_pubs")

    for field in SOCIAL_FIELDS:
        if field in merged and merged.get(field) is None:
            merged[field] = any_non_null(rows, field)

    for field in SCHOLAR_FIELDS:
        vals = [parse_int(r.get(field), default=-1) for r in rows if r.get(field) is not None]
        if vals:
            merged[field] = max(vals)

    if "opt_out" in merged:
        merged["opt_out"] = any(truthy(r.get("opt_out")) for r in rows)
    if "is_claimed" in merged:
        merged["is_claimed"] = any(truthy(r.get("is_claimed")) for r in rows)

    merged["alternative_affiliations"] = build_alternative_affiliations(canonical, noncanon_rows)
    merged["merged_from_count"] = len(noncanon_rows)
    merged["merge_category"] = category
    merged["merged_at"] = datetime.now(timezone.utc).isoformat()

    # Keep only DB columns likely present, but leave passthrough fields intact for dry-run display.
    merged["_group_rows"] = [rows_by_id[k] for k in rows_by_id]
    return merged


def chunked(items: Sequence[str], size: int) -> Iterable[List[str]]:
    for i in range(0, len(items), size):
        yield list(items[i : i + size])


def count_fk_updates(supabase: Client, noncanonical_ids: Sequence[str]) -> Dict[str, int]:
    counts = {name: 0 for name in FK_TABLES}
    if not noncanonical_ids:
        return counts
    for table in FK_TABLES:
        table_total = 0
        for chunk in chunked(noncanonical_ids, 250):
            try:
                resp = (
                    supabase.table(table)
                    .select("id", count="exact")
                    .in_("hcp_id", chunk)
                    .limit(1)
                    .execute()
                )
                table_total += int(resp.count or 0)
            except Exception:
                # Some environments may not expose all tables in API; keep count at what we can query.
                continue
        counts[table] = table_total
    return counts


def fetch_total_hcps(supabase: Client) -> int:
    resp = supabase.table("hcps").select("id", count="exact").limit(1).execute()
    return int(resp.count or 0)


def load_checkpoint(path: str) -> set:
    if not os.path.exists(path):
        return set()
    try:
        payload = json.load(open(path, "r", encoding="utf-8"))
        return set(payload.get("processed_canonical_ids", []))
    except Exception:
        return set()


def save_checkpoint(path: str, processed: set) -> None:
    payload = {"processed_canonical_ids": sorted(processed)}
    with open(path, "w", encoding="utf-8") as f:
        json.dump(payload, f, indent=2)


def dry_run(groups: Sequence[MergeGroup], supabase: Client) -> None:
    total_groups = len(groups)
    total_rows_delete = 0
    all_noncanonical_ids: List[str] = []
    sample_outputs: List[Dict] = []

    for idx, group in enumerate(groups, start=1):
        rows = list(group.rows)
        if len(rows) < 2:
            continue
        canonical = pick_canonical(rows)
        noncanonical = [r for r in rows if str(r.get("id")) != str(canonical.get("id"))]
        total_rows_delete += len(noncanonical)
        all_noncanonical_ids.extend([str(r["id"]) for r in noncanonical if r.get("id")])

        consolidated = consolidate_fields(canonical, rows, group.category)
        if len(sample_outputs) < SAMPLE_COUNT:
            sample_outputs.append(
                {
                    "category": group.category,
                    "canonical_id": canonical.get("id"),
                    "noncanonical_ids": [r.get("id") for r in noncanonical],
                    "canonical_selection": {
                        "updated_at": canonical.get("updated_at"),
                        "npi_number": canonical.get("npi_number"),
                        "institution_short": canonical.get("institution_short"),
                        "total_career_pubs": canonical.get("total_career_pubs"),
                    },
                    "consolidated_result": consolidated,
                }
            )

        if idx % PROGRESS_EVERY == 0:
            print(f"[dry-run] processed {idx}/{total_groups} groups...")

    fk_counts = count_fk_updates(supabase, all_noncanonical_ids)
    pre_total = fetch_total_hcps(supabase)
    post_total = pre_total - total_rows_delete

    print("\n=== Dry-Run Canonical Selection + Consolidation (sample 10) ===")
    for i, sample in enumerate(sample_outputs, start=1):
        print(f"\n--- Sample {i} ---")
        print(json.dumps(sample, ensure_ascii=False, indent=2))

    print("\n=== Dry-Run Aggregate Summary ===")
    print(f"Total groups to merge: {total_groups}")
    print(f"Total rows to delete: {total_rows_delete}")
    print("Total FK updates by table:")
    for table in FK_TABLES:
        print(f"  - {table}: {fk_counts.get(table, 0)}")
    print(f"Pre-merge total hcps: {pre_total}")
    print(f"Estimated post-merge hcps: {post_total}")


def run_live(groups: Sequence[MergeGroup], supabase: Client, confirm_backup: bool) -> None:
    if not confirm_backup:
        raise RuntimeError(
            "Live merge blocked. Confirm that a database backup exists and rerun with --confirm-backup."
        )

    try:
        import psycopg
        from psycopg.types.json import Json
    except Exception as exc:
        raise RuntimeError(
            "Live run requires psycopg and DATABASE_URL for transactional updates."
        ) from exc

    database_url = get_required_env("DATABASE_URL")
    processed = load_checkpoint(CHECKPOINT_FILE)
    done_count = 0

    with psycopg.connect(database_url, autocommit=False) as conn:
        with conn.cursor() as cur:
            for group in groups:
                rows = list(group.rows)
                if len(rows) < 2:
                    continue
                canonical = pick_canonical(rows)
                canonical_id = str(canonical["id"])
                if canonical_id in processed:
                    continue
                cur.execute(
                    "SELECT merge_category FROM hcps WHERE id = %s::uuid",
                    (canonical_id,),
                )
                result = cur.fetchone()
                if result and result[0] is not None:
                    processed.add(canonical_id)
                    print(
                        json.dumps(
                            {
                                "group_id": canonical_id,
                                "rows_merged": 0,
                                "success": True,
                                "skipped": "already_merged",
                            }
                        )
                    )
                    continue

                noncanonical = [r for r in rows if str(r.get("id")) != canonical_id]
                non_ids = [str(r["id"]) for r in noncanonical]
                consolidated = consolidate_fields(canonical, rows, group.category)

                try:
                    # Begin atomic group transaction.
                    cur.execute("BEGIN")

                    # publications: delete conflict rows first, then update
                    if non_ids:
                        cur.execute(
                            """
                            DELETE FROM publications p
                            USING publications c
                            WHERE p.hcp_id = ANY(%s::uuid[])
                              AND c.hcp_id = %s::uuid
                              AND c.pubmed_id IS NOT DISTINCT FROM p.pubmed_id
                            """,
                            (non_ids, canonical_id),
                        )
                        cur.execute(
                            """
                            DELETE FROM publications p
                            USING publications q
                            WHERE p.hcp_id = ANY(%s::uuid[])
                              AND q.hcp_id = ANY(%s::uuid[])
                              AND p.pubmed_id IS NOT DISTINCT FROM q.pubmed_id
                              AND p.id > q.id
                            """,
                            (non_ids, non_ids),
                        )
                        cur.execute(
                            "UPDATE publications SET hcp_id = %s WHERE hcp_id = ANY(%s::uuid[])",
                            (canonical_id, non_ids),
                        )

                    # hcp_scores: delete non-canonical rows if canonical already has TA row
                    if non_ids:
                        cur.execute(
                            """
                            DELETE FROM hcp_scores s
                            USING hcp_scores c
                            WHERE s.hcp_id = ANY(%s::uuid[])
                              AND c.hcp_id = %s::uuid
                              AND c.therapeutic_area_id IS NOT DISTINCT FROM s.therapeutic_area_id
                            """,
                            (non_ids, canonical_id),
                        )
                        cur.execute(
                            """
                            DELETE FROM hcp_scores s
                            USING hcp_scores t
                            WHERE s.hcp_id = ANY(%s::uuid[])
                              AND t.hcp_id = ANY(%s::uuid[])
                              AND s.therapeutic_area_id IS NOT DISTINCT FROM t.therapeutic_area_id
                              AND s.id > t.id
                            """,
                            (non_ids, non_ids),
                        )
                        cur.execute(
                            "UPDATE hcp_scores SET hcp_id = %s WHERE hcp_id = ANY(%s::uuid[])",
                            (canonical_id, non_ids),
                        )

                    # hcp_therapeutic_areas: upsert into canonical then delete non-canonical rows.
                    if non_ids:
                        cur.execute(
                            """
                            INSERT INTO hcp_therapeutic_areas (hcp_id, therapeutic_area_id, strength_score, last_calculated)
                            SELECT %s::uuid, therapeutic_area_id, strength_score, last_calculated
                            FROM hcp_therapeutic_areas
                            WHERE hcp_id = ANY(%s::uuid[])
                            ON CONFLICT (hcp_id, therapeutic_area_id) DO NOTHING
                            """,
                            (canonical_id, non_ids),
                        )
                        cur.execute(
                            "DELETE FROM hcp_therapeutic_areas WHERE hcp_id = ANY(%s::uuid[])",
                            (non_ids,),
                        )

                    # trial_investigators direct update then dedupe by (hcp_id, trial_id, role)
                    if non_ids:
                        cur.execute(
                            "UPDATE trial_investigators SET hcp_id = %s WHERE hcp_id = ANY(%s::uuid[])",
                            (canonical_id, non_ids),
                        )
                        cur.execute(
                            """
                            DELETE FROM trial_investigators t
                            USING trial_investigators x
                            WHERE t.id < x.id
                              AND t.hcp_id = x.hcp_id
                              AND t.trial_id = x.trial_id
                              AND COALESCE(t.role, '') = COALESCE(x.role, '')
                            """,
                        )

                    # hcp_narratives: keep canonical on conflict and delete non-canonical duplicates.
                    if non_ids:
                        cur.execute(
                            """
                            DELETE FROM hcp_narratives n
                            USING hcp_narratives c
                            WHERE n.hcp_id = ANY(%s::uuid[])
                              AND c.hcp_id = %s::uuid
                              AND c.therapeutic_area_id IS NOT DISTINCT FROM n.therapeutic_area_id
                            """,
                            (non_ids, canonical_id),
                        )
                        cur.execute(
                            """
                            DELETE FROM hcp_narratives n
                            USING hcp_narratives m
                            WHERE n.hcp_id = ANY(%s::uuid[])
                              AND m.hcp_id = ANY(%s::uuid[])
                              AND n.therapeutic_area_id IS NOT DISTINCT FROM m.therapeutic_area_id
                              AND n.id > m.id
                            """,
                            (non_ids, non_ids),
                        )
                        cur.execute(
                            "UPDATE hcp_narratives SET hcp_id = %s WHERE hcp_id = ANY(%s::uuid[])",
                            (canonical_id, non_ids),
                        )

                    # Delete non-canonical rows first to avoid unique constraints on inherited values.
                    if non_ids:
                        cur.execute("DELETE FROM hcps WHERE id = ANY(%s::uuid[])", (non_ids,))

                    # Update canonical row with merged values + metadata.
                    update_fields = [
                        "npi_number",
                        "institution_short",
                        "institution_full",
                        "city",
                        "state",
                        "country",
                        "first_pub_year",
                        "total_career_pubs",
                        "opt_out",
                        "is_claimed",
                        "alternative_affiliations",
                        "merged_from_count",
                        "merge_category",
                        "merged_at",
                    ] + [f for f in SOCIAL_FIELDS if f in consolidated] + [f for f in SCHOLAR_FIELDS if f in consolidated]

                    assignments = ", ".join([f"{f} = %s" for f in update_fields])
                    values = [consolidated.get(f) for f in update_fields]
                    for i, f in enumerate(update_fields):
                        if f == "alternative_affiliations":
                            values[i] = Json(values[i] or [])
                    cur.execute(
                        f"UPDATE hcps SET {assignments} WHERE id = %s::uuid",
                        values + [canonical_id],
                    )

                    conn.commit()
                    processed.add(canonical_id)
                    done_count += 1
                    if done_count % CHECKPOINT_EVERY == 0:
                        save_checkpoint(CHECKPOINT_FILE, processed)
                    print(
                        json.dumps(
                            {
                                "group_id": canonical_id,
                                "rows_merged": len(non_ids),
                                "success": True,
                                "error": None,
                            }
                        )
                    )
                except Exception as exc:
                    conn.rollback()
                    print(
                        json.dumps(
                            {
                                "group_id": canonical_id,
                                "rows_merged": len(non_ids),
                                "success": False,
                                "error": str(exc),
                            }
                        )
                    )
                    continue

    save_checkpoint(CHECKPOINT_FILE, processed)
    print(f"Live merge finished. Groups processed successfully: {len(processed)}")


def main() -> None:
    load_dotenv()
    parser = argparse.ArgumentParser(description="FieldMark HCP merge pipeline")
    parser.add_argument("--audit-file", default=AUDIT_FILE, help="Path to dedupe_audit_output.json")
    parser.add_argument("--dry-run", action="store_true", help="Plan and print merge results without writes.")
    parser.add_argument(
        "--confirm-backup",
        action="store_true",
        help="Required for live run to confirm backup exists.",
    )
    args = parser.parse_args()

    groups = load_groups(args.audit_file)
    if not groups:
        raise RuntimeError("No Category A/B groups found in audit output.")

    supabase = init_supabase()
    if args.dry_run:
        dry_run(groups, supabase)
        return

    run_live(groups, supabase, confirm_backup=args.confirm_backup)


if __name__ == "__main__":
    main()

