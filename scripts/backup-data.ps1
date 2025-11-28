param(
  [string]$OutDir = "backups"
)

$root = Split-Path -Parent $MyInvocation.MyCommand.Path | Split-Path -Parent
Set-Location $root

if (!(Test-Path $OutDir)) { New-Item -ItemType Directory -Path $OutDir | Out-Null }
$timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
$archive = Join-Path $OutDir "data-$timestamp.zip"

if (Test-Path "data") {
  Compress-Archive -Path "data/*" -DestinationPath $archive -Force
} else {
  New-Item -ItemType File -Path $archive | Out-Null
}
Write-Output "Backup criado: $archive"
