# Generates the release signing keystore and properties file outside the repository
# Location: %USERPROFILE%\.android\kiosk-release.keystore and kiosk-keystore.properties
$androidDir = Join-Path $env:USERPROFILE '.android'
$keystorePath = Join-Path $androidDir 'kiosk-release.keystore'
$propsPath = Join-Path $androidDir 'kiosk-keystore.properties'
$keytool = 'C:\Users\AIML\AppData\Local\jdk-17\bin\keytool.exe'

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
