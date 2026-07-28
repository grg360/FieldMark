$repo  = "C:\Users\garre\Desktop\FieldMark"
$out   = Join-Path $repo "docs\TA_BUILD_DEBT_COMPLETE.md"
$files = @(
    (Join-Path $repo "docs\TA_BUILD_DEBT.md"),
    (Join-Path $repo "docs\TA_BUILD_DEBT_ch2.md"),
    (Join-Path $repo "docs\TA_BUILD_DEBT_ch3.md")
)

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
        if ($line -match '^#{2,3}\s+(\S+)\.\s*(.+)$') {
            $sec   = $matches[1]
            $title = $matches[2]
            $anchor = ($line -replace '^#+\s*','' -replace '[^\w\s-]','' -replace '\s+','-').ToLower()
            [void]$toc.AppendLine("- [$sec. $title](#$anchor)")
        }
    }
}

$header = @"
# TA BUILD DEBT — COMPLETE LOG

Consolidated chronological session record for the FieldMark TA build work.
Merged from TA_BUILD_DEBT.md (ch1), _ch2.md, and _ch3.md — chapters were size splits, not topic splits.

**This is a working log, not reference documentation.** The durable rules extracted from it live in
TA_NEW_PLAYBOOK.md (+ _ch2 / _ch3). Use this to answer "why is this the way it is," not "how do I do this."

Generated: $(Get-Date -Format "yyyy-MM-dd")

---

## Contents
$($toc.ToString())

---
"@

[System.IO.File]::WriteAllText($out, $header + $body.ToString())
Get-Item $out | Select-Object FullName, @{n='MB';e={[math]::Round($_.Length/1MB,2)}}