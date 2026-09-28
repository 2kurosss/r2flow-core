#Requires -Version 7
<#
  r2flow-core одной командой:
    .\scripts\dev.ps1 -CorePort 8100
  Поднимет: ядро (sqlite) + пульт (vite :5173) + курьера (leads, caps python+http).
  Каждое — в своем окне. Закрыть все — закрыть окна.
#>
param([int]$CorePort = 8100)

$root = Split-Path -Parent $PSScriptRoot
$coreUrl = "http://localhost:$CorePort"

Write-Host "r2flow-core — ready to flow" -ForegroundColor Green
Write-Host "core: $coreUrl  web: http://localhost:5173" -ForegroundColor Cyan

# 0. зависимости (тихо, только если их нет)
if (-not (Test-Path "$root\web\node_modules")) {
  Write-Host "npm install (первый раз)..." -ForegroundColor Yellow
  Push-Location "$root\web"; npm install --no-audit --no-fund | Out-Null; Pop-Location
}

# 1. ядро
Start-Process pwsh -ArgumentList @(
  "-NoExit", "-Command",
  "cd '$root'; `$env:PYTHONPATH='src'; `$env:DATABASE_URL='sqlite+aiosqlite:///./r2flow.db'; python -m uvicorn r2flow_core.main:app --reload --port $CorePort"
) -WorkingDirectory $root

# 2. пульт
Start-Process pwsh -ArgumentList @(
  "-NoExit", "-Command",
  "cd '$root\web'; `$env:CORE_PORT='$CorePort'; npm run dev"
) -WorkingDirectory "$root\web"

# 3. ждем ядро, потом курьер (иначе register падает)
for ($i = 0; $i -lt 30; $i++) {
  try { Invoke-RestMethod "$coreUrl/health" -TimeoutSec 2 | Out-Null; break }
  catch { Start-Sleep -Seconds 1 }
}

# 4. курьер лидов: python + http (под TG/CRM следующим шагом)
Start-Process pwsh -ArgumentList @(
  "-NoExit", "-Command",
  "cd '$root'; `$env:PYTHONPATH='src;sdk/python'; python plugins/official/executors/python/runner.py --core $coreUrl --name laptop-1 --caps python:3.11,http"
) -WorkingDirectory $root

Write-Host "Готово. Проверка:" -ForegroundColor Green
Write-Host "  Invoke-RestMethod $coreUrl/health" -ForegroundColor Yellow
Write-Host "  Открой http://localhost:5173" -ForegroundColor Yellow
