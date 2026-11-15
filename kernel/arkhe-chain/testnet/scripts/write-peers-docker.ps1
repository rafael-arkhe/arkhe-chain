# Copia local/peers.txt para local/peers.docker.txt trocando 127.0.0.1
# pelo hostname do serviço compose (node1…observer) conforme a porta.
$ErrorActionPreference = "Stop"
$Local = Resolve-Path (Join-Path $PSScriptRoot "..\local")
$Src = Join-Path $Local "peers.txt"
$Dst = Join-Path $Local "peers.docker.txt"
if (-not (Test-Path $Src)) { throw "missing $Src — collect-peers first" }

$map = @{
    "19001" = "node1"
    "19002" = "node2"
    "19003" = "node3"
    "19004" = "observer"
}
$out = @()
Get-Content $Src | ForEach-Object {
    $line = $_
    if ($line -match '/ip4/127\.0\.0\.1/tcp/(\d+)/') {
        $port = $Matches[1]
        if ($map.ContainsKey($port)) {
            $line = $line -replace '/ip4/127\.0\.0\.1/', "/ip4/$($map[$port])/"
        }
    }
    $out += $line
}
$out | Set-Content -Path $Dst -Encoding utf8
Write-Host "peers.docker=$Dst"
Get-Content $Dst
