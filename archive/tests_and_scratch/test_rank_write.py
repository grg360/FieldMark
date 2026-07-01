import os
from dotenv import load_dotenv
from supabase import create_client
from uuid import uuid4
from datetime import datetime, timezone

load_dotenv()
client = create_client(os.getenv("SUPABASE_URL"), os.getenv("SUPABASE_KEY"))

# Pick one real hcp_id from a scored row tonight
hcp_resp = client.table("hcp_scores_v2").select("hcp_id,therapeutic_area_id").eq(
    "therapeutic_area_id", "9b31947b-5ce2-41fd-bed8-0c09b9e5ad3e"
).limit(1).execute()
print("Sample hcp row:", hcp_resp.data)
hid = hcp_resp.data[0]["hcp_id"]
tid = hcp_resp.data[0]["therapeutic_area_id"]

run_id = str(uuid4())
test_row = {
    "hcp_id": hid,
    "therapeutic_area_id": tid,
    "cohort": "rising",
    "scope_type": "country",
    "scope_value": "US",
    "rank": 99999,
    "percentile": 0.5,
    "scope_size": 100,
    "score_at_rank": 50.0,
    "rank_run_id": run_id,
    "scoring_run_id": None,
}

print(f"Attempting upsert with rank_run_id={run_id}")
print(f"Payload keys: {list(test_row.keys())}")

response = client.table("hcp_score_ranks_v2").upsert(
    [test_row],
    on_conflict="hcp_id,therapeutic_area_id,cohort,scope_type,scope_value",
).execute()

print(f"Response data: {response.data}")
print(f"Response count: {len(response.data) if response.data else 0}")

# Verify it actually landed
verify = client.table("hcp_score_ranks_v2").select("*").eq(
    "rank_run_id", run_id
).execute()
print(f"Verification: found {len(verify.data)} rows with rank_run_id={run_id}")