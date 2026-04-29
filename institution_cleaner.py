from __future__ import annotations

import os
import re
from typing import Dict, List, Optional

from dotenv import load_dotenv
from postgrest import APIError
from supabase import Client, create_client

SUPABASE_PAGE_SIZE = 500


def get_required_env(name: str) -> str:
    value = os.getenv(name)
    if not value:
        raise EnvironmentError(f"Missing required environment variable: {name}")
    return value


def init_supabase() -> Client:
    return create_client(get_required_env("SUPABASE_URL"), get_required_env("SUPABASE_KEY"))


def fetch_candidate_hcps(supabase: Client) -> List[Dict]:
    """
    Fetch US HCPs with non-null institution in pages of 500.
    """
    rows: List[Dict] = []
    offset = 0
    while True:
        try:
            response = (
                supabase.table("hcps")
                .select("id,institution,institution_full,country")
                .eq("country", "USA")
                .not_.is_("institution", "null")
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


def extract_clean_institution(institution: Optional[str]) -> Optional[str]:
    if not institution or "," not in institution:
        return None
    parts = [p.strip() for p in institution.split(",") if p and p.strip()]
    if not parts:
        return None

    disallowed_prefixes = (
        "department",
        "division",
        "section",
        "school of medicine",
        "college of",
        "center for",
        "laboratory of",
    )

    for part in parts:
        lowered = part.lower()
        if lowered.startswith(disallowed_prefixes):
            continue
        if len(part) < 3 or len(part) > 50:
            continue
        if re.search(r"\d", part):
            continue
        return part
    return None


def update_institution(supabase: Client, hcp_id: str, institution: str) -> None:
    try:
        supabase.table("hcps").update({"institution_short": institution}).eq("id", hcp_id).execute()
    except APIError as exc:
        if str(getattr(exc, "code", "")) == "23505":
            print(f"[skip] duplicate constraint for {hcp_id}")
            return
        raise RuntimeError(f"Failed updating institution for HCP {hcp_id}: {exc}") from exc
    except Exception as exc:
        raise RuntimeError(f"Failed updating institution for HCP {hcp_id}: {exc}") from exc


def run_pipeline() -> None:
    load_dotenv()
    supabase = init_supabase()

    print("Loading US HCPs with institution...")
    hcps = fetch_candidate_hcps(supabase)
    print(f"Loaded {len(hcps)} candidate HCPs.")

    cleaned = 0
    processed = 0

    for row in hcps:
        processed += 1
        hcp_id = row.get("id")
        institution = (row.get("institution") or "").strip()

        if not hcp_id:
            continue

        replacement = extract_clean_institution(institution)

        if replacement and replacement != institution:
            update_institution(supabase, hcp_id, replacement)
            cleaned += 1
            print(f"[{processed}] BEFORE: {institution}")
            print(f"[{processed}] AFTER : {replacement}")

    print("\n=== Institution Cleaner Summary ===")
    print(f"Processed: {processed}")
    print(f"Institutions cleaned: {cleaned}")


if __name__ == "__main__":
    try:
        run_pipeline()
    except Exception as error:
        print(f"[ERROR] Institution cleaner failed: {error}")
        raise
