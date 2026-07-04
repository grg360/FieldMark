"""
FieldMark — Rebuild publication_authors_v2 (scoped, additive-only mode).

Links HCPs to their publications via OpenAlex author IDs, using the author_pub_flat
staging table. Disambiguates misattributed clusters (one openalex_author_id → multiple HCPs)
via ROR, institution name, then country — preserving the original Step F anti-conflation logic.

DEFAULT: --only-new-hcps mode scopes the ENTIRE operation to HCPs linked today.
SAFETY: In scoped mode, this script NEVER deletes, NEVER wipes, and is provably incapable
of writing a publication_authors_v2 row for any hcp_id outside the scoped set.

Requires: SUPABASE_URL, SUPABASE_KEY in env or .env.

Examples:
  python scripts/classify/rebuild_publication_authors_v2.py --only-new-hcps --dry-run
  python scripts/classify/rebuild_publication_authors_v2.py --only-new-hcps --limit 100
  python scripts/classify/rebuild_publication_authors_v2.py --only-new-hcps --execute
  python scripts/classify/rebuild_publication_authors_v2.py --hcp-ids-file new_hcp_ids.txt --execute
"""

from __future__ import annotations

import argparse
import json
import os
import re
import sys
import time
from collections import Counter
from dataclasses import dataclass, field
from datetime import datetime, date, timezone
from typing import Any, Dict, List, Optional, Sequence, Set, Tuple

from dotenv import load_dotenv
from supabase import Client, create_client

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

PAGE_SIZE = 1000
WRITE_BATCH_SIZE = 500
HCP_FETCH_CHUNK = 200
PROGRESS_EVERY = 5000

METHOD_UNIQUE = "step_f_unique_hcp"
METHOD_ROR = "step_f_misattributed_cluster_disambiguated_by_ror"
METHOD_INST = "step_f_misattributed_cluster_disambiguated_by_institution_name"
METHOD_COUNTRY = "step_f_misattributed_cluster_disambiguated_by_country"

ORPHAN_NO_SIGNALS = "no_ror_no_institution_no_country"
ORPHAN_ROR_NO_MATCH = "ror_no_match"
ORPHAN_INST_NO_MATCH = "institution_no_match"
ORPHAN_COUNTRY_NO_MATCH = "country_no_match"
ORPHAN_MULTI_COUNTRY = "multiple_hcps_match_country_no_other_disambiguator"


# ---------------------------------------------------------------------------
# Normalization helpers (from preview_step_b_matching — inlined to avoid archive import)
# ---------------------------------------------------------------------------

def normalize_ror(raw: Any) -> str:
    if not raw:
        return ""
    s = str(raw).strip().lower()
    if "ror.org/" in s:
        s = s.split("ror.org/")[-1]
    s = s.strip("/").strip()
    if not s:
        return ""
    if re.fullmatch(r"[a-z0-9]{9}", s):
        return s
    return ""


def normalize_openalex_author_id(raw: Any) -> str:
    if not raw:
        return ""
    s = str(raw).strip()
    if not s:
        return ""
    if "openalex.org/" in s:
        s = s.split("openalex.org/")[-1]
    s = s.strip("/").strip().upper()
    if s.startswith("A") and len(s) > 1:
        return f"https://openalex.org/{s}"
    return ""


def strip_ascii_diacritics(s: str) -> str:
    import unicodedata
    nfkd = unicodedata.normalize("NFKD", s)
    return "".join(c for c in nfkd if not unicodedata.combining(c))


def normalize_institution_for_match(s: Optional[str]) -> str:
    if not s:
        return ""
    t = strip_ascii_diacritics(str(s).lower())
    for ch in ".,;:-_()[]{}":
        t = t.replace(ch, " ")
    t = re.sub(r"\s+", " ", t).strip()
    return t


def normalize_country_code(raw: Optional[str]) -> str:
    if not raw:
        return ""
    s = str(raw).strip().upper()
    if s in ("USA", "UNITED STATES"):
        return "US"
    if len(s) == 2:
        return s
    return s[:2] if len(s) >= 2 else s


# ---------------------------------------------------------------------------
# Environment / client
# ---------------------------------------------------------------------------

def get_env(name: str) -> str:
    v = os.getenv(name)
    if not v:
        raise EnvironmentError(f"Missing env var: {name}")
    return v


def init_client() -> Client:
    return create_client(get_env("SUPABASE_URL"), get_env("SUPABASE_KEY"))


# ---------------------------------------------------------------------------
# Data structures
# ---------------------------------------------------------------------------

@dataclass
class HcpClusterMember:
    hcp_id: str
    institution: str
    institution_norm: str
    country_codes: Set[str]
    ror_ids: Set[str] = field(default_factory=set)


# ---------------------------------------------------------------------------
# Disambiguation (preserved exactly from Step F)
# ---------------------------------------------------------------------------

def country_filter(candidates: Sequence[HcpClusterMember], auth_country: str) -> List[HcpClusterMember]:
    if not auth_country:
        return list(candidates)
    return [c for c in candidates if auth_country in c.country_codes]


def disambiguate_cluster(
    cluster: Sequence[HcpClusterMember],
    auth_ror: str,
    auth_inst_norm: str,
    auth_country: str,
) -> Tuple[Optional[HcpClusterMember], Optional[str], str, str]:
    """
    Returns (winner, orphan_reason_or_none, match_method, match_confidence).
    orphan_reason set iff winner is None.
    """
    has_ror = bool(auth_ror)
    has_inst = bool(auth_inst_norm)
    has_country = bool(auth_country)

    if not has_ror and not has_inst and not has_country:
        return None, ORPHAN_NO_SIGNALS, "", "none"

    cluster_list = list(cluster)

    # (a) ROR on authorship
    if has_ror:
        m_ror = [c for c in cluster_list if auth_ror in c.ror_ids]
        if len(m_ror) == 1:
            return m_ror[0], None, METHOD_ROR, "high"
        if len(m_ror) > 1:
            m_co = country_filter(m_ror, auth_country)
            if len(m_co) == 1:
                return m_co[0], None, METHOD_COUNTRY, "medium"
            if len(m_co) == 0:
                return None, ORPHAN_COUNTRY_NO_MATCH, "", "none"
            return None, ORPHAN_MULTI_COUNTRY, "", "none"
        return None, ORPHAN_ROR_NO_MATCH, "", "none"

    # (b) Institution name
    if has_inst:
        m_inst = [c for c in cluster_list if auth_inst_norm and c.institution_norm and auth_inst_norm == c.institution_norm]
        if len(m_inst) == 1:
            return m_inst[0], None, METHOD_INST, "medium"
        if len(m_inst) > 1:
            m_co = country_filter(m_inst, auth_country)
            if len(m_co) == 1:
                return m_co[0], None, METHOD_COUNTRY, "medium"
            if len(m_co) == 0:
                return None, ORPHAN_COUNTRY_NO_MATCH, "", "none"
            return None, ORPHAN_MULTI_COUNTRY, "", "none"
        return None, ORPHAN_INST_NO_MATCH, "", "none"

    # (c) Only country
    m_co = country_filter(cluster_list, auth_country)
    if len(m_co) == 1:
        return m_co[0], None, METHOD_COUNTRY, "medium"
    if len(m_co) == 0:
        return None, ORPHAN_COUNTRY_NO_MATCH, "", "none"
    return None, ORPHAN_MULTI_COUNTRY, "", "none"


# ---------------------------------------------------------------------------
# Scoped HCP loading
# ---------------------------------------------------------------------------

def load_new_hcp_ids_by_linked_at(client: Client, cutoff_date: str) -> Set[str]:
    """Load HCP IDs whose hcp_openalex_authors_v2 rows have linked_at >= cutoff."""
    print(f"Loading HCP IDs from hcp_openalex_authors_v2 with linked_at >= {cutoff_date}...")
    hcp_ids: Set[str] = set()
    offset = 0
    while True:
        rows = (
            client.table("hcp_openalex_authors_v2")
            .select("hcp_id")
            .gte("linked_at", cutoff_date)
            .order("hcp_id")
            .range(offset, offset + PAGE_SIZE - 1)
            .execute()
            .data or []
        )
        if not rows:
            break
        for r in rows:
            hid = r.get("hcp_id")
            if hid:
                hcp_ids.add(str(hid))
        offset += len(rows)
        if len(rows) < PAGE_SIZE:
            break
    print(f"  Found {len(hcp_ids):,} distinct HCPs linked today or later.")
    return hcp_ids


def load_hcp_ids_from_file(path: str) -> Set[str]:
    """Load HCP UUIDs from a text file (one per line)."""
    hcp_ids: Set[str] = set()
    with open(path, "r", encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if line and not line.startswith("#"):
                hcp_ids.add(line)
    print(f"Loaded {len(hcp_ids):,} HCP IDs from {path}")
    return hcp_ids


# ---------------------------------------------------------------------------
# Linkage index (HCP metadata for disambiguation)
# ---------------------------------------------------------------------------

def fetch_oa_links_for_hcps(client: Client, hcp_ids: Set[str]) -> List[Dict[str, Any]]:
    """Fetch hcp_openalex_authors_v2 rows for the scoped HCPs."""
    rows: List[Dict[str, Any]] = []
    hcp_list = sorted(hcp_ids)
    for i in range(0, len(hcp_list), HCP_FETCH_CHUNK):
        chunk = hcp_list[i:i + HCP_FETCH_CHUNK]
        batch = (
            client.table("hcp_openalex_authors_v2")
            .select("hcp_id,openalex_author_id")
            .in_("hcp_id", chunk)
            .execute()
            .data or []
        )
        rows.extend(batch)
    return rows


def fetch_hcps_metadata(client: Client, hcp_ids: Set[str]) -> Dict[str, Dict[str, Any]]:
    """Fetch institution/country metadata from hcps_v2 for disambiguation."""
    out: Dict[str, Dict[str, Any]] = {}
    hcp_list = sorted(hcp_ids)
    for i in range(0, len(hcp_list), HCP_FETCH_CHUNK):
        chunk = hcp_list[i:i + HCP_FETCH_CHUNK]
        rows = (
            client.table("hcps_v2")
            .select("id,institution_normalized,institution_raw,institution_canonical,country")
            .in_("id", chunk)
            .execute()
            .data or []
        )
        for r in rows:
            hid = r.get("id")
            if hid:
                out[str(hid)] = r
    return out


def fetch_all_oa_links_for_oa_ids(client: Client, oa_ids: Set[str]) -> List[Dict[str, Any]]:
    """For disambiguation: load ALL HCPs that share the given OA IDs (may include non-scoped HCPs)."""
    rows: List[Dict[str, Any]] = []
    oa_list = sorted(oa_ids)
    for i in range(0, len(oa_list), HCP_FETCH_CHUNK):
        chunk = oa_list[i:i + HCP_FETCH_CHUNK]
        batch = (
            client.table("hcp_openalex_authors_v2")
            .select("hcp_id,openalex_author_id")
            .in_("openalex_author_id", chunk)
            .execute()
            .data or []
        )
        rows.extend(batch)
    return rows


def build_linkage_index(
    client: Client, scoped_hcp_ids: Set[str]
) -> Tuple[Dict[str, List[HcpClusterMember]], Set[str]]:
    """
    Build {openalex_author_id: [HcpClusterMember, ...]} for disambiguation.

    Loads ALL HCPs sharing the scoped OA IDs (needed for multi-HCP cluster disambiguation),
    but tracks which are scoped for write filtering.
    """
    print("Building linkage index...")

    # Get OA IDs for scoped HCPs
    scoped_links = fetch_oa_links_for_hcps(client, scoped_hcp_ids)
    scoped_oa_ids: Set[str] = set()
    for r in scoped_links:
        oa = r.get("openalex_author_id")
        if oa:
            scoped_oa_ids.add(str(oa))
    print(f"  Scoped HCPs have {len(scoped_oa_ids):,} distinct OA IDs.")

    # For disambiguation: find ALL HCPs that share those OA IDs
    all_links = fetch_all_oa_links_for_oa_ids(client, scoped_oa_ids)
    all_hcp_ids_in_links: Set[str] = set()
    for r in all_links:
        hid = r.get("hcp_id")
        if hid:
            all_hcp_ids_in_links.add(str(hid))
    print(f"  Total HCPs sharing those OA IDs (for disambiguation): {len(all_hcp_ids_in_links):,}")

    # Fetch metadata for all HCPs in the linkage
    hcp_meta = fetch_hcps_metadata(client, all_hcp_ids_in_links)

    # Build the oa_id → cluster map
    by_oa: Dict[str, Dict[str, HcpClusterMember]] = {}
    for r in all_links:
        oa = str(r.get("openalex_author_id") or "")
        hid = str(r.get("hcp_id") or "")
        if not oa or not hid:
            continue
        h = hcp_meta.get(hid)
        if not h:
            continue

        inst_raw = str(h.get("institution_raw") or h.get("institution_normalized") or "").strip()
        inst_norm = normalize_institution_for_match(inst_raw)
        country = normalize_country_code(h.get("country"))
        cc: Set[str] = set()
        if country:
            cc.add(country)

        rors: Set[str] = set()
        # Extract ROR from institution text if embedded
        for m in re.finditer(r"ror\.org/([a-z0-9]{9})", inst_raw.lower()):
            rid = normalize_ror(m.group(1))
            if rid:
                rors.add(rid)
        # Also check institution_canonical for ROR patterns
        inst_canonical = str(h.get("institution_canonical") or "")
        if inst_canonical:
            nr = normalize_ror(inst_canonical)
            if nr:
                rors.add(nr)

        member = HcpClusterMember(
            hcp_id=hid,
            institution=inst_raw,
            institution_norm=inst_norm,
            country_codes=cc,
            ror_ids=rors,
        )
        if oa not in by_oa:
            by_oa[oa] = {}
        by_oa[oa][hid] = member

    by_oa_list: Dict[str, List[HcpClusterMember]] = {k: list(v.values()) for k, v in by_oa.items()}
    n_multi = sum(1 for v in by_oa_list.values() if len(v) > 1)
    print(f"  Linkage index: {len(by_oa_list):,} OA IDs ({n_multi:,} multi-HCP clusters)")
    return by_oa_list, scoped_oa_ids


# ---------------------------------------------------------------------------
# Publication lookup via author_pub_flat
# ---------------------------------------------------------------------------

def fetch_pub_links_from_flat(
    client: Client, oa_ids: Set[str], limit: Optional[int] = None
) -> List[Dict[str, Any]]:
    """
    Query author_pub_flat for all (author_id, pub_id, institution, institution_ror) pairs
    matching the scoped OA IDs.
    """
    print(f"Querying author_pub_flat for {len(oa_ids):,} OA IDs...")
    results: List[Dict[str, Any]] = []
    oa_list = sorted(oa_ids)
    total_fetched = 0

    for i in range(0, len(oa_list), HCP_FETCH_CHUNK):
        chunk = oa_list[i:i + HCP_FETCH_CHUNK]
        offset = 0
        while True:
            rows = (
                client.table("author_pub_flat")
                .select("author_id,pub_id,institution,institution_ror")
                .in_("author_id", chunk)
                .order("pub_id")
                .range(offset, offset + PAGE_SIZE - 1)
                .execute()
                .data or []
            )
            if not rows:
                break
            results.extend(rows)
            total_fetched += len(rows)
            offset += len(rows)
            if limit and total_fetched >= limit:
                break
            if len(rows) < PAGE_SIZE:
                break
        if limit and total_fetched >= limit:
            break
        if (i // HCP_FETCH_CHUNK) % 10 == 0 and i > 0:
            print(f"  ... fetched {total_fetched:,} flat rows ({i + HCP_FETCH_CHUNK}/{len(oa_list)} OA ID chunks)")

    print(f"  Total flat rows fetched: {total_fetched:,}")
    return results


# ---------------------------------------------------------------------------
# Resolve pub_id (author_pub_flat.pub_id) → publications_v2.id
#
# author_pub_flat.pub_id IS publications_v2.id (UUID) from the build SQL:
#   SELECT ... p.id AS pub_id ... FROM publications_v2 p
# So no additional resolution is needed.
# ---------------------------------------------------------------------------


# ---------------------------------------------------------------------------
# Row building
# ---------------------------------------------------------------------------

def build_pub_author_row(
    pub_id: str,
    hcp_id: str,
    oa_id: str,
    method: str,
    confidence: str,
) -> Dict[str, Any]:
    """Build a publication_authors_v2 row dict."""
    return {
        "publication_id": pub_id,
        "hcp_id": hcp_id,
        "author_position": None,
        "is_first_author": None,
        "is_senior_author": None,
        "total_authors": None,
        "openalex_author_id": oa_id,
        "disambiguation_method": method,
        "disambiguation_confidence": confidence,
        "linked_at": datetime.now(timezone.utc).isoformat(),
    }


# ---------------------------------------------------------------------------
# Write
# ---------------------------------------------------------------------------

def insert_rows_on_conflict_nothing(
    client: Client, rows: List[Dict[str, Any]], *, dry_run: bool
) -> int:
    """Insert into publication_authors_v2 with ON CONFLICT DO NOTHING."""
    if dry_run or not rows:
        return 0
    inserted = 0
    for i in range(0, len(rows), WRITE_BATCH_SIZE):
        batch = rows[i:i + WRITE_BATCH_SIZE]
        try:
            resp = (
                client.table("publication_authors_v2")
                .upsert(batch, on_conflict="publication_id,hcp_id", ignore_duplicates=True)
                .execute()
            )
            inserted += len(resp.data) if resp.data else 0
        except Exception as exc:
            print(f"  [ERROR] Batch at offset {i}: {exc}", file=sys.stderr)
            for row in batch:
                try:
                    client.table("publication_authors_v2").upsert(
                        [row], on_conflict="publication_id,hcp_id", ignore_duplicates=True
                    ).execute()
                    inserted += 1
                except Exception as exc2:
                    print(f"    [SKIP] pub={row.get('publication_id')} hcp={row.get('hcp_id')}: {exc2}", file=sys.stderr)
    return inserted


# ---------------------------------------------------------------------------
# Main pipeline
# ---------------------------------------------------------------------------

def run(
    client: Client,
    scoped_hcp_ids: Set[str],
    *,
    dry_run: bool,
    limit: Optional[int],
) -> None:
    t0 = time.perf_counter()

    print(f"\n{'='*70}")
    print("  REBUILD PUBLICATION_AUTHORS_V2 — SCOPED ADDITIVE MODE")
    print(f"  Scoped HCPs: {len(scoped_hcp_ids):,}")
    print(f"  Mode: {'DRY-RUN' if dry_run else 'EXECUTE (writes enabled)'}")
    if limit:
        print(f"  Limit: {limit:,} output rows")
    print(f"  Safety: NO wipe, NO delete, ON CONFLICT DO NOTHING")
    print(f"{'='*70}\n")

    if not scoped_hcp_ids:
        print("No scoped HCPs — nothing to do.")
        return

    # Step 1: Build linkage index
    by_oa, scoped_oa_ids = build_linkage_index(client, scoped_hcp_ids)

    if not scoped_oa_ids:
        print("No OA IDs found for scoped HCPs — nothing to do.")
        return

    # Step 2: Fetch author-pub links from author_pub_flat
    flat_rows = fetch_pub_links_from_flat(client, scoped_oa_ids, limit=None)

    if not flat_rows:
        print("No publications found in author_pub_flat for scoped OA IDs.")
        return

    # Step 3: Process flat rows → build publication_authors_v2 rows
    print(f"\nProcessing {len(flat_rows):,} author-publication links...")
    method_counts: Counter = Counter()
    orphan_reasons: Counter = Counter()
    output_rows: List[Dict[str, Any]] = []
    # Dedup: (pub_id, hcp_id) → best row (prefer METHOD_UNIQUE > disambiguated)
    seen_pairs: Dict[Tuple[str, str], Dict[str, Any]] = {}
    skipped_non_scoped = 0

    for idx, flat in enumerate(flat_rows):
        oa_id = str(flat.get("author_id") or "")
        pub_id = str(flat.get("pub_id") or "")
        if not oa_id or not pub_id:
            continue

        cluster = by_oa.get(oa_id)
        if not cluster:
            continue

        winner: Optional[HcpClusterMember] = None
        method = METHOD_UNIQUE
        confidence = "high"

        if len(cluster) == 1:
            winner = cluster[0]
            method = METHOD_UNIQUE
            confidence = "high"
        else:
            auth_ror_raw = str(flat.get("institution_ror") or "")
            auth_ror = normalize_ror(auth_ror_raw)
            auth_inst_norm = normalize_institution_for_match(flat.get("institution"))
            # author_pub_flat doesn't have country_code; pass empty
            auth_country = ""
            winner, orphan_reason, method, confidence = disambiguate_cluster(
                cluster, auth_ror, auth_inst_norm, auth_country
            )
            if winner is None:
                if orphan_reason:
                    orphan_reasons[orphan_reason] += 1
                continue

        # SAFETY: Only emit if winner is in the scoped HCP set
        if winner.hcp_id not in scoped_hcp_ids:
            skipped_non_scoped += 1
            continue

        method_counts[method] += 1
        pair_key = (pub_id, winner.hcp_id)

        row = build_pub_author_row(pub_id, winner.hcp_id, oa_id, method, confidence)

        if pair_key not in seen_pairs:
            seen_pairs[pair_key] = row
        else:
            # Prefer higher-quality disambiguation
            existing = seen_pairs[pair_key]
            if method == METHOD_UNIQUE and existing.get("disambiguation_method") != METHOD_UNIQUE:
                seen_pairs[pair_key] = row

        if limit and len(seen_pairs) >= limit:
            break

        if (idx + 1) % PROGRESS_EVERY == 0:
            elapsed = time.perf_counter() - t0
            print(
                f"  Processed {idx + 1:,}/{len(flat_rows):,} flat rows | "
                f"{len(seen_pairs):,} unique (pub,hcp) pairs | {elapsed:.1f}s"
            )

    output_rows = list(seen_pairs.values())

    # Step 4: Summary + write
    elapsed = time.perf_counter() - t0
    orphan_total = sum(orphan_reasons.values())

    print(f"\n{'='*70}")
    print("  RESULTS")
    print(f"{'='*70}")
    print(f"  Flat rows processed: {len(flat_rows):,}")
    print(f"  Unique (pub, hcp) pairs to write: {len(output_rows):,}")
    print(f"  Skipped (winner not in scoped set): {skipped_non_scoped:,}")
    print(f"  Orphaned (disambiguation failed): {orphan_total:,}")
    for reason in (ORPHAN_NO_SIGNALS, ORPHAN_ROR_NO_MATCH, ORPHAN_INST_NO_MATCH,
                   ORPHAN_COUNTRY_NO_MATCH, ORPHAN_MULTI_COUNTRY):
        if orphan_reasons.get(reason, 0):
            print(f"    {reason}: {orphan_reasons[reason]:,}")
    print(f"  Match methods:")
    for m in (METHOD_UNIQUE, METHOD_ROR, METHOD_INST, METHOD_COUNTRY):
        if method_counts.get(m, 0):
            print(f"    {m}: {method_counts[m]:,}")
    print(f"  Elapsed: {elapsed:.1f}s")
    print()

    if dry_run:
        print("[DRY-RUN] No rows written. Re-run with --execute to write.")
    else:
        print(f"Writing {len(output_rows):,} rows to publication_authors_v2 (ON CONFLICT DO NOTHING)...")
        written = insert_rows_on_conflict_nothing(client, output_rows, dry_run=False)
        print(f"  Rows written/confirmed: {written:,}")
        print(f"  Duplicates skipped (already existed): {len(output_rows) - written:,}")

    total_elapsed = time.perf_counter() - t0
    print(f"\nTotal runtime: {total_elapsed:.1f}s ({total_elapsed / 60:.2f} min)")


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------

def parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser(
        description="Rebuild publication_authors_v2 links (scoped, additive-only).",
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    scope = p.add_mutually_exclusive_group(required=True)
    scope.add_argument(
        "--only-new-hcps",
        action="store_true",
        help="Scope to HCPs whose hcp_openalex_authors_v2.linked_at >= today (UTC).",
    )
    scope.add_argument(
        "--hcp-ids-file",
        type=str,
        metavar="PATH",
        help="Path to a file with one HCP UUID per line.",
    )
    scope.add_argument(
        "--since",
        type=str,
        metavar="YYYY-MM-DD",
        help="Scope to HCPs linked at or after this date (hcp_openalex_authors_v2.linked_at >= date).",
    )

    p.add_argument("--execute", action="store_true", default=False,
                   help="Enable writes (default is dry-run)")
    p.add_argument("--dry-run", action="store_true", default=False,
                   help="Explicit dry-run (no writes). This is the default.")
    p.add_argument("--limit", type=int, default=None, metavar="N",
                   help="Limit output to N (pub,hcp) pairs (for testing)")
    return p.parse_args()


def main() -> None:
    args = parse_args()
    dry_run = not args.execute or args.dry_run

    load_dotenv()
    client = init_client()

    # Resolve scoped HCP set
    if args.only_new_hcps:
        today_str = date.today().isoformat()
        scoped_hcp_ids = load_new_hcp_ids_by_linked_at(client, today_str)
    elif args.hcp_ids_file:
        scoped_hcp_ids = load_hcp_ids_from_file(args.hcp_ids_file)
    elif args.since:
        scoped_hcp_ids = load_new_hcp_ids_by_linked_at(client, args.since)
    else:
        print("ERROR: Must specify --only-new-hcps, --hcp-ids-file, or --since.", file=sys.stderr)
        raise SystemExit(1)

    if not scoped_hcp_ids:
        print("No HCPs found matching scope criteria. Exiting.")
        raise SystemExit(0)

    run(client, scoped_hcp_ids, dry_run=dry_run, limit=args.limit)


if __name__ == "__main__":
    main()
