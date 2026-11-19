// Screenshot the three scenes with headless Chrome over the DevTools protocol, using Node's own
// WebSocket: no dependencies, no build. Each shot waits for the page to raise window.__shotReady,
// then captures a JPEG at the game's logical 1280x720. Console errors are printed as they arrive.
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const PORT = 9411;
const BASE = process.env.SHOT_BASE ?? 'http://localhost:8123';
const OUT = process.argv[2] ?? 'screenshots';
const SHOTS = [
  { name: '1-start.jpg', query: '?shot=start&seed=1' },
  { name: '2-play.jpg', query: '?shot=play&seed=1' },
  { name: '3-heat.jpg', query: '?shot=heat&seed=1' },
  { name: '4-end.jpg', query: '?shot=end&seed=1' },
];

const profile = join(process.env.TEMP ?? '.', `vh-shot-${Date.now()}`);
mkdirSync(OUT, { recursive: true });

const chrome = spawn(CHROME, [
  '--headless=new',
  `--remote-debugging-port=${PORT}`,
  `--user-data-dir=${profile}`,
  '--window-size=1280,720',
  '--hide-scrollbars',
  '--mute-audio',
  '--enable-unsafe-swiftshader',
  '--use-angle=swiftshader',
  '--disable-dev-shm-usage',
  '--no-first-run',
  '--no-default-browser-check',
  'about:blank',
], { stdio: ['ignore', 'ignore', 'ignore'] });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function version() {
  for (let i = 0; i < 60; i += 1) {
    try {
      const res = await fetch(`http://127.0.0.1:${PORT}/json/version`);
      if (res.ok) return res.json();
    } catch (e) {
      /* not up yet */
    }
    await sleep(250);
  }
  throw new Error('chrome did not come up');
}

class CDP {
  constructor(url) {
    this.ws = new WebSocket(url);
    this.id = 0;
    this.pending = new Map();
    this.handlers = new Map();
    this.ws.onmessage = (event) => {
      const msg = JSON.parse(event.data);
      if (msg.id && this.pending.has(msg.id)) {
        const { resolve, reject } = this.pending.get(msg.id);
        this.pending.delete(msg.id);
        if (msg.error) reject(new Error(JSON.stringify(msg.error)));
        else resolve(msg.result);
      } else if (msg.method) {
        const fn = this.handlers.get(msg.method);
        if (fn) fn(msg.params);
      }
    };
  }

  open() {
    return new Promise((resolve, reject) => {
      this.ws.onopen = resolve;
      this.ws.onerror = reject;
    });
  }

  send(method, params = {}) {
    const id = ++this.id;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }

  on(method, fn) {
    this.handlers.set(method, fn);
  }
}

async function shoot(client, shot) {
  const errors = [];
  client.handlers.clear();
  client.on('Runtime.consoleAPICalled', (params) => {
    if (params.type === 'error') errors.push(params.args.map((a) => a.value ?? a.description ?? '').join(' '));
  });
  client.on('Runtime.exceptionThrown', (params) => {
    const d = params.exceptionDetails;
    errors.push(`${d.text} ${d.exception?.description ?? ''} @${d.url ?? ''}:${d.lineNumber ?? ''}`);
  });
  await client.send('Runtime.enable');
  await client.send('Page.enable');
  await client.send('Emulation.setDeviceMetricsOverride', {
    width: 1280, height: 720, deviceScaleFactor: 1, mobile: false,
  });
  await client.send('Page.navigate', { url: `${BASE}/${shot.query}` });
  let ready = false;
  for (let i = 0; i < 240; i += 1) {
    await sleep(250);
    try {
      const res = await client.send('Runtime.evaluate', { expression: 'Boolean(window.__shotReady)', returnByValue: true });
      if (res.result.value) {
        ready = true;
        break;
      }
    } catch (e) {
      /* page still loading */
    }
  }
  if (!ready) console.log(`  ! ${shot.name}: window.__shotReady never came up`);
  const cap = await client.send('Page.captureScreenshot', { format: 'jpeg', quality: 84, fromSurface: true });
  const buf = Buffer.from(cap.data, 'base64');
  writeFileSync(join(OUT, shot.name), buf);
  console.log(`  ${shot.name}  ${(buf.length / 1024).toFixed(0)} KiB${errors.length ? `  (${errors.length} errors)` : ''}`);
  for (const e of errors.slice(0, 6)) console.log(`    ! ${e.slice(0, 400)}`);
  return { ready, errors };
}

try {
  await version();
  const res = await fetch(`http://127.0.0.1:${PORT}/json/new?about:blank`, { method: 'PUT' });
  const target = await res.json();
  const client = new CDP(target.webSocketDebuggerUrl);
  await client.open();
  mkdirSync(OUT, { recursive: true });
  for (const shot of SHOTS) {
    await shoot(client, shot);
  }
  client.ws.close();
} catch (error) {
  console.error('shoot failed:', error.message);
  process.exitCode = 1;
} finally {
  chrome.kill('SIGKILL');
  try {
    rmSync(profile, { recursive: true, force: true });
  } catch (e) {
    /* leave the temp profile */
  }
}
