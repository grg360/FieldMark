# FieldMark Session Handoff — May 13, 2026

**Session length**: Full day (longest single-day session to date)
**Status at handoff**: ROR mapping ~70% complete, all other goals achieved

---

## What we accomplished today

### Architecture & design

- Diagnosed the HCP duplication root cause definitively (PubMed pipeline's `(first_name, last_name, institution)` dedup key with free-text affiliation strings)
- Designed two-level TA taxonomy (broad TAs + indications)
- Designed v2.0 ingestion architecture (`ingestion_architecture_v2_design.md`)
- Designed cancer surgery spec for HCP cleanup (`hcp_cancer_surgery_spec.md`)
- Created future roadmap doc (`fieldmark_future_roadmap.md`)
- Resolved 6 design decisions: preservation rule scope, OpenAlex thresholds, conservative reconciliation, TA sequencing (Hepatology first, Oncology/NSCLC for v1.0, Rare Disease coming soon, Immunology next), canonical snapshot, two-level TA taxonomy

### Schema foundation applied

- Added `parent_ta_id` and `ta_level` to `therapeutic_areas`
- Migrated existing TAs: Hepatology, Oncology, Rare Disease, Immunology as broad_ta; NSCLC reparented under Oncology as indication
- CHECK constraint + NOT NULL on ta_level
- Created `therapeutic_area_ingestion_config` table
- Created `canonical_hcps_snapshot` table populated with 6 verified Hepatology canonicals (Harrison, Trauner, Francque, Wong, Seung Up Kim, Loomba)
- Added UNIQUE constraint on `hcps.npi_number` (confirmed clean — no duplicates)
- Created `openalex_author_inventory` and `nppes_org_to_ror` tables
- Added publications columns: abstract, pub_date, pubmed_authorships, mesh_terms, publication_types, language, source_therapeutic_area_id, source, ingested_at
- Made `publications.hcp_id` nullable (no longer NOT NULL)

### Data work completed

- **Publications populated**: 233,215 total in DB. New `ingest_publications.py` script added ~8,400 publications using broader hepatology MeSH query.
- **OpenAlex enrichment complete**: 230,822 publications enriched (citation_counts_by_year, authorships, concepts) via `openalex_pipeline.py --skip-career-enrichment`
- **OpenAlex Author Inventory populated**: 112,195 research-active authors at threshold 5+ papers. 109,332 have ROR (97%). 59,766 have ORCID (53%).

### Scripts created

- `ingest_publications.py` — TA-aware publication ingestion with date-window pagination
- `inventory_openalex_authors.py` — Scans publications.authorships, populates inventory
- `map_nppes_to_ror.py` — NPPES org → ROR mapping (currently running)

### Critical findings

- **OpenAlex author fragmentation**: senior researchers fragmented across 3-6 OpenAlex author IDs (Loomba=5, Wong=6, Trauner=5). Step B needs `hcp_openalex_authors` join table for one-to-many mapping.
- **Trial investigator matching is the biggest unrealized signal**: 93% of CT.gov investigators (107,734 records) have null match_status. Never processed. Senior researchers like Martin Reck, Pusztai, Sands unmatched. Trial score = 25% of composite. Re-running post-surgery should produce major scoring improvements.
- **ROR matches 36% of NPPES orgs** (extrapolated): ~1,660 high+medium matches out of 4,600. The matched subset IS the research institutions that matter for Step B Category 2 reconciliation.

---

## Where things stand at handoff

### Running

- **ROR mapping**: ~70% complete at handoff (3,200 of 4,600 orgs). ETA ~12-15 more minutes. Will complete tonight.

### Ready to run tomorrow

Cancer surgery Steps B through F. Per updated spec:

- **Step B**: Reconcile existing HCPs to inventory (with one-to-many mapping via `hcp_openalex_authors`)
- **Step C**: Create new HCPs for unmatched inventory entries
- **Step D**: Wipe unidentifiable duplicates (preservation rule covers all 18 FK-referenced tables)
- **Step E**: Add UNIQUE constraint on openalex_author_id
- **Step F**: Rebuild publication_authors

### Open decisions for tomorrow

1. **Step B Category 2 matching logic** — needs full spec given ROR data now available. Conservative: require name+institution match for auto-link.
2. **Step B fragment clustering rule** — how strict on first-name root matching to cluster fragments vs distinguish homonyms (Loomba/Rohan).
3. **Step C HCP creation logic** — what fields to populate, what OpenAlex API calls to make per author, how to tag to TAs.
4. **Post-surgery trial investigator rematch** — separate workstream that closes the 107K unmatched gap. High-priority.

---

## Important context for tomorrow's session

### Things that have changed

- **My time estimates today were consistently pessimistic** (work took less time than estimated). Calibrate accordingly.
- **Documentation discipline is in place** — future roadmap doc, cancer surgery spec, session handoff. Use them.
- **Cursor-driven coding from here forward** — to preserve Claude.ai usage budget, scripts get built via Cursor prompts rather than direct generation.

### Decisions to reconfirm before building Step B

- Is the join-table approach to OpenAlex fragmentation correct, or should we explore alternatives?
- Should we run Step B against the inventory's high-confidence ROR matches only, or include medium-confidence too?
- For the Rohan/Rohit Loomba case, what's our policy for "same surname, different first name, same institution" — auto-flag as separate people, or send to manual review?

### Things Garrett is going to look at

- The Avalere KTL identification deck (when available — held outside this workspace for IP boundary reasons). May influence methodology thinking in ways we'd need to be careful to keep FieldMark provenance clean.

---

## Files in /mnt/user-data/outputs/ from today

- `ingestion_architecture_v2_design.md` — full architectural design
- `hcp_cancer_surgery_spec.md` — surgical spec with today's end-of-day updates
- `fieldmark_future_roadmap.md` — v1.1+ roadmap with today's findings
- `ingest_publications.py` — publication ingestion script
- `inventory_openalex_authors.py` — Step A inventory script
- `map_nppes_to_ror.py` — NPPES→ROR mapping script
- `session_handoff_2026_05_13.md` — this document

---

## Honest reflection on the day

The day's work doesn't fit a simple narrative. We did meaningful architectural work, applied real schema changes, populated real diagnostic infrastructure. We also discovered late in the day that some assumptions about what was needed (broader publication ingestion) were wrong because data we didn't know existed (233K publications already in DB) was already there.

The "publication ingestion script" build was real work that produced some real new coverage (~8,400 new publications from broader MeSH terms), but most of the time spent on that pipeline was redundant with infrastructure that already existed.

The day's net value comes from: (1) the architecture design that's now clear, (2) the schema foundation that's applied, (3) the OpenAlex inventory that's populated, (4) the ROR mapping that's running, (5) the discovery that trial matching is broken because it was never finished, not because the algorithm was wrong, and (6) the discovery that OpenAlex fragments senior researchers in ways Step B must handle.

These are real wins. The cancer surgery is materially closer than it was 24 hours ago.