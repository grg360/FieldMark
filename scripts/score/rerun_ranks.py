import os
from dotenv import load_dotenv
from supabase import create_client
from score_ranking import compute_and_write_ranks

load_dotenv()
client = create_client(os.getenv("SUPABASE_URL"), os.getenv("SUPABASE_KEY"))

print("Loading hcp_scores_v2...")
all_scores = []
offset = 0
batch_size = 1000
while True:
    resp = client.table("hcp_scores_v2").select(
        "hcp_id,therapeutic_area_id,normalized_score"
    ).range(offset, offset + batch_size - 1).execute()
    if not resp.data:
        break
    all_scores.extend(resp.data)
    offset += batch_size
    print(f"  loaded {len(all_scores)} rows...")

print(f"Loaded {len(all_scores)} score rows.")
compute_and_write_ranks(
    client=client,
    score_rows=all_scores,
    cohort="rising",
    dry_run=False,
)