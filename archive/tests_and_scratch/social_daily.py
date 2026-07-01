from __future__ import annotations

"""
Architecture outline for daily social pipeline orchestration.

Runs capture (twitter + bluesky, respecting platform enabled flags) followed by
matching, then prints consolidated per-platform/per-confidence summary.
"""

import argparse
from dataclasses import dataclass
from typing import Dict


@dataclass
class DailySummary:
    twitter_posts: int = 0
    twitter_new_users: int = 0
    twitter_cost_usd: float = 0.0
    bluesky_posts: int = 0
    bluesky_new_users: int = 0
    bluesky_cost_usd: float = 0.0
    matches_high: int = 0
    matches_medium: int = 0
    matches_low: int = 0
    matches_rejected: int = 0


def run_twitter_capture_all(dry_run: bool) -> Dict[str, float]:
    """Call twitter capture for all active queries."""
    raise NotImplementedError


def run_bluesky_capture_all(dry_run: bool) -> Dict[str, float]:
    """Call bluesky capture for all active hashtags."""
    raise NotImplementedError


def run_dol_matching(platform_filter: str | None = None) -> Dict[str, int]:
    """Run matching for newly discovered social users."""
    raise NotImplementedError


def assemble_summary(
    twitter_stats: Dict[str, float],
    bluesky_stats: Dict[str, float],
    matching_stats: Dict[str, int],
) -> DailySummary:
    raise NotImplementedError


def print_daily_summary(summary: DailySummary) -> None:
    """Output daily summary log with platform capture + matching + cost."""
    raise NotImplementedError


def main() -> None:
    parser = argparse.ArgumentParser(description="Daily social orchestration (architecture outline).")
    parser.add_argument("--dry-run", action="store_true", help="No DB writes/API-cost paths.")
    args = parser.parse_args()

    twitter_stats = run_twitter_capture_all(dry_run=args.dry_run)
    bluesky_stats = run_bluesky_capture_all(dry_run=args.dry_run)
    matching_stats = run_dol_matching(platform_filter=None)

    summary = assemble_summary(twitter_stats, bluesky_stats, matching_stats)
    print_daily_summary(summary)


if __name__ == "__main__":
    main()
