param(
  [string]$Service = ""
)

$root = Split-Path -Parent $MyInvocation.MyCommand.Path | Split-Path -Parent
Set-Location $root

if ($Service -ne "") {
  docker compose logs -f $Service
} else {
  docker compose logs -f
}
