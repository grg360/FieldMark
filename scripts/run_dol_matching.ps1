$ErrorActionPreference = "Stop"
$repo = "C:\Users\garre\Desktop\FieldMark"
Set-Location $repo

$stamp  = Get-Date -Format "yyyyMMdd-HHmmss"
$logDir = Join-Path $repo "logs"
New-Item -ItemType Directory -Force -Path $logDir | Out-Null
$log    = Join-Path $logDir "dol-matching-$stamp.log"

"=== dol matching start $(Get-Date -Format o) ===" | Out-File -FilePath $log -Encoding utf8

$python = "C:\Users\garre\AppData\Local\Programs\Python\Python312\python.exe"

# OS-level redirection via cmd /c, matching run_social_capture.ps1 (Tee-Object
# buffers and mangles encoding on unattended runs). ASCII-only console output.
cmd /c "$python -u scripts\social\dol_matching.py --triggered-by task_scheduler >> $log 2>&1"

$code = $LASTEXITCODE
"=== dol matching end $(Get-Date -Format o) exit=$code ===" | Out-File -FilePath $log -Append -Encoding utf8
exit $code
