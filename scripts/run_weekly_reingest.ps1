$ErrorActionPreference = "Stop"
$repo = "C:\Users\garre\Desktop\FieldMark"
Set-Location $repo

$stamp   = Get-Date -Format "yyyyMMdd-HHmmss"
$logDir  = Join-Path $repo "logs"
New-Item -ItemType Directory -Force -Path $logDir | Out-Null
$log     = Join-Path $logDir "reingest-nsclc-$stamp.log"

"=== reingest start $(Get-Date -Format o) ===" | Out-File -FilePath $log -Encoding utf8

$python = "C:\Users\garre\AppData\Local\Programs\Python\Python312\python.exe"

& $python -u "scripts\reingest_cycle.py" --ta nsclc --days 10 --execute *>&1 |
    Tee-Object -FilePath $log -Append

$code = $LASTEXITCODE
"=== reingest end $(Get-Date -Format o) exit=$code ===" | Out-File -FilePath $log -Append -Encoding utf8
exit $code
