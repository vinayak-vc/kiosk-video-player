$installer = "C:\React\kiosk-video-player\windows-out\kiosk-video-player-v1.0.1-x64-setup.exe"
Write-Host "Running silent install..."
$p = Start-Process -FilePath $installer -ArgumentList "/S" -Wait -PassThru
Write-Host "Install exited with code: $($p.ExitCode)"

$possiblePaths = @(
  "$env:LOCALAPPDATA\Programs\Kiosk Video Player",
  "$env:ProgramFiles\Kiosk Video Player",
  "${env:ProgramFiles(x86)}\Kiosk Video Player"
)
$installedDir = $null
foreach ($path in $possiblePaths) {
  if (Test-Path $path) {
    Write-Host "Found installed folder: $path"
    $installedDir = $path
    Get-ChildItem -Path $path | Select-Object Name, Length, LastWriteTime
  }
}
