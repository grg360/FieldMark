"""
Scheduled social capture - the cadence policy for congress hashtags.

Weekly baseline (Mondays): capture every dated, unexpired hashtag in
social_capture_config.json (active_until != null). Evergreen community tags
(active_until: null) are deliberately NOT auto-captured - price their weekly
volume with a manual probe before adding them to the schedule.

Daily escalation: a tag is captured every day from DAILY_WINDOW_DAYS before
its meeting's start_date through end_date - the run-up curve is what we want
resolution on, and the live window matters even more. Meeting dates come from
config/congresses.json, matched by hashtag with 4-digit years collapsed
(#wclc2026 == #wclc26). Dated tags with no congress entry (e.g. #AASLD2026)
stay weekly-only.

Invoked by scripts/run_social_capture.ps1 (Windows Task Scheduler, daily).
Runs twitter_capture.py --tag per selected tag, then a single
social_update.py --refresh-only for TA backfill + view refresh.

Console output is deliberately ASCII-only: unattended runs die silently on
cp1252 consoles otherwise.
"""

import argparse
import json
import re
import subprocess
import sys
from datetime import date, timedelta
from pathlib import Path
from typing import Dict, Optional, Tuple

SCRIPT_DIR = Path(__file__).parent
REPO_ROOT = SCRIPT_DIR.parent.parent
CONFIG_PATH = SCRIPT_DIR / "social_capture_config.json"
CONGRESSES_PATH = REPO_ROOT / "config" / "congresses.json"

DAILY_WINDOW_DAYS = 14
WEEKLY_DAY = 0  # Monday - matches the reingest cadence week


def canon(tag: str) -> str:
    """Lowercase and collapse 4-digit years so #WCLC2026 matches #wclc26."""
    return re.sub(r"20(\d{2})$", r"\1", tag.strip().lower())


def congress_windows() -> Dict[str, Tuple[date, date, str]]:
    """canonical hashtag -> (start_date, end_date, slug) from config/congresses.json."""
    data = json.loads(CONGRESSES_PATH.read_text(encoding="utf-8"))
    windows: Dict[str, Tuple[date, date, str]] = {}
    for c in data["congresses"]:
        for h in c.get("hashtags", []):
            windows[canon(h)] = (
                date.fromisoformat(c["start_date"]),
                date.fromisoformat(c["end_date"]),
                c["slug"],
            )
    return windows


def main() -> int:
    ap = argparse.ArgumentParser(description="Cadence-aware scheduled social capture.")
    ap.add_argument("--dry-run", action="store_true", help="Pass through to capture/refresh (no paid calls, no DB writes)")
    ap.add_argument("--force-weekly", action="store_true", help="Treat today as the weekly baseline day")
    ap.add_argument("--today", default=None, metavar="YYYY-MM-DD", help="Reference-date override for testing")
    args = ap.parse_args()

    today = date.fromisoformat(args.today) if args.today else date.today()
    weekly = args.force_weekly or today.weekday() == WEEKLY_DAY

    cfg = json.loads(CONFIG_PATH.read_text(encoding="utf-8"))
    windows = congress_windows()

    selected = []
    for entry in cfg.get("twitter", {}).get("active_hashtags", []):
        tag = entry.get("tag", "")
        until = entry.get("active_until")
        if not tag or not until:
            continue  # evergreen community tags are not auto-captured
        if date.fromisoformat(until) < today:
            continue  # expired
        w: Optional[Tuple[date, date, str]] = windows.get(canon(tag))
        in_daily = w is not None and (w[0] - timedelta(days=DAILY_WINDOW_DAYS)) <= today <= w[1]
        if in_daily or weekly:
            reason = f"daily-window:{w[2]}" if in_daily else "weekly"
            selected.append((tag, reason))

    mode = "weekly baseline" if weekly else "daily check"
    print(f"[scheduled_capture] {today.isoformat()} ({mode}): {len(selected)} tag(s) selected", flush=True)
    if not selected:
        print("[scheduled_capture] Nothing in a daily window and not the weekly day. Done.", flush=True)
        return 0

    failures = 0
    for tag, reason in selected:
        print(f"[scheduled_capture] Capturing {tag} ({reason})", flush=True)
        cmd = [sys.executable, "-u", str(SCRIPT_DIR / "twitter_capture.py"), "--tag", tag]
        if args.dry_run:
            cmd.append("--dry-run")
        rc = subprocess.run(cmd, cwd=str(SCRIPT_DIR)).returncode
        if rc != 0:
            failures += 1
            print(f"[scheduled_capture] {tag} FAILED with exit code {rc}", flush=True)

    # One TA backfill + view refresh for the whole batch.
    refresh_cmd = [sys.executable, "-u", str(SCRIPT_DIR / "social_update.py"), "--refresh-only"]
    if args.dry_run:
        refresh_cmd.append("--dry-run")
    refresh_rc = subprocess.run(refresh_cmd, cwd=str(SCRIPT_DIR)).returncode

    print(
        f"[scheduled_capture] Done: {len(selected) - failures}/{len(selected)} captures ok, "
        f"refresh exit={refresh_rc}",
        flush=True,
    )
    return 1 if (failures or refresh_rc) else 0


if __name__ == "__main__":
    sys.exit(main())
