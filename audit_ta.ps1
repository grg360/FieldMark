# TA_AUDIT.ps1 - codebase inventory focused on TA-coupling signals

$root = "C:\Users\garre\Desktop\FieldMark"
$output = "$root\TA_AUDIT_RAW.md"

"# TA Expansion Audit - Raw Findings" | Out-File $output
"Generated: $(Get-Date)" | Add-Content $output
"" | Add-Content $output

# Signal 1: Hardcoded NSCLC string references
"## Signal 1: Hardcoded 'nsclc' / 'NSCLC' references" | Add-Content $output
"" | Add-Content $output
Get-ChildItem -Path $root -Recurse -Include *.tsx,*.ts,*.py,*.sql -Exclude node_modules | 
  Select-String -Pattern "nsclc|NSCLC" |
  Group-Object -Property Path |
  ForEach-Object {
    "### $($_.Name -replace [regex]::Escape($root), '.')" | Add-Content $output
    $_.Group | ForEach-Object { "  Line $($_.LineNumber): $($_.Line.Trim())" | Add-Content $output }
    "" | Add-Content $output
  }

# Signal 2: Hardcoded NSCLC TA UUID
"## Signal 2: Hardcoded NSCLC TA UUID" | Add-Content $output
"" | Add-Content $output
Get-ChildItem -Path $root -Recurse -Include *.tsx,*.ts,*.py,*.sql -Exclude node_modules |
  Select-String -Pattern "c0065b03-a25e-4e9a-bde4-4b4d0db7827d" |
  ForEach-Object {
    "- $($_.Path -replace [regex]::Escape($root), '.'): line $($_.LineNumber)" | Add-Content $output
  }
"" | Add-Content $output

# Signal 3: therapeutic_area_slug usage patterns
"## Signal 3: therapeutic_area_slug / therapeutic_area_id usage" | Add-Content $output
"" | Add-Content $output
Get-ChildItem -Path $root -Recurse -Include *.tsx,*.ts,*.py,*.sql -Exclude node_modules |
  Select-String -Pattern "therapeutic_area_slug|therapeutic_area_id|TA_SLUG|TA_ID" |
  Group-Object -Property Path |
  ForEach-Object {
    "- $($_.Name -replace [regex]::Escape($root), '.'): $($_.Count) references" | Add-Content $output
  }
"" | Add-Content $output

# Signal 4: Files with TA-related function signatures
"## Signal 4: Functions taking therapeutic area parameter" | Add-Content $output
"" | Add-Content $output
Get-ChildItem -Path $root -Recurse -Include *.tsx,*.ts,*.py -Exclude node_modules |
  Select-String -Pattern "therapeuticArea|therapeutic_area" |
  Where-Object { $_.Line -match "function|def |=>" } |
  ForEach-Object {
    "- $($_.Path -replace [regex]::Escape($root), '.'): line $($_.LineNumber): $($_.Line.Trim())" | Add-Content $output
  }
"" | Add-Content $output

# Signal 5: Database table inventory
"## Signal 5: Database tables referenced" | Add-Content $output
"" | Add-Content $output
Get-ChildItem -Path $root -Recurse -Include *.tsx,*.ts,*.py,*.sql -Exclude node_modules |
  Select-String -Pattern '\.from\("([a-z_]+)"\)|FROM ([a-z_]+)' |
  ForEach-Object {
    $match = [regex]::Match($_.Line, '\.from\("([a-z_]+)"\)|FROM ([a-z_]+)')
    if ($match.Success) {
      $tableName = if ($match.Groups[1].Value) { $match.Groups[1].Value } else { $match.Groups[2].Value }
      $tableName
    }
  } |
  Where-Object { $_ -ne "" } |
  Group-Object |
  Sort-Object Count -Descending |
  ForEach-Object {
    "- $($_.Name): referenced $($_.Count) times" | Add-Content $output
  }
"" | Add-Content $output

# Signal 6: File-level inventory by directory
"## Signal 6: Codebase scope" | Add-Content $output
"" | Add-Content $output
"### Python scripts (root)" | Add-Content $output
Get-ChildItem -Path $root -Filter *.py -File | ForEach-Object {
  "- $($_.Name): $((Get-Content $_.FullName).Count) lines" | Add-Content $output
}
"" | Add-Content $output

"### Frontend TypeScript files" | Add-Content $output
$tsCount = (Get-ChildItem -Path "$root\frontend\src" -Recurse -Include *.ts,*.tsx | Measure-Object).Count
$tsLines = (Get-ChildItem -Path "$root\frontend\src" -Recurse -Include *.ts,*.tsx | Get-Content | Measure-Object).Count
"- Files: $tsCount" | Add-Content $output
"- Total lines: $tsLines" | Add-Content $output
"" | Add-Content $output

Write-Host "Audit complete. Output written to $output"
Write-Host "Open with: notepad $output"