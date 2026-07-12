[CmdletBinding()]
param(
  [string]$Installer = "",
  [string]$Application = ""
)

$ErrorActionPreference = "Stop"
$root = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
if ([string]::IsNullOrWhiteSpace($Installer)) {
  $candidate = Get-ChildItem (Join-Path $root "dist") -Filter "Prism-Setup-*.exe" -File |
    Sort-Object LastWriteTimeUtc -Descending | Select-Object -First 1
  if ($null -eq $candidate) { throw "No Prism installer was found in dist." }
  $Installer = $candidate.FullName
}
if ([string]::IsNullOrWhiteSpace($Application)) {
  $Application = Join-Path $root "dist\win-unpacked\Prism.exe"
}

$failed = $false
foreach ($artifact in @($Application, $Installer)) {
  if (-not (Test-Path -LiteralPath $artifact -PathType Leaf)) {
    Write-Output "FAIL signed artifact is missing: $artifact"
    $failed = $true
    continue
  }
  $signature = Get-AuthenticodeSignature -LiteralPath $artifact
  $timestamp = $signature.TimeStamperCertificate
  if ($signature.Status -ne "Valid" -or $null -eq $signature.SignerCertificate) {
    Write-Output "FAIL invalid or absent Authenticode signature: $artifact ($($signature.Status))"
    $failed = $true
    continue
  }
  if ($null -eq $timestamp) {
    Write-Output "FAIL Authenticode timestamp is absent: $artifact"
    $failed = $true
    continue
  }
  Write-Output "SIGNED $artifact"
  Write-Output "  Signer: $($signature.SignerCertificate.Subject)"
  Write-Output "  Signer expiry: $($signature.SignerCertificate.NotAfter.ToUniversalTime().ToString('o'))"
  Write-Output "  Timestamp authority: $($timestamp.Subject)"
}
if ($failed) { exit 1 }
