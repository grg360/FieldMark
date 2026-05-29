param()

$ErrorActionPreference = "Stop"

function Exit-WithError {
    param(
        [string]$Message
    )
    Write-Host $Message
    exit 1
}

# Find repo root by walking up from current directory until .git is found
$repoRoot = $PWD.Path
while ($repoRoot -and -not (Test-Path -Path (Join-Path $repoRoot ".git") -PathType Container)) {
    $parent = Split-Path -Parent $repoRoot
    if ($parent -eq $repoRoot) {
        Exit-WithError "Not in a git repo (walked from $($PWD.Path) to root)"
    }
    $repoRoot = $parent
}

# Operate from repo root for the rest of the script
Push-Location $repoRoot

try {
    Write-Host "Repo: $repoRoot"

    # Show current branch for clarity
    try {
        $currentBranch = (git rev-parse --abbrev-ref HEAD).Trim()
    } catch {
        Exit-WithError "Failed to read current branch"
    }
    Write-Host "Branch: $currentBranch"
    Write-Host ""

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
        Write-Host "Pushing to origin/$currentBranch..."
        try {
            git push origin HEAD
            $pushExit = $LASTEXITCODE
        } catch {
            Exit-WithError $_.Exception.Message
        }
        if ($pushExit -ne 0) {
            Exit-WithError "Push failed."
        }

        # Show the resulting commit for clarity
        try {
            $commitHash = (git rev-parse --short HEAD).Trim()
            Write-Host ""
            Write-Host "Pushed $commitHash to origin/$currentBranch"
        } catch {
            # Non-fatal if we can't read the hash; the push already succeeded
        }
    }

    Write-Host "Done."
    exit 0
} finally {
    Pop-Location
}
