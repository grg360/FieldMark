# FieldMark v2 Tech Debt

## Canonical UUIDs in v2 scripts still reference v1
Several v2 Python scripts hardcode v1 canonical KOL UUIDs. Underlying data aggregation works correctly via NPI matching — only in-script validation/canonical_check blocks fail.

Scripts affected: open_payments_aggregator.py, medicare_aggregator.py

Real v2 UUIDs:
- Loomba: 8a5ed89d-df8a-4b7c-a5f7-37f602b63577
- Sanyal: be751618-9371-4ce1-8760-c579599fd30e (publication-keyed; separate stub 4f51954e has NPI)
- Chalasani: 22388b63-dc82-44d7-abaa-24ab8f4ab8eb (separate stub 0731986d has 43 authorships; ad708363 has NPI)
- Kowdley: 272ff3bc-0464-499b-9ab2-1ceae503e415 (separate stub 043409e4 has NPI)

## community_scoring.py needs rebuild
Original script was never saved to disk. Needs rebuild with geographic gate (not metro area) per May 26 reframe. Defer to post-dedup.

## Dedup work pending
12,312 candidate clusters identified yesterday. Score-first approach: dedup only top scorers fragmented across stubs. Approach A smart merge per 5 rules. Real fragmented canonicals: Sanyal, Chalasani, Kowdley.

## Established cohort_score not differentiated
Path-based bucketing produces only 5 distinct scores. 4,092 HCPs all have score=95. Per-TA scores in hcp_established_scores_v2 are differentiated; hcps_v2.cohort_score remains path-based.

## Trial-to-TA mapping ~2-3% false-positive rate
Liver metastases of non-Hep cancers tag as Hep; Selpercatinib thyroid trials tag as NSCLC via drug. Acceptable for demo.

## Frontend cleanup deferred
- Dark Horse / Workhorse rendering cleanup
- Tier nomenclature in hcp_scores_v2  
- Republish auth screen tagline
- DOL workstream wiring against dol_matches_v2