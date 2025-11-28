param(
  [string]$BaseUrl = "http://localhost:8055"
)

try {
  Invoke-RestMethod -Uri "$BaseUrl/api/auth/info" -TimeoutSec 5 | Out-Null
  Write-Output "auth/info OK"
} catch { Write-Output "auth/info FAIL"; exit 1 }

try {
  Invoke-RestMethod -Uri "$BaseUrl/api/sensors" -TimeoutSec 5 | Out-Null
  Write-Output "sensors OK"
} catch { Write-Output "sensors FAIL"; exit 1 }

Write-Output "Healthcheck OK"
