from __future__ import annotations

import argparse
import csv
import json
import logging
import os
import statistics
import sys
import time
from collections import Counter, defaultdict
from datetime import datetime, timezone
from typing import Any, Callable, Dict, List, Optional, Set, Tuple

from dotenv import load_dotenv
from supabase import Client, create_client

READ_PAGE_SIZE = 500
WRITE_BATCH_SIZE = 500
IN_CHUNK_SIZE = 100
CONCEPT_SCORE_THRESHOLD = 0.4
WEIGHTED_RELEVANT_THRESHOLD = 5.0
FRACTION_THRESHOLD = 0.30
OUTPUT_LOG_PATH = "ta_tagging_rebuild_log.json"

CANONICALS_BY_TA: Dict[str, List[Dict[str, Any]]] = {
    "hepatology": [
        {"label": "Loomba", "hcp_id": "8a5ed89d-df8a-4b7c-a5f7-37f602b63577", "expected_ta": "Hepatology"},
        {"label": "Sanyal", "hcp_id": "be751618-9371-4ce1-8760-c579599fd30e", "expected_ta": "Hepatology"},
        {"label": "Chalasani", "hcp_id": "22388b63-dc82-44d7-abaa-24ab8f4ab8eb", "expected_ta": "Hepatology"},
        {"label": "Kowdley", "hcp_id": "272ff3bc-0464-499b-9ab2-1ceae503e415", "expected_ta": "Hepatology"},
    ],
    "atopic-dermatitis": [
        {"label": "Silverberg", "hcp_id": None, "expected_ta": "Atopic Dermatitis", "lookup_name": "Jonathan Silverberg"},
        {"label": "Simpson", "hcp_id": None, "expected_ta": "Atopic Dermatitis", "lookup_name": "Eric Simpson"},
        {"label": "Eichenfield", "hcp_id": None, "expected_ta": "Atopic Dermatitis", "lookup_name": "Lawrence Eichenfield"},
        {"label": "Guttman-Yassky", "hcp_id": None, "expected_ta": "Atopic Dermatitis", "lookup_name": "Emma Guttman-Yassky"},
        {"label": "Flohr", "hcp_id": None, "expected_ta": "Atopic Dermatitis", "lookup_name": "Carsten Flohr"},
        {"label": "Bieber", "hcp_id": None, "expected_ta": "Atopic Dermatitis", "lookup_name": "Thomas Bieber"},
        {"label": "Irvine", "hcp_id": None, "expected_ta": "Atopic Dermatitis", "lookup_name": "Alan Irvine"},
        {"label": "Wollenberg", "hcp_id": None, "expected_ta": "Atopic Dermatitis", "lookup_name": "Andreas Wollenberg"},
        {"label": "Lio", "hcp_id": None, "expected_ta": "Atopic Dermatitis", "lookup_name": "Peter Lio"},
    ],
}

# Backward compat: default CANONICALS is the full merged list (used when no --ta)
CANONICALS: List[Dict[str, Any]] = []
for _clist in CANONICALS_BY_TA.values():
    CANONICALS.extend(_clist)

logger = logging.getLogger("ta_tagging_rebuild")
logging.basicConfig(level=logging.INFO, format="%(message)s")

# Quiet the httpx/httpcore per-request INFO logs. Without this, a whole-corpus scan emits one
# HTTP-request log line per 500-row page (~800+ lines across publications_v2), which drowns
# the actual summary. Our own progress/summary stays on stdout via print(); HTTP noise is
# raised to WARNING so only genuine problems surface.
for _noisy in ("httpx", "httpcore", "httpcore.http11", "httpcore.http2", "hpack", "h2"):
    logging.getLogger(_noisy).setLevel(logging.WARNING)

# Retry policy for the long paginated scans (transient HTTP/2 ConnectionTerminated / stream-
# limit drops on a single long-lived connection killed the whole run before).
MAX_PAGE_RETRIES = 6


def eprint(*args: Any, **kwargs: Any) -> None:
    print(*args, file=sys.stderr, **kwargs)


def env(name: str) -> str:
    v = os.getenv(name)
    if not v:
        raise EnvironmentError(f"Missing env var: {name}")
    return v


def sb() -> Client:
    return create_client(env("SUPABASE_URL"), env("SUPABASE_KEY"))


# ============================================================
# Robust paginated reads (retry + reconnect; survive dropped connections)
# ============================================================


def execute_with_retry(
    client_box: List[Client],
    build: Callable[[Client], Any],
    *,
    what: str,
    max_retries: int = MAX_PAGE_RETRIES,
) -> List[Dict[str, Any]]:
    """Execute build(client).execute(), retrying transient failures with exponential backoff
    and RECONNECTING the client (a terminated HTTP/2 connection is replaced by a fresh one).
    client_box is a 1-element list so the reconnect is visible to callers. Raises only after
    max_retries consecutive failures (so a persistent error still surfaces, not masked)."""
    for attempt in range(1, max_retries + 1):
        try:
            return build(client_box[0]).execute().data or []
        except Exception as exc:  # noqa: BLE001 -- transient network/proto errors are broad
            if attempt >= max_retries:
                raise RuntimeError(
                    f"{what}: gave up after {attempt} attempts: {type(exc).__name__}: {exc}"
                ) from exc
            wait = min(2.0 ** attempt, 30.0)
            eprint(
                f"[retry] {what}: attempt {attempt}/{max_retries} failed "
                f"({type(exc).__name__}: {exc}); reconnecting + retrying in {wait:.0f}s"
            )
            time.sleep(wait)
            try:
                client_box[0] = sb()  # fresh connection
            except Exception as reconnect_exc:  # noqa: BLE001
                eprint(f"[retry] reconnect failed: {reconnect_exc}")
    return []  # unreachable


def robust_keyset_scan(
    client_box: List[Client],
    base_query: Callable[[Client], Any],
    *,
    what: str,
    id_col: str = "id",
    page: int = READ_PAGE_SIZE,
) -> Any:
    """Yield rows page-by-page via KEYSET pagination on a unique id column. Robust to dropped
    connections (each page retries + reconnects, then resumes from the last id -- so a mid-scan
    drop no longer kills the run). Keyset also avoids deep-offset re-scans. base_query(client)
    returns the SELECT+filters; this adds .order(id).gt(id, last).limit(page)."""
    last_id: Optional[str] = None
    while True:
        current = last_id  # bind for the closure

        def build(client: Client) -> Any:
            q = base_query(client).order(id_col).limit(page)
            return q.gt(id_col, current) if current is not None else q

        data = execute_with_retry(client_box, build, what=f"{what} (after {id_col}={last_id})")
        if not data:
            return
        for row in data:
            yield row
        last_id = str(data[-1][id_col])
        if len(data) < page:
            return


def robust_offset_scan(
    client_box: List[Client],
    base_query: Callable[[Client], Any],
    *,
    what: str,
    order_col: str,
    page: int = READ_PAGE_SIZE,
) -> Any:
    """Yield rows page-by-page via OFFSET pagination (for tables with no single unique id to
    keyset on -- e.g. publication_authors_v2's composite PK; keyseting one column there would
    drop rows that straddle a page boundary). Offset is positionally correct; each page retries
    + reconnects on a dropped connection and resumes from the same offset."""
    offset = 0
    while True:
        current = offset

        def build(client: Client) -> Any:
            return base_query(client).order(order_col).range(current, current + page - 1)

        data = execute_with_retry(client_box, build, what=f"{what} (offset {offset})")
        if not data:
            return
        for row in data:
            yield row
        n = len(data)
        offset += n
        if n < page:
            return


# ============================================================
# Incremental scoping: affected-HCP set + scoped reads
# ============================================================


def read_ids_file(path: str) -> Set[str]:
    """One hcp_id (uuid) per line; blank lines and '#' comments ignored."""
    out: Set[str] = set()
    with open(path, "r", encoding="utf-8") as f:
        for line in f:
            s = line.strip()
            if s and not s.startswith("#"):
                out.add(s)
    return out


def fetch_hcp_ids_by_ingestion_run(client: Client, ingestion_run_id: str) -> Set[str]:
    """hcps_v2 ids created by an ingestion run (NEWLY-created HCPs only)."""
    out: Set[str] = set()
    last_id: Optional[str] = None
    while True:
        q = (
            client.table("hcps_v2")
            .select("id")
            .eq("ingestion_run_id", ingestion_run_id)
            .order("id")
            .limit(READ_PAGE_SIZE)
        )
        if last_id is not None:
            q = q.gt("id", last_id)
        batch = q.execute().data or []
        if not batch:
            break
        for r in batch:
            rid = r.get("id")
            if rid:
                out.add(str(rid))
        last_id = str(batch[-1]["id"])
        if len(batch) < READ_PAGE_SIZE:
            break
    return out


def load_affected_hcp_ids(
    client: Client,
    candidate_hcp_ids_file: Optional[str],
    ingestion_run_id: Optional[str],
) -> Set[str]:
    """Resolve the AFFECTED HCP set for a scoped run. Empty => whole-corpus mode.

    The affected set is 'all HCPs who authored any pub in the incremental batch' -- both
    newly-created HCPs AND pre-existing HCPs who authored a new pub (a new pub can push a
    previously-below-threshold HCP OVER a TA threshold). The orchestrator, which knows the
    batch's new pub ids, computes that set and passes it via --candidate-hcp-ids-file.
    """
    affected: Set[str] = set()
    if candidate_hcp_ids_file:
        file_ids = read_ids_file(candidate_hcp_ids_file)
        affected |= file_ids
        print(f"  Affected HCPs from file: {len(file_ids):,}")
    if ingestion_run_id:
        new_hcps = fetch_hcp_ids_by_ingestion_run(client, ingestion_run_id)
        affected |= new_hcps
        print(f"  New HCPs from ingestion_run {ingestion_run_id}: {len(new_hcps):,}")
        print(
            "  [WARN] --ingestion-run-id yields only NEWLY-CREATED HCPs. Pre-existing HCPs\n"
            "         who authored a NEW pub this cycle are ALSO affected (a new pub can\n"
            "         cross a TA threshold) but cannot be derived from a run id "
            "(publications_v2\n"
            "         has no ingestion_run_id). For complete correctness pass the full affected\n"
            "         set (new HCPs + authors of new pubs) via --candidate-hcp-ids-file."
        )
    return affected


def fetch_rows_in(
    client_box: List[Client],
    table: str,
    columns: str,
    filter_col: str,
    values: List[str],
    order_col: str,
) -> List[Dict[str, Any]]:
    """Chunked .in_() fetch with intra-chunk range pagination; retries + reconnects per page."""
    out: List[Dict[str, Any]] = []
    vals = sorted(set(values))
    for i in range(0, len(vals), IN_CHUNK_SIZE):
        chunk = vals[i : i + IN_CHUNK_SIZE]
        offset = 0
        while True:
            current = offset

            def build(client: Client, _chunk: List[str] = chunk) -> Any:
                return (
                    client.table(table)
                    .select(columns)
                    .in_(filter_col, _chunk)
                    .order(order_col)
                    .range(current, current + READ_PAGE_SIZE - 1)
                )

            batch = execute_with_retry(client_box, build, what=f"{table}.in_({filter_col})")
            if not batch:
                break
            out.extend(batch)
            if len(batch) < READ_PAGE_SIZE:
                break
            offset += READ_PAGE_SIZE
    return out


def normalize_oa_id(value: Any) -> str:
    """Full-URL OpenAlex author id (matches hcp_openalex_authors_v2 + author_pub_flat storage)."""
    s = str(value or "").strip()
    if not s:
        return ""
    if s.startswith("https://openalex.org/"):
        return s
    tail = s.split("/")[-1]
    return f"https://openalex.org/{tail}" if tail else ""


def fetch_oa_to_hcp(
    client_box: List[Client], hcp_oa_table: str, hcp_ids: Optional[Set[str]] = None
) -> Dict[str, Set[str]]:
    """{normalized openalex_author_id: {hcp_id, ...}} from hcp_openalex_authors_v2.

    hcp_ids=None => whole corpus (scan all links). Otherwise scoped to those HCPs. One OA id
    can map to more than one HCP (~4.6% misattribution), hence a set."""
    out: Dict[str, Set[str]] = defaultdict(set)
    if hcp_ids is not None:
        rows = fetch_rows_in(
            client_box, hcp_oa_table, "hcp_id,openalex_author_id",
            "hcp_id", sorted(hcp_ids), order_col="hcp_id",
        )
        for r in rows:
            oid = normalize_oa_id(r.get("openalex_author_id"))
            hid = str(r.get("hcp_id") or "")
            if oid and hid:
                out[oid].add(hid)
        return dict(out)

    def base(client: Client) -> Any:
        return client.table(hcp_oa_table).select("hcp_id,openalex_author_id")

    for row in robust_keyset_scan(client_box, base, what=f"{hcp_oa_table} scan", id_col="hcp_id"):
        oid = normalize_oa_id(row.get("openalex_author_id"))
        hid = str(row.get("hcp_id") or "")
        if oid and hid:
            out[oid].add(hid)
    return dict(out)


def resolve_hcp_pub_pairs_scoped(
    client_box: List[Client], hcp_oa_table: str, affected_hcp_ids: Set[str]
) -> List[Tuple[str, str]]:
    """Each affected HCP's COMPLETE pub set as (hcp_id, publication_id) pairs, resolved
    STEP-F-INDEPENDENTLY: hcp -> OpenAlex ids (hcp_openalex_authors_v2) -> pubs (author_pub_flat,
    the flattened authorships index). This does NOT touch publication_authors_v2, which is empty
    for HCPs created this cycle (Step F has not run yet) - the bug this replaces. Pairs are
    de-duplicated so an HCP with multiple OpenAlex shards on one pub counts that pub once."""
    oa_to_hcp = fetch_oa_to_hcp(client_box, hcp_oa_table, affected_hcp_ids)
    affected_oa = sorted(oa_to_hcp.keys())
    if not affected_oa:
        return []
    flat = fetch_rows_in(
        client_box, "author_pub_flat", "author_id,pub_id",
        "author_id", affected_oa, order_col="pub_id",
    )
    pairs: Set[Tuple[str, str]] = set()
    for r in flat:
        oid = normalize_oa_id(r.get("author_id"))
        pid = str(r.get("pub_id") or "")
        if not oid or not pid:
            continue
        for hid in oa_to_hcp.get(oid, ()):  # restricted to affected HCPs
            pairs.add((hid, pid))
    return sorted(pairs)


def recency_multiplier(pub_year: Optional[int]) -> float:
    if pub_year is None:
        return 0.5
    if pub_year >= 2020:
        return 1.5
    if pub_year >= 2015:
        return 1.0
    return 0.5


def resolve_ta_slug(client: Client, slug: str) -> Tuple[str, str]:
    """Resolve a TA slug to (therapeutic_area_id, ta_name). Raises if not found."""
    rows = (
        client.table("therapeutic_areas")
        .select("id,name,slug")
        .eq("slug", slug)
        .execute()
        .data or []
    )
    if not rows:
        raise RuntimeError(f"No therapeutic_area found with slug='{slug}'")
    ta_id = str(rows[0]["id"])
    ta_name = str(rows[0]["name"])
    return ta_id, ta_name


def resolve_canonical_hcp_ids(client: Client, canonicals: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """For canonicals with hcp_id=None, attempt to resolve via last_name lookup in hcps_v2."""
    resolved = []
    for c in canonicals:
        entry = dict(c)
        if entry.get("hcp_id") is None and entry.get("lookup_name"):
            parts = entry["lookup_name"].rsplit(" ", 1)
            last_name = parts[-1] if parts else entry["lookup_name"]
            rows = (
                client.table("hcps_v2")
                .select("id,first_name,last_name")
                .eq("last_name", last_name)
                .execute()
                .data or []
            )
            if len(rows) == 1:
                entry["hcp_id"] = str(rows[0]["id"])
            elif len(rows) > 1:
                first_name = parts[0].lower() if len(parts) > 1 else ""
                matches = [r for r in rows if (r.get("first_name") or "").lower().startswith(first_name[:3])]
                if len(matches) == 1:
                    entry["hcp_id"] = str(matches[0]["id"])
                else:
                    logger.warning(f"  Could not uniquely resolve canonical '{entry['lookup_name']}' ({len(rows)} matches)")
            else:
                logger.warning(f"  Canonical '{entry['lookup_name']}' not found in hcps_v2")
        resolved.append(entry)
    return resolved


def fetch_curated_concepts(client: Client, scoped_ta_id: Optional[str] = None) -> Dict[str, Set[str]]:
    """Return {ta_id: set(openalex_concept_ids)}.

    When scoped_ta_id is provided, only that TA's concepts are loaded.
    """
    if scoped_ta_id:
        print(f"Loading curated_ta_concepts for TA {scoped_ta_id} only...")
        rows = (
            client.table("curated_ta_concepts")
            .select("therapeutic_area_id,openalex_concept_id")
            .eq("therapeutic_area_id", scoped_ta_id)
            .execute()
            .data or []
        )
    else:
        print("Loading curated_ta_concepts (all TAs)...")
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


def score_pub_row(
    row: Dict[str, Any], curated: Dict[str, Set[str]]
) -> Tuple[str, Optional[Dict[str, Tuple[float, Optional[int]]]]]:
    """Pure per-pub TA scoring (logic UNCHANGED; extracted so full and scoped Phase 2 share
    ONE implementation). Returns (pub_id, {ta_id: (matched_sum, pub_year)} or None)."""
    pub_id = str(row.get("id") or "")
    if not pub_id:
        return "", None
    concepts = row.get("openalex_concepts") or []
    if not isinstance(concepts, list) or not concepts:
        return pub_id, None
    pub_year = row.get("pub_year")
    try:
        pub_year_int = int(pub_year) if pub_year is not None else None
    except (TypeError, ValueError):
        pub_year_int = None

    # This pub's concepts that meet the score threshold.
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
        return pub_id, None

    # For each TA, sum concept scores that match the curated list.
    ta_scores: Dict[str, Tuple[float, Optional[int]]] = {}
    for ta_id, curated_set in curated.items():
        matched_sum = sum(
            score for c_id, score in pub_concept_scores.items() if c_id in curated_set
        )
        if matched_sum > 0:
            ta_scores[ta_id] = (matched_sum, pub_year_int)

    return pub_id, (ta_scores or None)


def _report_bad_pubs(bad_pubs: List[Tuple[str, str]], phase: str) -> None:
    """Surface pubs whose scoring raised (a real data bug, NOT masked as a silent 'continue')."""
    if not bad_pubs:
        return
    print(f"\n[{phase}] WARNING: {len(bad_pubs)} pub(s) failed scoring and were SKIPPED "
          f"(logged, not fatal). First {min(20, len(bad_pubs))}:")
    for pub_id, err in bad_pubs[:20]:
        print(f"    pub_id={pub_id}: {err}")
    eprint(f"[{phase}] {len(bad_pubs)} pubs failed scoring; ids: "
           f"{', '.join(p for p, _ in bad_pubs[:50])}")


def compute_pub_ta_scores(
    client_box: List[Client], curated: Dict[str, Set[str]]
) -> Dict[str, Dict[str, Tuple[float, Optional[int]]]]:
    """For each publication, compute its TA relevance scores (whole-corpus scan).
    Returns: {pub_id: {ta_id: (ta_score, pub_year)}}. Only pubs with a non-zero TA score.

    Robust: keyset pagination by id with per-page retry+reconnect (survives dropped
    connections mid-scan), and per-pub error capture so one malformed openalex_concepts
    payload logs-and-continues instead of killing the run.
    """
    print("\n=== Phase 2: Computing per-publication TA scores (whole corpus) ===")
    pub_ta_scores: Dict[str, Dict[str, Tuple[float, Optional[int]]]] = {}
    total_pubs_scanned = 0
    total_pubs_with_score = 0
    bad_pubs: List[Tuple[str, str]] = []
    start = time.time()

    def base(client: Client) -> Any:
        return (
            client.table("publications_v2")
            .select("id,openalex_concepts,pub_year")
            .not_.is_("openalex_concepts", "null")
        )

    for row in robust_keyset_scan(client_box, base, what="Phase 2 publications_v2 scan", id_col="id"):
        total_pubs_scanned += 1
        try:
            pub_id, ta_scores = score_pub_row(row, curated)
        except Exception as exc:  # noqa: BLE001 -- capture a single bad row, don't crash the scan
            bad_pubs.append((str(row.get("id")), f"{type(exc).__name__}: {exc}"))
            continue
        if pub_id and ta_scores:
            pub_ta_scores[pub_id] = ta_scores
            total_pubs_with_score += 1

        if total_pubs_scanned % 25000 == 0:
            elapsed = time.time() - start
            rate = total_pubs_scanned / elapsed if elapsed > 0 else 0
            print(
                f"  Scanned {total_pubs_scanned:,} pubs | {total_pubs_with_score:,} with TA "
                f"score | {len(bad_pubs)} bad | {rate:.0f} pubs/sec"
            )

    elapsed = time.time() - start
    print(
        f"Phase 2 complete: {total_pubs_scanned:,} pubs scanned, {total_pubs_with_score:,} "
        f"have at least one TA score, {len(bad_pubs)} failed. Elapsed: {elapsed:.1f}s"
    )
    _report_bad_pubs(bad_pubs, "Phase 2")
    return pub_ta_scores


def compute_pub_ta_scores_for_pubs(
    client_box: List[Client], curated: Dict[str, Set[str]], pub_ids: Set[str]
) -> Dict[str, Dict[str, Tuple[float, Optional[int]]]]:
    """Scoped Phase 2: score ONLY the given pubs (the affected HCPs' complete pub union),
    via chunked .in_(id) with retry+reconnect. Uses the SAME score_pub_row as the full scan,
    so any pub's score is identical to the whole-corpus run. The affected HCPs' NEW pubs are
    included in this union, so they are scored before Phase 3."""
    print(f"\n=== Phase 2 (scoped): scoring {len(pub_ids):,} affected pubs ===")
    start = time.time()
    pub_ta_scores: Dict[str, Dict[str, Tuple[float, Optional[int]]]] = {}
    rows = fetch_rows_in(
        client_box, "publications_v2", "id,openalex_concepts,pub_year",
        "id", sorted(pub_ids), order_col="id",
    )
    scored = 0
    bad_pubs: List[Tuple[str, str]] = []
    for row in rows:
        try:
            pub_id, ta_scores = score_pub_row(row, curated)
        except Exception as exc:  # noqa: BLE001
            bad_pubs.append((str(row.get("id")), f"{type(exc).__name__}: {exc}"))
            continue
        if pub_id and ta_scores:
            pub_ta_scores[pub_id] = ta_scores
            scored += 1
    print(
        f"Phase 2 (scoped) complete: {len(rows)} affected pubs fetched, {scored} with a TA "
        f"score, {len(bad_pubs)} failed. Elapsed: {time.time() - start:.1f}s"
    )
    _report_bad_pubs(bad_pubs, "Phase 2 (scoped)")
    return pub_ta_scores


def _fold_authorship(
    hcp_id: str,
    pub_id: str,
    pub_ta_scores: Dict[str, Dict[str, Tuple[float, Optional[int]]]],
    hcp_ta_aggregates: Dict[Tuple[str, str], Dict[str, float]],
    hcp_total_pubs: Dict[str, int],
) -> None:
    """Fold one (hcp_id, pub_id) authorship into the per-HCP aggregates (logic UNCHANGED;
    extracted so full and scoped Phase 3 share ONE implementation). Every authorship counts
    toward hcp_total_pubs; only TA-scoring pubs add weighted_relevant / relevant_count."""
    if not hcp_id or not pub_id:
        return
    hcp_total_pubs[hcp_id] += 1
    ta_scores = pub_ta_scores.get(pub_id)
    if not ta_scores:
        return
    for ta_id, (ta_score, pub_year) in ta_scores.items():
        mult = recency_multiplier(pub_year)
        agg = hcp_ta_aggregates[(hcp_id, ta_id)]
        agg["weighted_relevant"] += ta_score * mult
        agg["relevant_count"] += 1


def aggregate_hcp_ta_signals(
    client_box: List[Client],
    hcp_oa_table: str,
    pub_ta_scores: Dict[str, Dict[str, Tuple[float, Optional[int]]]],
) -> Tuple[Dict[Tuple[str, str], Dict[str, float]], Dict[str, int]]:
    """Whole-corpus Phase 3, resolved STEP-F-INDEPENDENTLY via author_pub_flat.

    hcp -> OpenAlex ids (hcp_openalex_authors_v2) -> pubs (author_pub_flat = flattened
    authorships). This does NOT read publication_authors_v2 (Step F's materialization), so it
    tags HCPs whose links Step F has not built yet - the same reason a from-scratch build
    cannot depend on Step F. It is equivalent to the old publication_authors_v2 path once Step F
    has run (both are authorships-derived), and correct before it.

    author_pub_flat is scanned ORDERED BY pub_id; each pub's rows are grouped so an HCP with
    multiple OpenAlex shards on one pub counts that pub ONCE (per-pub dedup).

    Returns hcp_ta_aggregates {(hcp,ta): {weighted_relevant, relevant_count}} and
    hcp_total_pubs {hcp: distinct_pub_count}.
    """
    print("\n=== Phase 3: Aggregating per-HCP per-TA signals (whole corpus, via author_pub_flat) ===")
    print(f"  Loading OpenAlex id -> hcp_id map from {hcp_oa_table}...")
    oa_to_hcp = fetch_oa_to_hcp(client_box, hcp_oa_table, None)
    print(f"  Mapped {len(oa_to_hcp):,} OpenAlex ids.")

    hcp_ta_aggregates: Dict[Tuple[str, str], Dict[str, float]] = defaultdict(
        lambda: {"weighted_relevant": 0.0, "relevant_count": 0}
    )
    hcp_total_pubs: Dict[str, int] = defaultdict(int)
    total_rows = 0
    start = time.time()

    def base(client: Client) -> Any:
        return client.table("author_pub_flat").select("author_id,pub_id")

    cur_pub: Optional[str] = None
    cur_hcps: Set[str] = set()

    def flush(pub_id: Optional[str], hcps: Set[str]) -> None:
        if not pub_id:
            return
        for hid in hcps:  # each HCP folded once per pub (dedup across shards)
            _fold_authorship(hid, pub_id, pub_ta_scores, hcp_ta_aggregates, hcp_total_pubs)

    for row in robust_offset_scan(
        client_box, base, what="Phase 3 author_pub_flat scan", order_col="pub_id"
    ):
        total_rows += 1
        pub_id = str(row.get("pub_id") or "")
        oid = normalize_oa_id(row.get("author_id"))
        if pub_id != cur_pub:
            flush(cur_pub, cur_hcps)
            cur_pub, cur_hcps = pub_id, set()
        if oid:
            cur_hcps.update(oa_to_hcp.get(oid, ()))
        if total_rows % 200000 == 0:
            elapsed = time.time() - start
            rate = total_rows / elapsed if elapsed > 0 else 0
            print(f"  Scanned {total_rows:,} author_pub_flat rows | {len(hcp_total_pubs):,} HCPs "
                  f"| {len(hcp_ta_aggregates):,} (hcp,ta) buckets | {rate:.0f} rows/sec")
    flush(cur_pub, cur_hcps)

    print(
        f"Phase 3 complete: {total_rows:,} author_pub_flat rows scanned, "
        f"{len(hcp_total_pubs):,} distinct HCPs, "
        f"{len(hcp_ta_aggregates):,} (hcp,ta) buckets. Elapsed: {time.time() - start:.1f}s"
    )
    return dict(hcp_ta_aggregates), dict(hcp_total_pubs)


def aggregate_authorships(
    authorships: List[Tuple[str, str]],
    pub_ta_scores: Dict[str, Dict[str, Tuple[float, Optional[int]]]],
) -> Tuple[Dict[Tuple[str, str], Dict[str, float]], Dict[str, int]]:
    """Scoped Phase 3: aggregate ONLY the affected HCPs, over their COMPLETE pub sets
    (the pre-fetched authorship list). Same fold as the whole-corpus path, so an affected
    HCP's gate inputs (weighted_relevant, relevant_count, total_pubs) are identical to a
    full run -- which is what makes the tag decision identical."""
    print(f"\n=== Phase 3 (scoped): aggregating {len(authorships):,} affected authorships ===")
    hcp_ta_aggregates: Dict[Tuple[str, str], Dict[str, float]] = defaultdict(
        lambda: {"weighted_relevant": 0.0, "relevant_count": 0}
    )
    hcp_total_pubs: Dict[str, int] = defaultdict(int)
    for hcp_id, pub_id in authorships:
        _fold_authorship(hcp_id, pub_id, pub_ta_scores, hcp_ta_aggregates, hcp_total_pubs)
    print(
        f"Phase 3 (scoped) complete: {len(hcp_total_pubs)} affected HCPs, "
        f"{len(hcp_ta_aggregates)} (hcp,ta) buckets."
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


def write_decisions_csv(
    path: str,
    rows: List[Dict[str, Any]],
    hcp_ta_aggregates: Dict[Tuple[str, str], Dict[str, float]],
    hcp_total_pubs: Dict[str, int],
) -> None:
    """Machine-diffable tag decisions: one row per EMITTED (tagged) (hcp_id, ta_id), sorted
    for stable diffing. The both-modes invariant compares (hcp_id, therapeutic_area_id,
    publication_count); the gate inputs are included for debugging."""
    fieldnames = [
        "hcp_id", "therapeutic_area_id", "publication_count",
        "weighted_relevant", "relevant_count", "total_pubs", "fraction",
    ]
    ordered = sorted(rows, key=lambda r: (str(r["hcp_id"]), str(r["therapeutic_area_id"])))
    with open(path, "w", encoding="utf-8", newline="") as f:
        w = csv.DictWriter(f, fieldnames=fieldnames)
        w.writeheader()
        for r in ordered:
            agg = hcp_ta_aggregates.get((r["hcp_id"], r["therapeutic_area_id"]), {})
            total = int(hcp_total_pubs.get(r["hcp_id"], 0))
            rc = int(agg.get("relevant_count", 0))
            w.writerow({
                "hcp_id": r["hcp_id"],
                "therapeutic_area_id": r["therapeutic_area_id"],
                "publication_count": r["publication_count"],
                "weighted_relevant": round(float(agg.get("weighted_relevant", 0.0)), 6),
                "relevant_count": rc,
                "total_pubs": total,
                "fraction": round(rc / total, 6) if total else "",
            })
    print(f"Wrote {len(ordered):,} tag decisions to {path}")


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
    canonicals: Optional[List[Dict[str, Any]]] = None,
) -> List[Dict[str, Any]]:
    check_list = canonicals if canonicals is not None else CANONICALS
    if not check_list:
        return []
    ta_id_by_name = {v: k for k, v in ta_names.items()}
    row_lookup = {(r["hcp_id"], r["therapeutic_area_id"]): r for r in rows}
    out = []
    for c in check_list:
        hcp_id = c.get("hcp_id")
        if not hcp_id:
            print(f"Canonical {c['label']}: [SKIPPED - hcp_id not resolved]")
            out.append({"label": c["label"], "hcp_id": None, "expected_ta": c["expected_ta"], "tagged": False, "note": "hcp_id not resolved"})
            continue
        ta_id = ta_id_by_name.get(c["expected_ta"])
        entry = {
            "label": c["label"],
            "hcp_id": hcp_id,
            "expected_ta": c["expected_ta"],
            "tagged": False,
            "weighted_relevant": None,
            "relevant_count": None,
            "total_pubs": hcp_total_pubs.get(hcp_id),
            "fraction": None,
        }
        if ta_id:
            agg = hcp_ta_aggregates.get((hcp_id, ta_id))
            if agg:
                entry["weighted_relevant"] = agg["weighted_relevant"]
                entry["relevant_count"] = int(agg["relevant_count"])
                total = hcp_total_pubs.get(hcp_id, 0)
                entry["fraction"] = (entry["relevant_count"] / total) if total > 0 else None
            entry["tagged"] = (hcp_id, ta_id) in row_lookup
        out.append(entry)
        print(f"Canonical {c['label']}: {json.dumps(entry, default=str)}")
    return out


def run(
    execute: bool,
    ta_slug: Optional[str] = None,
    candidate_hcp_ids_file: Optional[str] = None,
    ingestion_run_id: Optional[str] = None,
    decisions_csv: Optional[str] = None,
) -> None:
    load_dotenv()
    # 1-element box so retry/reconnect helpers can swap in a fresh client on a dropped conn.
    client_box: List[Client] = [sb()]
    started = time.time()
    mode = "execute" if execute else "dry_run"
    errors: List[str] = []

    # Resolve TA scope
    scoped_ta_id: Optional[str] = None
    scoped_ta_name: Optional[str] = None
    if ta_slug:
        scoped_ta_id, scoped_ta_name = resolve_ta_slug(client_box[0], ta_slug)
        print(f"\n{'='*60}")
        print(f"  TA-SCOPED RUN: {scoped_ta_name} (slug={ta_slug})")
        print(f"  therapeutic_area_id: {scoped_ta_id}")
        print(f"  Only this TA's concepts will be loaded.")
        print(f"  Only this TA's hcp_therapeutic_areas_v2 rows will be written.")
        print(f"{'='*60}\n")
    else:
        print("\n[INFO] Running for ALL therapeutic areas (no --ta flag).\n")

    # Phase 1: reference data
    curated = fetch_curated_concepts(client_box[0], scoped_ta_id=scoped_ta_id)
    ta_names = fetch_ta_names(client_box[0])
    if not curated:
        raise RuntimeError("curated_ta_concepts is empty - cannot proceed")

    # Safety assertion: when scoped, curated must contain ONLY the target TA
    if scoped_ta_id:
        unexpected_tas = set(curated.keys()) - {scoped_ta_id}
        if unexpected_tas:
            raise RuntimeError(
                f"SAFETY VIOLATION: curated concepts contain non-scoped TAs: {unexpected_tas}. Aborting."
            )

    # Both modes resolve hcp -> pubs the SAME (Step-F-independent) way via author_pub_flat;
    # the ONLY difference is WHICH HCPs are considered.
    hcp_oa_table = "hcp_openalex_authors_v2"

    # HCP scope resolution (incremental). Empty => whole-corpus mode (backward compatible).
    affected_hcp_ids = load_affected_hcp_ids(client_box[0], candidate_hcp_ids_file, ingestion_run_id)
    hcp_scoped = bool(affected_hcp_ids)

    if hcp_scoped:
        print(f"\n{'='*60}")
        print(f"  HCP-SCOPED RUN: {len(affected_hcp_ids):,} affected HCP(s)")
        print(f"  Resolving each affected HCP's COMPLETE pub set via author_pub_flat (NOT")
        print(f"  publication_authors_v2, which is empty for this cycle's new HCPs pre-Step-F).")
        print(f"  Only affected HCPs' hcp_therapeutic_areas_v2 rows are written.")
        print(f"{'='*60}")
        # Each affected HCP's COMPLETE pub set, resolved hcp -> OpenAlex ids -> author_pub_flat.
        authorships = resolve_hcp_pub_pairs_scoped(client_box, hcp_oa_table, affected_hcp_ids)
        affected_pub_ids = {pid for _, pid in authorships}
        resolved_hcps = {h for h, _ in authorships}
        print(f"  Resolved {len(authorships):,} (hcp,pub) pairs over {len(affected_pub_ids):,} "
              f"pubs for {len(resolved_hcps):,}/{len(affected_hcp_ids):,} affected HCPs "
              f"({len(affected_hcp_ids) - len(resolved_hcps):,} have no pubs in author_pub_flat).")

        # Phase 2 (scoped): score only the affected pubs' union (includes their new pubs).
        pub_ta_scores = compute_pub_ta_scores_for_pubs(client_box, curated, affected_pub_ids)
        # Phase 3 (scoped): aggregate affected HCPs over their complete pub sets.
        hcp_ta_aggregates, hcp_total_pubs = aggregate_authorships(authorships, pub_ta_scores)
    else:
        # Phase 2: per-pub TA scores (whole corpus)
        pub_ta_scores = compute_pub_ta_scores(client_box, curated)
        # Phase 3: per-HCP aggregation (whole corpus, via author_pub_flat)
        hcp_ta_aggregates, hcp_total_pubs = aggregate_hcp_ta_signals(
            client_box, hcp_oa_table, pub_ta_scores
        )

    # Phase 4: apply gate (unchanged; operates only on the buckets it is given)
    rows = apply_gate_and_emit(hcp_ta_aggregates, hcp_total_pubs)

    # Machine-diffable tag decisions (the both-modes validation artifact). Written in BOTH
    # dry-run and execute; it reflects the gate decision, not the DB write.
    if decisions_csv is None:
        decisions_csv = f"ta_tagging_decisions_{'scoped' if hcp_scoped else 'full'}.csv"
    write_decisions_csv(decisions_csv, rows, hcp_ta_aggregates, hcp_total_pubs)

    # Safety assertion: a scoped run must only ever emit rows for affected HCPs.
    if hcp_scoped:
        stray = [r for r in rows if r["hcp_id"] not in affected_hcp_ids]
        if stray:
            raise RuntimeError(
                f"SAFETY VIOLATION: {len(stray)} emitted rows are for non-affected HCPs. Aborting."
            )

    # Safety assertion: when scoped, all emitted rows must be for the scoped TA
    if scoped_ta_id:
        bad_rows = [r for r in rows if r["therapeutic_area_id"] != scoped_ta_id]
        if bad_rows:
            raise RuntimeError(
                f"SAFETY VIOLATION: {len(bad_rows)} rows have therapeutic_area_id != {scoped_ta_id}. Aborting."
            )

    # Select canonicals based on TA scope
    if ta_slug and ta_slug in CANONICALS_BY_TA:
        active_canonicals = resolve_canonical_hcp_ids(client_box[0], CANONICALS_BY_TA[ta_slug])
    elif ta_slug:
        active_canonicals = []
        print(f"\n[INFO] No canonicals defined for TA slug '{ta_slug}'; skipping canonical check.")
    else:
        active_canonicals = CANONICALS

    # Stats
    level_1 = compute_level_1_stats(rows, hcp_ta_aggregates, ta_names)
    print("\n=== Level 1 stats ===")
    print(json.dumps(level_1, indent=2, default=str))

    level_2: List[Dict[str, Any]] = []
    if active_canonicals:
        print("\n=== Level 2 canonicals ===")
        level_2 = compute_canonical_check(rows, hcp_ta_aggregates, hcp_total_pubs, ta_names, canonicals=active_canonicals)

    # Phase 5: write
    rows_inserted: Optional[int] = None
    if not execute:
        print("\n[DRY-RUN] Skipping write.")
    else:
        scope_label = f" ({scoped_ta_name})" if scoped_ta_name else ""
        confirm = input(
            f"\nAbout to UPSERT {len(rows)} rows into hcp_therapeutic_areas_v2{scope_label}. "
            f"Continue? (yes/no): "
        )
        if confirm != "yes":
            print("Execution cancelled.")
            errors.append("execute_cancelled_by_user")
        else:
            try:
                rows_inserted = write_rows(client_box[0], rows)
                print(f"\nWrite complete: {rows_inserted}/{len(rows)} rows inserted.")
            except Exception as exc:
                errors.append(f"write_failed: {repr(exc)}")
                print(f"Write failed: {exc}")

    # Log
    elapsed = time.time() - started
    log_payload = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "mode": mode,
        "ta_scope": ta_slug or "all",
        "scoped_ta_id": scoped_ta_id,
        "hcp_scope": "affected" if hcp_scoped else "whole_corpus",
        "affected_hcp_count": len(affected_hcp_ids) if hcp_scoped else None,
        "decisions_csv": decisions_csv,
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
    p.add_argument("--ta", type=str, default=None, metavar="SLUG",
                   help="Scope run to a single therapeutic area by slug (e.g. atopic-dermatitis)")
    p.add_argument("--candidate-hcp-ids-file", type=str, default=None, metavar="PATH",
                   help="Incremental HCP scope: restrict the tagging rebuild to this AFFECTED set "
                        "(one hcp_id per line). The affected set is all HCPs who authored any pub "
                        "in the incremental batch (new HCPs + pre-existing authors of new pubs); "
                        "each is re-aggregated over its COMPLETE pub set. Omit for whole-corpus.")
    p.add_argument("--ingestion-run-id", type=str, default=None, metavar="UUID",
                   help="Add hcps_v2 rows with this ingestion_run_id to the affected set. NOTE: "
                        "this captures only NEWLY-CREATED HCPs, not pre-existing authors of new "
                        "pubs; use --candidate-hcp-ids-file for the complete affected set.")
    p.add_argument("--decisions-csv", type=str, default=None, metavar="PATH",
                   help="Where to write the machine-diffable tag-decision CSV (default "
                        "ta_tagging_decisions_full.csv / _scoped.csv). Used for the both-modes "
                        "validation diff.")
    args = p.parse_args()
    run(
        args.execute,
        ta_slug=args.ta,
        candidate_hcp_ids_file=args.candidate_hcp_ids_file,
        ingestion_run_id=args.ingestion_run_id,
        decisions_csv=args.decisions_csv,
    )
