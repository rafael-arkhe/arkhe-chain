$ErrorActionPreference = 'Stop'
$taskRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../..'))
$taskData = Join-Path $taskRoot 'ops/local/near-agent-market'
$taskShell = Join-Path $env:SystemRoot 'System32/WindowsPowerShell/v1.0/powershell.exe'
$taskRun = Join-Path $PSScriptRoot 'run.ps1'
do {
  $taskProcess = Start-Process -FilePath $taskShell -ArgumentList @('-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', ('"' + $taskRun + '"'), '-Once') -WindowStyle Hidden -WorkingDirectory $taskRoot -RedirectStandardOutput (Join-Path $taskData 'stdout.log') -RedirectStandardError (Join-Path $taskData 'stderr.log') -Wait -PassThru
  if ($taskProcess.ExitCode -eq 78) { exit 78 }
  Start-Sleep -Seconds 60
} while ($true)
