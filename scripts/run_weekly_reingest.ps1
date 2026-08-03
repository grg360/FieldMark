$ErrorActionPreference = "Stop"
$repo = "C:\Users\garre\Desktop\FieldMark"
Set-Location $repo

$stamp   = Get-Date -Format "yyyyMMdd-HHmmss"
$logDir  = Join-Path $repo "logs"
New-Item -ItemType Directory -Force -Path $logDir | Out-Null
$log     = Join-Path $logDir "reingest-nsclc-$stamp.log"

"=== reingest start $(Get-Date -Format o) ===" | Out-File -FilePath $log -Encoding utf8

# Sync to origin before anything runs. --ff-only fails on divergence instead of
# creating a merge; ANY non-zero exit aborts the run — the cycle must never
# execute on a stale or half-merged tree. (Added 2026-08-02: the runner used to
# execute whatever was in the checkout, silently stale whenever the laptop
# pushed and the desktop had not pulled.)
"=== git pull --ff-only ===" | Out-File -FilePath $log -Append -Encoding utf8
& git pull --ff-only *>&1 | Tee-Object -FilePath $log -Append
if ($LASTEXITCODE -ne 0) {
    "=== ABORT: git pull --ff-only exited $LASTEXITCODE — cycle NOT run (stale/diverged tree) ===" |
        Tee-Object -FilePath $log -Append
    exit 1
}
$sha = (& git rev-parse HEAD)
"=== running at HEAD $sha ===" | Tee-Object -FilePath $log -Append

$python = "C:\Users\garre\AppData\Local\Programs\Python\Python312\python.exe"

& $python -u "scripts\reingest_cycle.py" --ta nsclc --days 10 --execute *>&1 |
    Tee-Object -FilePath $log -Append

$code = $LASTEXITCODE
"=== reingest end $(Get-Date -Format o) exit=$code ===" | Out-File -FilePath $log -Append -Encoding utf8
exit $code
