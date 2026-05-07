from __future__ import annotations

import argparse
import os
import re
from collections import Counter
from dataclasses import dataclass
from typing import Dict, List, Optional, Tuple

from dotenv import load_dotenv
from langdetect import LangDetectException, detect
from supabase import Client, create_client

COMMON_SURNAME_ONLY = {"brown", "smith", "khan", "wu", "jones", "mu"}
BIO_BAD_PATTERNS = [
    "lawyer",
    "advogado",
    "graphic designer",
    "grafico",
    "founded in 19",
    "founded in 20",
    "we offer",
    "we are a",
    "we provide",
    "cricket enthusiast",
    "crypto",
    "trader",
    "ms1",
    "ms2",
    "ms3",
    "ms4",
    "pgy-1",
    "pgy-2",
    "undergraduate",
    "high school",
    "real estate",
    "marketing",
]


@dataclass
class PlatformEval:
    platform: str
    passed: bool
    reasons: List[str]


def get_required_env(name: str) -> str:
    value = os.getenv(name)
    if not value:
        raise EnvironmentError(f"Missing required environment variable: {name}")
    return value


def init_supabase() -> Client:
    return create_client(get_required_env("SUPABASE_URL"), get_required_env("SUPABASE_KEY"))


def norm_text(value: Optional[str]) -> str:
    return " ".join(str(value or "").strip().split())


def norm_handle(value: Optional[str]) -> str:
    return norm_text(value).lstrip("@").lower()


def alpha_only(value: str) -> str:
    return re.sub(r"[^a-z]", "", value.lower())


def detect_language_safe(text: str) -> Optional[str]:
    t = norm_text(text)
    if not t:
        return None
    try:
        return detect(t)
    except LangDetectException:
        return None


def fetch_candidates(supabase: Client) -> List[Dict]:
    rows: List[Dict] = []
    offset = 0
    page = 1000
    while True:
        batch = (
            supabase.table("hcps")
            .select(
                "id,first_name,last_name,country,twitter_handle,twitter_followers,twitter_bio,"
                "twitter_following,twitter_tweet_count,twitter_verified,twitter_enriched_at,"
                "bluesky_handle,bluesky_followers,bluesky_bio,bluesky_posts,bluesky_enriched_at"
            )
            .or_("twitter_handle.not.is.null,bluesky_handle.not.is.null")
            .order("id")
            .range(offset, offset + page - 1)
            .execute()
            .data
            or []
        )
        if not batch:
            break
        rows.extend(batch)
        if len(batch) < page:
            break
        offset += page
    return rows


def build_handle_counts(rows: List[Dict], field: str) -> Counter:
    counts: Counter = Counter()
    for row in rows:
        handle = norm_handle(row.get(field))
        if handle:
            counts[handle] += 1
    return counts


def evaluate_platform(
    *,
    platform: str,
    handle: Optional[str],
    followers: Optional[int],
    bio: Optional[str],
    first_name: Optional[str],
    last_name: Optional[str],
    country: Optional[str],
    duplicate_counts: Counter,
) -> PlatformEval:
    h = norm_handle(handle)
    b = norm_text(bio)
    fn = alpha_only(norm_text(first_name))
    ln = alpha_only(norm_text(last_name))
    reasons: List[str] = []

    if not h:
        return PlatformEval(platform=platform, passed=False, reasons=["missing_handle"])

    if len(h) < 4:
        reasons.append("handle_too_short")

    if ln and h == ln:
        reasons.append("handle_equals_last_name")

    h_alpha = alpha_only(h)
    if h_alpha in COMMON_SURNAME_ONLY:
        if not fn or fn not in h_alpha:
            reasons.append("common_surname_only_handle")

    if not b or len(b.strip()) < 20:
        reasons.append("bio_missing_or_too_short")

    if followers is None or int(followers) == 0:
        reasons.append("followers_zero_or_null")

    bio_l = b.lower()
    for pattern in BIO_BAD_PATTERNS:
        if pattern in bio_l:
            reasons.append(f"bio_pattern:{pattern}")
            break

    if norm_text(country).upper() == "USA" and b:
        lang = detect_language_safe(b)
        if lang and lang != "en":
            reasons.append(f"non_english_bio:{lang}")

    if duplicate_counts.get(h, 0) >= 2:
        reasons.append("duplicate_handle_for_multiple_hcps")

    return PlatformEval(platform=platform, passed=(len(reasons) == 0), reasons=reasons or ["pass"])


def stage1_cleanup(dry_run: bool = False) -> None:
    load_dotenv()
    supabase = init_supabase()
    rows = fetch_candidates(supabase)
    twitter_counts = build_handle_counts(rows, "twitter_handle")
    bluesky_counts = build_handle_counts(rows, "bluesky_handle")

    twitter_drop_reasons: Counter = Counter()
    bluesky_drop_reasons: Counter = Counter()
    updates: List[Tuple[str, Dict]] = []

    for row in rows:
        hcp_id = row["id"]
        tw_eval = evaluate_platform(
            platform="twitter",
            handle=row.get("twitter_handle"),
            followers=row.get("twitter_followers"),
            bio=row.get("twitter_bio"),
            first_name=row.get("first_name"),
            last_name=row.get("last_name"),
            country=row.get("country"),
            duplicate_counts=twitter_counts,
        )
        bs_eval = evaluate_platform(
            platform="bluesky",
            handle=row.get("bluesky_handle"),
            followers=row.get("bluesky_followers"),
            bio=row.get("bluesky_bio"),
            first_name=row.get("first_name"),
            last_name=row.get("last_name"),
            country=row.get("country"),
            duplicate_counts=bluesky_counts,
        )

        payload: Dict = {
            "social_verified": False,
            "social_verification_method": "algorithmic_stage1",
        }

        reason_parts: List[str] = []
        if tw_eval.passed:
            reason_parts.append("twitter:keep")
        else:
            reason_parts.append(f"twitter:drop({'; '.join(tw_eval.reasons)})")
            twitter_drop_reasons[tw_eval.reasons[0]] += 1
            payload.update(
                {
                    "twitter_handle": None,
                    "twitter_followers": None,
                    "twitter_bio": None,
                    "twitter_following": None,
                    "twitter_tweet_count": None,
                    "twitter_verified": None,
                    "twitter_enriched_at": None,
                }
            )

        if bs_eval.passed:
            reason_parts.append("bluesky:keep")
        else:
            reason_parts.append(f"bluesky:drop({'; '.join(bs_eval.reasons)})")
            bluesky_drop_reasons[bs_eval.reasons[0]] += 1
            payload.update(
                {
                    "bluesky_handle": None,
                    "bluesky_followers": None,
                    "bluesky_bio": None,
                    "bluesky_posts": None,
                    "bluesky_enriched_at": None,
                }
            )

        payload["social_verification_reasoning"] = " | ".join(reason_parts)
        updates.append((hcp_id, payload))

    if not dry_run:
        for hcp_id, payload in updates:
            supabase.table("hcps").update(payload).eq("id", hcp_id).execute()

    # compute post-stage counts from simulated result (works for dry_run and write mode)
    remaining_any = 0
    remaining_both = 0
    remaining_neither = 0
    for row in rows:
        tw_eval = evaluate_platform(
            platform="twitter",
            handle=row.get("twitter_handle"),
            followers=row.get("twitter_followers"),
            bio=row.get("twitter_bio"),
            first_name=row.get("first_name"),
            last_name=row.get("last_name"),
            country=row.get("country"),
            duplicate_counts=twitter_counts,
        )
        bs_eval = evaluate_platform(
            platform="bluesky",
            handle=row.get("bluesky_handle"),
            followers=row.get("bluesky_followers"),
            bio=row.get("bluesky_bio"),
            first_name=row.get("first_name"),
            last_name=row.get("last_name"),
            country=row.get("country"),
            duplicate_counts=bluesky_counts,
        )
        has_t = tw_eval.passed
        has_b = bs_eval.passed
        if has_t or has_b:
            remaining_any += 1
        if has_t and has_b:
            remaining_both += 1
        if not has_t and not has_b:
            remaining_neither += 1

    print("\n=== Social Cleanup Stage 1 Summary ===")
    print(f"Total HCPs evaluated: {len(rows)}")
    print("Twitter handles dropped by reason:")
    for k, v in twitter_drop_reasons.most_common():
        print(f"  - {k}: {v}")
    print("Bluesky handles dropped by reason:")
    for k, v in bluesky_drop_reasons.most_common():
        print(f"  - {k}: {v}")
    print(f"HCPs remaining with at least one social handle after Stage 1: {remaining_any}")
    print(f"HCPs with both handles after Stage 1: {remaining_both}")
    print(f"HCPs with neither handle after Stage 1: {remaining_neither}")
    print(f"Mode: {'DRY RUN (no DB writes)' if dry_run else 'WRITE MODE'}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Social cleanup Stage 1 algorithmic filtering")
    parser.add_argument("--dry-run", action="store_true", help="Evaluate and summarize without DB writes")
    args = parser.parse_args()
    stage1_cleanup(dry_run=args.dry_run)
