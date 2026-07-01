# RESTRUCTURE_SCRIPTS.ps1
# ----------------------------------------------------------------------------
# Consolidate Python data pipeline scripts into scripts/{ingest,enrich,...}.
#
# In scope:
#   - Move active .py files from repo root into scripts/ subdirectories
#   - Move orphans from backend/scripts/, pipelines/, tools/, scripts/ (root
#     scripts/ folder) into the new subdirectory scheme
#   - Move tools/"TA Expansion Playbook.md" to Latest Documentation/
#
# Out of scope (deferred):
#   - SQL consolidation (Supabase CLI risk — supabase/migrations/ is managed)
#   - 4 workflow .ps1 tools stay at root: audit_ta, quick_commit, backup_supabase, find_block
#   - 3 loose .sql files at root stay put
#   - backend/scripts/sql/ contents stay put
#
# USAGE (run from C:\Users\garre\Desktop\FieldMark):
#   .\RESTRUCTURE_SCRIPTS.ps1 -DryRun    # print every move, no changes
#   .\RESTRUCTURE_SCRIPTS.ps1            # execute
#
# ROLLBACK:
#   git revert HEAD
# ----------------------------------------------------------------------------

param(
    [switch]$DryRun
)

$ErrorActionPreference = "Stop"
$moved = 0
$skipped = 0
$warnings = @()

function Move-File {
    param([string]$Source, [string]$TargetDir)
    $target = Join-Path $TargetDir (Split-Path $Source -Leaf)

    if (-not (Test-Path $Source)) {
        $script:warnings += "MISSING: $Source (expected -> $TargetDir)"
        $script:skipped++
        return
    }

    if ($DryRun) {
        Write-Host "  [DRY] git mv `"$Source`" `"$target`""
    } else {
        git mv $Source $target
        if ($LASTEXITCODE -ne 0) {
            $script:warnings += "FAILED: git mv $Source $target"
            $script:skipped++
            return
        }
    }
    $script:moved++
}

function Ensure-Dir {
    param([string]$Path)
    if (-not (Test-Path $Path)) {
        if ($DryRun) {
            Write-Host "  [DRY] mkdir $Path"
        } else {
            New-Item -ItemType Directory -Path $Path -Force | Out-Null
        }
    }
}

# ============================================================================
# STEP 1: Create scripts/ subdirectory tree
# ============================================================================
Write-Host "`n=== STEP 1: Create scripts/ tree ===" -ForegroundColor Cyan
$dirs = @(
    "scripts/ingest",
    "scripts/enrich",
    "scripts/aggregate",
    "scripts/classify",
    "scripts/score",
    "scripts/narrative",
    "scripts/social",
    "scripts/dedup",
    "scripts/seed",
    "scripts/utilities"
)
foreach ($d in $dirs) { Ensure-Dir $d }

# ============================================================================
# STEP 2: scripts/ingest/  (raw data pulls)
# ============================================================================
Write-Host "`n=== STEP 2: scripts/ingest/ ===" -ForegroundColor Cyan
$ingest = @(
    "pubmed_pipeline.py",
    "ingest_publications.py",
    "trials_pipeline.py",
    "nppes_workstream_b_ingest.py",
    "nppes_workstream_b_dryrun.py",
    "ingest_nih_grants.py",
    "open_payments_filter.py",
    "medicare_filter.py",
    "nppes_filter.py",
    "nppes_organizations_filter.py"
)
foreach ($f in $ingest) { Move-File $f "scripts/ingest" }

# ============================================================================
# STEP 3: scripts/enrich/  (add data via APIs)
# ============================================================================
Write-Host "`n=== STEP 3: scripts/enrich/ ===" -ForegroundColor Cyan
$enrich = @(
    "openalex_pipeline.py",
    "openalex_author_enrichment.py",
    "career_enrichment_from_clusters.py",
    "targeted_nppes_enrichment.py",
    "nppes_api_backfill.py",
    "community_nppes_backfill.py",
    "nppes_matcher.py",
    "match_nih_investigators.py",
    "backfill_trial_investigators.py",
    "institution_geo_backfill_openalex.py",
    "institution_geo_backfill_ror.py",
    "map_nppes_to_ror.py",
    "enrich_ror_to_country.py",
    "scholar_enrichment.py",
    "scholar_overnight.py"
)
foreach ($f in $enrich) { Move-File $f "scripts/enrich" }

# ============================================================================
# STEP 4: scripts/aggregate/  (HCP-level rollups)
# ============================================================================
Write-Host "`n=== STEP 4: scripts/aggregate/ ===" -ForegroundColor Cyan
$aggregate = @(
    "open_payments_aggregator.py",
    "medicare_aggregator.py",
    "compute_top_collaborators.py"
)
foreach ($f in $aggregate) { Move-File $f "scripts/aggregate" }

# ============================================================================
# STEP 5: scripts/classify/  (label/tag entities)
# ============================================================================
Write-Host "`n=== STEP 5: scripts/classify/ ===" -ForegroundColor Cyan
$classify = @(
    "community_classification.py",
    "trial_ta_mapping.py",
    "trial_investigator_matcher.py",
    "hcp_institution_linker.py",
    "hcp_industry_classifier.py",
    "ta_tagging_rebuild_v2.py",
    "extract_research_themes.py"
)
foreach ($f in $classify) { Move-File $f "scripts/classify" }

# ============================================================================
# STEP 6: scripts/score/  (scoring + ranking)
# ============================================================================
Write-Host "`n=== STEP 6: scripts/score/ ===" -ForegroundColor Cyan
$score = @(
    "scoring_pipeline.py",
    "established_scoring.py",
    "community_scoring.py",
    "rising_star_scoring.py",
    "network_momentum_scoring.py",
    "scientific_momentum_scoring.py",
    "network_centrality_scoring.py",
    "pharma_engagement_scoring.py",
    "publication_leadership_scoring.py",
    "score_ranking.py",
    "recompute_established_ranks_v3.py",
    "rerun_ranks.py"
)
foreach ($f in $score) { Move-File $f "scripts/score" }

# ============================================================================
# STEP 7: scripts/narrative/  (Claude API text generation + narrative QA)
# spot_check_narratives.py placed here (not utilities/) to preserve its
# `from generate_narratives_v2 import` at same-directory scope.
# ============================================================================
Write-Host "`n=== STEP 7: scripts/narrative/ ===" -ForegroundColor Cyan
$narrative = @(
    "generate_narratives_v2.py",
    "generate_community_narratives.py",
    "spot_check_narratives.py"
)
foreach ($f in $narrative) { Move-File $f "scripts/narrative" }

# ============================================================================
# STEP 8: scripts/social/  (social + web presence, excluding Scholar which
# is publication metrics and lives in scripts/enrich/)
# ============================================================================
Write-Host "`n=== STEP 8: scripts/social/ ===" -ForegroundColor Cyan
$social = @(
    "twitter_capture.py",
    "twitter_enrichment.py",
    "bluesky_capture.py",
    "bluesky_enrichment.py",
    "dol_matching.py",
    "social_update.py",
    "extract_web_signals.py",
    "extract_external_links.py",
    "scrape_leadership_signals.py"
)
foreach ($f in $social) { Move-File $f "scripts/social" }

# ============================================================================
# STEP 9: scripts/dedup/  (duplicate detection + merge)
# ============================================================================
Write-Host "`n=== STEP 9: scripts/dedup/ ===" -ForegroundColor Cyan
$dedup = @(
    "dedup_detect.py",
    "dedup_merge.py"
)
foreach ($f in $dedup) { Move-File $f "scripts/dedup" }

# ============================================================================
# STEP 10: scripts/seed/  (demo/mentor data)
# ============================================================================
Write-Host "`n=== STEP 10: scripts/seed/ ===" -ForegroundColor Cyan
$seed = @(
    "generate_seed_insights.py",
    "generate_seed_followups.py"
)
foreach ($f in $seed) { Move-File $f "scripts/seed" }

# ============================================================================
# STEP 11: scripts/utilities/  (audits, diagnostics, orchestration)
# spot_check_narratives.py NOT here — see STEP 7 note.
# ============================================================================
Write-Host "`n=== STEP 11: scripts/utilities/ ===" -ForegroundColor Cyan
$utilities = @(
    "export_telescope_data.py",
    "backfill_publication_titles.py",
    "backfill_belief_claim_titles.py",
    "npi_gap_audit.py",
    "nppes_diagnostic.py",
    "diagnostic_provider_types.py",
    "parquet_sanity_check.py",
    "quick_csv_tail_check.py",
    "inspect_medicare_headers.py",
    "inspect_op_headers.py",
    "nppes_org_dryrun.py",
    "institution_openalex_validation.py",
    "institution_nppes_validation.py",
    "institution_ror_validation.py",
    "validate_leadership_scraping.py",
    "social_quality_audit.py",
    "dedup_dryrun_spotcheck.py",
    "verify_dedup_state.py",
    "categorize_dedup_failures.py"
)
foreach ($f in $utilities) { Move-File $f "scripts/utilities" }

# ============================================================================
# STEP 12: Relocate orphans from other partially-populated directories
# ============================================================================
Write-Host "`n=== STEP 12: Relocate orphans ===" -ForegroundColor Cyan

# backend/scripts/bucket_themes.py -> scripts/classify/
Move-File "backend/scripts/bucket_themes.py" "scripts/classify"

# pipelines/take_weekly_snapshot.py -> scripts/utilities/
Move-File "pipelines/take_weekly_snapshot.py" "scripts/utilities"

# tools/ta_audit.py -> scripts/utilities/
Move-File "tools/ta_audit.py" "scripts/utilities"

# scripts/extract_scientific_positions.py -> scripts/narrative/
Move-File "scripts/extract_scientific_positions.py" "scripts/narrative"

# scripts/generate_scientific_position_synthesis.py -> scripts/narrative/
Move-File "scripts/generate_scientific_position_synthesis.py" "scripts/narrative"

# tools/TA Expansion Playbook.md -> Latest Documentation/
Move-File "tools/TA Expansion Playbook.md" "Latest Documentation"

# ============================================================================
# Summary
# ============================================================================
Write-Host "`n=== SUMMARY ===" -ForegroundColor Cyan
Write-Host "Files moved:   $moved"
Write-Host "Files skipped: $skipped"

if ($warnings.Count -gt 0) {
    Write-Host "`nWarnings ($($warnings.Count)):" -ForegroundColor Yellow
    foreach ($w in $warnings) { Write-Host "  $w" }
}

if ($DryRun) {
    Write-Host "`nDRY RUN COMPLETE. No changes made." -ForegroundColor Green
    Write-Host "Rerun without -DryRun to execute." -ForegroundColor Green
} else {
    Write-Host "`nRESTRUCTURE COMPLETE." -ForegroundColor Green
    Write-Host "Next: git status, git diff --stat, git commit"
    Write-Host ""
    Write-Host "Smoke test after commit (from repo root):"
    Write-Host "  python scripts/narrative/generate_narratives_v2.py --help"
    Write-Host "  python scripts/score/scoring_pipeline.py --help"
    Write-Host "  python scripts/enrich/scholar_overnight.py --help"
    Write-Host "  python scripts/narrative/spot_check_narratives.py --help"
}
