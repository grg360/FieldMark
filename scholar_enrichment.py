from __future__ import annotations

import json
import os
import re
import time
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Dict, List, Optional, Set, Tuple
from urllib.parse import quote, urljoin

import requests
from bs4 import BeautifulSoup
from dotenv import load_dotenv
from supabase import Client, create_client

# Requires: pip install beautifulsoup4

CHECKPOINT_FILE = "scholar_checkpoint.json"
SUPABASE_PAGE_SIZE = 100
PROGRESS_EVERY = 50
CHECKPOINT_EVERY = 200
SCRAPERAPI_ENDPOINT = "https://api.scraperapi.com"


@dataclass
class Stats:
    matched: int = 0
    skipped: int = 0
    failed: int = 0


def get_required_env(name: str) -> str:
    value = os.getenv(name)
    if not value:
        raise EnvironmentError(f"Missing required environment variable: {name}")
    return value


def init_supabase() -> Client:
    return create_client(get_required_env("SUPABASE_URL"), get_required_env("SUPABASE_KEY"))


def normalize_name(value: Optional[str]) -> str:
    if not value:
        return ""
    return " ".join(str(value).lower().strip().split())


def load_checkpoint() -> Tuple[Set[str], Stats]:
    if not os.path.exists(CHECKPOINT_FILE):
        return set(), Stats()
    try:
        with open(CHECKPOINT_FILE, "r", encoding="utf-8") as f:
            payload = json.load(f)
        processed = set(payload.get("processed_ids", []))
        stats = Stats(
            matched=int(payload.get("matched", 0)),
            skipped=int(payload.get("skipped", 0)),
            failed=int(payload.get("failed", 0)),
        )
        return processed, stats
    except Exception:
        return set(), Stats()


def save_checkpoint(processed_ids: Set[str], stats: Stats) -> None:
    payload = {
        "processed_ids": sorted(processed_ids),
        "matched": stats.matched,
        "skipped": stats.skipped,
        "failed": stats.failed,
        "saved_at": datetime.now(timezone.utc).isoformat(),
    }
    with open(CHECKPOINT_FILE, "w", encoding="utf-8") as f:
        json.dump(payload, f, indent=2)


def ensure_hcps_columns_exist(supabase: Client) -> None:
    """
    Best-effort migration via RPC helper if available.
    If your project does not expose an exec SQL RPC, run these manually:
      ALTER TABLE hcps ADD COLUMN IF NOT EXISTS scholar_h_index integer;
      ALTER TABLE hcps ADD COLUMN IF NOT EXISTS scholar_citations_total integer;
      ALTER TABLE hcps ADD COLUMN IF NOT EXISTS scholar_i10_index integer;
      ALTER TABLE hcps ADD COLUMN IF NOT EXISTS scholar_enriched_at timestamptz;
    """
    sql = """
    ALTER TABLE hcps ADD COLUMN IF NOT EXISTS scholar_h_index integer;
    ALTER TABLE hcps ADD COLUMN IF NOT EXISTS scholar_citations_total integer;
    ALTER TABLE hcps ADD COLUMN IF NOT EXISTS scholar_i10_index integer;
    ALTER TABLE hcps ADD COLUMN IF NOT EXISTS scholar_enriched_at timestamptz;
    """
    try:
        supabase.rpc("exec_sql", {"sql": sql}).execute()
        print("Ensured scholar columns exist on hcps.")
    except Exception:
        print("Column migration RPC unavailable; continuing. Run ALTER TABLE statements manually if needed.")


def fetch_eligible_hcps(supabase: Client) -> List[Dict]:
    rows: List[Dict] = []
    offset = 0
    while True:
        try:
            response = (
                supabase.table("hcps")
                .select("id,first_name,last_name,country,npi_number")
                .eq("country", "USA")
                .not_.is_("npi_number", "null")
                .range(offset, offset + SUPABASE_PAGE_SIZE - 1)
                .execute()
            )
        except Exception as exc:
            raise RuntimeError(f"Failed loading eligible HCPs at offset {offset}: {exc}") from exc
        batch = response.data or []
        if not batch:
            break
        rows.extend(batch)
        if len(batch) < SUPABASE_PAGE_SIZE:
            break
        offset += SUPABASE_PAGE_SIZE
    return rows


def name_matches_closely(first_name: str, last_name: str, result_name: Optional[str]) -> bool:
    if not result_name:
        return False
    f = normalize_name(first_name)
    l = normalize_name(last_name)
    rn = normalize_name(result_name)
    return bool(f and l and f in rn and l in rn)


def scraperapi_fetch_html(scraper_api_key: str, target_url: str) -> Optional[str]:
    try:
        response = requests.get(
            SCRAPERAPI_ENDPOINT,
            params={"api_key": scraper_api_key, "url": target_url},
            timeout=(8, 40),
        )
        response.raise_for_status()
        return response.text
    except requests.RequestException:
        return None


def extract_scholar_profile_link(search_html: str, first_name: str, last_name: str) -> Tuple[Optional[str], Optional[str], str]:
    soup = BeautifulSoup(search_html, "html.parser")
    f = normalize_name(first_name)
    l = normalize_name(last_name)

    # Author cards are often in .gsc_1usr blocks.
    for card in soup.select(".gsc_1usr"):
        link = card.select_one("a[href*='/citations?user=']")
        if not link:
            continue
        candidate_name = normalize_name(link.get_text(" ", strip=True))
        if f in candidate_name and l in candidate_name:
            href = link.get("href")
            if href:
                return href, candidate_name, "accepted: close name match"

    # Fallback: any citations profile link on page.
    fallback = soup.select_one("a[href*='/citations?user=']")
    if fallback and fallback.get("href"):
        return fallback.get("href"), normalize_name(fallback.get_text(" ", strip=True)), "accepted: fallback profile link"

    return None, None, "rejected: no scholar profile link found"


def parse_profile_metrics(profile_html: str) -> Dict[str, Optional[int]]:
    soup = BeautifulSoup(profile_html, "html.parser")
    metric_values: Dict[str, Optional[int]] = {
        "scholar_citations_total": None,
        "scholar_h_index": None,
        "scholar_i10_index": None,
    }

    # Google Scholar profile metrics table id usually gsc_rsb_st.
    for row in soup.select("#gsc_rsb_st tr"):
        cells = row.find_all(["th", "td"])
        if len(cells) < 2:
            continue
        label = normalize_name(cells[0].get_text(" ", strip=True))
        value_text = cells[1].get_text(" ", strip=True).replace(",", "")
        match = re.search(r"\d+", value_text)
        value = int(match.group()) if match else None
        if value is None:
            continue
        if "citations" in label:
            metric_values["scholar_citations_total"] = value
        elif "h-index" in label or "h index" in label:
            metric_values["scholar_h_index"] = value
        elif "i10-index" in label or "i10 index" in label:
            metric_values["scholar_i10_index"] = value

    return metric_values


def scholar_lookup(first_name: str, last_name: str, scraper_api_key: str) -> Optional[Dict]:
    query = quote(f"{first_name} {last_name}".strip())
    search_url = f"https://scholar.google.com/scholar?q={query}&as_sdt=0%2C5"
    search_html = scraperapi_fetch_html(scraper_api_key, search_url)
    if not search_html:
        return None

    profile_href, _, _ = extract_scholar_profile_link(search_html, first_name, last_name)
    if not profile_href:
        return None

    profile_url = urljoin("https://scholar.google.com", profile_href)
    profile_html = scraperapi_fetch_html(scraper_api_key, profile_url)
    if not profile_html:
        return None

    metrics = parse_profile_metrics(profile_html)
    if (
        metrics["scholar_h_index"] is None
        and metrics["scholar_citations_total"] is None
        and metrics["scholar_i10_index"] is None
    ):
        return None

    return {
        "scholar_h_index": metrics["scholar_h_index"],
        "scholar_citations_total": metrics["scholar_citations_total"],
        "scholar_i10_index": metrics["scholar_i10_index"],
        "scholar_enriched_at": datetime.now(timezone.utc).isoformat(),
    }


def update_hcp_scholar(supabase: Client, hcp_id: str, payload: Dict[str, object]) -> None:
    try:
        supabase.table("hcps").update(payload).eq("id", hcp_id).execute()
    except Exception as exc:
        raise RuntimeError(f"Failed updating HCP {hcp_id}: {exc}") from exc


def format_eta(seconds: float) -> str:
    seconds = max(0.0, seconds)
    total_minutes = int(seconds // 60)
    hours = total_minutes // 60
    minutes = total_minutes % 60
    return f"{hours}h {minutes}m"


def test_scraperapi_scholar(scraper_api_key: str) -> None:
    query = quote("Eric Topol")
    search_url = f"https://scholar.google.com/scholar?q={query}&as_sdt=0%2C5"
    html = scraperapi_fetch_html(scraper_api_key, search_url)
    if not html:
        raise RuntimeError("ScraperAPI Scholar test failed: no HTML for Eric Topol search.")
    href, name, reason = extract_scholar_profile_link(html, "Eric", "Topol")
    if not href:
        raise RuntimeError(f"ScraperAPI Scholar test failed: {reason}")
    print(f"ScraperAPI Scholar test OK. First matched profile: {name or href}")


def run_pipeline() -> None:
    load_dotenv()
    supabase = init_supabase()
    scraper_api_key = get_required_env("SCRAPER_API_KEY")

    ensure_hcps_columns_exist(supabase)
    test_scraperapi_scholar(scraper_api_key)

    processed_ids, stats = load_checkpoint()
    print(f"Loaded checkpoint with {len(processed_ids)} processed HCP IDs.")

    all_hcps = fetch_eligible_hcps(supabase)
    print(f"Loaded {len(all_hcps)} eligible US+NPI HCPs.")

    hcps = [h for h in all_hcps if h.get("id") and h["id"] not in processed_ids]
    total = len(hcps)
    print(f"Processing {total} HCPs not yet checkpointed.")
    if total == 0:
        print("No work to do.")
        return

    started = time.time()
    processed_in_run = 0
    for hcp in hcps:
        hcp_id = hcp.get("id")
        first_name = str(hcp.get("first_name") or "").strip()
        last_name = str(hcp.get("last_name") or "").strip()

        if not hcp_id or not first_name or not last_name:
            stats.skipped += 1
            if hcp_id:
                processed_ids.add(hcp_id)
            processed_in_run += 1
            continue

        try:
            payload = scholar_lookup(first_name, last_name, scraper_api_key)
            if payload is None:
                stats.skipped += 1
            else:
                update_hcp_scholar(supabase, hcp_id, payload)
                stats.matched += 1
        except Exception:
            # Graceful per-HCP exception handling.
            stats.failed += 1

        processed_ids.add(hcp_id)
        processed_in_run += 1

        if processed_in_run % PROGRESS_EVERY == 0:
            elapsed = time.time() - started
            avg = elapsed / max(processed_in_run, 1)
            remaining = max(total - processed_in_run, 0)
            eta = format_eta(avg * remaining)
            pct = (processed_in_run / max(total, 1)) * 100
            print(
                f"[{processed_in_run}/{total}] {pct:.1f}% | "
                f"Matched: {stats.matched} | ETA: {eta}"
            )

        if processed_in_run % CHECKPOINT_EVERY == 0:
            save_checkpoint(processed_ids, stats)
            print(f"Checkpoint saved at {processed_in_run} processed.")

    save_checkpoint(processed_ids, stats)
    print("Completed Scholar enrichment run.")
    print(
        f"Summary: processed={processed_in_run}, matched={stats.matched}, "
        f"skipped={stats.skipped}, failed={stats.failed}"
    )


if __name__ == "__main__":
    try:
        run_pipeline()
    except Exception as error:
        print(f"[ERROR] Scholar enrichment failed: {error}")
        raise
