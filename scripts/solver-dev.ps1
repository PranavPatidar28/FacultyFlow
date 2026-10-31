$ErrorActionPreference = 'Stop'
$taskProjectRoot = Split-Path -Parent $PSScriptRoot
Set-Location -LiteralPath $taskProjectRoot
if (Test-Path -LiteralPath '.env.local') {
    foreach ($taskLine in Get-Content -LiteralPath '.env.local') {
        if ($taskLine -match '^SOLVER_SECRET=(.+)$') { $env:SOLVER_SECRET = $Matches[1].Trim().Trim('"') }
    }
}
if (-not $env:SOLVER_SECRET) { throw 'Set SOLVER_SECRET in .env.local before starting the solver.' }
& "$taskProjectRoot/solver/.venv/Scripts/python.exe" "$taskProjectRoot/solver/api/solve.py"
