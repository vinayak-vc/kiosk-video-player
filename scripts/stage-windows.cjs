const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const srcDir = 'C:/React/kiosk-video-player/src-tauri/target/release/bundle/nsis';
const files = fs.readdirSync(srcDir).filter(f => f.endsWith('.exe'));
console.log('Found NSIS installers:', files);

const outDir = 'C:/React/kiosk-video-player/windows-out';
if (!fs.existsSync(outDir)) {
  fs.mkdirSync(outDir, { recursive: true });
}

for (const f of files) {
  const srcPath = path.join(srcDir, f);
  const targetName = 'kiosk-video-player-v1.0.2-x64-setup.exe';
  const destPath = path.join(outDir, targetName);
  fs.copyFileSync(srcPath, destPath);
  const buf = fs.readFileSync(destPath);
  const hash = crypto.createHash('sha256').update(buf).digest('hex');
  const size = buf.length;
  console.log('Copied ' + f + ' -> ' + targetName + ' (' + size + ' bytes)');
  console.log('SHA256: ' + hash);
  
  const shaFile = path.join(outDir, targetName + '.sha256');
  fs.writeFileSync(shaFile, hash + ' *' + targetName + '\n', 'utf8');
  console.log('Wrote ' + shaFile);
}
