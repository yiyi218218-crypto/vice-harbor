// A headless play-test: open the game, press Enter, walk, take a car, drive, shoot, and report the
// state after each step. It is the check that the entry is a game and not only four posed frames.
import { spawn } from 'node:child_process';
import { rmSync } from 'node:fs';
import { join } from 'node:path';

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const PORT = 9412;
const BASE = process.env.SHOT_BASE ?? 'http://localhost:8123';
const profile = join(process.env.TEMP ?? '.', `vh-test-${Date.now()}`);

const chrome = spawn(CHROME, [
  '--headless=new',
  `--remote-debugging-port=${PORT}`,
  `--user-data-dir=${profile}`,
  '--window-size=1280,720',
  '--hide-scrollbars',
  '--mute-audio',
  '--enable-unsafe-swiftshader',
  '--use-angle=swiftshader',
  '--no-first-run',
  'about:blank',
], { stdio: ['ignore', 'ignore', 'ignore'] });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

class CDP {
  constructor(url) {
    this.ws = new WebSocket(url);
    this.id = 0;
    this.pending = new Map();
    this.errors = [];
    this.ws.onmessage = (event) => {
      const msg = JSON.parse(event.data);
      if (msg.id && this.pending.has(msg.id)) {
        const { resolve, reject } = this.pending.get(msg.id);
        this.pending.delete(msg.id);
        if (msg.error) reject(new Error(JSON.stringify(msg.error)));
        else resolve(msg.result);
      } else if (msg.method === 'Runtime.exceptionThrown') {
        this.errors.push(msg.params.exceptionDetails.exception?.description ?? msg.params.exceptionDetails.text);
      } else if (msg.method === 'Runtime.consoleAPICalled' && msg.params.type === 'error') {
        this.errors.push(msg.params.args.map((a) => a.value ?? a.description ?? '').join(' '));
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

  async eval(expression) {
    const res = await this.send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    if (res.exceptionDetails) throw new Error(res.exceptionDetails.exception?.description ?? 'eval failed');
    return res.result.value;
  }
}

async function waitFor(fn, label, tries = 80) {
  for (let i = 0; i < tries; i += 1) {
    if (await fn()) return true;
    await sleep(150);
  }
  console.log(`  ! timed out waiting for ${label}`);
  return false;
}

try {
  for (let i = 0; i < 60; i += 1) {
    try {
      const res = await fetch(`http://127.0.0.1:${PORT}/json/version`);
      if (res.ok) break;
    } catch (e) {
      /* not up */
    }
    await sleep(250);
  }
  const res = await fetch(`http://127.0.0.1:${PORT}/json/new?about:blank`, { method: 'PUT' });
  const target = await res.json();
  const cdp = new CDP(target.webSocketDebuggerUrl);
  await cdp.open();
  await cdp.send('Runtime.enable');
  await cdp.send('Page.enable');
  await cdp.send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 720, deviceScaleFactor: 1, mobile: false });
  await cdp.send('Page.navigate', { url: BASE });

  await waitFor(() => cdp.eval('Boolean(window.__viceharbor)'), 'boot');
  console.log('boot      screen =', await cdp.eval('window.__viceharbor.screen'));
  console.log('boot      objects =', await cdp.eval('JSON.stringify({cars: __viceharbor.traffic.cars.length, peds: __viceharbor.traffic.peds.length, towers: __viceharbor.city.towers.length, build: __viceharbor.city.colliders.length})'));

  await cdp.eval(`window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Enter', bubbles: true }))`);
  await waitFor(async () => (await cdp.eval('window.__viceharbor.screen')) === 'play', 'start');
  console.log('start     screen =', await cdp.eval('window.__viceharbor.screen'));

  const walked = await cdp.eval(`(() => {
    const g = window.__viceharbor;
    const from = { x: g.player.state.x, z: g.player.state.z };
    g.input.hold('KeyW', true);
    for (let i = 0; i < 90; i += 1) g.step(1 / 60);
    g.input.hold('KeyW', false);
    const to = { x: g.player.state.x, z: g.player.state.z };
    return JSON.stringify({ from, to, moved: Math.hypot(to.x - from.x, to.z - from.z).toFixed(2) });
  })()`);
  console.log('walk      ', walked);

  // Teleport beside a parked car and take it.
  const stolen = await cdp.eval(`(() => {
    const g = window.__viceharbor;
    const car = g.traffic.cars.find((c) => c.parked && c.alive);
    if (!car) return 'no car';
    g.player.state.x = car.x + 1.2;
    g.player.state.z = car.z;
    g.input.press(4);
    g.handleActions();
    g.step(1 / 60);
    return car.kind + (g.player.state.onFoot ? ' (still on foot)' : ' (taken)');
  })()`);
  console.log('steal     ', stolen);

  const drove = await cdp.eval(`(() => {
    const g = window.__viceharbor;
    const from = { x: g.player.state.x, z: g.player.state.z };
    g.input.hold('KeyW', true);
    for (let i = 0; i < 150; i += 1) g.step(1 / 60);
    g.input.hold('KeyW', false);
    const to = { x: g.player.state.x, z: g.player.state.z };
    return JSON.stringify({ speed: g.player.state.speed.toFixed(1), kmh: Math.round(g.player.state.speed * 3.6), moved: Math.hypot(to.x - from.x, to.z - from.z).toFixed(1) });
  })()`);
  console.log('drive     ', drove);

  // Get out, fire the pistol, raise the wanted level.
  await cdp.eval(`(() => { const g = window.__viceharbor; g.input.press(4); g.handleActions(); g.step(1 / 60); })()`);
  const shots = await cdp.eval(`(() => {
    const g = window.__viceharbor;
    g.combat.state.cooldown = 0;
    const hit = g.combat.fire(g.player, { traffic: g.traffic, police: g.police, enemies: g.missions.enemies, aiming: false, onCrime: (n) => g.police.crime(n), onShot: () => {} });
    return hit ? hit.kind : 'none';
  })()`);
  console.log('shoot     hit =', shots, ' wanted =', await cdp.eval('__viceharbor.police.state.wanted'));

  await cdp.eval(`(() => { const g = window.__viceharbor; g.police.crime(3); for (let i = 0; i < 180; i += 1) g.step(1 / 60); })()`);
  console.log('police    units =', await cdp.eval('__viceharbor.police.units.length'), ' stars =', await cdp.eval('__viceharbor.police.stars'));
  console.log('mission   =', await cdp.eval('__viceharbor.missions.objective.title + " / " + __viceharbor.missions.objective.text'));
  console.log('save      =', await cdp.eval('(() => { __viceharbor.writeSave(); const raw = localStorage.getItem("vice-harbor-save-v1"); return raw ? raw.slice(0, 90) : "none"; })()'));
  console.log('errors    =', cdp.errors.length ? cdp.errors.slice(0, 5) : 'none');
  cdp.ws.close();
} catch (error) {
  console.error('playtest failed:', error.message);
  process.exitCode = 1;
} finally {
  chrome.kill('SIGKILL');
  try {
    rmSync(profile, { recursive: true, force: true });
  } catch (e) {
    /* leave it */
  }
}
