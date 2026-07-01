"""
Ingest Workstream B community HCPs from NPPES Parquet into hcps + hcp_therapeutic_areas.

Requires SUPABASE_URL, SUPABASE_KEY in environment (.env OK via load_dotenv).

Run manually after applying schema SQL migrations.
"""

from __future__ import annotations

import os
import sys
import uuid
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional, Sequence, Set, Tuple

import pandas as pd
from dotenv import load_dotenv
from supabase import Client, create_client
from tqdm import tqdm

_SCRIPTS_INGEST = Path(__file__).resolve().parent
if str(_SCRIPTS_INGEST) not in sys.path:
    sys.path.insert(0, str(_SCRIPTS_INGEST))
from pubmed_pipeline import list_ta_configs, load_ta_config


def get_table_name(base_name: str, target_version: str) -> str:
    if target_version == "v2":
        return f"{base_name}_v2"
    return base_name


PARQUET_PATH = r"C:\Users\garre\Desktop\FieldMark\NPPES\nppes_individual_providers.parquet"

BATCH_HCPS = 500
BATCH_TA = 500
RETRY_CHUNK = 250
PROGRESS_EVERY = 1000
PREFLIGHT_PAGE_SIZE = 1000

AFFILIATION_PROFILE: Dict[str, Any] = {
    "version": "v1.1",
    "source": "nppes_taxonomy_filter",
    "publications_examined": 0,
    "publications_matched": 0,
    "industry_keywords_matched": [],
}

REQUIRED_COLUMNS = [
    "npi",
    "first_name",
    "last_name",
    "middle_name",
    "credentials",
    "practice_city",
    "practice_state",
    "taxonomy_1",
    "taxonomy_2",
    "taxonomy_3",
    "taxonomy_4",
    "taxonomy_5",
]


def get_required_env(name: str) -> str:
    value = os.getenv(name)
    if not value:
        raise EnvironmentError(f"Missing required environment variable: {name}")
    return value


def init_supabase() -> Client:
    return create_client(get_required_env("SUPABASE_URL"), get_required_env("SUPABASE_KEY"))


def ns(value: Optional[str]) -> str:
    return " ".join(str(value or "").strip().split())


def normalize_npi_digits(value: Any) -> Optional[str]:
    raw = "".join(ch for ch in str(value or "") if ch.isdigit())
    if len(raw) == 10:
        return raw
    return None


def title_name(value: Optional[str]) -> str:
    t = ns(value)
    return t.title() if t else ""


def normalize_credentials(value: Optional[str]) -> Optional[str]:
    c = ns(value)
    if not c:
        return None
    return c.replace("M.D.", "MD")


def is_statement_timeout(exc: BaseException) -> bool:
    text = str(exc).lower()
    return "57014" in text or "statement timeout" in text


def taxonomy_match_mask(df: pd.DataFrame, codes: Set[str]) -> pd.Series:
    m = pd.Series(False, index=df.index)
    for i in range(1, 6):
        col = df[f"taxonomy_{i}"].astype(str).str.strip()
        m |= col.isin(codes)
    return m


def fetch_existing_npis(client: Client, target_version: str = "v1") -> Set[str]:
    hcps_table = get_table_name("hcps", target_version)
    existing: Set[str] = set()
    offset = 0
    while True:
        response = (
            client.table(hcps_table)
            .select("id,npi_number")
            .not_.is_("npi_number", "null")
            .order("id")
            .range(offset, offset + PREFLIGHT_PAGE_SIZE - 1)
            .execute()
        )
        batch = response.data or []
        if not batch:
            break
        for row in batch:
            n = normalize_npi_digits(row.get("npi_number"))
            if n:
                existing.add(n)
        offset += PREFLIGHT_PAGE_SIZE
        if len(batch) < PREFLIGHT_PAGE_SIZE:
            break
    print(f"Preflight: {len(existing):,} existing NPIs in hcps (non-null)")
    return existing


def build_hcp_payload(
    hcp_id: str,
    npi: str,
    row: pd.Series,
    ts_iso: str,
    target_version: str = "v1",
) -> Dict[str, Any]:
    first = title_name(row.get("first_name"))
    last = title_name(row.get("last_name"))
    middle_raw = ns(str(row.get("middle_name")))
    middle = title_name(middle_raw) if middle_raw else None
    city = ns(str(row.get("practice_city")))
    state = ns(str(row.get("practice_state")))
    if target_version == "v2":
        return {
            "id": hcp_id,
            "first_name": first or "Unknown",
            "last_name": last or "Unknown",
            "middle_name": middle,
            "npi_number": npi,
            "credentials": normalize_credentials(row.get("credentials")),
            "nppes_practice_city": city if city else None,
            "nppes_practice_state": state if state else None,
            "country": "USA",
            "total_career_pubs": 0,
            "career_first_pub_year": None,
            "cohort_classification": "community",
        }
    payload: Dict[str, Any] = {
        "id": hcp_id,
        "first_name": first or "Unknown",
        "last_name": last or "Unknown",
        "npi_number": npi,
        "credentials": normalize_credentials(row.get("credentials")),
        "state": state if state else None,
        "country": "USA",
        "city": city if city else None,
        "institution_short": None,
        "middle_name": middle,
        "source": "nppes_workstream_b",
        "source_calculated_at": ts_iso,
        "affiliation_classification": "clinician",
        "clinician_score": 1.0,
        "affiliation_profile": AFFILIATION_PROFILE,
        "affiliation_profile_calculated_at": ts_iso,
        "total_career_pubs": 0,
        "first_pub_year": None,
    }
    return payload


def ta_rows_for_hcp(
    hcp_id: str, ta_ids: Sequence[str], target_version: str = "v1"
) -> List[Dict[str, Any]]:
    if target_version == "v2":
        return [
            {"hcp_id": hcp_id, "therapeutic_area_id": tid, "publication_count": 0}
            for tid in ta_ids
        ]
    return [{"hcp_id": hcp_id, "therapeutic_area_id": tid, "strength_score": None} for tid in ta_ids]


def _write_table_batch(
    client: Client, table: str, rows: List[Dict[str, Any]], target_version: str = "v1"
) -> None:
    routed_table = get_table_name(table, target_version)
    if table == "hcps":
        # ignore_duplicates=True legitimately returns empty data when all rows
        # already exist (by npi_number). Don't raise on empty response in that case.
        client.table(routed_table).upsert(rows, on_conflict="npi_number", ignore_duplicates=True).execute()
    else:
        response = client.table(routed_table).insert(rows).execute()
        if not response.data:
            raise RuntimeError(
                f"Insert into {routed_table} returned empty data ({len(rows)} rows) - "
                f"writes may have been silently dropped"
            )


def insert_batch(
    client: Client,
    table: str,
    batch: List[Dict[str, Any]],
    failed_batches_out: List[Dict[str, Any]],
    target_version: str = "v1",
) -> int:
    """
    Insert one batch. On statement timeout only, split batch into chunks of RETRY_CHUNK and retry each once.
    hcps uses upsert on npi_number with ignore_duplicates; hcp_therapeutic_areas uses insert.
    Returns number of rows successfully inserted.
    """
    if not batch:
        return 0
    try:
        _write_table_batch(client, table, batch, target_version=target_version)
        return len(batch)
    except Exception as exc:
        if is_statement_timeout(exc) and len(batch) > RETRY_CHUNK:
            inserted = 0
            for j in range(0, len(batch), RETRY_CHUNK):
                sub = batch[j : j + RETRY_CHUNK]
                try:
                    _write_table_batch(client, table, sub, target_version=target_version)
                    inserted += len(sub)
                except Exception as exc2:
                    failed_batches_out.append(
                        {"table": table, "batch_size": len(sub), "error": repr(exc2)}
                    )
            return inserted
        failed_batches_out.append({"table": table, "batch_size": len(batch), "error": repr(exc)})
        return 0


def main() -> None:
    import argparse

    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--target-version",
        choices=["v1", "v2"],
        default="v1",
        help="Schema version. v1=legacy tables, v2=rebuild tables.",
    )
    parser.add_argument(
        "--npi-filter",
        type=str,
        default=None,
        help="Optional CSV path with 'npi' column. Restrict ingest to NPIs in this list "
             "(intersected with taxonomy filter).",
    )
    args = parser.parse_args()
    target_version = args.target_version
    npi_filter_path = args.npi_filter

    load_dotenv()
    client = init_supabase()
    ts_iso = datetime.now(timezone.utc).isoformat()

    df = pd.read_parquet(PARQUET_PATH, dtype_backend="numpy_nullable")
    missing = [c for c in REQUIRED_COLUMNS if c not in df.columns]
    if missing:
        raise RuntimeError(f"Parquet missing columns: {missing}")

    for col in REQUIRED_COLUMNS:
        df[col] = df[col].astype(str)

    ta_masks: Dict[str, Dict[str, Any]] = {}
    for slug in list_ta_configs():
        cfg = load_ta_config(slug)
        nppes_cfg = cfg.get("nppes") or {}
        taxonomies = nppes_cfg.get("taxonomies") or []
        if not taxonomies:
            continue
        ta_masks[slug] = {
            "ta_uuid": cfg["ta_uuid"],
            "mask": taxonomy_match_mask(df, set(taxonomies)),
            "name": cfg["name"],
        }

    if not ta_masks:
        raise RuntimeError("No TA configs with nppes.taxonomies found in config/therapeutic_areas/")

    mask_union = None
    for slug, entry in ta_masks.items():
        mask_union = entry["mask"] if mask_union is None else (mask_union | entry["mask"])

    ta_names = [entry["name"] for entry in ta_masks.values()]
    print(f"Loaded NPPES taxonomy filters for: {', '.join(ta_names)}")
    for slug, entry in sorted(ta_masks.items()):
        print(f"  {entry['name']} ({slug}): {int(entry['mask'].sum()):,} matching rows")

    # If --npi-filter provided, intersect with the NPI list from CSV
    if npi_filter_path:
        import csv
        allowed_npis = set()
        with open(npi_filter_path, "r", encoding="utf-8") as f:
            reader = csv.DictReader(f)
            for row in reader:
                npi_val = row.get("npi", "").strip()
                if npi_val:
                    allowed_npis.add(npi_val)
        print(f"Loaded {len(allowed_npis):,} NPIs from --npi-filter ({npi_filter_path})")
        npi_str = df["npi"].astype(str).str.strip()
        mask_in_filter = npi_str.isin(allowed_npis)
        mask_union = mask_union & mask_in_filter
        print(f"Applied --npi-filter intersection")

    filtered = df.loc[mask_union].copy()
    for slug, entry in ta_masks.items():
        filtered[f"_match_{slug}"] = entry["mask"].loc[filtered.index]

    total_matching_rows = len(filtered)
    ta_label_union = " | ".join(entry["name"] for entry in ta_masks.values())
    print(f"NPPES rows matching {ta_label_union} taxonomies: {total_matching_rows:,}")

    agg_rows: List[Tuple[str, pd.Series, List[str]]] = []
    for npi_raw, grp in tqdm(
        filtered.groupby(filtered["npi"].astype(str).str.strip()),
        desc="aggregating NPIs",
        unit="npi",
    ):
        npi_norm = normalize_npi_digits(npi_raw)
        if not npi_norm:
            continue
        ta_ids: List[str] = []
        for slug, entry in ta_masks.items():
            if bool(grp[f"_match_{slug}"].any()):
                ta_ids.append(entry["ta_uuid"])
        row0 = grp.sort_index().iloc[0]
        agg_rows.append((npi_norm, row0, ta_ids))

    total_unique_matching = len(agg_rows)
    print(f"Unique 10-digit NPIs in filter: {total_unique_matching:,}")

    existing = fetch_existing_npis(client, target_version=target_version)
    to_ingest: List[Tuple[str, pd.Series, List[str]]] = [
        (npi, row, tas) for npi, row, tas in agg_rows if npi not in existing
    ]
    skipped = total_unique_matching - len(to_ingest)
    print(f"Skipping (already in hcps): {skipped:,}")
    print(f"New HCPs to insert: {len(to_ingest):,}")

    failed_batches: List[Dict[str, Any]] = []

    inserted_hcps = 0
    inserted_ta_rows = 0

    ta_dist: Counter[str] = Counter()
    state_dist: Counter[str] = Counter()

    processed_new = 0
    total_new = len(to_ingest)

    for npi, row, ta_ids in to_ingest:
        st = ns(str(row.get("practice_state")))
        if st:
            state_dist[st] += 1
        for tid in ta_ids:
            ta_dist[tid] += 1

    for start in tqdm(range(0, total_new, BATCH_HCPS), desc="ingesting HCPs", unit="batch"):
        slab = to_ingest[start : start + BATCH_HCPS]
        hcp_batch: List[Dict[str, Any]] = []
        ta_batch: List[Dict[str, Any]] = []
        for npi, row, ta_ids in slab:
            hcp_id = str(uuid.uuid4())
            hcp_batch.append(build_hcp_payload(hcp_id, npi, row, ts_iso, target_version=target_version))
            ta_batch.extend(ta_rows_for_hcp(hcp_id, ta_ids, target_version=target_version))

        nh = insert_batch(client, "hcps", hcp_batch, failed_batches, target_version=target_version)
        inserted_hcps += nh
        if nh == len(hcp_batch):
            for t_start in range(0, len(ta_batch), BATCH_TA):
                sub_t = ta_batch[t_start : t_start + BATCH_TA]
                inserted_ta_rows += insert_batch(
                    client,
                    "hcp_therapeutic_areas",
                    sub_t,
                    failed_batches,
                    target_version=target_version,
                )
        else:
            failed_batches.append(
                {
                    "table": "hcp_therapeutic_areas",
                    "batch_size": len(ta_batch),
                    "error": "skipped (hcps slab incomplete after insert/retry)",
                }
            )

        processed_new += len(slab)
        if processed_new % PROGRESS_EVERY == 0 or processed_new == total_new:
            print(
                f"Ingested {inserted_hcps:,} of total {total_new:,} new HCPs "
                f"(skipped {skipped:,} already in database by NPI)"
            )

    print("\n" + "=" * 72)
    print("Summary")
    print("=" * 72)
    print(f"Total NPPES rows matching taxonomy filter: {total_matching_rows:,}")
    print(f"Total unique qualifying NPIs (10-digit): {total_unique_matching:,}")
    print(f"Total skipped (existing NPI in hcps): {skipped:,}")
    print(f"Total new hcps rows inserted (acknowledged): {inserted_hcps:,}")
    print(f"Total hcp_therapeutic_areas rows inserted: {inserted_ta_rows:,}")
    print("\nTherapeutic-area association counts (planned, one row per TA per new HCP):")
    ta_labels = {entry["ta_uuid"]: entry["name"] for entry in ta_masks.values()}
    for tid, cnt in sorted(ta_dist.items(), key=lambda kv: (-kv[1], kv[0])):
        print(f"  {ta_labels.get(tid, tid)}: {cnt:,}")
    print("\nTop 10 source states (planned ingest list before DB failures):")
    for st, cnt in state_dist.most_common(10):
        print(f"  {st!r}: {cnt:,}")
    print(f"\nFailed / logged batch events: {len(failed_batches)}")
    for fb in failed_batches[:25]:
        print(f"  {fb}")
    if len(failed_batches) > 25:
        print(f"  ... ({len(failed_batches) - 25} more)")


if __name__ == "__main__":
    main()
