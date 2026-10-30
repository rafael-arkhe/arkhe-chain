param([switch]$NoStart)
$ErrorActionPreference = 'Stop'
$taskRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../..'))
$taskData = Join-Path $taskRoot 'ops/local/near-agent-market'
New-Item -ItemType Directory -Force $taskData | Out-Null
if (-not (Test-Path -LiteralPath (Join-Path $taskData 'agent-token.xml'))) { throw 'Configure the encrypted agent token first; see README.' }
@{ nodePath = (Get-Command node -ErrorAction Stop).Source } | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $taskData 'host.json')
$taskShell = Join-Path $env:SystemRoot 'System32/WindowsPowerShell/v1.0/powershell.exe'
$taskLauncher = Join-Path $PSScriptRoot 'supervise.ps1'
$taskArgs = '-NoProfile -NonInteractive -WindowStyle Hidden -ExecutionPolicy Bypass -File "' + $taskLauncher + '"'
$taskAction = New-ScheduledTaskAction -Execute $taskShell -Argument $taskArgs -WorkingDirectory $taskRoot
$taskUser = [System.Security.Principal.WindowsIdentity]::GetCurrent().Name
$taskTrigger = New-ScheduledTaskTrigger -AtLogOn -User $taskUser
$taskPrincipal = New-ScheduledTaskPrincipal -UserId $taskUser -LogonType Interactive -RunLevel Limited
$taskSettings = New-ScheduledTaskSettingsSet -ExecutionTimeLimit ([TimeSpan]::Zero) -MultipleInstances IgnoreNew -StartWhenAvailable -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries
Register-ScheduledTask -TaskName 'Arkhe-NEAR-Agent-Market' -Action $taskAction -Trigger $taskTrigger -Principal $taskPrincipal -Settings $taskSettings -Description 'Arkhe verification worker: polls NEAR Agent Market direct hires.' -Force | Out-Null
if (-not $NoStart) { Start-ScheduledTask -TaskName 'Arkhe-NEAR-Agent-Market' }
Write-Output 'Installed Arkhe-NEAR-Agent-Market (current user, starts at logon).'
