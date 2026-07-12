[CmdletBinding()]
param()

$ErrorActionPreference = "Stop"
$root = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
$manifest = Get-Content (Join-Path $root "resources\native-resources.json") -Raw | ConvertFrom-Json
if ($manifest.releasePlatform -ne "windows-x64") {
  throw "This script only prepares the declared windows-x64 release target."
}

$temporary = Join-Path ([IO.Path]::GetTempPath()) ("prism-native-" + [Guid]::NewGuid().ToString("N"))
$staging = Join-Path $temporary "staging"
New-Item -ItemType Directory -Path $staging | Out-Null
Add-Type -AssemblyName System.IO.Compression.FileSystem

function Get-VerifiedPackage($id) {
  $package = $manifest.packages.$id
  if ($null -eq $package) { throw "Unknown native package: $id" }
  if (-not $package.url.StartsWith("https://")) { throw "Package URL must use HTTPS: $id" }
  $destination = Join-Path $temporary ($id + $(if ($package.type -eq "zip") { ".zip" } else { ".bin" }))
  Invoke-WebRequest -UseBasicParsing -Uri $package.url -OutFile $destination
  $actual = (Get-FileHash -Algorithm SHA256 -LiteralPath $destination).Hash.ToLowerInvariant()
  if ($actual -ne $package.sha256) {
    throw "Package checksum mismatch for $id (expected $($package.sha256), got $actual)"
  }
  return $destination
}

function Copy-VerifiedItem($item, $packages) {
  $package = $manifest.packages.($item.package)
  $source = $packages[$item.package]
  $destination = Join-Path $staging $item.path
  $destinationParent = Split-Path -Parent $destination
  New-Item -ItemType Directory -Force -Path $destinationParent | Out-Null
  if ($package.type -eq "file") {
    Copy-Item -LiteralPath $source -Destination $destination
  } elseif ($package.type -eq "zip") {
    if ([string]::IsNullOrWhiteSpace($item.archivePath)) { throw "Missing archivePath for $($item.path)" }
    if ($item.archivePath.Contains("..") -or [IO.Path]::IsPathRooted($item.archivePath)) {
      throw "Unsafe archive path: $($item.archivePath)"
    }
    $zip = [IO.Compression.ZipFile]::OpenRead($source)
    try {
      $entry = $zip.GetEntry($item.archivePath)
      if ($null -eq $entry -or $entry.FullName -ne $item.archivePath) {
        throw "Expected archive entry is missing: $($item.archivePath)"
      }
      [IO.Compression.ZipFileExtensions]::ExtractToFile($entry, $destination, $true)
    } finally {
      $zip.Dispose()
    }
  } else {
    throw "Unsupported package type: $($package.type)"
  }
  $actual = (Get-FileHash -Algorithm SHA256 -LiteralPath $destination).Hash.ToLowerInvariant()
  if ($actual -ne $item.sha256) {
    throw "Extracted checksum mismatch for $($item.path)"
  }
}

try {
  $packageFiles = @{}
  $packageIds = @($manifest.resources.package + $manifest.notices.package | Sort-Object -Unique)
  foreach ($id in $packageIds) { $packageFiles[$id] = Get-VerifiedPackage $id }
  foreach ($resource in $manifest.resources | Where-Object platform -eq "win32") {
    Copy-VerifiedItem $resource $packageFiles
  }
  foreach ($notice in $manifest.notices) { Copy-VerifiedItem $notice $packageFiles }

  $resourceRoot = Join-Path $root "resources"
  foreach ($resource in $manifest.resources | Where-Object platform -eq "win32") {
    $source = Join-Path $staging $resource.path
    $destination = Join-Path $resourceRoot $resource.path
    New-Item -ItemType Directory -Force -Path (Split-Path -Parent $destination) | Out-Null
    Move-Item -Force -LiteralPath $source -Destination $destination
  }
  foreach ($notice in $manifest.notices) {
    $source = Join-Path $staging $notice.path
    $destination = Join-Path $resourceRoot $notice.path
    New-Item -ItemType Directory -Force -Path (Split-Path -Parent $destination) | Out-Null
    Move-Item -Force -LiteralPath $source -Destination $destination
  }
  & node (Join-Path $root "scripts\verify-resources.mjs")
  if ($LASTEXITCODE -ne 0) { throw "Native-resource validation failed after preparation." }
  Write-Output "Windows x64 native resources prepared successfully."
} finally {
  if (Test-Path -LiteralPath $temporary) { Remove-Item -Recurse -Force -LiteralPath $temporary }
}
