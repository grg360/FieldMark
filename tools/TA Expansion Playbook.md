# TA Expansion Playbook

## How to use this playbook

1. Run `python tools/ta_audit.py` to generate `TA_AUDIT_REPORT.md`.
2. Read the report — it tells you exactly where TA-specific assumptions live.
3. Use the phased approach below to refactor incrementally.
4. After each phase, re-run the audit to track progress.

## The 3-phase refactor

### Phase 1: Quick wins (2-4 hours)
Parameterize display strings. Replace hardcoded "NSCLC Landscape" with 
`${currentTA.displayName} Landscape`. Single TA name lookup function.

### Phase 2: Config layer (8-12 hours)
Build the TA Definition layer:
- `tas/_template.yaml` — schema
- `tas/nsclc.yaml` — current state extracted into config
- Refactor Category C, D, E hits to read from config
- Replace inline TA UUIDs with `getTAConfig(slug).uuid`

### Phase 3: Pipeline parameterization (8-12 hours)
- Every pipeline script accepts `--ta-slug` argument
- Pipeline reads from `tas/{slug}.yaml` for TA-specific values
- Build `run_ta_setup.py` orchestrator that runs all pipelines for a TA

## Adding a new TA (post-refactor workflow)

1. Copy `tas/_template.yaml` → `tas/{new_slug}.yaml`
2. Fill in:
   - TA slug + display name
   - Indication list
   - PubMed query construction
   - OpenAlex concept IDs
   - 5 validation HCPs (well-known names in the field)
3. Insert TA row into `therapeutic_areas` table
4. Run `python tools/run_ta_setup.py --ta {new_slug}`
5. Wait for pipelines (estimated runtime: ~6-12 hours for typical TA)
6. Validate top 20 HCPs against expectations
7. Ship

Target: from "MSL says 'I work in Breast'" to "Breast is live" in **5-7 days**.