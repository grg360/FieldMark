import os
from dotenv import load_dotenv
from supabase import create_client
from uuid import uuid4
from datetime import datetime, timezone

load_dotenv()
client = create_client(os.getenv("SUPABASE_URL"), os.getenv("SUPABASE_KEY"))

# Pull 500 hcp_ids from a TA that's currently scored
hcp_resp = client.table("hcp_scores_v2").select("hcp_id,therapeutic_area_id").eq(
    "therapeutic_area_id", "9b31947b-5ce2-41fd-bed8-0c09b9e5ad3e"
).limit(500).execute()

run_id = str(uuid4())
batch = []
for idx, row in enumerate(hcp_resp.data, start=1):
    batch.append({
        "hcp_id": row["hcp_id"],
        "therapeutic_area_id": row["therapeutic_area_id"],
        "cohort": "rising",
        "scope_type": "country",
        "scope_value": "TEST",
        "rank": idx + 100000,
        "percentile": 0.5,
        "scope_size": 500,
        "score_at_rank": 50.0,
        "rank_run_id": run_id,
        "scoring_run_id": None,
    })

print(f"Built batch of {len(batch)} rows with rank_run_id={run_id}")
print(f"First row rank_run_id: {batch[0]['rank_run_id']}")
print(f"Last row rank_run_id: {batch[-1]['rank_run_id']}")

response = client.table("hcp_score_ranks_v2").upsert(
    batch,
    on_conflict="hcp_id,therapeutic_area_id,cohort,scope_type,scope_value",
).execute()

print(f"Response data length: {len(response.data) if response.data else 0}")
if response.data:
    print(f"First returned row rank_run_id: {response.data[0].get('rank_run_id')}")

# Verify
verify = client.table("hcp_score_ranks_v2").select("hcp_id,rank_run_id").eq(
    "scope_value", "TEST"
).execute()
print(f"Verification: found {len(verify.data)} rows with scope_value=TEST")
if verify.data:
    nulls = sum(1 for r in verify.data if r.get("rank_run_id") is None)
    print(f"  with NULL rank_run_id: {nulls}")
    print(f"  with populated rank_run_id: {len(verify.data) - nulls}")