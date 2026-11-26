<#
.SYNOPSIS
  Installs the Kiosk Video Player release (or debug) APK to an attached Android TV or device.
.DESCRIPTION
  Performs complete kiosk provisioning:
  1. Resolves adb from Android SDK platform-tools.
  2. Waits for target device / emulator.
  3. Installs the signed release APK with `adb install -r`.
  4. Grants all-files access via `appops set com.viitor.kioskplayer MANAGE_EXTERNAL_STORAGE allow`.
  5. Ensures `/sdcard/Kiosk/Media` exists on external storage.
  6. Optionally pushes sample media pairs from local video folder.
  7. Launches `com.viitor.kioskplayer/.MainActivity`.
  8. Verifies process execution and displays device info.
#>
param(
    [string]$ApkPath,
    [string]$DeviceSerial,
    [switch]$PushSampleMedia,
    [switch]$Debug
)

$ErrorActionPreference = "Stop"

$RepoRoot = Split-Path -Parent $PSScriptRoot

# 1. Locate adb
$AdbExe = $null
$SdkCandidates = @(
    $env:ANDROID_HOME,
    $env:ANDROID_SDK_ROOT,
    (Join-Path $env:LOCALAPPDATA "Android\Sdk"),
    "C:\Android\Sdk"
) | Where-Object { $_ -and (Test-Path $_) }

foreach ($sdk in $SdkCandidates) {
    $candidate = Join-Path $sdk "platform-tools\adb.exe"
    if (Test-Path $candidate) {
        $AdbExe = $candidate
        break
    }
}

if (-not $AdbExe) {
    $pathAdb = Get-Command adb -ErrorAction SilentlyContinue
    if ($pathAdb) {
        $AdbExe = $pathAdb.Source
    } else {
        throw "adb.exe not found in Android SDK platform-tools or system PATH."
    }
}

Write-Host "=== Android Installation Pipeline ==="
Write-Host "adb binary : $AdbExe"

# 2. Resolve APK path
if (-not $ApkPath) {
    $ReleaseApk = Join-Path $RepoRoot "src-tauri\gen\android\app\build\outputs\apk\universal\release\app-universal-release.apk"
    $DebugApk   = Join-Path $RepoRoot "src-tauri\gen\android\app\build\outputs\apk\universal\debug\app-universal-debug.apk"
    
    if (-not $Debug -and (Test-Path $ReleaseApk)) {
        $ApkPath = $ReleaseApk
    } elseif (Test-Path $DebugApk) {
        $ApkPath = $DebugApk
    } elseif (Test-Path $ReleaseApk) {
        $ApkPath = $ReleaseApk
    } else {
        throw "No built APK found. Please run 'npm run android:release' or 'npm run android:build' first."
    }
}

if (-not (Test-Path $ApkPath)) {
    throw "Specified APK file does not exist: $ApkPath"
}

$ApkInfo = Get-Item $ApkPath
$SizeMB = [Math]::Round($ApkInfo.Length / 1MB, 2)
Write-Host "Target APK : $($ApkInfo.FullName) ($SizeMB MB)"

# 3. Wait for device
$adbArgs = @()
if ($DeviceSerial) {
    $adbArgs += @("-s", $DeviceSerial)
}

Write-Host "`nWaiting for device to be online..."
& $AdbExe @adbArgs wait-for-device

$deviceModel = (& $AdbExe @adbArgs shell getprop ro.product.model).Trim()
$deviceApi   = (& $AdbExe @adbArgs shell getprop ro.build.version.release).Trim()
Write-Host "Connected Device: $deviceModel (Android $deviceApi)"

$PackageName = "com.viitor.kioskplayer"

# 4. Install APK
Write-Host "`nInstalling APK via adb install -r..."
$prevEAP = $ErrorActionPreference
$ErrorActionPreference = "Continue"
$installOut = & $AdbExe @adbArgs install -r -d $ApkPath 2>&1 | Out-String
$ErrorActionPreference = $prevEAP
Write-Host $installOut.Trim()

if ($installOut -match "INSTALL_FAILED_UPDATE_INCOMPATIBLE") {
    Write-Host "Detected signature mismatch with previously installed debug build. Uninstalling old package..."
    & $AdbExe @adbArgs uninstall $PackageName | Out-Null
    Write-Host "Retrying clean install of release package..."
    $prevEAP = $ErrorActionPreference
    $ErrorActionPreference = "Continue"
    $installOut = & $AdbExe @adbArgs install -r -d $ApkPath 2>&1 | Out-String
    $ErrorActionPreference = $prevEAP
    Write-Host $installOut.Trim()
}

if ($installOut -notmatch "Success") {
    throw "adb install failed: $installOut"
}

# 5. Grant MANAGE_EXTERNAL_STORAGE permission
Write-Host "`nGranting MANAGE_EXTERNAL_STORAGE permission..."
& $AdbExe @adbArgs shell appops set $PackageName MANAGE_EXTERNAL_STORAGE allow
Write-Host "appops MANAGE_EXTERNAL_STORAGE set to allow."

# 6. Ensure media directory exists
$DeviceMediaDir = "/sdcard/Kiosk/Media"
Write-Host "`nEnsuring $DeviceMediaDir exists..."
& $AdbExe @adbArgs shell mkdir -p $DeviceMediaDir

# 7. Push sample media if requested or if directory is empty
$existingFiles = (& $AdbExe @adbArgs shell ls $DeviceMediaDir 2>&1).Trim()
if ($PushSampleMedia -or [string]::IsNullOrWhiteSpace($existingFiles)) {
    $LocalVideoDir = "C:\React\Videos"
    if (Test-Path $LocalVideoDir) {
        Write-Host "Pushing sample media pairs from $LocalVideoDir to $DeviceMediaDir..."
        $mediaFiles = Get-ChildItem $LocalVideoDir -File | Where-Object { $_.Extension -match '^\.(mp4|png|jpg|jpeg)$' }
        foreach ($file in $mediaFiles) {
            Write-Host "  -> Pushing $($file.Name)..."
            & $AdbExe @adbArgs push $file.FullName "$DeviceMediaDir/$($file.Name)" | Out-Null
        }
        Write-Host "Pushed $($mediaFiles.Count) media files."
    }
}

# 8. Launch Kiosk MainActivity
Write-Host "`nLaunching $PackageName..."
$launchOut = & $AdbExe @adbArgs shell am start -n "$PackageName/.MainActivity" -a android.intent.action.MAIN -c android.intent.category.LAUNCHER 2>&1 | Out-String
Write-Host $launchOut.Trim()

# 9. Verify process status
Start-Sleep -Seconds 2
$pidCheck = (& $AdbExe @adbArgs shell pidof $PackageName 2>&1).Trim()
if ($pidCheck -match '^\d+') {
    Write-Host "`n=== Installation & Launch Verified! ==="
    Write-Host "Status : RUNNING (PID $pidCheck)"
    Write-Host "Package: $PackageName"
} else {
    Write-Warning "App PID not found immediately. Check logcat: adb logcat -d | grep $PackageName"
}
