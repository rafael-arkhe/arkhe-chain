$ErrorActionPreference = 'Stop'
$taskRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../..'))
$taskCli = Join-Path $PSScriptRoot 'src/cli.mjs'
$taskRun = Join-Path $PSScriptRoot 'run.ps1'
$taskSupervisor = Join-Path $PSScriptRoot 'supervise.ps1'
Stop-ScheduledTask -TaskName 'Arkhe-NEAR-Agent-Market' -ErrorAction SilentlyContinue
# Task Scheduler can leave detached descendants alive. Stop only processes with
# these exact authored entrypoints, never unrelated Node or PowerShell work.
$taskShellPattern = '-File\s+"?(?:' + [regex]::Escape($taskRun) + '|' + [regex]::Escape($taskSupervisor) + ')"?(?:\s|$)'
$taskNodePattern = '(?:^|\s)"?' + [regex]::Escape($taskCli) + '"?(?:\s|$)'
$taskProcesses = Get-CimInstance Win32_Process | Where-Object {
  $_.ProcessId -ne $PID -and (
    ($_.Name -eq 'powershell.exe' -and $_.CommandLine -match $taskShellPattern) -or
    ($_.Name -eq 'node.exe' -and $_.CommandLine -match $taskNodePattern)
  )
}
foreach ($taskProcess in $taskProcesses) {
  Stop-Process -Id $taskProcess.ProcessId -ErrorAction SilentlyContinue
}
Write-Output ('Stopped Arkhe marketplace worker entrypoints: ' + @($taskProcesses).Count)
