from __future__ import annotations

import json
import os
import re
import time
import argparse
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Dict, List, Optional, Set

import httpx
import requests
from dotenv import load_dotenv
from postgrest import APIError
from supabase import Client, create_client

try:
    import httpcore
except ImportError:  # pragma: no cover
    httpcore = None

SUPABASE_PAGE_SIZE = 500
CHECKPOINT_FILE = "institution_checkpoint.json"
CHECKPOINT_EVERY = 1000
CLAUDE_MODEL = "claude-haiku-4-5-20251001"
CLAUDE_ENDPOINT = "https://api.anthropic.com/v1/messages"

KNOWN_CLEAN_INSTITUTIONS = {
    "mayo clinic",
    "johns hopkins",
    "harvard",
    "stanford",
    "ucla",
    "ucsf",
    "mit",
    "yale",
    "columbia",
    "duke",
    "cleveland clinic",
    "vanderbilt",
    "emory",
    "md anderson",
    "memorial sloan kettering",
    "dana-farber",
    "nih",
    "fda",
}

STATE_ZIP_RE = re.compile(r"\b[A-Z]{2}\s+\d{5}(?:-\d{4})?\b")
USA_TOKEN_RE = re.compile(r"\b(united states|u\.s\.a\.|usa)\b", flags=re.IGNORECASE)
COMPANY_SUFFIX_RE = re.compile(
    r"^\s*(?P<name>.+?)(?:,\s*|\s+)(?:inc(?:orporated)?|llc|ltd|corp(?:oration)?|co\.?)\.?(?:,|$)",
    flags=re.IGNORECASE,
)
TRAILING_ACRONYM_RE = re.compile(r"\s*\([^)]+\)\s*$")
KNOWN_CITY_TAILS = {
    "houston",
    "boston",
    "new york",
    "chicago",
    "philadelphia",
    "los angeles",
    "san francisco",
    "south san francisco",
    "spring house",
    "rahway",
    "washington",
    "cambridge",
    "atlanta",
    "nashville",
    "cleveland",
    "rochester",
    "baltimore",
    "stanford",
    "new haven",
    "durham",
}


@dataclass
class RunStats:
    processed: int = 0
    cleaned_rule1: int = 0
    cleaned_rule2: int = 0
    cleaned_rule3: int = 0
    cleaned_rule4: int = 0
    cleaned_rule5: int = 0
    cleaned_claude: int = 0
    skipped_already_clean: int = 0
    failed_or_unchanged: int = 0


def _network_retryable(exc: BaseException) -> bool:
    """True for transient HTTP/connection failures that merit one retry."""
    if type(exc).__name__ == "ConnectionTerminated":
        return True
    err_types: List[type] = [
        httpx.RemoteProtocolError,
        httpx.ConnectError,
        httpx.TimeoutException,
        httpx.ReadTimeout,
        httpx.WriteTimeout,
        httpx.PoolTimeout,
        ConnectionError,
        BrokenPipeError,
    ]
    if httpcore is not None:
        for name in ("RemoteProtocolError", "ConnectError", "ReadTimeout", "WriteTimeout"):
            t = getattr(httpcore, name, None)
            if isinstance(t, type):
                err_types.append(t)
    err_tuple = tuple(t for t in err_types if isinstance(t, type))
    return isinstance(exc, err_tuple)


def load_checkpoint() -> Set[str]:
    if not os.path.exists(CHECKPOINT_FILE):
        return set()
    try:
        with open(CHECKPOINT_FILE, "r", encoding="utf-8") as f:
            payload = json.load(f)
        raw = payload.get("processed_ids") or []
        return {str(x) for x in raw if x}
    except Exception:
        return set()


def save_checkpoint(processed_ids: Set[str]) -> None:
    payload = {
        "processed_ids": sorted(processed_ids),
        "saved_at": datetime.now(timezone.utc).isoformat(),
    }
    with open(CHECKPOINT_FILE, "w", encoding="utf-8") as f:
        json.dump(payload, f, indent=2)


def get_required_env(name: str) -> str:
    value = os.getenv(name)
    if not value:
        raise EnvironmentError(f"Missing required environment variable: {name}")
    return value


def init_supabase() -> Client:
    return create_client(get_required_env("SUPABASE_URL"), get_required_env("SUPABASE_KEY"))


def fetch_candidate_hcps(supabase: Client) -> List[Dict]:
    """
    Fetch HCPs with non-null institution containing commas.
    Length > 40 filtering is applied in Python to match user requirement.
    """
    rows: List[Dict] = []
    offset = 0
    while True:
        try:
            response = (
                supabase.table("hcps")
                .select("id,institution,institution_full,country")
                .not_.is_("institution", "null")
                .like("institution", "%,%")
                .range(offset, offset + SUPABASE_PAGE_SIZE - 1)
                .execute()
            )
        except Exception as exc:
            raise RuntimeError(f"Failed loading HCPs at offset {offset}: {exc}") from exc

        batch = response.data or []
        if not batch:
            break
        rows.extend(batch)
        if len(batch) < SUPABASE_PAGE_SIZE:
            break
        offset += SUPABASE_PAGE_SIZE
    return rows


def normalize_space(value: str) -> str:
    return " ".join(str(value).strip().split())


def safe_print(text: str) -> None:
    """
    Print safely on Windows consoles that may use cp1252.
    Replaces unsupported characters instead of crashing the run.
    """
    try:
        print(text)
    except UnicodeEncodeError:
        print(text.encode("cp1252", errors="replace").decode("cp1252", errors="replace"))


def normalize_clean_key(value: str) -> str:
    return normalize_space(value).lower().rstrip(".,")


def strip_company_suffix(name: str) -> str:
    out = re.sub(
        r"(?:,\s*|\s+)(?:inc(?:orporated)?|llc|ltd|corp(?:oration)?)\.?$",
        "",
        name.strip(),
        flags=re.IGNORECASE,
    )
    return out.strip(" ,.")


def looks_like_location_or_address_segment(segment: str) -> bool:
    s = segment.strip()
    if not s:
        return False
    if re.search(r"\d", s):
        return True
    if STATE_ZIP_RE.search(s):
        return True
    if USA_TOKEN_RE.search(s):
        return True
    return False


def looks_already_clean(institution: str) -> bool:
    s = normalize_space(institution)
    if not s:
        return True
    if "," not in s and len(s) < 60:
        return True
    if normalize_clean_key(s) in KNOWN_CLEAN_INSTITUTIONS:
        return True
    return False


def apply_rule1_company_pattern(institution: str) -> Optional[str]:
    # Company Name, Inc./LLC/Ltd/Corp, ...
    m = COMPANY_SUFFIX_RE.match(institution)
    if not m:
        return None
    cleaned = strip_company_suffix(m.group("name"))
    return cleaned if cleaned else None


def apply_rule2_address_detection(institution: str) -> Optional[str]:
    parts = [normalize_space(p) for p in institution.split(",") if normalize_space(p)]
    if len(parts) < 2:
        return None
    for segment in parts[1:]:
        if looks_like_location_or_address_segment(segment):
            first_segment = strip_company_suffix(parts[0])
            return first_segment if first_segment else None
    return None


def apply_rule3_city_appended(institution: str) -> Optional[str]:
    # Pattern: Institution Name City, State
    parts = [normalize_space(p) for p in institution.split(",") if normalize_space(p)]
    if len(parts) < 2:
        return None
    first_segment = parts[0]
    second_segment = parts[1].upper()
    if not re.fullmatch(r"[A-Z]{2}", second_segment):
        return None

    lowered_first = first_segment.lower()
    # Targeted extraction for frequent long form.
    if "md anderson cancer center" in lowered_first:
        return "MD Anderson Cancer Center"

    # Remove known city suffixes from first segment.
    for city in sorted(KNOWN_CITY_TAILS, key=len, reverse=True):
        city_token = f" {city}"
        if lowered_first.endswith(city_token):
            cleaned = first_segment[: -len(city_token)].strip(" ,.")
            return cleaned if cleaned else None
    return None


def apply_rule4_council_pattern(institution: str) -> Optional[str]:
    # The Global NASH/MASH Council (GNC), Washington, District of Columbia
    parts = [normalize_space(p) for p in institution.split(",") if normalize_space(p)]
    if len(parts) < 2:
        return None
    first_segment = parts[0]
    if "council" not in first_segment.lower():
        return None
    tail = ", ".join(parts[1:]).lower()
    if any(token in tail for token in ["district of columbia", "united states", "usa", "u.s.a."]) or any(
        city in tail for city in KNOWN_CITY_TAILS
    ):
        cleaned = TRAILING_ACRONYM_RE.sub("", first_segment).strip(" ,.")
        return cleaned if cleaned else None
    return None


def clean_institution_with_rules(institution: str) -> tuple[Optional[str], str]:
    """
    Returns: (cleaned_institution_or_none, rule_tag)
    rule_tag one of: rule1, rule2, rule3, rule4, rule5, none
    """
    s = normalize_space(institution)
    if looks_already_clean(s):
        return None, "rule5"

    rule1 = apply_rule1_company_pattern(s)
    if rule1:
        return rule1, "rule1"

    rule2 = apply_rule2_address_detection(s)
    if rule2:
        return rule2, "rule2"

    rule3 = apply_rule3_city_appended(s)
    if rule3:
        return rule3, "rule3"

    rule4 = apply_rule4_council_pattern(s)
    if rule4:
        return rule4, "rule4"

    return None, "none"


def claude_extract_institution(institution: str, anthropic_api_key: Optional[str]) -> Optional[str]:
    if not anthropic_api_key:
        return None
    prompt = (
        "Extract only the institution or company name from this affiliation string. "
        "Return only the institution name, no explanation:\n"
        f"{institution}"
    )
    try:
        response = requests.post(
            CLAUDE_ENDPOINT,
            headers={
                "x-api-key": anthropic_api_key,
                "anthropic-version": "2023-06-01",
                "content-type": "application/json",
            },
            json={
                "model": CLAUDE_MODEL,
                "max_tokens": 80,
                "temperature": 0,
                "messages": [{"role": "user", "content": prompt}],
            },
            timeout=(5, 30),
        )
        response.raise_for_status()
        payload = response.json()
        blocks = payload.get("content", []) if isinstance(payload, dict) else []
        if not blocks:
            return None
        text = str(blocks[0].get("text", "")).strip()
        text = text.strip().strip('"').strip("'")
        text = normalize_space(text).strip(" ,.")
        if not text:
            return None
        return text
    except Exception:
        return None


def update_institution(supabase: Client, hcp_id: str, institution: str) -> bool:
    """
    Update institution_short. Returns True on success, False if skipped or failed.
    Retries once after 2s on network-style errors (e.g. RemoteProtocolError).
    """
    def _execute() -> None:
        supabase.table("hcps").update({"institution_short": institution}).eq("id", hcp_id).execute()

    try:
        _execute()
        return True
    except APIError as exc:
        if str(getattr(exc, "code", "")) == "23505":
            print(f"[skip] duplicate constraint for {hcp_id}")
            return False
        if _network_retryable(exc):
            time.sleep(2)
            try:
                _execute()
                return True
            except APIError as retry_exc:
                if str(getattr(retry_exc, "code", "")) == "23505":
                    print(f"[skip] duplicate constraint for {hcp_id}")
                    return False
                print(
                    f"[warn] institution update failed for {hcp_id} after retry: {retry_exc!r}",
                    flush=True,
                )
                return False
            except Exception as retry_exc:
                print(
                    f"[warn] institution update failed for {hcp_id} after retry: {retry_exc!r}",
                    flush=True,
                )
                return False
        print(f"[warn] institution update failed for {hcp_id} (APIError): {exc!r}", flush=True)
        return False
    except Exception as exc:
        if _network_retryable(exc):
            time.sleep(2)
            try:
                _execute()
                return True
            except APIError as retry_exc:
                if str(getattr(retry_exc, "code", "")) == "23505":
                    print(f"[skip] duplicate constraint for {hcp_id}")
                    return False
                print(
                    f"[warn] institution update failed for {hcp_id} after retry: {retry_exc!r}",
                    flush=True,
                )
                return False
            except Exception as retry_exc:
                print(
                    f"[warn] institution update failed for {hcp_id} after retry: {retry_exc!r}",
                    flush=True,
                )
                return False
        print(f"[warn] institution update failed for {hcp_id}: {exc!r}", flush=True)
        return False


def run_pipeline() -> None:
    parser = argparse.ArgumentParser(description="Clean institution strings for HCPs.")
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Process sample rows and print decisions without writing to DB.",
    )
    parser.add_argument(
        "--limit",
        type=int,
        default=20,
        help="Max records to process in dry-run mode (default: 20).",
    )
    args = parser.parse_args()

    load_dotenv()
    supabase = init_supabase()
    anthropic_api_key = os.getenv("ANTHROPIC_API_KEY")

    processed_ids = load_checkpoint()
    print(f"Loaded checkpoint with {len(processed_ids)} already-processed HCP IDs.")

    print("Loading HCPs with institution containing commas...")
    hcps = fetch_candidate_hcps(supabase)
    pending = [
        h
        for h in hcps
        if h.get("id")
        and str(h["id"]) not in processed_ids
        and "," in str(h.get("institution") or "")
        and len(str(h.get("institution") or "").strip()) > 40
    ]
    print(
        f"Loaded {len(hcps)} candidates; processing {len(pending)} "
        "where institution LIKE '%,%' and LENGTH(institution) > 40."
    )
    if args.dry_run:
        dry_limit = max(1, args.limit)
        pending = pending[:dry_limit]
        print(f"[DRY RUN] Processing first {len(pending)} records only. No DB writes will be made.")

    stats = RunStats()

    for row in pending:
        stats.processed += 1
        hcp_id = row.get("id")
        institution = (row.get("institution") or "").strip()

        if not hcp_id:
            continue

        replacement, rule = clean_institution_with_rules(institution)

        if rule == "rule5":
            stats.skipped_already_clean += 1
            stats.cleaned_rule5 += 1
            processed_ids.add(str(hcp_id))
            if stats.processed % CHECKPOINT_EVERY == 0:
                save_checkpoint(processed_ids)
                print(f"Checkpoint saved at {stats.processed} processed in this run.")
            continue

        used_rule = rule

        if replacement is None:
            replacement = claude_extract_institution(institution, anthropic_api_key)
            used_rule = "claude" if replacement else "none"

        if replacement:
            replacement = normalize_space(replacement).strip(" ,.")

        if replacement and replacement != institution:
            if args.dry_run:
                if used_rule == "rule1":
                    stats.cleaned_rule1 += 1
                elif used_rule == "rule2":
                    stats.cleaned_rule2 += 1
                elif used_rule == "rule3":
                    stats.cleaned_rule3 += 1
                elif used_rule == "rule4":
                    stats.cleaned_rule4 += 1
                elif used_rule == "claude":
                    stats.cleaned_claude += 1
                else:
                    stats.failed_or_unchanged += 1
                safe_print(f"[{stats.processed}] BEFORE: {institution}")
                safe_print(f"[{stats.processed}] AFTER : {replacement} ({used_rule}) [DRY RUN]")
            elif update_institution(supabase, str(hcp_id), replacement):
                if used_rule == "rule1":
                    stats.cleaned_rule1 += 1
                elif used_rule == "rule2":
                    stats.cleaned_rule2 += 1
                elif used_rule == "rule3":
                    stats.cleaned_rule3 += 1
                elif used_rule == "rule4":
                    stats.cleaned_rule4 += 1
                elif used_rule == "claude":
                    stats.cleaned_claude += 1
                else:
                    stats.failed_or_unchanged += 1
                safe_print(f"[{stats.processed}] BEFORE: {institution}")
                safe_print(f"[{stats.processed}] AFTER : {replacement} ({used_rule})")
            else:
                stats.failed_or_unchanged += 1
        else:
            stats.failed_or_unchanged += 1

        if not args.dry_run:
            processed_ids.add(str(hcp_id))

        if (not args.dry_run) and stats.processed % CHECKPOINT_EVERY == 0:
            save_checkpoint(processed_ids)
            print(f"Checkpoint saved at {stats.processed} processed in this run.")

    if not args.dry_run:
        save_checkpoint(processed_ids)
    print("\n=== Institution Cleaner Summary ===")
    print(f"Records processed: {stats.processed}")
    print(f"Cleaned by rule 1: {stats.cleaned_rule1}")
    print(f"Cleaned by rule 2: {stats.cleaned_rule2}")
    print(f"Cleaned by rule 3: {stats.cleaned_rule3}")
    print(f"Cleaned by rule 4: {stats.cleaned_rule4}")
    print(f"Cleaned by rule 5: {stats.cleaned_rule5}")
    print(f"Cleaned by Claude: {stats.cleaned_claude}")
    print(f"Skipped (already clean): {stats.skipped_already_clean}")
    print(f"Failed/unchanged: {stats.failed_or_unchanged}")
    if args.dry_run:
        print("Dry run complete. No database writes were performed.")


if __name__ == "__main__":
    try:
        run_pipeline()
    except Exception as error:
        print(f"[ERROR] Institution cleaner failed: {error}")
        raise
