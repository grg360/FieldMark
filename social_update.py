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


def load_hashtag_ta_map() -> Dict[str, str]:
    """Read social_capture_config.json and build a hashtag -> therapeutic_area map.

    Returns lowercase hashtag -> TA slug, e.g. {'#asco26': 'oncology', '#easl2026': 'hepatology'}.
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

    return mapping


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


def backfill_ta_tags(client: Client, hashtag_ta_map: Dict[str, str]) -> Dict[str, int]:
    """Tag any NULL therapeutic_areas rows in social_posts_v2 based on captured_via_query.

    Returns a dict of {ta_slug: rows_updated}.
    """
    ta_to_hashtags: Dict[str, List[str]] = {}
    for tag, ta in hashtag_ta_map.items():
        ta_to_hashtags.setdefault(ta, []).append(tag)

    results: Dict[str, int] = {}

    for ta, hashtags in ta_to_hashtags.items():
        select_resp = (
            client.table("social_posts_v2")
            .select("id")
            .in_("captured_via_query", hashtags)
            .is_("therapeutic_areas", "null")
            .execute()
        )

        ids = [row["id"] for row in (select_resp.data or [])]

        if not ids:
            results[ta] = 0
            continue

        updated = 0
        BATCH = 1000
        for i in range(0, len(ids), BATCH):
            batch_ids = ids[i : i + BATCH]
            client.table("social_posts_v2").update(
                {"therapeutic_areas": [ta]}
            ).in_("id", batch_ids).execute()
            updated += len(batch_ids)

        results[ta] = updated

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
    captured_exit_code: Optional[int],
    backfill_results: Dict[str, int],
    refresh_ok: bool,
    elapsed: float,
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

    args = parser.parse_args()

    t0 = time.time()

    capture_exit_code: Optional[int] = None
    if not args.refresh_only:
        capture_exit_code = run_capture(args)
        if capture_exit_code != 0:
            print(f"[capture] Failed with exit code {capture_exit_code}. Aborting.")
            return capture_exit_code

    client = init_supabase()

    print("\n[tag] Loading hashtag → TA map from social_capture_config.json...")
    hashtag_ta_map = load_hashtag_ta_map()
    print(f"[tag] Map loaded: {len(hashtag_ta_map)} hashtags across {len(set(hashtag_ta_map.values()))} TAs")

    if args.dry_run:
        print("[tag] Dry run — skipping TA backfill (no DB writes)")
        backfill_results: Dict[str, int] = {}
    else:
        print("[tag] Running TA backfill on social_posts_v2...")
        backfill_results = backfill_ta_tags(client, hashtag_ta_map)

    if args.dry_run:
        print("[refresh] Dry run — skipping view refresh")
        refresh_ok = False
    else:
        refresh_ok = refresh_views(client)

    elapsed = time.time() - t0
    print_summary(capture_exit_code, backfill_results, refresh_ok, elapsed)

    return 0 if (args.refresh_only or capture_exit_code == 0) and (refresh_ok or args.dry_run) else 1


if __name__ == "__main__":
    sys.exit(main())
