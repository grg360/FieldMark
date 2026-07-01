from __future__ import annotations

"""
Architecture outline for social data quality flagging.

Flags suspicious social_users rows for human review without deleting data and
without modifying dol_matches.
"""

import argparse
from typing import Dict, List


SUSPICIOUS_KEYWORDS = {
    "artist",
    "lawyer",
    "actor",
    "musician",
    "engineer",
    "developer",
}


def fetch_social_users_for_audit(platform_filter: str | None = None) -> List[Dict]:
    """Fetch candidate social_users rows for quality checks."""
    raise NotImplementedError


def has_medical_credential_or_institution(user: Dict) -> bool:
    """Return True if profile suggests medical professional context."""
    raise NotImplementedError


def should_flag_suspicious(user: Dict) -> bool:
    """
    Flag criteria:
    - bio contains suspicious non-medical keywords
    - and lacks medical credential/institution signals
    """
    raise NotImplementedError


def set_quality_flag(user_id: str, flag: str) -> None:
    """Update social_users.data_quality_flag to suspicious (or leave clean)."""
    raise NotImplementedError


def run_quality_audit(platform_filter: str | None = None, dry_run: bool = True) -> Dict[str, int]:
    """Run quality pass and return counts; does NOT touch dol_matches."""
    raise NotImplementedError


def print_summary(stats: Dict[str, int]) -> None:
    raise NotImplementedError


def main() -> None:
    parser = argparse.ArgumentParser(description="Social quality audit (architecture outline).")
    parser.add_argument("--platform-filter", choices=["twitter", "bluesky"], default=None)
    parser.add_argument("--dry-run", action="store_true", help="Preview only; no DB updates.")
    args = parser.parse_args()

    stats = run_quality_audit(platform_filter=args.platform_filter, dry_run=args.dry_run)
    print_summary(stats)


if __name__ == "__main__":
    main()
