# FieldMark v2 Roadmap

Last updated: May 26, 2026 EOD (Day 5 of foundation rebuild)

---

## Current State

### v2 Foundation Complete
- **hcps_v2**: 269,392 HCPs (down from 270,032 post-dedup)
- **Established cohort**: 11,389 HCPs × 2 TAs = 22,778 per-TA scores in hcp_established_scores_v2
- **Rising Star cohort**: Scored to hcp_scores_v2 (Hep 142,178 / NSCLC 70,591 candidates evaluated)
- **Community cohort**: 75 HCPs (over-strict COE gate; rebuild pending with geographic gate)
- **Open Payments**: 222,544 rows across 4 tables (summary, by_ta, top_companies, by_drug)
- **Medicare**: 26,005 summary + 19,379 by_ta rows
- **Reference institutions**: 421 entries across 8 entity types
- **HCP-institution links**: 31,386
- **Trial investigator linkage**: 50,668 of 259,738 rows (19.5%, up from 3.1%)
- **Trial-TA mapping**: 6,776 trials (Hep 4,313 / NSCLC 2,463)
- **Dedup**: 640 stubs merged (Sanyal, Kowdley fully consolidated; Chalasani 3-way partial)
- **Frontend api.ts**: v2 cutover complete; TypeScript compiles clean

### Canonical KOL State Post-Dedup
- Loomba: 1,536 pubs, NPI ✓, $271K OP, Hep #1 (normalized 100)
- Sanyal: 1,456 pubs + NPI + 19 trials + $387K OP + 57 Medicare, Hep #2 (normalized 98.87)
- Kowdley: 1,016 pubs + NPI + 7 trials + $646K OP + 141 Medicare, Hep visible at normalized 66.64
- Chalasani: partial — main pub record (22388b63) orphaned; merged record (0731986d) has NPI + trials. Surgical fix in TECH_DEBT.

---

## Pre-ASCO (Wed-Thu May 27-28)

### 1. Frontend Triage (highest priority)
- Start dev server: `cd frontend && npm run dev`
- Identify first 3-5 surface issues:
  - Tier badge rendering (Dark Horse/Workhorse leftovers expected)
  - Cohort count accuracy via fetchLiveCohortCountsForTAIds
  - HCP detail page renders Open Payments + Medicare data for canonicals
  - DOL panel state
- Fix one at a time; commit per fix

### 2. DOL Workstream
- Wire dol_matches_v2 into frontend
- Verify social_users_v2 + social_posts_v2 query paths
- Ensure ASCO content can stream into feed

### 3. ASCO Content Pipeline
- Automate fetching every 3-4 hours during conference
- Source: Twitter/X for #ASCO26 hashtag and key HCP accounts

---

## ASCO Week (May 29 - June 2)

**Goal: Social feed lit up Friday May 29, NOT live demo.**

- DOL identification active
- Post fetching automation running
- Maintain platform availability
- No structural changes during demo window
- Monitor for surface issues, log to TECH_DEBT

---

## Post-ASCO Phase 2 (Week of June 5)

### Priority Order

1. **NIH RePORTER enrichment**
   - R01/K-series grants ingestion
   - Multi-PI co-investigator networks (feeds Collaborative Orbit)
   - New table: `nih_grants_v2` (project_id, pi_hcp_id, mechanism, dollar_amount, dates, abstract, MeSH)
   - Aggregator: `nih_grants_aggregator.py` per-HCP summary
   - Wire into Rising Star + Established scoring as new signal
   - Estimated: 4-6 hours

2. **Collaborative Orbit visual**
   - Co-investigator graph from co-authorship + shared trial investigators + NIH co-PI
   - New table: `hcp_collaborations_v2` (hcp_a_id, hcp_b_id, signal_type, weight, evidence_count)
   - Frontend visualization component
   - "Game changer in the demo" per Garrett
   - Estimated: 8-12 hours

3. **Community scoring rebuild**
   - Geographic gate via nppes_practice_state (NOT metro area)
   - Excludes major MSAs, includes everyone else
   - Base eligible: ~5,372 HCPs
   - TA-specific metric ranking
   - Estimated: 3-4 hours

4. **Chalasani 3-way surgical merge**
   - SQL: merge 22388b63 (main pub) → 0731986d (merged secondary)
   - Estimated: 5 min

5. **Dedup tier 2** (if useful for scale)
   - Re-run dedup_detect with relaxed criteria
   - Soundex/Levenshtein fuzzy matching with manual review
   - Estimated: 2-3 hours

6. **v1 archive**
   - Export v1 tables to .sql.gz dumps in /sql/v1_archive/
   - Drop v1 tables in Supabase
   - Single commit: "Archive v1 schema; v2 is system of record"
   - Estimated: 1-2 hours

---

## Post-ASCO Phase 3 (June 12+)

- Narrative regeneration against v2 post-dedup state
- Frontend cleanup: Dark Horse/Workhorse rendering removal, tier nomenclature finalized, auth screen tagline republished
- Rising Star threshold refinement if data quality issues surface in frontend
- Additional TAs: cell & gene therapy expansion, hematologic oncology lead indication
- LinkedIn OAuth wiring (paired build, not outsourced)
- Weekly automated refresh pipeline (Monday morning digest)

---

## Outstanding Tech Debt

See `TECH_DEBT.md` for full list of deferred items.

---

## Strategic Reminders

- ~57,000 US MSLs target market
- $24.99/month individual subscription
- 7-day free trial → PWA
- Substance before presentation: don't paint pigs at the end
- Competitor differentiation: rising stars + weekly refresh + crowdsourced MSL intelligence + Collaborative Orbit + NL AI queries + individual MSL subscription + mobile-first
- Competitors: Veeva Link, H1, IQVIA, Within3, Indegene
