$ErrorActionPreference = "Stop"
$repo = "C:\Users\garre\Desktop\FieldMark"
Set-Location $repo

$stamp  = Get-Date -Format "yyyyMMdd-HHmmss"
$logDir = Join-Path $repo "logs"
New-Item -ItemType Directory -Force -Path $logDir | Out-Null
$log    = Join-Path $logDir "social-capture-$stamp.log"

"=== social capture start $(Get-Date -Format o) ===" | Out-File -FilePath $log -Encoding utf8

$python = "C:\Users\garre\AppData\Local\Programs\Python\Python312\python.exe"

# python -u so the log flushes as it runs; OS-level redirection via cmd /c
# instead of Tee-Object piping (Tee buffers and mangles encoding on unattended
# runs). Paths contain no spaces, so no inner quoting is needed.
cmd /c "$python -u scripts\social\scheduled_capture.py >> $log 2>&1"

$code = $LASTEXITCODE
"=== social capture end $(Get-Date -Format o) exit=$code ===" | Out-File -FilePath $log -Append -Encoding utf8
exit $code
