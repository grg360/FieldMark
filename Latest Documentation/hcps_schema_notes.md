# hcps Schema Notes & Conventions

**Created:** May 15, 2026 (post-surgery)
**Purpose:** Operational rules and gotchas for any script, query, or workstream that reads from or writes to the `hcps` table.
**Status:** Living document. Append new findings as they surface.

---

## Why this doc exists

The HCP cancer surgery (May 13-14, 2026) restructured the `hcps` table's identity model. Post-surgery, several conventions are load-bearing — violating them produces silent data quality issues, performance failures, or both. This doc consolidates them in one place so new scripts get them right from the start.

Before writing any new script that queries `hcps`, read this doc.

---

## Identity primitives

**The canonical HCP↔OpenAlex relationship lives in `hcp_openalex_authors`, not in `hcps.openalex_author_id`.**

- `hcps.openalex_author_id` is a denormalized "primary OpenAlex ID" column. It is NOT unique.
- `hcp_openalex_authors` is the source of truth for the many-to-many relationship: one HCP can have multiple OpenAlex IDs (fragmentation), and one OpenAlex ID can be assigned to multiple HCPs (OpenAlex's upstream misattribution, ~4.6% of database).
- The UNIQUE constraint that matters: `hcp_openalex_authors.(hcp_id, openalex_author_id)`.

**Why this matters:**

- For pulling "all publications by HCP X," do NOT join `publications` via `hcps.openalex_author_id`. Join via `hcp_openalex_authors` to capture all of the HCP's fragmented OpenAlex identities.
- For "find the HCP for OpenAlex ID Y," looking up by `hcps.openalex_author_id = Y` may return zero rows if Y is a fragment that's only in the join table, or multiple rows if Y is a misattributed shared ID.
- The Step B+ surgery work explicitly rejected a UNIQUE constraint on `hcps.openalex_author_id` for this reason. Don't try to add it back.

**Pattern to use:**

```sql
-- Find HCP for an OpenAlex author ID (canonical lookup)
SELECT h.*
FROM hcps h
JOIN hcp_openalex_authors hoa ON hoa.hcp_id = h.id
WHERE hoa.openalex_author_id = 'https://openalex.org/A...';
```

```sql
-- Find all OpenAlex IDs for an HCP
SELECT openalex_author_id, is_primary, match_confidence
FROM hcp_openalex_authors
WHERE hcp_id = '<hcp_uuid>'
ORDER BY is_primary DESC;
```

---

## Case-insensitive lookups: use `last_name_lower` and `state_lower`

**Discovered May 15, 2026.** The `hcps` table has two generated columns specifically for case-insensitive lookups:

- `last_name_lower text GENERATED ALWAYS AS (lower(last_name)) STORED` — indexed by `idx_hcps_last_name_lower_new`
- `state_lower text GENERATED ALWAYS AS (lower(state)) STORED` — indexed by `idx_hcps_state_lower_new`

**Always use these for case-insensitive name and state filtering.** Do NOT use `ILIKE` on the raw `last_name` or `state` columns — Postgres's planner cannot use the original btree indexes for ILIKE queries and will fall back to a bitmap scan of all 30K NPI-bearing rows, triggering statement timeouts on Supabase.

**Bad — will time out:**

```python
.ilike("last_name", "leitch")
.ilike("state", "tx")
```

**Good — uses the indexes, sub-10ms:**

```python
.eq("last_name_lower", "leitch")
.eq("state_lower", "tx")
```

The caller must lowercase the value before passing it in. The script's existing `ns(...).lower()` and `normalize_state_to_abbrev(...)` helpers do this.

**Why functional indexes alone (`CREATE INDEX ... ON hcps (lower(last_name))`) didn't work:** PostgREST translates `.ilike()` to `ILIKE` in SQL, which the planner doesn't auto-rewrite to `lower(last_name) = 'value'`. The generated column + index pattern is the cleanest fix.

**Performance witnessed:** 2,077ms → 9.29ms for a representative candidate query. ~220x improvement.

**Implication for future scripts:** Anything matching HCPs by name and state (trial investigator matching, NPPES enrichment, contributor lookups, etc.) should use these columns. If you find yourself adding more case-insensitive lookups (e.g., on city or first_name), add equivalent generated columns rather than using `ILIKE`.

---

## Constraints worth knowing

### `hcps_name_institution_unique` — UNIQUE on `(first_name, last_name, institution)` raw text

This constraint dates from the legacy PubMed ingestion pipeline. It enforces uniqueness on raw text fields without normalization.

**Behavior:**
- Blocks new HCP creation when raw `(first_name, last_name, institution)` already exists
- Step C of the surgery hit this 30 times (collisions reconciled May 15 via `reconcile_step_c_duplicates_apply.py`)
- Does NOT prevent semantic duplicates with normalization differences (e.g., "MSKCC" vs "Memorial Sloan Kettering Cancer Center" creates two HCPs)

**Roadmap status:** Marked for removal in `fieldmark_future_roadmap.md` as post-surgery cleanup. The constraint is now actively counterproductive — it blocks legitimate distinct researchers with similar names at the same institution. Until removed, ingestion scripts should expect occasional collisions and handle them gracefully (link the existing HCP to the new OpenAlex ID via `hcp_openalex_authors` rather than failing the run).

---

## NPI vs OpenAlex coverage — the matching gap

**Current state (May 15, 2026):**

- Total HCPs: 131,404
- HCPs with NPI: 30,082 (23%)
- HCPs with OpenAlex author ID: 97,280 (74%)
- HCPs with both: 7,044

**The implication:** Scripts that filter on NPI miss ~101K researchers, including all 35,327 new HCPs added by Step C of the surgery (which were created from OpenAlex inventory, not NPPES).

**Examples of who's invisible to NPI-only filters:**

- International researchers (no NPI by definition)
- Most non-US academic researchers in the OpenAlex inventory
- The 11K Chinese researchers added in Step C
- Anyone whose pathway into the database was publication-driven, not NPPES-driven

**When to use NPI filtering:** US clinician matching (NPPES sourcing), Open Payments / Medicare reconciliation, anything specifically about US-licensed clinical practice.

**When NOT to use NPI filtering:** Research network analysis, publication-based scoring, international researcher matching, OpenAlex-driven discovery.

**Current consequence:** The Stage 2 trial investigator matcher (`trial_investigator_matcher.py`) filters candidates on `npi_number IS NOT NULL`. This means it cannot match international site PIs or Step C researchers regardless of how good its name+state logic is. Acknowledged limitation; v1.5+ work to expand the candidate pool is on the roadmap.

---

## Indexes that exist (May 15, 2026)

For reference when writing new queries. Verify with `pg_indexes` if uncertain.

| Index | Columns | Use case |
|---|---|---|
| `hcps_pkey` | `id` | Primary key |
| `hcps_npi_number_unique` | `npi_number` | NPI lookup, NPI-IS-NOT-NULL filtering |
| `hcps_last_name_idx` | `last_name` | Case-sensitive name lookups (rarely useful) |
| `hcps_state_idx` | `state` | Case-sensitive state lookups (rarely useful) |
| `idx_hcps_last_name_lower_new` | `last_name_lower` | **Case-insensitive name lookups — use this** |
| `idx_hcps_state_lower_new` | `state_lower` | **Case-insensitive state lookups — use this** |
| `idx_hcps_openalex_author_id` | `openalex_author_id` (WHERE NOT NULL) | Partial index for OpenAlex lookups; remember it's denormalized — see Identity Primitives section |
| `idx_hcps_openalex_institution_ror_id` | `openalex_institution_ror_id` (WHERE NOT NULL) | ROR institution lookups |
| `idx_hcps_cohort_classification` | `cohort_classification` | Cohort filtering |
| `idx_hcps_cohort_score` | `cohort_score DESC NULLS LAST` | Ranked cohort retrieval |
| `idx_hcps_source` | `source` | Filtering by HCP origin pipeline |
| `hcps_zip_code_idx` | `zip_code` | Geographic filtering |
| `idx_hcps_institution_country` | `institution_country` (WHERE NOT NULL) | Country filtering |
| `idx_hcps_institution_state_code` | `institution_state_code` (WHERE NOT NULL) | State code filtering (parsed from publication affiliation) |
| `idx_hcps_orcid` | `orcid` (WHERE NOT NULL) | ORCID lookups |
| `idx_hcps_verified_dol` | `is_verified_dol` (WHERE TRUE) | Verified DOL surface |
| `idx_hcps_affiliation_classification` | `affiliation_classification` | AMC vs community filtering |
| `idx_hcps_affiliation_calc_null` | `id` (WHERE affiliation_profile_calculated_at IS NULL) | Affiliation enrichment workflow |
| `idx_hcps_id_cohort` | `(id, cohort_classification)` (WHERE NOT NULL) | Composite cohort filtering |
| `hcps_name_institution_unique` | `(first_name, last_name, institution)` | UNIQUE constraint, see Constraints section |

---

## When you find a new convention worth capturing

Append it here. Each entry should have:

1. **What the convention is** — concrete enough to follow
2. **When it was discovered or added** — date matters because the surgery changed everything before May 13
3. **Why it matters** — what breaks if you violate it
4. **Example of right and wrong patterns** — code or SQL where useful

The doc's value compounds with each entry. The first version covered the surgery's identity model and the May 15 case-insensitivity discovery. Future entries will likely cover OpenAlex misattribution handling for v1.5+, the future drop of `hcps_name_institution_unique`, the trial matcher's eventual expansion past NPI-only filtering, and whatever else surfaces.

---

*End of hcps schema notes.*
