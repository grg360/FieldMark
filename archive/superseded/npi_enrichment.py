from __future__ import annotations

import json
import os
import time
from dataclasses import dataclass
from typing import Dict, List, Optional, Set, Tuple

import requests
from dotenv import load_dotenv
from supabase import Client, create_client

NPI_API_URL = "https://npiregistry.cms.hhs.gov/api/"
CHECKPOINT_FILE = "npi_checkpoint.json"
SUPABASE_PAGE_SIZE = 1000
NPI_LIMIT = 5
SLEEP_SECONDS = 0.05
PROGRESS_EVERY = 500
CHECKPOINT_EVERY = 1000


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
    return " ".join(str(value).strip().lower().split())


def load_checkpoint() -> Tuple[Set[str], Stats]:
    if not os.path.exists(CHECKPOINT_FILE):
        return set(), Stats()
    try:
        with open(CHECKPOINT_FILE, "r", encoding="utf-8") as f:
            payload = json.load(f)
        processed_ids = set(payload.get("processed_ids", []))
        stats = Stats(
            matched=int(payload.get("matched", 0)),
            skipped=int(payload.get("skipped", 0)),
            failed=int(payload.get("failed", 0)),
        )
        return processed_ids, stats
    except Exception:
        # Corrupt checkpoint should not block pipeline run.
        return set(), Stats()


def save_checkpoint(processed_ids: Set[str], stats: Stats) -> None:
    payload = {
        "processed_ids": sorted(processed_ids),
        "matched": stats.matched,
        "skipped": stats.skipped,
        "failed": stats.failed,
        "saved_at": time.time(),
    }
    with open(CHECKPOINT_FILE, "w", encoding="utf-8") as f:
        json.dump(payload, f, indent=2)


def fetch_us_hcps(supabase: Client) -> List[Dict]:
    rows: List[Dict] = []
    offset = 0
    while True:
        try:
            response = (
                supabase.table("hcps")
                .select("id,first_name,last_name,country")
                .eq("country", "USA")
                .range(offset, offset + SUPABASE_PAGE_SIZE - 1)
                .execute()
            )
        except Exception as exc:
            raise RuntimeError(f"Failed loading US HCPs at offset {offset}: {exc}") from exc
        batch = response.data or []
        if not batch:
            break
        rows.extend(batch)
        if len(batch) < SUPABASE_PAGE_SIZE:
            break
        offset += SUPABASE_PAGE_SIZE
    return rows


def parse_npi_result(result: Dict) -> Dict[str, Optional[str]]:
    npi_number = str(result.get("number")) if result.get("number") is not None else None
    basic = result.get("basic", {}) if isinstance(result.get("basic"), dict) else {}

    organization_name = basic.get("organization_name")
    if not organization_name:
        organization_name = basic.get("name")

    addresses = result.get("addresses", []) if isinstance(result.get("addresses"), list) else []
    best_addr = None
    for addr in addresses:
        if isinstance(addr, dict) and addr.get("address_purpose") == "LOCATION":
            best_addr = addr
            break
    if best_addr is None:
        for addr in addresses:
            if isinstance(addr, dict):
                best_addr = addr
                break
    city = best_addr.get("city") if isinstance(best_addr, dict) else None
    state = best_addr.get("state") if isinstance(best_addr, dict) else None
    postal_code = best_addr.get("postal_code") if isinstance(best_addr, dict) else None
    address_1 = best_addr.get("address_1") if isinstance(best_addr, dict) else None

    taxonomy_description = None
    taxonomies = result.get("taxonomies", []) if isinstance(result.get("taxonomies"), list) else []
    for taxonomy in taxonomies:
        if isinstance(taxonomy, dict):
            taxonomy_description = taxonomy.get("desc") or taxonomy.get("description")
            if taxonomy_description:
                break

    return {
        "npi_number": npi_number,
        "practice_organization_name": organization_name,
        "address_line_1": address_1,
        "city": city,
        "state": state,
        "postal_code": postal_code,
        "taxonomy_description": taxonomy_description,
    }


def choose_confident_match(hcp: Dict, results: List[Dict]) -> Optional[Dict]:
    if not results:
        return None
    if len(results) == 1:
        return results[0]

    hcp_first = normalize_name(hcp.get("first_name"))
    hcp_last = normalize_name(hcp.get("last_name"))
    if not hcp_first or not hcp_last:
        return None

    exact_matches: List[Dict] = []
    for result in results:
        basic = result.get("basic", {}) if isinstance(result.get("basic"), dict) else {}
        r_first = normalize_name(basic.get("first_name"))
        r_last = normalize_name(basic.get("last_name"))
        if r_first == hcp_first and r_last == hcp_last:
            exact_matches.append(result)

    if len(exact_matches) == 1:
        return exact_matches[0]
    return None


def call_npi_registry(first_name: str, last_name: str) -> List[Dict]:
    params = {
        "version": "2.1",
        "first_name": first_name,
        "last_name": last_name,
        "enumeration_type": "NPI-1",
        "limit": str(NPI_LIMIT),
    }
    try:
        response = requests.get(NPI_API_URL, params=params, timeout=(5, 20))
        response.raise_for_status()
        payload = response.json()
    except (requests.RequestException, ValueError):
        return []
    results = payload.get("results", []) if isinstance(payload, dict) else []
    return results if isinstance(results, list) else []


def update_hcp(supabase: Client, hcp_id: str, parsed: Dict[str, Optional[str]]) -> None:
    update_payload = {
        "npi_number": parsed.get("npi_number"),
        "institution_full": parsed.get("practice_organization_name"),
        "city": parsed.get("city"),
        "state": parsed.get("state"),
        "zip_code": parsed.get("postal_code"),
    }
    try:
        supabase.table("hcps").update(update_payload).eq("id", hcp_id).execute()
    except Exception as exc:
        raise RuntimeError(f"Failed updating HCP {hcp_id}: {exc}") from exc


def format_eta(seconds: float) -> str:
    seconds = max(0.0, seconds)
    total_minutes = int(seconds // 60)
    hours = total_minutes // 60
    minutes = total_minutes % 60
    return f"{hours}h {minutes}m"


def run_pipeline() -> None:
    load_dotenv()
    supabase = init_supabase()

    processed_ids, stats = load_checkpoint()
    print(f"Loaded checkpoint with {len(processed_ids)} processed HCP IDs.")

    all_hcps = fetch_us_hcps(supabase)
    print(f"Loaded {len(all_hcps)} US HCPs from Supabase.")

    hcps_to_process = [row for row in all_hcps if row.get("id") and row["id"] not in processed_ids]
    total = len(hcps_to_process)
    print(f"Processing {total} HCPs not yet checkpointed.")
    if total == 0:
        print("No work to do.")
        return

    started = time.time()
    processed_in_run = 0
    for hcp in hcps_to_process:
        hcp_id = hcp.get("id")
        first_name = str(hcp.get("first_name") or "").strip()
        last_name = str(hcp.get("last_name") or "").strip()
        if not hcp_id or not first_name or not last_name:
            stats.skipped += 1
            if hcp_id:
                processed_ids.add(hcp_id)
            processed_in_run += 1
            continue

        results = call_npi_registry(first_name, last_name)
        chosen = choose_confident_match(hcp, results)
        if chosen is None:
            stats.skipped += 1
        else:
            try:
                parsed = parse_npi_result(chosen)
                _ = parsed.get("taxonomy_description")
                _ = parsed.get("address_line_1")
                update_hcp(supabase, hcp_id, parsed)
                stats.matched += 1
            except Exception:
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
                f"Matched: {stats.matched} | Skipped: {stats.skipped} | Failed: {stats.failed} | ETA: {eta}"
            )

        if processed_in_run % CHECKPOINT_EVERY == 0:
            save_checkpoint(processed_ids, stats)
            print(f"Checkpoint saved at {processed_in_run} processed.")

        time.sleep(SLEEP_SECONDS)

    save_checkpoint(processed_ids, stats)
    print("Completed NPI enrichment run.")
    print(
        f"Summary: processed={processed_in_run}, matched={stats.matched}, "
        f"skipped={stats.skipped}, failed={stats.failed}"
    )


if __name__ == "__main__":
    try:
        run_pipeline()
    except Exception as error:
        print(f"[ERROR] NPI enrichment failed: {error}")
        raise
