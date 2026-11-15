param(
    [Parameter(Mandatory = $true)]
    [ValidateSet("node1", "node2", "node3", "observer")]
    [string]$Node
)
$ErrorActionPreference = "Stop"
$Net = Resolve-Path (Join-Path $PSScriptRoot "..")
$EnvFile = Join-Path $Net "local\$Node.env"
if (-not (Test-Path $EnvFile)) {
    throw "missing $EnvFile — run gen-keys first"
}
$Root = Resolve-Path (Join-Path $PSScriptRoot "..\..\..\..")
function Resolve-ArkhePath([string]$Value) {
    if ([System.IO.Path]::IsPathRooted($Value)) { return $Value }
    return (Join-Path $Root ($Value -replace "/", [IO.Path]::DirectorySeparatorChar))
}
Get-Content $EnvFile | ForEach-Object {
    if ($_ -match '^\s*#' -or $_ -match '^\s*$') { return }
    $name, $value = $_.Split("=", 2)
    Set-Item -Path "Env:$name" -Value $value
}
Set-Location $Root
& cargo run -p arkhe-chain -- --status --data (Resolve-ArkhePath $env:ARKHE_DATA) --genesis (Resolve-ArkhePath $env:ARKHE_GENESIS)

