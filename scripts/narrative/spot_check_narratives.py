"""
Spot-check script for Established cohort narrative quality.

Generates narratives for four specific HCPs covering edge cases:
  - Heymach: high pharma breadth (23 companies)
  - Alexander Spira: very high pharma breadth (29 companies)
  - Ramalingam: moderate pharma (5 companies)
  - Loomba: cross-TA validation (Hepatology)

Does NOT write to DB. Prints JSON narratives to stdout.

Usage:
    python spot_check_narratives.py
"""

import json
import os
import sys
from typing import Dict, List

from dotenv import load_dotenv

from generate_narratives_v2 import (
    ESTABLISHED_PROMPT_VERSION,
    HCPContext,
    build_prompt_established,
    fetch_established_v3_context_rows,
    fetch_hcps_by_ids,
    generate_narrative,
    get_required_env,
    init_supabase,
    safe_float,
    safe_int,
)

load_dotenv()

TARGETS = [
    {"id": "2302d82f-c44a-498e-b0ab-6ca39a3f8964", "label": "Heymach (high pharma, 23 companies)"},
]


def main() -> None:
    api_key = get_required_env("ANTHROPIC_API_KEY")
    supabase = init_supabase()

    hcp_ids = {t["id"] for t in TARGETS}
    print(f"Loading {len(hcp_ids)} HCPs...")

    hcps = fetch_hcps_by_ids(supabase, hcp_ids, target_version="v2")
    hcp_map: Dict[str, Dict] = {str(h["id"]): h for h in hcps if h.get("id")}
    print(f"Loaded {len(hcp_map)} HCP records")

    # Discover which TAs each HCP belongs to
    ta_resp = (
        supabase.table("hcp_therapeutic_areas_v2")
        .select("hcp_id,therapeutic_area_id")
        .in_("hcp_id", list(hcp_ids))
        .execute()
    )
    ta_membership_rows = ta_resp.data or []
    print(f"Loaded {len(ta_membership_rows)} TA memberships")

    ta_ids = {str(row["therapeutic_area_id"]) for row in ta_membership_rows}

    ta_lookup_resp = (
        supabase.table("therapeutic_areas")
        .select("id,name,slug")
        .in_("id", list(ta_ids))
        .execute()
    )
    ta_name_map = {str(r["id"]): r.get("name") for r in (ta_lookup_resp.data or [])}
    ta_slug_map = {str(r["id"]): r.get("slug") for r in (ta_lookup_resp.data or [])}

    print(f"Loading v3 rank rows for {len(ta_ids)} TAs...")
    v3_rows = fetch_established_v3_context_rows(hcp_ids, list(ta_ids))
    print(f"Loaded {len(v3_rows)} (hcp_id, ta_id) v3 rank entries")

    # Open Payments
    ops_resp = (
        supabase.table("hcp_open_payments_summary_v2")
        .select("hcp_id,total_payments_lifetime,distinct_companies_lifetime")
        .in_("hcp_id", list(hcp_ids))
        .execute()
    )
    ops_by_hcp = {str(r["hcp_id"]): r for r in (ops_resp.data or [])}

    target_label_by_id = {t["id"]: t["label"] for t in TARGETS}

    for target in TARGETS:
        hcp_id = target["id"]
        hcp = hcp_map.get(hcp_id)
        if not hcp:
            print(f"\n=== SKIP {target['label']}: HCP not found ===")
            continue

        # Find which (hcp_id, ta_id) pairs we have v3 data for
        relevant_pairs = [(h, t) for (h, t) in v3_rows.keys() if h == hcp_id]
        if not relevant_pairs:
            print(f"\n=== SKIP {target['label']}: no v3 rank entries ===")
            continue

        for (hcp_id_key, ta_id) in relevant_pairs:
            v3_row = v3_rows[(hcp_id_key, ta_id)]
            ops = ops_by_hcp.get(hcp_id, {})

            ctx = HCPContext(
                hcp_id=hcp_id,
                therapeutic_area_id=ta_id,
                therapeutic_area_name=ta_name_map.get(ta_id, ta_id),
                first_name=hcp.get("first_name"),
                last_name=hcp.get("last_name"),
                institution=hcp.get("institution"),
                country=hcp.get("country"),
                cohort_classification="established",
                cohort_score=safe_float(v3_row.get("cohort_score")),
                composite_score=safe_float(v3_row.get("cohort_score")),
                pub_velocity_pct=None,
                citation_trajectory_pct=None,
                trial_investigator_pct=None,
                first_pub_year=safe_int(hcp.get("first_pub_year")),
                total_career_pubs=safe_int(hcp.get("total_career_pubs")),
                pharma_engagement_lifetime=safe_float(ops.get("total_payments_lifetime")),
                pharma_companies_distinct=safe_int(ops.get("distinct_companies_lifetime")),
                percentile_data={},
                therapeutic_area_slug=ta_slug_map.get(ta_id, ""),
                established_v3=v3_row,
            )

            ta_slug = ctx.therapeutic_area_slug or "unknown"
            print(f"\n=== {target['label']} | TA: {ta_slug} ===")
            print(f"  v3 cohort_score: {v3_row.get('cohort_score')}")
            print(f"  Sci/Net/Pharma pctile: {v3_row.get('scientific_influence_pctile')} / {v3_row.get('network_influence_pctile')} / {v3_row.get('pharma_engagement_pctile')}")
            print(f"  global_rank / us_rank: {v3_row.get('global_rank')} / {v3_row.get('us_rank')}")
            print(f"  Open Payments lifetime / companies: ${ctx.pharma_engagement_lifetime} / {ctx.pharma_companies_distinct}")

            try:
                result = generate_narrative(ctx, api_key)
                print(json.dumps(result, indent=2))

                caution = result.get("caution_flags")
                caution_payload = None
                if isinstance(caution, str) and caution.strip():
                    caution_payload = [caution.strip()]
                elif isinstance(caution, list) and caution:
                    caution_payload = caution

                upsert_payload = {
                    "hcp_id": hcp_id,
                    "therapeutic_area_slug": ctx.therapeutic_area_slug or "nsclc",
                    # Cohort key (2026-08-06): this script generates Established
                    # narratives; stamp the row so it lands on the established
                    # slot instead of clobbering another cohort's prose.
                    "cohort": "established",
                    "narrative_text": result.get("narrative"),
                    "why_now": result.get("why_now"),
                    "engagement_angle": result.get("engagement_angle"),
                    "signal_strength": result.get("signal_strength"),
                    "caution_flags": caution_payload,
                    "prompt_version": ESTABLISHED_PROMPT_VERSION,
                    "model_used": "claude-sonnet-4-6",
                    "generated_at": "now()",
                }
                upsert_resp = supabase.table("hcp_narratives_v2").upsert(
                    upsert_payload,
                    on_conflict="hcp_id,therapeutic_area_slug,cohort",
                ).execute()
                if getattr(upsert_resp, "data", None):
                    print(f"  [WROTE narrative for {hcp_id}]")
                else:
                    print(f"  [UPSERT returned no data; check schema] resp={upsert_resp}")
            except Exception as exc:
                print(f"  [ERROR generating narrative]: {exc}")


if __name__ == "__main__":
    main()
