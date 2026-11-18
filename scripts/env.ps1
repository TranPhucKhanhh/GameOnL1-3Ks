# Load public testnet settings from .env into this PowerShell session. Run from the repo root:
#   . .\scripts\env.ps1
# .env must hold public values only (never private keys).
if (-not (Test-Path .env)) { throw 'Missing .env. Copy .env.example to .env and fill in your testnet settings.' }
Get-Content .env | Where-Object { $_ -match '^[A-Za-z_][A-Za-z0-9_]*=' } | ForEach-Object {
  $name, $value = $_ -split '=', 2
  Set-Item -Path "env:$name" -Value $value
}
Write-Host 'Loaded .env into this session.'
