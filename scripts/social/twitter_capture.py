from __future__ import annotations

"""
Twitter/X capture pipeline (Phase 3 implementation).

Reads social_capture_config.json, captures posts by hashtag/topic query,
stores platform-tagged posts/users, and supports checkpointed resume.

Also supports --capture-replies mode for pulling reply chains on existing
ASCO root posts via conversation_id queries.

HTTP/2 workaround: Supabase client is recycled every 15,000 requests to avoid
HTTP/2 stream ID exhaustion (cap of 20,000 per connection). Operations are also
wrapped in with_supabase_retry() to handle RemoteProtocolError gracefully.
"""

import argparse
import json
import os
import re
import time
from dataclasses import dataclass
from datetime import date
from pathlib import Path
from typing import Any, Callable, Dict, Iterable, List, Optional, Set, Tuple, TypeVar

import requests
from dotenv import load_dotenv
from httpx import RemoteProtocolError
from supabase import Client, create_client

T = TypeVar("T")


CONFIG_PATH = Path("social_capture_config.json")
CHECKPOINT_PATH = Path("twitter_capture_checkpoint.json")
DRY_RUN_FIXTURE_PATH = Path("twitter_capture_dry_run_fixture.json")
TWITTER_SEARCH_URL = "https://api.twitter.com/2/tweets/search/recent"
TWITTER_USER_BY_USERNAME_URL = "https://api.twitter.com/2/users/by/username/{username}"
REQUEST_TIMEOUT = (5, 30)
API_SLEEP_SECONDS = 1.0
BACKOFF_429_FALLBACK_SECONDS = 60.0
MAX_RETRIES = 5
POST_READ_COST_USD = 0.005
USER_READ_COST_USD = 0.010

# HTTP/2 stream limit workaround
SUPABASE_REQUESTS_BEFORE_RECYCLE = 15000  # well under the 20K HTTP/2 stream limit
_supabase_request_count = 0
_supabase_client: Optional[Client] = None


@dataclass
class CaptureStats:
    posts_read: int = 0
    users_read: int = 0
    posts_captured: int = 0
    new_users_discovered: int = 0
    est_max_credits: float = 0.0
    requests_made: int = 0


def get_required_env(name: str) -> str:
    value = os.getenv(name, "").strip()
    if not value:
        raise EnvironmentError(f"Missing required environment variable: {name}")
    return value


def get_supabase_client(force_new: bool = False) -> Client:
    """Returns a Supabase client, recycling if approaching HTTP/2 stream limit."""
    global _supabase_client, _supabase_request_count

    if force_new or _supabase_client is None or _supabase_request_count >= SUPABASE_REQUESTS_BEFORE_RECYCLE:
        if _supabase_client is not None:
            print(
                f"[supabase] Recycling client after {_supabase_request_count} requests",
                flush=True,
            )
        _supabase_client = create_client(
            get_required_env("SUPABASE_URL"),
            get_required_env("SUPABASE_KEY"),
        )
        _supabase_request_count = 0

    _supabase_request_count += 1
    return _supabase_client


def with_supabase_retry(operation: Callable[[Client], T], max_attempts: int = 3) -> T:
    """
    Execute a Supabase operation with retry on HTTP/2 connection termination.
    Recreates the client on RemoteProtocolError and retries.
    """
    last_exc: Optional[BaseException] = None
    for attempt in range(max_attempts):
        try:
            client = get_supabase_client(force_new=(attempt > 0))
            return operation(client)
        except RemoteProtocolError as e:
            last_exc = e
            print(
                f"[supabase] RemoteProtocolError on attempt {attempt + 1}/{max_attempts}: {e}. "
                f"Recreating client and retrying.",
                flush=True,
            )
            continue
    if last_exc is not None:
        raise last_exc
    raise RuntimeError("with_supabase_retry failed without exception")


def init_supabase() -> Client:
    return get_supabase_client(force_new=True)


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


def calculate_est_max_credits(stats: CaptureStats) -> None:
    stats.est_max_credits = (stats.posts_read * POST_READ_COST_USD) + (
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
    """Load checkpoint state (last query cursor per hashtag/topic/reply root)."""
    if not path.is_file():
        return {"queries": {}, "reply_captures": {}}
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError:
        return {"queries": {}, "reply_captures": {}}
    if not isinstance(data, dict):
        return {"queries": {}, "reply_captures": {}}
    if "queries" not in data or not isinstance(data["queries"], dict):
        data["queries"] = {}
    if "reply_captures" not in data or not isinstance(data["reply_captures"], dict):
        data["reply_captures"] = {}
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


def build_reply_query(root_id: str) -> str:
    """Build Twitter API query for all replies in a conversation thread."""
    return f"conversation_id:{root_id} -is:retweet"


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
                "conversation_id": "dryrun-1",
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


def sleep_for_rate_limit(resp: requests.Response) -> None:
    """Sleep until Twitter rate-limit reset, using x-rate-limit-reset header."""
    sleep_seconds = BACKOFF_429_FALLBACK_SECONDS
    reset_header = resp.headers.get("x-rate-limit-reset")
    if reset_header:
        try:
            reset_timestamp = float(reset_header)
            sleep_seconds = max(5.0, reset_timestamp - time.time() + 2)
        except (ValueError, TypeError):
            pass
    print(f"Rate limited; sleeping {sleep_seconds:.0f}s until reset.")
    time.sleep(sleep_seconds)


def fetch_twitter_posts(
    query: str,
    cursor: Optional[str],
    dry_run: bool,
    max_results: int,
    since_id: Optional[str] = None,
) -> Tuple[List[Dict[str, Any]], Optional[str]]:
    """
    Fetch one page of posts from Twitter API.
    Returns (posts, next_cursor).
    Implements:
    - 1 second spacing between requests
    - 429 => sleep until x-rate-limit-reset + retry
    """
    if dry_run:
        fixture = dry_run_fixture_page()
        return [fixture], None

    token = twitter_bearer_token()
    headers = {"Authorization": f"Bearer {token}"}
    params: Dict[str, Any] = {
        "query": query,
        "max_results": max(10, min(100, int(max_results))),
        "tweet.fields": "created_at,public_metrics,entities,author_id,conversation_id,referenced_tweets",
        "expansions": "author_id",
        "user.fields": "username,name,description,location,url,verified,public_metrics",
    }
    if cursor:
        params["next_token"] = cursor
    if since_id:
        params["since_id"] = since_id

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
            sleep_for_rate_limit(resp)
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

    parent_platform_post_id: Optional[str] = None
    referenced = post.get("referenced_tweets")
    if isinstance(referenced, list):
        for ref in referenced:
            if isinstance(ref, dict) and ref.get("type") == "replied_to":
                ref_id = ref.get("id")
                if ref_id is not None:
                    parent_platform_post_id = str(ref_id)
                break

    conversation_id = post.get("conversation_id")
    if conversation_id is not None:
        conversation_id = str(conversation_id)

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
        "conversation_id": conversation_id,
        "parent_platform_post_id": parent_platform_post_id,
        "is_reply": parent_platform_post_id is not None,
    }


def upsert_social_posts(client: Client, rows: List[Dict[str, Any]], dry_run: bool) -> int:
    """
    Insert into social_posts with ON CONFLICT(platform, platform_post_id) DO NOTHING.
    Returns inserted count.
    """
    _ = client
    if not rows:
        return 0
    if dry_run:
        return len(rows)
    # Supabase python maps to UPSERT with conflict target.
    # captured_at is deliberately absent from the payload: DB DEFAULT now()
    # stamps it server-side on insert (migration 2026_08_07). If this ever
    # switches to ignore_duplicates=False (merge mode), set captured_at
    # explicitly here — DEFAULT only fires on INSERT, never on UPDATE.
    with_supabase_retry(
        lambda c: c.table("social_posts_v2")
        .upsert(rows, on_conflict="platform,platform_post_id", ignore_duplicates=True)
        .execute()
    )
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
    _ = client

    def _op(c: Client) -> Any:
        return (
            c.table("social_users_v2")
            .select("id", count="exact")
            .eq("platform", platform)
            .eq("handle", handle.lower())
            .limit(1)
            .execute()
        )

    resp = with_supabase_retry(_op)
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
            sleep_for_rate_limit(resp)
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


def map_profile_to_social_users_row(profile: Dict[str, Any], discovery_source: str) -> Dict[str, Any]:
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
        "discovery_source": discovery_source,
    }


def upsert_social_user(client: Client, row: Dict[str, Any], dry_run: bool) -> bool:
    """Insert social user with ON CONFLICT(platform, handle) DO NOTHING.

    profile_fetched_at (DB DEFAULT now(), migration 2026_08_07) therefore
    stamps FIRST-SEEN at handle discovery, NOT freshness — profiles are never
    re-fetched, and this DO NOTHING upsert never revisits existing rows. No
    surface may render it as "last refreshed" (re-fetch gap: KNOWN_ISSUES.md).
    If this ever switches to ignore_duplicates=False (merge mode), set
    profile_fetched_at explicitly here — DEFAULT only fires on INSERT.
    """
    _ = client
    if not row.get("handle"):
        return False
    if dry_run:
        return True
    with_supabase_retry(
        lambda c: c.table("social_users_v2")
        .upsert(row, on_conflict="platform,handle", ignore_duplicates=True)
        .execute()
    )
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
    discovery_source: str,
    checkpoint: Dict[str, Any],
    stats: CaptureStats,
    dry_run: bool,
    max_results: int,
    checkpoint_namespace: str = "queries",
) -> None:
    """Capture loop for one query, with checkpoint cursor."""
    namespace = checkpoint.setdefault(checkpoint_namespace, {})
    state = namespace.setdefault(query_key, {"next_token": None, "completed": False})

    if checkpoint_namespace == "reply_captures":
        if state.get("completed"):
            return
        next_token = state.get("next_token")
    else:
        # For continuous capture (live conferences, etc.), reset completion on each run.
        # The recent-search API only goes back ~7 days, so the previous "completed" state
        # just means "no more *historical* results"; new posts may exist since last run.
        next_token = state.get("next_token")
        # Reset completed state so each invocation re-checks for new posts
        state["completed"] = False

    # Incremental capture: pass the last COMPLETED run's newest post id as
    # since_id, so scheduled runs read only new posts instead of re-buying the
    # whole trailing 7-day window every day (X bills per post READ; the DB
    # upsert deduplicates rows but not cost). Rules:
    # - newest_id only advances when a run finishes pagination, so an
    #   interrupted run never opens a gap;
    # - a resumed run (next_token present) finishes its old sweep without
    #   since_id first;
    # - the 7-day search window is the overlap margin for missed runs.
    run_since_id: Optional[str] = None
    if checkpoint_namespace != "reply_captures" and not next_token and not dry_run:
        run_since_id = state.get("newest_id")
    run_newest_id: Optional[str] = None

    while True:
        payloads, new_next_token = fetch_twitter_posts(
            query,
            next_token,
            dry_run=dry_run,
            max_results=max_results,
            since_id=run_since_id,
        )
        # The first page's meta.newest_id is the newest post of the whole run.
        if run_newest_id is None:
            for payload in payloads:
                meta_newest = (payload.get("meta") or {}).get("newest_id")
                if meta_newest:
                    run_newest_id = str(meta_newest)
                    break
        if not dry_run:
            stats.requests_made += 1

        all_posts: List[Dict[str, Any]] = []
        for payload in payloads:
            all_posts.extend(attach_user_expansions_to_posts(payload))
        stats.posts_read += len(all_posts)
        calculate_est_max_credits(stats)

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
            calculate_est_max_credits(stats)
            user_row = map_profile_to_social_users_row(profile, discovery_source)
            if upsert_social_user(client, user_row, dry_run=dry_run):
                stats.new_users_discovered += 1

        state["next_token"] = new_next_token
        if checkpoint_namespace == "reply_captures":
            # Reply trees don't grow under conversation_id the way hashtag feeds do;
            # once pagination is exhausted, mark this root done for this window.
            if not new_next_token:
                state["completed"] = True
        else:
            # Don't set completed=true permanently. Reaching the end of available results
            # for THIS run is normal; we want the next scheduled run to check for new posts.
            state["completed"] = False
        save_checkpoint(CHECKPOINT_PATH, checkpoint)

        if not new_next_token:
            # Pagination finished: advance newest_id (monotonic snowflake ids).
            if checkpoint_namespace != "reply_captures" and not dry_run and run_newest_id:
                prev = state.get("newest_id")
                try:
                    advance = prev is None or int(run_newest_id) > int(prev)
                except (TypeError, ValueError):
                    advance = True
                if advance:
                    state["newest_id"] = run_newest_id
                    save_checkpoint(CHECKPOINT_PATH, checkpoint)
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
        discovery_source="hashtag_capture",
        checkpoint=checkpoint,
        stats=stats,
        dry_run=dry_run,
        max_results=max_results,
        checkpoint_namespace="queries",
    )
    return stats


def run_single_topic(
    client: Client,
    config: Dict[str, Any],
    needle: str,
    dry_run: bool,
    max_results: int,
) -> CaptureStats:
    """Capture only one configured topic query via --topic-query (substring match).

    Unlike --tag there is no ad-hoc fallback: topic queries carry their own
    min_faves thresholds and must come from config."""
    stats = CaptureStats()
    checkpoint = load_checkpoint(CHECKPOINT_PATH)

    target = None
    for item in iter_topic_queries(config):
        if needle.lower() in str(item.get("captured_via_query", "")).lower():
            target = item
            break
    if target is None:
        raise ValueError(f"No configured topic query matches {needle!r} (see twitter.topic_queries).")

    run_capture_for_query(
        client=client,
        query=target["query"],
        query_key=target["query_key"],
        captured_via_query=target["captured_via_query"],
        discovery_source="hashtag_capture",
        checkpoint=checkpoint,
        stats=stats,
        dry_run=dry_run,
        max_results=max_results,
        checkpoint_namespace="queries",
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
            discovery_source="hashtag_capture",
            checkpoint=checkpoint,
            stats=stats,
            dry_run=dry_run,
            max_results=max_results,
            checkpoint_namespace="queries",
        )
        print(
            f"Running totals: posts={stats.posts_captured}, users={stats.new_users_discovered}, "
            f"requests={stats.requests_made}, est_max_credits=${stats.est_max_credits:.2f}"
        )
    return stats


DEFAULT_CAPTURED_VIA_TAGS = (
    "#ASCO26,#ASCO2026,#lcsm,#bcsm,#mmsm,#gyncsm,#kidneycancer,#prostatecancer,"
    "#bladdercancer,#colorectalcancer,#multiplemyeloma,#sclc,#melanoma,#ctdna,"
    "#liquidbiopsy,#oncodaily"
)


def run_capture_replies(
    client: Client,
    args: argparse.Namespace,
    dry_run: bool,
    max_results: int,
) -> CaptureStats:
    """Capture reply chains for high-engagement ASCO root posts."""
    stats = CaptureStats()
    checkpoint = load_checkpoint(CHECKPOINT_PATH)

    tags = [t.strip() for t in args.captured_via_tags.split(",") if t.strip()]
    posted_since = args.posted_since.strip()
    if len(posted_since) == 10:
        posted_since = f"{posted_since}T00:00:00Z"

    print(
        f"[replies] Selecting roots: platform=twitter, posted_at>={posted_since}, "
        f"engagement_replies>={args.min_replies}, tags={len(tags)}"
    )

    _ = client
    resp = with_supabase_retry(
        lambda c: c.table("social_posts_v2")
        .select("platform_post_id, engagement_replies")
        .eq("platform", "twitter")
        .or_("is_reply.is.null,is_reply.eq.false")
        .gte("posted_at", posted_since)
        .gte("engagement_replies", args.min_replies)
        .in_("captured_via_query", tags)
        .order("engagement_replies", desc=True)
        .execute()
    )

    roots = resp.data or []
    print(f"[replies] Found {len(roots)} eligible root posts")

    roots_processed = 0
    roots_skipped = 0

    total_roots = len(roots)
    for idx, row in enumerate(roots, start=1):
        root_id = str(row.get("platform_post_id") or "").strip()
        if not root_id:
            continue

        query_key = f"reply:{root_id}"
        reply_ns = checkpoint.setdefault("reply_captures", {})
        state = reply_ns.get(query_key, {})
        if state.get("completed"):
            roots_skipped += 1
            continue

        roots_processed += 1
        before_posts = stats.posts_captured
        before_users = stats.new_users_discovered
        before_est_max_credits = stats.est_max_credits

        run_capture_for_query(
            client=client,
            query=build_reply_query(root_id),
            query_key=query_key,
            captured_via_query=f"reply_to:{root_id}",
            discovery_source=args.discovery_source,
            checkpoint=checkpoint,
            stats=stats,
            dry_run=dry_run,
            max_results=max_results,
            checkpoint_namespace="reply_captures",
        )

        n_posts = stats.posts_captured - before_posts
        n_users = stats.new_users_discovered - before_users
        est_max_credits_delta = stats.est_max_credits - before_est_max_credits
        print(
            f"[{idx}/{total_roots}] Reply capture: root_id={root_id}, posts={n_posts}, users={n_users}, "
            f"est_max_credits=${est_max_credits_delta:.2f}"
        )

    print("\n=== Reply capture summary ===")
    print(f"Eligible roots: {len(roots)}")
    print(f"Roots processed: {roots_processed}")
    print(f"Roots skipped (completed): {roots_skipped}")
    print(f"Total replies captured: {stats.posts_captured}")
    print(f"Total new users discovered: {stats.new_users_discovered}")
    print(f"Estimated max credits: ${stats.est_max_credits:.2f}")

    return stats


def print_summary(stats: CaptureStats) -> None:
    """Print posts captured, new users discovered, and estimated max credits."""
    print("\n=== Twitter capture summary ===")
    print(f"Posts read: {stats.posts_read} @ ${POST_READ_COST_USD:.3f} each (per X pricing)")
    print(f"Users read: {stats.users_read} @ ${USER_READ_COST_USD:.3f} each (per X pricing)")
    print(f"Posts captured: {stats.posts_captured}")
    print(f"New users discovered: {stats.new_users_discovered}")
    print(f"Requests made: {stats.requests_made}")
    print(f"Estimated max credits: ${stats.est_max_credits:.2f}")
    print(f"  (upper bound assuming no tier quotas or X-side credits;")
    print(f"   actual billed amount in X dashboard is typically lower)")


def main() -> None:
    load_dotenv()
    parser = argparse.ArgumentParser(description="Twitter/X social capture (architecture outline).")
    parser.add_argument("--tag", type=str, default=None, help="Single hashtag to capture, e.g. #ASCO2026")
    parser.add_argument(
        "--topic-query",
        type=str,
        default=None,
        help="Single configured topic query to capture, matched by substring (e.g. NSCLC). Must exist in config twitter.topic_queries.",
    )
    parser.add_argument("--all", action="store_true", help="Capture all active hashtags and topic queries")
    parser.add_argument(
        "--profile",
        type=str,
        default=None,
        help="Named congress profile from config (e.g., ASCO, ESMO, EASL, AASLD, EHA). Captures all primary + secondary hashtags for that profile.",
    )
    parser.add_argument(
        "--capture-replies",
        action="store_true",
        help="Capture reply chains for existing high-engagement root posts",
    )
    parser.add_argument(
        "--min-replies",
        type=int,
        default=3,
        help="Minimum engagement_replies on root post for reply capture selection (default: 3)",
    )
    parser.add_argument(
        "--discovery-source",
        type=str,
        default="asco_2026",
        help="Value written to social_users_v2.discovery_source for new repliers (default: asco_2026)",
    )
    parser.add_argument(
        "--posted-since",
        type=str,
        default="2026-05-28",
        help="Minimum posted_at ISO date for root post selection (default: 2026-05-28)",
    )
    parser.add_argument(
        "--captured-via-tags",
        type=str,
        default=DEFAULT_CAPTURED_VIA_TAGS,
        help="Comma-separated captured_via_query tags eligible as reply-capture parents",
    )
    parser.add_argument("--dry-run", action="store_true", help="No DB writes, no paid API calls (cached fixtures)")
    parser.add_argument("--max-results", type=int, default=100, help="Tweets per API page (10-100).")
    args = parser.parse_args()

    config = load_config(CONFIG_PATH)
    if not twitter_enabled(config):
        print("Twitter capture disabled by config: twitter.enabled=false")
        return

    mode_flags = [bool(args.tag), bool(args.topic_query), bool(args.all), bool(args.profile), bool(args.capture_replies)]
    if sum(mode_flags) != 1:
        raise ValueError("Specify exactly one mode: --tag, --topic-query, --all, --profile, or --capture-replies.")

    client = get_supabase_client()
    if args.capture_replies:
        stats = run_capture_replies(
            client,
            args,
            dry_run=args.dry_run,
            max_results=args.max_results,
        )
    elif args.topic_query:
        stats = run_single_topic(
            client,
            config,
            args.topic_query,
            dry_run=args.dry_run,
            max_results=args.max_results,
        )
    elif args.tag:
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
        calculate_est_max_credits(stats)
    if not args.capture_replies:
        print_summary(stats)


if __name__ == "__main__":
    main()
