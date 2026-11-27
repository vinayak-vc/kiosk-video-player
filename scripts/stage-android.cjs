const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const srcApk = 'C:/React/kiosk-video-player/src-tauri/gen/android/app/build/outputs/apk/universal/release/app-universal-release.apk';
if (!fs.existsSync(srcApk)) {
  console.error('Source APK not found at:', srcApk);
  process.exit(1);
}

const outDir = 'C:/React/kiosk-video-player/android-out';
if (!fs.existsSync(outDir)) {
  fs.mkdirSync(outDir, { recursive: true });
}

const targetName = 'kiosk-video-player-v1.0.2.apk';
const destPath = path.join(outDir, targetName);
fs.copyFileSync(srcApk, destPath);

const buf = fs.readFileSync(destPath);
const hash = crypto.createHash('sha256').update(buf).digest('hex');
const size = buf.length;
console.log('Copied ' + path.basename(srcApk) + ' -> ' + targetName + ' (' + size + ' bytes)');
console.log('SHA256: ' + hash);

const shaFile = path.join(outDir, targetName + '.sha256');
fs.writeFileSync(shaFile, hash + ' *' + targetName + '\n', 'utf8');
console.log('Wrote ' + shaFile);
