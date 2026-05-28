# Save this as enrich_chunks.ps1 - ASCII characters only

$chunkSize = 5000
$startOffset = 163500
$endOffset = 229252
$logFile = "enrich_chunks.log"

Set-Location C:\Users\garre\Desktop\FieldMark

"Chunk script started: $(Get-Date)" | Out-File -FilePath $logFile -Append

for ($offset = $startOffset; $offset -lt $endOffset; $offset += $chunkSize) {
    $remaining = $endOffset - $offset
    $thisChunk = [Math]::Min($chunkSize, $remaining)

    $msg = "[$(Get-Date -Format 'HH:mm:ss')] Chunk: offset=$offset limit=$thisChunk (remaining: $remaining)"
    Write-Host $msg -ForegroundColor Cyan
    $msg | Out-File -FilePath $logFile -Append

    $job = Start-Job -ScriptBlock {
        param($offset, $limit)
        Set-Location C:\Users\garre\Desktop\FieldMark
        python openalex_author_enrichment.py --workers 4 --limit $limit --offset $offset 2>&1
    } -ArgumentList $offset, $thisChunk

    $finished = Wait-Job -Job $job -Timeout 600

    if ($finished) {
        $output = Receive-Job -Job $job
        $output | Out-File -FilePath $logFile -Append
        "[$(Get-Date -Format 'HH:mm:ss')] Chunk complete" | Out-File -FilePath $logFile -Append
    } else {
        "[$(Get-Date -Format 'HH:mm:ss')] Chunk TIMEOUT - killing and continuing" | Out-File -FilePath $logFile -Append
        Stop-Job -Job $job
        Get-Process python* -ErrorAction SilentlyContinue | Where-Object { $_.StartTime -gt (Get-Date).AddMinutes(-15) } | Stop-Process -Force -ErrorAction SilentlyContinue
    }

    Remove-Job -Job $job -Force
    Start-Sleep -Seconds 5
}

"All chunks complete: $(Get-Date)" | Out-File -FilePath $logFile -Append
Write-Host "Done. Check $logFile for details." -ForegroundColor Green