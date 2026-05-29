from __future__ import annotations

"""
Phase 5 implementation for DOL matching.

Matches social_users -> hcps using name/bio/institution/TA signals and writes
auditable rows in dol_matches. Supports platform-filtered runs.
"""

import argparse
import json
import os
import re
import time
from collections import defaultdict
from dataclasses import dataclass
from difflib import SequenceMatcher
from typing import Any, Dict, List, Optional, Sequence, Tuple

from dotenv import load_dotenv
from supabase import Client, create_client


PAGE_SIZE = 1000

CONFIDENCE_ORDER = {
    "rejected": 0,
    "low": 1,
    "medium": 2,
    "high": 3,
}

SUFFIX_CREDENTIALS = {
    "md",
    "phd",
    "mph",
    "fasco",
    "do",
    "pharmd",
    "rn",
}

MEDICAL_CREDENTIAL_PATTERNS = [
    r"\bmd\b",
    r"\bphd\b",
    r"\bdo\b",
    r"\bpharmd\b",
    r"\bdr\.?\b",
    r"\boncologist\b",
    r"\bhepatologist\b",
    r"\bcardiologist\b",
    r"\bpathologist\b",
    r"\bsurgeon\b",
    r"\bradiologist\b",
    r"\bnephrologist\b",
    r"\bgastroenterologist\b",
    r"\bendocrinologist\b",
    r"\bchief.{0,30}(cancer|oncology|medicine|surgery|cardiology)\b",
    r"\bprof.{0,30}medicine\b",
    r"\bdirector.{0,30}(clinical|medical|cancer|institute)\b",
]

TA_KEYWORDS = {
    "oncology": ["oncology", "cancer", "tumor", "tumour", "chemotherapy", "immunotherapy"],
    "nsclc": [
        "nsclc",
        "non-small cell lung cancer",
        "lung cancer",
        "thoracic oncology",
        "oncology",
        "cancer",
        "tumor",
    ],
    "hepatology": ["hepatology", "liver", "nash", "masld", "cirrhosis", "fatty liver"],
    "rare-disease": [
        "rare disease",
        "genetic",
        "orphan disease",
        "cystic fibrosis",
        "huntington",
        "muscular dystrophy",
        "rare",
        "orphan",
    ],
}


@dataclass
class MatchResult:
    hcp_id: str
    social_user_id: str
    score: int
    confidence: str
    signals: Dict[str, Any]


def get_required_env(name: str) -> str:
    value = os.getenv(name, "").strip()
    if not value:
        raise EnvironmentError(f"Missing required environment variable: {name}")
    return value


def init_supabase() -> Client:
    return create_client(get_required_env("SUPABASE_URL"), get_required_env("SUPABASE_KEY"))


def normalize_text(value: Optional[str]) -> str:
    return " ".join(str(value or "").strip().lower().split())


def normalize_alnum(value: Optional[str]) -> str:
    text = normalize_text(value)
    return re.sub(r"[^a-z0-9 ]+", "", text).strip()


def fetch_all_rows(query_builder) -> List[Dict[str, Any]]:
    rows: List[Dict[str, Any]] = []
    offset = 0
    while True:
        batch = query_builder.range(offset, offset + PAGE_SIZE - 1).execute().data or []
        if not batch:
            break
        rows.extend(batch)
        if len(batch) < PAGE_SIZE:
            break
        offset += PAGE_SIZE
    return rows


def fetch_existing_match_user_ids(client: Client) -> set[str]:
    rows = fetch_all_rows(client.table("dol_matches_v2").select("social_user_id"))
    return {
        str(r.get("social_user_id"))
        for r in rows
        if r.get("social_user_id") is not None
    }


def fetch_unmatched_social_users(client: Client, platform_filter: Optional[str]) -> List[Dict[str, Any]]:
    """
    Fetch social_users not present in dol_matches and not rejected by quality flag.
    Optional platform filter: twitter|bluesky.
    """
    existing_ids = fetch_existing_match_user_ids(client)
    q = (
        client.table("social_users_v2")
        .select("id,platform,handle,display_name,bio,location,website,verified,data_quality_flag")
        .neq("data_quality_flag", "rejected")
    )
    if platform_filter and platform_filter != "both":
        q = q.eq("platform", platform_filter)
    users = fetch_all_rows(q)
    out: List[Dict[str, Any]] = []
    for u in users:
        uid = str(u.get("id") or "")
        if not uid:
            continue
        if uid in existing_ids:
            continue
        out.append(u)
    return out


def parse_name_from_display_name(display_name: Optional[str]) -> Tuple[Optional[str], Optional[str]]:
    """Best-effort first/last extraction from social display name."""
    clean = normalize_alnum(display_name)
    if not clean:
        return None, None

    # Drop parenthetical fragments and commas first.
    clean = re.sub(r"\(.*?\)", " ", clean)
    parts = [p for p in re.split(r"[,\s]+", clean) if p]
    if not parts:
        return None, None

    while parts and parts[-1] in SUFFIX_CREDENTIALS:
        parts.pop()
    if len(parts) < 2:
        return None, None
    first = parts[0]
    last = parts[-1]
    if len(first) < 2 or len(last) < 2:
        return None, None
    return first, last


def find_hcp_candidates(client: Client, first_name: Optional[str], last_name: Optional[str]) -> List[Dict[str, Any]]:
    """Find HCP candidates by name match rules."""
    if not first_name or not last_name:
        return []
    q = (
        client.table("hcps_v2")
        .select("id,first_name,last_name,institution_normalized,total_career_pubs")
        .ilike("first_name", f"%{first_name}%")
        .ilike("last_name", last_name)
    )
    return q.limit(200).execute().data or []


def fetch_candidate_ta_slugs(client: Client, hcp_ids: Sequence[str]) -> Dict[str, List[str]]:
    mapping: Dict[str, List[str]] = defaultdict(list)
    if not hcp_ids:
        return mapping

    for i in range(0, len(hcp_ids), 200):
        chunk = hcp_ids[i : i + 200]
        rows = (
            client.table("hcp_therapeutic_areas_v2")
            .select("hcp_id,therapeutic_area_id")
            .in_("hcp_id", chunk)
            .execute()
            .data
            or []
        )
        ta_ids = list({str(r.get("therapeutic_area_id")) for r in rows if r.get("therapeutic_area_id")})
        ta_slug_map: Dict[str, str] = {}
        if ta_ids:
            ta_rows = (
                client.table("therapeutic_areas")
                .select("id,slug")
                .in_("id", ta_ids)
                .execute()
                .data
                or []
            )
            ta_slug_map = {str(t["id"]): str(t.get("slug") or "") for t in ta_rows if t.get("id")}

        for r in rows:
            hid = str(r.get("hcp_id") or "")
            tid = str(r.get("therapeutic_area_id") or "")
            slug = ta_slug_map.get(tid)
            if hid and slug:
                mapping[hid].append(slug)
    return mapping


def score_institution_signal(social_bio: str, hcp: Dict[str, Any]) -> Tuple[int, Dict[str, Any]]:
    """+50 if institution signal matches."""
    inst = normalize_alnum(hcp.get("institution_normalized"))
    bio = normalize_alnum(social_bio)
    if not inst or not bio:
        return 0, {"institution_match": False, "institution_normalized": hcp.get("institution_normalized")}

    # Strong substring check first.
    if inst in bio:
        return 50, {"institution_match": True, "institution_normalized": hcp.get("institution_normalized"), "method": "substring"}

    # Token overlap fallback for institution-like keywords.
    inst_tokens = [t for t in inst.split() if len(t) >= 4]
    if inst_tokens and any(t in bio for t in inst_tokens):
        return 50, {
            "institution_match": True,
            "institution_normalized": hcp.get("institution_normalized"),
            "method": "token_overlap",
            "matched_tokens": [t for t in inst_tokens if t in bio],
        }

    return 0, {"institution_match": False, "institution_normalized": hcp.get("institution_normalized")}


def score_medical_credential_signal(
    social_bio: str,
    social_display_name: str,
) -> Tuple[int, Dict[str, Any]]:
    """+20 if credentials like MD/DO/PharmD/etc. appear in bio."""
    bio = normalize_text(social_bio)
    name = normalize_text(social_display_name)
    combined = f"{bio} {name}".strip()
    matched = [pat for pat in MEDICAL_CREDENTIAL_PATTERNS if re.search(pat, combined)]
    if matched:
        return 20, {"medical_credential_match": True, "matched_patterns": matched}
    return 0, {"medical_credential_match": False}


def score_ta_keyword_signal(social_bio: str, hcp_ta_slugs: Sequence[str]) -> Tuple[int, Dict[str, Any]]:
    """+15 if TA keywords align with HCP therapeutic areas."""
    bio = normalize_text(social_bio)
    found_matches: Dict[str, List[str]] = {}
    for slug in hcp_ta_slugs:
        keywords = TA_KEYWORDS.get(slug, [])
        hits = [kw for kw in keywords if kw in bio]
        if hits:
            found_matches[slug] = hits
    if found_matches:
        return 15, {"ta_keyword_match": True, "ta_hits": found_matches}
    return 0, {"ta_keyword_match": False, "hcp_ta_slugs": list(hcp_ta_slugs)}


def score_display_name_signal(display_name: str, hcp: Dict[str, Any]) -> Tuple[int, Dict[str, Any]]:
    """+10 for close display-name match."""
    dn = normalize_alnum(display_name)
    hcp_name = normalize_alnum(f"{hcp.get('first_name', '')} {hcp.get('last_name', '')}")
    if not dn or not hcp_name:
        return 0, {"display_name_similarity": 0.0, "display_name_match": False}
    sim = SequenceMatcher(None, dn, hcp_name).ratio()
    if sim >= 0.85:
        return 10, {"display_name_similarity": sim, "display_name_match": True}
    return 0, {"display_name_similarity": sim, "display_name_match": False}


def score_verified_signal(verified: bool) -> Tuple[int, Dict[str, Any]]:
    """+5 if platform account is verified."""
    if verified:
        return 5, {"verified_account_match": True}
    return 0, {"verified_account_match": False}


def classify_confidence(score: int) -> str:
    """Map score -> high|medium|low|rejected."""
    if score >= 70:
        return "high"
    if score >= 40:
        return "medium"
    if score >= 20:
        return "low"
    return "rejected"


def build_match_signals_payload(components: List[Dict[str, Any]], total_score: int) -> Dict[str, Any]:
    """Build JSONB payload for dol_matches.match_signals."""
    payload: Dict[str, Any] = {"total_score": total_score}
    for c in components:
        payload.update(c)
    return payload


def insert_dol_match(client: Client, match: MatchResult) -> None:
    """Insert into dol_matches with UNIQUE(hcp_id, social_user_id) handling."""
    row = {
        "hcp_id": match.hcp_id,
        "social_user_id": match.social_user_id,
        "match_confidence": match.confidence,
        "match_signals": match.signals,
    }
    client.table("dol_matches_v2").upsert(row, on_conflict="hcp_id,social_user_id", ignore_duplicates=True).execute()


def set_hcp_verified_dol(client: Client, hcp_id: str) -> None:
    """Set hcps.is_verified_dol=true for high-confidence matches."""
    client.table("hcps_v2").update({"is_verified_dol": True}).eq("id", hcp_id).execute()


def floor_allows(confidence: str, confidence_floor: str) -> bool:
    return CONFIDENCE_ORDER[confidence] >= CONFIDENCE_ORDER[confidence_floor]


def rank_candidate_for_tiebreak(candidate: Dict[str, Any]) -> int:
    try:
        return int(candidate.get("total_career_pubs") or 0)
    except (TypeError, ValueError):
        return 0


def score_candidate(
    social_user: Dict[str, Any],
    candidate: Dict[str, Any],
    hcp_ta_slugs: Sequence[str],
) -> Tuple[int, Dict[str, Any]]:
    bio = str(social_user.get("bio") or "")
    display_name = str(social_user.get("display_name") or "")
    platform = str(social_user.get("platform") or "")
    verified = bool(social_user.get("verified")) if platform == "twitter" else False

    total = 0
    signal_parts: List[Dict[str, Any]] = []

    s1, d1 = score_institution_signal(bio, candidate)
    total += s1
    signal_parts.append(d1)

    s2, d2 = score_medical_credential_signal(bio, display_name)
    total += s2
    signal_parts.append(d2)

    s3, d3 = score_ta_keyword_signal(bio, hcp_ta_slugs)
    total += s3
    signal_parts.append(d3)

    s4, d4 = score_display_name_signal(display_name, candidate)
    total += s4
    signal_parts.append(d4)

    s5, d5 = score_verified_signal(verified)
    total += s5
    signal_parts.append(d5)

    details = build_match_signals_payload(signal_parts, total)
    details["component_scores"] = {
        "institution": s1,
        "medical_credential": s2,
        "ta_keyword": s3,
        "display_name": s4,
        "verified": s5,
    }
    details["candidate_name"] = f"{candidate.get('first_name', '')} {candidate.get('last_name', '')}".strip()
    details["candidate_total_career_pubs"] = rank_candidate_for_tiebreak(candidate)
    return total, details


def run_matching(client: Client, platform_filter: Optional[str], dry_run: bool, confidence_floor: str) -> Dict[str, int]:
    """
    Process all eligible social users.
    High confidence -> verified dol flag
    Medium -> manual_review confidence bucket
    Low -> stored, not surfaced
    """
    users = fetch_unmatched_social_users(client, platform_filter)
    stats = {
        "social_users_processed": 0,
        "high": 0,
        "medium": 0,
        "low": 0,
        "rejected": 0,
        "hcp_newly_marked_verified_dol": 0,
        "inserted_matches": 0,
    }
    hcp_marked: set[str] = set()

    for su in users:
        stats["social_users_processed"] += 1
        first, last = parse_name_from_display_name(su.get("display_name"))
        if not first or not last:
            stats["rejected"] += 1
            continue

        candidates = find_hcp_candidates(client, first, last)
        if not candidates:
            stats["rejected"] += 1
            continue

        hcp_ids = [str(c.get("id")) for c in candidates if c.get("id")]
        ta_map = fetch_candidate_ta_slugs(client, hcp_ids)

        scored: List[Tuple[int, Dict[str, Any], Dict[str, Any]]] = []
        for c in candidates:
            hid = str(c.get("id") or "")
            score, signals = score_candidate(su, c, ta_map.get(hid, []))
            scored.append((score, c, signals))

        scored.sort(
            key=lambda x: (
                -x[0],
                -rank_candidate_for_tiebreak(x[1]),  # tie-breaker: highest pubs
            )
        )
        best_score, best_candidate, best_signals = scored[0]
        confidence = classify_confidence(best_score)
        stats[confidence] += 1

        match = MatchResult(
            hcp_id=str(best_candidate["id"]),
            social_user_id=str(su["id"]),
            score=best_score,
            confidence=confidence,
            signals=best_signals,
        )

        if floor_allows(confidence, confidence_floor):
            if dry_run:
                print(
                    json.dumps(
                        {
                            "social_user_id": match.social_user_id,
                            "platform": su.get("platform"),
                            "handle": su.get("handle"),
                            "display_name": su.get("display_name"),
                            "matched_hcp_id": match.hcp_id,
                            "confidence": match.confidence,
                            "score": match.score,
                            "signals": match.signals,
                        }
                    )
                )
            else:
                insert_dol_match(client, match)
                stats["inserted_matches"] += 1

                if confidence == "high":
                    set_hcp_verified_dol(client, match.hcp_id)
                    if match.hcp_id not in hcp_marked:
                        hcp_marked.add(match.hcp_id)
                        stats["hcp_newly_marked_verified_dol"] += 1
        else:
            if dry_run:
                print(
                    json.dumps(
                        {
                            "social_user_id": match.social_user_id,
                            "handle": su.get("handle"),
                            "confidence": match.confidence,
                            "score": match.score,
                            "decision": f"skipped_by_confidence_floor:{confidence_floor}",
                        }
                    )
                )

    return stats


def print_summary(stats: Dict[str, int]) -> None:
    print("\n=== DOL matching summary ===")
    print(f"Social users processed: {stats.get('social_users_processed', 0)}")
    print(
        "Matches by tier: "
        f"high={stats.get('high', 0)}, "
        f"medium={stats.get('medium', 0)}, "
        f"low={stats.get('low', 0)}, "
        f"rejected={stats.get('rejected', 0)}"
    )
    print(f"HCPs newly marked is_verified_dol: {stats.get('hcp_newly_marked_verified_dol', 0)}")
    if "inserted_matches" in stats:
        print(f"Matches inserted: {stats.get('inserted_matches', 0)}")


def main() -> None:
    load_dotenv()
    parser = argparse.ArgumentParser(description="DOL social-to-HCP matching.")
    parser.add_argument(
        "--platform",
        choices=["twitter", "bluesky", "both"],
        default="both",
        help="Optional platform-only matching run. Default: both",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Compute matches and print results without DB writes.",
    )
    parser.add_argument(
        "--confidence-floor",
        choices=["high", "medium", "low", "rejected"],
        default="rejected",
        help="Only insert matches at this confidence tier or higher.",
    )
    args = parser.parse_args()

    t0 = time.time()
    client = init_supabase()
    platform_filter = args.platform if args.platform != "both" else None
    stats = run_matching(
        client,
        platform_filter=platform_filter,
        dry_run=args.dry_run,
        confidence_floor=args.confidence_floor,
    )
    print_summary(stats)
    elapsed = time.time() - t0
    print(f"Time elapsed: {elapsed:.2f}s")


if __name__ == "__main__":
    main()
