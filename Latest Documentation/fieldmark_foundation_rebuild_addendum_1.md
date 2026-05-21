# FieldMark Foundation Rebuild — Addendum 1

**Version:** 1.1
**Date:** May 21, 2026 (afternoon)
**Updates to:** `fieldmark_foundation_rebuild_spec.md` v1.0

---

## Why this addendum exists

After drafting v1.0 of the spec, a data inventory pass surfaced additional data sources and existing scripts that need to be reflected in the rebuild plan. This addendum captures those updates without rewriting the main spec.

## Updates

### Update 1: Two ingestion workstreams, not one

The original spec implied a single HCP ingestion path. In reality, FieldMark has two:

**Workstream A — Academic / Research HCPs:**
- Source: PubMed authors + OpenAlex authors + ClinicalTrials.gov investigators
- Population: People publishing in target therapeutic areas
- Classification target: Established, Rising Star
- Existing scripts: `pubmed_pipeline.py`, `openalex_pipeline.py`, `career_enrichment.py`, `publication_backfill_phase3.py`
- New scripts to write: `pubmed_backfill_rebuild.py`, `openalex_multi_shard_linker_rebuild.py`

**Workstream B — Community HCPs:**
- Source: NPPES Parquet file filtered by NPI taxonomy codes
- Population: Field clinicians in target specialties, may have light or no publication record
- Classification target: Community
- Existing scripts: `nppes_workstream_b_ingest.py`, `nppes_api_backfill.py`, `nppes_enrichment.py`, `targeted_nppes_enrichment.py`, `affiliation_profiler.py`
- No new scripts needed; existing ones get repointed at v2 tables

Both workstreams populate `hcps_v2`. They coexist; the same HCP could be present from both sources (a publishing academic who's also NPPES-listed). NPI is the disambiguator. When both Workstream A and Workstream B identify the same NPI, the row is merged with both data sources contributing fields.

### Update 2: Schema additions for Open Payments and Medicare

Added in Phase 1 addendum SQL (committed: `sql/rebuild/phase1_addendum_open_payments_medicare.sql`):

- `hcp_open_payments_summary_v2` — industry payment aggregation per HCP
- `hcp_medicare_summary_v2` — Medicare claims aggregation per HCP

Both with RLS enabled and public-read policies matching the v1 pattern.

### Update 3: Phase 7 expansion — explicit enrichment script list

Original Phase 7: "NPPES + Open Payments enrichment (Day 5, May 26)"

Updated Phase 7:

**Phase 7: NPPES + Open Payments + Medicare + Affiliation enrichment (Day 5, May 26)**

Re-run existing enrichment pipelines against `hcps_v2`. All scripts get a `--target-version v2` flag added (rather than being rewritten) to allow them to write to v2 tables:

1. **`nppes_api_backfill.py --target-version v2`** — NPPES specialty, practice address, practice setting written directly to hcps_v2 columns
2. **`affiliation_profiler.py --target-version v2`** — Institution affiliation classification (clinical department, academic vs community, etc.)
3. **`open_payments_aggregator.py --target-version v2`** — Industry payments aggregation written to hcp_open_payments_summary_v2
4. **`medicare_aggregator.py --target-version v2`** — Medicare claims aggregation written to hcp_medicare_summary_v2

Acceptance: Coverage counts roughly match existing prod tables. Lifetime payments + beneficiary counts populated for HCPs with NPIs.

### Update 4: Phase 9 narrative regeneration uses existing improved script

Original Phase 9 implied writing a new narrative generation script.

Updated Phase 9:

**Phase 9: Narrative regeneration (Day 6-7, May 27-28)**

The existing `generate_narratives_v2.py` is a sophisticated script with cohort-aware prompts, 5 structured output fields, percentile-based context, and dry-run cost preview. It does NOT need rewriting. It needs `--target-version v2` flag added so it reads from hcps_v2 / hcp_scores_v2 and writes to hcp_narratives_v2.

The Gulley narrative problems we identified earlier today (artifactual "1 year of publication" framing, raw "97.63rd percentile" formatting) are problems with the INPUT data the script receives, not with the script itself. Clean inputs → clean narratives.

Acceptance criteria unchanged from v1.0 of spec.

### Update 5: Script naming convention

To avoid confusion with the existing `generate_narratives_v2.py` (where "_v2" means "second iteration of the narrative script," not "rebuild v2"):

**All new rebuild-era scripts use `_rebuild` suffix, not `_v2`.**

Examples:
- `identity_resolution_rebuild.py` (new)
- `pubmed_backfill_rebuild.py` (new)
- `openalex_multi_shard_linker_rebuild.py` (new)
- `ta_tagging_rebuild.py` (new)
- `scoring_rebuild.py` (new)

Existing scripts retain their names. The `--target-version v2` CLI flag determines whether they write to v1 or v2 tables.

### Update 6: Script modification convention

Existing scripts will NOT be rewritten. They'll be modified in place to support targeting either v1 or v2 tables via a CLI flag:

```python
parser.add_argument("--target-version", choices=["v1", "v2"], default="v1",
                    help="Which schema version to write to.")
```

Functions that interact with the database get an optional `target_version` parameter that selects the appropriate table name:

```python
def get_target_table(table_name: str, version: str) -> str:
    if version == "v2":
        return f"{table_name}_v2"
    return table_name
```

This pattern keeps v1 production behavior intact while enabling v2 rebuild runs.

Scripts to modify in place:
- `nppes_workstream_b_ingest.py`
- `nppes_api_backfill.py`
- `nppes_enrichment.py`
- `targeted_nppes_enrichment.py`
- `affiliation_profiler.py`
- `open_payments_aggregator.py`
- `medicare_aggregator.py`
- `generate_narratives_v2.py`
- `dol_matching.py`

### Update 7: Removed assumption that all enrichment runs once

The original spec implied each phase runs once linearly. In practice, several enrichment scripts produce different outputs depending on which HCPs are present and may need to be re-run after other phases complete.

Specifically:
- **NPPES enrichment** runs early to provide NPI-based identity for hcps_v2 rows
- **Workstream B (community)** ingestion runs after NPPES to fill out community HCPs
- **Affiliation profiler** runs after both, profiling the combined HCP set
- **Open Payments + Medicare** run last (they need the NPI list from hcps_v2 to know which HCPs to query)

Order matters. Phase 7 should be structured as:
1. NPPES API backfill (provides NPI specialty/practice data)
2. Workstream B community ingest (populates community HCPs)
3. Affiliation profiler (categorizes institutional affiliations)
4. Open Payments aggregator (industry payments by NPI)
5. Medicare aggregator (claims by NPI)

Each script writes to its target v2 table. Parallel runs are possible after #1 and #2 complete.

---

## What hasn't changed

- Identity model (NPI → ORCID → name+inst+coauthor)
- Multi-shard OpenAlex linking philosophy
- TA tagging precision (≥3 publications threshold)
- Quality gates and flagging
- Institution normalization principle
- Pilot before scale
- Observability built in
- 12-phase execution plan structure
- Risk inventory and mitigations
- Strangler-fig pattern

The v1.0 spec remains the primary working document. This addendum supplements it with discoveries from the script inventory.

---

## Implications for the demo timeline

The expanded Phase 7 scope is real work but uses existing scripts. No additional risk to the May 28 foundation completion target.

Total scripts needing modification: 9
Total new scripts needing to be written: 5
Estimated effort: Same as v1.0 estimate. Modification < rewrite.

---

## Approval

This addendum reflects findings from data inventory and is approved for incorporation into the rebuild plan.

| Role | Name | Date |
|------|------|------|
| Product/Engineering | Garrett | May 21, 2026 |

Phase 2A (pilot validation set) begins next.
