// tools/shoot.mjs — deterministic screenshot tool for Vice Harbor.
//
// Opens each photo-mode URL in a real headless Chrome, waits for the game to
// mark itself ready, and captures a JPEG via the Chrome DevTools Protocol.
// Uses only Node 22 built-ins (http, child_process, fs, global fetch/WebSocket)
// so it downloads no code and needs no npm packages.
//
// Usage:  node tools/shoot.mjs [outputDir]
// Default outputDir is ./screenshots relative to the repository root.

import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..');
const OUT = resolve(process.argv[2] || join(ROOT, 'screenshots'));

const CHROME = findChrome();
const PORT = 8137;
const CDP_PORT = 9333;

function findChrome() {
  const candidates = [
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
    process.env.CHROME_PATH,
  ].filter(Boolean);
  for (const c of candidates) {
    try { readFileSync(c); return c; } catch { /* try next */ }
  }
  throw new Error('Chrome not found; set CHROME_PATH');
}

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.ts': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png',
};

function startServer() {
  const server = createServer((req, res) => {
    let p = decodeURIComponent((req.url || '/').split('?')[0]);
    if (p === '/') p = '/game/index.html';
    const full = resolve(join(ROOT, '.' + p));
    if (!full.startsWith(ROOT)) { res.writeHead(403); res.end(); return; }
    try {
      const data = readFileSync(full);
      const ext = full.slice(full.lastIndexOf('.'));
      res.writeHead(200, { 'content-type': MIME[ext] || 'application/octet-stream', 'cache-control': 'no-store' });
      res.end(data);
    } catch {
      res.writeHead(404); res.end('not found');
    }
  });
  return new Promise((ok) => server.listen(PORT, '127.0.0.1', () => ok(server)));
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function waitCdpUrl() {
  for (let i = 0; i < 60; i++) {
    try {
      const r = await fetch(`http://127.0.0.1:${CDP_PORT}/json/version`);
      if (r.ok) return await r.json();
    } catch { /* chrome starting */ }
    await sleep(250);
  }
  throw new Error('Chrome CDP did not start');
}

class Cdp {
  constructor(ws) {
    this.ws = ws;
    this.id = 0;
    this.waiters = new Map();
    ws.addEventListener('message', (ev) => {
      const msg = JSON.parse(ev.data);
      if (msg.id && this.waiters.has(msg.id)) {
        const { ok, fail } = this.waiters.get(msg.id);
        this.waiters.delete(msg.id);
        msg.error ? fail(new Error(JSON.stringify(msg.error))) : ok(msg.result);
      }
    });
  }
  send(method, params = {}) {
    const id = ++this.id;
    return new Promise((ok, fail) => {
      this.waiters.set(id, { ok, fail });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }
}

async function connectPage() {
  const list = await (await fetch(`http://127.0.0.1:${CDP_PORT}/json/list`)).json();
  let page = list.find((t) => t.type === 'page');
  if (!page) {
    page = await (await fetch(`http://127.0.0.1:${CDP_PORT}/json/new?about:blank`, { method: 'PUT' })).json();
  }
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((ok, fail) => {
    ws.addEventListener('open', ok, { once: true });
    ws.addEventListener('error', fail, { once: true });
  });
  return new Cdp(ws);
}

async function main() {
  mkdirSync(OUT, { recursive: true });
  const server = await startServer();
  const chrome = spawn(CHROME, [
    '--headless=new',
    `--remote-debugging-port=${CDP_PORT}`,
    '--user-data-dir=' + join(ROOT, '.chrome-shoot-profile'),
    '--no-first-run', '--no-default-browser-check', '--disable-extensions',
    '--disable-gpu-sandbox', '--enable-unsafe-swiftshader', '--use-gl=angle',
    '--use-angle=swiftshader', '--hide-scrollbars', '--mute-audio',
    '--window-size=1280,720',
    'about:blank',
  ], { stdio: 'ignore' });

  try {
    await waitCdpUrl();
    const cdp = await connectPage();
    await cdp.send('Page.enable');
    await cdp.send('Emulation.setDeviceMetricsOverride', {
      width: 1280, height: 720, deviceScaleFactor: 1, mobile: false,
    });

    const shots = JSON.parse(readFileSync(join(ROOT, 'shots.json'), 'utf8')).shots;
    for (const shot of shots) {
      const url = `http://127.0.0.1:${PORT}/game/index.html${shot.url}`;
      await cdp.send('Page.navigate', { url });
      // Wait until the game set its ready flag (or a generous fallback).
      let ready = false;
      for (let i = 0; i < 80; i++) {
        await sleep(200);
        try {
          const r = await cdp.send('Runtime.evaluate', {
            expression: "document.documentElement.dataset.viceReady === '1'",
            returnByValue: true,
          });
          if (r.result?.value === true) { ready = true; break; }
        } catch { /* page still loading */ }
      }
      if (!ready) throw new Error(`shot ${shot.file}: game never became ready`);
      // Let a few frames render so WebGL content is present in the capture.
      await sleep(900);
      const cap = await cdp.send('Page.captureScreenshot', {
        format: 'jpeg', quality: 82, captureBeyondViewport: false,
      });
      const target = join(OUT, shot.file);
      writeFileSync(target, Buffer.from(cap.data, 'base64'));
      process.stdout.write(`captured ${shot.file} (${shot.url})\n`);
    }
    process.stdout.write(`shoot: done, ${shots.length} shots in ${OUT}\n`);
  } finally {
    chrome.kill('SIGKILL');
    server.close();
  }
}

main().catch((err) => {
  process.stderr.write(`shoot failed: ${err.stack || err}\n`);
  process.exitCode = 1;
});
