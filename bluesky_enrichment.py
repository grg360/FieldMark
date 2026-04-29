from __future__ import annotations

import json
import os
import time
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Dict, List, Optional, Set, Tuple
from urllib.parse import quote

import requests
from dotenv import load_dotenv
from supabase import Client, create_client

BLUESKY_PROFILE_URL = "https://public.api.bsky.app/xrpc/app.bsky.actor.getProfile"
CHECKPOINT_FILE = "bluesky_checkpoint.json"
SUPABASE_PAGE_SIZE = 100
PROGRESS_EVERY = 100
SLEEP_SECONDS = 0.2

BIO_KEYWORDS = [
    "md",
    "do",
    "phd",
    "physician",
    "doctor",
    "oncologist",
    "neurologist",
    "rare disease",
    "clinical trial",
    "medicine",
    "hospital",
    "university",
    "medical center",
]


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


def normalize_text(value: Optional[str]) -> str:
    if not value:
        return ""
    return " ".join(str(value).lower().split())


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
      ALTER TABLE hcps ADD COLUMN IF NOT EXISTS bluesky_handle text;
      ALTER TABLE hcps ADD COLUMN IF NOT EXISTS bluesky_followers integer;
      ALTER TABLE hcps ADD COLUMN IF NOT EXISTS bluesky_posts integer;
      ALTER TABLE hcps ADD COLUMN IF NOT EXISTS bluesky_bio text;
      ALTER TABLE hcps ADD COLUMN IF NOT EXISTS bluesky_enriched_at timestamptz;
    """
    sql = """
    ALTER TABLE hcps ADD COLUMN IF NOT EXISTS bluesky_handle text;
    ALTER TABLE hcps ADD COLUMN IF NOT EXISTS bluesky_followers integer;
    ALTER TABLE hcps ADD COLUMN IF NOT EXISTS bluesky_posts integer;
    ALTER TABLE hcps ADD COLUMN IF NOT EXISTS bluesky_bio text;
    ALTER TABLE hcps ADD COLUMN IF NOT EXISTS bluesky_enriched_at timestamptz;
    """
    try:
        supabase.rpc("exec_sql", {"sql": sql}).execute()
        print("Ensured bluesky columns exist on hcps.")
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


def build_handle_guesses(first_name: str, last_name: str) -> List[str]:
    first = normalize_text(first_name).replace(" ", "")
    last = normalize_text(last_name).replace(" ", "")
    if not first or not last:
        return []
    guesses = [
        f"{first}{last}.bsky.social",
        f"{first[0]}{last}.bsky.social",
        f"dr{last}.bsky.social",
    ]
    deduped: List[str] = []
    seen: Set[str] = set()
    for guess in guesses:
        if guess and guess not in seen:
            seen.add(guess)
            deduped.append(guess)
    return deduped


def get_bluesky_profile(handle: str) -> Optional[Dict]:
    try:
        response = requests.get(
            BLUESKY_PROFILE_URL,
            params={"actor": handle},
            timeout=(5, 20),
        )
        if response.status_code == 404:
            return None
        response.raise_for_status()
        payload = response.json()
        return payload if isinstance(payload, dict) else None
    except (requests.RequestException, ValueError):
        return None


def profile_has_medical_keywords(profile: Dict) -> bool:
    display_name = normalize_text(profile.get("displayName"))
    description = normalize_text(profile.get("description"))
    combined = f"{display_name} {description}".strip()
    return any(keyword in combined for keyword in BIO_KEYWORDS)


def parse_profile(profile: Dict) -> Dict[str, object]:
    return {
        "bluesky_handle": profile.get("handle"),
        "bluesky_followers": profile.get("followersCount"),
        "bluesky_posts": profile.get("postsCount"),
        "bluesky_bio": profile.get("description"),
        "bluesky_enriched_at": datetime.now(timezone.utc).isoformat(),
    }


def update_hcp_bluesky(supabase: Client, hcp_id: str, payload: Dict[str, object]) -> None:
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


def run_pipeline() -> None:
    load_dotenv()
    supabase = init_supabase()

    ensure_hcps_columns_exist(supabase)

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

        chosen_profile: Optional[Dict] = None
        for handle in build_handle_guesses(first_name, last_name):
            profile = get_bluesky_profile(handle)
            if profile and profile_has_medical_keywords(profile):
                chosen_profile = profile
                break
            time.sleep(SLEEP_SECONDS)

        if chosen_profile is None:
            stats.skipped += 1
        else:
            try:
                update_payload = parse_profile(chosen_profile)
                update_hcp_bluesky(supabase, hcp_id, update_payload)
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
                f"Matched: {stats.matched} | ETA: {eta}"
            )

        save_checkpoint(processed_ids, stats)
        time.sleep(SLEEP_SECONDS)

    print("Completed BlueSky enrichment run.")
    print(
        f"Summary: processed={processed_in_run}, matched={stats.matched}, "
        f"skipped={stats.skipped}, failed={stats.failed}"
    )


if __name__ == "__main__":
    try:
        run_pipeline()
    except Exception as error:
        print(f"[ERROR] BlueSky enrichment failed: {error}")
        raise
