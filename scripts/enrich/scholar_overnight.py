from __future__ import annotations

"""
Overnight Scholar metrics backfill for the consolidated cohort.

Selects HCPs with scholar_h_index IS NULL and total_career_pubs >= 5,
ordered by publication footprint (high first, nulls last). Uses the same
ScraperAPI + BeautifulSoup approach as scholar_enrichment.py, but requires
an affiliation / institution match on the Scholar search result before
accepting a profile (reduces false positives on common names).

Writes only: scholar_h_index, scholar_citations_total, scholar_i10_index.

Environment: SUPABASE_URL, SUPABASE_KEY, SCRAPER_API_KEY; optional SCHOLAR_SLEEP_SECONDS.
"""

import argparse
import json
import logging
import os
import re
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional, Set, Tuple
from urllib.parse import urljoin, quote

import requests
from bs4 import BeautifulSoup
from dotenv import load_dotenv
from supabase import Client

from scholar_enrichment import (
    SCRAPERAPI_ENDPOINT,
    get_required_env,
    init_supabase,
    normalize_name,
    parse_profile_metrics,
)

CHECKPOINT_FILENAME = "scholar_overnight_checkpoint.json"
PAGE_SIZE = 500
CHECKPOINT_EVERY = 50
PROGRESS_EVERY = 50
# Default sleep after load_dotenv() in main() — Scholar aggressively rate-limits (see scholar_enrichment).
DEFAULT_SLEEP_SECONDS = 7.0
REQUEST_TIMEOUT = (8, 45)

logging.basicConfig(level=logging.INFO, format="%(message)s")
log = logging.getLogger("scholar_overnight")


def normalize_institution(value: Optional[str]) -> str:
    if not value:
        return ""
    t = str(value).lower()
    t = re.sub(r"[^a-z0-9\s&]", " ", t)
    return " ".join(t.split())


def affiliation_from_author_card(card: Any) -> str:
    """Best-effort affiliation line from a Scholar author search card."""
    for sel in (".gs_ai_em", ".gs_ai_c", ".gs_ai_d", ".gs_ai_abs", ".gs_ai_int"):
        el = card.select_one(sel)
        if el:
            text = el.get_text(" ", strip=True)
            if text and len(text) > 3:
                return text
    # Fallback: all text after stripping the profile link line
    link = card.select_one("a[href*='/citations?user=']")
    if link:
        link.extract()
    return card.get_text(" ", strip=True)


def institution_matches(hcp_institution: Optional[str], scholar_affiliation: str) -> bool:
    if not hcp_institution or not str(hcp_institution).strip():
        return False
    if not scholar_affiliation or not scholar_affiliation.strip():
        return False
    h = normalize_institution(hcp_institution)
    a = normalize_institution(scholar_affiliation)
    if not h or not a:
        return False
    if len(h) >= 5 and h in a:
        return True
    if len(h) >= 5 and a in h:
        return True
    hw = {w for w in h.split() if len(w) > 2}
    aw = set(a.split())
    if not hw:
        return False
    overlap = hw & aw
    if len(overlap) >= 2:
        return True
    if len(overlap) == 1 and len(hw) == 1:
        return True
    return len(overlap) / max(len(hw), 1) >= 0.5


def find_profile_href_by_name_and_institution(
    search_html: str,
    first_name: str,
    last_name: str,
    institution_short: Optional[str],
) -> Tuple[Optional[str], str]:
    """
    Returns (profile_href, reason). Requires institution_short on HCP for a positive match.
    """
    soup = BeautifulSoup(search_html, "html.parser")
    f = normalize_name(first_name)
    l = normalize_name(last_name)
    if not f or not l:
        return None, "missing_hcp_name"

    if not (institution_short or "").strip():
        return None, "missing_hcp_institution"

    name_hits: List[Tuple[str, str]] = []
    for card in soup.select(".gsc_1usr"):
        link = card.select_one("a[href*='/citations?user=']")
        if not link or not link.get("href"):
            continue
        candidate_name = normalize_name(link.get_text(" ", strip=True))
        if f not in candidate_name or l not in candidate_name:
            continue
        aff = affiliation_from_author_card(card)
        name_hits.append((link["href"], aff))

    if not name_hits:
        return None, "no_scholar_name_match"

    inst_matches: Dict[str, str] = {}
    for href, aff in name_hits:
        if institution_matches(institution_short, aff):
            inst_matches[href] = aff

    if len(inst_matches) == 1:
        return next(iter(inst_matches)), "matched_unique_institution"
    if len(inst_matches) == 0:
        return None, "no_institution_match"
    return None, "ambiguous_multiple_profiles"


def scraperapi_fetch_html(scraper_api_key: str, target_url: str) -> Optional[str]:
    try:
        response = requests.get(
            SCRAPERAPI_ENDPOINT,
            params={"api_key": scraper_api_key, "url": target_url},
            timeout=REQUEST_TIMEOUT,
        )
        response.raise_for_status()
        return response.text
    except requests.RequestException:
        return None


def scholar_lookup_with_institution(
    first_name: str,
    last_name: str,
    institution_short: Optional[str],
    scraper_api_key: str,
    sleep_seconds: float,
) -> Tuple[Optional[Dict[str, Any]], str]:
    """
    Search Scholar → require institution match on result card → fetch profile metrics.
    Sleeps after each HTTP call to reduce blocking (same idea as aggressive throttling).
    """
    query = quote(f"{first_name} {last_name}".strip())
    search_url = f"https://scholar.google.com/scholar?q={query}&as_sdt=0%2C5"
    search_html = scraperapi_fetch_html(scraper_api_key, search_url)
    time.sleep(sleep_seconds)
    if not search_html:
        return None, "search_fetch_failed"

    href, reason = find_profile_href_by_name_and_institution(
        search_html, first_name, last_name, institution_short
    )
    if not href:
        return None, reason

    profile_url = urljoin("https://scholar.google.com", href)
    profile_html = scraperapi_fetch_html(scraper_api_key, profile_url)
    time.sleep(sleep_seconds)
    if not profile_html:
        return None, "profile_fetch_failed"

    metrics = parse_profile_metrics(profile_html)
    if (
        metrics.get("scholar_h_index") is None
        and metrics.get("scholar_citations_total") is None
        and metrics.get("scholar_i10_index") is None
    ):
        return None, "no_metrics_on_profile"

    return (
        {
            "scholar_h_index": metrics.get("scholar_h_index"),
            "scholar_citations_total": metrics.get("scholar_citations_total"),
            "scholar_i10_index": metrics.get("scholar_i10_index"),
        },
        "ok",
    )


def load_checkpoint(path: Path) -> Set[str]:
    if not path.is_file():
        return set()
    try:
        with path.open("r", encoding="utf-8") as f:
            data = json.load(f)
    except (json.JSONDecodeError, OSError) as exc:
        log.warning("Could not read checkpoint %s: %s", path, exc)
        return set()
    ids = data.get("processed_ids")
    if isinstance(ids, list):
        return {str(x) for x in ids if x is not None}
    return set()


def save_checkpoint(path: Path, processed_ids: Set[str]) -> None:
    payload = {"processed_ids": sorted(processed_ids), "saved_at": datetime.now(timezone.utc).isoformat()}
    try:
        with path.open("w", encoding="utf-8") as f:
            json.dump(payload, f, indent=0)
    except OSError as exc:
        log.warning("Failed to write checkpoint %s: %s", path, exc)


def fetch_overnight_cohort(supabase: Client) -> List[Dict[str, Any]]:
    rows: List[Dict[str, Any]] = []
    offset = 0
    while True:
        try:
            response = (
                supabase.table("hcps")
                .select("id,first_name,last_name,institution_short,total_career_pubs,scholar_h_index")
                .is_("scholar_h_index", "null")
                .gte("total_career_pubs", 5)
                .range(offset, offset + PAGE_SIZE - 1)
                .execute()
            )
        except Exception as exc:
            raise RuntimeError(f"Failed loading hcps at offset {offset}: {exc}") from exc
        batch = response.data or []
        if not batch:
            break
        rows.extend(batch)
        if len(batch) < PAGE_SIZE:
            break
        offset += PAGE_SIZE

    def sort_key(r: Dict[str, Any]) -> Tuple[int, float]:
        pubs = r.get("total_career_pubs")
        null_group = 1 if pubs is None else 0
        pub_val = float(pubs) if pubs is not None else 0.0
        return (null_group, -pub_val)

    rows.sort(key=sort_key)
    return rows


def update_scholar_fields_only(
    supabase: Client,
    hcp_id: str,
    scholar_h_index: Optional[int],
    scholar_citations_total: Optional[int],
    scholar_i10_index: Optional[int],
) -> bool:
    payload = {
        "scholar_h_index": scholar_h_index,
        "scholar_citations_total": scholar_citations_total,
        "scholar_i10_index": scholar_i10_index,
    }
    try:
        supabase.table("hcps").update(payload).eq("id", hcp_id).is_("scholar_h_index", "null").execute()
        return True
    except Exception as exc:
        log.warning("DB update failed hcp_id=%s: %s", hcp_id, exc)
        return False


def run_overnight(
    checkpoint_path: Path,
    reset_checkpoint: bool,
    sleep_seconds: float,
) -> None:
    scraper_api_key = get_required_env("SCRAPER_API_KEY")
    supabase = init_supabase()

    if sleep_seconds < 5.0:
        log.warning(
            "SCHOLAR_SLEEP_SECONDS=%s is below 5s; Scholar often blocks aggressive clients. Using 5s minimum.",
            sleep_seconds,
        )
        sleep_seconds = 5.0
    if sleep_seconds > 10.0:
        log.info("Using %.1fs between HTTP calls (conservative for long overnight runs).", sleep_seconds)

    if reset_checkpoint and checkpoint_path.is_file():
        checkpoint_path.unlink(missing_ok=True)
        log.info("Removed checkpoint %s.", checkpoint_path)

    processed_ids = load_checkpoint(checkpoint_path)
    log.info("Checkpoint: %s HCP ids already processed.", len(processed_ids))

    cohort = fetch_overnight_cohort(supabase)
    queue = [r for r in cohort if r.get("id") and str(r["id"]) not in processed_ids]
    log.info("Queued %s HCPs (scholar_h_index null, total_career_pubs >= 5).", len(queue))

    matched = 0
    skipped = 0
    failed = 0
    since_ckpt = 0
    processed = 0
    t0 = time.time()

    for hcp in queue:
        hcp_id = str(hcp["id"])
        first = str(hcp.get("first_name") or "").strip()
        last = str(hcp.get("last_name") or "").strip()
        inst = hcp.get("institution_short")

        if not first or not last:
            skipped += 1
            log.info("skip hcp_id=%s reason=missing_name", hcp_id)
        else:
            payload, reason = scholar_lookup_with_institution(
                first, last, inst if isinstance(inst, str) else None, scraper_api_key, sleep_seconds
            )
            if payload is None:
                if reason in ("search_fetch_failed", "profile_fetch_failed"):
                    failed += 1
                else:
                    skipped += 1
                log.info("hcp_id=%s %s %s -> %s", hcp_id, first, last, reason)
            else:
                ok = update_scholar_fields_only(
                    supabase,
                    hcp_id,
                    payload.get("scholar_h_index"),
                    payload.get("scholar_citations_total"),
                    payload.get("scholar_i10_index"),
                )
                if ok:
                    matched += 1
                    log.info(
                        "matched hcp_id=%s h=%s cites=%s i10=%s",
                        hcp_id,
                        payload.get("scholar_h_index"),
                        payload.get("scholar_citations_total"),
                        payload.get("scholar_i10_index"),
                    )
                else:
                    failed += 1

        processed_ids.add(hcp_id)
        since_ckpt += 1
        processed += 1

        if since_ckpt >= CHECKPOINT_EVERY:
            save_checkpoint(checkpoint_path, processed_ids)
            since_ckpt = 0

        if processed % PROGRESS_EVERY == 0:
            elapsed = time.time() - t0
            log.info(
                "Progress: processed=%s matched=%s skipped=%s failed=%s elapsed_min=%.1f",
                processed,
                matched,
                skipped,
                failed,
                elapsed / 60.0,
            )

    if since_ckpt > 0:
        save_checkpoint(checkpoint_path, processed_ids)

    log.info(
        "Final: processed=%s matched=%s skipped=%s failed=%s (checkpoint=%s)",
        processed,
        matched,
        skipped,
        failed,
        checkpoint_path,
    )


def main() -> None:
    load_dotenv()
    parser = argparse.ArgumentParser(description="Overnight Scholar h-index enrichment (institution-gated).")
    parser.add_argument(
        "--checkpoint",
        type=Path,
        default=Path(CHECKPOINT_FILENAME),
        help=f"Checkpoint JSON (default: {CHECKPOINT_FILENAME})",
    )
    parser.add_argument("--reset-checkpoint", action="store_true", help="Delete checkpoint before run.")
    parser.add_argument(
        "--sleep-seconds",
        type=float,
        default=None,
        help="Seconds to sleep after each ScraperAPI HTTP call (default: env SCHOLAR_SLEEP_SECONDS or 7.0).",
    )
    args = parser.parse_args()
    sleep_val = (
        args.sleep_seconds
        if args.sleep_seconds is not None
        else float(os.getenv("SCHOLAR_SLEEP_SECONDS", str(DEFAULT_SLEEP_SECONDS)))
    )
    run_overnight(args.checkpoint.resolve(), args.reset_checkpoint, sleep_val)


if __name__ == "__main__":
    try:
        main()
    except Exception as err:
        log.exception("scholar_overnight failed: %s", err)
        raise
