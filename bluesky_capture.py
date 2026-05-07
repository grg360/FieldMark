from __future__ import annotations

"""
Architecture outline for Bluesky capture pipeline.

Independent from Twitter capture. Reads social_capture_config.json and writes
platform-tagged rows into social_posts/social_users with platform='bluesky'.
"""

import argparse
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Dict, Iterable, List, Optional, Set, Tuple


CONFIG_PATH = Path("social_capture_config.json")
CHECKPOINT_PATH = Path("bluesky_capture_checkpoint.json")


@dataclass
class CaptureStats:
    posts_captured: int = 0
    new_users_discovered: int = 0
    estimated_cost_usd: float = 0.0  # expected 0 for public Bluesky API
    requests_made: int = 0


def load_config(path: Path) -> Dict[str, Any]:
    raise NotImplementedError


def load_checkpoint(path: Path) -> Dict[str, Any]:
    raise NotImplementedError


def save_checkpoint(path: Path, checkpoint: Dict[str, Any]) -> None:
    raise NotImplementedError


def bluesky_enabled(config: Dict[str, Any]) -> bool:
    raise NotImplementedError


def iter_active_hashtags(config: Dict[str, Any]) -> Iterable[str]:
    """Yield bluesky.active_hashtags."""
    raise NotImplementedError


def fetch_bluesky_posts(
    hashtag: str,
    cursor: Optional[str],
    dry_run: bool,
) -> Tuple[List[Dict[str, Any]], Optional[str]]:
    """
    Fetch one page of public Bluesky posts for a hashtag.
    Returns (posts, next_cursor).
    """
    raise NotImplementedError


def map_post_to_social_posts_row(post: Dict[str, Any], captured_via_query: str) -> Dict[str, Any]:
    """Map Bluesky post payload into social_posts row."""
    raise NotImplementedError


def upsert_social_posts(rows: List[Dict[str, Any]], dry_run: bool) -> int:
    """ON CONFLICT(platform, platform_post_id) DO NOTHING."""
    raise NotImplementedError


def extract_unique_handles(posts: List[Dict[str, Any]]) -> Set[str]:
    raise NotImplementedError


def social_user_exists(platform: str, handle: str) -> bool:
    raise NotImplementedError


def fetch_bluesky_profile(handle: str, dry_run: bool) -> Dict[str, Any]:
    raise NotImplementedError


def map_profile_to_social_users_row(profile: Dict[str, Any]) -> Dict[str, Any]:
    raise NotImplementedError


def upsert_social_user(row: Dict[str, Any], dry_run: bool) -> bool:
    raise NotImplementedError


def run_capture_for_hashtag(
    hashtag: str,
    checkpoint: Dict[str, Any],
    stats: CaptureStats,
    dry_run: bool,
) -> None:
    raise NotImplementedError


def run_single_tag(config: Dict[str, Any], tag: str, dry_run: bool) -> CaptureStats:
    raise NotImplementedError


def run_all(config: Dict[str, Any], dry_run: bool) -> CaptureStats:
    raise NotImplementedError


def print_summary(stats: CaptureStats) -> None:
    raise NotImplementedError


def main() -> None:
    parser = argparse.ArgumentParser(description="Bluesky social capture (architecture outline).")
    parser.add_argument("--tag", type=str, default=None, help="Single hashtag to capture, e.g. #medsky")
    parser.add_argument("--all", action="store_true", help="Capture all active hashtags")
    parser.add_argument("--dry-run", action="store_true", help="No DB writes, use cached fixtures")
    args = parser.parse_args()

    config = load_config(CONFIG_PATH)
    if not bluesky_enabled(config):
        print("Bluesky capture disabled by config: bluesky.enabled=false")
        return

    if args.tag and args.all:
        raise ValueError("Use either --tag or --all, not both.")
    if not args.tag and not args.all:
        raise ValueError("Specify one mode: --tag or --all.")

    if args.tag:
        stats = run_single_tag(config, args.tag, dry_run=args.dry_run)
    else:
        stats = run_all(config, dry_run=args.dry_run)
    print_summary(stats)


if __name__ == "__main__":
    main()
