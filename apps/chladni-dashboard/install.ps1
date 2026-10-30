#Requires -RunAsAdministrator
[CmdletBinding(SupportsShouldProcess=$true)]
param([string]$TaskName, [switch]$CheckOnly)
$ErrorActionPreference='Stop'
$sourceDir=[IO.Path]::GetFullPath($PSScriptRoot)
$baseline=Get-Content -LiteralPath (Join-Path $sourceDir 'deployment/base.json') -Raw | ConvertFrom-Json
$installDir=[IO.Path]::GetFullPath($baseline.install_root)
if($installDir -ne [IO.Path]::GetFullPath('C:/Program Files/ArkheCathedral')){throw 'Unexpected installation target'}
$payload=@{
 'arkhe-runtime.js'='deployment/arkhe-runtime.js';
 'telegraph.js'='deployment/telegraph.js';
 'dashboard-http.cjs'='dashboard-http.cjs';
 'telegraph-security.cjs'='telegraph-security.cjs';
 'dashboard/index.html'='public/index.html';
 'dashboard/dashboard.js'='public/dashboard.js';
 'dashboard/dashboard.css'='public/dashboard.css';
 'dashboard/protocol.js'='public/protocol.js';
 'dashboard/three.min.js'='public/three.min.js'
}
foreach($name in @('arkhe-runtime.js','telegraph.js')){
 $current=(Get-FileHash -LiteralPath (Join-Path $installDir $name) -Algorithm SHA256).Hash.ToLowerInvariant()
 if($current -ne $baseline.sha256.$name){throw "Installed $name changed since review; refusing overwrite"}
}
foreach($relative in $payload.Keys){
 $target=[IO.Path]::GetFullPath((Join-Path $installDir $relative))
 if(-not $target.StartsWith($installDir+[IO.Path]::DirectorySeparatorChar,[StringComparison]::OrdinalIgnoreCase)){throw 'Target leaves installation'}
 if(-not (Test-Path -LiteralPath (Join-Path $sourceDir $payload[$relative]) -PathType Leaf)){throw "Missing reviewed source: $relative"}
}
$tasks=@(Get-ScheduledTask | Where-Object {
 $candidate=$_
 if($TaskName -and $candidate.TaskName -ne $TaskName){return $false}
 foreach($action in $candidate.Actions){
  $arguments=[string]$action.Arguments
  $directory=[string]$action.WorkingDirectory
  if($arguments -match 'arkhe-service\.js' -and (($arguments.IndexOf($installDir,[StringComparison]::OrdinalIgnoreCase) -ge 0) -or $directory.TrimEnd('\') -eq $installDir.TrimEnd('\'))){return $true}
 }
 return $false
})
if($tasks.Count -ne 1){throw 'Cannot uniquely identify the existing Arkhe scheduled task. Supply -TaskName after inspecting its actions; no files changed.'}
$task=$tasks[0]
$runtimeProcesses=@(Get-CimInstance Win32_Process | Where-Object { $_.Name -eq 'node.exe' -and $_.CommandLine -and ($_.CommandLine.IndexOf($installDir,[StringComparison]::OrdinalIgnoreCase) -ge 0) -and $_.CommandLine -match 'arkhe-runtime\.js' })
if($runtimeProcesses.Count -ne 1){throw 'Cannot uniquely identify the installed runtime process; no files changed'}
$runtimeProcess=$runtimeProcesses[0]
$version=& $runtimeProcess.ExecutablePath --version
if([int]($version.TrimStart('v').Split('.')[0]) -lt 18){throw 'The existing service needs Node 18+ for this dashboard. No files changed.'}
Write-Output "Reviewed target: $installDir; scheduled task: $($task.TaskName); runtime PID: $($runtimeProcess.ProcessId); Node $version"
if($CheckOnly){Write-Output 'PASS preflight; no files or tasks changed';return}
if(-not $PSCmdlet.ShouldProcess($installDir,'Back up, install reviewed v27 assets, and restart only the identified Arkhe task')){return}
$backupDir=Join-Path $installDir ('dashboard-backups/'+[DateTime]::UtcNow.ToString('yyyyMMddTHHmmssZ')+'-'+[Guid]::NewGuid().ToString('N').Substring(0,8))
New-Item -ItemType Directory -Path $backupDir | Out-Null
$existing=@()
foreach($relative in $payload.Keys){
 $target=Join-Path $installDir $relative
 if(Test-Path -LiteralPath $target -PathType Leaf){
  $backup=Join-Path $backupDir $relative
  New-Item -ItemType Directory -Path (Split-Path $backup -Parent) -Force | Out-Null
  Copy-Item -LiteralPath $target -Destination $backup
  $existing+=$relative
 }
}
try{
 Stop-ScheduledTask -TaskName $task.TaskName -TaskPath $task.TaskPath
 $process=Get-CimInstance Win32_Process -Filter "ProcessId=$($runtimeProcess.ProcessId)"
 if($process -and $process.CommandLine -and ($process.CommandLine.IndexOf($installDir,[StringComparison]::OrdinalIgnoreCase) -ge 0) -and $process.CommandLine -match 'arkhe-runtime\.js'){Stop-Process -Id $process.ProcessId -Force}
 foreach($relative in $payload.Keys){
  $target=Join-Path $installDir $relative
  New-Item -ItemType Directory -Path (Split-Path $target -Parent) -Force | Out-Null
  Copy-Item -LiteralPath (Join-Path $sourceDir $payload[$relative]) -Destination $target -Force
 }
 Start-ScheduledTask -TaskName $task.TaskName -TaskPath $task.TaskPath
 $healthy=$false
 for($attempt=0;$attempt -lt 45;$attempt++){
  try{$health=Invoke-RestMethod -Uri 'http://127.0.0.1:7473/health' -TimeoutSec 2;if($health.version -eq '27.0' -and $health.authority -eq 'none'){$healthy=$true;break}}catch{}
  Start-Sleep -Seconds 1
 }
 if(-not $healthy){throw 'Updated dashboard did not become healthy'}
 $listeners=@(Get-NetTCPConnection -State Listen | Where-Object LocalPort -in 7473,7474)
 if(@($listeners | Where-Object LocalAddress -ne '127.0.0.1').Count -gt 0){throw 'Installed listener is not loopback-only'}
 if(@($listeners | Select-Object -ExpandProperty LocalPort -Unique).Count -ne 2){throw 'Expected both installed listeners'}
 foreach($relative in $payload.Keys){
  $expected=(Get-FileHash -LiteralPath (Join-Path $sourceDir $payload[$relative]) -Algorithm SHA256).Hash
  $actual=(Get-FileHash -LiteralPath (Join-Path $installDir $relative) -Algorithm SHA256).Hash
  if($expected -ne $actual){throw "Installed hash mismatch: $relative"}
 }
 Write-Output "PASS installed v27; HTTP/WS loopback only; backup: $backupDir"
 Write-Output 'Kernel health uses the user-owned read-only observer on port 7475. No kernel credential is copied into the legacy service.'
}catch{
 $failure=$_
 Stop-ScheduledTask -TaskName $task.TaskName -TaskPath $task.TaskPath -ErrorAction SilentlyContinue
 Get-CimInstance Win32_Process | Where-Object { $_.Name -eq 'node.exe' -and $_.CommandLine -and ($_.CommandLine.IndexOf($installDir,[StringComparison]::OrdinalIgnoreCase) -ge 0) -and $_.CommandLine -match 'arkhe-runtime\.js' } | ForEach-Object {Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue}
 foreach($relative in $existing){Copy-Item -LiteralPath (Join-Path $backupDir $relative) -Destination (Join-Path $installDir $relative) -Force}
 Start-ScheduledTask -TaskName $task.TaskName -TaskPath $task.TaskPath
 throw $failure
}
