# HCP Deduplication — Prevention of Future Duplicates

**Created:** May 9, 2026 (addendum to hcp_deduplication_design.md)
**Status:** v1.1 backlog — not blocking v1.0

---

## Why prevention is its own workstream

Pass 2 and beyond clean up historical duplicate accumulation. They do nothing to prevent NEW duplicates from being created by future ingestion runs. Without prevention work, every publication backfill, NPPES enrichment, and Open Payments ingestion will create new duplicates that have to be cleaned up again.

The dedup function we built (`merge_hcp_pair`) and merge log infrastructure can run on schedule to catch new duplicates, but the better fix is preventing them at write time.

## Where duplicates get created

Three ingestion paths create duplicate hcps rows in the current architecture:

### 1. Publication backfill (OpenAlex / PubMed)

When a publication is ingested, the script encounters one or more authors. For each author:
- If a matching HCP exists in the database, it should attach to that HCP
- If not, it creates a new HCP row

The matching logic today is loose — name variations, institution variations, or missing OpenAlex IDs cause the same person to spawn multiple rows.

Evidence: Stephen Harrison has 18 hcps rows from publication ingestion alone. Different rows have different institution strings ("University of Oxford" vs "Pinnacle Clinical Research" vs "Radcliffe Department of Medicine"). The matcher saw each as a different person.

### 2. NPPES enrichment

NPPES ingestion creates hcps rows or attaches to existing ones based on NPI. NPI uniqueness is enforced by NPPES, so this isn't the duplicate creator on its own. BUT — the Roy Herbst case shows what happens when NPPES creates a new row alongside a publication-sourced row that wasn't matched on NPI.

Roy Herbst:
- Publication-sourced row at Yale (no NPI)
- NPPES-sourced row from MD Anderson (with NPI)

Two rows for the same person because the NPPES enrichment didn't match to the existing publication-sourced row.

### 3. Open Payments / Medicare ingestion

Open Payments and Medicare data come keyed by NPI. If a payment record's NPI matches an existing HCP, it attaches. If not, ingestion may create a new HCP row. Same pattern as NPPES.

## Prevention requires three things

### Better at-write-time matching

Before any INSERT into `hcps`, check if a similar HCP exists. Match priority:

1. **NPI exact match** (when both rows have NPI) — definitive match
2. **OpenAlex author ID exact match** — high confidence (with caveat: not perfect for short Chinese names)
3. **Name + nppes_organization_npi** — high confidence
4. **Name + nppes_practice_address** — high confidence
5. **Name + institution_short normalized** — medium confidence
6. **Name + state + career signals** — medium confidence

If match found, UPDATE existing row (using fill-if-null logic from merge function). If not, INSERT new row.

This is essentially the merge_hcp_pair logic applied at write time instead of cleanup time.

### Institution normalization

Many duplicates exist because the same institution is represented by different strings:
- "Memorial Sloan Kettering Cancer Center" / "MSKCC" / "Memorial Sloan Kettering"
- "University of Oxford" / "Oxford University" / "Oxford"
- "Medical University of Vienna" / "Medizinische Universität Wien"

A normalization map would convert these to canonical forms. ~100-200 entries cover most major academic medical centers.

This normalization should run BEFORE the matching step. Two HCPs that both normalize to "MSKCC" with the same name → same person.

### Periodic re-deduplication

Even with good matching, edge cases will slip through. Schedule the dedup function to run weekly or monthly to catch what slipped:

```sql
-- Could be a cron job or pg_cron task
SELECT run_pass_2_openalex_merge();
SELECT run_pass_3_npi_org_merge();  -- when implemented
SELECT run_pass_4_address_merge();  -- when implemented
-- etc.
```

The merge functions are idempotent — running them on already-clean data does nothing. Safe to schedule.

## Implementation scope

### Quick wins (1-2 sittings)

1. **Add NPI-based dedup to NPPES enrichment script.** Before INSERT, check if HCP with matching NPI exists. If yes, UPDATE. Single most impactful change.
2. **Add OpenAlex author ID dedup to publication backfill script.** Same pattern. Catches the obvious cases.

### Medium work (3-5 sittings)

3. **Build institution normalization map.** Could be a `institutions_canonical` table with `(raw_string, canonical_name)` pairs. Or use a normalization function that handles common patterns programmatically.
4. **Refactor matching logic** across all ingestion scripts to use the normalization map and the same priority order as `merge_hcp_pair`. Consistent "find or create" pattern.
5. **Document the matching priority** in a methodology file so future ingestion changes maintain the same logic.

### Ongoing (post-launch)

6. **Schedule periodic dedup runs** via pg_cron or similar. Weekly initially, scaling to monthly once steady state.
7. **Monitor merge_log for unexpected patterns.** If a particular ingestion is producing many merge candidates, investigate whether that ingestion's matching logic needs improvement.

## v1.1 placement

Placement recommendation: just below cohort classification methodology execution.

- **v1.1 priority #1:** Cohort classification methodology execution (using deduped data from current dedup work)
- **v1.1 priority #2:** Dedup prevention workstream (this document)
- **v1.1 priority #3:** MSL crowdsourcing release (LinkedIn auth + tag UI)
- **v1.1 priority #4:** Landscape rewiring with cohort filter

Both #1 and #2 unblock different things. #1 unblocks meaningful product behavior. #2 prevents the technical debt from re-accumulating.

## Specific scripts to update

For reference when prevention work begins:

| Script (estimated path) | Current behavior | Required change |
|---|---|---|
| `publication_backfill_phase2.py` | Creates new HCP rows for unmatched authors | Match on (name + OpenAlex ID) before INSERT |
| `nppes_enrichment.py` | Inserts NPPES data, may create new HCP rows | Match on (NPI exact) before INSERT |
| Open Payments ingestion | Creates new HCPs for unmatched payments | Match on (NPI) before INSERT |
| Medicare ingestion | Likely similar pattern | Match on (NPI) before INSERT |

This list is approximate — actual script names should be verified during implementation.

---

*End of prevention addendum.*
