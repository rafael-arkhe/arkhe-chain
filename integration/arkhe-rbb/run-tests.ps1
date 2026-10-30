param(
    [string]$Python = 'python',
    [switch]$InstallNodeDependencies
)
$ErrorActionPreference = 'Stop'
$taskDirectory = $PSScriptRoot
$taskWorkspace = [IO.Path]::GetFullPath((Join-Path $taskDirectory '..\..'))
$reportDirectory = Join-Path $taskWorkspace 'output\arkhe-rbb-execution'
New-Item -ItemType Directory -Path $reportDirectory -Force | Out-Null
$stages = [Collections.Generic.List[object]]::new()

function Invoke-Stage {
    param([string]$Name, [string]$Program, [string[]]$CommandArguments, [string]$Directory)
    Push-Location -LiteralPath $Directory
    try {
        $started = [DateTimeOffset]::UtcNow
        Write-Host "Running $Name"
        $stageOutput = & $Program @CommandArguments 2>&1 | ForEach-Object { "$_" }
        $stageCode = $LASTEXITCODE
        $stageOutput | Set-Content -LiteralPath (Join-Path $reportDirectory "$Name.log") -Encoding utf8
        $stages.Add([ordered]@{ name=$Name; exit_code=$stageCode; started_utc=$started.ToString('o'); elapsed_seconds=([DateTimeOffset]::UtcNow-$started).TotalSeconds; log="$Name.log" })
        $stageOutput | ForEach-Object { Write-Host $_ }
        if ($stageCode -ne 0) { throw "$Name failed with exit code $stageCode" }
    }
    finally { Pop-Location }
}

$success = $false
try {
    if ($InstallNodeDependencies) {
        Invoke-Stage 'node-install' 'npm.cmd' @('ci','--ignore-scripts','--no-audit','--no-fund') $taskDirectory
    }
    Invoke-Stage 'python-reference' $Python @('integration/arkhe-rbb/python/reference_vectors.py') $taskWorkspace
    Invoke-Stage 'rust-regression' 'cargo' @('test','-p','arkhe-verify-core','--features','rbb-pqc','--locked') $taskWorkspace
    Invoke-Stage 'hybrid-fixture-build' 'cargo' @('build','-p','arkhe-verify-core','--example','rbb_sign_fixture','--features','rbb-pqc','--locked') $taskWorkspace
    Invoke-Stage 'evm-execution' 'npm.cmd' @('test') $taskDirectory
    $success = $true
}
finally {
    [ordered]@{
        completed_utc=[DateTimeOffset]::UtcNow.ToString('o')
        success=$success
        scope='Local protocol, real hybrid crypto, offline attestation verification and compiled EVM anchor execution; no RBB/Fabric production deployment'
        stages=$stages.ToArray()
    } | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath (Join-Path $reportDirectory 'results.json') -Encoding utf8
}
