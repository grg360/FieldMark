param()

$ErrorActionPreference = "Stop"

function Exit-WithError {
    param(
        [string]$Message
    )
    Write-Host $Message
    exit 1
}

$PROJECT_ROOT = "C:\Users\garre\Desktop\FieldMark"
$BACKUPS_DIR = "C:\Users\garre\Desktop\FieldMark\backups"
$ENV_FILE = "C:\Users\garre\Desktop\FieldMark\.env"

try {
    if (-not (Test-Path -LiteralPath $BACKUPS_DIR -PathType Container)) {
        New-Item -ItemType Directory -Path $BACKUPS_DIR | Out-Null
    }
} catch {
    Exit-WithError "Failed to create backups directory."
}

try {
    pg_dump --version | Out-Null
    if ($LASTEXITCODE -ne 0) {
        Exit-WithError "pg_dump not found on PATH. Install Postgres 17 client tools."
    }
} catch {
    Exit-WithError "pg_dump not found on PATH. Install Postgres 17 client tools."
}

if (-not (Test-Path -LiteralPath $ENV_FILE -PathType Leaf)) {
    Exit-WithError ".env file not found at $ENV_FILE"
}

$databaseUrl = $null
try {
    foreach ($line in [System.IO.File]::ReadLines($ENV_FILE)) {
        if ($line.StartsWith("DATABASE_URL=")) {
            $databaseUrl = $line.Substring("DATABASE_URL=".Length)
            break
        }
    }
} catch {
    Exit-WithError "Failed to read .env file."
}

if ([string]::IsNullOrWhiteSpace($databaseUrl)) {
    Exit-WithError "DATABASE_URL not found in .env"
}

$databaseUrl = $databaseUrl.Trim()
if (
    ($databaseUrl.StartsWith('"') -and $databaseUrl.EndsWith('"')) -or
    ($databaseUrl.StartsWith("'") -and $databaseUrl.EndsWith("'"))
) {
    $databaseUrl = $databaseUrl.Substring(1, $databaseUrl.Length - 2)
}

if ([string]::IsNullOrWhiteSpace($databaseUrl)) {
    Exit-WithError "DATABASE_URL not found in .env"
}

$timestamp = Get-Date -Format "yyyy-MM-dd_HHmmss"
$backupFileName = "fieldmark_backup_$timestamp.dump"
$backupFullPath = Join-Path $BACKUPS_DIR $backupFileName

Write-Host "Starting backup at $timestamp"
Write-Host "Output file: $backupFileName"

$pgDumpOutput = @()
$pgDumpExit = 1
try {
    $pgDumpOutput = & pg_dump `
        $databaseUrl `
        -F c `
        --no-owner `
        --no-acl `
        --no-publications `
        --no-subscriptions `
        -f $backupFullPath 2>&1
    $pgDumpExit = $LASTEXITCODE
} catch {
    Exit-WithError "pg_dump execution failed."
}

if ($pgDumpOutput) {
    foreach ($line in $pgDumpOutput) {
        Write-Host $line
    }
}

if ($pgDumpExit -ne 0) {
    Exit-WithError "Backup failed: pg_dump exited with code $pgDumpExit"
}

if (-not (Test-Path -LiteralPath $backupFullPath -PathType Leaf)) {
    Exit-WithError "Backup failed: output file was not created."
}

try {
    $backupFileInfo = Get-Item -LiteralPath $backupFullPath
    $sizeMb = [Math]::Round(($backupFileInfo.Length / 1MB), 1)
} catch {
    Exit-WithError "Backup failed: unable to inspect output file."
}

Write-Host "Backup complete. Size: $sizeMb MB"
Write-Host "File: $backupFullPath"

Write-Host ""
Write-Host "Recent backups:"
try {
    $recentBackups = Get-ChildItem -LiteralPath $BACKUPS_DIR -Filter "fieldmark_backup_*.dump" -File |
        Sort-Object LastWriteTime -Descending |
        Select-Object -First 5 |
        ForEach-Object {
            [PSCustomObject]@{
                FileName     = $_.Name
                SizeMB       = [Math]::Round(($_.Length / 1MB), 1)
                LastModified = $_.LastWriteTime
            }
        }

    if ($recentBackups.Count -gt 0) {
        $recentBackups | Format-Table -AutoSize
    } else {
        Write-Host "No backup files found."
    }
} catch {
    Exit-WithError "Failed to list recent backups."
}

exit 0
