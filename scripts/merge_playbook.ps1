$repo  = "C:\Users\garre\Desktop\FieldMark"
$out   = Join-Path $repo "docs\TA_NEW_PLAYBOOK_COMPLETE.md"
$files = @(
    (Join-Path $repo "docs\TA_NEW_PLAYBOOK.md"),
    (Join-Path $repo "docs\TA_NEW_PLAYBOOK_ch2.md"),
    (Join-Path $repo "docs\TA_NEW_PLAYBOOK_ch3.md")
) | Where-Object { Test-Path $_ }

$body = New-Object System.Text.StringBuilder
$toc  = New-Object System.Text.StringBuilder

foreach ($f in $files) {
    $name = [System.IO.Path]::GetFileName($f)
    [void]$body.AppendLine("")
    [void]$body.AppendLine("---")
    [void]$body.AppendLine("")
    [void]$body.AppendLine("# ===== source: $name =====")
    [void]$body.AppendLine("")
    [void]$toc.AppendLine("")
    [void]$toc.AppendLine("### from $name")

    foreach ($line in [System.IO.File]::ReadAllLines($f)) {
        [void]$body.AppendLine($line)
        if ($line -match '^#{2,3}\s+(.+)$') {
            $title  = $matches[1]
            $anchor = ($title -replace '[^\w\s-]','' -replace '\s+','-').ToLower()
            $indent = if ($line -match '^###') { "  " } else { "" }
            [void]$toc.AppendLine("$indent- [$title](#$anchor)")
        }
    }
}

$header = @"
# TA NEW PLAYBOOK — COMPLETE

How to onboard a new therapeutic area on FieldMark. Merged from TA_NEW_PLAYBOOK.md (foundational) plus
the _ch2 and _ch3 addenda — chapters were size splits, not topic splits.

**This is the canonical deep reference.** For a condensed, command-driven runbook see docs/TA_BUILD_GUIDE.md.
For the raw chronological record these rules were extracted from, see docs/TA_BUILD_DEBT_COMPLETE.md.
Where this document and the live code disagree, **the code wins** — parts of ch1 predate the 2026-07-23
ingest refactor (see section 0z).

Generated: $(Get-Date -Format "yyyy-MM-dd")

---

## Contents
$($toc.ToString())

---
"@

[System.IO.File]::WriteAllText($out, $header + $body.ToString())
Get-Item $out | Select-Object FullName, @{n='KB';e={[math]::Round($_.Length/1KB,1)}}