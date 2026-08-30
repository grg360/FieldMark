# "Continue", NOT "Stop" (2026-08-03): under Stop, the first stderr line a native
# command writes through *>&1 (e.g. a tqdm progress bar) becomes a terminating
# NativeCommandError in Windows PowerShell 5.1 — this killed the 2026-08-03 03:00
# run one second into stage 1, with exit 1 and no FAILED/end lines. Fail-fast
# never depended on Stop: the explicit $LASTEXITCODE checks and `exit $code` do
# that work, and they still fail hard (a missing git leaves $LASTEXITCODE null,
# and null -ne 0 aborts).
$ErrorActionPreference = "Continue"
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

# UTF-8 mode for python and every child it spawns (2026-08-03): with stdout on a
# pipe, Windows Python defaults to cp1252 and ta_cycle's child-output
# streaming crashes on the first unencodable char (tqdm's U+2588 bar blocks did
# exactly this to the 03:00 run, at stage 1, before the Stop-preference bug ate
# the traceback). Inherited by all stage subprocesses.
$env:PYTHONUTF8 = "1"

& $python -u "scripts\ta_cycle.py" --ta nsclc --operation refresh --days 10 --execute *>&1 |
    Tee-Object -FilePath $log -Append

$code = $LASTEXITCODE
"=== reingest end $(Get-Date -Format o) exit=$code ===" | Out-File -FilePath $log -Append -Encoding utf8
exit $code
