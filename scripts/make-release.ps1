param(
  [string]$OutDir = "release",
  [switch]$IncludeDist
)

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $MyInvocation.MyCommand.Path | Split-Path -Parent
Set-Location $root

# Read package metadata
$pkg = Get-Content package.json | ConvertFrom-Json
$name = $pkg.name
$version = $pkg.version
if (-not $name) { $name = "ilo-fans-controller" }
if (-not $version) { $version = "0.0.0" }

# Prepare staging
if (!(Test-Path $OutDir)) { New-Item -ItemType Directory -Path $OutDir | Out-Null }
$staging = Join-Path $OutDir "$name-$version"
if (Test-Path $staging) { Remove-Item -Recurse -Force $staging }
New-Item -ItemType Directory -Path $staging | Out-Null

function Add-IfExists($path) {
  if (Test-Path $path) {
    $target = Join-Path $staging (Split-Path $path -Leaf)
    Copy-Item -Recurse -Force $path $target
  }
}

# Files
@(
  'package.json',
  'package-lock.json',
  'Dockerfile',
  'docker-compose.yml',
  '.dockerignore',
  'README.md',
  'server.js',
  'docker-entrypoint.sh',
  'index.html',
  'index.tsx',
  'index.css',
  'vite.config.ts',
  'tsconfig.json',
  'tsconfig.node.json',
  'start.sh',
  'nginx.conf',
  'metadata.json',
  'App.tsx',
  'types.ts'
) | ForEach-Object { Add-IfExists $_ }

# Directories
@(
  'components',
  'services',
  'scripts',
  'docs',
  'public'
) | ForEach-Object { Add-IfExists $_ }

# Include dist if requested or present
if ($IncludeDist -or (Test-Path 'dist')) { Add-IfExists 'dist' }

# Create zip
$zipPath = Join-Path $OutDir "$name-$version.zip"
if (Test-Path $zipPath) { Remove-Item -Force $zipPath }
Compress-Archive -Path "$staging/*" -DestinationPath $zipPath -Force
Write-Output "Release criado: $zipPath"
