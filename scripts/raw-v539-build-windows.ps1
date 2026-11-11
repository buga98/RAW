# RAW v5.39: create an UNSIGNED, local-only Windows beta installer.
# This script never uploads, publishes, deploys, or runs the resulting installer.
Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function Invoke-Checked {
    param([string]$Description, [scriptblock]$Command)
    Write-Host ("[RAW BETA] " + $Description)
    & $Command
    if ($LASTEXITCODE -ne 0) {
        throw ("RAW_BUILD_STEP_FAILED: " + $Description + " (exit " + $LASTEXITCODE + ")")
    }
}

if ([Environment]::OSVersion.Platform -ne [PlatformID]::Win32NT) {
    throw "RAW_WINDOWS_ONLY: run this script in Windows PowerShell."
}
$Root = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$ExpectedBranch = "feature/raw-v539-local-windows-installer"
foreach ($Program in @("git", "node", "npm")) {
    if (-not (Get-Command $Program -ErrorAction SilentlyContinue)) {
        throw ("RAW_BUILD_MISSING_TOOL: " + $Program)
    }
}
$PythonProgram = $null
$PythonPrefix = @()
if (Get-Command "py" -ErrorAction SilentlyContinue) {
    $PythonProgram = "py"
    $PythonPrefix = @("-3")
} elseif (Get-Command "python" -ErrorAction SilentlyContinue) {
    $PythonProgram = "python"
} else {
    throw "RAW_BUILD_MISSING_PYTHON: install Python 3 with Pillow for RAW icon generation."
}

$PriorTest = [Environment]::GetEnvironmentVariable("RAW_TEST_MODE", "Process")
$PriorSigning = [Environment]::GetEnvironmentVariable("CSC_IDENTITY_AUTO_DISCOVERY", "Process")
Push-Location $Root
try {
    $CurrentBranch = (& git branch --show-current).Trim()
    if ($LASTEXITCODE -ne 0 -or $CurrentBranch -ne $ExpectedBranch) {
        throw ("RAW_BUILD_WRONG_BRANCH: expected " + $ExpectedBranch + ", found " + $CurrentBranch)
    }

    # Also forced at desktop-beta/main.cjs, independent of inherited environment.
    $env:RAW_TEST_MODE = "1"
    $env:CSC_IDENTITY_AUTO_DISCOVERY = "false"

    Invoke-Checked "Stage allowlisted UI and Electron runtime" {
        & node scripts/raw-v537-package-desktop.mjs
    }
    Invoke-Checked "Run v5.38 nested boot and staging tests" {
        & node --test tests/raw-v538-desktop-beta-stability.test.mjs
    }
    Invoke-Checked "Verify unsigned v5.39 Windows beta builder policy" {
        & node --test tests/raw-v539-windows-installer-contract.test.mjs
    }
    Invoke-Checked "Check Python Pillow dependency" {
        & $PythonProgram @PythonPrefix -c "import PIL; print('Pillow ready')"
    }
    Invoke-Checked "Generate RAW Windows icon from original application logo" {
        & $PythonProgram @PythonPrefix scripts/raw-v537-create-icons.py
    }

    Push-Location (Join-Path $Root "desktop-beta")
    try {
        # Explicitly do not reuse an older binary as evidence of a current build.
        $Dist = Join-Path $Root "desktop-beta\dist"
        if (Test-Path -LiteralPath $Dist) {
            Remove-Item -LiteralPath $Dist -Recurse -Force
        }
        Invoke-Checked "Install isolated desktop build dependencies" {
            & npm install --no-audit --no-fund
        }
        Invoke-Checked "Build PRIVATE unsigned Windows x64 NSIS EXE (no publishing)" {
            & npm run build:windows
        }
    } finally {
        Pop-Location
    }

    $Dist = Join-Path $Root "desktop-beta\dist"
    $Installer = Get-ChildItem -LiteralPath $Dist -File -Filter "RAW-Desktop-Beta-*-Windows-x64.exe" |
        Sort-Object LastWriteTimeUtc -Descending |
        Select-Object -First 1
    if ($null -eq $Installer -or $Installer.Length -lt 1000000) {
        throw "RAW_BUILD_OUTPUT_MISSING: no valid-sized Windows x64 EXE generated."
    }
    $Digest = Get-FileHash -LiteralPath $Installer.FullName -Algorithm SHA256
    Write-Host ""
    Write-Host "[RAW BETA] BUILD COMPLETE - INSTALLER WAS NOT EXECUTED OR UPLOADED"
    Write-Host ("Path: " + $Installer.FullName)
    Write-Host ("Bytes: " + $Installer.Length)
    Write-Host ("SHA256: " + $Digest.Hash)
    Write-Host "Status: UNSIGNED / LOCAL TEST ONLY / DO NOT DISTRIBUTE"
} finally {
    Pop-Location
    if ($null -eq $PriorTest) {
        Remove-Item Env:RAW_TEST_MODE -ErrorAction SilentlyContinue
    } else {
        $env:RAW_TEST_MODE = $PriorTest
    }
    if ($null -eq $PriorSigning) {
        Remove-Item Env:CSC_IDENTITY_AUTO_DISCOVERY -ErrorAction SilentlyContinue
    } else {
        $env:CSC_IDENTITY_AUTO_DISCOVERY = $PriorSigning
    }
}
