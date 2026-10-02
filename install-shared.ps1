[CmdletBinding()]
param(
    [Parameter(Position = 0, ValueFromRemainingArguments = $true)]
    [string[]] $InstallerArguments
)

$ErrorActionPreference = 'Stop'
$temporary = $null
try {
    $installer = if ($PSScriptRoot) { Join-Path $PSScriptRoot 'scripts/install-shared.mjs' } else { $null }
    if (-not $installer -or -not (Test-Path -LiteralPath $installer -PathType Leaf)) {
        $ref = if ($env:AI_NATIVE_SDLC_REF) { $env:AI_NATIVE_SDLC_REF } else { 'main' }
        if ($ref -notmatch '^[a-zA-Z0-9._-]+$' -or $ref -in '.', '..') {
            throw "Invalid source ref: $ref"
        }
        $url = if ($env:AI_NATIVE_SDLC_INSTALLER_URL) { $env:AI_NATIVE_SDLC_INSTALLER_URL } else {
            "https://raw.githubusercontent.com/HakjunMIN/ai-native-harness/$ref/scripts/install-shared.mjs"
        }
        $temporary = Join-Path ([System.IO.Path]::GetTempPath()) ([System.Guid]::NewGuid().ToString())
        New-Item -ItemType Directory -Path $temporary | Out-Null
        $installer = Join-Path $temporary 'install-shared.mjs'
        Invoke-WebRequest -Uri $url -OutFile $installer
    }
    & node $installer @InstallerArguments
    if ($LASTEXITCODE -ne 0) { throw "Shared installation failed (exit $LASTEXITCODE)." }
} finally {
    if ($temporary) { Remove-Item -LiteralPath $temporary -Recurse -Force }
}
