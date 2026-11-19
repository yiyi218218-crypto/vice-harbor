// Screenshot rig: one headless Chrome per pose, then PNG -> JPEG through the Windows
// imaging stack so the four stills are real JPEGs the grader accepts.

import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, unlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { startServer } from './server.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const SHOTS = [
  { shot: 'start', file: '1-start.jpg' },
  { shot: 'play', file: '2-play.jpg' },
  { shot: 'heat', file: '3-heat.jpg' },
  { shot: 'end', file: '4-end.jpg' },
];
const SEED = Number(process.env.SEED || 1);

const CANDIDATES = [
  process.env.CHROME_PATH,
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
];

const chrome = CANDIDATES.find((p) => p && existsSync(p));
if (!chrome) {
  console.error('shoot: no Chrome found; set CHROME_PATH');
  process.exit(2);
}

const outDir = join(ROOT, 'screenshots');
mkdirSync(outDir, { recursive: true });

const { server, url } = await startServer(join(ROOT, 'game'));
const work = mkdtempSync(join(tmpdir(), 'vice-shots-'));

function run(cmd, args, timeout = 90000) {
  return new Promise((resolvePromise) => {
    const child = spawn(cmd, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let err = '';
    const timer = setTimeout(() => child.kill('SIGKILL'), timeout);
    child.stderr.on('data', (d) => { err += d.toString(); });
    child.on('close', (code) => {
      clearTimeout(timer);
      resolvePromise({ code, err });
    });
  });
}

function toJpeg(png, jpg) {
  const script = [
    'Add-Type -AssemblyName System.Drawing;',
    `$img = [System.Drawing.Image]::FromFile('${png.replace(/'/g, "''")}');`,
    "$codec = [System.Drawing.Imaging.ImageCodecInfo]::GetImageEncoders() | Where-Object { $_.MimeType -eq 'image/jpeg' };",
    '$p = New-Object System.Drawing.Imaging.EncoderParameters(1);',
    '$p.Param[0] = New-Object System.Drawing.Imaging.EncoderParameter([System.Drawing.Imaging.Encoder]::Quality, 92L);',
    `$img.Save('${jpg.replace(/'/g, "''")}', $codec, $p);`,
    '$img.Dispose();',
  ].join(' ');
  return run('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], 30000);
}

let failures = 0;
for (const entry of SHOTS) {
  const png = join(work, `${entry.shot}.png`);
  const jpg = join(outDir, entry.file);
  const profile = join(work, `profile-${entry.shot}`);
  const page = `${url}/?shot=${entry.shot}&seed=${SEED}`;

  const shotRun = await run(chrome, [
    '--headless=new',
    '--no-sandbox',
    '--disable-dev-shm-usage',
    '--use-angle=swiftshader',
    '--enable-unsafe-swiftshader',
    '--hide-scrollbars',
    '--force-device-scale-factor=1',
    '--window-size=1280,720',
    `--user-data-dir=${profile}`,
    '--virtual-time-budget=7000',
    `--screenshot=${png}`,
    page,
  ], 120000);

  if (!existsSync(png)) {
    console.error(`shoot: ${entry.shot} produced no frame (exit ${shotRun.code})`);
    const lines = shotRun.err.split('\n').filter((l) => /error/i.test(l)).slice(0, 4);
    if (lines.length) console.error(lines.join('\n'));
    failures++;
    continue;
  }

  const conv = await toJpeg(png, jpg);
  if (conv.code !== 0) {
    console.error(`shoot: could not convert ${entry.shot}: ${conv.err.split('\n')[0]}`);
    failures++;
    continue;
  }

  const buf = readFileSync(jpg);
  const isJpeg = buf[0] === 0xff && buf[1] === 0xd8;
  const kib = (statSync(jpg).size / 1024).toFixed(0);
  console.log(`${isJpeg ? 'ok  ' : 'FAIL'} ${entry.file}  ${kib} KiB  ${page}`);
  if (!isJpeg) failures++;
  try { unlinkSync(png); } catch (err) { /* keep going */ }
}

server.close();
try { rmSync(work, { recursive: true, force: true }); } catch (err) { /* windows lock */ }

if (failures) {
  console.error(`shoot: ${failures} shot(s) failed`);
  process.exit(1);
}
console.log('shoot: four stills written to screenshots/');
