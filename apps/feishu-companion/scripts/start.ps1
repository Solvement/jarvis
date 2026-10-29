$ErrorActionPreference = 'Stop'
$taskRoot = Split-Path -Parent $PSScriptRoot
$taskLocal = Join-Path $taskRoot '.local'
New-Item -ItemType Directory -Path $taskLocal -Force | Out-Null
$taskNode = (Get-Command node).Source
$taskMain = Join-Path $taskRoot 'src/main.js'
$taskProcess = Start-Process -FilePath $taskNode -ArgumentList @('--env-file-if-exists=.env', ('"{0}"' -f $taskMain)) -WorkingDirectory $taskRoot -WindowStyle Hidden -RedirectStandardOutput (Join-Path $taskLocal 'server.log') -RedirectStandardError (Join-Path $taskLocal 'server-error.log') -PassThru
Set-Content -LiteralPath (Join-Path $taskLocal 'server.pid') -Value $taskProcess.Id
Write-Output '本机助手正在后台启动。打开 .local/connect.html；日志位于 .local。'
