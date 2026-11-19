// Smoke test: serve game/, drive a real headless Chrome through ?test=1 and read the
// JSON the page writes back. Exit code 0 only when every check passes.

import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { startServer } from './server.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));

const CANDIDATES = [
  process.env.CHROME_PATH,
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
];

function findChrome() {
  for (const path of CANDIDATES) {
    if (path && existsSync(path)) return path;
  }
  return null;
}

function run(chrome, args, timeout = 60000) {
  return new Promise((resolvePromise) => {
    const child = spawn(chrome, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '';
    let err = '';
    const timer = setTimeout(() => {
      child.kill('SIGKILL');
    }, timeout);
    child.stdout.on('data', (d) => { out += d.toString(); });
    child.stderr.on('data', (d) => { err += d.toString(); });
    child.on('close', (code) => {
      clearTimeout(timer);
      resolvePromise({ code, out, err });
    });
  });
}

const chrome = findChrome();
if (!chrome) {
  console.error('playtest: no Chrome or Edge found; set CHROME_PATH');
  process.exit(2);
}

const { server, url } = await startServer(join(ROOT, 'game'));
const profile = mkdtempSync(join(tmpdir(), 'vice-playtest-'));

const result = await run(chrome, [
  '--headless=new',
  '--no-sandbox',
  '--disable-dev-shm-usage',
  '--use-angle=swiftshader',
  '--enable-unsafe-swiftshader',
  '--hide-scrollbars',
  '--window-size=1280,720',
  `--user-data-dir=${profile}`,
  '--virtual-time-budget=15000',
  '--dump-dom',
  `${url}/?test=1&seed=1`,
], 90000);

server.close();
try { rmSync(profile, { recursive: true, force: true }); } catch (err) { /* windows lock */ }

const match = result.out.match(/__TEST__([\s\S]*?)__END__/);
if (!match) {
  console.error('playtest: the page did not report. Chrome exit', result.code);
  const hint = (result.err || '').split('\n').filter((l) => /error|fail|gl/i.test(l)).slice(0, 6).join('\n');
  if (hint) console.error(hint);
  process.exit(1);
}

let report;
try {
  report = JSON.parse(match[1]);
} catch (err) {
  console.error('playtest: could not parse the report');
  process.exit(1);
}

for (const check of report.checks) {
  const mark = check.ok ? 'ok  ' : 'FAIL';
  console.log(`${mark} ${check.name}${check.detail ? `  (${check.detail})` : ''}`);
}
console.log(report.ok ? `\nplaytest: ${report.checks.length} checks passed` : `\nplaytest: ${report.failed} failed`);
process.exit(report.ok ? 0 : 1);
