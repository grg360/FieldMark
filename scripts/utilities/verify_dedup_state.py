import json
import os
from pathlib import Path

from dotenv import load_dotenv
from supabase import create_client


LOG_PATH = Path(r"C:\Users\garre\Desktop\FieldMark\hcp_dedup_merge_log.json")


def get_required_env(name: str) -> str:
    value = os.getenv(name)
    if not value:
        raise EnvironmentError(f"Missing required environment variable: {name}")
    return value


def fetch_hcps_by_ids(client, ids):
    if not ids:
        return []
    rows = (
        client.table("hcps")
        .select("id,first_name,last_name")
        .in_("id", ids)
        .execute()
        .data
        or []
    )
    return rows


if __name__ == "__main__":
    load_dotenv()
    supabase = create_client(get_required_env("SUPABASE_URL"), get_required_env("SUPABASE_KEY"))

    with open(LOG_PATH, "r", encoding="utf-8") as f:
        log = json.load(f)

    decisions = log.get("decisions", [])

    ok_with_deletions = [
        d for d in decisions if d.get("status") == "ok" and (d.get("non_canonical_ids") or [])
    ]
    failed = [d for d in decisions if d.get("status") == "failed"]

    ok_sample_decisions = ok_with_deletions[:5]
    ok_sample_ids = []
    for d in ok_sample_decisions:
        ok_sample_ids.extend(d.get("non_canonical_ids") or [])
    ok_sample_ids = list(dict.fromkeys(ok_sample_ids))

    print("Sampled successful-cluster non_canonical_ids (should be DELETED):")
    for sid in ok_sample_ids:
        print(sid)

    ok_rows = fetch_hcps_by_ids(supabase, ok_sample_ids)
    print(f"Rows returned for successful-cluster sample: {len(ok_rows)}")
    if ok_rows:
        for row in ok_rows:
            print(f"STILL EXISTS: {row.get('id')} {row.get('first_name')} {row.get('last_name')}")
    else:
        print("All sampled successful-cluster IDs confirmed deleted from hcps.")

    failed_sample_decisions = failed[:5]
    failed_sample_ids = []
    for d in failed_sample_decisions:
        failed_sample_ids.extend(d.get("non_canonical_ids") or [])
    failed_sample_ids = list(dict.fromkeys(failed_sample_ids))

    print("Sampled failed-cluster non_canonical_ids (should STILL EXIST):")
    for sid in failed_sample_ids:
        print(sid)

    failed_rows = fetch_hcps_by_ids(supabase, failed_sample_ids)
    print(f"Rows returned for failed-cluster sample: {len(failed_rows)}")
    for row in failed_rows:
        print(f"EXISTS: {row.get('id')} {row.get('first_name')} {row.get('last_name')}")
    if len(failed_rows) < len(failed_sample_ids):
        print("WARNING: some failed-cluster IDs are missing from hcps.")

    total_ok_noncanonical = sum(len(d.get("non_canonical_ids") or []) for d in ok_with_deletions)
    total_failed_noncanonical = sum(len(d.get("non_canonical_ids") or []) for d in failed)

    print("=== Final Summary ===")
    print(f"Total successful clusters with deletions: {len(ok_with_deletions)}")
    print(f"Total failed clusters: {len(failed)}")
    print(f"Total non_canonical_ids across successful clusters: {total_ok_noncanonical}")
    print(f"Total non_canonical_ids across failed clusters: {total_failed_noncanonical}")
