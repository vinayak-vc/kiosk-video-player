# Generates the release signing keystore and properties file outside the repository
# Location: %USERPROFILE%\.android\kiosk-release.keystore and kiosk-keystore.properties
$androidDir = Join-Path $env:USERPROFILE '.android'
$keystorePath = Join-Path $androidDir 'kiosk-release.keystore'
$propsPath = Join-Path $androidDir 'kiosk-keystore.properties'

# Dynamic JDK lookup chain (no hardcoded user paths)
$keytool = $null
$candidates = @()
if ($env:JAVA_HOME) { $candidates += $env:JAVA_HOME }
if ($env:LOCALAPPDATA) { $candidates += (Join-Path $env:LOCALAPPDATA 'jdk-17') }
$candidates += @(
    (Get-ChildItem 'C:\Program Files\Microsoft\jdk-17*' -Directory -ErrorAction SilentlyContinue | Sort-Object Name -Descending | Select-Object -ExpandProperty FullName),
    (Get-ChildItem 'C:\Program Files\Eclipse Adoptium\jdk-17*' -Directory -ErrorAction SilentlyContinue | Sort-Object Name -Descending | Select-Object -ExpandProperty FullName),
    (Get-ChildItem 'C:\Program Files\Java\jdk-17*' -Directory -ErrorAction SilentlyContinue | Sort-Object Name -Descending | Select-Object -ExpandProperty FullName)
) | Where-Object { $_ }

foreach ($dir in $candidates) {
    $exe = Join-Path $dir 'bin\keytool.exe'
    if (Test-Path $exe) {
        $keytool = $exe
        break
    }
}
if (-not $keytool) {
    $pathCmd = Get-Command keytool -ErrorAction SilentlyContinue
    if ($pathCmd) { $keytool = $pathCmd.Source }
}
if (-not $keytool) {
    throw 'keytool.exe not found in JAVA_HOME, %LOCALAPPDATA%\jdk-17, or Program Files.'
}

if (-not (Test-Path $keystorePath)) {
    # Generate random 32-character password
    $rng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
    $bytes = New-Object byte[] 24
    $rng.GetBytes($bytes)
    $pwd = [Convert]::ToBase64String($bytes) -replace '[^a-zA-Z0-9]', 'X'

    Write-Host "Generating release keystore at: $keystorePath"
    & $keytool -genkeypair -v -keystore $keystorePath -alias kiosk-release -keyalg RSA -keysize 2048 -validity 10000 -dname 'CN=Viitor Kiosk Player, OU=Engineering, O=Viitor, L=Mumbai, ST=Maharashtra, C=IN' -storepass $pwd -keypass $pwd | Out-Null

    $escapedKeystore = $keystorePath.Replace('\', '/')
    $lines = @(
        '# Kiosk Video Player Release Signing Configuration',
        '# Stored strictly outside the repository per BT-38 spec',
        "storeFile=$escapedKeystore",
        'keyAlias=kiosk-release',
        "storePassword=$pwd",
        "keyPassword=$pwd"
    )
    [System.IO.File]::WriteAllLines($propsPath, $lines)
    Write-Host "Signing properties securely written to: $propsPath"
} else {
    Write-Host "Keystore already exists at: $keystorePath"
}

Write-Host "Keystore exists: $(Test-Path $keystorePath)"
Write-Host "Properties exists: $(Test-Path $propsPath)"
