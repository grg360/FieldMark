"""
social_update.py — one-command social pipeline.

Captures fresh posts via twitter_capture.py, tags them by therapeutic area
using social_capture_config.json, and refreshes the four social analytics
materialized views.

Usage:
  python social_update.py --profile ASCO
  python social_update.py --tag "#EASL26"
  python social_update.py --all
  python social_update.py --refresh-only
  python social_update.py --profile ASCO --dry-run
"""

from __future__ import annotations

import argparse
import json
import os
import subprocess
import sys
import time
from datetime import datetime
from pathlib import Path
from typing import Dict, List, Optional

from dotenv import load_dotenv
from supabase import Client, create_client


SCRIPT_DIR = Path(__file__).parent
CONFIG_PATH = SCRIPT_DIR / "social_capture_config.json"
CAPTURE_SCRIPT = SCRIPT_DIR / "twitter_capture.py"


def get_required_env(name: str) -> str:
    value = os.getenv(name, "").strip()
    if not value:
        raise EnvironmentError(f"Missing required environment variable: {name}")
    return value


def init_supabase() -> Client:
    return create_client(get_required_env("SUPABASE_URL"), get_required_env("SUPABASE_KEY"))


def load_hashtag_ta_map() -> tuple[Dict[str, str], Dict[str, str]]:
    """Read social_capture_config.json and build query -> therapeutic_area maps.

    Returns (hashtag_map, topic_map):
      hashtag_map — lowercase hashtag -> TA slug, e.g. {'#asco26': 'oncology'}.
      topic_map — topic query text (config case, as stored in
        captured_via_query) -> TA slug. Topic-query posts were previously never
        TA-tagged: the map was hashtag-only, so their rows stayed
        therapeutic_areas NULL and invisible to the TA-scoped social views.
    """
    if not CONFIG_PATH.exists():
        raise FileNotFoundError(f"Config not found: {CONFIG_PATH}")

    with open(CONFIG_PATH, "r", encoding="utf-8") as f:
        config = json.load(f)

    mapping: Dict[str, str] = {}
    twitter_tags = config.get("twitter", {}).get("active_hashtags", [])
    for entry in twitter_tags:
        tag = entry.get("tag", "").lower().strip()
        ta = entry.get("therapeutic_area", "").strip()
        if tag and ta:
            mapping[tag] = ta

    topic_mapping: Dict[str, str] = {}
    for entry in config.get("twitter", {}).get("topic_queries", []):
        q = str(entry.get("query", "")).strip()
        ta = str(entry.get("therapeutic_area", "")).strip()
        if q and ta:
            topic_mapping[q] = ta

    return mapping, topic_mapping


def run_capture(args: argparse.Namespace) -> int:
    """Run twitter_capture.py with the appropriate flags. Returns its exit code."""
    cmd: List[str] = [sys.executable, str(CAPTURE_SCRIPT)]

    if args.profile:
        cmd.extend(["--profile", args.profile])
    elif args.tag:
        cmd.extend(["--tag", args.tag])
    elif args.all:
        cmd.append("--all")

    if args.dry_run:
        cmd.append("--dry-run")

    print(f"[capture] Running: {' '.join(cmd)}")
    print("=" * 60)

    result = subprocess.run(cmd, cwd=str(SCRIPT_DIR))

    print("=" * 60)
    print(f"[capture] Completed with exit code: {result.returncode}")
    return result.returncode


def compute_discovery_source(args: argparse.Namespace) -> str:
    """Derive discovery_source for reply capture from CLI args."""
    if args.reply_discovery_source:
        return args.reply_discovery_source
    if args.profile:
        return f"{args.profile.lower()}_{datetime.now().year}"
    return "reply_capture"


def format_posted_since(t0_epoch: float) -> str:
    """Return YYYY-MM-DD for the date t0 falls on (for --posted-since)."""
    return datetime.fromtimestamp(t0_epoch).strftime("%Y-%m-%d")


def run_reply_capture(args: argparse.Namespace, t0_epoch: float) -> int:
    """Run twitter_capture.py --capture-replies scoped to today's roots. Returns exit code."""
    cmd: List[str] = [
        sys.executable,
        str(CAPTURE_SCRIPT),
        "--capture-replies",
        "--min-replies",
        str(args.reply_min_replies),
        "--posted-since",
        format_posted_since(t0_epoch),
        "--discovery-source",
        compute_discovery_source(args),
    ]
    if args.dry_run:
        cmd.append("--dry-run")

    print(f"\n[replies] Running: {' '.join(cmd)}")
    print("=" * 60)
    result = subprocess.run(cmd, cwd=str(SCRIPT_DIR))
    print("=" * 60)
    print(f"[replies] Completed with exit code: {result.returncode}")
    return result.returncode


def backfill_ta_tags(
    client: Client,
    hashtag_ta_map: Dict[str, str],
    topic_ta_map: Dict[str, str] | None = None,
) -> Dict[str, int]:
    """Tag any NULL therapeutic_areas rows in social_posts_v2 based on captured_via_query.

    Returns a dict of {ta_slug: rows_updated}.
    """
    ta_to_hashtags: Dict[str, List[str]] = {}
    for tag, ta in hashtag_ta_map.items():
        ta_to_hashtags.setdefault(ta, []).append(tag)

    results: Dict[str, int] = {}

    # Topic-query posts: captured_via_query stores the exact config query text
    # (parens/quotes make it unsafe for the or_/ilike list below), so match each
    # with a plain eq — same source string, so case always agrees.
    for q, ta in (topic_ta_map or {}).items():
        resp = (
            client.table("social_posts_v2")
            .update({"therapeutic_areas": [ta]})
            .eq("captured_via_query", q)
            .is_("therapeutic_areas", "null")
            .execute()
        )
        results[ta] = results.get(ta, 0) + len(resp.data or [])

    for ta, hashtags in ta_to_hashtags.items():
        # Case-insensitive match: captured_via_query stores the config's original
        # case (e.g. "#WCLC26") while the map keys are lowercased — a plain IN
        # never matched, so the backfill silently no-oped. ilike with no wildcard
        # is exact-match, case-insensitive.
        #
        # Update by filter directly (no select-then-IN-by-id round trip: 1000
        # UUIDs in a querystring exceeds the request-line limit and 400s).
        resp = (
            client.table("social_posts_v2")
            .update({"therapeutic_areas": [ta]})
            .or_(",".join(f"captured_via_query.ilike.{t}" for t in hashtags))
            .is_("therapeutic_areas", "null")
            .execute()
        )
        results[ta] = results.get(ta, 0) + len(resp.data or [])

    return results


def refresh_views(client: Client) -> bool:
    """Call the refresh_social_analytics() Postgres function via RPC."""
    print("[refresh] Calling refresh_social_analytics()...")
    try:
        client.rpc("refresh_social_analytics").execute()
        print("[refresh] All 4 materialized views refreshed.")
        return True
    except Exception as e:
        print(f"[refresh] ERROR: {e}")
        return False


def print_summary(
    args: argparse.Namespace,
    captured_exit_code: Optional[int],
    backfill_results: Dict[str, int],
    refresh_ok: bool,
    elapsed: float,
    reply_exit_code: Optional[int],
) -> None:
    print("\n" + "=" * 60)
    print("=== social_update summary ===")
    print("=" * 60)
    if captured_exit_code is not None:
        print(f"Capture exit code: {captured_exit_code}")
    else:
        print("Capture: skipped (--refresh-only)")

    if backfill_results:
        total = sum(backfill_results.values())
        print(f"TA tags applied: {total} total")
        for ta, n in sorted(backfill_results.items(), key=lambda x: -x[1]):
            if n > 0:
                print(f"  - {ta}: {n}")
    else:
        print("TA tags: none needed")

    print(f"Views refreshed: {'YES' if refresh_ok else 'NO (errored)'}")

    if args.include_replies:
        if reply_exit_code is None and args.refresh_only:
            print("Reply capture: skipped (--refresh-only)")
        elif reply_exit_code is None and args.dry_run:
            print("Reply capture: skipped (--dry-run)")
        elif reply_exit_code == 0:
            print("Reply capture: SUCCESS")
        elif reply_exit_code is not None:
            print(f"Reply capture: FAILED (exit code {reply_exit_code})")

    print(f"Total time: {elapsed:.1f}s")
    print("=" * 60)


def main() -> int:
    load_dotenv()
    parser = argparse.ArgumentParser(
        description="One-command social pipeline: capture + tag + refresh."
    )
    group = parser.add_mutually_exclusive_group(required=True)
    group.add_argument("--profile", help="Run twitter_capture --profile X")
    group.add_argument("--tag", help="Run twitter_capture --tag X")
    group.add_argument("--all", action="store_true", help="Run twitter_capture --all")
    group.add_argument(
        "--refresh-only",
        action="store_true",
        help="Skip capture, only run TA backfill + view refresh",
    )

    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Pass --dry-run to twitter_capture (no DB writes from capture)",
    )
    parser.add_argument(
        "--include-replies",
        action="store_true",
        help="After hashtag capture completes, run reply capture against today's newly-captured roots.",
    )
    parser.add_argument(
        "--reply-min-replies",
        type=int,
        default=3,
        help="Minimum engagement_replies threshold for reply capture (default: 3).",
    )
    parser.add_argument(
        "--reply-discovery-source",
        type=str,
        default=None,
        help="discovery_source value for new repliers. Default derives from --profile (e.g., 'asco_2026') or falls back to 'reply_capture'.",
    )

    args = parser.parse_args()

    t0 = time.time()

    capture_exit_code: Optional[int] = None
    if not args.refresh_only:
        capture_exit_code = run_capture(args)
        if capture_exit_code != 0:
            print(f"[capture] Failed with exit code {capture_exit_code}. Aborting.")
            return capture_exit_code

    client = init_supabase()

    # ASCII-only console output: Windows cp1252 consoles crash on U+2192 etc.
    print("\n[tag] Loading hashtag -> TA map from social_capture_config.json...")
    hashtag_ta_map, topic_ta_map = load_hashtag_ta_map()
    print(f"[tag] Map loaded: {len(hashtag_ta_map)} hashtags + {len(topic_ta_map)} topic queries across {len(set(hashtag_ta_map.values()) | set(topic_ta_map.values()))} TAs")

    if args.dry_run:
        print("[tag] Dry run - skipping TA backfill (no DB writes)")
        backfill_results: Dict[str, int] = {}
    else:
        print("[tag] Running TA backfill on social_posts_v2...")
        backfill_results = backfill_ta_tags(client, hashtag_ta_map, topic_ta_map)

    if args.dry_run:
        print("[refresh] Dry run - skipping view refresh")
        refresh_ok = False
    else:
        refresh_ok = refresh_views(client)

    reply_exit_code: Optional[int] = None
    if args.include_replies and not args.refresh_only and not args.dry_run:
        reply_exit_code = run_reply_capture(args, t0)

    elapsed = time.time() - t0
    print_summary(args, capture_exit_code, backfill_results, refresh_ok, elapsed, reply_exit_code)

    base_success = (args.refresh_only or capture_exit_code == 0) and (refresh_ok or args.dry_run)
    if not base_success:
        return 1
    if reply_exit_code is not None and reply_exit_code != 0:
        print("\n[warning] Hashtag capture and refresh succeeded, but reply capture failed.")
        print("[warning] Reply capture can be re-run manually: python twitter_capture.py --capture-replies")
        return 2
    return 0


if __name__ == "__main__":
    sys.exit(main())
