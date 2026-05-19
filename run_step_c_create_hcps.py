"""
FieldMark — Step C: create hcps for unlinked openalex_author_inventory rows.

Clusters inventory by normalized name + institution/ROR (same rules as Step B),
creates one HCP per cluster, links all cluster OpenAlex IDs via hcp_openalex_authors,
and tags each new HCP to Hepatology (broad_ta).

Prerequisites: Step B complete (hcp_openalex_authors), ror_to_country populated,
therapeutic_areas contains Hepatology broad_ta.

Requires SUPABASE_URL, SUPABASE_KEY (.env via python-dotenv optional).

Examples:
  python run_step_c_create_hcps.py --dry-run
  python run_step_c_create_hcps.py --limit 50 --csv-also step_c_new_hcps.csv
  python run_step_c_create_hcps.py --batch-size 100
"""

from __future__ import annotations

import argparse
import csv
import os
import sys
import time
import uuid
from collections import Counter, defaultdict
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Sequence, Set, Tuple

from dotenv import load_dotenv
from supabase import Client, create_client

import preview_step_b_matching as stepb

INVENTORY_PAGE_SIZE = 1000
JOIN_PAGE_SIZE = 1000
ROR_COUNTRY_PAGE_SIZE = 1000
PROGRESS_EVERY_CLUSTERS = 500
JOIN_UPSERT_CHUNK = 100
TA_INSERT_CHUNK = 200
NOTES_MAX = 8000

SOURCE_VALUE = "openalex_inventory_step_c"


def eprint(*args: Any, **kwargs: Any) -> None:
    print(*args, file=sys.stderr, **kwargs)


def get_required_env(name: str) -> str:
    v = os.getenv(name)
    if not v:
        raise EnvironmentError(f"Missing required env var: {name}")
    return v


def init_supabase() -> Client:
    return create_client(get_required_env("SUPABASE_URL"), get_required_env("SUPABASE_KEY"))


def table_exists(supabase: Client, table_name: str) -> bool:
    try:
        supabase.table(table_name).select("*").limit(1).execute()
        return True
    except Exception:
        return False


def parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser(
        description="Step C: create hcps from clustered unlinked openalex_author_inventory.",
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    p.add_argument("--dry-run", action="store_true", help="Compute clusters and counts; no DB writes")
    p.add_argument("--limit", type=int, default=None, metavar="N", help="Cap number of new HCPs (clusters) to process")
    p.add_argument("--csv-also", metavar="PATH", default=None, help="Write CSV of planned/created new HCPs")
    p.add_argument("--batch-size", type=int, default=100, help="hcps insert batch size (default 100)")
    return p.parse_args()


def fetch_linked_openalex_ids(supabase: Client) -> Set[str]:
    """All openalex_author_id values present in hcp_openalex_authors."""
    out: Set[str] = set()
    last_id: Optional[str] = None
    while True:
        q = (
            supabase.table("hcp_openalex_authors")
            .select("id,openalex_author_id")
            .order("id")
            .limit(JOIN_PAGE_SIZE)
        )
        if last_id is not None:
            q = q.gt("id", last_id)
        batch = q.execute().data or []
        if not batch:
            break
        for row in batch:
            oid = stepb.normalize_openalex_author_id(row.get("openalex_author_id"))
            if oid:
                out.add(oid)
        last_id = batch[-1].get("id")
        if not last_id or len(batch) < JOIN_PAGE_SIZE:
            break
    return out


def fetch_unlinked_inventory_rows(
    supabase: Client,
    linked: Set[str],
) -> List[Dict[str, Any]]:
    rows_out: List[Dict[str, Any]] = []
    last_oa: Optional[str] = None
    while True:
        q = (
            supabase.table("openalex_author_inventory")
            .select(stepb.INVENTORY_SELECT_COLUMNS)
            .order("openalex_author_id")
            .limit(INVENTORY_PAGE_SIZE)
        )
        if last_oa is not None:
            q = q.gt("openalex_author_id", last_oa)
        batch = q.execute().data or []
        if not batch:
            break
        for row in batch:
            oid = stepb.normalize_openalex_author_id(row.get("openalex_author_id"))
            if not oid or oid in linked:
                continue
            rows_out.append(row)
        last_oa = batch[-1].get("openalex_author_id")
        if not last_oa or len(batch) < INVENTORY_PAGE_SIZE:
            break
    return rows_out


def institution_cluster_token(row: Dict[str, Any]) -> str:
    """Normalized institution string for clustering when ROR is absent (Step B-style)."""
    inst = stepb.normalize_org_name(row.get("last_known_institution"))
    if not inst:
        return ""
    return stepb.normalize_token_field(inst)


def cluster_key(row: Dict[str, Any]) -> Tuple[str, str, str]:
    nf, nl = stepb.name_pair_from_display(row.get("display_name"))
    r = stepb.normalize_ror(row.get("last_known_institution_ror"))
    if r:
        return (nf, nl, f"ror:{r}")
    it = institution_cluster_token(row)
    if it:
        return (nf, nl, f"inst:{it}")
    return (nf, nl, "nameonly")


def row_corpus(row: Dict[str, Any]) -> int:
    try:
        return int(row.get("corpus_pub_count") or 0)
    except (TypeError, ValueError):
        return 0


def year_int(value: Any) -> Optional[int]:
    if value is None or value == "":
        return None
    try:
        y = int(value)
        return y if 1000 <= y <= 3000 else None
    except (TypeError, ValueError):
        return None


def parse_display_name_for_hcp(display_name: Optional[str]) -> Tuple[str, str, str]:
    """
    Split raw display_name on whitespace: last token = last_name, prior tokens = first_name.
    Returns (first_name, last_name, notes_flag).
    """
    raw = str(display_name or "").strip()
    if not raw:
        return "", "", "empty_display_name"
    parts = raw.split()
    if len(parts) == 1:
        return "", parts[0], "single_token_display_name"
    return " ".join(parts[:-1]), parts[-1], ""


def pick_primary_row(cluster_rows: Sequence[Dict[str, Any]]) -> Dict[str, Any]:
    best = max(cluster_rows, key=lambda r: (row_corpus(r), stepb.normalize_openalex_author_id(r.get("openalex_author_id")) or ""))
    return best


def fetch_ror_country_map(supabase: Client) -> Dict[str, str]:
    """ror_id (lowercase path id) -> country_code."""
    out: Dict[str, str] = {}
    last_id: Optional[str] = None
    while True:
        q = supabase.table("ror_to_country").select("ror_id,country_code").order("ror_id").limit(ROR_COUNTRY_PAGE_SIZE)
        if last_id is not None:
            q = q.gt("ror_id", last_id)
        batch = q.execute().data or []
        if not batch:
            break
        for row in batch:
            rid = str(row.get("ror_id") or "").strip().lower()
            cc = row.get("country_code")
            if rid:
                out[rid] = str(cc).strip() if cc is not None else ""
        last_id = batch[-1].get("ror_id")
        if not last_id or len(batch) < ROR_COUNTRY_PAGE_SIZE:
            break
    return out


def fetch_hepatology_ta_id(supabase: Client) -> Optional[str]:
    rows = (
        supabase.table("therapeutic_areas")
        .select("id,name,ta_level")
        .eq("name", "Hepatology")
        .eq("ta_level", "broad_ta")
        .limit(5)
        .execute()
        .data
        or []
    )
    if not rows:
        return None
    return str(rows[0]["id"])


def country_for_row(primary: Dict[str, Any], ror_country: Dict[str, str]) -> Optional[str]:
    r = stepb.normalize_ror(primary.get("last_known_institution_ror"))
    if not r:
        return None
    cc = ror_country.get(r)
    if not cc or cc.lower() == "unknown":
        return None
    return cc


def build_hcp_insert_row(
    *,
    hcp_id: str,
    primary: Dict[str, Any],
    cluster_rows: Sequence[Dict[str, Any]],
    country: Optional[str],
    ts_iso: str,
) -> Dict[str, Any]:
    disp = primary.get("display_name")
    first_name, last_name, name_flag = parse_display_name_for_hcp(disp)
    if not last_name.strip():
        last_name = "Unknown"
        name_flag = (name_flag + "; " if name_flag else "") + "forced_last_name_unknown"

    total_pubs = sum(row_corpus(r) for r in cluster_rows)
    fyears = [y for r in cluster_rows if (y := year_int(r.get("first_seen_pub_year"))) is not None]
    first_pub_year = min(fyears) if fyears else None

    inst = stepb.normalize_org_name(primary.get("last_known_institution")) or None
    ror_raw = primary.get("last_known_institution_ror")
    ror_norm = stepb.normalize_ror(ror_raw) or None

    payload: Dict[str, Any] = {
        "id": hcp_id,
        "first_name": first_name or None,
        "last_name": last_name,
        "openalex_author_id": stepb.normalize_openalex_author_id(primary.get("openalex_author_id")),
        "institution": inst,
        "country": country,
        "total_career_pubs": total_pubs,
        "first_pub_year": first_pub_year,
        "source": SOURCE_VALUE,
        "created_at": ts_iso,
        "updated_at": ts_iso,
    }
    if ror_norm:
        payload["openalex_institution_ror_id"] = ror_raw if str(ror_raw or "").strip() else ror_norm
    return payload


def join_notes(cluster_size: int, total_pubs: int, last_pub_year_max: Optional[int], name_flag: str) -> str:
    parts = [f"cluster_size={cluster_size}", f"total_corpus_pubs={total_pubs}"]
    if last_pub_year_max is not None:
        parts.append(f"last_pub_year_max={last_pub_year_max}")
    if name_flag:
        parts.append(name_flag)
    s = "; ".join(parts)
    return s[:NOTES_MAX]


def build_join_rows_for_cluster(
    hcp_id: str,
    cluster_rows: Sequence[Dict[str, Any]],
    primary: Dict[str, Any],
    name_flag: str,
) -> List[Dict[str, Any]]:
    primary_oid = stepb.normalize_openalex_author_id(primary.get("openalex_author_id"))
    total_pubs = sum(row_corpus(r) for r in cluster_rows)
    lyears = [y for r in cluster_rows if (y := year_int(r.get("last_seen_pub_year"))) is not None]
    last_pub_year_max = max(lyears) if lyears else None
    notes = join_notes(len(cluster_rows), total_pubs, last_pub_year_max, name_flag)
    out: List[Dict[str, Any]] = []
    for r in cluster_rows:
        oid = stepb.normalize_openalex_author_id(r.get("openalex_author_id"))
        if not oid:
            continue
        out.append(
            {
                "hcp_id": hcp_id,
                "openalex_author_id": oid,
                "is_primary": oid == primary_oid,
                "match_status": "created_from_inventory",
                "match_confidence": "high",
                "match_method": "step_c_cluster_creation",
                "notes": notes,
            }
        )
    return out


def insert_hcps_batch(
    supabase: Client,
    rows: Sequence[Dict[str, Any]],
    *,
    dry_run: bool,
    errors: List[str],
) -> Set[str]:
    """Insert hcps batch; return set of hcp ids successfully inserted."""
    ok: Set[str] = set()
    if dry_run or not rows:
        return ok
    chunk = list(rows)
    try:
        supabase.table("hcps").insert(chunk).execute()
        for r in chunk:
            hid = r.get("id")
            if hid:
                ok.add(str(hid))
        return ok
    except Exception as exc:
        eprint(f"[hcps insert batch n={len(chunk)}] {exc}")
        for r in chunk:
            try:
                supabase.table("hcps").insert([r]).execute()
                hid = r.get("id")
                if hid:
                    ok.add(str(hid))
            except Exception as exc2:
                hid = r.get("id")
                fn = r.get("first_name")
                ln = r.get("last_name")
                oa = r.get("openalex_author_id")
                msg = f"hcp insert id={hid} first={fn!r} last={ln!r} oa={oa!r}: {exc2}"
                errors.append(msg)
                eprint("[hcps insert]", msg)
        return ok


def upsert_join_rows(
    supabase: Client,
    rows: Sequence[Dict[str, Any]],
    *,
    dry_run: bool,
    errors: List[str],
) -> int:
    if dry_run or not rows:
        return 0
    n = 0
    for i in range(0, len(rows), JOIN_UPSERT_CHUNK):
        chunk = list(rows[i : i + JOIN_UPSERT_CHUNK])
        try:
            supabase.table("hcp_openalex_authors").upsert(
                chunk,
                on_conflict="hcp_id,openalex_author_id",
            ).execute()
            n += len(chunk)
        except Exception as exc:
            eprint(f"[join upsert batch] {exc}")
            for r in chunk:
                try:
                    supabase.table("hcp_openalex_authors").upsert(
                        [r],
                        on_conflict="hcp_id,openalex_author_id",
                    ).execute()
                    n += 1
                except Exception as exc2:
                    msg = f"hcp_id={r.get('hcp_id')} oa={r.get('openalex_author_id')}: {exc2}"
                    errors.append(msg)
                    eprint("[join upsert]", msg)
    return n


def upsert_ta_rows(
    supabase: Client,
    rows: Sequence[Dict[str, Any]],
    *,
    dry_run: bool,
    errors: List[str],
) -> int:
    if dry_run or not rows:
        return 0
    n = 0
    for i in range(0, len(rows), TA_INSERT_CHUNK):
        chunk = list(rows[i : i + TA_INSERT_CHUNK])
        try:
            supabase.table("hcp_therapeutic_areas").upsert(
                chunk,
                on_conflict="hcp_id,therapeutic_area_id",
                ignore_duplicates=True,
            ).execute()
            n += len(chunk)
        except Exception as exc:
            eprint(f"[hcp_therapeutic_areas upsert batch] {exc}")
            for r in chunk:
                try:
                    supabase.table("hcp_therapeutic_areas").upsert(
                        [r],
                        on_conflict="hcp_id,therapeutic_area_id",
                        ignore_duplicates=True,
                    ).execute()
                    n += 1
                except Exception as exc2:
                    msg = f"hcp_id={r.get('hcp_id')} ta={r.get('therapeutic_area_id')}: {exc2}"
                    errors.append(msg)
                    eprint("[hcp_therapeutic_areas]", msg)
    return n


@dataclass
class ClusterPlan:
    hcp_id: str
    hcp_row: Dict[str, Any]
    join_rows: List[Dict[str, Any]]
    ta_row: Dict[str, Any]
    csv_row: Dict[str, Any]


def plan_cluster(
    cluster_rows: List[Dict[str, Any]],
    ror_country: Dict[str, str],
    hepatology_ta_id: str,
    ts_iso: str,
) -> ClusterPlan:
    primary = pick_primary_row(cluster_rows)
    hcp_id = str(uuid.uuid4())
    country = country_for_row(primary, ror_country)
    disp = primary.get("display_name")
    _, _, name_flag = parse_display_name_for_hcp(disp)
    hcp_row = build_hcp_insert_row(
        hcp_id=hcp_id,
        primary=primary,
        cluster_rows=cluster_rows,
        country=country,
        ts_iso=ts_iso,
    )
    join_rows = build_join_rows_for_cluster(hcp_id, cluster_rows, primary, name_flag)
    ta_row = {"hcp_id": hcp_id, "therapeutic_area_id": hepatology_ta_id, "strength_score": None}
    csv_row = {
        "hcp_id": hcp_id,
        "first_name": hcp_row.get("first_name") or "",
        "last_name": hcp_row.get("last_name") or "",
        "openalex_author_id": hcp_row.get("openalex_author_id") or "",
        "institution": hcp_row.get("institution") or "",
        "country": hcp_row.get("country") or "",
        "cluster_size": len(cluster_rows),
        "total_career_pubs": hcp_row.get("total_career_pubs"),
        "first_pub_year": hcp_row.get("first_pub_year"),
    }
    return ClusterPlan(hcp_id=hcp_id, hcp_row=hcp_row, join_rows=join_rows, ta_row=ta_row, csv_row=csv_row)


def main() -> None:
    args = parse_args()
    if args.limit is not None and args.limit < 1:
        raise SystemExit("--limit N requires N >= 1")
    bs = max(1, int(args.batch_size))

    load_dotenv()
    supabase = init_supabase()

    print("Pre-flight: required tables...")
    for tbl in ("hcp_openalex_authors", "openalex_author_inventory", "ror_to_country", "therapeutic_areas"):
        if not table_exists(supabase, tbl):
            eprint(f"Missing or inaccessible table: {tbl}")
            raise SystemExit(1)
        print(f"  OK: {tbl}")

    hta_exists = table_exists(supabase, "hcp_therapeutic_areas")
    if not hta_exists:
        eprint("Warning: hcp_therapeutic_areas not accessible; TA tagging will be skipped.")

    hepatology_id = fetch_hepatology_ta_id(supabase)
    if not hepatology_id:
        eprint("Hepatology broad_ta not found in therapeutic_areas (name='Hepatology', ta_level='broad_ta').")
        raise SystemExit(1)
    print(f"  Hepatology TA id: {hepatology_id}")

    print("\nLoading linked OpenAlex IDs from hcp_openalex_authors...")
    linked = fetch_linked_openalex_ids(supabase)
    print(f"  Distinct linked OpenAlex IDs: {len(linked):,}")

    print("\nScanning openalex_author_inventory for unlinked rows...")
    t0 = time.perf_counter()
    unlinked = fetch_unlinked_inventory_rows(supabase, linked)
    print(f"  Unlinked inventory rows: {len(unlinked):,} (scan {time.perf_counter() - t0:.1f}s)")

    print("\nClustering by normalized name + ROR / institution / name-only...")
    buckets: Dict[Tuple[str, str, str], List[Dict[str, Any]]] = defaultdict(list)
    for row in unlinked:
        buckets[cluster_key(row)].append(row)
    clusters = list(buckets.values())
    print(f"  Clusters formed: {len(clusters):,}")

    if args.limit is not None:
        clusters = clusters[: args.limit]
        print(f"  After --limit: {len(clusters):,} cluster(s) to process")

    print("\nLoading ror_to_country map...")
    ror_country = fetch_ror_country_map(supabase)
    print(f"  ROR keys: {len(ror_country):,}")

    ts_iso = datetime.now(timezone.utc).isoformat()

    plans: List[ClusterPlan] = []
    for crows in clusters:
        plans.append(plan_cluster(crows, ror_country, hepatology_id, ts_iso))

    if args.dry_run:
        join_total = sum(len(p.join_rows) for p in plans)
        print("\n*** DRY RUN: no hcps / joins / TA writes ***")
        print(f"Would create {len(plans):,} new HCPs and {join_total:,} join row(s).")
        _print_summary(
            unlinked_count=len(unlinked),
            cluster_count=len(buckets),
            processed_clusters=len(plans),
            hcps_created=0,
            clusters_failed=0,
            joins_written=0,
            ta_written=0,
            country_dist=Counter((p.hcp_row.get("country") or "(null)") for p in plans),
            errors=[],
            elapsed_s=time.perf_counter() - t0,
            dry_run=True,
        )
        if args.csv_also:
            _write_csv(args.csv_also, [p.csv_row for p in plans])
            print(f"CSV written: {args.csv_also}")
        return

    errors: List[str] = []
    hcps_created = 0
    joins_written = 0
    ta_written = 0
    clusters_failed = 0
    t_proc = time.perf_counter()
    country_live: Counter[str] = Counter()
    total_clusters_formed = len(buckets)

    for start in range(0, len(plans), bs):
        batch = plans[start : start + bs]
        hcp_payloads = [p.hcp_row for p in batch]
        ok_ids = insert_hcps_batch(supabase, hcp_payloads, dry_run=False, errors=errors)
        clusters_failed += len(batch) - len(ok_ids)
        hcps_created += len(ok_ids)

        joins_to_write: List[Dict[str, Any]] = []
        tas_to_write: List[Dict[str, Any]] = []
        for p in batch:
            if p.hcp_id not in ok_ids:
                continue
            joins_to_write.extend(p.join_rows)
            cc = p.hcp_row.get("country") or "(null)"
            country_live[str(cc)] += 1
            if hta_exists:
                tas_to_write.append(p.ta_row)

        joins_written += upsert_join_rows(supabase, joins_to_write, dry_run=False, errors=errors)
        if hta_exists and tas_to_write:
            ta_written += upsert_ta_rows(supabase, tas_to_write, dry_run=False, errors=errors)

        done = min(start + len(batch), len(plans))
        if done % PROGRESS_EVERY_CLUSTERS == 0 or done == len(plans):
            elapsed = time.perf_counter() - t_proc
            rate = done / elapsed if elapsed > 0 else 0.0
            ts = datetime.now().strftime("%H:%M:%S")
            print(
                f"[{ts}] Clusters processed {done}/{len(plans)} | "
                f"HCPs created {hcps_created} | join rows {joins_written} | "
                f"errors {len(errors)} | rate {rate:.2f}/s"
            )

    _print_summary(
        unlinked_count=len(unlinked),
        cluster_count=total_clusters_formed,
        processed_clusters=len(plans),
        hcps_created=hcps_created,
        clusters_failed=clusters_failed,
        joins_written=joins_written,
        ta_written=ta_written,
        country_dist=country_live,
        errors=errors,
        elapsed_s=time.perf_counter() - t0,
        dry_run=False,
    )

    if args.csv_also:
        _write_csv(args.csv_also, [p.csv_row for p in plans])
        print(f"CSV written: {args.csv_also}")

    print(
        "\nVerification query:\n"
        "SELECT \n"
        "  COUNT(*) as new_hcps,\n"
        "  COUNT(*) FILTER (WHERE country IS NOT NULL) as with_country\n"
        "FROM hcps \n"
        f"WHERE source = '{SOURCE_VALUE}';\n"
    )


def _write_csv(path: str, rows: Sequence[Dict[str, Any]]) -> None:
    if not rows:
        return
    fieldnames = list(rows[0].keys())
    with open(path, "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=fieldnames)
        w.writeheader()
        for r in rows:
            w.writerow({k: r.get(k, "") for k in fieldnames})


def _print_summary(
    *,
    unlinked_count: int,
    cluster_count: int,
    processed_clusters: int,
    hcps_created: int,
    clusters_failed: int,
    joins_written: int,
    ta_written: int,
    country_dist: Counter[str],
    errors: List[str],
    elapsed_s: float,
    dry_run: bool,
) -> None:
    print("\n" + "=" * 72)
    print("STEP C - SUMMARY")
    print("=" * 72)
    print(f"Total unlinked inventory rows: {unlinked_count:,}")
    print(f"Total clusters formed (before --limit): {cluster_count:,}")
    print(f"Clusters processed this run: {processed_clusters:,}")
    print(f"New HCPs inserted: {hcps_created:,}")
    if clusters_failed:
        print(f"Clusters failed (hcp insert): {clusters_failed:,}")
    print(f"hcp_openalex_authors rows upserted: {joins_written:,}")
    print(f"hcp_therapeutic_areas rows inserted: {ta_written:,}")
    print(f"Errors logged: {len(errors):,}")
    print(f"Wall time: {elapsed_s:.1f}s ({elapsed_s / 60.0:.2f} min)")
    print(f"Mode: {'DRY-RUN' if dry_run else 'LIVE'}")
    print("\nCountry distribution (planned or inserted HCPs, this run):")
    total_c = sum(country_dist.values())
    for code, cnt in country_dist.most_common(25):
        pct = 100.0 * cnt / total_c if total_c else 0.0
        print(f"  {code}: {cnt} ({pct:.1f}%)")
    if len(country_dist) > 25:
        print(f"  ... ({len(country_dist) - 25} more codes)")
    if errors:
        print("\nFirst errors:")
        for e in errors[:15]:
            print(f"  {e}")
        if len(errors) > 15:
            print(f"  ... ({len(errors) - 15} more)")
    print("=" * 72)


if __name__ == "__main__":
    main()
