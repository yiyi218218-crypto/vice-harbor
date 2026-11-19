// Screenshot tool for Vice Harbor. Zero npm dependencies: it drives the local
// Chrome through the DevTools Protocol using Node's built-in fetch + WebSocket.
// Reads shots.json, opens each deterministic ?shot= URL, waits for the WebGL
// scene to settle, and writes one JPEG per entry into screenshots/.

import { spawn } from 'node:child_process';
import { readFileSync, mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const repo = join(here, '..');
const shots = JSON.parse(readFileSync(join(repo, 'shots.json'), 'utf8'));
const shotsDir = join(repo, 'screenshots');
mkdirSync(shotsDir, { recursive: true });

const CHROME = '/c/Program Files/Google/Chrome/Application/chrome.exe'
  .replace(/^\/c\//, 'C:/').replace(/\//g, '\\');
const PORT = 9333;
const BASE = 'http://localhost:8080';
const W = 1280, H = 720;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Find a page websocket by polling the DevTools /json endpoint.
async function pageWs() {
  for (let i = 0; i < 60; i++) {
    try {
      const res = await fetch(`http://127.0.0.1:${PORT}/json`);
      const list = await res.json();
      const page = list.find((t) => t.type === 'page');
      if (page) return page.webSocketDebuggerUrl;
    } catch {}
    await sleep(250);
  }
  throw new Error('Chrome DevTools page not found');
}

// Minimal CDP client: incrementing ids, promise-per-command, event fan-out.
function cdp(url) {
  const ws = new WebSocket(url);
  let id = 0;
  const pending = new Map();
  const ready = new Promise((resolve, reject) => {
    ws.onopen = resolve;
    ws.onerror = reject;
  });
  ws.onmessage = (e) => {
    const msg = JSON.parse(e.data);
    if (msg.id && pending.has(msg.id)) {
      const { resolve, reject } = pending.get(msg.id);
      pending.delete(msg.id);
      msg.error ? reject(new Error(msg.error.message)) : resolve(msg.result);
    }
  };
  const send = (method, params = {}) => new Promise((resolve, reject) => {
    const n = ++id;
    pending.set(n, { resolve, reject });
    ws.send(JSON.stringify({ id: n, method, params }));
  });
  return { ready, send, close: () => ws.close() };
}

async function main() {
  // The static server is expected to be running on :8080; start Chrome with a
  // dedicated profile and a fixed debugging port.
  const chrome = spawn(CHROME, [
    '--headless=new', '--disable-gpu', '--hide-scrollbars', '--mute-audio',
    `--remote-debugging-port=${PORT}`,
    `--user-data-dir=${join(repo, '.chrome-shot-profile')}`,
    `--window-size=${W},${H}`,
    'about:blank',
  ], { stdio: 'ignore' });

  const client = cdp(await pageWs());
  await client.ready;
  await client.send('Page.enable');
  await client.send('Runtime.enable');
  await client.send('Emulation.setDeviceMetricsOverride', {
    width: W, height: H, deviceScaleFactor: 1, mobile: false,
  });

  for (const s of shots) {
    const url = BASE + '/' + s.query;
    await client.send('Page.navigate', { url });
    // let modules load, WebGL compile and a few animation frames render
    await sleep(2200);
    const shot = await client.send('Page.captureScreenshot', {
      format: 'jpeg', quality: 82, captureBeyondViewport: false,
    });
    const file = join(shotsDir, s.name);
    writeFileSync(file, Buffer.from(shot.data, 'base64'));
    console.log('shot', s.name, existsSync(file) ? 'ok' : 'MISSING');
  }

  client.close();
  chrome.kill('SIGKILL');
}

main().catch((err) => {
  console.error('shoot failed:', err.message);
  process.exit(1);
});
