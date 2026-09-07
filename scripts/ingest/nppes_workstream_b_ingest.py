"""
Ingest Workstream B community HCPs from NPPES Parquet into hcps + hcp_therapeutic_areas.

Requires SUPABASE_URL, SUPABASE_KEY in environment (.env OK via load_dotenv).

Run manually after applying schema SQL migrations.

TWO OUTCOMES, NOT ONE (changed 2026-09-06, CRC_COMMUNITY_BUILD.md phase 1)
--------------------------------------------------------------------------
This script used to treat "this NPI already has an hcps record" as "nothing to
do." That is correct for the first TA ever ingested and wrong for every one
after it: a physician already in the database under one TA, who also carries a
second TA's taxonomy code, was dropped by the skip and never got the second
TA's link. The population read as absent when it was only unlinked -- which is
the whole reason a hand-written INSERT...SELECT backfill looked necessary.

Now:
  to_create  no record for this NPI  -> insert the record and all its TA links
  to_link    record exists           -> add ONLY the TA links it is missing

ADD-ONLY. An existing link is never rewritten and never deleted. publication_count
and a publication-derived `source` on a link this script did not create are not
ours to touch. That is also what makes re-running a no-op: a link either already
exists (skip) or does not (add once).

Both outcomes are logged to nppes_enrichment_log_v2 under DISTINCT match_reason
prefixes (LOG_REASON_CREATED / LOG_REASON_LINKED) -- creating a person and
asserting a disease area about an existing person are different events with
different risk, and the counts must stay separable afterwards.

Every link this script writes carries source='nppes_taxonomy'. Applying
docs/crc_community/01_ta_link_source.sql is a prerequisite for --execute.

ONE TA PER RUN. --ta is required and has no default. The script used to process
the union of every config carrying a taxonomy set, so a colorectal run would also
have created 17,296 Atopic Dermatitis records -- a decision nobody made, arriving
unannounced inside another TA's build.

MODE: --dry-run is the DEFAULT. Writes require an explicit --execute.
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

# hcp_therapeutic_areas_v2.source -- how the link was derived. Two values only,
# because there are only two writers of that table: ta_tagging_rebuild_v2.py
# (publication concepts) and this script (NPPES taxonomy). NULL means unknown and
# is never written deliberately. DDL + backfill: docs/crc_community/01_ta_link_source.sql
LINK_SOURCE_TAXONOMY = "nppes_taxonomy"

# nppes_enrichment_log_v2.match_reason prefixes. "A record was created" and "an
# existing record gained a TA link" are different events with different risk, and
# the counts have to be separable after the fact -- hence two stable prefixes
# rather than one reason with a flag buried in the JSON.
LOG_REASON_CREATED = "workstream_b: new HCP record created from NPPES taxonomy match"
LOG_REASON_LINKED = "workstream_b: TA link added to existing HCP record from NPPES taxonomy match"

# Not a probabilistic match. Identity here IS the NPI, taken from the registry, so
# 'high_confidence'/'ambiguous' (this script's siblings' vocabulary) would both
# misdescribe it.
LOG_CONFIDENCE = "registry_identity"

LOG_BATCH = 500

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


def fetch_existing_npi_map(client: Client, target_version: str = "v1") -> Dict[str, str]:
    """
    npi -> hcp_id for every HCP that already has an NPI.

    Used to be a Set[str] used only to skip. It has to be a map now: an NPI that
    already has a record is not "nothing to do" -- it may still be missing this
    TA's link, and adding that link needs the hcp_id.
    """
    hcps_table = get_table_name("hcps", target_version)
    existing: Dict[str, str] = {}
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
                existing[n] = str(row["id"])
        offset += PREFLIGHT_PAGE_SIZE
        if len(batch) < PREFLIGHT_PAGE_SIZE:
            break
    print(f"Preflight: {len(existing):,} existing NPIs in hcps (non-null)")
    return existing


def fetch_linked_hcp_ids(client: Client, ta_uuid: str, target_version: str = "v1") -> Set[str]:
    """hcp_ids already linked to this TA. The idempotency guard for the link pass."""
    ta_table = get_table_name("hcp_therapeutic_areas", target_version)
    linked: Set[str] = set()
    offset = 0
    while True:
        batch = (
            client.table(ta_table)
            .select("hcp_id")
            .eq("therapeutic_area_id", ta_uuid)
            .order("hcp_id")
            .range(offset, offset + PREFLIGHT_PAGE_SIZE - 1)
            .execute()
            .data
            or []
        )
        if not batch:
            break
        for row in batch:
            linked.add(str(row["hcp_id"]))
        offset += PREFLIGHT_PAGE_SIZE
        if len(batch) < PREFLIGHT_PAGE_SIZE:
            break
    return linked


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
        # source: every link this script writes is asserted from an NPPES taxonomy
        # code and nothing else -- no publication, no claim, no drug. It says so on
        # the row. See docs/crc_community/01_ta_link_source.sql.
        return [
            {
                "hcp_id": hcp_id,
                "therapeutic_area_id": tid,
                "publication_count": 0,
                "source": LINK_SOURCE_TAXONOMY,
            }
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


def log_rows_for_created(
    hcp_id: str, npi: str, ta_slugs: Sequence[str], codes: Sequence[str], ts_iso: str
) -> List[Dict[str, Any]]:
    return [
        {
            "hcp_id": hcp_id,
            "matched_npi": npi,
            "match_confidence": LOG_CONFIDENCE,
            "match_reason": f"{LOG_REASON_CREATED}; ta={','.join(sorted(ta_slugs))}",
            "candidates_considered": {
                "source": LINK_SOURCE_TAXONOMY,
                "ta_slugs": sorted(ta_slugs),
                "taxonomy_codes": sorted(set(codes)),
            },
            "enriched_at": ts_iso,
        }
    ]


def log_row_for_link(
    hcp_id: str, npi: str, ta_slug: str, codes: Sequence[str], ts_iso: str
) -> Dict[str, Any]:
    return {
        "hcp_id": hcp_id,
        "matched_npi": npi,
        "match_confidence": LOG_CONFIDENCE,
        "match_reason": f"{LOG_REASON_LINKED}; ta={ta_slug}",
        "candidates_considered": {
            "source": LINK_SOURCE_TAXONOMY,
            "ta_slugs": [ta_slug],
            "taxonomy_codes": sorted(set(codes)),
        },
        "enriched_at": ts_iso,
    }


def write_enrichment_log(client: Client, rows: List[Dict[str, Any]]) -> int:
    if not rows:
        return 0
    written = 0
    for start in range(0, len(rows), LOG_BATCH):
        batch = rows[start : start + LOG_BATCH]
        client.table("nppes_enrichment_log_v2").insert(batch).execute()
        written += len(batch)
    return written


def matched_codes_for(row: pd.Series, codes: Set[str]) -> List[str]:
    """Which of this TA's taxonomy codes this NPPES record actually carries."""
    found: List[str] = []
    for i in range(1, 6):
        c = ns(str(row.get(f"taxonomy_{i}")))
        if c in codes and c not in found:
            found.append(c)
    return found


def resolve_requested_ta(slug: Optional[str]) -> Tuple[str, Dict[str, Any], List[str]]:
    """
    --ta is required and has no default. Returns (slug, config, taxonomy codes).

    Exits with the list of valid slugs rather than a bare argparse error, because
    the failure this guards against is running the wrong TA, and the reader needs
    to see what the right ones are.
    """
    available = sorted(list_ta_configs())
    if not slug:
        raise SystemExit(
            "--ta is required and has no default. One therapeutic area per run.\n"
            "  This script used to process the union of every TA with a taxonomy set, so a\n"
            "  colorectal run would also have created 17,296 Atopic Dermatitis records.\n"
            f"  Available TA slugs: {', '.join(available)}"
        )
    if slug not in available:
        raise SystemExit(
            f"Unknown TA slug {slug!r}.\n  Available TA slugs: {', '.join(available)}"
        )

    cfg = load_ta_config(slug)
    taxonomies = list((cfg.get("nppes") or {}).get("taxonomies") or [])
    if not taxonomies:
        raise SystemExit(
            f"TA {slug!r} has no nppes.taxonomies in config/therapeutic_areas/{slug}.json.\n"
            "  That code set decides who counts as a member of this therapeutic area. It is a\n"
            "  founder decision and this script will not guess it.\n"
            "  See CRC_COMMUNITY_BUILD.md, FOUNDER INPUTS REQUIRED #1 and #2."
        )
    return slug, cfg, taxonomies


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
        "--ta",
        type=str,
        default=None,
        help="REQUIRED. Therapeutic area slug. One TA per run; there is no default and "
             "no all-TA mode.",
    )
    parser.add_argument(
        "--npi-filter",
        type=str,
        default=None,
        help="Optional CSV path with 'npi' column. Restrict ingest to NPIs in this list "
             "(intersected with taxonomy filter).",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        default=True,
        help="Compute the plan and write nothing (DEFAULT; kept for explicitness)",
    )
    parser.add_argument(
        "--execute",
        action="store_true",
        help="Actually write. Requires hcp_therapeutic_areas_v2.source to exist "
             "(docs/crc_community/01_ta_link_source.sql).",
    )
    args = parser.parse_args()
    target_version = args.target_version
    npi_filter_path = args.npi_filter
    dry_run = not args.execute

    # Resolved BEFORE the parquet load, which costs ~40s. A missing --ta should
    # fail in under a second.
    ta_slug, ta_cfg, taxonomies = resolve_requested_ta(args.ta)

    print(f"TA={ta_slug} ({ta_cfg['name']}) — {len(taxonomies)} taxonomy code(s)")
    print(f"Mode: {'DRY-RUN (no writes)' if dry_run else 'EXECUTE (writes enabled)'}")

    load_dotenv()
    client = init_supabase()
    ts_iso = datetime.now(timezone.utc).isoformat()

    df = pd.read_parquet(PARQUET_PATH, dtype_backend="numpy_nullable")
    missing = [c for c in REQUIRED_COLUMNS if c not in df.columns]
    if missing:
        raise RuntimeError(f"Parquet missing columns: {missing}")

    for col in REQUIRED_COLUMNS:
        df[col] = df[col].astype(str)

    # ONE TA PER RUN. This used to loop every config with a non-empty taxonomy
    # list and ingest their union, so a colorectal run would silently have created
    # 17,296 Atopic Dermatitis records as well -- a decision nobody made, arriving
    # unannounced inside another TA's build. ta_masks stays a dict so the rest of
    # the script is unchanged; it now holds exactly one entry.
    ta_masks: Dict[str, Dict[str, Any]] = {
        ta_slug: {
            "ta_uuid": ta_cfg["ta_uuid"],
            "mask": taxonomy_match_mask(df, set(taxonomies)),
            "name": ta_cfg["name"],
            "codes": set(taxonomies),
        }
    }

    mask_union = ta_masks[ta_slug]["mask"]

    print(f"Loaded NPPES taxonomy filter for: {ta_cfg['name']}")
    print(f"  {ta_cfg['name']} ({ta_slug}): {int(mask_union.sum()):,} matching rows")

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

    existing = fetch_existing_npi_map(client, target_version=target_version)

    # THE SKIP, CORRECTED.
    #
    # This used to be one list and one rule: "NPI already in hcps -> nothing to
    # do." That is right for the first TA ingested and wrong for every one after
    # it. An oncologist ingested under nsclc who also carries a colorectal code is
    # already an hcps row, so the old rule dropped them -- and they never got the
    # colorectal link. The population looked absent when it was only unlinked.
    #
    # Two outcomes now, not one:
    #   to_create  NPI has no record   -> insert the record and all its TA links
    #   to_link    NPI has a record    -> add ONLY the TA links it is missing
    #
    # Add-only, always. An existing link is never rewritten and never removed:
    # publication_count and a publication-derived `source` on a link this script
    # did not create are not ours to touch. That is also what makes a second run a
    # no-op -- the link either exists (skip) or it does not (add once).
    to_create: List[Tuple[str, pd.Series, List[str]]] = []
    to_link: List[Tuple[str, pd.Series, List[str]]] = []
    for npi, row, tas in agg_rows:
        (to_link if npi in existing else to_create).append((npi, row, tas))

    skipped = len(to_link)
    print(f"Already in hcps (candidates for a missing TA link): {skipped:,}")
    print(f"New HCPs to insert: {len(to_create):,}")

    ta_uuid_to_slug = {entry["ta_uuid"]: slug for slug, entry in ta_masks.items()}

    # Idempotency guard for the link pass: who is linked to each TA right now.
    linked_now: Dict[str, Set[str]] = {}
    for slug, entry in ta_masks.items():
        linked_now[entry["ta_uuid"]] = fetch_linked_hcp_ids(
            client, entry["ta_uuid"], target_version=target_version
        )
        print(f"  {slug}: {len(linked_now[entry['ta_uuid']]):,} HCPs already linked")

    link_rows: List[Dict[str, Any]] = []
    link_log_rows: List[Dict[str, Any]] = []
    link_dist: Counter[str] = Counter()
    for npi, row, ta_ids in to_link:
        hcp_id = existing[npi]
        missing = [tid for tid in ta_ids if hcp_id not in linked_now.get(tid, set())]
        if not missing:
            continue
        link_rows.extend(ta_rows_for_hcp(hcp_id, missing, target_version=target_version))
        for tid in missing:
            slug = ta_uuid_to_slug.get(tid, tid)
            link_dist[tid] += 1
            link_log_rows.append(
                log_row_for_link(
                    hcp_id, npi, slug, matched_codes_for(row, ta_masks[slug]["codes"]), ts_iso
                )
            )

    print(f"TA links to add to existing records: {len(link_rows):,}")

    failed_batches: List[Dict[str, Any]] = []

    inserted_hcps = 0
    inserted_ta_rows = 0
    inserted_links = 0
    logged_created = 0
    logged_linked = 0

    ta_dist: Counter[str] = Counter()
    state_dist: Counter[str] = Counter()

    processed_new = 0
    total_new = len(to_create)

    for npi, row, ta_ids in to_create:
        st = ns(str(row.get("practice_state")))
        if st:
            state_dist[st] += 1
        for tid in ta_ids:
            ta_dist[tid] += 1

    if dry_run:
        print("\n[dry-run] no rows written. Planned:")
        print(f"  hcps rows to insert ............... {total_new:,}")
        print(f"  TA links for those new records .... {sum(ta_dist.values()):,}")
        print(f"  TA links added to existing records  {len(link_rows):,}")
        print(f"  nppes_enrichment_log_v2 rows ...... {total_new + len(link_log_rows):,}")

    for start in tqdm(
        range(0, 0 if dry_run else total_new, BATCH_HCPS), desc="ingesting HCPs", unit="batch"
    ):
        slab = to_create[start : start + BATCH_HCPS]
        hcp_batch: List[Dict[str, Any]] = []
        ta_batch: List[Dict[str, Any]] = []
        log_batch: List[Dict[str, Any]] = []
        for npi, row, ta_ids in slab:
            hcp_id = str(uuid.uuid4())
            hcp_batch.append(build_hcp_payload(hcp_id, npi, row, ts_iso, target_version=target_version))
            ta_batch.extend(ta_rows_for_hcp(hcp_id, ta_ids, target_version=target_version))
            slugs = [ta_uuid_to_slug.get(t, t) for t in ta_ids]
            codes: List[str] = []
            for s in slugs:
                codes.extend(matched_codes_for(row, ta_masks[s]["codes"]))
            log_batch.extend(log_rows_for_created(hcp_id, npi, slugs, codes, ts_iso))

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
            if target_version == "v2":
                logged_created += write_enrichment_log(client, log_batch)
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
                f"({skipped:,} NPIs already had a record)"
            )

    # ---- the link pass: existing records that were missing this TA's link ----
    # Runs after the create pass so a failure there cannot leave links pointing at
    # records that were never written. These rows touch no hcps column at all.
    if not dry_run and link_rows:
        for l_start in tqdm(
            range(0, len(link_rows), BATCH_TA), desc="linking existing HCPs", unit="batch"
        ):
            sub_l = link_rows[l_start : l_start + BATCH_TA]
            added = insert_batch(
                client, "hcp_therapeutic_areas", sub_l, failed_batches, target_version=target_version
            )
            inserted_links += added
            if added == len(sub_l) and target_version == "v2":
                logged_linked += write_enrichment_log(
                    client, link_log_rows[l_start : l_start + BATCH_TA]
                )

    print("\n" + "=" * 72)
    print("Summary")
    print("=" * 72)
    print(f"Total NPPES rows matching taxonomy filter: {total_matching_rows:,}")
    print(f"Total unique qualifying NPIs (10-digit): {total_unique_matching:,}")
    print(f"NPIs that already had an hcps record: {skipped:,}")
    print(f"Total new hcps rows inserted (acknowledged): {inserted_hcps:,}")
    print(f"TA links written for new records: {inserted_ta_rows:,}")
    print(f"TA links added to EXISTING records: {inserted_links:,}")
    print(f"nppes_enrichment_log_v2 rows -- created: {logged_created:,}, linked: {logged_linked:,}")

    ta_labels = {entry["ta_uuid"]: entry["name"] for entry in ta_masks.values()}
    print("\nNEW RECORD CREATED, per TA (planned):")
    for tid, cnt in sorted(ta_dist.items(), key=lambda kv: (-kv[1], kv[0])):
        print(f"  {ta_labels.get(tid, tid)}: {cnt:,}")
    print("\nTA LINK ADDED TO EXISTING RECORD, per TA (planned):")
    if not link_dist:
        print("  none -- every existing record already carries the links it qualifies for")
    for tid, cnt in sorted(link_dist.items(), key=lambda kv: (-kv[1], kv[0])):
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
