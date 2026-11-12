# RAW V5.40 Windows icon audit: read the EXE's REAL PE RT_ICON resources.
# GDI+ ExtractAssociatedIcon/ToBitmap varies by Windows build, icon alpha
# masks and DPI; it does not reliably expose the original embedded ICO data.
param(
    [Parameter(Mandatory=$true)][string]$ExePath,
    [Parameter(Mandatory=$true)][string]$IconPath
)
Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"
if ([Environment]::OSVersion.Platform -ne [PlatformID]::Win32NT) {
    throw "RAW_V540_ICON_AUDIT_WINDOWS_ONLY"
}
$ExePath = (Resolve-Path -LiteralPath $ExePath).Path
$IconPath = (Resolve-Path -LiteralPath $IconPath).Path
$version = [System.Diagnostics.FileVersionInfo]::GetVersionInfo($ExePath)
if ($version.ProductName -ne "RAW Desktop Beta" -or $version.FileDescription -notlike "RAW Mastering*") {
    throw ("RAW_V540_EXE_RESOURCES_MISSING: " + $version.ProductName + " / " + $version.FileDescription)
}

$Audit = Join-Path $PSScriptRoot "raw-v540-pe-icon-audit.py"
if (Get-Command "py" -ErrorAction SilentlyContinue) {
    & py -3 $Audit --exe $ExePath --ico $IconPath
} elseif (Get-Command "python" -ErrorAction SilentlyContinue) {
    & python $Audit --exe $ExePath --ico $IconPath
} else {
    throw "RAW_V540_PYTHON_MISSING"
}
if ($LASTEXITCODE -ne 0) {
    throw "RAW_V540_PE_ICON_RESOURCE_CHECK_FAILED"
}
Write-Host ("[RAW V5.40] EXE metadata verified: " + $version.FileDescription)
