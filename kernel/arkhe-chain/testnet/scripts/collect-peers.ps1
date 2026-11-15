$ErrorActionPreference = "Stop"
$Net = Resolve-Path (Join-Path $PSScriptRoot "..")
$Local = Join-Path $Net "local"
$Announce = Join-Path $Local "announce"
$Genesis = Join-Path $Local "genesis.txt"
$Out = Join-Path $Local "peers.txt"
if (-not (Test-Path $Genesis)) {
    throw "missing $Genesis — run gen-keys first"
}
$Root = Resolve-Path (Join-Path $PSScriptRoot "..\..\..\..")
$Show = & cargo run -q -p arkhe-chain --manifest-path (Join-Path $Root "Cargo.toml") -- --show-genesis --genesis $Genesis
$Blake = ($Show | Select-String '^blake3 ').ToString().Split(' ')[1]
$Lines = @("# genesis $Blake")
Get-ChildItem $Announce -Filter "*.peer" -ErrorAction SilentlyContinue | ForEach-Object {
    Get-Content $_.FullName | ForEach-Object {
        $line = $_.Trim()
        if ($line -and -not $line.StartsWith("#")) {
            $Lines += $line
        }
    }
}
# utf8NoBOM: a leading BOM makes `# genesis …` fail as a peer multiaddr.
$utf8 = New-Object System.Text.UTF8Encoding $false
[System.IO.File]::WriteAllLines($Out, $Lines, $utf8)
Write-Host "peers=$Out"
Get-Content $Out
