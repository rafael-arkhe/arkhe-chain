# Sobe os quatro nós em background. Só node1 sela, com --inbox e --time now.
# Requer gen-keys e peers.txt preenchido (announce + collect-peers).
$ErrorActionPreference = "Stop"
$Net = Resolve-Path (Join-Path $PSScriptRoot "..")
$Local = Join-Path $Net "local"
$Peers = Join-Path $Local "peers.txt"
$Inbox = Join-Path $Local "inbox"
$PidFile = Join-Path $Local "testnet.pids"
$Root = Resolve-Path (Join-Path $PSScriptRoot "..\..\..\..")

if (-not (Test-Path (Join-Path $Local "node1.env"))) {
    throw "missing local env — run gen-keys first"
}
if (-not (Test-Path $Peers) -or -not (Select-String -Path $Peers -Pattern '^/ip4/' -Quiet)) {
    throw "peers.txt sem multiaddrs — run start-node -Once em cada nó e collect-peers"
}

New-Item -ItemType Directory -Force -Path $Inbox | Out-Null
Set-Location $Root
Write-Host "=== Building arkhe-chain ==="
cargo build -q -p arkhe-chain
$Bin = Join-Path $Root "target\debug\arkhe-chain.exe"
if (-not (Test-Path $Bin)) { $Bin = Join-Path $Root "target\debug\arkhe-chain" }

function Start-ArkheNode([string]$Node) {
    $EnvFile = Join-Path $Local "$Node.env"
    Get-Content $EnvFile | ForEach-Object {
        if ($_ -match '^\s*#' -or $_ -match '^\s*$') { return }
        $name, $value = $_.Split("=", 2)
        Set-Item -Path "Env:$name" -Value $value
    }
    function Resolve-ArkhePath([string]$Value) {
        if ([System.IO.Path]::IsPathRooted($Value)) { return $Value }
        return (Join-Path $Root ($Value -replace "/", [IO.Path]::DirectorySeparatorChar))
    }
    $Data = Resolve-ArkhePath $env:ARKHE_DATA
    $Key = Resolve-ArkhePath $env:ARKHE_KEY
    $Genesis = Resolve-ArkhePath $env:ARKHE_GENESIS
    $PeerFile = Resolve-ArkhePath $env:ARKHE_PEER_FILE
    $Announce = Resolve-ArkhePath $env:ARKHE_ANNOUNCE
    New-Item -ItemType Directory -Force -Path (Split-Path $Data) | Out-Null
    $StaleTmp = Join-Path (Split-Path $Data) ((Split-Path $Data -Leaf) + ".arkhe-tmp")
    if (Test-Path $StaleTmp) {
        Write-Host "  removing stale $StaleTmp"
        Remove-Item -Force $StaleTmp
    }
    $Args = @(
        "--data", $Data,
        "--id", $env:ARKHE_ID,
        "--key", $Key,
        "--genesis", $Genesis,
        "--listen", $env:ARKHE_LISTEN,
        "--peer-file", $PeerFile,
        "--announce", $Announce
    )
    if ($env:ARKHE_SEAL -eq "1") {
        $SealTime = $env:ARKHE_TIME
        if (-not $SealTime -or $SealTime -eq "now") {
            $SealTime = [DateTimeOffset]::UtcNow.ToUnixTimeSeconds().ToString()
        }
        $Args += @("--seal", "--time", $SealTime)
        $InboxPath = if ($env:ARKHE_INBOX) { Resolve-ArkhePath $env:ARKHE_INBOX } else { $Inbox }
        New-Item -ItemType Directory -Force -Path $InboxPath | Out-Null
        $Args += @("--inbox", $InboxPath)
    }
    $Log = Join-Path $Local "$Node.log"
    $ErrLog = Join-Path $Local "$Node.err.log"
    # PowerShell forbids the same path for stdout and stderr redirects.
    $Proc = Start-Process -FilePath $Bin -ArgumentList $Args -RedirectStandardOutput $Log -RedirectStandardError $ErrLog -PassThru -WindowStyle Hidden
    Add-Content -Path $PidFile -Value $Proc.Id
    Write-Host "  $Node PID $($Proc.Id) (log: $Log)"
}

if (Test-Path $PidFile) { Remove-Item -Force $PidFile }
New-Item -ItemType File -Path $PidFile -Force | Out-Null
Write-Host "=== Starting followers ==="
Start-ArkheNode node2
Start-ArkheNode node3
Start-ArkheNode observer
Start-Sleep -Seconds 2
Write-Host "=== Starting sealer node1 ==="
Start-ArkheNode node1
Write-Host "Background testnet up. faucet-tx / send-attest → inbox; check-status; stop-background."
