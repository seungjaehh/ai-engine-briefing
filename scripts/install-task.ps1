param([int]$IntervalMinutes = 30)
$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$nodePath = (Get-Command node -ErrorAction Stop).Source
$taskName = 'AI Engine Briefing'
$userId = [System.Security.Principal.WindowsIdentity]::GetCurrent().Name
$launcher = Join-Path $projectRoot '.local\run-hidden.ps1'
$nodeLiteral = $nodePath.Replace("'", "''")
$rootLiteral = $projectRoot.Replace("'", "''")
$body = "`$ErrorActionPreference = 'Stop'`nSet-Location -LiteralPath '$rootLiteral'`n& '$nodeLiteral' 'scripts/publish.mjs'`nexit `$LASTEXITCODE`n"
New-Item -ItemType Directory -Force -Path (Split-Path $launcher) | Out-Null
[System.IO.File]::WriteAllText($launcher, $body, (New-Object System.Text.UTF8Encoding($true)))
$action = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument ('-NoProfile -NonInteractive -WindowStyle Hidden -ExecutionPolicy Bypass -File "' + $launcher + '"') -WorkingDirectory $projectRoot
$repeat = New-ScheduledTaskTrigger -Once -At (Get-Date).AddMinutes(1) -RepetitionInterval (New-TimeSpan -Minutes $IntervalMinutes)
$logon = New-ScheduledTaskTrigger -AtLogOn -User $userId
$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -MultipleInstances IgnoreNew -ExecutionTimeLimit (New-TimeSpan -Minutes 10) -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries
$principal = New-ScheduledTaskPrincipal -UserId $userId -LogonType Interactive -RunLevel Limited
$task = New-ScheduledTask -Action $action -Trigger @($repeat,$logon) -Settings $settings -Principal $principal -Description 'Collect read-only engine progress and publish summary to the separate GitHub Pages repository.'
Register-ScheduledTask -TaskName $taskName -InputObject $task -Force | Select-Object TaskName,State
$configPath = Join-Path $projectRoot '.local\config.json'
$config = Get-Content -LiteralPath $configPath -Raw | ConvertFrom-Json
$config.intervalMinutes = $IntervalMinutes
[System.IO.File]::WriteAllText($configPath, ($config | ConvertTo-Json), (New-Object System.Text.UTF8Encoding($false)))
Write-Output "Installed: $taskName (every $IntervalMinutes minutes, while this user is logged in)."
