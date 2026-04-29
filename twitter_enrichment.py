from __future__ import annotations

import json
import os
import time
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Dict, List, Optional, Set, Tuple

import requests
from dotenv import load_dotenv
from requests_oauthlib import OAuth1
from supabase import Client, create_client

TWITTER_LOOKUP_URL = "https://api.twitter.com/2/users/by"
CHECKPOINT_FILE = "twitter_checkpoint.json"
SUPABASE_PAGE_SIZE = 100
PROGRESS_EVERY = 100
CHECKPOINT_EVERY = 500
SLEEP_SECONDS = 1.0

BIO_KEYWORDS = [
    "md",
    "do",
    "phd",
    "physician",
    "doctor",
    "oncologist",
    "hematologist",
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
      ALTER TABLE hcps ADD COLUMN IF NOT EXISTS twitter_handle text;
      ALTER TABLE hcps ADD COLUMN IF NOT EXISTS twitter_followers integer;
      ALTER TABLE hcps ADD COLUMN IF NOT EXISTS twitter_following integer;
      ALTER TABLE hcps ADD COLUMN IF NOT EXISTS twitter_tweet_count integer;
      ALTER TABLE hcps ADD COLUMN IF NOT EXISTS twitter_verified boolean;
      ALTER TABLE hcps ADD COLUMN IF NOT EXISTS twitter_bio text;
      ALTER TABLE hcps ADD COLUMN IF NOT EXISTS twitter_enriched_at timestamp with time zone;
    """
    sql = """
    ALTER TABLE hcps ADD COLUMN IF NOT EXISTS twitter_handle text;
    ALTER TABLE hcps ADD COLUMN IF NOT EXISTS twitter_followers integer;
    ALTER TABLE hcps ADD COLUMN IF NOT EXISTS twitter_following integer;
    ALTER TABLE hcps ADD COLUMN IF NOT EXISTS twitter_tweet_count integer;
    ALTER TABLE hcps ADD COLUMN IF NOT EXISTS twitter_verified boolean;
    ALTER TABLE hcps ADD COLUMN IF NOT EXISTS twitter_bio text;
    ALTER TABLE hcps ADD COLUMN IF NOT EXISTS twitter_enriched_at timestamp with time zone;
    """
    try:
        # Requires a pre-existing RPC function named exec_sql(sql text) in your DB.
        supabase.rpc("exec_sql", {"sql": sql}).execute()
        print("Ensured twitter columns exist on hcps.")
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


def build_username_guesses(first_name: str, last_name: str) -> List[str]:
    first = normalize_text(first_name).replace(" ", "")
    last = normalize_text(last_name).replace(" ", "")
    if not first or not last:
        return []
    guesses = [
        f"{first}{last}",
        f"{first[0]}{last}",
        f"dr{last}",
    ]
    # Preserve order while removing duplicates.
    deduped: List[str] = []
    seen: Set[str] = set()
    for guess in guesses:
        if guess and guess not in seen:
            seen.add(guess)
            deduped.append(guess)
    return deduped


def lookup_twitter_users_by_usernames(
    session: requests.Session,
    usernames: List[str],
    debug_response: bool = False,
) -> List[Dict]:
    if not usernames:
        return []
    params = {
        "usernames": ",".join(usernames),
        "user.fields": "public_metrics,description,verified",
    }
    try:
        response = session.get(TWITTER_LOOKUP_URL, params=params, timeout=(5, 20))
        if debug_response:
            print(f"[DEBUG] Twitter URL: {response.url}", flush=True)
            print(f"[DEBUG] Twitter status: {response.status_code}", flush=True)
            print(f"[DEBUG] Twitter body: {response.text}", flush=True)
        response.raise_for_status()
        payload = response.json()
    except (requests.RequestException, ValueError):
        return []
    data = payload.get("data", []) if isinstance(payload, dict) else []
    return data if isinstance(data, list) else []


def bio_has_hcp_keywords(description: Optional[str]) -> bool:
    text = normalize_text(description)
    if not text:
        return False
    return any(keyword in text for keyword in BIO_KEYWORDS)


def select_candidate(users: List[Dict]) -> Optional[Dict]:
    for user in users:
        if not isinstance(user, dict):
            continue
        if bio_has_hcp_keywords(user.get("description")):
            return user
    return None


def parse_twitter_user(user: Dict) -> Dict[str, object]:
    metrics = user.get("public_metrics", {}) if isinstance(user.get("public_metrics"), dict) else {}
    return {
        "twitter_handle": user.get("username"),
        "twitter_followers": metrics.get("followers_count"),
        "twitter_following": metrics.get("following_count"),
        "twitter_tweet_count": metrics.get("tweet_count"),
        "twitter_verified": bool(user.get("verified")) if user.get("verified") is not None else None,
        "twitter_bio": user.get("description"),
        "twitter_enriched_at": datetime.now(timezone.utc).isoformat(),
    }


def update_hcp_twitter_fields(supabase: Client, hcp_id: str, payload: Dict[str, object]) -> None:
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
    twitter_api_key = get_required_env("TWITTER_API_KEY")
    twitter_api_secret = get_required_env("TWITTER_API_SECRET")
    twitter_access_token = get_required_env("TWITTER_ACCESS_TOKEN")
    twitter_access_token_secret = get_required_env("TWITTER_ACCESS_TOKEN_SECRET")
    twitter_session = requests.Session()
    twitter_session.auth = OAuth1(
        twitter_api_key,
        twitter_api_secret,
        twitter_access_token,
        twitter_access_token_secret,
    )

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
    first_api_debug_pending = True
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

        users: List[Dict] = []
        guesses = build_username_guesses(first_name, last_name)
        for guess in guesses:
            users = lookup_twitter_users_by_usernames(
                twitter_session,
                [guess],
                debug_response=first_api_debug_pending,
            )
            if first_api_debug_pending:
                first_api_debug_pending = False
            chosen_for_guess = select_candidate(users)
            if chosen_for_guess is not None:
                users = [chosen_for_guess]
                break
        chosen = select_candidate(users)
        if chosen is None:
            stats.skipped += 1
        else:
            try:
                update_payload = parse_twitter_user(chosen)
                update_hcp_twitter_fields(supabase, hcp_id, update_payload)
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

        if processed_in_run % CHECKPOINT_EVERY == 0:
            save_checkpoint(processed_ids, stats)
            print(f"Checkpoint saved at {processed_in_run} processed.")

        time.sleep(SLEEP_SECONDS)

    save_checkpoint(processed_ids, stats)
    print("Completed Twitter enrichment run.")
    print(
        f"Summary: processed={processed_in_run}, matched={stats.matched}, "
        f"skipped={stats.skipped}, failed={stats.failed}"
    )


if __name__ == "__main__":
    try:
        run_pipeline()
    except Exception as error:
        print(f"[ERROR] Twitter enrichment failed: {error}")
        raise
