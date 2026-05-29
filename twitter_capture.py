from __future__ import annotations

"""
Twitter/X capture pipeline (Phase 3 implementation).

Reads social_capture_config.json, captures posts by hashtag/topic query,
stores platform-tagged posts/users, and supports checkpointed resume.
"""

import argparse
import json
import os
import re
import time
from dataclasses import dataclass
from datetime import date
from pathlib import Path
from typing import Any, Dict, Iterable, List, Optional, Set, Tuple

import requests
from dotenv import load_dotenv
from supabase import Client, create_client


CONFIG_PATH = Path("social_capture_config.json")
CHECKPOINT_PATH = Path("twitter_capture_checkpoint.json")
DRY_RUN_FIXTURE_PATH = Path("twitter_capture_dry_run_fixture.json")
TWITTER_SEARCH_URL = "https://api.twitter.com/2/tweets/search/recent"
TWITTER_USER_BY_USERNAME_URL = "https://api.twitter.com/2/users/by/username/{username}"
REQUEST_TIMEOUT = (5, 30)
API_SLEEP_SECONDS = 1.0
BACKOFF_429_SECONDS = 60.0
MAX_RETRIES = 3
POST_READ_COST_USD = 0.005
USER_READ_COST_USD = 0.010


@dataclass
class CaptureStats:
    posts_read: int = 0
    users_read: int = 0
    posts_captured: int = 0
    new_users_discovered: int = 0
    estimated_cost_usd: float = 0.0
    requests_made: int = 0


def get_required_env(name: str) -> str:
    value = os.getenv(name, "").strip()
    if not value:
        raise EnvironmentError(f"Missing required environment variable: {name}")
    return value


def init_supabase() -> Client:
    return create_client(get_required_env("SUPABASE_URL"), get_required_env("SUPABASE_KEY"))


def normalized_tag_key(text: str) -> str:
    return text.strip().lower()


def safe_query_key(prefix: str, query: str) -> str:
    # Keep checkpoint keys deterministic and readable.
    compact = re.sub(r"\s+", " ", query.strip())
    return f"{prefix}:{compact}"


def twitter_bearer_token() -> str:
    # Prefer new env name, fallback to existing token env.
    token = os.getenv("X_API_KEY", "").strip() or os.getenv("TWITTER_BEARER_TOKEN", "").strip()
    if not token:
        raise EnvironmentError("Missing Twitter auth token. Set X_API_KEY or TWITTER_BEARER_TOKEN.")
    return token


def recalc_estimated_cost(stats: CaptureStats) -> None:
    stats.estimated_cost_usd = (stats.posts_read * POST_READ_COST_USD) + (
        stats.users_read * USER_READ_COST_USD
    )


def load_config(path: Path) -> Dict[str, Any]:
    """Load and validate social_capture_config.json."""
    if not path.is_file():
        raise FileNotFoundError(f"Missing config file: {path}")
    data = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(data, dict):
        raise ValueError("Config must be a JSON object.")
    if "twitter" not in data or not isinstance(data["twitter"], dict):
        raise ValueError("Config must contain twitter object.")
    return data


def load_checkpoint(path: Path) -> Dict[str, Any]:
    """Load checkpoint state (last query cursor per hashtag/topic)."""
    if not path.is_file():
        return {"queries": {}}
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError:
        return {"queries": {}}
    if not isinstance(data, dict):
        return {"queries": {}}
    if "queries" not in data or not isinstance(data["queries"], dict):
        data["queries"] = {}
    return data


def save_checkpoint(path: Path, checkpoint: Dict[str, Any]) -> None:
    """Persist checkpoint state for resumable captures."""
    path.write_text(json.dumps(checkpoint, indent=2), encoding="utf-8")


def twitter_enabled(config: Dict[str, Any]) -> bool:
    """Return True if twitter.enabled is true."""
    return bool(config.get("twitter", {}).get("enabled", False))


def build_hashtag_query(tag: str, min_faves: int) -> str:
    """Build Twitter API query: '{tag} -is:retweet -is:reply'."""
    _ = min_faves  # retained for potential client-side filtering
    return f"{tag} -is:retweet -is:reply"


def build_topic_query(base_query: str, min_faves: int) -> str:
    _ = min_faves  # retained for potential client-side filtering
    return f"{base_query} -is:retweet -is:reply"


def is_active_until(active_until: Optional[str]) -> bool:
    if not active_until:
        return True
    try:
        d = date.fromisoformat(active_until.strip())
    except ValueError:
        return True
    return d >= date.today()


def iter_active_hashtag_queries(config: Dict[str, Any]) -> Iterable[Dict[str, Any]]:
    """Yield active hashtag configs (respect active_until filtering)."""
    hashtags = config.get("twitter", {}).get("active_hashtags", [])
    if not isinstance(hashtags, list):
        return
    for item in hashtags:
        if not isinstance(item, dict):
            continue
        tag = str(item.get("tag", "")).strip()
        if not tag:
            continue
        if not is_active_until(item.get("active_until")):
            continue
        min_faves = int(item.get("min_faves", 0) or 0)
        query = build_hashtag_query(tag, min_faves)
        yield {
            "query_key": safe_query_key("hashtag", normalized_tag_key(tag)),
            "captured_via_query": tag,
            "query": query,
            "therapeutic_area": item.get("therapeutic_area"),
        }


def iter_profile_queries(config: Dict[str, Any], profile_name: str) -> Iterable[Dict[str, Any]]:
    """Yield hashtag queries for a named profile (primary + secondary tags)."""
    profiles = config.get("profiles", {})
    profile = profiles.get(profile_name)
    if not profile:
        raise ValueError(f"Profile {profile_name!r} not found in config. Available: {list(profiles.keys())}")

    # Build a lookup of existing active_hashtags by tag, so profile entries inherit min_faves
    existing_tags = {
        h["tag"].lower(): h
        for h in config.get("twitter", {}).get("active_hashtags", [])
    }

    all_tags = list(profile.get("primary_hashtags", [])) + list(profile.get("secondary_hashtags", []))
    for tag in all_tags:
        existing = existing_tags.get(tag.lower())
        if existing:
            # Inherit min_faves and other settings from existing config
            yield existing
        else:
            # Fall back to defaults if tag isn't in active_hashtags
            yield {
                "tag": tag,
                "min_faves": 3,
                "active_until": None,
                "therapeutic_area": "unknown",
                "rationale": f"From profile: {profile_name}",
            }


def iter_topic_queries(config: Dict[str, Any]) -> Iterable[Dict[str, Any]]:
    """Yield configured topic queries and thresholds."""
    topics = config.get("twitter", {}).get("topic_queries", [])
    if not isinstance(topics, list):
        return
    for item in topics:
        if not isinstance(item, dict):
            continue
        base_query = str(item.get("query", "")).strip()
        if not base_query:
            continue
        min_faves = int(item.get("min_faves", 0) or 0)
        query = build_topic_query(base_query, min_faves)
        yield {
            "query_key": safe_query_key("topic", base_query.lower()),
            "captured_via_query": base_query,
            "query": query,
            "therapeutic_area": item.get("therapeutic_area"),
        }


def dry_run_fixture_page() -> Dict[str, Any]:
    if DRY_RUN_FIXTURE_PATH.is_file():
        payload = json.loads(DRY_RUN_FIXTURE_PATH.read_text(encoding="utf-8"))
        if isinstance(payload, dict):
            return payload
    # Minimal built-in fixture fallback.
    return {
        "data": [
            {
                "id": "dryrun-1",
                "text": "Excited for #ASCO2026 updates.",
                "created_at": "2026-05-01T12:00:00Z",
                "public_metrics": {"like_count": 12, "reply_count": 1, "retweet_count": 2, "quote_count": 0},
                "author_id": "u1",
                "entities": {"hashtags": [{"tag": "ASCO2026"}]},
            }
        ],
        "includes": {
            "users": [
                {
                    "id": "u1",
                    "username": "onc_doc",
                    "name": "Onc Doc",
                    "description": "Medical Oncologist, MD",
                    "location": "Boston, MA",
                    "url": "https://example.com",
                    "verified": False,
                    "public_metrics": {"followers_count": 2500, "following_count": 500, "tweet_count": 8000},
                }
            ]
        },
        "meta": {"result_count": 1},
    }


def fetch_twitter_posts(
    query: str,
    cursor: Optional[str],
    dry_run: bool,
    max_results: int,
) -> Tuple[List[Dict[str, Any]], Optional[str]]:
    """
    Fetch one page of posts from Twitter API.
    Returns (posts, next_cursor).
    Implements:
    - 1 second spacing between requests
    - 429 => 60s backoff + retry
    """
    if dry_run:
        fixture = dry_run_fixture_page()
        return [fixture], None

    token = twitter_bearer_token()
    headers = {"Authorization": f"Bearer {token}"}
    params: Dict[str, Any] = {
        "query": query,
        "max_results": max(10, min(100, int(max_results))),
        "tweet.fields": "created_at,public_metrics,entities,author_id",
        "expansions": "author_id",
        "user.fields": "username,name,description,location,url,verified,public_metrics",
    }
    if cursor:
        params["next_token"] = cursor

    for attempt in range(MAX_RETRIES):
        try:
            resp = requests.get(TWITTER_SEARCH_URL, headers=headers, params=params, timeout=REQUEST_TIMEOUT)
        except requests.RequestException as exc:
            if attempt == MAX_RETRIES - 1:
                raise RuntimeError(f"Twitter API network failure: {exc}") from exc
            time.sleep(2.0)
            continue

        if resp.status_code == 429:
            if attempt == MAX_RETRIES - 1:
                raise RuntimeError("Twitter API rate-limited repeatedly (429).")
            time.sleep(BACKOFF_429_SECONDS)
            continue

        if resp.status_code >= 400:
            raise RuntimeError(f"Twitter API error {resp.status_code}: {resp.text[:400]}")

        payload = resp.json()
        time.sleep(API_SLEEP_SECONDS)
        return [payload], payload.get("meta", {}).get("next_token")

    raise RuntimeError("Twitter API call failed unexpectedly.")


def map_post_to_social_posts_row(post: Dict[str, Any], captured_via_query: str) -> Dict[str, Any]:
    """Map API post payload into social_posts row with platform='twitter'."""
    metrics = post.get("public_metrics") or {}
    hashtags: List[str] = []
    entities = post.get("entities") or {}
    for h in entities.get("hashtags", []) if isinstance(entities, dict) else []:
        tag = h.get("tag")
        if tag:
            hashtags.append(f"#{str(tag).lower()}")

    handle = post.get("_author_username")
    if not handle:
        handle = ""
    return {
        "platform": "twitter",
        "platform_post_id": str(post.get("id")),
        "handle": str(handle).lower(),
        "display_name": post.get("_author_name"),
        "post_text": post.get("text"),
        "posted_at": post.get("created_at"),
        "engagement_likes": int(metrics.get("like_count") or 0),
        "engagement_replies": int(metrics.get("reply_count") or 0),
        "engagement_reposts": int(metrics.get("retweet_count") or 0),
        "engagement_quotes": int(metrics.get("quote_count") or 0),
        "hashtags": hashtags,
        "captured_via_query": captured_via_query,
    }


def upsert_social_posts(client: Client, rows: List[Dict[str, Any]], dry_run: bool) -> int:
    """
    Insert into social_posts with ON CONFLICT(platform, platform_post_id) DO NOTHING.
    Returns inserted count.
    """
    if not rows:
        return 0
    if dry_run:
        return len(rows)
    # Supabase python maps to UPSERT with conflict target.
    client.table("social_posts_v2").upsert(rows, on_conflict="platform,platform_post_id", ignore_duplicates=True).execute()
    return len(rows)


def extract_unique_handles(posts: List[Dict[str, Any]]) -> Set[str]:
    """Extract unique author handles from captured posts."""
    out: Set[str] = set()
    for p in posts:
        h = str(p.get("_author_username") or "").strip().lower()
        if h:
            out.add(h)
    return out


def social_user_exists(client: Client, platform: str, handle: str) -> bool:
    """Check if social_users row already exists for (platform, handle)."""
    resp = (
        client.table("social_users_v2")
        .select("id", count="exact")
        .eq("platform", platform)
        .eq("handle", handle.lower())
        .limit(1)
        .execute()
    )
    return int(resp.count or 0) > 0


def fetch_twitter_profile(handle: str, dry_run: bool) -> Dict[str, Any]:
    """Fetch user profile from Twitter API (or dry-run fixtures)."""
    if dry_run:
        # Dry-run profile should be sourced from fixture user cache in caller.
        return {}

    token = twitter_bearer_token()
    headers = {"Authorization": f"Bearer {token}"}
    url = TWITTER_USER_BY_USERNAME_URL.format(username=handle)
    params = {"user.fields": "username,name,description,location,url,verified,public_metrics"}
    for attempt in range(MAX_RETRIES):
        try:
            resp = requests.get(url, headers=headers, params=params, timeout=REQUEST_TIMEOUT)
        except requests.RequestException as exc:
            if attempt == MAX_RETRIES - 1:
                raise RuntimeError(f"Twitter profile fetch failed for @{handle}: {exc}") from exc
            time.sleep(2.0)
            continue
        if resp.status_code == 429:
            if attempt == MAX_RETRIES - 1:
                raise RuntimeError(f"Twitter profile rate-limited for @{handle}")
            time.sleep(BACKOFF_429_SECONDS)
            continue
        if resp.status_code == 404:
            return {}
        if resp.status_code >= 400:
            raise RuntimeError(f"Twitter profile error {resp.status_code} for @{handle}: {resp.text[:300]}")
        payload = resp.json()
        time.sleep(API_SLEEP_SECONDS)
        if isinstance(payload, dict):
            return payload.get("data") or {}
        return {}
    return {}


def map_profile_to_social_users_row(profile: Dict[str, Any]) -> Dict[str, Any]:
    """Map profile payload into social_users row with platform='twitter'."""
    metrics = profile.get("public_metrics") or {}
    username = str(profile.get("username") or "").strip().lower()
    return {
        "platform": "twitter",
        "handle": username,
        "display_name": profile.get("name"),
        "bio": profile.get("description"),
        "location": profile.get("location"),
        "website": profile.get("url"),
        "follower_count": int(metrics.get("followers_count") or 0),
        "following_count": int(metrics.get("following_count") or 0),
        "post_count": int(metrics.get("tweet_count") or 0),
        "verified": bool(profile.get("verified", False)),
        "profile_url": f"https://x.com/{username}" if username else None,
    }


def upsert_social_user(client: Client, row: Dict[str, Any], dry_run: bool) -> bool:
    """Insert social user with ON CONFLICT(platform, handle) DO NOTHING."""
    if not row.get("handle"):
        return False
    if dry_run:
        return True
    client.table("social_users_v2").upsert(row, on_conflict="platform,handle", ignore_duplicates=True).execute()
    return True


def attach_user_expansions_to_posts(payload: Dict[str, Any]) -> List[Dict[str, Any]]:
    tweets = payload.get("data") or []
    includes = payload.get("includes") or {}
    users = includes.get("users") or []
    user_map: Dict[str, Dict[str, Any]] = {}
    for u in users:
        uid = str(u.get("id") or "")
        if uid:
            user_map[uid] = u

    out: List[Dict[str, Any]] = []
    for t in tweets:
        if not isinstance(t, dict):
            continue
        p = dict(t)
        author_id = str(p.get("author_id") or "")
        u = user_map.get(author_id, {})
        p["_author_username"] = u.get("username")
        p["_author_name"] = u.get("name")
        p["_author_profile"] = u
        out.append(p)
    return out


def run_capture_for_query(
    client: Client,
    query: str,
    query_key: str,
    captured_via_query: str,
    checkpoint: Dict[str, Any],
    stats: CaptureStats,
    dry_run: bool,
    max_results: int,
) -> None:
    """Capture loop for one hashtag/topic query, with checkpoint cursor."""
    queries = checkpoint.setdefault("queries", {})
    state = queries.setdefault(query_key, {"next_token": None, "completed": False})
    # For continuous capture (live conferences, etc.), reset completion on each run.
    # The recent-search API only goes back ~7 days, so the previous "completed" state
    # just means "no more *historical* results"; new posts may exist since last run.
    next_token = state.get("next_token")
    # Reset completed state so each invocation re-checks for new posts
    state["completed"] = False
    completed = False

    while True:
        payloads, new_next_token = fetch_twitter_posts(
            query,
            next_token,
            dry_run=dry_run,
            max_results=max_results,
        )
        if not dry_run:
            stats.requests_made += 1

        all_posts: List[Dict[str, Any]] = []
        for payload in payloads:
            all_posts.extend(attach_user_expansions_to_posts(payload))
        stats.posts_read += len(all_posts)
        recalc_estimated_cost(stats)

        rows = [map_post_to_social_posts_row(p, captured_via_query=captured_via_query) for p in all_posts]
        rows = [r for r in rows if r.get("platform_post_id") and r.get("handle")]
        inserted_posts = upsert_social_posts(client, rows, dry_run=dry_run)
        stats.posts_captured += inserted_posts

        handles = extract_unique_handles(all_posts)
        for h in handles:
            if social_user_exists(client, "twitter", h):
                continue
            # Prefer expanded profile from search payload to avoid extra calls.
            expanded_profile = next((p.get("_author_profile") for p in all_posts if str(p.get("_author_username", "")).lower() == h), None)
            if isinstance(expanded_profile, dict) and expanded_profile:
                profile = expanded_profile
            else:
                profile = fetch_twitter_profile(h, dry_run=dry_run)
                if not dry_run:
                    stats.requests_made += 1
            if not profile:
                continue
            stats.users_read += 1
            recalc_estimated_cost(stats)
            user_row = map_profile_to_social_users_row(profile)
            if upsert_social_user(client, user_row, dry_run=dry_run):
                stats.new_users_discovered += 1

        state["next_token"] = new_next_token
        # Don't set completed=true permanently. Reaching the end of available results
        # for THIS run is normal; we want the next scheduled run to check for new posts.
        state["completed"] = False
        save_checkpoint(CHECKPOINT_PATH, checkpoint)

        if not new_next_token:
            break
        if dry_run:
            # Dry-run fixture intentionally single page to avoid fake pagination.
            break
        next_token = new_next_token


def run_single_tag(
    client: Client,
    config: Dict[str, Any],
    tag: str,
    dry_run: bool,
    max_results: int,
) -> CaptureStats:
    """Capture only one hashtag via --tag."""
    stats = CaptureStats()
    checkpoint = load_checkpoint(CHECKPOINT_PATH)

    tag_norm = normalized_tag_key(tag)
    target = None
    for item in iter_active_hashtag_queries(config):
        if normalized_tag_key(str(item.get("captured_via_query", ""))) == tag_norm:
            target = item
            break
    if target is None:
        # Allow ad-hoc tag if not configured.
        target = {
            "query_key": safe_query_key("hashtag", tag_norm),
            "captured_via_query": tag,
            "query": build_hashtag_query(tag, 0),
            "therapeutic_area": None,
        }

    run_capture_for_query(
        client=client,
        query=target["query"],
        query_key=target["query_key"],
        captured_via_query=target["captured_via_query"],
        checkpoint=checkpoint,
        stats=stats,
        dry_run=dry_run,
        max_results=max_results,
    )
    return stats


def run_all(client: Client, config: Dict[str, Any], dry_run: bool, max_results: int) -> CaptureStats:
    """Capture all active hashtags + topic queries via --all."""
    stats = CaptureStats()
    checkpoint = load_checkpoint(CHECKPOINT_PATH)
    queries = list(iter_active_hashtag_queries(config)) + list(iter_topic_queries(config))

    for q in queries:
        print(f"Running query_key={q['query_key']} via={q['captured_via_query']}")
        run_capture_for_query(
            client=client,
            query=q["query"],
            query_key=q["query_key"],
            captured_via_query=q["captured_via_query"],
            checkpoint=checkpoint,
            stats=stats,
            dry_run=dry_run,
            max_results=max_results,
        )
        print(
            f"Running totals: posts={stats.posts_captured}, users={stats.new_users_discovered}, "
            f"requests={stats.requests_made}, est_cost=${stats.estimated_cost_usd:.2f}"
        )
    return stats


def print_summary(stats: CaptureStats) -> None:
    """Print posts captured, new users discovered, and estimated cost."""
    print("\n=== Twitter capture summary ===")
    print(f"Posts read: {stats.posts_read} @ ${POST_READ_COST_USD:.3f} each")
    print(f"Users read: {stats.users_read} @ ${USER_READ_COST_USD:.3f} each")
    print(f"Posts captured: {stats.posts_captured}")
    print(f"New users discovered: {stats.new_users_discovered}")
    print(f"Requests made: {stats.requests_made}")
    print(f"Estimated cost: ${stats.estimated_cost_usd:.2f}")


def main() -> None:
    load_dotenv()
    parser = argparse.ArgumentParser(description="Twitter/X social capture (architecture outline).")
    parser.add_argument("--tag", type=str, default=None, help="Single hashtag to capture, e.g. #ASCO2026")
    parser.add_argument("--all", action="store_true", help="Capture all active hashtags and topic queries")
    parser.add_argument(
        "--profile",
        type=str,
        default=None,
        help="Named congress profile from config (e.g., ASCO, ESMO, EASL, AASLD, EHA). Captures all primary + secondary hashtags for that profile.",
    )
    parser.add_argument("--dry-run", action="store_true", help="No DB writes, no paid API calls (cached fixtures)")
    parser.add_argument("--max-results", type=int, default=100, help="Tweets per API page (10-100).")
    args = parser.parse_args()

    config = load_config(CONFIG_PATH)
    if not twitter_enabled(config):
        print("Twitter capture disabled by config: twitter.enabled=false")
        return

    mode_flags = [bool(args.tag), bool(args.all), bool(args.profile)]
    if sum(mode_flags) != 1:
        raise ValueError("Specify exactly one mode: --tag, --all, or --profile.")

    client = init_supabase()
    if args.tag:
        stats = run_single_tag(
            client,
            config,
            args.tag,
            dry_run=args.dry_run,
            max_results=args.max_results,
        )
    elif args.all:
        stats = run_all(
            client,
            config,
            dry_run=args.dry_run,
            max_results=args.max_results,
        )
    elif args.profile:
        print(f"=== Running profile: {args.profile} ===")
        stats = CaptureStats()
        for hashtag_config in iter_profile_queries(config, args.profile):
            tag = hashtag_config["tag"]
            print(f"\n--- Capturing {tag} ---")
            tag_stats = run_single_tag(
                client,
                config,
                tag,
                dry_run=args.dry_run,
                max_results=args.max_results,
            )
            stats.posts_read += tag_stats.posts_read
            stats.users_read += tag_stats.users_read
            stats.posts_captured += tag_stats.posts_captured
            stats.new_users_discovered += tag_stats.new_users_discovered
            stats.requests_made += tag_stats.requests_made
        recalc_estimated_cost(stats)
    print_summary(stats)


if __name__ == "__main__":
    main()
