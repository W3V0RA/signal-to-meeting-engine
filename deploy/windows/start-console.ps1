$ErrorActionPreference = 'Stop'
$taskRoot = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '../..')).Path
$env:DRY_RUN = 'true'
$env:LIVE_SEND_ENABLED = 'false'
$env:CONTROLLED_AUTONOMY_ENABLED = 'false'
$env:OWNER_EMAIL_ENABLED = 'false'
$env:INTEGRATION_WRITES_ENABLED = 'false'
Set-Location -LiteralPath $taskRoot
& node '--env-file-if-exists=.env' 'scripts/serve.mjs'
exit $LASTEXITCODE
