# RAW v5.40 — verify actual packaged Windows EXE carries RAW taskbar artwork.
# Read-only examination; no Windows settings/shortcuts changed.
param(
    [Parameter(Mandatory=$true)][string]$ExePath,
    [Parameter(Mandatory=$true)][string]$IconPath
)
Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"
if (-not [System.Environment]::OSVersion.Platform.Equals([System.PlatformID]::Win32NT)) {
    throw "RAW_V540_ICON_AUDIT_WINDOWS_ONLY"
}
$ExePath = (Resolve-Path -LiteralPath $ExePath).Path
$IconPath = (Resolve-Path -LiteralPath $IconPath).Path
$version = [System.Diagnostics.FileVersionInfo]::GetVersionInfo($ExePath)
if ($version.ProductName -ne "RAW Desktop Beta" -or $version.FileDescription -notlike "RAW Mastering*") {
    throw ("RAW_V540_EXE_RESOURCES_MISSING: " + $version.ProductName + " / " + $version.FileDescription)
}

Add-Type -AssemblyName System.Drawing
$reference = [System.Drawing.Icon]::new($IconPath, 32, 32)
$actual = [System.Drawing.Icon]::ExtractAssociatedIcon($ExePath)
if ($null -eq $actual) { throw "RAW_V540_EXE_ICON_MISSING" }
try {
    $referenceBitmap = $reference.ToBitmap()
    $actualBitmap = $actual.ToBitmap()
    try {
        $referenceSize = 32
        if ($actualBitmap.Width -ne $referenceSize -or $actualBitmap.Height -ne $referenceSize) {
            throw ("RAW_V540_EXE_ICON_BAD_SIZE: " + $actualBitmap.Width + "x" + $actualBitmap.Height)
        }
        $opaqueCount = 0
        $closeCount = 0
        for ($y=0; $y -lt 32; $y++) {
            for ($x=0; $x -lt 32; $x++) {
                $want = $referenceBitmap.GetPixel($x,$y)
                if ($want.A -lt 200) { continue }
                $opaqueCount++
                $have = $actualBitmap.GetPixel($x,$y)
                $difference = [Math]::Abs([int]$want.R-[int]$have.R) +
                              [Math]::Abs([int]$want.G-[int]$have.G) +
                              [Math]::Abs([int]$want.B-[int]$have.B)
                if ($have.A -ge 200 -and $difference -le 60) { $closeCount++ }
            }
        }
        if ($opaqueCount -lt 100 -or ($closeCount / $opaqueCount) -lt 0.85) {
            throw ("RAW_V540_ICON_ART_MISMATCH: " + $closeCount + "/" + $opaqueCount + " opaque pixels match")
        }
        Write-Host ("[RAW V5.40] Windows EXE icon verified against taskbar source: " +
            $closeCount + "/" + $opaqueCount + " opaque pixels matching.")
        Write-Host ("[RAW V5.40] FileDescription: " + $version.FileDescription)
    } finally {
        $referenceBitmap.Dispose()
        $actualBitmap.Dispose()
    }
} finally {
    $reference.Dispose()
    $actual.Dispose()
}
