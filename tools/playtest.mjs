// tools/playtest.mjs — smoke test for Vice Harbor.
// 1) static checks: every local script/module referenced by index.html exists;
// 2) runtime check: load the page in headless Chrome, confirm the game reaches
//    ready state, no page errors, and the WebGL canvas has non-zero size.
// Node built-ins only; no dependencies, no network.

import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const PORT = 8138;
const CDP_PORT = 9334;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let failures = 0;
function check(name, ok, detail = '') {
  process.stdout.write(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ' — ' + detail : ''}\n`);
  if (!ok) failures++;
}

function staticChecks() {
  const html = readFileSync(join(ROOT, 'game', 'index.html'), 'utf8');
  const refs = [...html.matchAll(/(?:src|href)\s*=\s*["']([^"']+)["']/g)].map((m) => m[1]);
  const modules = refs.filter((r) => r.startsWith('./') || r.startsWith('/'));
  for (const m of modules) {
    const local = m.startsWith('/') ? join(ROOT, 'game', m) : join(ROOT, 'game', m);
    check(`static ref ${m}`, existsSync(local));
  }
  const srcDir = join(ROOT, 'game', 'src');
  for (const f of ['config.js', 'input.js', 'main.js', 'random.js', 'render.js', 'shots.js', 'world.js']) {
    check(`module game/src/${f}`, existsSync(join(srcDir, f)));
  }
  check('vendored three', existsSync(join(ROOT, 'game', 'vendor', 'three.min.js')));
  check('shots.json', existsSync(join(ROOT, 'shots.json')));
}

function startServer() {
  const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.ts': 'text/javascript', '.json': 'application/json', '.jpg': 'image/jpeg', '.png': 'image/png' };
  const server = createServer((req, res) => {
    let p = decodeURIComponent((req.url || '/').split('?')[0]);
    if (p === '/') p = '/game/index.html';
    const full = resolve(join(ROOT, '.' + p));
    try {
      const data = readFileSync(full);
      res.writeHead(200, { 'content-type': MIME[full.slice(full.lastIndexOf('.'))] || 'application/octet-stream' });
      res.end(data);
    } catch { res.writeHead(404); res.end(); }
  });
  return new Promise((ok) => server.listen(PORT, '127.0.0.1', () => ok(server)));
}

function findChrome() {
  for (const c of [
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
    process.env.CHROME_PATH,
  ].filter(Boolean)) {
    try { readFileSync(c); return c; } catch {}
  }
  return null;
}

class Cdp {
  constructor(ws) {
    this.ws = ws; this.id = 0; this.waiters = new Map(); this.events = [];
    ws.addEventListener('message', (ev) => {
      const m = JSON.parse(ev.data);
      if (m.id && this.waiters.has(m.id)) {
        const w = this.waiters.get(m.id); this.waiters.delete(m.id);
        m.error ? w.fail(new Error(JSON.stringify(m.error))) : w.ok(m.result);
      } else if (m.method) this.events.push(m);
    });
  }
  send(method, params = {}) {
    const id = ++this.id;
    return new Promise((ok, fail) => { this.waiters.set(id, { ok, fail }); this.ws.send(JSON.stringify({ id, method, params })); });
  }
}

async function runtimeCheck() {
  const chromePath = findChrome();
  if (!chromePath) { check('headless Chrome available', false, 'set CHROME_PATH'); return; }
  const server = await startServer();
  const chrome = spawn(chromePath, [
    '--headless=new', `--remote-debugging-port=${CDP_PORT}`,
    '--user-data-dir=' + join(ROOT, '.chrome-playtest-profile'),
    '--no-first-run', '--disable-extensions', '--enable-unsafe-swiftshader',
    '--use-gl=angle', '--use-angle=swiftshader', '--window-size=1280,720', 'about:blank',
  ], { stdio: 'ignore' });

  try {
    let version;
    for (let i = 0; i < 60; i++) {
      try { const r = await fetch(`http://127.0.0.1:${CDP_PORT}/json/version`); if (r.ok) { version = await r.json(); break; } } catch {}
      await sleep(200);
    }
    check('CDP started', !!version);
    if (!version) return;

    const list = await (await fetch(`http://127.0.0.1:${CDP_PORT}/json/list`)).json();
    const page = list.find((t) => t.type === 'page');
    const ws = new WebSocket(page.webSocketDebuggerUrl);
    await new Promise((ok, fail) => { ws.addEventListener('open', ok, { once: true }); ws.addEventListener('error', fail, { once: true }); });
    const cdp = new Cdp(ws);
    await cdp.send('Runtime.enable');
    await cdp.send('Page.enable');
    await cdp.send('Page.navigate', { url: `http://127.0.0.1:${PORT}/game/index.html?shot=play&seed=1` });

    let ready = false;
    for (let i = 0; i < 80; i++) {
      await sleep(200);
      try {
        const r = await cdp.send('Runtime.evaluate', { expression: "document.documentElement.dataset.viceReady === '1'", returnByValue: true });
        if (r.result?.value === true) { ready = true; break; }
      } catch {}
    }
    check('game reached ready state', ready);

    const info = await cdp.send('Runtime.evaluate', {
      expression: `JSON.stringify({
        canvas: (() => { const c = document.getElementById('scene'); return c ? [c.width, c.height] : null; })(),
        hasState: !!(window.__VICE__ && window.__VICE__.state),
        missions: window.__VICE__?.CFG?.missions?.length || 0
      })`,
      returnByValue: true,
    });
    let parsed = {};
    try { parsed = JSON.parse(info.result.value); } catch {}
    check('canvas has size', Array.isArray(parsed.canvas) && parsed.canvas[0] > 0 && parsed.canvas[1] > 0, JSON.stringify(parsed.canvas));
    check('game state exposed', parsed.hasState === true);
    check('three missions configured', parsed.missions === 3, String(parsed.missions));

    const errs = cdp.events.filter((e) => e.method === 'Runtime.exceptionThrown' || e.method === 'Log.entryAdded');
    check('no runtime exceptions', errs.length === 0, `${errs.length} events`);
    ws.close();
  } finally {
    chrome.kill('SIGKILL');
    server.close();
  }
}

async function main() {
  process.stdout.write('Vice Harbor playtest\n');
  staticChecks();
  await runtimeCheck();
  process.stdout.write(`playtest: ${failures} failed\n`);
  if (failures > 0) process.exitCode = 1;
}

main().catch((e) => { process.stderr.write(`playtest crashed: ${e.stack || e}\n`); process.exitCode = 1; });
