"""
FieldMark — Score Community HCPs per therapeutic area (v1 methodology).

Reads hcps_v2 where cohort_classification='community' and supporting v2 tables.
Writes per-(hcp_id, ta_id) scores to hcp_community_scores_v2.

Run community_classification.py first to set cohort_classification.

Requires: SUPABASE_URL, SUPABASE_KEY (python-dotenv loads .env).
hcp_community_scores_v2 must already exist in Supabase (create manually).

Examples:
  python community_scoring.py --dry-run
  python community_scoring.py --execute
"""

from __future__ import annotations

import argparse
import uuid
from collections import Counter, defaultdict
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Sequence, Set, Tuple

from dotenv import load_dotenv
from supabase import Client, create_client

READ_PAGE_SIZE = 1000
WRITE_BATCH_SIZE = 500
CURRENT_YEAR = 2026

WEIGHTS = {
    "patient_volume": 0.40,
    "pharma_engagement": 0.30,
    "group_practice_signal": 0.15,
    "career_years": 0.10,
    "publication_signal": 0.05,
}


def env(name: str) -> str:
    import os

    v = os.getenv(name)
    if not v:
        raise EnvironmentError(f"Missing env var: {name}")
    return v


def sb() -> Client:
    return create_client(env("SUPABASE_URL"), env("SUPABASE_KEY"))


def norm(v: Any) -> str:
    return " ".join(str(v or "").strip().split())


def lower(v: Any) -> str:
    return norm(v).lower()


def parse_float(v: Any, default: float = 0.0) -> float:
    try:
        if v is None or v == "":
            return default
        return float(v)
    except Exception:
        return default


def normalize_0_100(values: Dict[Tuple[str, str], float]) -> Dict[Tuple[str, str], float]:
    if not values:
        return {}
    vals = list(values.values())
    lo = min(vals)
    hi = max(vals)
    if hi == lo:
        return {k: 50.0 for k in values}
    return {k: ((v - lo) / (hi - lo)) * 100.0 for k, v in values.items()}


def fetch_pages(
    client: Client,
    table: str,
    columns: str,
    *,
    order_column: str = "id",
    page_size: int = READ_PAGE_SIZE,
    filters: Optional[List[Tuple[str, str, Any]]] = None,
) -> List[Dict[str, Any]]:
    rows: List[Dict[str, Any]] = []
    last_cursor: Optional[str] = None
    while True:
        q = client.table(table).select(columns).order(order_column).limit(page_size)
        if filters:
            for op, col, val in filters:
                if op == "eq":
                    q = q.eq(col, val)
        if last_cursor is not None:
            q = q.gt(order_column, last_cursor)
        batch = q.execute().data or []
        if not batch:
            break
        rows.extend(batch)
        last_cursor = str(batch[-1][order_column])
        if len(batch) < page_size:
            break
    return rows


def load_community_hcps(client: Client) -> List[Dict[str, Any]]:
    print("Loading community HCPs from hcps_v2...")
    rows = fetch_pages(
        client,
        "hcps_v2",
        "id,first_name,last_name,nppes_practice_setting,cohort_classification",
        order_column="id",
        filters=[("eq", "cohort_classification", "community")],
    )
    print(f"  Loaded {len(rows)} community HCPs")
    return rows


def load_publication_counts(client: Client, community_ids: Set[str]) -> Dict[str, int]:
    counts: Dict[str, int] = defaultdict(int)
    rows = fetch_pages(
        client,
        "publication_authors_v2",
        "publication_id,hcp_id",
        order_column="publication_id",
    )
    for r in rows:
        hid = str(r.get("hcp_id") or "")
        if hid in community_ids:
            counts[hid] += 1
    return dict(counts)


def load_enumeration_years(client: Client, community_ids: Set[str]) -> Dict[str, int]:
    out: Dict[str, int] = {}
    rows = fetch_pages(client, "hcp_nppes_detail_v2", "*", order_column="hcp_id")
    for r in rows:
        hid = str(r.get("hcp_id") or "")
        if hid not in community_ids:
            continue
        raw = (
            r.get("nppes_enumeration_date")
            or r.get("npi_enumeration_date")
            or r.get("enumeration_date")
        )
        if not raw:
            continue
        text = str(raw)
        if len(text) >= 4 and text[:4].isdigit():
            out[hid] = int(text[:4])
    return out


def upsert_scores(client: Client, rows: Sequence[Dict[str, Any]]) -> int:
    if not rows:
        return 0
    written = 0
    for i in range(0, len(rows), WRITE_BATCH_SIZE):
        batch = list(rows[i : i + WRITE_BATCH_SIZE])
        resp = (
            client.table("hcp_community_scores_v2")
            .upsert(batch, on_conflict="hcp_id,ta_id")
            .execute()
        )
        if not resp.data:
            raise RuntimeError(
                f"hcp_community_scores_v2 upsert returned empty data ({len(batch)} rows) - writes may have been silently dropped"
            )
        written += len(resp.data)
    return written


def main() -> None:
    parser = argparse.ArgumentParser(description="Community cohort scoring (v1 methodology)")
    mode = parser.add_mutually_exclusive_group(required=True)
    mode.add_argument("--dry-run", action="store_true")
    mode.add_argument("--execute", action="store_true")
    args = parser.parse_args()
    dry_run = bool(args.dry_run)

    load_dotenv()
    client = sb()
    scored_at = datetime.now(timezone.utc).isoformat()
    scoring_run_id = str(uuid.uuid4())

    hcps = load_community_hcps(client)
    hcp_by_id = {str(h["id"]): h for h in hcps if h.get("id")}
    community_ids = set(hcp_by_id.keys())

    print("Loading TA links for community HCPs...")
    hcp_tas = fetch_pages(
        client,
        "hcp_therapeutic_areas_v2",
        "hcp_id,therapeutic_area_id",
        order_column="hcp_id",
    )
    tas_by_hcp: Dict[str, Set[str]] = defaultdict(set)
    for r in hcp_tas:
        hid = str(r.get("hcp_id") or "")
        tid = str(r.get("therapeutic_area_id") or "")
        if hid in community_ids and tid:
            tas_by_hcp[hid].add(tid)

    print("Loading Open Payments summary...")
    op_summary_rows = fetch_pages(
        client,
        "hcp_open_payments_summary_v2",
        "hcp_id,total_payments_lifetime",
        order_column="hcp_id",
    )
    op_summary_by_hcp = {
        str(r["hcp_id"]): r for r in op_summary_rows if str(r.get("hcp_id") or "") in community_ids
    }

    print("Loading TA-specific payment/medicare slices...")
    op_ta_rows = fetch_pages(
        client,
        "hcp_open_payments_by_ta_v2",
        "hcp_id,therapeutic_area_id,ta_payments_3yr,ta_speaker_bureau_3yr,ta_consulting_3yr",
        order_column="hcp_id",
    )
    med_ta_rows = fetch_pages(
        client,
        "hcp_medicare_by_ta_v2",
        "hcp_id,therapeutic_area_id,ta_beneficiaries_3yr_total,ta_beneficiaries_3yr_high_confidence",
        order_column="hcp_id",
    )
    op_ta_by_pair: Dict[Tuple[str, str], Dict[str, Any]] = {}
    for r in op_ta_rows:
        hid = str(r.get("hcp_id") or "")
        tid = str(r.get("therapeutic_area_id") or "")
        if hid in community_ids and tid:
            op_ta_by_pair[(hid, tid)] = r
    med_ta_by_pair: Dict[Tuple[str, str], Dict[str, Any]] = {}
    for r in med_ta_rows:
        hid = str(r.get("hcp_id") or "")
        tid = str(r.get("therapeutic_area_id") or "")
        if hid in community_ids and tid:
            med_ta_by_pair[(hid, tid)] = r

    print("Loading publication counts and NPI enumeration years...")
    pub_count_by_hcp = load_publication_counts(client, community_ids)
    enum_year_by_hcp = load_enumeration_years(client, community_ids)

    print(f"Community HCPs to score: {len(community_ids):,}")

    raw_patient_volume: Dict[Tuple[str, str], float] = {}
    raw_pharma: Dict[Tuple[str, str], float] = {}
    raw_group_signal: Dict[Tuple[str, str], float] = {}
    raw_career_years: Dict[Tuple[str, str], float] = {}
    raw_pub_signal: Dict[Tuple[str, str], float] = {}
    per_ta_counts: Counter[str] = Counter()

    for hid in sorted(community_ids):
        h = hcp_by_id[hid]
        for ta_id in sorted(tas_by_hcp.get(hid, set())):
            key = (hid, ta_id)
            per_ta_counts[ta_id] += 1

            med_ta = med_ta_by_pair.get(key, {})
            patient_volume = parse_float(
                med_ta.get("ta_beneficiaries_3yr_total"),
                parse_float(med_ta.get("ta_beneficiaries_3yr_high_confidence"), 0.0),
            )
            raw_patient_volume[key] = patient_volume

            op_ta = op_ta_by_pair.get(key, {})
            speaker = parse_float(op_ta.get("ta_speaker_bureau_3yr"), 0.0)
            consulting = parse_float(op_ta.get("ta_consulting_3yr"), 0.0)
            if speaker > 0 or consulting > 0:
                pharma = speaker + 0.5 * consulting
            else:
                pharma = parse_float(op_ta.get("ta_payments_3yr"), 0.0)
                if pharma <= 0:
                    pharma = parse_float(
                        op_summary_by_hcp.get(hid, {}).get("total_payments_lifetime"), 0.0
                    )
            raw_pharma[key] = pharma

            setting = lower(h.get("nppes_practice_setting"))
            raw_group_signal[key] = 1.0 if setting == "group" else 0.0

            enum_year = enum_year_by_hcp.get(hid)
            years = (CURRENT_YEAR - enum_year) if enum_year else 0
            raw_career_years[key] = float(max(0, years))

            raw_pub_signal[key] = float(pub_count_by_hcp.get(hid, 0))

    print("Per-TA scored HCP-TA pairs:")
    for ta_id, cnt in per_ta_counts.most_common():
        print(f"  {ta_id}: {cnt:,}")

    norm_patient: Dict[Tuple[str, str], float] = {}
    norm_pharma: Dict[Tuple[str, str], float] = {}
    norm_group: Dict[Tuple[str, str], float] = {}
    norm_career: Dict[Tuple[str, str], float] = {}
    norm_pub: Dict[Tuple[str, str], float] = {}

    ta_ids = sorted({ta for _, ta in raw_patient_volume.keys()})
    for ta_id in ta_ids:
        keys = [k for k in raw_patient_volume.keys() if k[1] == ta_id]
        norm_patient.update(normalize_0_100({k: raw_patient_volume[k] for k in keys}))
        norm_pharma.update(normalize_0_100({k: raw_pharma[k] for k in keys}))
        norm_group.update(normalize_0_100({k: raw_group_signal[k] for k in keys}))
        norm_career.update(normalize_0_100({k: raw_career_years[k] for k in keys}))
        norm_pub.update(normalize_0_100({k: raw_pub_signal[k] for k in keys}))

    composite_raw: Dict[Tuple[str, str], float] = {}
    for key in raw_patient_volume.keys():
        composite_raw[key] = (
            WEIGHTS["patient_volume"] * norm_patient.get(key, 0.0)
            + WEIGHTS["pharma_engagement"] * norm_pharma.get(key, 0.0)
            + WEIGHTS["group_practice_signal"] * norm_group.get(key, 0.0)
            + WEIGHTS["career_years"] * norm_career.get(key, 0.0)
            + WEIGHTS["publication_signal"] * norm_pub.get(key, 0.0)
        )

    normalized_score: Dict[Tuple[str, str], float] = {}
    for ta_id in ta_ids:
        ta_map = {k: v for k, v in composite_raw.items() if k[1] == ta_id}
        normalized_score.update(normalize_0_100(ta_map))

    rows_to_write: List[Dict[str, Any]] = []
    for key in sorted(composite_raw.keys()):
        hid, ta_id = key
        rows_to_write.append(
            {
                "hcp_id": hid,
                "ta_id": ta_id,
                "composite_score": round(composite_raw[key], 4),
                "normalized_score": round(normalized_score.get(key, 0.0), 4),
                "patient_volume": round(raw_patient_volume[key], 4),
                "pharma_engagement": round(raw_pharma[key], 4),
                "group_practice_signal": round(raw_group_signal[key], 4),
                "career_years": round(raw_career_years[key], 4),
                "publication_signal": round(raw_pub_signal[key], 4),
                "scored_at": scored_at,
                "scoring_run_id": scoring_run_id,
            }
        )

    if dry_run:
        print(f"\n[DRY RUN] Would upsert {len(rows_to_write):,} rows into hcp_community_scores_v2")
    else:
        print(f"\nUpserting {len(rows_to_write):,} rows into hcp_community_scores_v2 ...")
        written = upsert_scores(client, rows_to_write)
        print(f"Upserted {written:,} rows")

    print("\nTop 20 per TA by normalized_score:")
    rows_by_ta: Dict[str, List[Dict[str, Any]]] = defaultdict(list)
    for r in rows_to_write:
        rows_by_ta[str(r["ta_id"])].append(r)
    for ta_id in sorted(rows_by_ta.keys()):
        print(f"\nTA {ta_id} (pairs={len(rows_by_ta[ta_id]):,})")
        top = sorted(rows_by_ta[ta_id], key=lambda r: float(r["normalized_score"]), reverse=True)[:20]
        for r in top:
            h = hcp_by_id.get(str(r["hcp_id"]), {})
            name = f"{norm(h.get('first_name'))} {norm(h.get('last_name'))}".strip()
            print(
                f"  {name} ({r['hcp_id']}) norm={r['normalized_score']:.2f} comp={r['composite_score']:.2f} "
                f"patient={r['patient_volume']:.2f} pharma={r['pharma_engagement']:.2f} "
                f"group={r['group_practice_signal']:.2f} years={r['career_years']:.2f} pubs={r['publication_signal']:.2f}"
            )

    non_community = [
        hid
        for hid, h in hcp_by_id.items()
        if lower(h.get("cohort_classification")) != "community"
    ]
    print(
        "\nAll scored HCPs are community check: "
        + ("PASS" if not non_community else f"FAIL ({len(non_community)} not community)")
    )


if __name__ == "__main__":
    main()
