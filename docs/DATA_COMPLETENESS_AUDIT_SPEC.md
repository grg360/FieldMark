# Data-Completeness Audit — Spec (fire when narratives finish)

READ-ONLY audit. Find every instance of ONE pattern: NSCLC-era code that reads GLOBAL / TA-independent
data (columns, tables, or unscoped queries) where it should read PER-TA scoped data — and was never
migrated/back-filled when new TAs (AD, Hepatology, Rare Disease) arrived. Report only. Change NOTHING,
run NOTHING billed. Deliverable: docs/DATA_COMPLETENESS_AUDIT.md — a PRIORITIZED LIST, not prose.

## Why: the known instances (the pattern's fingerprint — all same family)
Already found + fixed/worked-around, as evidence of the shape you're hunting:
1. established_scoring.py — cartesian product, no per-(HCP,TA) membership check → NSCLC board 61% contaminated. FIXED (data).
2. community narrative selector — read global hcps_v2.cohort_classification → 84% non-NSCLC. FIXED (query scoping).
3. getTACounts / getHCPDetail — read legacy hcp_established_scores_v2 / hcp_score_ranks_v2. FIXED (repoint).
4. telescope export — seeded from hcp_score_ranks_v2. FIXED (repoint).
5. institution_canonical — populated NSCLC, ~empty AD (8/447). WORKED AROUND (read institution_normalized for AD).
6. hcp_rising_star_ranks_v3 — 0 AD rows, 4 surfaces read it. WORKED AROUND (composite repoint per surface).
7. narrative open-payments .in() — unbatched, overflowed at 697 ids. FIXED (chunk at 500).
The audit CONFIRMS whether these are the whole family or finds MORE.

## Scope: DATA / PIPELINE layer only
Scorers, classifiers, selectors, generators, exporters, and their DB reads (Python scripts + api.ts data-layer
functions). NOT the frontend hardcoded-TA sweep — that's a different pattern already cataloged in
docs/MULTI_TA_AUDIT.md. Keep it finite.

## Categories to search (each is a grep/enumeration, not an excavation)

### Category A — global-column reads that should be per-TA
Grep every read of the known GLOBAL TA-independent columns/tables:
- hcps_v2.cohort_classification, hcps_v2.cohort_score (global cohort columns)
- hcp_score_ranks_v2, hcp_established_scores_v2 (legacy contaminated score tables)
- any cohort/rank/score .select() or .eq() that does NOT filter therapeutic_area_id and does NOT loop visible_ta_ids
For EACH hit: file:line, what it reads, and classify — (correct/intentionally-global) | (un-migrated BUG) |
(dead code). For bugs: what the per-TA fix is (mirror the rising/established selectors' visible_ta_ids loop).

### Category B — per-TA tables populated for only SOME TAs
Enumerate the per-TA tables (therapeutic_area_id-keyed): hcp_established_ranks_v3, hcp_rising_composite_v1,
hcp_community_ranks_v2, hcp_cohort_classification_v2, hcp_publication_leadership_v2, hcp_research_themes_v2,
hcp_scientific_positions_v1, hcp_narratives_v2, institution tables, etc. For EACH: row count BY
therapeutic_area_id. Flag any LOPSIDED table (rows for one TA but ~0 for another that surfaces read) — that's a
latent completeness gap like institution_canonical / rising_star_ranks_v3. Report the by-TA count matrix.

### Category C — unchunked .in() / query-scale bugs
Grep every .in( call across the pipeline scripts + api.ts. Flag any NOT wrapped in a chunking loop
(for i in range(0, len, N)). These bite when a larger cohort hits them (like the open-payments 400). For each:
file:line, is it chunked?, what's the max id count it could see?

### Category D — hardcoded TA assumptions in pipelines
Scripts/functions that: default to a specific --ta (e.g. defaults to atopic-dermatitis or nsclc), loop over a
HARDCODED TA list (TARGET_TA_IDS = [...]), or assume a single TA. For each: file:line, the assumption, and the
blast radius when a new TA is added.

## Deliverable format (docs/DATA_COMPLETENESS_AUDIT.md)
A single PRIORITIZED TABLE, worst-first:
| # | File:line | Category | Pattern | TA(s) affected | Severity | Fix type | Status |
Severity: VISIBLE-WRONG (users see bad data) > LATENT (wrong but not surfaced yet) > COSMETIC > INTENTIONAL(ok).
Fix type: data-rebuild | query-repoint | chunk | back-fill | none-needed.
Then a one-paragraph summary: total instances found, how many NEW (not already in the known-7), and the single
worst one. THE GOAL IS A FINITE COUNT — end with "N total TA-scoping issues remain, of which M are new."

## Rules
- READ-ONLY. SELECT/count queries + file reads only. Run NOTHING that writes or bills.
- Believe the pattern is BOUNDED — you're enumerating instances of one known shape, not finding arbitrary bugs.
- If a hit is correct/intentional (e.g. a genuinely global metric), say so — don't flag correct code.
- Prioritize; a VISIBLE-WRONG issue matters more than a latent cosmetic one.
