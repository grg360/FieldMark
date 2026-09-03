<#
  run_state_provenance.ps1

  Runs the state provenance repair blocks in order, halting on the first error.
  Nothing here is billed. No API calls.

  USAGE
    .\scripts\run_state_provenance.ps1              runs steps 1-12
    .\scripts\run_state_provenance.ps1 -StartAt 3   resumes at step 3
    .\scripts\run_state_provenance.ps1 -WhatIf      lists the steps, runs nothing

  Steps 13, 13b and 14 (the clear) are DELIBERATELY NOT IN THIS SCRIPT. They run
  only after the frontend has shipped and both the Cohort Ledger and the People
  feed are confirmed loading. That is a founder decision, not a step.

  Every step's output is echoed to the console and written to
  docs/state_provenance/run_<timestamp>.log
#>

param(
  [int]$StartAt = 1,
  [switch]$WhatIf
)

# Native stderr must NOT be a terminating error, or python's traceback is
# swallowed before it can be printed. Exit codes are checked explicitly below.
$ErrorActionPreference = "Continue"
$env:PYTHONIOENCODING = "utf-8"

$Root = Split-Path -Parent $PSScriptRoot
Set-Location $Root

$Steps = @(
  @{ N = 1;  File = "01_grant_snapshot_BEFORE.sql"; Expect = "18 rows. Keep this output." }
  @{ N = 2;  File = "02_null_artifacts.sql";        Expect = "OK: 54 rows affected" }
  @{ N = 3;  File = "03_boards.sql";                Expect = "OK. No error is the pass." }
  @{ N = 4;  File = "04_filtered_family.sql";       Expect = "OK. No error is the pass." }
  @{ N = 5;  File = "05_verify_filtered.sql";       Expect = "7 rows, has_institution_state and has_state_basis TRUE on all 7. SEND TO CLAUDE." }
  @{ N = 6;  File = "06_merge_invariant.sql";       Expect = "OK. No error is the pass." }
  @{ N = 7;  File = "07_roster_view.sql";           Expect = "OK. No error is the pass." }
  @{ N = 8;  File = "08_grant_check_AFTER.sql";     Expect = "18 rows, all three boolean columns TRUE on all 18. SEND TO CLAUDE." }
  @{ N = 9;  File = "09_verify_data.sql";           Expect = "Counts. SEND TO CLAUDE." }
  @{ N = 10; File = "10_constraint_npi.sql";        Expect = "OK. No error is the pass." }
  @{ N = 11; File = "11_constraint_source.sql";     Expect = "OK. CAN LEGITIMATELY FAIL - if it does, stop and send the error." }
  @{ N = 12; File = "12_verify_constraints.sql";    Expect = "Both constraints listed." }
)

$Stamp = Get-Date -Format "yyyyMMdd_HHmmss"
$Log   = Join-Path $Root "docs\state_provenance\run_$Stamp.log"

function Write-Both([string]$Text) {
  Write-Host $Text
  Add-Content -Path $Log -Value $Text -Encoding utf8
}

if ($WhatIf) {
  Write-Host ""
  Write-Host "Would run these steps (StartAt = $StartAt):" -ForegroundColor Cyan
  foreach ($s in $Steps) {
    if ($s.N -lt $StartAt) { Write-Host ("  {0,2}  {1,-32} SKIPPED" -f $s.N, $s.File) -ForegroundColor DarkGray }
    else                   { Write-Host ("  {0,2}  {1,-32} {2}"     -f $s.N, $s.File, $s.Expect) }
  }
  Write-Host ""
  return
}

New-Item -ItemType File -Path $Log -Force | Out-Null
Write-Both "state provenance run  $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')  StartAt=$StartAt"

foreach ($s in $Steps) {

  if ($s.N -lt $StartAt) {
    Write-Host ("  {0,2}  {1,-32} skipped" -f $s.N, $s.File) -ForegroundColor DarkGray
    continue
  }

  $Path = "docs/state_provenance/$($s.File)"
  if (-not (Test-Path $Path)) {
    Write-Host ""
    Write-Host "MISSING FILE: $Path" -ForegroundColor Red
    Write-Host "Stopped at step $($s.N). Nothing after this ran." -ForegroundColor Red
    exit 1
  }

  Write-Both ""
  Write-Both "======================================================================"
  Write-Both " STEP $($s.N)  $($s.File)"
  Write-Both " expect: $($s.Expect)"
  Write-Both "======================================================================"

  $Output = & python scripts/utilities/run_sql.py --file $Path 2>&1 |
              ForEach-Object { $_.ToString() }
  $Code   = $LASTEXITCODE

  $Output | ForEach-Object { Write-Both ("  " + $_) }

  if ($Code -ne 0) {
    Write-Host ""
    Write-Host "STEP $($s.N) FAILED (exit $Code). Stopped here." -ForegroundColor Red
    Write-Host "Nothing after this ran. The failed file rolled back whole -- run_sql.py" -ForegroundColor Red
    Write-Host "sends the file as one statement, so Postgres wrapped it in one" -ForegroundColor Red
    Write-Host "transaction. Send the block above to Claude." -ForegroundColor Red
    Write-Host ""
    Write-Host "To resume once fixed:  .\scripts\run_state_provenance.ps1 -StartAt $($s.N)" -ForegroundColor Yellow
    Write-Host "Log: $Log" -ForegroundColor DarkGray
    exit $Code
  }
}

Write-Host ""
Write-Host "ALL 12 STEPS PASSED." -ForegroundColor Green
Write-Host ""
Write-Host "NEXT, and this part is not automated on purpose:" -ForegroundColor Cyan
Write-Host "  1. Commit and push the frontend changes."
Write-Host "  2. Wait for the Cloudflare build."
Write-Host "  3. On the live site, confirm BOTH surfaces show states:"
Write-Host "       - CRC Cohort Ledger"
Write-Host "       - People feed"
Write-Host "  4. Only then run the clear:"
Write-Host "       python scripts/utilities/run_sql.py --file docs/state_provenance/13_clear_state.sql"
Write-Host "       python scripts/utilities/run_sql.py --file docs/state_provenance/13b_clear_city.sql"
Write-Host "       python scripts/utilities/run_sql.py --file docs/state_provenance/14_verify_clear.sql"
Write-Host ""
Write-Host "Send Claude the output of steps 5, 8 and 9 from the log." -ForegroundColor Cyan
Write-Host "Log: $Log" -ForegroundColor DarkGray
