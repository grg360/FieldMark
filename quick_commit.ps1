param()

$ErrorActionPreference = "Stop"

function Exit-WithError {
    param(
        [string]$Message
    )
    Write-Host $Message
    exit 1
}

if (-not (Test-Path -Path ".git" -PathType Container)) {
    Exit-WithError "Not in a git repo"
}

Write-Host "Current state:"
try {
    $statusOutput = git status --short
    $statusExit = $LASTEXITCODE
} catch {
    Exit-WithError $_.Exception.Message
}

if ($statusExit -ne 0) {
    Exit-WithError "Failed to read git status"
}

if ($null -ne $statusOutput) {
    $statusText = ($statusOutput | Out-String).TrimEnd()
} else {
    $statusText = ""
}

if ([string]::IsNullOrWhiteSpace($statusText)) {
    Write-Host "Working tree clean - nothing to commit"
    exit 0
}

Write-Host $statusText
Write-Host ""

$message = $null
if ($args.Count -gt 0 -and -not $args[0].StartsWith("-")) {
    $message = $args[0]
} else {
    $message = Read-Host "Commit message"
}

if ([string]::IsNullOrWhiteSpace($message)) {
    Exit-WithError "Commit message required"
}

Write-Host "Staging changes..."
try {
    git add -A
    $addExit = $LASTEXITCODE
} catch {
    Exit-WithError $_.Exception.Message
}
if ($addExit -ne 0) {
    Exit-WithError "Failed to stage changes"
}

Write-Host "Committing..."
try {
    git commit -m "$message"
    $commitExit = $LASTEXITCODE
} catch {
    Exit-WithError $_.Exception.Message
}
if ($commitExit -ne 0) {
    Write-Host "Commit failed. Fix the issue and try again."
    exit 1
}

$noPush = $false
foreach ($arg in $args) {
    if ($arg -eq "-NoPush") {
        $noPush = $true
        break
    }
}

if (-not $noPush) {
    Write-Host "Pushing to origin/main..."
    try {
        git push origin HEAD:main
        $pushExit = $LASTEXITCODE
    } catch {
        Exit-WithError $_.Exception.Message
    }
    if ($pushExit -ne 0) {
        Exit-WithError "Push failed."
    }
}

Write-Host "Done."
exit 0
