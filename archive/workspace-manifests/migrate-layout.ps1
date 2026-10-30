$ErrorActionPreference = 'Stop'
$architectureRoot = (Get-Location).ProviderPath.TrimEnd('\')
$architecturePrefix = $architectureRoot + '\'
$architecturePlan = Get-Content -LiteralPath '.architecture-move-plan.json' -Raw | ConvertFrom-Json
function Resolve-WorkspacePath([string]$relative) {
    $resolvedPath = [IO.Path]::GetFullPath((Join-Path $architectureRoot $relative))
    if (-not $resolvedPath.StartsWith($architecturePrefix, [StringComparison]::OrdinalIgnoreCase)) { throw 'Path leaves intended workspace' }
    return $resolvedPath
}
foreach ($entry in $architecturePlan.moves) {
    $sourcePath = Resolve-WorkspacePath $entry.from
    $destinationPath = Resolve-WorkspacePath $entry.to
    if (-not (Test-Path -LiteralPath $sourcePath)) { throw "Missing source: $($entry.from)" }
    if (Test-Path -LiteralPath $destinationPath) { throw "Destination exists: $($entry.to)" }
}
New-Item -ItemType Directory -Path (Resolve-WorkspacePath 'archive/workspace-manifests') -Force | Out-Null
Copy-Item -LiteralPath (Resolve-WorkspacePath 'arkhe_agi_environment/Cargo.toml') -Destination (Resolve-WorkspacePath 'archive/workspace-manifests/environment.Cargo.toml')
Copy-Item -LiteralPath (Resolve-WorkspacePath 'arkhe_agi_environment/Cargo.lock') -Destination (Resolve-WorkspacePath 'archive/workspace-manifests/environment.Cargo.lock')
foreach ($entry in $architecturePlan.moves) {
    $sourcePath = Resolve-WorkspacePath $entry.from
    $destinationPath = Resolve-WorkspacePath $entry.to
    New-Item -ItemType Directory -Path (Split-Path -Parent $destinationPath) -Force | Out-Null
    Move-Item -LiteralPath $sourcePath -Destination $destinationPath
}
New-Item -ItemType Directory -Path (Resolve-WorkspacePath 'docs/architecture') -Force | Out-Null
Move-Item -LiteralPath (Resolve-WorkspacePath '.architecture-move-plan.json') -Destination (Resolve-WorkspacePath 'docs/architecture/moves.json')
Write-Output "Moved $($architecturePlan.moves.Count) entries inside the verified workspace."
