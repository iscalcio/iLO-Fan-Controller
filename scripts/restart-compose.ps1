param(
  [string]$EnvFile = ".env"
)

$root = Split-Path -Parent $MyInvocation.MyCommand.Path | Split-Path -Parent
Set-Location $root

docker compose down
docker compose --env-file $EnvFile up -d --build
