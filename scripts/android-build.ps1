param(
    [string[]]$Targets = @("aarch64", "x86_64")
)

$ErrorActionPreference = "Stop"

$RepoRoot = Split-Path -Parent $PSScriptRoot
Push-Location $RepoRoot

try {
    # 1. Configure deterministic Android / JDK 17 / Rust environment for this process
    $Jdk17Path = "C:\Users\AIML\AppData\Local\jdk-17"
    if (Test-Path $Jdk17Path) {
        $env:JAVA_HOME = $Jdk17Path
    } elseif (-not $env:JAVA_HOME) {
        throw "JAVA_HOME is not set and JDK 17 was not found at $Jdk17Path"
    }

    if (-not $env:ANDROID_HOME) {
        $DefaultSdk = Join-Path $env:LOCALAPPDATA "Android\Sdk"
        if (Test-Path $DefaultSdk) {
            $env:ANDROID_HOME = $DefaultSdk
        } else {
            throw "ANDROID_HOME is not set and Android SDK was not found at $DefaultSdk"
        }
    }

    if (-not $env:NDK_HOME) {
        $PreferredNdk = Join-Path $env:ANDROID_HOME "ndk\26.3.11579264"
        if (Test-Path $PreferredNdk) {
            $env:NDK_HOME = $PreferredNdk
        } else {
            $NdkRoot = Join-Path $env:ANDROID_HOME "ndk"
            $LatestNdk = Get-ChildItem $NdkRoot -Directory -ErrorAction SilentlyContinue | Sort-Object Name -Descending | Select-Object -First 1
            if ($LatestNdk) {
                $env:NDK_HOME = $LatestNdk.FullName
            } else {
                throw "NDK_HOME is not set and no NDK was found under $NdkRoot"
            }
        }
    }

    $CargoBin = Join-Path $env:USERPROFILE ".cargo\bin"
    $env:PATH = "$CargoBin;$env:JAVA_HOME\bin;$env:ANDROID_HOME\cmdline-tools\latest\bin;$env:ANDROID_HOME\platform-tools;$env:ANDROID_HOME\emulator;$env:PATH"

    Write-Host "=== Android Build Environment ==="
    Write-Host "JAVA_HOME    : $env:JAVA_HOME"
    Write-Host "ANDROID_HOME : $env:ANDROID_HOME"
    Write-Host "NDK_HOME     : $env:NDK_HOME"
    Write-Host "Targets      : $($Targets -join ', ')"

    $TargetMap = @{
        "aarch64" = @{ RustTriple = "aarch64-linux-android"; Abi = "arm64-v8a" }
        "x86_64"  = @{ RustTriple = "x86_64-linux-android";  Abi = "x86_64" }
        "armv7"   = @{ RustTriple = "armv7-linux-androideabi"; Abi = "armeabi-v7a" }
        "i686"    = @{ RustTriple = "i686-linux-android";    Abi = "x86" }
    }

    $JniLibsRoot = Join-Path $RepoRoot "src-tauri\gen\android\app\src\main\jniLibs"
    New-Item -ItemType Directory -Force -Path $JniLibsRoot | Out-Null

    # 2. Build Rust shared libraries via Tauri Android CLI (also builds Vite dist/ and updates tauri.properties)
    foreach ($Target in $Targets) {
        if (-not $TargetMap.ContainsKey($Target)) {
            throw "Unsupported Android target '$Target'. Supported: $($TargetMap.Keys -join ', ')"
        }
        $Info = $TargetMap[$Target]
        $SoSrc = Join-Path $RepoRoot "src-tauri\target\$($Info.RustTriple)\debug\libkiosk_video_player_lib.so"
        $JniDir = Join-Path $JniLibsRoot $Info.Abi
        $SoDst = Join-Path $JniDir "libkiosk_video_player_lib.so"

        if (Test-Path $SoSrc) {
            Remove-Item -Force $SoSrc
        }

        Write-Host "`n=== Building Rust target '$Target' ($($Info.RustTriple)) ==="
        $prevEAP = $ErrorActionPreference
        $ErrorActionPreference = "Continue"
        $BuildOutput = @()
        & npx.cmd tauri android build --debug --target $Target 2>&1 | Tee-Object -Variable BuildOutput | ForEach-Object { Write-Host $_ }
        $ExitCode = $LASTEXITCODE
        $ErrorActionPreference = $prevEAP

        $JoinedOutput = ($BuildOutput | Out-String)
        $IsSymlinkOnlyFailure = ($ExitCode -ne 0) -and ($JoinedOutput -match "Failed to create a symbolic link") -and (Test-Path $SoSrc)

        if ($ExitCode -ne 0 -and -not $IsSymlinkOnlyFailure) {
            throw "tauri android build failed for target '$Target' (exit code $ExitCode)"
        }

        if (-not (Test-Path $SoSrc)) {
            throw "Expected compiled shared library not found at $SoSrc"
        }

        # 3. Copy (not symlink) .so into jniLibs/<abi>/ so builds work without Windows Developer Mode
        New-Item -ItemType Directory -Force -Path $JniDir | Out-Null
        if (Test-Path $SoDst) {
            Remove-Item -Force $SoDst
        }
        Copy-Item -Force $SoSrc $SoDst
        Write-Host "Copied $SoSrc -> $SoDst"
    }

    # 4. Assemble Universal Debug APK via Gradle (skipping redundant rustBuild* tasks)
    $AndroidGenDir = Join-Path $RepoRoot "src-tauri\gen\android"
    Push-Location $AndroidGenDir
    try {
        Write-Host "`n=== Running Gradle assembleUniversalDebug ==="
        $prevEAP = $ErrorActionPreference
        $ErrorActionPreference = "Continue"
        & .\gradlew.bat assembleUniversalDebug -x rustBuildArm64Debug -x rustBuildX86_64Debug -x rustBuildArmDebug -x rustBuildX86Debug
        $GradleExit = $LASTEXITCODE
        $ErrorActionPreference = $prevEAP
        if ($GradleExit -ne 0) {
            throw "Gradle assembleUniversalDebug failed (exit code $GradleExit)"
        }
    } finally {
        Pop-Location
    }

    $ApkPath = Join-Path $RepoRoot "src-tauri\gen\android\app\build\outputs\apk\universal\debug\app-universal-debug.apk"
    if (-not (Test-Path $ApkPath)) {
        throw "Expected APK not found at $ApkPath"
    }

    $ApkInfo = Get-Item $ApkPath
    $SizeMB = [Math]::Round($ApkInfo.Length / 1MB, 2)
    Write-Host "`n=== Android Debug Build Succeeded ==="
    Write-Host "APK Path : $($ApkInfo.FullName)"
    Write-Host "APK Size : $($ApkInfo.Length) bytes ($SizeMB MB)"
    Write-Host "ABIs     : $(($Targets | ForEach-Object { $TargetMap[$_].Abi }) -join ', ')"
} finally {
    Pop-Location
}
