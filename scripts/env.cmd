@echo off
rem Run from the repository root. Values are public testnet configuration only.
if not exist ".env" (
  echo Missing .env. Copy .env.example to .env and fill in your testnet settings.
  exit /b 1
)
for /f "usebackq eol=# tokens=1,* delims==" %%A in (".env") do set "%%A=%%B"
