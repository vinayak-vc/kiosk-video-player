#!/usr/bin/env node
/**
 * scripts/emulator-soak.cjs
 * 30-minute automated native memory soak test for the Release APK on Android TV emulator.
 * Captures dumpsys meminfo / smaps_rollup every 60s through repeated:
 *   idle -> slideshow -> tap exit -> gallery -> tap card -> play -> tap back
 * Writes results to Docs/evidence/emulator_soak_30min.csv.
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const ADB = path.join(process.env.LOCALAPPDATA, 'Android/Sdk/platform-tools/adb.exe');
const PKG = 'com.viitor.kioskplayer';
const CSV_PATH = path.resolve(__dirname, '../Docs/evidence/emulator_soak_30min.csv');

function runAdb(cmd) {
  try {
    return execSync(`"${ADB}" ${cmd}`, { encoding: 'utf8', timeout: 20000 });
  } catch (err) {
    return '';
  }
}

function getPid() {
  const out = runAdb(`shell pidof ${PKG}`).trim();
  return out ? out.split(/\s+/)[0] : null;
}

function parseMemory(pid) {
  // Try dumpsys meminfo first
  const dumpsys = runAdb(`shell dumpsys meminfo ${PKG}`);
  let pssTotal = 0;
  let rssTotal = 0;
  let nativeHeap = 0;
  let javaHeap = 0;
  let privateDirty = 0;
  let webviews = 0;

  if (dumpsys && dumpsys.includes('TOTAL PSS:')) {
    const pssMatch = dumpsys.match(/TOTAL PSS:\s+(\d+)/);
    if (pssMatch) pssTotal = parseInt(pssMatch[1], 10);
    const rssMatch = dumpsys.match(/TOTAL RSS:\s+(\d+)/);
    if (rssMatch) rssTotal = parseInt(rssMatch[1], 10);
    const natMatch = dumpsys.match(/Native Heap:\s+(\d+)/);
    if (natMatch) nativeHeap = parseInt(natMatch[1], 10);
    const javMatch = dumpsys.match(/Java Heap:\s+(\d+)/);
    if (javMatch) javaHeap = parseInt(javMatch[1], 10);
    const dirtyMatch = dumpsys.match(/TOTAL\s+\d+\s+(\d+)/);
    if (dirtyMatch) privateDirty = parseInt(dirtyMatch[1], 10);
    const wvMatch = dumpsys.match(/WebViews:\s+(\d+)/);
    if (wvMatch) webviews = parseInt(wvMatch[1], 10);
  } else if (pid) {
    // Fallback to smaps_rollup
    const smaps = runAdb(`shell cat /proc/${pid}/smaps_rollup`);
    const pssM = smaps.match(/Pss:\s+(\d+)\s+kB/);
    if (pssM) pssTotal = parseInt(pssM[1], 10);
    const rssM = smaps.match(/Rss:\s+(\d+)\s+kB/);
    if (rssM) rssTotal = parseInt(rssM[1], 10);
    const dirtyM = smaps.match(/Private_Dirty:\s+(\d+)\s+kB/);
    if (dirtyM) privateDirty = parseInt(dirtyM[1], 10);
  }

  return { pssTotal, rssTotal, nativeHeap, javaHeap, privateDirty, webviews };
}

async function main() {
  console.log(`Starting 30-min Emulator Soak Test for ${PKG}...`);
  fs.mkdirSync(path.dirname(CSV_PATH), { recursive: true });

  const headers = 'minute,timestamp,pid,pss_total_kb,rss_total_kb,native_heap_kb,java_heap_kb,private_dirty_kb,webviews\n';
  fs.writeFileSync(CSV_PATH, headers);

  let pid = getPid();
  if (!pid) {
    console.log('App not running, launching...');
    runAdb(`shell monkey -p ${PKG} -c android.intent.category.LAUNCHER 1`);
    await new Promise(r => setTimeout(r, 4000));
    pid = getPid();
  }
  console.log(`Target process PID: ${pid}`);

  const TOTAL_MINUTES = 30;

  for (let m = 1; m <= TOTAL_MINUTES; m++) {
    const timestamp = new Date().toISOString();
    pid = getPid() || pid;

    // Simulate kiosk cycle activity:
    // 1. Tap gallery card (e.g. card 1 at ~400, 400) to open player
    runAdb('shell input tap 400 400');
    await new Promise(r => setTimeout(r, 6000)); // Play 6s

    // 2. Tap top-left to return to gallery (Back button ~60, 60)
    runAdb('shell input tap 60 60');
    await new Promise(r => setTimeout(r, 4000)); // Gallery settle

    // 3. Wait in gallery to allow idle transition or trigger next screen
    await new Promise(r => setTimeout(r, 10000));

    // 4. Tap screen center in case slideshow started to return to gallery
    runAdb('shell input tap 960 60');

    // Collect memory metrics
    const mem = parseMemory(pid);
    const row = `${m},${timestamp},${pid},${mem.pssTotal},${mem.rssTotal},${mem.nativeHeap},${mem.javaHeap},${mem.privateDirty},${mem.webviews}\n`;
    fs.appendFileSync(CSV_PATH, row);

    console.log(`[Soak Min ${String(m).padStart(2)}/${TOTAL_MINUTES}] PSS: ${(mem.pssTotal / 1024).toFixed(1)} MB | RSS: ${(mem.rssTotal / 1024).toFixed(1)} MB | Native: ${(mem.nativeHeap / 1024).toFixed(1)} MB | WebViews: ${mem.webviews}`);

    // Wait remainder of minute (~40s)
    await new Promise(r => setTimeout(r, 40000));
  }

  console.log('30-minute soak test completed successfully. CSV written to:', CSV_PATH);
}

main().catch(err => {
  console.error('Soak test error:', err);
  process.exit(1);
});
