"""
FieldMark — Step F: rebuild publication_authors from hcp_openalex_authors + publications.authorships.

Links each authorship to an HCP using OpenAlex author id clusters; disambiguates misattributed
clusters (multiple HCPs per openalex_author_id) via ROR, institution name, then country.

Requires SUPABASE_URL, SUPABASE_KEY (.env via python-dotenv optional).

Examples:
  python run_step_f_rebuild_publication_authors.py --confirm-wipe --dry-run
  python run_step_f_rebuild_publication_authors.py --confirm-wipe --limit 500
  python run_step_f_rebuild_publication_authors.py --no-wipe-first --dry-run
  python run_step_f_rebuild_publication_authors.py --resume-from-pub-id 98fcbdbb-08d7-4943-9d32-0962949804c6
"""

from __future__ import annotations

import argparse
import csv
import json
import os
import uuid
import re
import sys
import time
from collections import Counter
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any, Dict, Iterable, List, Optional, Sequence, Set, Tuple

from tqdm import tqdm

from dotenv import load_dotenv
from supabase import Client, create_client

import preview_step_b_matching as stepb

PUB_PAGE_SIZE = 150
STEP_F_RESUME_STATE_FILE = "step_f_resume_state.json"
JOIN_PAGE_SIZE = 1000
HCP_FETCH_CHUNK = 200
WIPE_DELETE_CHUNK = 75000
WIPE_SUB_BATCH = 500
PROGRESS_PUBS_EVERY = 5000
DEFAULT_INSERT_BATCH = 500

METHOD_UNIQUE = "step_f_unique_hcp"
METHOD_ROR = "step_f_misattributed_cluster_disambiguated_by_ror"
METHOD_INST = "step_f_misattributed_cluster_disambiguated_by_institution_name"
METHOD_COUNTRY = "step_f_misattributed_cluster_disambiguated_by_country"

ORPHAN_NO_SIGNALS = "no_ror_no_institution_no_country"
ORPHAN_ROR_NO_MATCH = "ror_no_match"
ORPHAN_INST_NO_MATCH = "institution_no_match"
ORPHAN_COUNTRY_NO_MATCH = "country_no_match"
ORPHAN_MULTI_COUNTRY = "multiple_hcps_match_country_no_other_disambiguator"


def _match_method_merge_rank(method: str) -> int:
    """Higher = preferred: unique HCP linkage beats cluster-disambiguated methods."""
    return 2 if method == METHOD_UNIQUE else 1


def _match_confidence_merge_rank(conf: str) -> int:
    if conf == "high":
        return 2
    if conf == "medium":
        return 1
    return 0


def _author_position_merge_rank(pos: str) -> int:
    """first and last both rank above middle."""
    p = str(pos or "").strip().lower()
    if p in ("first", "last"):
        return 2
    return 1


def _publication_author_dedup_merge_key(row: Dict[str, Any]) -> Tuple[int, int, int, int]:
    return (
        _match_method_merge_rank(str(row.get("match_method") or "")),
        _match_confidence_merge_rank(str(row.get("match_confidence") or "")),
        _author_position_merge_rank(str(row.get("author_position") or "")),
        1 if row.get("is_corresponding") else 0,
    )


def _prefer_dedup_candidate_over_incumbent(candidate: Dict[str, Any], incumbent: Dict[str, Any]) -> bool:
    """True if candidate strictly wins the merge (ties keep incumbent / first occurrence)."""
    return _publication_author_dedup_merge_key(candidate) > _publication_author_dedup_merge_key(incumbent)


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


def count_table(supabase: Client, table_name: str) -> int:
    r = supabase.table(table_name).select("*", count="exact", head=True).execute()
    return int(r.count or 0)


def count_table_retry(supabase: Client, table_name: str) -> int:
    """Exact count with retries; returns -1 if all attempts fail."""
    backoff = (2.0, 4.0, 8.0)
    for attempt in range(1, 5):
        try:
            return count_table(supabase, table_name)
        except Exception as exc:
            err_msg = str(exc).strip() or type(exc).__name__
            if attempt < 4:
                eprint(f"[retry] count_table('{table_name}') attempt {attempt}: {err_msg}")
                time.sleep(backoff[attempt - 1])
            else:
                eprint(f"[warn] count_table('{table_name}') failed after retries; continuing")
                return -1
    return -1


def count_publications_with_authorships(supabase: Client) -> int:
    r = (
        supabase.table("publications")
        .select("id", count="exact", head=True)
        .not_.is_("authorships", "null")
        .execute()
    )
    return int(r.count or 0)


def count_publications_with_authorships_retry(supabase: Client) -> int:
    """Count publications with non-null authorships; returns -1 if all attempts fail."""
    backoff = (2.0, 4.0, 8.0)
    for attempt in range(1, 5):
        try:
            return count_publications_with_authorships(supabase)
        except Exception as exc:
            err_msg = str(exc).strip() or type(exc).__name__
            if attempt < 4:
                eprint(f"[retry] count_publications_with_authorships() attempt {attempt}: {err_msg}")
                time.sleep(backoff[attempt - 1])
            else:
                eprint("[warn] count_publications_with_authorships() failed after retries; continuing")
                return -1
    return -1


def fmt_count(n: int) -> str:
    if n < 0:
        return "<count unavailable>"
    return f"{n:,}"


def fetch_publications_page(
    supabase: Client,
    last_after_id: Optional[str],
    *,
    page_size: int = PUB_PAGE_SIZE,
) -> List[Dict[str, Any]]:
    q = (
        supabase.table("publications")
        .select("id,authorships")
        .order("id")
        .limit(page_size)
    )
    if last_after_id is not None:
        q = q.gt("id", last_after_id)
    return q.execute().data or []


def fetch_publications_page_with_retries(
    supabase: Client,
    last_after_id: Optional[str],
    *,
    page_size: int = PUB_PAGE_SIZE,
) -> List[Dict[str, Any]]:
    """
    Fetch one publications page. Up to 3 retries (4 total attempts) with 10/20/40s backoff.
    On final failure, raises FetchPublicationsPageError with context for resume.
    """
    backoff = (10.0, 20.0, 40.0)
    last_exc: Optional[Exception] = None
    for attempt in range(4):
        try:
            return fetch_publications_page(supabase, last_after_id, page_size=page_size)
        except Exception as exc:
            last_exc = exc
            err_msg = str(exc).strip() or type(exc).__name__
            if attempt < 3:
                eprint(
                    f"[retry] publications page after id={last_after_id!s} attempt {attempt + 1}: {err_msg}"
                )
                time.sleep(backoff[attempt])
    raise FetchPublicationsPageError(last_after_id, last_exc)


class FetchPublicationsPageError(Exception):
    def __init__(self, last_after_id: Optional[str], cause: Optional[Exception]) -> None:
        self.last_after_id = last_after_id
        self.cause = cause
        msg = str(cause).strip() if cause else "unknown error"
        super().__init__(msg)


def write_step_f_resume_state_file(
    path: str,
    *,
    pubs_processed: int,
    last_completed_publication_id: Optional[str],
    pagination_after_id: Optional[str],
    rows_written: int,
    logical_rows: int,
    authorships_scanned: int,
    error_message: str,
) -> None:
    payload = {
        "saved_at_utc": datetime.now(timezone.utc).isoformat(),
        "pubs_processed_this_run": pubs_processed,
        "last_completed_publication_id": last_completed_publication_id,
        "pagination_cursor_after_id": pagination_after_id,
        "rows_written": rows_written,
        "logical_rows": logical_rows,
        "authorships_scanned": authorships_scanned,
        "error_message": error_message,
    }
    with open(path, "w", encoding="utf-8") as f:
        json.dump(payload, f, indent=2)
        f.write("\n")


def parse_authorships_json(value: Any) -> List[Dict[str, Any]]:
    if value is None:
        return []
    if isinstance(value, list):
        return [x for x in value if isinstance(x, dict)]
    if isinstance(value, str):
        try:
            parsed = json.loads(value)
            if isinstance(parsed, list):
                return [x for x in parsed if isinstance(x, dict)]
        except json.JSONDecodeError:
            return []
    return []


def normalize_openalex_author_id_from_authorship(raw: Any) -> str:
    return stepb.normalize_openalex_author_id(raw)


def normalize_institution_for_match(s: Optional[str]) -> str:
    if not s:
        return ""
    t = stepb.strip_ascii_diacritics(str(s).lower())
    for ch in ".,;:-_()[]{}":
        t = t.replace(ch, " ")
    t = re.sub(r"\s+", " ", t).strip()
    return t


def normalize_country_code(raw: Optional[str]) -> str:
    if not raw:
        return ""
    s = str(raw).strip().upper()
    if s == "USA" or s == "UNITED STATES":
        return "US"
    if len(s) == 2:
        return s
    return s[:2] if len(s) >= 2 else s


def hcp_country_codes(institution_country: Any, country: Any) -> Set[str]:
    out: Set[str] = set()
    for v in (institution_country, country):
        c = normalize_country_code(v)
        if c:
            out.add(c)
    return out


def rors_from_institution_text(institution: Optional[str]) -> Set[str]:
    out: Set[str] = set()
    if not institution:
        return out
    for m in re.finditer(r"ror\.org/([a-z0-9]{9})", str(institution).lower()):
        rid = stepb.normalize_ror(m.group(1))
        if rid:
            out.add(rid)
    return out


@dataclass
class HcpClusterMember:
    hcp_id: str
    institution: str
    institution_norm: str
    country_codes: Set[str]
    ror_ids: Set[str] = field(default_factory=set)


def extract_authorship_fields(entry: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    author = entry.get("author")
    if not isinstance(author, dict):
        return None
    oa = normalize_openalex_author_id_from_authorship(author.get("id"))
    if not oa:
        return None

    institutions = entry.get("institutions")
    institution_name = ""
    institution_ror_raw = ""
    country_code = ""
    if isinstance(institutions, list) and institutions:
        fi = institutions[0]
        if isinstance(fi, dict):
            n = fi.get("display_name")
            if isinstance(n, str) and n.strip():
                institution_name = n.strip()
            r = fi.get("ror")
            if isinstance(r, str) and r.strip():
                institution_ror_raw = r.strip()
            cc = fi.get("country_code")
            if isinstance(cc, str) and cc.strip():
                country_code = cc.strip()

    raw_aff = entry.get("raw_affiliation_strings")
    raw_str = ""
    if isinstance(raw_aff, list) and raw_aff:
        x = raw_aff[0]
        if isinstance(x, str) and x.strip():
            raw_str = x.strip()

    pos = entry.get("author_position")
    if pos not in ("first", "middle", "last"):
        ps = str(pos or "").strip().lower()
        pos = ps if ps in ("first", "middle", "last") else "middle"

    ic = entry.get("is_corresponding")
    if ic is None:
        ic = False
    elif not isinstance(ic, bool):
        ic = bool(ic)

    return {
        "openalex_author_id": oa,
        "author_position": pos,
        "is_corresponding": ic,
        "institution_name": institution_name,
        "institution_ror_norm": stepb.normalize_ror(institution_ror_raw) if institution_ror_raw else "",
        "country_code_norm": normalize_country_code(country_code),
        "affiliation_at_publication": institution_name or raw_str or "",
    }


def build_hcp_ror_index(member: HcpClusterMember) -> Set[str]:
    return set(member.ror_ids)


def country_filter(candidates: Sequence[HcpClusterMember], auth_country: str) -> List[HcpClusterMember]:
    if not auth_country:
        return list(candidates)
    return [c for c in candidates if auth_country in c.country_codes]


def disambiguate_cluster(
    cluster: Sequence[HcpClusterMember],
    auth: Dict[str, Any],
) -> Tuple[Optional[HcpClusterMember], Optional[str], str, str]:
    """
    Returns (winner, orphan_reason_or_none, match_method, match_confidence).
    orphan_reason set iff winner is None.
    """
    auth_ror = auth["institution_ror_norm"]
    auth_inst = normalize_institution_for_match(auth.get("institution_name") or "")
    auth_country = auth["country_code_norm"]

    has_ror = bool(auth_ror)
    has_inst = bool(auth_inst)
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
        # 0 ROR matches on cluster
        return None, ORPHAN_ROR_NO_MATCH, "", "none"

    # (b) No ROR on authorship — institution name
    if has_inst:
        m_inst = [c for c in cluster_list if auth_inst and c.institution_norm and auth_inst == c.institution_norm]
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

    # (c) Only country on authorship
    m_co = country_filter(cluster_list, auth_country)
    if len(m_co) == 1:
        return m_co[0], None, METHOD_COUNTRY, "medium"
    if len(m_co) == 0:
        return None, ORPHAN_COUNTRY_NO_MATCH, "", "none"
    return None, ORPHAN_MULTI_COUNTRY, "", "none"


def fetch_all_hcp_openalex_join_rows(supabase: Client) -> List[Dict[str, Any]]:
    rows: List[Dict[str, Any]] = []
    last_id: Optional[str] = None
    while True:
        q = (
            supabase.table("hcp_openalex_authors")
            .select("id,hcp_id,openalex_author_id")
            .order("id")
            .limit(JOIN_PAGE_SIZE)
        )
        if last_id is not None:
            q = q.gt("id", last_id)
        batch = q.execute().data or []
        if not batch:
            break
        rows.extend(batch)
        last_id = batch[-1].get("id")
        if not last_id or len(batch) < JOIN_PAGE_SIZE:
            break
    return rows


def fetch_hcps_by_ids(supabase: Client, ids: Sequence[str]) -> Dict[str, Dict[str, Any]]:
    out: Dict[str, Dict[str, Any]] = {}
    ids = [str(i) for i in ids if i]
    for i in range(0, len(ids), HCP_FETCH_CHUNK):
        chunk = ids[i : i + HCP_FETCH_CHUNK]
        rows = (
            supabase.table("hcps")
            .select("id,institution,openalex_institution_ror_id,country,institution_country")
            .in_("id", chunk)
            .execute()
            .data
            or []
        )
        for r in rows:
            hid = r.get("id")
            if hid:
                out[str(hid)] = r
    return out


def load_publications_with_existing_authors(supabase: Client) -> Set[str]:
    """
    Returns set of publication_ids that already have at least one publication_authors row.
    Used to skip already-linked publications when running in delta/append mode.
    """
    existing: Set[str] = set()
    last_id: Optional[str] = None
    while True:
        q = (
            supabase.table("publication_authors")
            .select("id,publication_id")
            .order("id")
            .limit(JOIN_PAGE_SIZE)
        )
        if last_id is not None:
            q = q.gt("id", last_id)
        batch = q.execute().data or []
        if not batch:
            break
        for row in batch:
            pid = row.get("publication_id")
            if pid:
                existing.add(str(pid))
        last_id = batch[-1].get("id")
        if not last_id or len(batch) < JOIN_PAGE_SIZE:
            break
    print(
        f"Loaded {len(existing):,} existing publication_ids with publication_authors rows; "
        "these will be skipped."
    )
    return existing


def build_linkage_indexes(
    supabase: Client,
) -> Tuple[Dict[str, List[HcpClusterMember]], Set[str], Counter[str]]:
    """
    Returns (oa_id -> cluster members, all_hcp_ids_in_join, method_counts_prealloc empty Counter).
    """
    join_rows = fetch_all_hcp_openalex_join_rows(supabase)
    hcp_ids = list({str(r["hcp_id"]) for r in join_rows if r.get("hcp_id")})
    hcp_by_id = fetch_hcps_by_ids(supabase, hcp_ids)

    by_oa: Dict[str, Dict[str, HcpClusterMember]] = {}
    for r in join_rows:
        oa = normalize_openalex_author_id_from_authorship(r.get("openalex_author_id"))
        hid = str(r.get("hcp_id") or "")
        if not oa or not hid:
            continue
        h = hcp_by_id.get(hid)
        if not h:
            continue
        inst = str(h.get("institution") or "").strip()
        inst_norm = normalize_institution_for_match(inst)
        cc = hcp_country_codes(h.get("institution_country"), h.get("country"))
        rors: Set[str] = set()
        rors |= rors_from_institution_text(inst)
        nr = stepb.normalize_ror(h.get("openalex_institution_ror_id"))
        if nr:
            rors.add(nr)

        member = HcpClusterMember(
            hcp_id=hid,
            institution=inst,
            institution_norm=inst_norm,
            country_codes=cc,
            ror_ids=rors,
        )
        if oa not in by_oa:
            by_oa[oa] = {}
        by_oa[oa][hid] = member

    by_oa_list: Dict[str, List[HcpClusterMember]] = {k: list(v.values()) for k, v in by_oa.items()}
    return by_oa_list, set(hcp_ids), Counter()


def wipe_publication_authors_batched(supabase: Client, errors: List[str]) -> int:
    """Delete all rows in publication_authors via id keyset chunks."""
    deleted_total = 0
    while True:
        rows = (
            supabase.table("publication_authors")
            .select("id")
            .order("id")
            .limit(WIPE_DELETE_CHUNK)
            .execute()
            .data
            or []
        )
        if not rows:
            break
        ids = [str(r["id"]) for r in rows if r.get("id")]
        for i in range(0, len(ids), WIPE_SUB_BATCH):
            chunk = ids[i : i + WIPE_SUB_BATCH]
            try:
                supabase.table("publication_authors").delete().in_("id", chunk).execute()
                deleted_total += len(chunk)
            except Exception as exc:
                errors.append(f"wipe delete: {exc}")
                eprint(errors[-1])
                raise
    return deleted_total


def verify_publication_authors_empty(supabase: Client) -> bool:
    n = count_table_retry(supabase, "publication_authors")
    if n < 0:
        eprint("[warn] verify_publication_authors_empty: count unavailable; treating as non-empty")
        return False
    return n == 0


def insert_publication_authors_batch(
    supabase: Client,
    rows: List[Dict[str, Any]],
    *,
    dry_run: bool,
    errors: List[str],
) -> int:
    if dry_run or not rows:
        return 0
    try:
        supabase.table("publication_authors").insert(rows).execute()
        return len(rows)
    except Exception as exc:
        eprint(f"[insert batch n={len(rows)}] {exc}")
        nok = 0
        for r in tqdm(rows, desc="insert fallback (per row)", unit="row"):
            try:
                supabase.table("publication_authors").insert([r]).execute()
                nok += 1
            except Exception as exc2:
                errors.append(
                    f"insert pub={r.get('publication_id')} hcp={r.get('hcp_id')} oa={r.get('openalex_author_id')}: {exc2}"
                )
                eprint("[insert]", errors[-1])
        return nok


def maybe_write_orphan_audit(
    supabase: Client,
    table_exists_flag: bool,
    rows: List[Dict[str, Any]],
    *,
    dry_run: bool,
    errors: List[str],
) -> int:
    if dry_run or not table_exists_flag or not rows:
        return 0
    n = 0
    for r in rows:
        try:
            supabase.table("orphaned_authorships_audit").insert(r).execute()
            n += 1
        except Exception as exc:
            errors.append(f"orphan audit insert: {exc}")
            eprint(errors[-1])
            break
    rows.clear()
    return n


def parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser(
        description="Step F: rebuild publication_authors from joins + publications.authorships.",
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    p.add_argument("--dry-run", action="store_true", help="Compute only; no wipe/insert")
    p.add_argument("--limit", type=int, default=None, metavar="N", help="Process first N publications only")
    p.add_argument("--csv-also", metavar="PATH", default=None, help="CSV of each attribution")
    p.add_argument("--batch-size", type=int, default=DEFAULT_INSERT_BATCH, help="Rows per publication_authors insert")
    p.add_argument(
        "--no-wipe-first",
        action="store_true",
        help="Do not wipe publication_authors before insert (append mode; default is wipe)",
    )
    p.add_argument(
        "--confirm-wipe",
        action="store_true",
        help="Required when wiping (default behavior): confirms intentional delete of publication_authors",
    )
    p.add_argument(
        "--resume-from-pub-id",
        default=None,
        metavar="UUID",
        help=(
            "Resume after this publication id (pagination uses id > UUID). Skips wipe (append mode). "
            "Use the last processed publication id from progress output or from step_f_resume_state.json."
        ),
    )
    p.add_argument(
        "--skip-existing",
        action="store_true",
        help=(
            "Skip publications that already have publication_authors rows. "
            "Use with --no-wipe-first for delta runs against newly-ingested papers."
        ),
    )
    return p.parse_args()


def main() -> None:
    args = parse_args()
    resume_from: Optional[str] = None
    if args.resume_from_pub_id:
        resume_from = args.resume_from_pub_id.strip()
        if not resume_from:
            raise SystemExit("--resume-from-pub-id cannot be empty")
        try:
            uuid.UUID(resume_from)
        except ValueError:
            raise SystemExit("--resume-from-pub-id must be a valid UUID")

    wipe_first = not args.no_wipe_first
    if resume_from is not None:
        if wipe_first:
            print(
                "[resume] --resume-from-pub-id: skipping wipe (append mode; same as --no-wipe-first).",
                flush=True,
            )
        wipe_first = False

    if args.skip_existing and wipe_first:
        print(
            "[skip-existing] --skip-existing implies append mode; disabling wipe.",
            flush=True,
        )
        wipe_first = False

    if args.limit is not None and args.limit < 1:
        raise SystemExit("--limit N requires N >= 1")
    if args.batch_size < 1:
        raise SystemExit("--batch-size must be >= 1")

    load_dotenv()
    supabase = init_supabase()

    for tbl in ("hcp_openalex_authors", "publications", "publication_authors", "hcps"):
        if not table_exists(supabase, tbl):
            eprint(f"Missing table: {tbl}")
            raise SystemExit(1)

    orphan_audit_exists = table_exists(supabase, "orphaned_authorships_audit")

    print("Pre-flight counts...")
    n_join = count_table_retry(supabase, "hcp_openalex_authors")
    n_hcps = count_table_retry(supabase, "hcps")
    n_pubs = count_table_retry(supabase, "publications")
    n_pubs_auth = count_publications_with_authorships_retry(supabase)
    n_pubauth = count_table_retry(supabase, "publication_authors")

    print(f"  hcps: {fmt_count(n_hcps)}")
    print(f"  hcp_openalex_authors: {fmt_count(n_join)}")
    print(f"  publications: {fmt_count(n_pubs)}")
    print(f"  publications with authorships IS NOT NULL: {fmt_count(n_pubs_auth)}")
    print(f"  publication_authors (current): {fmt_count(n_pubauth)}")

    if n_join == 0:
        eprint("hcp_openalex_authors is empty. Complete Step B/C first.")
        raise SystemExit(1)
    if n_join < 0:
        eprint("[warn] hcp_openalex_authors count unavailable; proceeding (join table was readable in table_exists).")

    if n_pubs >= 0 and n_pubs_auth >= 0 and n_pubs_auth < max(1, int(n_pubs * 0.5)):
        eprint(
            f"Warning: only {n_pubs_auth:,} publications have authorships "
            f"({100.0 * n_pubs_auth / max(n_pubs, 1):.1f}% of all). Expected enrichment to be mostly complete."
        )
    elif n_pubs < 0 or n_pubs_auth < 0:
        eprint("[warn] Skipping publications vs authorships ratio check (one or more counts unavailable).")

    if wipe_first and not args.confirm_wipe and not args.dry_run:
        if n_pubauth >= 0:
            print(
                f"\nRefusing to wipe: publication_authors currently has {n_pubauth:,} row(s).\n"
                "Re-run with --confirm-wipe to allow delete + rebuild, or use --no-wipe-first to append.\n"
                "Use --dry-run to simulate without writes (no wipe performed)."
            )
        else:
            print(
                "\nRefusing to wipe: publication_authors row count could not be fetched from the API.\n"
                "Re-run with --confirm-wipe to allow delete + rebuild anyway, or use --no-wipe-first to append.\n"
                "Use --dry-run to simulate without writes (no wipe performed)."
            )
        raise SystemExit(1)

    errors: List[str] = []
    t0 = time.perf_counter()
    created_at = datetime.now(timezone.utc).isoformat()

    if wipe_first and args.confirm_wipe and not args.dry_run:
        print("\nWiping publication_authors (batched)...")
        wd = wipe_publication_authors_batched(supabase, errors)
        print(f"  Delete operations removed up to {wd:,} row id(s) (batched).")
        if not verify_publication_authors_empty(supabase):
            left = count_table_retry(supabase, "publication_authors")
            if left < 0:
                eprint("Wipe incomplete: could not verify row count after wipe (count API failed).")
            else:
                eprint(f"Wipe incomplete: {left:,} rows remain.")
            raise SystemExit(1)
        print("  Verified publication_authors is empty.")
    elif wipe_first and args.dry_run:
        print("\n[DRY-RUN] Would wipe publication_authors (--confirm-wipe honored only for live wipe).")

    print("\nLoading linkage index (hcp_openalex_authors + hcps)...")
    t_idx = time.perf_counter()
    by_oa, all_join_hcp_ids, _ = build_linkage_indexes(supabase)
    n_keys = len(by_oa)
    n_mis = sum(1 for v in by_oa.values() if len(v) > 1)
    print(f"  Distinct openalex_author_id keys: {n_keys:,} (multi-HCP clusters: {n_mis:,})")
    print(f"  HCPs appearing in join table: {len(all_join_hcp_ids):,}")
    print(f"  Index build: {time.perf_counter() - t_idx:.1f}s")

    if resume_from:
        print(f"\nResume: publications pagination starts after id > {resume_from}", flush=True)

    existing_pub_ids: Set[str] = set()
    if args.skip_existing:
        print("\nLoading publication_ids with existing publication_authors rows (delta mode)...")
        existing_pub_ids = load_publications_with_existing_authors(supabase)
        print(f"  Found {len(existing_pub_ids):,} publications already linked; these will be skipped.")

    method_counts: Counter[str] = Counter()
    orphan_reasons: Counter[str] = Counter()
    authorships_scanned = 0
    rows_written = 0
    logical_rows = 0
    hcps_with_row: Set[str] = set()
    buffer: List[Dict[str, Any]] = []
    csv_buffer: List[Dict[str, Any]] = []
    orphan_audit_buf: List[Dict[str, Any]] = []

    total_pubs_target = args.limit if args.limit is not None else (n_pubs if n_pubs >= 0 else 230_000)
    tot = total_pubs_target

    pubs_processed = 0
    pubs_skipped_existing = 0
    last_pub_id: Optional[str] = resume_from
    last_completed_pub_id: Optional[str] = None

    def flush_buffer() -> None:
        nonlocal rows_written, buffer
        if not buffer:
            return
        rows_written += insert_publication_authors_batch(supabase, buffer, dry_run=args.dry_run, errors=errors)
        buffer = []

    while True:
        try:
            batch = fetch_publications_page_with_retries(
                supabase, last_pub_id, page_size=PUB_PAGE_SIZE
            )
        except FetchPublicationsPageError as exc:
            flush_buffer()
            if orphan_audit_buf:
                maybe_write_orphan_audit(
                    supabase, orphan_audit_exists, orphan_audit_buf, dry_run=args.dry_run, errors=errors
                )
            err_detail = str(exc.cause).strip() if exc.cause else str(exc)
            write_step_f_resume_state_file(
                STEP_F_RESUME_STATE_FILE,
                pubs_processed=pubs_processed,
                last_completed_publication_id=last_completed_pub_id,
                pagination_after_id=last_pub_id,
                rows_written=rows_written,
                logical_rows=logical_rows,
                authorships_scanned=authorships_scanned,
                error_message=err_detail,
            )
            print("\nPublication page fetch failed after retries.", flush=True)
            abs_state = os.path.abspath(STEP_F_RESUME_STATE_FILE)
            print(f"Saved state to {abs_state}", flush=True)
            rcp = last_completed_pub_id
            if rcp:
                print(
                    "\nRe-run with:\n"
                    f"  python run_step_f_rebuild_publication_authors.py --resume-from-pub-id {rcp}",
                    flush=True,
                )
            else:
                print(
                    f"\nNo completed publication id recorded in this run yet; inspect {abs_state} "
                    "or use the last checkpoint line from a prior run.",
                    flush=True,
                )
            raise SystemExit(1)

        if not batch:
            break

        for pub in tqdm(batch, desc="processing publications", unit="pub"):
            if args.limit is not None and pubs_processed >= args.limit:
                break
            pubs_processed += 1
            pub_id = str(pub.get("id") or "")
            if not pub_id:
                continue

            if args.skip_existing and pub_id in existing_pub_ids:
                pubs_skipped_existing += 1
                continue

            authorships = parse_authorships_json(pub.get("authorships"))
            # One row per (publication_id, hcp_id): merge duplicate authorships before insert.
            pub_author_dedup: Dict[str, Dict[str, Any]] = {}
            for entry in authorships:
                authorships_scanned += 1
                parsed = extract_authorship_fields(entry)
                if not parsed:
                    continue

                oa = parsed["openalex_author_id"]
                cluster = by_oa.get(oa)
                if not cluster:
                    continue

                winner: Optional[HcpClusterMember] = None
                method = METHOD_UNIQUE
                confidence = "high"
                orphan_reason: Optional[str] = None

                if len(cluster) == 1:
                    winner = cluster[0]
                    method = METHOD_UNIQUE
                    confidence = "high"
                else:
                    winner, orphan_reason, method, confidence = disambiguate_cluster(cluster, parsed)

                if winner is None:
                    if orphan_reason:
                        orphan_reasons[orphan_reason] += 1
                    if orphan_audit_exists:
                        orphan_audit_buf.append(
                            {
                                "publication_id": pub_id,
                                "openalex_author_id": oa,
                                "reason": orphan_reason or "unknown",
                            }
                        )
                    continue

                method_counts[method] += 1
                logical_rows += 1
                hcps_with_row.add(winner.hcp_id)

                row = {
                    "publication_id": pub_id,
                    "hcp_id": winner.hcp_id,
                    "author_position": parsed["author_position"],
                    "is_corresponding": parsed["is_corresponding"],
                    "openalex_author_id": oa,
                    "affiliation_at_publication": (parsed["affiliation_at_publication"] or "")[:8000],
                    "match_method": method,
                    "match_confidence": confidence,
                    "created_at": created_at,
                }
                hid = winner.hcp_id
                aff0 = (parsed["affiliation_at_publication"] or "")[:8000]
                if hid not in pub_author_dedup:
                    pub_author_dedup[hid] = {"first_oa": oa, "first_affil": aff0, "best": row}
                else:
                    st = pub_author_dedup[hid]
                    if _prefer_dedup_candidate_over_incumbent(row, st["best"]):
                        merged = dict(row)
                        merged["openalex_author_id"] = st["first_oa"]
                        merged["affiliation_at_publication"] = st["first_affil"]
                        st["best"] = merged

            for st in pub_author_dedup.values():
                out_row = dict(st["best"])
                out_row["openalex_author_id"] = st["first_oa"]
                out_row["affiliation_at_publication"] = st["first_affil"]
                buffer.append(out_row)

                if args.csv_also:
                    csv_buffer.append({**out_row, "orphan_reason": ""})

                if len(buffer) >= args.batch_size:
                    flush_buffer()

            last_completed_pub_id = pub_id

            if orphan_audit_buf and len(orphan_audit_buf) >= 200:
                maybe_write_orphan_audit(
                    supabase, orphan_audit_exists, orphan_audit_buf, dry_run=args.dry_run, errors=errors
                )
                orphan_audit_buf = []

            if pubs_processed % PROGRESS_PUBS_EVERY == 0:
                elapsed = time.perf_counter() - t0
                rate = pubs_processed / elapsed if elapsed > 0 else 0.0
                eta_s = (tot - pubs_processed) / rate if rate > 0 and tot > pubs_processed else 0.0
                orphans = sum(orphan_reasons.values())
                ts = datetime.now().strftime("%H:%M:%S")
                would = logical_rows if args.dry_run else rows_written
                print(
                    f"[{ts}] Pubs {pubs_processed}/{tot} | authorships processed {authorships_scanned:,} | "
                    f"rows {'would write' if args.dry_run else 'written'} {would:,} | orphaned {orphans:,} | rate {rate:.2f}/s | "
                    f"ETA {eta_s / 60.0:.1f}m",
                    flush=True,
                )
                if last_completed_pub_id:
                    print(f"last_pub_id: {last_completed_pub_id}", flush=True)

        last_pub_id = str(batch[-1]["id"]) if batch[-1].get("id") else None
        if args.limit is not None and pubs_processed >= args.limit:
            break
        if not last_pub_id or len(batch) < PUB_PAGE_SIZE:
            break

    flush_buffer()
    if orphan_audit_buf:
        maybe_write_orphan_audit(supabase, orphan_audit_exists, orphan_audit_buf, dry_run=args.dry_run, errors=errors)

    if pubs_processed > 0 and pubs_processed % PROGRESS_PUBS_EVERY != 0:
        elapsed = time.perf_counter() - t0
        rate = pubs_processed / elapsed if elapsed > 0 else 0.0
        orphans = sum(orphan_reasons.values())
        ts = datetime.now().strftime("%H:%M:%S")
        would = logical_rows if args.dry_run else rows_written
        print(
            f"[{ts}] Pubs {pubs_processed}/{tot} (final) | authorships processed {authorships_scanned:,} | "
            f"rows {'would write' if args.dry_run else 'written'} {would:,} | orphaned {orphans:,} | rate {rate:.2f}/s",
            flush=True,
        )
        if last_completed_pub_id:
            print(f"last_pub_id: {last_completed_pub_id}", flush=True)

    if args.csv_also and csv_buffer:
        fieldnames = list(csv_buffer[0].keys())
        with open(args.csv_also, "w", newline="", encoding="utf-8") as f:
            w = csv.DictWriter(f, fieldnames=fieldnames)
            w.writeheader()
            for r in csv_buffer:
                w.writerow({k: r.get(k, "") for k in fieldnames})
        print(f"\nCSV written: {args.csv_also}")

    elapsed = time.perf_counter() - t0
    hcps_with_zero = len(all_join_hcp_ids - hcps_with_row)

    print("\n" + "=" * 72)
    print("STEP F - SUMMARY")
    print("=" * 72)
    print(f"Mode: {'DRY-RUN' if args.dry_run else 'LIVE'} | wipe_first={wipe_first}" + (f" | resume_from={resume_from}" if resume_from else ""))
    print(f"Total publications processed: {pubs_processed:,}")
    if args.skip_existing:
        print(f"Publications skipped (already linked): {pubs_skipped_existing:,}")
    print(f"Total authorship entries scanned: {authorships_scanned:,}")
    print("publication_authors rows written (by match_method):")
    for k in (METHOD_UNIQUE, METHOD_ROR, METHOD_INST, METHOD_COUNTRY):
        print(f"  {k}: {method_counts.get(k, 0):,}")
    print(f"  (total rows inserted): {rows_written:,}")
    if args.dry_run:
        print(f"  (dry-run logical attributions): {logical_rows:,}")
    print("Orphaned authorship entries (cluster disambiguation failed):")
    orphans_total = sum(orphan_reasons.values())
    print(f"  Total: {orphans_total:,}")
    for reason in (
        ORPHAN_NO_SIGNALS,
        ORPHAN_ROR_NO_MATCH,
        ORPHAN_INST_NO_MATCH,
        ORPHAN_COUNTRY_NO_MATCH,
        ORPHAN_MULTI_COUNTRY,
    ):
        if orphan_reasons.get(reason, 0):
            print(f"  {reason}: {orphan_reasons[reason]:,}")
    print(f"HCPs with at least one publication_authors row: {len(hcps_with_row):,}")
    print(f"HCPs in join table with zero publication_authors rows this run: {hcps_with_zero:,}")
    print(f"Errors logged: {len(errors):,}")
    print(f"Runtime: {elapsed:.1f}s ({elapsed / 60.0:.2f} min)")
    print("\nVerification queries:")
    print("SELECT match_method, COUNT(*) FROM publication_authors GROUP BY match_method ORDER BY COUNT(*) DESC;")
    print("SELECT match_confidence, COUNT(*) FROM publication_authors GROUP BY match_confidence ORDER BY COUNT(*) DESC;")
    print("SELECT COUNT(*) FROM publication_authors;")
    print("SELECT COUNT(DISTINCT hcp_id) FROM publication_authors;")
    print("=" * 72)

    if errors:
        print("\nFirst errors:")
        for e in errors[:20]:
            print(f"  {e}")


if __name__ == "__main__":
    main()
