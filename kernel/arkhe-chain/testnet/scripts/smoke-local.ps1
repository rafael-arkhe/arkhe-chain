# Smoke nativo alinhado à tip `devnet_smoke` (sem Executor):
# transfer, attest (4 ops), replay, halt com node3 parado, catch-up, restart.
# Não homologa. Sai != 0 na primeira falha.
# Continue: cargo writes progress on stderr; Stop would abort on NativeCommandError.
$ErrorActionPreference = "Continue"
$Here = $PSScriptRoot
$Local = Join-Path (Resolve-Path (Join-Path $Here "..")) "local"
$Root = Resolve-Path (Join-Path $Here "..\..\..\..")
$PidFile = Join-Path $Local "testnet.pids"
$Nodes = @("node1", "node2", "node3", "observer")

function Resolve-ArkhePath([string]$Value) {
    if ([System.IO.Path]::IsPathRooted($Value)) { return $Value }
    return (Join-Path $Root ($Value -replace "/", [IO.Path]::DirectorySeparatorChar))
}

function Get-ArkheBin {
    $exe = Join-Path $Root "target\debug\arkhe-chain.exe"
    if (Test-Path $exe) { return $exe }
    return (Join-Path $Root "target\debug\arkhe-chain")
}

function Load-NodeEnv([string]$Node) {
    $EnvFile = Join-Path $Local "$Node.env"
    Get-Content $EnvFile | ForEach-Object {
        if ($_ -match '^\s*#' -or $_ -match '^\s*$') { return }
        $name, $value = $_.Split("=", 2)
        Set-Item -Path "Env:$name" -Value $value
    }
}

# Binary status (not cargo run): cargo + `2>$null` is slow and can drop stdout on Windows PS.
function Field([string]$Node, [string]$Key) {
    Load-NodeEnv $Node
    $out = & (Get-ArkheBin) --status --data (Resolve-ArkhePath $env:ARKHE_DATA) --genesis (Resolve-ArkhePath $env:ARKHE_GENESIS)
    $match = $out | Select-String "^$Key "
    if (-not $match) { throw "status missing $Key for $Node" }
    $match.ToString().Split(' ')[1]
}

function Fail([string]$Msg) {
    Write-Host "FAIL: $Msg" -ForegroundColor Red
    foreach ($Node in $Nodes) {
        try {
            Write-Host "--- ${Node}: height=$(Field $Node height) committed=$(Field $Node committed) tip=$(Field $Node tip) mempool=$(Field $Node mempool)"
        } catch {}
        $log = Join-Path $Local "$Node.log"
        if (Test-Path $log) { Get-Content $log -Tail 8 }
    }
    & (Join-Path $Here "stop-background.ps1") -ErrorAction SilentlyContinue
    exit 1
}

function Agree-At([int]$Want) {
    for ($i = 0; $i -lt 90; $i++) {
        $ok = $true
        $first = $null
        foreach ($Node in $Nodes) {
            try {
                $h = Field $Node "height"
                $c = Field $Node "committed"
                $t = Field $Node "tip"
            } catch {
                $ok = $false
                break
            }
            if ($h -ne "$Want" -or $c -ne "$Want") { $ok = $false; break }
            if ($null -eq $first) { $first = $t }
            elseif ($t -ne $first) { $ok = $false; break }
        }
        if ($ok) {
            Write-Host "ok: four nodes at height $Want, committed $Want, tip $first"
            return
        }
        Start-Sleep -Seconds 1
    }
    Fail "nodes did not agree at height $Want"
}

function Inbox-Line([string]$Pattern) {
    $log = Join-Path $Local "node1.log"
    for ($i = 0; $i -lt 60; $i++) {
        if ((Test-Path $log) -and (Select-String -Path $log -Pattern $Pattern -Quiet)) { return }
        Start-Sleep -Seconds 1
    }
    Fail "node1 never logged: $Pattern"
}

function Start-Named([string]$Node) {
    Load-NodeEnv $Node
    $Data = Resolve-ArkhePath $env:ARKHE_DATA
    $Stale = Join-Path (Split-Path $Data) ((Split-Path $Data -Leaf) + ".arkhe-tmp")
    # Force-kill mid-write leaves .arkhe-tmp; refuse to open until removed (same as start-node).
    if (Test-Path $Stale) { Remove-Item -Force $Stale }
    $Args = @(
        "--data", $Data,
        "--id", $env:ARKHE_ID,
        "--key", (Resolve-ArkhePath $env:ARKHE_KEY),
        "--genesis", (Resolve-ArkhePath $env:ARKHE_GENESIS),
        "--listen", $env:ARKHE_LISTEN,
        "--peer-file", (Resolve-ArkhePath $env:ARKHE_PEER_FILE),
        "--announce", (Resolve-ArkhePath $env:ARKHE_ANNOUNCE)
    )
    $log = Join-Path $Local "$Node.log"
    $errLog = Join-Path $Local "$Node.err.log"
    if (Test-Path $errLog) { Remove-Item -Force $errLog }
    # Redirect truncates the log; restart only needs a fresh listen line.
    $proc = Start-Process -FilePath (Get-ArkheBin) -ArgumentList $Args -RedirectStandardOutput $log -RedirectStandardError $errLog -PassThru -WindowStyle Hidden
    # Wait for listen (or BUSY/death): 500ms is too short after Force-kill (lock/port).
    for ($w = 0; $w -lt 40; $w++) {
        Start-Sleep -Milliseconds 250
        if (-not (Get-Process -Id $proc.Id -ErrorAction SilentlyContinue)) {
            return $false
        }
        if ((Test-Path $errLog) -and (Select-String -Path $errLog -Pattern 'BUSY|MALFORMED|FAIL_CLOSED|Snapshot' -Quiet)) {
            Stop-Process -Id $proc.Id -Force -ErrorAction SilentlyContinue
            return $false
        }
        if ((Test-Path $log) -and (Select-String -Path $log -Pattern '^listen ' -Quiet)) {
            Add-Content -Path $PidFile -Value $proc.Id -Encoding ascii
            return $true
        }
    }
    Stop-Process -Id $proc.Id -Force -ErrorAction SilentlyContinue
    return $false
}

Set-Location $Root
Write-Host "=== stop any prior background ==="
& (Join-Path $Here "stop-background.ps1") -ErrorAction SilentlyContinue

if (-not (Test-Path (Join-Path $Local "peers.txt")) -or
    -not (Select-String -Path (Join-Path $Local "peers.txt") -Pattern '^/ip4/' -Quiet)) {
    Write-Host "=== init-local ==="
    & (Join-Path $Here "init-local.ps1")
}

foreach ($Name in $Nodes) {
    $Data = Join-Path $Local "data\$Name"
    if (Test-Path $Data) { Remove-Item -Recurse -Force $Data }
    $log = Join-Path $Local "$Name.log"
    if (Test-Path $log) { Remove-Item -Force $log }
}
Get-ChildItem (Join-Path $Local "inbox") -ErrorAction SilentlyContinue |
    Where-Object { $_.Name -match '\.(txs|ops)(\.|$)' } |
    Remove-Item -Force

Write-Host "=== run-background ==="
& (Join-Path $Here "run-background.ps1")
Start-Sleep -Seconds 3

Write-Host "== 1. transfer"
& (Join-Path $Here "faucet-tx.ps1") -Nonce 0 -Recipient alice -Value 25
Agree-At 1

Write-Host "== 2. attestation flow (4 ops, sem Executor)"
& (Join-Path $Here "send-attest.ps1") -Run 1
Inbox-Line 'flow-1\.ops ingested 4'
Agree-At 2

Write-Host "== 3. the same flow again is a replay"
& (Join-Path $Here "send-attest.ps1") -Run 1
Inbox-Line 'flow-1\.ops rejected FAIL_CLOSED: ATTEST: replay'
Start-Sleep -Seconds 3
if ((Field "node1" "height") -ne "2") { Fail "a replayed flow sealed a block" }
Write-Host "ok: replay refused, height still 2"

Write-Host "== 4. node3 stopped: no progress"
# PID order in run-background: node2, node3, observer, node1 (no blank lines).
$pids = @(Get-Content $PidFile | Where-Object { $_ -match '^\d+$' })
if ($pids.Count -lt 4) { Fail "expected 4 pids, got $($pids.Count)" }
$node3Pid = [int]$pids[1]
Stop-Process -Id $node3Pid -Force -ErrorAction SilentlyContinue
Start-Sleep -Seconds 1
if (Get-Process -Id $node3Pid -ErrorAction SilentlyContinue) {
    Fail "node3 pid $node3Pid still running after Stop-Process"
}
# ascii: Set-Content default (UTF-16) can confuse later PID parses.
@($pids[0], $pids[2], $pids[3]) | Set-Content -Path $PidFile -Encoding ascii
Start-Sleep -Seconds 2
& (Join-Path $Here "faucet-tx.ps1") -Nonce 1 -Recipient bob -Value 3
Inbox-Line '\.txs ingested 1'
Start-Sleep -Seconds 6
if ((Field "node1" "height") -ne "2") { Fail "node1 sealed while node3 was down" }
if ((Field "node1" "mempool") -ne "1") { Fail "the transfer is not waiting in node1's mempool" }
Write-Host "ok: height still 2, one transfer waiting"

Write-Host "== 5. node3 back: the waiting transfer is sealed"
$started = $false
for ($i = 0; $i -lt 40; $i++) {
    if (Start-Named "node3") {
        $started = $true
        break
    }
    Start-Sleep -Milliseconds 500
}
if (-not $started) { Fail "node3 did not start after kill" }
Agree-At 3

Write-Host "== 6. full stop and start"
& (Join-Path $Here "stop-background.ps1")
Start-Sleep -Seconds 1
& (Join-Path $Here "run-background.ps1")
Start-Sleep -Seconds 5
Agree-At 3
& (Join-Path $Here "faucet-tx.ps1") -Nonce 2 -Recipient carol -Value 1
Agree-At 4

& (Join-Path $Here "stop-background.ps1")
Write-Host "PASS: local smoke (transfer, attest, replay, halt, catch-up, restart). Not homologation."
