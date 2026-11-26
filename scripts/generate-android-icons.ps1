# Generates Android adaptive launcher icons and TV leanback banner from src-tauri/icons/icon.png
Add-Type -AssemblyName System.Drawing

$RepoRoot = Split-Path -Parent $PSScriptRoot
$SourceIconPath = Join-Path $RepoRoot "src-tauri\icons\icon.png"
$ResDir = Join-Path $RepoRoot "src-tauri\gen\android\app\src\main\res"

if (-not (Test-Path $SourceIconPath)) {
    throw "Source icon not found at: $SourceIconPath"
}

$srcImage = [System.Drawing.Image]::FromFile($SourceIconPath)

function Resize-Image {
    param(
        [System.Drawing.Image]$Image,
        [int]$Width,
        [int]$Height,
        [int]$InnerWidth = $Width,
        [int]$InnerHeight = $Height,
        [bool]$Round = $false,
        [System.Drawing.Color]$BgColor = [System.Drawing.Color]::Transparent
    )
    $dest = New-Object System.Drawing.Bitmap $Width, $Height, ([System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
    $g = [System.Drawing.Graphics]::FromImage($dest)
    $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
    $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
    $g.Clear($BgColor)

    if ($Round) {
        $path = New-Object System.Drawing.Drawing2D.GraphicsPath
        $path.AddEllipse(0, 0, $Width, $Height)
        $g.SetClip($path)
    }

    $offsetX = [int](($Width - $InnerWidth) / 2)
    $offsetY = [int](($Height - $InnerHeight) / 2)
    $g.DrawImage($Image, $offsetX, $offsetY, $InnerWidth, $InnerHeight)

    $g.Dispose()
    return $dest
}

# Icon density specs: Name -> @{ Launcher = <px>; Foreground = <px>; InnerFg = <px> }
$densities = @{
    "mipmap-mdpi"    = @{ Launcher = 48;  Foreground = 108; InnerFg = 72  }
    "mipmap-hdpi"    = @{ Launcher = 72;  Foreground = 162; InnerFg = 108 }
    "mipmap-xhdpi"   = @{ Launcher = 96;  Foreground = 216; InnerFg = 144 }
    "mipmap-xxhdpi"  = @{ Launcher = 144; Foreground = 324; InnerFg = 216 }
    "mipmap-xxxhdpi" = @{ Launcher = 192; Foreground = 432; InnerFg = 288 }
}

foreach ($density in $densities.Keys) {
    $targetDir = Join-Path $ResDir $density
    if (-not (Test-Path $targetDir)) { New-Item -ItemType Directory -Force -Path $targetDir | Out-Null }
    $cfg = $densities[$density]

    # 1. Square Launcher Icon
    $launcherBmp = Resize-Image -Image $srcImage -Width $cfg.Launcher -Height $cfg.Launcher
    $launcherPath = Join-Path $targetDir "ic_launcher.png"
    $launcherBmp.Save($launcherPath, [System.Drawing.Imaging.ImageFormat]::Png)
    $launcherBmp.Dispose()

    # 2. Round Launcher Icon
    $roundBmp = Resize-Image -Image $srcImage -Width $cfg.Launcher -Height $cfg.Launcher -Round $true
    $roundPath = Join-Path $targetDir "ic_launcher_round.png"
    $roundBmp.Save($roundPath, [System.Drawing.Imaging.ImageFormat]::Png)
    $roundBmp.Dispose()

    # 3. Adaptive Foreground (with proper padding)
    $fgBmp = Resize-Image -Image $srcImage -Width $cfg.Foreground -Height $cfg.Foreground -InnerWidth $cfg.InnerFg -InnerHeight $cfg.InnerFg
    $fgPath = Join-Path $targetDir "ic_launcher_foreground.png"
    $fgBmp.Save($fgPath, [System.Drawing.Imaging.ImageFormat]::Png)
    $fgBmp.Dispose()

    Write-Host "Generated $density icons ($($cfg.Launcher)px, fg: $($cfg.Foreground)px)"
}

# 4. Generate Android TV Leanback Banner (320x180 xhdpi standard)
$bannerDir = Join-Path $ResDir "drawable"
if (-not (Test-Path $bannerDir)) { New-Item -ItemType Directory -Force -Path $bannerDir | Out-Null }
$bannerBmp = New-Object System.Drawing.Bitmap 320, 180, ([System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
$bg = [System.Drawing.Graphics]::FromImage($bannerBmp)
$bg.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
$bg.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic

# Gradient background: Navy to Deep Black
$brush = New-Object System.Drawing.Drawing2D.LinearGradientBrush (New-Object System.Drawing.Point 0, 0), (New-Object System.Drawing.Point 320, 180), ([System.Drawing.Color]::FromArgb(255, 10, 16, 32)), ([System.Drawing.Color]::FromArgb(255, 3, 6, 12))
$bg.FillRectangle($brush, 0, 0, 320, 180)
$brush.Dispose()

# Draw centered icon with subtle glow/aspect
$iconSize = 130
$iconX = [int]((320 - $iconSize) / 2)
$iconY = [int]((180 - $iconSize) / 2)
$bg.DrawImage($srcImage, $iconX, $iconY, $iconSize, $iconSize)

$bg.Dispose()
$bannerPath = Join-Path $bannerDir "banner.png"
$bannerBmp.Save($bannerPath, [System.Drawing.Imaging.ImageFormat]::Png)
$bannerBmp.Dispose()
Write-Host "Generated Android TV banner at: $bannerPath (320x180)"

$srcImage.Dispose()

# 5. Create mipmap-anydpi-v26 for adaptive icons
$anydpiDir = Join-Path $ResDir "mipmap-anydpi-v26"
if (-not (Test-Path $anydpiDir)) { New-Item -ItemType Directory -Force -Path $anydpiDir | Out-Null }

$adaptiveXml = @'
<?xml version="1.0" encoding="utf-8"?>
<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">
    <background android:drawable="@drawable/ic_launcher_background" />
    <foreground android:drawable="@mipmap/ic_launcher_foreground" />
</adaptive-icon>
'@
[System.IO.File]::WriteAllText((Join-Path $anydpiDir "ic_launcher.xml"), $adaptiveXml)
[System.IO.File]::WriteAllText((Join-Path $anydpiDir "ic_launcher_round.xml"), $adaptiveXml)
Write-Host "Generated adaptive-icon XML in mipmap-anydpi-v26"
