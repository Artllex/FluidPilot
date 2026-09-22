$ErrorActionPreference = 'Stop'

$repo = Split-Path -Parent $PSScriptRoot
$source = Join-Path $repo 'extension'
$dist = Join-Path $repo 'dist'
$output = Join-Path $dist 'FluidPilot-3.1.0.xpi'

New-Item -ItemType Directory -Force -Path $dist | Out-Null
if (Test-Path -LiteralPath $output) {
    Remove-Item -LiteralPath $output
}

$items = Get-ChildItem -LiteralPath $source -Force
Compress-Archive -Path $items.FullName -DestinationPath ($output + '.zip') -CompressionLevel Optimal
Move-Item -LiteralPath ($output + '.zip') -Destination $output

Write-Output $output
