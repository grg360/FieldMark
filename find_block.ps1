param(
    [Parameter(Mandatory=$true)][string]$Pattern,
    [string]$Path = ".",
    [int]$Context = 40
)

Get-ChildItem -Path $Path -Recurse -Include *.py -File |
    Select-String -Pattern $Pattern -SimpleMatch |
    ForEach-Object {
        Write-Host ""
        Write-Host ("=" * 80) -ForegroundColor Cyan
        Write-Host ("{0}:{1}" -f $_.Path, $_.LineNumber) -ForegroundColor Yellow
        Write-Host ("=" * 80) -ForegroundColor Cyan
        $lines = Get-Content $_.Path
        $start = [Math]::Max(0, $_.LineNumber - 1)
        $end   = [Math]::Min($lines.Count - 1, $_.LineNumber - 1 + $Context)
        $lines[$start..$end] | ForEach-Object { Write-Host $_ }
    }