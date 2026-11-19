// Smoke test for Vice Harbor. Two layers, no npm dependencies:
//   1. static: every ES module under game/src parses, and required files exist;
//   2. runtime: headless Chrome loads the game and we assert no page errors.

import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join, dirname, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const here = dirname(fileURLToPath(import.meta.url));
const repo = join(here, '..');
const srcDir = join(repo, 'game', 'src');
let failures = 0;

function check(cond, label) {
  console.log((cond ? 'PASS ' : 'FAIL ') + label);
  if (!cond) failures++;
}

// --- static layer ---------------------------------------------------------
for (const f of ['index.html', 'src/main.js', 'src/world.js', 'src/render.js', 'src/config.js']) {
  check(existsSync(join(repo, 'game', f)), 'exists game/' + f);
}
for (const name of readdirSync(srcDir).filter((n) => extname(n) === '.js')) {
  const code = readFileSync(join(srcDir, name), 'utf8');
  try {
    // Strip import/export for a parse-only check in a script context.
    const stripped = code
      .replace(/^\s*import[^;]*;\s*$/gm, '')
      .replace(/^\s*export\s+(const|function|class)\s/gm, '$1 ')
      .replace(/^\s*export\s*\{[^}]*\};?\s*$/gm, '');
    new vm.Script(stripped, { filename: name });
    check(true, 'parses ' + name);
  } catch (e) {
    check(false, 'parses ' + name + ' :: ' + e.message);
  }
}
const mainSrc = readFileSync(join(srcDir, 'main.js'), 'utf8');
check(/requestAnimationFrame\(frame\)/.test(mainSrc), 'main loop scheduled');
check(/localStorage/.test(mainSrc), 'save system present');
check(/MISSIONS/.test(mainSrc), 'mission system present');

// --- runtime layer (only if a server + Chrome are available) --------------
const RUNTIME = process.env.PLAYTEST_RUNTIME === '1';
if (RUNTIME) {
  const { spawn } = await import('node:child_process');
  const CHROME = '/c/Program Files/Google/Chrome/Application/chrome.exe'
    .replace(/^\/c\//, 'C:/').replace(/\//g, '\\');
  const PORT = 9334;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const chrome = spawn(CHROME, [
    '--headless=new', '--disable-gpu', '--mute-audio',
    `--remote-debugging-port=${PORT}`,
    `--user-data-dir=${join(repo, '.chrome-test-profile')}`,
    'about:blank',
  ], { stdio: 'ignore' });

  let wsUrl = null;
  for (let i = 0; i < 60 && !wsUrl; i++) {
    try {
      const list = await (await fetch(`http://127.0.0.1:${PORT}/json`)).json();
      wsUrl = list.find((t) => t.type === 'page')?.webSocketDebuggerUrl;
    } catch {}
    if (!wsUrl) await sleep(250);
  }
  if (!wsUrl) {
    check(false, 'chrome devtools ready');
  } else {
    const ws = new WebSocket(wsUrl);
    await new Promise((r) => ws.onopen = r);
    let id = 0;
    const errors = [];
    const pending = new Map();
    ws.onmessage = (e) => {
      const m = JSON.parse(e.data);
      if (m.method === 'Runtime.exceptionThrown') errors.push(m.params.exceptionDetails.text);
      if (m.id && pending.has(m.id)) { pending.get(m.id)(m.result); pending.delete(m.id); }
    };
    const send = (method, params = {}) => new Promise((res) => {
      const n = ++id; pending.set(n, res); ws.send(JSON.stringify({ id: n, method, params }));
    });
    await send('Runtime.enable');
    await send('Page.enable');
    await send('Page.navigate', { url: 'http://localhost:8080/?shot=play&seed=1' });
    await sleep(2500);
    const probe = await send('Runtime.evaluate', {
      expression: '({canvas: !!document.getElementById("view"), hud: !!document.getElementById("hud"), title: document.title})',
      returnByValue: true,
    });
    const v = probe?.result?.value || {};
    check(v.canvas && v.hud, 'game DOM mounted');
    check(v.title === 'Vice Harbor', 'document title');
    check(errors.length === 0, 'no runtime exceptions' + (errors.length ? ' :: ' + errors.join(' | ') : ''));
    ws.close();
  }
  chrome.kill('SIGKILL');
}

console.log(failures === 0 ? '\nALL PLAYTESTS PASSED' : `\n${failures} PLAYTEST(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
