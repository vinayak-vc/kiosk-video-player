const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const installDir = path.join(process.env.LOCALAPPDATA, 'Kiosk Video Player');
const exePath = path.join(installDir, 'kiosk-video-player.exe');
const envFile = path.join(installDir, '.env');
const appData = path.join(process.env.APPDATA, 'com.viitor.kioskplayer');
const cfgFile = path.join(appData, 'config.json');
const cfgBackup = path.join(appData, 'config.json.bak');

// 1. Write .env beside exe
const envContent = [
  'KIOSK_MEDIA_ROOT=C:\\Kiosk\\Media',
  'IDLE_TIMEOUT_SECONDS=5',
  'CONTROLS_AUTO_HIDE_SECONDS=3',
  'SLIDESHOW_MODE=screensaver',
  'SCREENSAVER_SOUND=false',
  'SFX_ENABLED=true'
].join('\n');

fs.writeFileSync(envFile, envContent, 'utf8');
console.log('Wrote .env beside exe:', envFile);

// 2. Temporarily back up config.json so app tests .env fallback
if (fs.existsSync(cfgFile)) {
  fs.copyFileSync(cfgFile, cfgBackup);
  fs.unlinkSync(cfgFile);
  console.log('Backed up and removed config.json to test .env resolution');
}

// 3. Launch packaged exe
console.log('Launching packaged exe:', exePath);
const child = spawn(exePath, [], { detached: true, stdio: 'ignore' });
child.unref();

setTimeout(() => {
  try {
    process.kill(child.pid, 'SIGKILL');
    console.log('Killed child process PID:', child.pid);
  } catch (e) {
    // Already exited
  }

  // Restore config.json
  if (fs.existsSync(cfgBackup)) {
    fs.copyFileSync(cfgBackup, cfgFile);
    fs.unlinkSync(cfgBackup);
    console.log('Restored config.json');
  }

  // Check log lines
  const logFile = path.join(appData, 'logs', 'kiosk.log');
  if (fs.existsSync(logFile)) {
    const lines = fs.readFileSync(logFile, 'utf8').trim().split('\n');
    console.log('=== LOG LINES FROM .ENV TEST RUN ===');
    console.log(lines.slice(-10).join('\n'));
  }
}, 4000);
