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

## Shadow KOL cohort (new classification, post-ASCO)

A new HCP cohort sitting between Established and Community. The pattern surfaces in the current community scoring output: HCPs with very high pharma engagement (e.g., Guy Young at $344K lifetime, Glenn Davis at $1.97M, Maya Srivastava at $1.2M) who are NOT at AAMC medical schools or NCI cancer centers, so they fall through Established classification, but who clearly aren't "doctors in the wild" community practitioners either. They're industry-engaged specialists at large private systems, pediatric hem/onc programs, regional referral centers — already on competitors' radar but invisible to academic-KOL frameworks.

Why this matters:
- From an MSL prospecting perspective, these are some of the highest-value targets — heavily engaged by industry, geographically distributed, often the regional opinion leaders that academic KOL databases miss.
- Including them in Community pollutes the community list (Community is supposed to be community practitioners, not industry-engaged specialists with $1M+ in payments).
- Excluding them entirely would discard valuable signal.
- They are NOT the same as Dark Horse / Workhorse, which were just labels for the top 5% of Rising / Community. Shadow KOL is a fundamentally different classification boundary, not a within-cohort tier.

Design questions to resolve post-ASCO:
- Threshold for $X pharma engagement: TBD. Need to analyze distribution of community pharma engagement and pick a defensible cut. Probably $100K-$500K lifetime.
- Scoring formula: likely heavier pharma weighting, lighter on Medicare patient volume vs current community formula.
- Classification mechanics: new cohort_classification value ('shadow_kol'), new scoring table hcp_shadow_kol_scores_v2 mirroring the other three, or a flag on existing community scores. Lean toward separate cohort for cleaner downstream queries.
- Gate from Community: HCPs that qualify as Shadow KOL are excluded from Community feed and surfaced separately.

MSL crowdsourcing tie-in:
This cohort is the ideal first surface for structured MSL contributions. "Is this person a true Shadow KOL or just an HCP with one big pharma relationship?" — that binary question is structured, queryable, and exactly the kind of field-intelligence signal that academic data alone can't produce. Field validations against this cohort would build credibility for the broader contribution system.

Sequence: Build this after the ranking foundation lands and the frontend filter framework is in place. Likely Phase 3 work.