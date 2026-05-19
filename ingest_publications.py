"""
FieldMark v2.0 - Publication Ingestion Pipeline

Reads PubMed publications for each active TA in therapeutic_area_ingestion_config.
Stores publications in the publications table with full metadata.

CRITICAL: This script does NOT create HCP rows. PubMed authorship data is stored
as JSONB in publications.pubmed_authorships for later OpenAlex-driven HCP resolution.

Required environment variables:
- SUPABASE_URL
- SUPABASE_KEY

Optional environment variables:
- PUBMED_EMAIL (recommended by NCBI)
- PUBMED_API_KEY (allows 10 req/sec instead of 3)
- PUBMED_TOOL (default: fieldmark_v2_ingest)

Usage:
    python ingest_publications.py                  # full run, all active TA configs
    python ingest_publications.py --dry-run        # preview, no DB writes
    python ingest_publications.py --ta hepatology  # run only for specific TA slug
    python ingest_publications.py --limit 1000     # cap total PMIDs per TA (testing)
"""

from __future__ import annotations

import argparse
import os
import sys
import time
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any, Dict, Iterable, List, Optional, Sequence, Set, Tuple
from xml.etree import ElementTree as ET

import requests
from dotenv import load_dotenv
from requests import Response
from requests.adapters import HTTPAdapter
from supabase import Client, create_client
from urllib3.util.retry import Retry


# ============================================================
# Config
# ============================================================

PUBMED_API_BASE = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils"
EFETCH_BATCH_SIZE = 200            # PMIDs per efetch call
ESEARCH_BATCH_SIZE = 500           # PMIDs per esearch page
DB_INSERT_BATCH_SIZE = 100         # Publications per Supabase insert
PROGRESS_PRINT_EVERY = 500         # Print progress every N PMIDs processed


# ============================================================
# Data classes
# ============================================================

@dataclass
class PublicationRecord:
    pubmed_id: str
    title: Optional[str]
    abstract: Optional[str]
    journal: Optional[str]
    pub_year: Optional[int]
    pub_date: Optional[str]
    doi: Optional[str]
    pubmed_authorships: List[Dict[str, Any]] = field(default_factory=list)
    mesh_terms: List[str] = field(default_factory=list)
    publication_types: List[str] = field(default_factory=list)
    language: Optional[str] = None


@dataclass
class IngestionStats:
    ta_slug: str
    pmids_found: int = 0
    publications_fetched: int = 0
    publications_inserted: int = 0
    publications_skipped_existing: int = 0
    publications_failed: int = 0
    ta_tags_added: int = 0
    source_ta_backfilled: int = 0
    errors: List[str] = field(default_factory=list)
    started_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None


# ============================================================
# Environment + clients
# ============================================================

def get_required_env(name: str) -> str:
    v = os.getenv(name)
    if not v:
        raise EnvironmentError(f"Missing required env var: {name}")
    return v


def init_supabase() -> Client:
    return create_client(get_required_env("SUPABASE_URL"), get_required_env("SUPABASE_KEY"))


def fetch_ta_hierarchy(supabase: Client) -> Dict[str, List[str]]:
    """
    Returns a dict mapping each TA UUID to a list of all its ancestor TA UUIDs (including itself).
    Walks parent_ta_id chain to root.

    Example: if NSCLC has parent_ta_id = Oncology, returns:
      {nsclc_uuid: [nsclc_uuid, oncology_uuid], oncology_uuid: [oncology_uuid], ...}
    """
    resp = supabase.table("therapeutic_areas").select("id, parent_ta_id").execute()
    rows = resp.data or []

    parent_of: Dict[str, Optional[str]] = {}
    for row in rows:
        ta_id = str(row["id"])
        parent_id = row.get("parent_ta_id")
        parent_of[ta_id] = str(parent_id) if parent_id else None

    ancestry: Dict[str, List[str]] = {}
    for ta_id in parent_of:
        chain = [ta_id]
        current = parent_of[ta_id]
        while current:
            if current in chain:
                break
            chain.append(current)
            current = parent_of.get(current)
        ancestry[ta_id] = chain

    return ancestry


def build_http_session() -> requests.Session:
    s = requests.Session()
    retries = Retry(
        total=5,
        backoff_factor=0.8,
        status_forcelist=(429, 500, 502, 503, 504),
        allowed_methods=("GET", "POST"),
    )
    a = HTTPAdapter(max_retries=retries)
    s.mount("https://", a)
    s.mount("http://", a)
    return s


# ============================================================
# Helpers
# ============================================================

def text_or_none(elem: Optional[ET.Element]) -> Optional[str]:
    if elem is None or elem.text is None:
        return None
    v = elem.text.strip()
    return v if v else None


def safe_get(url: str, params: Dict[str, str], session: requests.Session, timeout: int = 60) -> Response:
    r = session.get(url, params=params, timeout=timeout)
    r.raise_for_status()
    return r


def chunked(items: Sequence, size: int) -> Iterable[Sequence]:
    for i in range(0, len(items), size):
        yield items[i:i + size]


def format_duration(seconds: float) -> str:
    if seconds < 60:
        return f"{seconds:.1f}s"
    if seconds < 3600:
        return f"{seconds / 60:.1f}m"
    return f"{seconds / 3600:.2f}h"


def estimate_remaining(processed: int, total: int, started_at: datetime) -> str:
    if processed == 0:
        return "unknown"
    elapsed = (datetime.now(timezone.utc) - started_at).total_seconds()
    rate = processed / elapsed
    remaining_items = total - processed
    if rate == 0:
        return "unknown"
    remaining_seconds = remaining_items / rate
    return format_duration(remaining_seconds)


# ============================================================
# Config loader
# ============================================================

def fetch_active_ta_configs(
    supabase: Client,
    ta_slug_filter: Optional[str] = None,
) -> List[Dict[str, Any]]:
    """
    Fetch active ingestion configs joined with therapeutic_areas info (any ta_level).
    Returns list of dicts with TA info and ingestion config.
    """
    query = (
        supabase.table("therapeutic_area_ingestion_config")
        .select(
            "id, therapeutic_area_id, pubmed_query, pubmed_max_results, "
            "pubmed_days_back, is_active, "
            "therapeutic_areas!inner(id, name, slug, ta_level)"
        )
        .eq("is_active", True)
    )
    response = query.execute()
    rows = response.data or []

    out: List[Dict[str, Any]] = []
    for row in rows:
        ta = row.get("therapeutic_areas") or {}
        if not row.get("pubmed_query"):
            continue
        if ta_slug_filter and ta.get("slug") != ta_slug_filter:
            continue
        out.append({
            "config_id": row["id"],
            "therapeutic_area_id": row["therapeutic_area_id"],
            "ta_slug": ta.get("slug"),
            "ta_name": ta.get("name"),
            "pubmed_query": row["pubmed_query"],
            "pubmed_max_results": row.get("pubmed_max_results") or 30000,
            "pubmed_days_back": row.get("pubmed_days_back") or 1460,
        })
    return out


# ============================================================
# PubMed ESearch (initialize history server) + EFetch (paginate via history)
# ============================================================

def generate_date_windows(days_back: int, window_days: int = 90) -> List[Tuple[str, str]]:
    """
    Generate (mindate, maxdate) tuples covering days_back from today, in window_days chunks.
    Dates returned as YYYY/MM/DD strings (PubMed format). Newest window first.
    """
    from datetime import date, timedelta
    today = date.today()
    start = today - timedelta(days=days_back)

    windows: List[Tuple[str, str]] = []
    cursor_end = today
    while cursor_end > start:
        cursor_start = cursor_end - timedelta(days=window_days - 1)
        if cursor_start < start:
            cursor_start = start
        windows.append((
            cursor_start.strftime("%Y/%m/%d"),
            cursor_end.strftime("%Y/%m/%d"),
        ))
        cursor_end = cursor_start - timedelta(days=1)
    return windows


def pubmed_search_init(
    session: requests.Session,
    query: str,
    mindate: str,
    maxdate: str,
    email: Optional[str],
    tool_name: str,
) -> Tuple[int, str, str]:
    """
    Run one esearch call with usehistory=y for a SPECIFIC date range.
    Returns (total_count, webenv, query_key).
    Date range must produce < 10,000 results to avoid the efetch cap.
    """
    url = f"{PUBMED_API_BASE}/esearch.fcgi"
    api_key = os.getenv("PUBMED_API_KEY")
    sleep_seconds = 0.11 if api_key else 0.34

    params = {
        "db": "pubmed",
        "term": query,
        "retmode": "xml",
        "retmax": "0",
        "sort": "pub_date",
        "datetype": "pdat",
        "mindate": mindate,
        "maxdate": maxdate,
        "usehistory": "y",
        "tool": tool_name,
    }
    if email:
        params["email"] = email
    if api_key:
        params["api_key"] = api_key

    r = safe_get(url, params, session)
    root = ET.fromstring(r.content)
    if root.findtext("ERROR"):
        raise RuntimeError(f"PubMed ESearch error: {root.findtext('ERROR')}")

    total_str = text_or_none(root.find("Count")) or "0"
    total = int(total_str)
    webenv = text_or_none(root.find("WebEnv"))
    query_key = text_or_none(root.find("QueryKey"))
    if not webenv or not query_key:
        raise RuntimeError("PubMed ESearch did not return WebEnv/QueryKey")

    time.sleep(sleep_seconds)
    return total, webenv, query_key


def pubmed_efetch_via_history(
    session: requests.Session,
    webenv: str,
    query_key: str,
    retstart: int,
    retmax: int,
    email: Optional[str],
    tool_name: str,
) -> List[ET.Element]:
    """
    Fetch a window of articles via the history server.
    retstart can be arbitrarily large (bypasses the 9999 cap).
    """
    url = f"{PUBMED_API_BASE}/efetch.fcgi"
    api_key = os.getenv("PUBMED_API_KEY")
    sleep_seconds = 0.11 if api_key else 0.34

    params = {
        "db": "pubmed",
        "WebEnv": webenv,
        "query_key": query_key,
        "retstart": str(retstart),
        "retmax": str(retmax),
        "retmode": "xml",
        "tool": tool_name,
    }
    if email:
        params["email"] = email
    if api_key:
        params["api_key"] = api_key

    r = safe_get(url, params, session)
    root = ET.fromstring(r.content)
    articles = root.findall("./PubmedArticle")
    time.sleep(sleep_seconds)
    return articles


# ============================================================
# PubMed EFetch (article metadata)
# ============================================================

def parse_pub_year(article: ET.Element) -> Optional[int]:
    candidates = [
        "./MedlineCitation/Article/Journal/JournalIssue/PubDate/Year",
        "./MedlineCitation/Article/ArticleDate/Year",
        "./PubmedData/History/PubMedPubDate[@PubStatus='pubmed']/Year",
    ]
    for path in candidates:
        raw = text_or_none(article.find(path))
        if raw and raw.isdigit():
            return int(raw)
    return None


def parse_pub_date(article: ET.Element) -> Optional[str]:
    """Returns YYYY-MM-DD if available."""
    y = parse_pub_year(article)
    if not y:
        return None
    m = text_or_none(article.find("./MedlineCitation/Article/Journal/JournalIssue/PubDate/Month"))
    d = text_or_none(article.find("./MedlineCitation/Article/Journal/JournalIssue/PubDate/Day"))
    month_map = {
        "Jan": "01", "Feb": "02", "Mar": "03", "Apr": "04", "May": "05", "Jun": "06",
        "Jul": "07", "Aug": "08", "Sep": "09", "Oct": "10", "Nov": "11", "Dec": "12",
    }
    if m and not m.isdigit():
        m = month_map.get(m[:3], "01")
    elif not m:
        m = "01"
    if not d or not d.isdigit():
        d = "01"
    return f"{y}-{m.zfill(2)}-{d.zfill(2)}"


def parse_doi(article: ET.Element) -> Optional[str]:
    for aid in article.findall("./PubmedData/ArticleIdList/ArticleId"):
        if aid.attrib.get("IdType", "").lower() == "doi" and aid.text:
            return aid.text.strip()
    for eloc in article.findall("./MedlineCitation/Article/ELocationID"):
        if eloc.attrib.get("EIdType", "").lower() == "doi" and eloc.text:
            return eloc.text.strip()
    return None


def parse_abstract(article: ET.Element) -> Optional[str]:
    parts: List[str] = []
    for ab in article.findall("./MedlineCitation/Article/Abstract/AbstractText"):
        label = ab.attrib.get("Label")
        text = (ab.text or "").strip()
        if not text:
            continue
        if label:
            parts.append(f"{label}: {text}")
        else:
            parts.append(text)
    if not parts:
        return None
    joined = " ".join(parts)
    return joined[:10000]  # cap at 10k chars


def parse_authorships(article: ET.Element) -> List[Dict[str, Any]]:
    """
    Extract author info AS-IS from PubMed for later OpenAlex resolution.
    Stored as JSONB. Does NOT create HCP rows.
    """
    out: List[Dict[str, Any]] = []
    for idx, author in enumerate(article.findall("./MedlineCitation/Article/AuthorList/Author")):
        if author.find("CollectiveName") is not None:
            collective = text_or_none(author.find("CollectiveName"))
            if collective:
                out.append({
                    "position": idx + 1,
                    "is_collective": True,
                    "collective_name": collective,
                })
            continue

        last_name = text_or_none(author.find("LastName"))
        fore_name = text_or_none(author.find("ForeName"))
        initials = text_or_none(author.find("Initials"))
        suffix = text_or_none(author.find("Suffix"))

        # Collect all affiliations for this author
        affiliations: List[str] = []
        for aff in author.findall("./AffiliationInfo/Affiliation"):
            t = (aff.text or "").strip()
            if t:
                affiliations.append(t)

        # ORCID if present
        orcid: Optional[str] = None
        for ident in author.findall("./Identifier"):
            if ident.attrib.get("Source", "").lower() == "orcid" and ident.text:
                orcid = ident.text.strip()
                break

        out.append({
            "position": idx + 1,
            "is_collective": False,
            "last_name": last_name,
            "fore_name": fore_name,
            "initials": initials,
            "suffix": suffix,
            "affiliations": affiliations,
            "orcid": orcid,
        })
    return out


def parse_mesh_terms(article: ET.Element) -> List[str]:
    out: List[str] = []
    for mh in article.findall("./MedlineCitation/MeshHeadingList/MeshHeading/DescriptorName"):
        if mh.text:
            out.append(mh.text.strip())
    return out


def parse_publication_types(article: ET.Element) -> List[str]:
    out: List[str] = []
    for pt in article.findall("./MedlineCitation/Article/PublicationTypeList/PublicationType"):
        if pt.text:
            out.append(pt.text.strip())
    return out


def parse_language(article: ET.Element) -> Optional[str]:
    return text_or_none(article.find("./MedlineCitation/Article/Language"))


def article_to_record(article: ET.Element) -> Optional[PublicationRecord]:
    pmid = text_or_none(article.find("./MedlineCitation/PMID"))
    if not pmid:
        return None
    return PublicationRecord(
        pubmed_id=pmid,
        title=text_or_none(article.find("./MedlineCitation/Article/ArticleTitle")),
        abstract=parse_abstract(article),
        journal=text_or_none(article.find("./MedlineCitation/Article/Journal/Title")),
        pub_year=parse_pub_year(article),
        pub_date=parse_pub_date(article),
        doi=parse_doi(article),
        pubmed_authorships=parse_authorships(article),
        mesh_terms=parse_mesh_terms(article),
        publication_types=parse_publication_types(article),
        language=parse_language(article),
    )


# ============================================================
# DB existence check + insert
# ============================================================

def fetch_existing_pubmed_ids(supabase: Client, pmids: Sequence[str]) -> Set[str]:
    """
    Returns subset of given PMIDs that already exist in publications table.
    Batched to avoid URL length limits.
    """
    existing: Set[str] = set()
    for chunk in chunked(list(pmids), 200):
        r = (
            supabase.table("publications")
            .select("pubmed_id")
            .in_("pubmed_id", list(chunk))
            .execute()
        )
        for row in (r.data or []):
            pid = row.get("pubmed_id")
            if pid:
                existing.add(str(pid))
    return existing


def fetch_publication_state_by_pmid(
    supabase: Client, pmids: Sequence[str]
) -> Dict[str, Dict[str, Any]]:
    """Returns {pubmed_id: {id, source_therapeutic_area_id}} for given pmids."""
    out: Dict[str, Dict[str, Any]] = {}
    for chunk in chunked(list(pmids), 200):
        r = (
            supabase.table("publications")
            .select("id, pubmed_id, source_therapeutic_area_id")
            .in_("pubmed_id", list(chunk))
            .execute()
        )
        for row in (r.data or []):
            pid = row.get("pubmed_id")
            if pid:
                out[str(pid)] = {
                    "id": str(row["id"]),
                    "source_therapeutic_area_id": row.get("source_therapeutic_area_id"),
                }
    return out


def upsert_publication_ta_tags(
    supabase: Client,
    rows: List[Dict[str, Any]],
    stats: IngestionStats,
) -> None:
    if not rows:
        return
    try:
        supabase.table("publication_therapeutic_areas").upsert(
            rows,
            on_conflict="publication_id,therapeutic_area_id",
            ignore_duplicates=True,
        ).execute()
        stats.ta_tags_added += len(rows)
    except Exception:
        for r in rows:
            try:
                supabase.table("publication_therapeutic_areas").upsert(
                    [r],
                    on_conflict="publication_id,therapeutic_area_id",
                    ignore_duplicates=True,
                ).execute()
                stats.ta_tags_added += 1
            except Exception as e2:
                stats.errors.append(
                    f"TA tag failed for publication_id={r.get('publication_id')}: {repr(e2)[:200]}"
                )


def record_to_db_row(rec: PublicationRecord, ta_id: str, ts_iso: str) -> Dict[str, Any]:
    return {
        "pubmed_id": rec.pubmed_id,
        "title": rec.title,
        "abstract": rec.abstract,
        "journal": rec.journal,
        "pub_year": rec.pub_year,
        "pub_date": rec.pub_date,
        "doi": rec.doi,
        "pubmed_authorships": rec.pubmed_authorships,
        "mesh_terms": rec.mesh_terms,
        "publication_types": rec.publication_types,
        "language": rec.language,
        "source_therapeutic_area_id": ta_id,
        "source": "pubmed_v2_ingest",
        "ingested_at": ts_iso,
    }


def insert_publications_batch(
    supabase: Client,
    rows: List[Dict[str, Any]],
    stats: IngestionStats,
    *,
    ta_chain: List[str],
    ts_iso: str,
) -> None:
    if not rows:
        return
    inserted_pmids: List[str] = []
    try:
        supabase.table("publications").insert(rows).execute()
        stats.publications_inserted += len(rows)
        inserted_pmids = [str(r["pubmed_id"]) for r in rows if r.get("pubmed_id")]
    except Exception:
        # On batch fail, try one-by-one to identify offenders
        for r in rows:
            try:
                supabase.table("publications").insert(r).execute()
                stats.publications_inserted += 1
                if r.get("pubmed_id"):
                    inserted_pmids.append(str(r["pubmed_id"]))
            except Exception as e2:
                stats.publications_failed += 1
                err = f"PMID {r.get('pubmed_id')}: {repr(e2)[:200]}"
                stats.errors.append(err)

    if inserted_pmids and ta_chain:
        pub_state = fetch_publication_state_by_pmid(supabase, inserted_pmids)
        new_ta_tags: List[Dict[str, Any]] = []
        for _pmid, info in pub_state.items():
            for ta_id in ta_chain:
                new_ta_tags.append({
                    "publication_id": info["id"],
                    "therapeutic_area_id": ta_id,
                    "source": "pubmed_v2_ingest",
                    "tagged_at": ts_iso,
                })
        if new_ta_tags:
            upsert_publication_ta_tags(supabase, new_ta_tags, stats)


# ============================================================
# Main per-TA ingestion
# ============================================================

def ingest_for_ta(
    supabase: Client,
    session: requests.Session,
    config: Dict[str, Any],
    args: argparse.Namespace,
    ta_ancestry: Dict[str, List[str]],
) -> IngestionStats:
    stats = IngestionStats(ta_slug=config["ta_slug"])
    stats.started_at = datetime.now(timezone.utc)

    ta_id = str(config["therapeutic_area_id"])
    ta_chain = ta_ancestry.get(ta_id, [ta_id])

    email = os.getenv("PUBMED_EMAIL")
    tool_name = os.getenv("PUBMED_TOOL", "fieldmark_v2_ingest")
    ts_iso = stats.started_at.isoformat()

    max_results = config["pubmed_max_results"]
    if args.limit:
        max_results = min(max_results, args.limit)

    print(f"\n{'=' * 70}")
    print(f"Ingesting: {config['ta_name']} (slug={config['ta_slug']})")
    print(f"{'=' * 70}")
    print(f"  Max results: {max_results:,}")
    print(f"  Days back: {config['pubmed_days_back']:,}")
    print(f"  Query length: {len(config['pubmed_query']):,} chars")
    if args.dry_run:
        print(f"  *** DRY RUN — no DB writes ***")

    # Step 1: Generate date windows (each must produce < 10K results)
    print(f"\n  [Step 1/2] Planning date windows...")
    windows = generate_date_windows(config["pubmed_days_back"], window_days=90)
    print(f"  Generated {len(windows)} date windows of 90 days each")
    print(f"  Range: {windows[-1][0]} to {windows[0][1]}")

    # Step 2: For each window, esearch + paginate via efetch
    print(f"\n  [Step 2/2] Fetching articles per window + writing to DB...")
    fetch_started = datetime.now(timezone.utc)
    pending_insert: List[Dict[str, Any]] = []
    total_processed_overall = 0
    sum_of_window_counts = 0  # rolling estimate of total target

    # First pass: do a quick count across all windows for ETA calibration
    # (skip if user passed --limit, we'll just hit it sooner)

    for window_idx, (mindate, maxdate) in enumerate(windows):
        if args.limit and total_processed_overall >= args.limit:
            print(f"  Reached --limit of {args.limit:,}, stopping early")
            break

        # Init history server for this window
        try:
            window_count, webenv, query_key = pubmed_search_init(
                session=session,
                query=config["pubmed_query"],
                mindate=mindate,
                maxdate=maxdate,
                email=email,
                tool_name=tool_name,
            )
        except Exception as exc:
            stats.errors.append(f"esearch window {mindate}-{maxdate} failed: {repr(exc)[:200]}")
            continue

        if window_count == 0:
            continue

        if window_count >= 9999:
            stats.errors.append(
                f"Window {mindate}-{maxdate} has {window_count} results "
                f"(>=9999 cap). Reduce window_days or refine query."
            )
            # We'll still try to fetch up to 9999 from this window
            window_target = 9999
        else:
            window_target = window_count

        sum_of_window_counts += window_target

        # Respect --limit
        if args.limit:
            remaining_limit = args.limit - total_processed_overall
            window_target = min(window_target, remaining_limit)

        # Paginate within this window
        retstart = 0
        while retstart < window_target:
            batch_size = min(EFETCH_BATCH_SIZE, window_target - retstart)
            try:
                articles = pubmed_efetch_via_history(
                    session=session,
                    webenv=webenv,
                    query_key=query_key,
                    retstart=retstart,
                    retmax=batch_size,
                    email=email,
                    tool_name=tool_name,
                )
                stats.publications_fetched += len(articles)
            except Exception as exc:
                stats.errors.append(
                    f"efetch failed (window {mindate}-{maxdate}, retstart {retstart}): {repr(exc)[:200]}"
                )
                retstart += batch_size
                total_processed_overall += batch_size
                continue

            # Build records, batch DB check, queue inserts
            batch_records: List[PublicationRecord] = []
            for art in articles:
                rec = article_to_record(art)
                if rec:
                    batch_records.append(rec)

            if batch_records and not args.dry_run:
                batch_pmids = [r.pubmed_id for r in batch_records]

                existing_pubs = fetch_publication_state_by_pmid(supabase, batch_pmids)

                new_records = [r for r in batch_records if r.pubmed_id not in existing_pubs]
                existing_records = [r for r in batch_records if r.pubmed_id in existing_pubs]
                stats.publications_skipped_existing += len(existing_records)

                for rec in new_records:
                    pending_insert.append(record_to_db_row(
                        rec, config["therapeutic_area_id"], ts_iso
                    ))

                pending_ta_tags: List[Dict[str, Any]] = []
                pending_source_backfills: List[str] = []

                for rec in existing_records:
                    pub_info = existing_pubs[rec.pubmed_id]
                    pub_id = pub_info["id"]
                    for chain_ta_id in ta_chain:
                        pending_ta_tags.append({
                            "publication_id": pub_id,
                            "therapeutic_area_id": chain_ta_id,
                            "source": "pubmed_v2_ingest",
                            "tagged_at": ts_iso,
                        })
                    if pub_info["source_therapeutic_area_id"] is None:
                        pending_source_backfills.append(pub_id)

                if pending_ta_tags:
                    upsert_publication_ta_tags(supabase, pending_ta_tags, stats)

                if pending_source_backfills:
                    for pub_id in pending_source_backfills:
                        try:
                            supabase.table("publications").update(
                                {"source_therapeutic_area_id": config["therapeutic_area_id"]}
                            ).eq("id", pub_id).execute()
                            stats.source_ta_backfilled += 1
                        except Exception as exc:
                            stats.errors.append(
                                f"source_ta backfill failed for pub_id={pub_id}: {repr(exc)[:200]}"
                            )

                if len(pending_insert) >= DB_INSERT_BATCH_SIZE:
                    insert_publications_batch(
                        supabase, pending_insert, stats, ta_chain=ta_chain, ts_iso=ts_iso
                    )
                    pending_insert = []

            retstart += batch_size
            total_processed_overall += batch_size

            # Progress reporting
            if total_processed_overall % PROGRESS_PRINT_EVERY == 0:
                elapsed = (datetime.now(timezone.utc) - fetch_started).total_seconds()
                rate = total_processed_overall / elapsed if elapsed > 0 else 0
                pct_windows = ((window_idx + 1) / len(windows)) * 100
                print(f"  Progress: {total_processed_overall:,} processed  "
                      f"window {window_idx + 1}/{len(windows)} ({pct_windows:.1f}%)  "
                      f"rate={rate:.1f}/s  "
                      f"inserted={stats.publications_inserted:,} "
                      f"skipped={stats.publications_skipped_existing:,}")

    stats.pmids_found = sum_of_window_counts

    # Flush remaining
    if not args.dry_run and pending_insert:
        insert_publications_batch(
            supabase, pending_insert, stats, ta_chain=ta_chain, ts_iso=ts_iso
        )

    stats.completed_at = datetime.now(timezone.utc)
    return stats


# ============================================================
# Main
# ============================================================

def main():
    parser = argparse.ArgumentParser(description="FieldMark v2.0 publication ingestion")
    parser.add_argument("--dry-run", action="store_true", help="Don't write to DB")
    parser.add_argument("--ta", type=str, default=None, help="Run for specific TA slug only")
    parser.add_argument("--limit", type=int, default=None, help="Cap PMIDs per TA (testing)")
    args = parser.parse_args()

    load_dotenv()
    supabase = init_supabase()
    session = build_http_session()

    print("FieldMark v2.0 Publication Ingestion")
    print(f"Started at: {datetime.now(timezone.utc).isoformat()}")
    if args.dry_run:
        print("MODE: DRY RUN (no DB writes)")
    if args.ta:
        print(f"FILTER: TA slug = {args.ta}")
    if args.limit:
        print(f"LIMIT: {args.limit:,} PMIDs per TA")

    ta_ancestry = fetch_ta_hierarchy(supabase)

    configs = fetch_active_ta_configs(supabase, args.ta)
    if not configs:
        print("\nNo active TA ingestion configs found. "
              "Did you populate therapeutic_area_ingestion_config?")
        sys.exit(1)

    print(f"\nFound {len(configs)} active TA config(s):")
    for c in configs:
        print(f"  - {c['ta_name']} (slug={c['ta_slug']}) max={c['pubmed_max_results']:,}")

    all_stats: List[IngestionStats] = []
    overall_started = datetime.now(timezone.utc)

    for config in configs:
        stats = ingest_for_ta(supabase, session, config, args, ta_ancestry)
        all_stats.append(stats)

    # Final summary
    overall_elapsed = (datetime.now(timezone.utc) - overall_started).total_seconds()
    print(f"\n\n{'=' * 70}")
    print(f"OVERALL SUMMARY")
    print(f"{'=' * 70}")
    print(f"Total runtime: {format_duration(overall_elapsed)}")
    for s in all_stats:
        duration = (s.completed_at - s.started_at).total_seconds() if s.started_at and s.completed_at else 0
        print(f"\n{s.ta_slug}:")
        print(f"  PMIDs found:         {s.pmids_found:,}")
        print(f"  Skipped (existing):  {s.publications_skipped_existing:,}")
        print(f"  Fetched:             {s.publications_fetched:,}")
        print(f"  Inserted:            {s.publications_inserted:,}")
        print(f"  TA tags added:        {s.ta_tags_added:,}")
        print(f"  Source TA backfilled: {s.source_ta_backfilled:,}")
        print(f"  Failed:              {s.publications_failed:,}")
        print(f"  Duration:            {format_duration(duration)}")
        if s.errors:
            print(f"  First 5 errors:")
            for e in s.errors[:5]:
                print(f"    - {e}")
            if len(s.errors) > 5:
                print(f"    ... ({len(s.errors) - 5} more)")


if __name__ == "__main__":
    main()
