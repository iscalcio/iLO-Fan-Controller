param(
  [switch]$RemoveVolumes
)

$root = Split-Path -Parent $MyInvocation.MyCommand.Path | Split-Path -Parent
Set-Location $root

if ($RemoveVolumes) {
  docker compose down -v
} else {
  docker compose down
}
