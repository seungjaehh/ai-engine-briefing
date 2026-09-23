$ErrorActionPreference = 'Stop'
Unregister-ScheduledTask -TaskName 'AI Engine Briefing' -Confirm:$false
Write-Output 'AI Engine Briefing task removed. Project and published page are preserved.'
