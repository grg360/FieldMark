"""
PubMed -> Supabase pipeline for FieldMark.

This script:
1) Queries PubMed for recent rare-disease related publications.
2) Extracts publication and author affiliation metadata.
3) Deduplicates authors into unique HCP profiles.
4) Stores HCPs and linked publication rows in Supabase.

Required environment variables:
- SUPABASE_URL
- SUPABASE_KEY

Optional environment variables:
- PUBMED_EMAIL (recommended by NCBI)
- PUBMED_TOOL (default: fieldmark_pubmed_pipeline)
- PUBMED_DAYS_BACK (default: 365)
- PUBMED_MAX_RESULTS (default: 200)
- PUBMED_RETMAX_PER_CALL (default: 100)
- PUBMED_API_BASE (default: https://eutils.ncbi.nlm.nih.gov/entrez/eutils)
"""

from __future__ import annotations

import os
from dotenv import load_dotenv
load_dotenv()
import re
import time
from dataclasses import dataclass
from typing import Dict, Iterable, List, Optional, Sequence, Set, Tuple
from xml.etree import ElementTree as ET

import requests
from requests import Response
from requests.adapters import HTTPAdapter
from supabase import Client, create_client
from urllib3.util.retry import Retry


# Domain-targeted query for rare disease + relevant therapy/oncology areas.
PUBMED_QUERY = """
(
  ("rare disease"[Title/Abstract] OR "orphan disease"[Title/Abstract]
   OR "rare genetic disorder*"[Title/Abstract]
   OR "inborn error*"[Title/Abstract])
  AND
  ("gene therap*"[Title/Abstract]
   OR "CAR-T"[Title/Abstract]
   OR "chimeric antigen receptor"[Title/Abstract]
   OR "hematologic oncology"[Title/Abstract]
   OR leukemia[Title/Abstract]
   OR lymphoma[Title/Abstract]
   OR myeloma[Title/Abstract])
)
""".strip()


@dataclass
class HCPRecord:
    first_name: Optional[str]
    last_name: Optional[str]
    credentials: Optional[str]
    institution: Optional[str]
    city: Optional[str]
    state: Optional[str]
    zip_code: Optional[str]
    country: Optional[str]
    specialty: Optional[str]
    subspecialty: Optional[str]
    dedupe_key: str


@dataclass
class PublicationRecord:
    pubmed_id: str
    title: Optional[str]
    journal: Optional[str]
    pub_year: Optional[int]
    citation_count: Optional[int]
    doi: Optional[str]
    hcp_dedupe_key: str


def get_required_env(name: str) -> str:
    value = os.getenv(name)
    if not value:
        raise EnvironmentError(f"Missing required environment variable: {name}")
    return value


def build_http_session() -> requests.Session:
    session = requests.Session()
    retries = Retry(
        total=5,
        read=5,
        connect=5,
        backoff_factor=0.8,
        status_forcelist=(429, 500, 502, 503, 504),
        allowed_methods=("GET",),
    )
    adapter = HTTPAdapter(max_retries=retries)
    session.mount("https://", adapter)
    session.mount("http://", adapter)
    return session


def safe_get(url: str, params: Dict[str, str], session: requests.Session, timeout: int = 40) -> Response:
    try:
        response = session.get(url, params=params, timeout=timeout)
        response.raise_for_status()
        return response
    except requests.RequestException as exc:
        raise RuntimeError(f"HTTP request failed for {url}: {exc}") from exc


def parse_xml(content: bytes, source_name: str) -> ET.Element:
    try:
        return ET.fromstring(content)
    except ET.ParseError as exc:
        raise RuntimeError(f"Failed to parse XML from {source_name}: {exc}") from exc


def text_or_none(elem: Optional[ET.Element]) -> Optional[str]:
    if elem is None or elem.text is None:
        return None
    value = elem.text.strip()
    return value if value else None


def normalize_token(value: Optional[str]) -> str:
    if not value:
        return ""
    return re.sub(r"\s+", " ", value).strip().lower()


def clean_person_name(value: Optional[str]) -> Optional[str]:
    if not value:
        return None
    value = re.sub(r"[^A-Za-z\-\'\s\.]", "", value).strip()
    value = re.sub(r"\s+", " ", value)
    return value or None


def infer_credentials(last_name_or_suffix: Optional[str]) -> Optional[str]:
    if not last_name_or_suffix:
        return None
    suffix = last_name_or_suffix.strip().upper().replace(".", "")
    allowed = {"MD", "DO", "PHD", "MSC", "MPH", "MBBS", "FRCP", "RN", "NP", "PA"}
    return suffix if suffix in allowed else None


def parse_affiliation(affiliation: Optional[str]) -> Tuple[Optional[str], Optional[str], Optional[str], Optional[str], Optional[str]]:
    """
    Parse institution/city/state/zip/country from a free-text affiliation.
    This is heuristic and intentionally conservative.
    """
    if not affiliation:
        return None, None, None, None, None

    parts = [p.strip() for p in affiliation.split(",") if p.strip()]
    institution = parts[0] if parts else None
    country = parts[-1] if parts else None

    city = parts[-3] if len(parts) >= 3 else None
    state = None
    zip_code = None

    # Try parse US-like state+zip chunk, usually second to last item.
    if len(parts) >= 2:
        maybe_state_zip = parts[-2]
        state_zip_match = re.search(r"\b([A-Z]{2})\s+(\d{5}(?:-\d{4})?)\b", maybe_state_zip)
        if state_zip_match:
            state = state_zip_match.group(1)
            zip_code = state_zip_match.group(2)
        else:
            # If no zip, keep a short token that may be a state/province.
            token_match = re.search(r"\b([A-Z]{2,3})\b", maybe_state_zip)
            if token_match:
                state = token_match.group(1)

    return institution, city, state, zip_code, country


def build_dedupe_key(first_name: Optional[str], last_name: Optional[str], institution: Optional[str]) -> str:
    return f"{normalize_token(first_name)}|{normalize_token(last_name)}|{normalize_token(institution)}"


def pubmed_esearch(
    session: requests.Session,
    base_url: str,
    query: str,
    days_back: int,
    max_results: int,
    per_call: int,
    email: Optional[str],
    tool_name: str,
) -> List[str]:
    esearch_url = f"{base_url}/esearch.fcgi"
    api_key = os.getenv("PUBMED_API_KEY")
    sleep_seconds = 0.11 if api_key else 0.34
    webenv: Optional[str] = None
    query_key: Optional[str] = None
    ids: List[str] = []
    retstart = 0

    while retstart < max_results:
        batch_size = min(per_call, max_results - retstart)
        params = {
            "db": "pubmed",
            "term": query,
            "retmode": "xml",
            "retmax": str(batch_size),
            "retstart": str(retstart),
            "sort": "pub_date",
            "datetype": "pdat",
            "reldate": str(days_back),
            "usehistory": "y",
            "tool": tool_name,
        }
        if email:
            params["email"] = email
        if api_key:
            params["api_key"] = api_key
        if webenv and query_key:
            params["WebEnv"] = webenv
            params["query_key"] = query_key

        response = safe_get(esearch_url, params=params, session=session)
        root = parse_xml(response.content, "esearch")
        if root.findtext("ERROR"):
            raise RuntimeError(f"PubMed ESearch error: {root.findtext('ERROR')}")

        if not webenv:
            webenv = text_or_none(root.find("WebEnv"))
            query_key = text_or_none(root.find("QueryKey"))

        batch_ids = [elem.text for elem in root.findall("./IdList/Id") if elem.text]
        if not batch_ids:
            break
        ids.extend(batch_ids)
        retstart += len(batch_ids)
        time.sleep(sleep_seconds)

    # Preserve order while removing any duplicated PMIDs.
    seen: Set[str] = set()
    unique_ids: List[str] = []
    for pmid in ids:
        if pmid not in seen:
            seen.add(pmid)
            unique_ids.append(pmid)
    return unique_ids


def chunked(items: Sequence[str], size: int) -> Iterable[Sequence[str]]:
    for i in range(0, len(items), size):
        yield items[i : i + size]


def pubmed_efetch(
    session: requests.Session,
    base_url: str,
    pmids: Sequence[str],
    email: Optional[str],
    tool_name: str,
) -> List[ET.Element]:
    efetch_url = f"{base_url}/efetch.fcgi"
    api_key = os.getenv("PUBMED_API_KEY")
    sleep_seconds = 0.11 if api_key else 0.34
    all_articles: List[ET.Element] = []
    for batch in chunked(list(pmids), 100):
        params = {
            "db": "pubmed",
            "id": ",".join(batch),
            "retmode": "xml",
            "tool": tool_name,
        }
        if email:
            params["email"] = email
        if api_key:
            params["api_key"] = api_key

        response = safe_get(efetch_url, params=params, session=session)
        root = parse_xml(response.content, "efetch")
        all_articles.extend(root.findall("./PubmedArticle"))
        time.sleep(sleep_seconds)
    return all_articles


def parse_pub_year(article: ET.Element) -> Optional[int]:
    year_path_candidates = [
        "./MedlineCitation/Article/Journal/JournalIssue/PubDate/Year",
        "./MedlineCitation/Article/ArticleDate/Year",
        "./PubmedData/History/PubMedPubDate[@PubStatus='pubmed']/Year",
    ]
    for path in year_path_candidates:
        raw = text_or_none(article.find(path))
        if raw and raw.isdigit():
            return int(raw)
    return None


def parse_doi(article: ET.Element) -> Optional[str]:
    for aid in article.findall("./PubmedData/ArticleIdList/ArticleId"):
        if aid.attrib.get("IdType", "").lower() == "doi" and aid.text:
            return aid.text.strip()
    return None


def build_author_query(first_name: Optional[str], last_name: Optional[str]) -> Optional[str]:
    if not last_name:
        return None
    normalized_last = normalize_space(last_name)
    normalized_first = normalize_space(first_name) if first_name else None
    if not normalized_last:
        return None
    if normalized_first:
        first_initial = normalized_first[0]
        return f"\"{normalized_last} {first_initial}\"[Author]"
    return f"\"{normalized_last}\"[Author]"


def normalize_space(value: Optional[str]) -> Optional[str]:
    if value is None:
        return None
    cleaned = re.sub(r"\s+", " ", value).strip()
    return cleaned or None


def pubmed_esearch_all(
    session: requests.Session,
    base_url: str,
    query: str,
    per_call: int,
    email: Optional[str],
    tool_name: str,
) -> List[str]:
    """
    Fetch all PMIDs for a query with pagination.
    """
    esearch_url = f"{base_url}/esearch.fcgi"
    api_key = os.getenv("PUBMED_API_KEY")
    sleep_seconds = 0.11 if api_key else 0.34
    max_results = 500
    ids: List[str] = []
    retstart = 0

    while len(ids) < max_results:
        batch_size = min(per_call, max_results - len(ids))
        params = {
            "db": "pubmed",
            "term": query,
            "retmode": "xml",
            "retmax": str(batch_size),
            "retstart": str(retstart),
            "sort": "pub_date",
            "tool": tool_name,
        }
        if email:
            params["email"] = email
        if api_key:
            params["api_key"] = api_key

        response = safe_get(esearch_url, params=params, session=session)
        root = parse_xml(response.content, "esearch_all")
        if root.findtext("ERROR"):
            raise RuntimeError(f"PubMed ESearch error: {root.findtext('ERROR')}")

        batch_ids = [elem.text for elem in root.findall("./IdList/Id") if elem.text]
        if not batch_ids:
            break

        ids.extend(batch_ids)
        retstart += len(batch_ids)
        if len(ids) >= max_results:
            break
        time.sleep(sleep_seconds)

    seen: Set[str] = set()
    unique_ids: List[str] = []
    for pmid in ids:
        if pmid not in seen:
            seen.add(pmid)
            unique_ids.append(pmid)
    return unique_ids[:max_results]


def is_author_match(
    article_author_first: Optional[str],
    article_author_last: Optional[str],
    target_first: Optional[str],
    target_last: Optional[str],
) -> bool:
    if not article_author_last or not target_last:
        return False

    article_last_norm = normalize_token(article_author_last)
    target_last_norm = normalize_token(target_last)
    if article_last_norm != target_last_norm:
        return False

    # If we do not have first name on the HCP record, last-name-only fallback.
    if not target_first:
        return True

    article_first_norm = normalize_token(article_author_first)
    target_first_norm = normalize_token(target_first)
    if not article_first_norm:
        return False

    return article_first_norm.startswith(target_first_norm[:1]) or target_first_norm.startswith(article_first_norm[:1])


def extract_publication_rows_for_hcp(
    articles: Sequence[ET.Element],
    hcp_id: str,
    first_name: Optional[str],
    last_name: Optional[str],
) -> List[Dict[str, object]]:
    rows: List[Dict[str, object]] = []
    seen_pubmed_ids: Set[str] = set()

    for article in articles:
        pmid = text_or_none(article.find("./MedlineCitation/PMID"))
        if not pmid or pmid in seen_pubmed_ids:
            continue

        title = text_or_none(article.find("./MedlineCitation/Article/ArticleTitle"))
        journal = text_or_none(article.find("./MedlineCitation/Article/Journal/Title"))
        pub_year = parse_pub_year(article)
        doi = parse_doi(article)

        author_nodes = article.findall("./MedlineCitation/Article/AuthorList/Author")
        matched = False
        for author in author_nodes:
            if author.find("CollectiveName") is not None:
                continue
            article_first = clean_person_name(text_or_none(author.find("ForeName")) or text_or_none(author.find("Initials")))
            article_last = clean_person_name(text_or_none(author.find("LastName")))
            if is_author_match(article_first, article_last, first_name, last_name):
                matched = True
                break

        if not matched:
            continue

        seen_pubmed_ids.add(pmid)
        rows.append(
            {
                "hcp_id": hcp_id,
                "pubmed_id": pmid,
                "title": title,
                "journal": journal,
                "pub_year": pub_year,
                "citation_count": None,
                "doi": doi,
            }
        )

    return rows


def extract_records(articles: Sequence[ET.Element]) -> Tuple[Dict[str, HCPRecord], List[PublicationRecord]]:
    hcps_by_key: Dict[str, HCPRecord] = {}
    publication_records: List[PublicationRecord] = []

    for article in articles:
        pmid = text_or_none(article.find("./MedlineCitation/PMID"))
        if not pmid:
            continue

        title = text_or_none(article.find("./MedlineCitation/Article/ArticleTitle"))
        journal = text_or_none(article.find("./MedlineCitation/Article/Journal/Title"))
        pub_year = parse_pub_year(article)
        doi = parse_doi(article)

        author_nodes = article.findall("./MedlineCitation/Article/AuthorList/Author")
        if not author_nodes:
            continue

        for author in author_nodes:
            # Skip collaborators without structured names.
            if author.find("CollectiveName") is not None:
                continue

            first_name = clean_person_name(text_or_none(author.find("ForeName")) or text_or_none(author.find("Initials")))
            last_name = clean_person_name(text_or_none(author.find("LastName")))
            credentials = infer_credentials(text_or_none(author.find("Suffix")))

            aff_info_nodes = author.findall("./AffiliationInfo/Affiliation")
            affiliation = text_or_none(aff_info_nodes[0]) if aff_info_nodes else None
            institution, city, state, zip_code, country = parse_affiliation(affiliation)

            # If no meaningful name data exists, skip this author.
            if not first_name and not last_name:
                continue

            dedupe_key = build_dedupe_key(first_name, last_name, institution)
            if dedupe_key not in hcps_by_key:
                hcps_by_key[dedupe_key] = HCPRecord(
                    first_name=first_name,
                    last_name=last_name,
                    credentials=credentials,
                    institution=institution,
                    city=city,
                    state=state,
                    zip_code=zip_code,
                    country=country,
                    specialty=None,
                    subspecialty=None,
                    dedupe_key=dedupe_key,
                )

            publication_records.append(
                PublicationRecord(
                    pubmed_id=pmid,
                    title=title,
                    journal=journal,
                    pub_year=pub_year,
                    citation_count=None,  # Not available directly in E-utilities efetch response.
                    doi=doi,
                    hcp_dedupe_key=dedupe_key,
                )
            )

    return hcps_by_key, publication_records


def init_supabase() -> Client:
    supabase_url = get_required_env("SUPABASE_URL")
    supabase_key = get_required_env("SUPABASE_KEY")
    return create_client(supabase_url, supabase_key)


def upsert_hcps(supabase: Client, hcps: Sequence[HCPRecord]) -> Dict[str, str]:
    if not hcps:
        return {}

    # Upsert one-by-one to reliably get back each row id, even with nullable fields.
    id_map: Dict[str, str] = {}
    for hcp in hcps:
        row = {
            "npi_number": None,
            "first_name": hcp.first_name,
            "last_name": hcp.last_name,
            "credentials": hcp.credentials,
            "institution": hcp.institution,
            "city": hcp.city,
            "state": hcp.state,
            "zip_code": hcp.zip_code,
            "country": hcp.country,
            "specialty": hcp.specialty,
            "subspecialty": hcp.subspecialty,
            "opt_out": False,
            "is_claimed": False,
        }

        # Upsert using natural uniqueness proxies. Requires a matching unique constraint in DB.
        # If your table does not have this constraint, add one on (first_name, last_name, institution).
        try:
            response = (
                supabase.table("hcps")
                .upsert(
                    row,
                    on_conflict="first_name,last_name,institution",
                    returning="representation",
                )
                .execute()
            )
        except Exception as exc:
            raise RuntimeError(f"Failed to upsert HCP record {hcp.dedupe_key}: {exc}") from exc

        rows = response.data or []
        if rows and rows[0].get("id"):
            id_map[hcp.dedupe_key] = rows[0]["id"]

    # Fallback query for any missed IDs (e.g., if API config returns minimal response).
    missing = [hcp for hcp in hcps if hcp.dedupe_key not in id_map]
    for hcp in missing:
        try:
            query = (
                supabase.table("hcps")
                .select("id")
                .eq("first_name", hcp.first_name)
                .eq("last_name", hcp.last_name)
                .eq("institution", hcp.institution)
                .limit(1)
                .execute()
            )
            rows = query.data or []
            if rows:
                id_map[hcp.dedupe_key] = rows[0]["id"]
        except Exception as exc:
            raise RuntimeError(f"Failed to fetch HCP id for key {hcp.dedupe_key}: {exc}") from exc

    return id_map


def upsert_publications(
    supabase: Client,
    publication_records: Sequence[PublicationRecord],
    hcp_id_map: Dict[str, str],
) -> int:
    publication_rows = []
    for record in publication_records:
        hcp_id = hcp_id_map.get(record.hcp_dedupe_key)
        if not hcp_id:
            continue
        publication_rows.append(
            {
                "hcp_id": hcp_id,
                "pubmed_id": record.pubmed_id,
                "title": record.title,
                "journal": record.journal,
                "pub_year": record.pub_year,
                "citation_count": record.citation_count,
                "doi": record.doi,
            }
        )

    if not publication_rows:
        return 0

    try:
        # Upsert assumes unique constraint on (hcp_id, pubmed_id).
        supabase.table("publications").upsert(
            publication_rows,
            on_conflict="hcp_id,pubmed_id",
        ).execute()
    except Exception as exc:
        raise RuntimeError(f"Failed to upsert publication records: {exc}") from exc

    return len(publication_rows)


def fetch_hcps_with_low_publication_counts(
    supabase: Client,
    max_publications: int = 2,
) -> List[Dict[str, object]]:
    try:
        hcps_response = (
            supabase.table("hcps")
            .select("id,first_name,last_name")
            .execute()
        )
        pubs_response = (
            supabase.table("publications")
            .select("hcp_id,pubmed_id")
            .execute()
        )
    except Exception as exc:
        raise RuntimeError(f"Failed to load HCP/publication counts for second pass: {exc}") from exc

    pub_counts: Dict[str, int] = {}
    for row in pubs_response.data or []:
        hcp_id = row.get("hcp_id")
        if hcp_id:
            pub_counts[hcp_id] = pub_counts.get(hcp_id, 0) + 1

    low_pub_hcps: List[Dict[str, object]] = []
    for hcp in hcps_response.data or []:
        hcp_id = hcp.get("id")
        if not hcp_id:
            continue
        if pub_counts.get(hcp_id, 0) <= max_publications:
            low_pub_hcps.append(hcp)
    return low_pub_hcps


def run_author_enrichment_second_pass(
    supabase: Client,
    session: requests.Session,
    base_url: str,
    email: Optional[str],
    tool_name: str,
    per_call: int,
) -> int:
    """
    For HCPs with sparse publication history, fetch career-spanning author publications.
    """
    low_pub_hcps = fetch_hcps_with_low_publication_counts(supabase, max_publications=2)
    low_pub_hcps = low_pub_hcps[:200]
    if not low_pub_hcps:
        print("Second pass: no HCPs with fewer than 3 publications found.")
        return 0

    print(f"Second pass: found {len(low_pub_hcps)} HCPs with fewer than 3 publications.")
    total_upserted = 0
    for hcp in low_pub_hcps:
        hcp_id = hcp.get("id")
        first_name = clean_person_name(hcp.get("first_name"))
        last_name = clean_person_name(hcp.get("last_name"))
        if not hcp_id:
            continue

        author_query = build_author_query(first_name, last_name)
        if not author_query:
            continue

        try:
            pmids = pubmed_esearch_all(
                session=session,
                base_url=base_url,
                query=author_query,
                per_call=per_call,
                email=email,
                tool_name=tool_name,
            )
        except Exception as exc:
            print(f"Second pass warning: failed search for HCP {hcp_id}: {exc}")
            continue

        if not pmids:
            continue

        pmids = pmids[:50]

        try:
            articles = pubmed_efetch(
                session=session,
                base_url=base_url,
                pmids=pmids,
                email=email,
                tool_name=tool_name,
            )
            rows = extract_publication_rows_for_hcp(articles, hcp_id, first_name, last_name)
            if not rows:
                continue
            supabase.table("publications").upsert(
                rows,
                on_conflict="hcp_id,pubmed_id",
            ).execute()
            total_upserted += len(rows)
        except Exception as exc:
            print(f"Second pass warning: failed upsert for HCP {hcp_id}: {exc}")
            continue

    return total_upserted


def run_pipeline() -> None:
    base_url = os.getenv("PUBMED_API_BASE", "https://eutils.ncbi.nlm.nih.gov/entrez/eutils")
    tool_name = os.getenv("PUBMED_TOOL", "fieldmark_pubmed_pipeline")
    email = os.getenv("PUBMED_EMAIL")
    days_back = int(os.getenv("PUBMED_DAYS_BACK", "365"))
    max_results = int(os.getenv("PUBMED_MAX_RESULTS", "200"))
    per_call = int(os.getenv("PUBMED_RETMAX_PER_CALL", "100"))

    session = build_http_session()
    supabase = init_supabase()

    print("Searching PubMed...")
    pmids = pubmed_esearch(
        session=session,
        base_url=base_url,
        query=PUBMED_QUERY,
        days_back=days_back,
        max_results=max_results,
        per_call=per_call,
        email=email,
        tool_name=tool_name,
    )
    if not pmids:
        print("No PubMed results found for the specified query window.")
        return
    print(f"Found {len(pmids)} publication IDs.")

    print("Fetching publication details...")
    articles = pubmed_efetch(
        session=session,
        base_url=base_url,
        pmids=pmids,
        email=email,
        tool_name=tool_name,
    )
    if not articles:
        print("No article payloads returned by efetch.")
        return

    hcps_by_key, publication_records = extract_records(articles)
    unique_hcps = list(hcps_by_key.values())
    print(f"Extracted {len(unique_hcps)} unique HCP profiles and {len(publication_records)} author-publication links.")

    print("Upserting HCPs into Supabase...")
    hcp_id_map = upsert_hcps(supabase, unique_hcps)
    print(f"Mapped {len(hcp_id_map)} HCP keys to DB IDs.")

    print("Upserting publications into Supabase...")
    inserted_or_updated = upsert_publications(supabase, publication_records, hcp_id_map)
    print(f"Upserted {inserted_or_updated} publication rows.")

    print("Starting second pass author enrichment...")
    second_pass_count = run_author_enrichment_second_pass(
        supabase=supabase,
        session=session,
        base_url=base_url,
        email=email,
        tool_name=tool_name,
        per_call=per_call,
    )
    print(f"Second pass upserted {second_pass_count} publication rows.")
    print("Pipeline run completed.")


if __name__ == "__main__":
    try:
        run_pipeline()
    except Exception as error:
        print(f"[ERROR] Pipeline failed: {error}")
        raise
