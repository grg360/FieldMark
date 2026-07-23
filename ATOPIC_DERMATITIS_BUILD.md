# Atopic Dermatitis Build Log

**Project:** Second therapeutic area for FieldMark platform
**Started:** July 1, 2026
**Owner:** Garrett Reeves
**Status:** Ingestion in progress

---

## Purpose

Running documentation of how AD was added to FieldMark. Decisions, source data choices, pipeline runs, methodology notes, and lessons for future TA expansions.

---

## Strategic context

- **Product scope:** US-focused MSL intelligence platform. Established / Rising Star / Community cohorts. NSCLC is TA #1, live in production.
- **AD selection rationale:** Immunology space, active biologic/JAK investment landscape, strong Rising Star dynamics expected.
- **Parent category:** Immunology. Deliberate — AD is an indication under a broader TA, matching NSCLC → Oncology.

---

## Architectural decisions

### JSON config-driven ingestion (July 1)

Refactored ingestion from hardcoded Python constants to per-TA JSON configs at `config/therapeutic_areas/*.json`. Every future TA is a config file, not a code change.

Files:
- `config/therapeutic_areas/nsclc.json` — backfilled verbatim from existing constants, regression-verified byte-for-byte
- `config/therapeutic_areas/atopic-dermatitis.json` — new
- `config/therapeutic_areas/hepatology.json` — dormant, taxonomies empty
- `config/therapeutic_areas/rare-disease.json` — dormant, taxonomies empty

Scripts modified:
- `scripts/ingest/pubmed_pipeline.py` — added `load_ta_config()` and `list_ta_configs()`, `--ta` flag, removed `PUBMED_QUERY_*` constants
- `scripts/ingest/nppes_workstream_b_ingest.py` — dynamic TA loading

### TA hierarchy in database

`therapeutic_areas.parent_ta_id` column enables parent-child relationships. `fetch_ta_hierarchy()` in `ingest_publications.py` walks the chain, so publications get double-tagged automatically (AD paper is also tagged Immunology).

AD schema record:
- `slug`: `atopic-dermatitis`
- `ta_uuid`: `9e4139d2-e062-4a58-8728-cdabb2d7dca1`
- `parent_uuid` (Immunology): `4cf07827-ff1c-451e-832e-0e0a14ea9c86`
- `ta_level`: `indication`

---

## Source data scoping

### PubMed query strategy

**Approach:** High-recall search per advisor recommendation. MeSH descriptors + title/abstract synonyms + historical terms + therapy names (dupilumab, tralokinumab, upadacitinib, etc.). Trades broader recall for downstream filtering.

**Full query:** See `config/therapeutic_areas/atopic-dermatitis.json` under `pubmed.us_query`.

**Key terms captured:**
- Core: "Dermatitis, Atopic"[Mesh], "Eczema"[Mesh]
- Modern: atopic dermatitis, atopic eczema
- Historical: Besnier prurigo, allergic eczema, constitutional eczema, endogenous eczema, disseminated neurodermatitis
- Therapy anchors: dupilumab, tralokinumab, lebrikizumab, nemolizumab, upadacitinib, abrocitinib, crisaborole, delgocitinib, roflumilast cream

**Excluded:** Bare "AD" abbreviation (too noisy — Alzheimer's, autosomal dominant, atrial dilation all collide).

**Query pattern:** US-filtered via `AND ("United States"[Affiliation] OR "USA"[Affiliation])` matching NSCLC US query structure.

### NPPES taxonomies

- `207N00000X` — Dermatology (general)
- `207NI0002X` — Dermatology / Clinical & Laboratory Dermatological Immunology

Initial NPPES row count under these taxonomies: 17,654 (much higher than NSCLC's 7,233 — the US derm workforce is large).

**Deferred discussion:** Whether to also include pediatric dermatology and allergy/immunology subspecialties. Not tonight.

### Future ontology work

Advisor recommended building a proper disease ontology layer (MeSH + Emtree + UMLS + SNOMED + ICD + synonyms + multilingual + phenotypes + therapy concepts). Deferred as post-AD-launch architectural upgrade. The JSON config layer is the prerequisite — ontology objects can be referenced from the JSON when added.

---

## Ingestion sequence and status

| # | Step | Status | Notes |
|---|------|--------|-------|
| 1 | Add AD to `therapeutic_areas` table | ✅ Done | UUID assigned |
| 2 | JSON config-driven ingestion refactor | ✅ Done | Verified NSCLC verbatim under new abstraction |
| 3 | PubMed AD ingestion | 🟡 In progress | Kicked off July 1 |
| 4 | OpenAlex enrichment for AD papers | ⏳ Pending | Runs after PubMed |
| 5 | NPPES Workstream B for dermatology taxonomies | ⏳ Pending | Adds AD-classified community HCPs |
| 6 | Publication leadership computation for AD | ⏳ Pending | Prerequisite for Established narratives |
| 7 | Established scoring for AD | ⏳ Pending | Uses existing `established_scoring.py --ta` flag |
| 8 | Rising Star scoring for AD | ⏳ Pending | Watch cohort composition |
| 9 | Community scoring for AD | ⏳ Pending | |
| 10 | Pharma engagement scoring for AD | ⏳ Pending | Sunshine Act pharma dollars |
| 11 | Rank recompute for AD | ⏳ Pending | `recompute_established_ranks_v3.py --ta atopic-dermatitis` |
| 12 | Narrative generation for AD | ⏳ Pending | Update prompts if AD needs different framing than NSCLC |
| 13 | Frontend TA toggle | ⏳ Pending | Enable AD in TA switcher |

---

## Methodology alignment issues to resolve for AD

These were identified during NSCLC work and will resurface when AD scoring runs:

- **Established scoring methodology:** Currently 50/35/15 (Scientific / Network / Pharma). Missing signals get reweighted proportionally, which can advantage HCPs with data gaps. Same behavior applies to AD.
- **`ranks_v3` staleness:** NSCLC `ranks_v3` is frozen from June 5. When AD ranks are computed, decide whether to also refresh NSCLC to align methodology across TAs.
- **Rising Star cohort gates:** Score pipeline uses `total_career_pubs >= 10` as ranking gate. For AD, verify this still selects a real cohort — biologic-era AD authors are typically fewer papers than NSCLC investigators.
- **Establishment override:** `>= 500 pubs → 0.75 multiplier` gate. Very few AD investigators have 500+ AD papers; the override may effectively not trigger for AD, which is fine but worth naming.

---

## Frontend expansion (post-ingestion)

The frontend has hardcoded NSCLC references in ~74 files (246 total references) per the TA_EXPANSION_AUDIT. AD launch will need at minimum:

- TA toggle to expose AD in the TA switcher
- Labels that don't leak NSCLC-specific language
- Card layouts that render AD data reasonably (AD HCPs won't have "9.7K citations" like Heymach — different scale of academic output)

**Deferred:** Full frontend config refactor to remove all hardcoded TA references. Real project, better done after AD is running.

---

## Lessons carried forward from NSCLC to future TAs

### Data quality

- **OpenAlex `works_count` is polluted by author conflation** for prolific researchers. For NSCLC we corrected by sourcing `total_career_pubs` from `publication_authors_v2` (the TA-scoped join table). AD ingestion should produce a clean join table from the start; watch for the same conflation issue and same fix.
- **Data quality flags need downstream consumption.** `conflation_suspected: true` existed on 639 HCPs but nothing read it. Ensure AD ingestion respects the flag at scoring and narrative layers.

### NPI linkage gaps

- Some US-practicing HCPs have publication-keyed `hcps_v2` rows without NPIs, and separate NPPES-keyed stub rows holding their NPI + Open Payments data. For NSCLC we manually merged Jänne and Reddy. AD will likely have similar patterns — build a diagnostic query to identify these early rather than discover them per profile.
  - **NOTE (v2 refactor):** these publication-keyed HCP rows are *legacy*. `pubmed_pipeline.py` no longer creates HCPs from PubMed names — HCP identity is now minted OpenAlex-first by `create_hcps_v2.py`, so this specific pub-stub-vs-NPPES-stub split will not be newly produced going forward. Existing legacy rows may still need the merge; new ingests won't add to them.
- Query pattern for finding merge candidates: `WHERE h.nppes_practice_state IS NOT NULL AND h.npi_number IS NULL` in top-100 cohort.

### Session discipline

- Time estimates: "weeks" from Claude often means "hours." Trust doing the work, verify what actually takes long.
- Diagnostics before design: prove a hypothesis with data before proposing a fix.
- Config over constants: additive constants create technical debt. JSON-per-TA at every layer.

---

## Update log

| Date | Change |
|------|--------|
| July 1, 2026 | Initial file. AD TA record inserted. JSON config refactor committed. PubMed ingestion kicked off. |
