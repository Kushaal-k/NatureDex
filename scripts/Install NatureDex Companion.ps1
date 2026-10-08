param([switch]$Remove)
$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$startupFolder = [Environment]::GetFolderPath('Startup')
$shortcutPath = Join-Path $startupFolder 'NatureDex Companion.lnk'
if ($Remove) {
    if (Test-Path -LiteralPath $shortcutPath) { Remove-Item -LiteralPath $shortcutPath }
    Write-Output 'NatureDex automatic startup removed. The running companion is unaffected.'
    exit
}
$pythonPath = Join-Path $projectRoot '.venv\Scripts\pythonw.exe'
$configPath = Join-Path $projectRoot '.mobile\companion.json'
if (-not (Test-Path -LiteralPath $pythonPath) -or -not (Test-Path -LiteralPath $configPath)) { throw 'Configure the companion and install the Python environment first. See docs/direct-sync.md.' }
$shellObject = New-Object -ComObject WScript.Shell
$shortcut = $shellObject.CreateShortcut($shortcutPath)
$shortcut.TargetPath = $pythonPath
$shortcut.Arguments = '"' + (Join-Path $projectRoot 'scripts\companion.py') + '"'
$shortcut.WorkingDirectory = $projectRoot
$shortcut.WindowStyle = 7
$shortcut.Description = 'NatureDex local identification companion'
$shortcut.Save()
Write-Output 'NatureDex will start quietly when you sign in to Windows.'
Start-Process -FilePath $pythonPath -ArgumentList $shortcut.Arguments -WorkingDirectory $projectRoot -WindowStyle Hidden
