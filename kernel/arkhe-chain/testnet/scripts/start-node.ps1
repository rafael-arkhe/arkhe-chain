param(
    [Parameter(Mandatory = $true)]
    [ValidateSet("node1", "node2", "node3", "observer")]
    [string]$Node,
    [switch]$Once
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
$Data = Resolve-ArkhePath $env:ARKHE_DATA
$Key = Resolve-ArkhePath $env:ARKHE_KEY
$Genesis = Resolve-ArkhePath $env:ARKHE_GENESIS
$PeerFile = Resolve-ArkhePath $env:ARKHE_PEER_FILE
$Announce = Resolve-ArkhePath $env:ARKHE_ANNOUNCE
$BinArgs = @(
    "--data", $Data,
    "--id", $env:ARKHE_ID,
    "--key", $Key,
    "--genesis", $Genesis,
    "--listen", $env:ARKHE_LISTEN,
    "--peer-file", $PeerFile,
    "--announce", $Announce
)
# --once is for announce only: sealing an empty mempool fails with MempoolEmpty.
if (-not $Once -and $env:ARKHE_SEAL -eq "1") {
    if (-not $env:ARKHE_TIME) { throw "ARKHE_SEAL=1 requires ARKHE_TIME" }
    $SealTime = $env:ARKHE_TIME
    if ($SealTime -eq "now") {
        $SealTime = [DateTimeOffset]::UtcNow.ToUnixTimeSeconds().ToString()
    }
    $BinArgs += @("--seal", "--time", $SealTime)
    if ($env:ARKHE_INBOX) {
        $Inbox = Resolve-ArkhePath $env:ARKHE_INBOX
        New-Item -ItemType Directory -Force -Path $Inbox | Out-Null
        $BinArgs += @("--inbox", $Inbox)
    }
}
if (-not $Once -and $env:ARKHE_TX) {
    $BinArgs += @("--tx", (Resolve-ArkhePath $env:ARKHE_TX))
}
if ($Once) {
    $BinArgs += "--once"
}
Set-Location $Root
New-Item -ItemType Directory -Force -Path (Split-Path $Data) | Out-Null
New-Item -ItemType Directory -Force -Path (Split-Path $Announce) | Out-Null
# A node killed mid-write leaves <id>.arkhe-tmp; refuse to start until removed.
$StaleTmp = Join-Path (Split-Path $Data) ((Split-Path $Data -Leaf) + ".arkhe-tmp")
if (Test-Path $StaleTmp) {
    Write-Host "removing stale $StaleTmp"
    Remove-Item -Force $StaleTmp
}
# Cargo prints progress on stderr; with $ErrorActionPreference=Stop that becomes
# a terminating NativeCommandError even when the binary succeeds.
$previous = $ErrorActionPreference
$ErrorActionPreference = "Continue"
try {
    & cargo run -p arkhe-chain -- @BinArgs 2>&1 | ForEach-Object {
        if ($_ -is [System.Management.Automation.ErrorRecord]) {
            Write-Host $_.ToString()
        } else {
            Write-Host $_
        }
    }
    if ($LASTEXITCODE -ne 0) {
        throw "arkhe-chain exited with code $LASTEXITCODE"
    }
} finally {
    $ErrorActionPreference = $previous
}
