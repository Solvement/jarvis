$ErrorActionPreference = 'Stop'
$taskRoot = Split-Path -Parent $PSScriptRoot
$taskPidFile = Join-Path $taskRoot '.local/server.pid'
if (-not (Test-Path -LiteralPath $taskPidFile)) { Write-Output '没有后台启动记录。终端启动的实例请用 Ctrl+C 停止。'; exit }
$taskPid = [int](Get-Content -LiteralPath $taskPidFile)
$taskProcess = Get-CimInstance Win32_Process -Filter "ProcessId = $taskPid"
$taskExpected = Join-Path $taskRoot 'src/main.js'
if ($taskProcess -and $taskProcess.CommandLine -like "*$taskExpected*") {
  $taskPairing = Get-Content -LiteralPath (Join-Path $taskRoot '.local/pairing.json') -Raw | ConvertFrom-Json
  $taskPort = 4399
  $taskEnvFile = Join-Path $taskRoot '.env'
  if (Test-Path -LiteralPath $taskEnvFile) {
    $taskPortLine = Get-Content -LiteralPath $taskEnvFile | Where-Object { $_ -match '^PORT=\d+$' } | Select-Object -Last 1
    if ($taskPortLine) { $taskPort = [int]($taskPortLine.Split('=')[1]) }
  }
  try {
    Invoke-RestMethod -Uri "http://127.0.0.1:$taskPort/api/shutdown" -Method Post -Headers @{ Authorization = ('Bearer ' + $taskPairing.token) } | Out-Null
    Write-Output '已请求服务正常退出并关闭 Codex 与飞书连接。'
  } catch { throw '服务没有响应退出请求。未强制终止进程；请在原终端按 Ctrl+C。' }
} elseif ($taskProcess) { throw 'PID 已被其他进程使用，没有停止它。' }
