# TA Expansion Roadmap (v2)

**Last updated:** 2026-06-30
**Supersedes:** TA_EXPANSION_ROADMAP.md (2026-05-20)
**Status:** Strategic plan for second TA (Atopic Dermatitis), with architectural refactor sequenced first
**Target reader:** Garrett — or anyone joining FieldMark data engineering

---

## Purpose

This document is the real operational plan for expanding FieldMark beyond NSCLC. The 2026-05-20 roadmap captured the manual 8-phase ingestion sequence and known failure modes — much of which is still valid. This v2 incorporates findings from the June 30 codebase audit and the script catalog (May 28) to honestly identify where the architecture is configured vs. coded, and to sequence the work for sustainable multi-TA growth.

---

## Real Headline

The architecture is **mostly TA-parametric where it matters** (database, scoring pipelines, narrative generation), but **explicitly NSCLC-coded in three critical chokepoints**: the substrate engine scripts (PubMed, trials, drug-mapping), the frontend surface (74 files with NSCLC string literals), and the seed data scripts. The 7-10 day expansion estimate in the demo email is **plausible but tight** — and only achievable if the substrate engine is refactored first.

**The honest call:**
- **Do the config refactor first** (~2 days). Pays for itself on the first TA expansion and on every subsequent one.
- **Then ingest AD substrate** using the refactored scripts (~1-2 days of human work + 1-2 days of unattended compute).
- **Then frontend parameterization** (~2-3 days of Cursor work).
- **Total realistic estimate for AD: 8-12 calendar days** of focused work.

---

## Current State (Brutally Honest)

### What works well today

- **Database layer is TA-parametric.** `therapeutic_area_id` and `therapeutic_area_slug` are referenced 200+ times across SQL/migrations. New TA = data, not schema.
- **Scoring pipelines are TA-parametric.** Established (43 TA refs), Community (24), Rising Star (13). Run-per-TA pattern works.
- **Narrative generation is TA-parametric.** `generate_narratives_v2.py` has 86 TA-parameter references. `generate_community_narratives.py` has TA constants but the architecture supports parameterization.
- **Most Python pipelines accept TA as parameter.** Ingestion, aggregation, and scoring scripts thread TA through their work.

### What doesn't work today

- **TA-specific business logic is hardcoded as constants in scripts.** `pubmed_pipeline.py` has `PUBMED_QUERY_NSCLC_US` and `PUBMED_QUERY_HEPATOLOGY_US` as string constants. `trial_ta_mapping.py` has `NSCLC_CONDITION_KEYWORDS`, `NSCLC_DRUG_KEYWORDS_STRICT`, `NSCLC_DRUG_KEYWORDS_GATED` as Python lists. Adding a TA means editing code, not config.
- **74 frontend files have hardcoded `NSCLC` or `nsclc` strings** (246 individual references). Components default to NSCLC instead of reading from the active TA context.
- **Seed scripts have hardcoded HCP rosters.** New TA needs new rosters curated by hand.
- **47+ Python scripts live in repo root** with no organization. Hard to navigate, easy to lose track of which is active vs. superseded.
- **Legacy `hcps` table still queried in 23 places** despite `hcps_v2` being canonical. Real footgun.
- **`hcp_therapeutic_areas` tagging is noisy** — co-authoring once on a TA paper qualifies an HCP as TA-tagged. Real cross-contamination in rankings (Lenz in Hepatology, Aminah Jatoi as NSCLC #1 per the prior roadmap).

---

## What's Still Valid From the May 20 Roadmap

The 8-phase expansion sequence is still the operational reality. The known failure modes are still real. The v1.x safeguards backlog is still the right list of structural improvements. Specifically:

- **Phase sequence:** PubMed → NPPES B → NPI Discovery → NPPES backfill → OpenAlex linkage → Publication attribution → Classification → Scoring (8 phases, dependencies real)
- **Failure modes that still apply:** Common-name aggregation in OpenAlex, PubMed-ingested HCPs missing NPI, UPSERT-without-delete orphan rows, PostgREST 1000-row cap, Supabase BEGIN/COMMIT unreliability
- **v1.x backlog items that are still open:** Extract cohort_score SQL to versioned files, build weekly_refresh.py orchestrator, build ta_expansion_preflight.py, tighten hcp_therapeutic_areas tagging logic, NPI Discovery rate limit and resumability, convert `total_career_pubs = 0` to NULL in NPPES ingest

Read the May 20 roadmap for the operational details. This v2 focuses on the architectural decisions that make those operations sustainable.

---

## The Real Refactor: Config-Driven TA Architecture

### What the refactor produces

A `scripts/config/therapeutic_areas/` directory with one JSON file per TA:

```
scripts/
  config/
    therapeutic_areas/
      nsclc.json
      hepatology.json
      atopic_dermatitis.json
      rare_disease.json
```

Each TA config holds:

```json
{
  "slug": "atopic-dermatitis",
  "display_name": "Atopic Dermatitis",
  "ta_id": "<uuid from therapeutic_areas table>",
  "pubmed": {
    "query": "(\"atopic dermatitis\"[Title/Abstract] OR ...)",
    "min_publications_expected": 1000
  },
  "trials": {
    "condition_keywords": ["atopic dermatitis", "eczema", ...],
    "drug_keywords_strict": ["dupilumab", "abrocitinib", ...],
    "drug_keywords_gated": []
  },
  "drugs": {
    "engagement_attribution": [
      {"name": "dupilumab", "brand": "Dupixent"},
      {"name": "abrocitinib", "brand": "Cibinqo"},
      ...
    ]
  },
  "nppes": {
    "taxonomy_codes": ["207N00000X", "207NS0135X", ...],
    "specialty_labels": ["Dermatology", "Pediatric Dermatology", ...]
  },
  "social": {
    "hashtags": ["#dermtwitter", "#atopicdermatitis", "#eczema", ...],
    "drug_handles": ["#dupixent", ...]
  },
  "narrative_prompt_tuning": {
    "domain_vocabulary": "biologic, JAK inhibitor, IL-13, IL-4, IL-31, ...",
    "scoring_emphasis_notes": "Rising star dynamics driven by recent approvals (resmetirom analog)"
  }
}
```

### What changes in the scripts

Every script that currently reads constants reads from JSON instead:

```python
# Before
from pubmed_queries import PUBMED_QUERY_NSCLC_US
query = PUBMED_QUERY_NSCLC_US

# After
config = load_ta_config(args.ta)  # "nsclc", "atopic-dermatitis", etc.
query = config["pubmed"]["query"]
```

The pattern is consistent:
1. Every script accepts `--ta <slug>` as required argument
2. Every script calls `load_ta_config(slug)` at startup
3. Config validation fails fast if required fields missing
4. Multiple TAs can be processed sequentially: `--ta nsclc,atopic-dermatitis` or in a loop

### Real refactor scope

Scripts that need config-extraction:
- `pubmed_pipeline.py` (queries currently in `pubmed_queries.py` module — extract to JSON)
- `trial_ta_mapping.py` (condition + drug keyword lists)
- `medicare_aggregator.py` (TA-specific drug categories)
- `open_payments_aggregator.py` (TA-specific drug categories)
- `nppes_workstream_b_ingest.py` (taxonomy code lists)
- `bluesky_enrichment.py` / `twitter_enrichment.py` (hashtag lists)
- `generate_community_narratives.py` (TA constants and prompt tuning)
- `generate_narratives_v2.py` (verify already parametric, add config loader)

**Real estimate: 1.5-2 days of focused work** to refactor all of these, plus testing against existing NSCLC and hepatology runs to verify no regressions.

---

## Directory Restructure (Sequenced Into Refactor)

While doing the config refactor, restructure the script directory to make the codebase navigable:

```
scripts/
  ingest/
    pubmed_pipeline.py
    nppes_workstream_b_ingest.py
    trials_pipeline.py
    ingest_nih_grants.py
  enrich/
    career_enrichment_from_clusters.py
    openalex_pipeline.py
    openalex_author_enrichment.py
    targeted_nppes_enrichment.py
    community_nppes_backfill.py
    nppes_api_backfill.py
  aggregate/
    open_payments_aggregator.py
    medicare_aggregator.py
    compute_top_collaborators.py
  classify/
    community_classification.py
    trial_ta_mapping.py
    hcp_industry_classifier.py
    hcp_institution_linker.py
  score/
    established_scoring.py
    community_scoring.py
    scoring_pipeline.py
    rising_star_scoring.py
    network_centrality_scoring.py
    network_momentum_scoring.py
    publication_leadership_scoring.py
    scientific_momentum_scoring.py
    pharma_engagement_scoring.py
    score_ranking.py
    recompute_established_ranks_v3.py
  narrative/
    generate_narratives_v2.py
    generate_community_narratives.py
  social/
    bluesky_enrichment.py
    twitter_enrichment.py
    twitter_capture.py
    social_update.py
    extract_web_signals.py
    scrape_leadership_signals.py
  dedup/
    dedup_detect.py
    dedup_merge.py
    hcp_dedup_merge.py
    hcp_merge_pipeline.py
  seed/
    generate_seed_insights.py
    generate_seed_followups.py
  config/
    therapeutic_areas/
      nsclc.json
      hepatology.json
      atopic_dermatitis.json
    settings.py  # shared config loader
  utilities/
    backfill_belief_claim_titles.py
    backfill_publication_titles.py
    backfill_trial_investigators.py
    inspect_medicare_headers.py
    inspect_op_headers.py
    diagnostic_provider_types.py
  archive/
    # Superseded scripts kept for reference
    claude_layer.py  # superseded by generate_narratives_v2.py
    career_enrichment.py  # superseded by career_enrichment_from_clusters.py
    npi_enrichment.py  # superseded by targeted_nppes_enrichment.py
    dedup_detection.py  # superseded by dedup_detect.py
    scoring_pipeline_v1_3_backup.py  # explicit backup
```

### Worth flagging about restructure

- **Import paths break.** Every script that imports from another root-level script needs path updates. Bounded but real.
- **PowerShell scripts that call scripts need updating.** Few of these exist (`quick_commit.ps1`, `audit_ta.ps1`), check for hardcoded paths.
- **CI / cron jobs need updating** if any reference root-level paths.
- **Archive doesn't mean delete.** Keep superseded scripts in `archive/` for at least one quarter before considering deletion. Real institutional memory.

**Real estimate: ~1 day** to restructure + update imports + verify nothing breaks. Best done as a separate session before the config refactor so the refactor lands in the new structure.

---

## The Real AD Expansion Plan

### Phase 0: Directory restructure + config refactor (3-4 days)

Single sustained effort, not chunked. Produces:
- Restructured `scripts/` directory with archive/
- `scripts/config/therapeutic_areas/nsclc.json` populated from existing constants
- `scripts/config/therapeutic_areas/hepatology.json` populated from existing constants
- `scripts/config/settings.py` with `load_ta_config(slug)` function
- All refactored scripts pass dry-run validation against existing NSCLC data

**Verification:** Re-run a known NSCLC operation (e.g., scoring pipeline) against the refactored code, confirm identical output to pre-refactor.

### Phase 1: AD domain research + config creation (1-2 days)

This is research-heavy work, not engineering. Produces `scripts/config/therapeutic_areas/atopic_dermatitis.json`:

- **PubMed query for AD.** Real terms: atopic dermatitis, eczema, IL-13, IL-4, IL-31, JAK inhibitor, dupilumab, abrocitinib, upadacitinib, baricitinib, lebrikizumab, tralokinumab, rocatinlimab, nemolizumab, ruxolitinib cream, delgocitinib, plus relevant MeSH headings. Aim for query that returns 1,000-3,000 PubMed IDs in a manual test.
- **AD trial keywords.** Condition list: atopic dermatitis, eczema. Drug list: same biologic/JAK names as above plus topical agents.
- **AD drug list for engagement attribution.** Open Payments mapping requires matching to manufacturer names (Sanofi, Regeneron, Pfizer, AbbVie, Eli Lilly, Leo Pharma, Galderma, Incyte, BMS).
- **Dermatology NPPES taxonomy codes.** Per NUCC taxonomy: `207N00000X` (Dermatology), `207NI0002X` (Clinical & Laboratory Dermatological Immunology), `207NP0225X` (Pediatric Dermatology), plus several subspecialties.
- **AD social hashtag set.** `#dermtwitter`, `#atopicdermatitis`, `#eczema`, `#dupixent`, plus drug-specific tags. Research what dermatology HCPs actually use.
- **15 canonical AD HCPs** for seed validation: Emma Guttman-Yassky, Jonathan Silverberg, Eric Simpson, Lawrence Eichenfield, Amy Paller, Andrew Blauvelt, Robert Bissonnette, Diamant Thaci, Mette Deleuran, plus a handful of others. Used to spot-check substrate quality after ingestion.

**Critical worth flagging:** This is the phase where domain validator absence will hurt most. Without a dermatology MSL or KOL to verify the canonical list and drug names are right, errors will propagate through all downstream scoring. Consider recruiting an advisor before Phase 1, even informally.

### Phase 2: Substrate ingestion (1-2 days human + 1-2 days compute)

Run the scripts in the current v2 sequence. NOTE: `pubmed_pipeline.py` persists **publications only** —
HCP identity is resolved OpenAlex-first, AFTER ingestion, by `create_hcps_v2.py`. So OpenAlex enrichment
must run BEFORE HCP creation (PubMed pubs → OpenAlex enrich → build_author_flat → inventory →
create_hcps_v2 → tag → …). See `docs/TA_BUILD_GUIDE.md` for the authoritative chain; prefer the
`reingest_cycle.py` orchestrator, which runs it end-to-end.

```powershell
# publications only (no HCPs):
python scripts/ingest/pubmed_pipeline.py --ta atopic-dermatitis --reset-checkpoint
# OpenAlex-first HCP creation chain:
python scripts/enrich/openalex_pipeline.py --target-version v2 --skip-career-enrichment
python scripts/utilities/run_sql.py --file build_author_flat.sql
python scripts/classify/create_hcps_v2.py --ta atopic-dermatitis --incremental
# ... then tag (ta_tagging_rebuild_v2), Step F, dedup, career, cohort, score
```

**Verification at each phase:** Spot-check 5-10 canonical AD HCPs are appearing in each table at expected ranks. If Guttman-Yassky doesn't appear in the top 20 Established AD HCPs after scoring, something is wrong upstream.

### Phase 3: Aggregation + scoring (1 day mostly wall-clock)

```powershell
python scripts/aggregate/open_payments_aggregator.py --ta atopic-dermatitis
python scripts/aggregate/medicare_aggregator.py --ta atopic-dermatitis
python scripts/score/established_scoring.py --ta atopic-dermatitis --execute
python scripts/score/scoring_pipeline.py --ta atopic-dermatitis --target-version v2
python scripts/score/community_scoring.py --ta atopic-dermatitis --execute
```

Generate narratives for top community HCPs:

```powershell
python scripts/narrative/generate_community_narratives.py --ta atopic-dermatitis --limit 300
python scripts/narrative/generate_narratives_v2.py --ta atopic-dermatitis --cohort all --target-version v2
```

**Real cost estimate:** ~$5-15 in Claude API for narrative generation, depending on AD HCP volume.

### Phase 4: Frontend parameterization (2-3 days)

This is the real engineering work after substrate is ready. Three workstreams:

**4a. TA-aware routing.** Update `App.tsx`, `routeSlugs.ts`, `IndicationFilter.tsx` to drive all child routes from the active TA selection rather than NSCLC defaults.

**4b. Prop drilling cleanup.** Every component that takes `therapeuticArea="NSCLC"` as a hardcoded prop needs to receive it from a TA context or route param. Components include `ScientificNarrativeSection`, `HcpPositionsPage`, `HcpPublicationsPage`, `DetailScreen`, `InstitutionRoute`, `InstitutionCollaborationsPanel`, several Institution components.

**4c. Display string parameterization.** Places where "NSCLC" appears in user-visible strings need TA-driven labels: `DOLListingModal`, `ScoreBreakdownV3`, `IndicationFilter`, `WelcomeBanner`, `TASelectionScreen`, narrative section headers.

**Verification:** Switch between NSCLC and AD in the TA picker, confirm every surface (Home, Institutions, Detail, Social, Telescope, Field Intelligence) renders correctly with TA-specific data.

### Phase 5: Seed mentor data for AD (3-4 hours)

Curate roster of ~15 HCPs for AD, generate seed insights, briefs, follow-ups using the refactored seed scripts. Provision mentor accounts with the new TA's seeded data.

### Phase 6: Demo and validation (1 day)

- Walk through demo script with AD as the active TA
- Verify all surfaces render correctly
- Update demo page (`app.besselanalytics.com/demo`) to mention multi-TA support
- Spot-check substrate quality on canonical AD HCPs
- Update marketing claims to honestly reflect multi-TA capability

---

## Real Calendar Estimate

| Phase | Effort | Wall Clock |
|-------|--------|------------|
| Phase 0: Restructure + config refactor | 3-4 focused days | 4-5 days (with buffer) |
| Phase 1: AD domain research | 1-2 focused days | 2-3 days |
| Phase 2: Substrate ingestion | 1-2 days human work | 3-4 days (compute time) |
| Phase 3: Aggregation + scoring | 1 day | 2 days (compute time) |
| Phase 4: Frontend parameterization | 2-3 focused days | 3-4 days |
| Phase 5: Seed mentor data | 3-4 hours | 1 day |
| Phase 6: Demo + validation | 1 day | 1-2 days |
| **Total** | **~10-12 focused days** | **~16-21 calendar days** |

The 7-10 day demo claim is **achievable for Phases 1-5 collectively** only if Phase 0 is treated as separate infrastructure work, not part of the TA-expansion estimate.

**Honest framing for the demo claim:** "Once the platform is set up for multi-TA expansion (one-time infrastructure investment), each new TA takes 7-10 days." Real and defensible.

---

## Known Risks for AD Specifically

1. **Domain validation gap.** Without a dermatology medical affairs validator, substrate errors will propagate. Real mitigation: recruit an AD-specialist advisor before Phase 1.

2. **Dermatology MSL audience is smaller than oncology.** Commercial TAM per indication is real but smaller. Worth honest expectations on customer pipeline volume from AD vs. NSCLC.

3. **First TA expansion will reveal hidden NSCLC assumptions** the audit didn't catch. Plan for a shakeout day where unexpected issues surface and get fixed.

4. **Score normalization thresholds may be NSCLC-calibrated.** Rising Star momentum thresholds, citation distributions, network density expectations could all be implicitly tuned to NSCLC's data shape. Spot-check at every phase.

5. **Prompt vocabulary tuning.** Narrative generation prompts use NSCLC vocabulary throughout. May need TA-specific prompt tuning that the config refactor should support.

---

## Sequencing Decision

**Recommendation: Do Phase 0 (restructure + refactor) before any AD work.**

Reasons:
- Pays for itself on the first AD expansion AND every subsequent TA
- The audit work + script catalog already specified the work — not designing cold
- AD expansion on current code locks in the tech debt for any future TA
- Restructure surfaces dead scripts and clarifies what's actually active
- Demo email's "7-10 days per TA" claim is only honest if the infrastructure work is done first

**Alternative: Ship AD on current code, refactor afterward.**

Defensible only if there's external time pressure (paying customer waiting, demo deadline) that doesn't currently exist. Otherwise the case for refactor-first is strong.

---

## What to Do Next

1. **Tonight:** Step away. Real cognitive load already this week.
2. **Tomorrow or next deliberate session:** Review this roadmap with fresh eyes. Confirm or push back on the refactor-first sequencing.
3. **First execution session:** Begin Phase 0 directory restructure. Bounded, mechanical, low-cognitive-load work that produces immediate clarity.
4. **Second execution session:** Begin config refactor of `pubmed_pipeline.py` as the prototype. If it lands clean, extend pattern to remaining scripts.
5. **In parallel:** AD domain research can begin anytime — gathering MeSH terms, drug lists, taxonomy codes is research work that doesn't depend on engineering progress.

The codebase is workable. The architecture is mostly right. The work ahead is bounded. The honest path to a sustainable multi-TA platform is real.

Build the foundation right. The TAs will come.
