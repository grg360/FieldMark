# FieldMark Publication Data Architecture

**Version:** v1.0  
**Author:** Garrett (with Claude as technical thought partner)  
**Date drafted:** May 7, 2026  
**Status:** Architecture approved. Migration plan ready for execution starting May 8. Composite scoring v1 BLOCKED until publication data foundation lands.

---

## Purpose

This document defines how FieldMark ingests, stores, and links publication data to support both the Community HCP composite scoring and Academic Rising Star detection. It captures discoveries made on May 7 about structural limitations in the current publication data layer, the architectural changes required to address them, and the migration plan to execute starting May 8.

This document is foundational. The composite scoring methodology document (May 7 morning) defines what we want to compute; this document defines whether we have the data to compute it. Until the publication data architecture described here is in place, the composite scoring v1 cannot ship in a defensible form.

## Strategic positioning

FieldMark needs publication data to support TWO distinct product use cases that mirror the two-track scoring architecture:

**Community HCP track — deep historical bibliography.** When an MSL evaluates a community oncologist for territory engagement, they expect to see the HCP's full track record. Decades of paper authorship, conference activity, and clinical research demonstrate depth and credibility. A profile showing "5 publications" for a senior community oncologist is not just unhelpful — it's actively credibility-destroying for the platform.

**Academic Rising Star track — recent velocity detection.** A rising star is identified by the acceleration of recent activity, not by cumulative output. Looking at Loomba's 200+ historical publications doesn't reveal that he's rising; looking at his recent 2-year acceleration vs. his 5-year baseline does. This requires both recent and historical data, but the analysis weights recent activity heavily.

Both tracks share the same underlying data store. The difference is how the data is QUERIED and weighted, not how it's stored. A unified deep-bibliography ingestion strategy serves both tracks: community HCPs get the bibliographic depth they need; rising star candidates get both the historical baseline AND the recent activity needed for trajectory analysis.

This document describes a single ingestion architecture that serves both use cases.

## Discoveries that drove this document

The May 7 work session revealed three structural issues in the current publication data architecture:

### Issue 1: Cohort coverage gap

NPPES Workstream B added approximately 21,204 new community HCPs to the cohort during the week of May 5-7. These HCPs have NPIs, NPPES individual data, Open Payments aggregations, and Medicare aggregations. They have **zero publications linked.**

Diagnostic results:
- 30,093 HCPs with NPIs in cohort
- 8,891 HCPs with at least one publication linked
- 21,202 HCPs with zero publications linked
- HCPs added "this week" (since May 5): 21,204 total, 2 with publications (0.009%)
- HCPs added before May 5: 8,889 total, 100% with publications

The publication ingestion pipelines have not been triggered for the new community HCP cohort. The platform's Track #1 priority cohort has zero publication signal.

### Issue 2: One-to-many relational model where many-to-many is required

Each publication in the `publications` table is linked to exactly ONE HCP via `hcp_id` foreign key. But publications have multiple authors, and many of those authors are in our HCP cohort.

Diagnostic results:
- Publications mentioning "Loomba" anywhere in their authorships JSON: 1,037 (going back to 2014)
- Publications linked to Loomba's specific hcp_id: 77

Loomba is on 1,037 papers as one of multiple authors. He's correctly the linked HCP for 77 of them. The other 960 papers are linked to OTHER HCPs (probably the first or last author per paper) and Loomba's contribution is invisible despite being captured in the `authorships` JSON column.

This pattern repeats for every author in our cohort. Co-authored papers are systematically losing 60-90% of their HCP linkage. The relational model cannot represent the reality that a publication has many authors and an author has many publications.

### Issue 3: Recent-only ingestion bias

The publication ingestion pipelines (`pubmed_pipeline.py`, `openalex_pipeline.py`) have time windows configured into their default behavior:

- `PUBMED_DAYS_BACK` defaults to 1460 days (4 years)
- The `reldate` parameter is sent to PubMed E-utilities, filtering to recent publications only
- The "second pass" enrichment for HCPs with low publication counts has a hardcoded `[:500]` slice that limits each run to 500 HCPs

These were intentional choices when the platform's primary use case was rising star detection (where recent velocity matters more than historical depth). But they make community HCP bibliographies thin and the cohort coverage uneven.

Distribution of publication years in current data (sample of 190,713 publications):
- Pre-2020: 13,580 (7%)
- 2020-2021: 4,299 (2%)
- 2022-2023: 17,585 (9%)
- 2024-2026: 155,189 (81%)

81% of all publications in our database are from the last 2.5 years. Even where individual authors have decades of bibliography in PubMed, our ingestion has captured only the recent slice.

### Composite issue: The system has accumulated complexity

Multiple overlapping pipelines have been built over time, each addressing a specific need:

- `pubmed_pipeline.py` — initial PubMed ingestion via author search
- `openalex_pipeline.py` — DOI enrichment + total_career_pubs counting
- `openalex_publications.py` — citation_count backfill
- `scholar_overnight.py` — Google Scholar integration
- `scholar_enrichment.py` — Scholar-based enrichment

Plus checkpoint files (`openalex_checkpoint.json`, `openalex_publications_checkpoint.json`, `scholar_checkpoint.json`) suggesting iterative runs across multiple sessions.

Each pipeline solved a specific problem. Together they create a system where it's unclear which is canonical, which to run, and what state the data is in. The cohort coverage gap is partially a symptom of this — multiple pipelines means it's unclear which one should have run for new HCPs and didn't.

## Architectural decisions

### Decision 1: OpenAlex as primary source, PubMed as secondary

OpenAlex becomes the canonical publication source going forward. Reasons:

- OpenAlex assigns stable, unique author IDs (e.g., Loomba is `A5052059601` everywhere — every publication, every API query). This solves the author disambiguation problem that plagues PubMed-only approaches.
- OpenAlex includes ORCID identifiers when available, providing additional disambiguation.
- OpenAlex provides full author bibliographies via author ID queries: `GET /works?filter=author.id:A5052059601` returns ALL of Loomba's publications.
- OpenAlex is free with generous rate limits (10 requests/second polite pool, 100K/day).
- OpenAlex covers PubMed-indexed journals plus a broader scholarly literature (preprints, books, theses) that may surface DOL signals beyond traditional medical journals.

PubMed remains a secondary source for verification and metadata enrichment. PubMed IDs are widely cited in clinical contexts and worth retaining for cross-reference.

Google Scholar integration (`scholar_overnight.py`) is deprioritized. Scholar's terms of service prohibit automated scraping at scale, and OpenAlex provides equivalent or better coverage for academic publications.

### Decision 2: Author-ID-based ingestion, not author-name-based

The current ingestion uses name-based author search (`pubmed_esearch` with author name terms). This has well-known accuracy problems with common names ("J Smith" matches dozens of authors) and name variants (Loomba published as "R Loomba" early career, "Rohit Loomba" later).

Going forward, ingestion uses OpenAlex author IDs as the primary linkage. The workflow:

1. For each HCP, resolve their OpenAlex author ID once (via name + institution search, ORCID lookup, or manual verification for ambiguous cases)
2. Store the OpenAlex author ID on the HCP record
3. All future publication queries for that HCP use the author ID, not the name

This solves the author disambiguation problem permanently.

### Decision 3: Many-to-many relational model via join table

A new `publication_authors` table represents the many-to-many relationship:

```
publication_authors (
  id UUID PRIMARY KEY,
  publication_id UUID NOT NULL REFERENCES publications(id),
  hcp_id UUID NOT NULL REFERENCES hcps(id),
  author_position TEXT,  -- 'first', 'middle', 'last'
  is_corresponding BOOLEAN,
  openalex_author_id TEXT,  -- the resolved OpenAlex ID for this author on this paper
  affiliation_at_publication TEXT,  -- captured at publication time, may differ from current
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(publication_id, hcp_id)
)
```

The existing `publications.hcp_id` column stays for backward compatibility during migration but becomes nullable and deprecated. New ingestion writes to both `publications.hcp_id` (the "primary" HCP, typically the corresponding author or first matching cohort author) AND `publication_authors` (every cohort HCP on the paper). Long-term, queries shift to using `publication_authors` exclusively.

### Decision 4: Unified deep-bibliography ingestion

For each HCP in the cohort, ingest their full available publication history. No time-window filter. No "deep pull for community, shallow pull for academic" branching.

Rationale (this matches the May 7 conversation):
- Single ingestion path is simpler to maintain
- Marginal cost of deep-pull is bounded — even prolific authors have <1,000 publications, well within OpenAlex API budget
- HCPs change tracks over time; today's rising star becomes tomorrow's established figure
- Having full data means scoring methodology can evolve without re-ingesting

The Community vs Academic Rising Star analysis happens at QUERY time (different scoring weights, different time windows for velocity calculation), not at INGESTION time.

### Decision 5: Schema additions to `hcps` for author identifiers

Two new columns on `hcps`:

```sql
ALTER TABLE hcps ADD COLUMN openalex_author_id TEXT;
ALTER TABLE hcps ADD COLUMN orcid TEXT;
ALTER TABLE hcps ADD COLUMN openalex_resolved_at TIMESTAMPTZ;
ALTER TABLE hcps ADD COLUMN openalex_resolution_method TEXT;
  -- values: 'name_institution_match', 'orcid_lookup', 'manual_review', 'unresolved'
ALTER TABLE hcps ADD COLUMN openalex_resolution_confidence TEXT;
  -- values: 'high', 'medium', 'low', 'ambiguous'
```

These support the author ID resolution workflow. Confidence tracking lets us treat low-confidence matches differently in downstream scoring (don't trust their bibliography for high-stakes decisions until manually verified).

### Decision 6: Citation history granularity

The existing `publications.citation_counts_by_year` JSONB column already supports year-by-year citation accrual. This is sufficient for citation trajectory analysis (Academic Rising Star track). No schema change needed.

### Decision 7: Affiliation-at-publication-time tracking

Author affiliation changes over time. Loomba's papers from his Mass General fellowship era show MGH affiliation; his current papers show UCSD. Both are correct — for the time period of each publication.

The new `publication_authors.affiliation_at_publication` field captures the affiliation as it appears in the OpenAlex authorships at the time of the paper. This enables future analyses like "trace this author's institutional trajectory" or "identify researchers who recently moved between institutions" (a potential rising-star indicator — institutional moves often correlate with career inflection points).

## Migration plan

Five phases. Each phase is independently runnable and validated before proceeding to the next. Each phase produces real value even if subsequent phases are deferred.

### Phase 1: Schema migration and join table backfill

**Scope:** Create `publication_authors` table. Add author identifier columns to `hcps`. Backfill `publication_authors` from existing `publications.authorships` JSONB.

**What this accomplishes:**
- Parses the 190,713 existing publications' authorships JSON
- For each author on each paper, attempts to match to an HCP in our cohort via name + OpenAlex author ID (when present in the JSON)
- Populates `publication_authors` join table with matched author-paper pairs
- Loomba goes from 77 linked publications to ~1,037 (the publications already in our database that mention him as a co-author)

**Why this is Phase 1:** It uses data already in our database. No external API calls. Bounded compute time. Produces immediate value for HCPs whose co-authored papers were already ingested but linkage was incomplete.

**Estimated effort:** 4-6 hours of focused work including schema migration, backfill script, validation against canonicals.

**Validation:**
- Loomba: should grow from 77 to approximately 1,037 publications via the join table
- Chalasani: similar substantial growth
- Cohort-level: total publication-author pairs should grow significantly from current 190,713 (one-to-one) to several hundred thousand (many-to-many)

**What this does NOT accomplish:** Does not resolve the cohort coverage gap. The 21,204 HCPs without any publications still have nothing — Phase 1 only enriches existing data.

### Phase 2: OpenAlex author ID resolution for cohort

**Scope:** For each HCP in the cohort, resolve their OpenAlex author ID. Store on `hcps` table.

**Methodology:**
- For HCPs with publications already linked: extract the OpenAlex author ID from authorships JSON where the matched author's name corresponds to the HCP's name. High confidence when name match is exact and institution matches.
- For HCPs without publications: query OpenAlex author search API by name + practice institution + specialty. Apply confidence threshold (high: name + institution exact match; medium: name match with institution partial match; low: name match only with no institution context; ambiguous: multiple equally-good candidates).
- For low-confidence and ambiguous cases: store the best candidate(s) but mark for manual review. Don't auto-trust.

**API budget:**
- 30,093 HCPs × ~3 API calls per resolution (search + verification + alternates) = ~90,000 OpenAlex API calls
- At 10 req/sec (polite pool): ~3 hours of API time
- At 5 req/sec (conservative): ~6 hours of API time

**Confidence distribution expected:**
- High confidence: probably 50-70% of cohort (academics with clear name + institution match)
- Medium confidence: 15-25% (ambiguous institution but unique name)
- Low confidence: 10-15% (common names like J. Smith, J. Garcia)
- Ambiguous: 5-10% (multiple equally-likely candidates)
- Unresolved: 2-5% (no OpenAlex presence — community HCPs who haven't published)

**Validation:**
- Canonical HCPs (Loomba, Chalasani, Garassino) should resolve at high confidence
- Spot check 50 random HCPs for resolution accuracy
- Distribution of confidence levels matches expected ranges above

**Estimated effort:** 1-2 days including the script build, API run, and confidence-distribution validation.

### Phase 3: Full bibliography ingestion via OpenAlex author IDs

**Scope:** For each HCP with a resolved OpenAlex author ID (from Phase 2), query OpenAlex for all their publications. Ingest into `publications` table. Link via `publication_authors`.

**Methodology:**
- For each HCP with `openalex_resolved_at IS NOT NULL` and confidence != 'low/ambiguous': fetch all works via OpenAlex API
- De-duplicate against existing `publications` by DOI or pubmed_id
- Insert new publications with full metadata (authorships JSONB, citation_counts_by_year, openalex_concepts, etc.)
- Populate `publication_authors` for the new publications, linking all cohort authors

**API budget:**
- ~25,000 HCPs (excluding low-confidence and unresolved) × paginated works fetch
- Average ~50-200 works per HCP for those with publications
- Estimated 50,000-100,000 API calls
- Wall-clock at 10 req/sec: 2-3 hours
- Wall-clock at 5 req/sec: 4-6 hours

**Storage growth:**
- Estimated 500,000-1,500,000 new `publications` rows (after dedup)
- Estimated 1-3 million `publication_authors` rows
- Database size growth: probably 2-5 GB

**Validation:**
- Loomba's bibliography should reach his actual publication count (probably 600-1,000+ papers)
- Chalasani's similarly
- Recently-added community HCPs that previously had zero publications should now have meaningful counts where OpenAlex has them
- Distribution check: pre-2020 publication count should grow substantially

**Estimated effort:** 1-2 days including the script build, API run, validation, and database performance tuning post-ingestion (indexes, vacuum).

### Phase 4: Pipeline consolidation

**Scope:** Deprecate the existing scattered pipelines. Establish one canonical ingestion script for ongoing publication updates.

**Methodology:**
- Mark `pubmed_pipeline.py`, `openalex_pipeline.py`, `openalex_publications.py`, `scholar_overnight.py`, `scholar_enrichment.py` as legacy
- Build a single new pipeline that handles ongoing publication ingestion using the OpenAlex-author-ID-based approach from Phase 3
- New pipeline runs on a schedule (probably weekly) and adds publications for known authors plus newly-resolved authors
- Existing scripts remain in the repo for reference but are excluded from the cron/scheduled task layer

**Why deferred to Phase 4:** Building the consolidated pipeline only makes sense after Phase 3 proves the architectural approach works at full cohort scale. We don't want to build the consolidation pipeline against a broken model.

**Estimated effort:** 2-3 days including script build, scheduled job setup, monitoring/alerting basics.

### Phase 5: Citation enrichment and trajectory analysis

**Scope:** Enrich existing publications with full citation history (year-by-year counts) for trajectory analysis. This supports the Academic Rising Star track's velocity calculation.

**Methodology:**
- For each publication, fetch `citation_counts_by_year` from OpenAlex
- Store in existing JSONB column
- Compute trajectory metrics: 5-year rolling citation average, recent acceleration, citation velocity rank within TA

**Estimated effort:** 1-2 days. Phase 5 is largely data plumbing — the schema already supports it; we just need to populate it consistently.

## Migration validation gates

Each phase must pass these validation gates before proceeding to the next:

**Phase 1 → Phase 2 gate:**
- Loomba's `publication_authors` count is 1,000+
- All canonical HCPs (Loomba, Chalasani, Garassino) appear correctly linked
- No orphaned `publication_authors` rows (every row references valid publication and HCP)
- `publications.hcp_id` and `publication_authors` are consistent for backward compatibility

**Phase 2 → Phase 3 gate:**
- Canonical HCPs resolved at high confidence with correct OpenAlex IDs
- Confidence distribution matches expected (50-70% high, 15-25% medium, etc.)
- Spot check of 50 random HCPs reveals <5% incorrect resolutions
- Manual review queue for ambiguous cases is manageable in size (<2,000 HCPs)

**Phase 3 → Phase 4 gate:**
- Loomba's bibliography reaches plausible historical count
- Recently-added community HCPs have meaningful publication counts (where they exist in OpenAlex)
- Pre-2020 publication count in database grows substantially
- Database performance is acceptable post-ingestion (queries don't time out)

**Phase 4 → Phase 5 gate:**
- New consolidated pipeline runs end-to-end on schedule
- Output matches what manual Phase 3 produced
- Old pipelines are clearly marked legacy and not running on schedule
- One-week observation period passes without issues

## Risks and mitigations

**Risk: OpenAlex author ID resolution accuracy.**

For HCPs with common names (J. Smith, M. Garcia, M. Lee), OpenAlex search may produce ambiguous candidates. We could resolve to the wrong author ID, which would then ingest someone else's bibliography under our HCP's record.

*Mitigation:* Confidence tracking on resolution. Low/ambiguous matches get manual review queue. Don't trust low-confidence bibliographies for downstream scoring without verification. Provide a UI for MSL contributors to verify their own profile when they claim an HCP.

**Risk: HCPs with no OpenAlex presence.**

Community HCPs who don't publish (a real category — many community oncologists never author papers) will be unresolvable. They'll have empty bibliographies forever.

*Mitigation:* Acknowledge this is correct behavior, not a bug. Mark `openalex_resolution_method = 'unresolved_no_publications'` so downstream scoring knows the difference between "we couldn't resolve them" and "they have no publications." Community composite scoring still works for them via Medicare and Open Payments signals (which have better coverage).

**Risk: Database storage and query performance.**

Adding 1-3 million `publication_authors` rows plus new publications could degrade query performance.

*Mitigation:* Index `publication_authors` on (hcp_id), (publication_id), and (hcp_id, publication_id). Run VACUUM ANALYZE after Phase 3 ingestion. Monitor query performance during Phase 3. Consider table partitioning if performance issues emerge (unlikely at this scale but worth keeping in mind).

**Risk: API rate limiting at scale.**

OpenAlex polite pool is 10 req/sec. Phase 2 + Phase 3 combined is ~150K-200K API calls. If we hit rate limits or temporary outages, the runs could stretch beyond planned wall-clock time.

*Mitigation:* Use OpenAlex polite pool (mailto header). Build retry logic with exponential backoff. Make scripts resumable (checkpoint files). Run Phase 2 and Phase 3 separately, not concurrently.

**Risk: Scope creep during implementation.**

The cleanest version of this architecture (full author ID resolution, full bibliography for everyone, consolidated pipeline, citation trajectory analysis) is a 5-7 day workstream. Easy to spend more time iterating on edge cases than getting v1 done.

*Mitigation:* Each phase has clear validation gates and time estimates. Resist adding features mid-phase. Document deferrals in this document; revisit in a v1.5 update.

## What's blocked until this completes

The composite scoring v1 cannot ship in a defensible form until publication data is foundationally fixed. Specifically:

- **Career stage signal** — depends on publication first-year as fallback when NPI enumeration date is unreliable. Currently Loomba's first publication shows as 2022 in our data; correct value is probably 2002 or earlier. Career stage cannot be derived correctly without Phase 1+2+3 complete.

- **Publication composite (5% weight in community track)** — based on `hcp_scores` which uses publication data. Currently scored against a 3-year recent slice; needs full bibliography for fair comparison across HCPs.

- **Academic Rising Star track entirely** — depends on publication velocity (recent vs cumulative ratio) and citation trajectory. Both require historical baseline that doesn't exist in current data.

- **DOL identification** — academic DOLs are partly identified through bibliography analysis. Without historical publication data, DOL identification is unreliable.

- **HCP profile pages** — when a profile says "5 publications" for a senior community oncologist, the platform's credibility is damaged. This is a demo-blocking issue that publication data fixes.

## What's NOT blocked

Several workstreams are independent of publication data and can proceed in parallel:

- NPPES enrichment (already complete as of May 7)
- Open Payments aggregations (already complete)
- Medicare aggregations (already complete)
- HCPCS code curation iterations (in v1.5 backlog)
- Frontend HCP profile page work (can build the UI structure; populate publication section once Phase 3 lands)
- Drug seed list expansion (in v1.5 backlog)
- Documentation consolidation (independent)
- Demo flow design (can begin with placeholder publication data, refresh once foundation is fixed)

## Document maintenance

This document is the canonical source for FieldMark's publication data architecture. Changes to the architecture (new sources, schema changes, ingestion strategy shifts) require:

1. Append a Change Log entry
2. Justification for the change
3. Validation results before/after
4. Date and rationale

Document lives at `Latest Documentation/publication_data_architecture.md`. Version controlled via git.

## Implementation start

Migration begins May 8, 2026. Phase 1 (schema migration + authorships backfill) is the first day's work. Phases 2-5 follow in sequence, each gated by its validation criteria. Estimated total: 5-7 working days to v1 architecture complete and composite scoring v1 unblocked.
