// Entry point. Reads the URL parameters, builds one Game, runs the frame loop and
// exposes a small surface for the screenshot rig and the smoke test.

import { GAME } from './config.js';
import { Input } from './input.js';
import { Game } from './game.js';
import { applyShot, shotPoseApply, SHOT_NAMES } from './shots.js';

const THREE = globalThis.THREE;
const params = new URLSearchParams(location.search);
const seedParam = params.get('seed');
const seed = seedParam ? Number(seedParam) || 1 : 1;
const shot = params.get('shot');
const testMode = params.get('test') === '1';

const errors = [];
window.addEventListener('error', (e) => {
  errors.push(String(e.message || e.error || 'error'));
});
window.addEventListener('unhandledrejection', (e) => {
  errors.push(String(e.reason || 'rejection'));
});

const canvas = document.getElementById('view');
const input = new Input(canvas);
const game = new Game({ canvas, seed, input, capture: params.get('capture') === '1' });
window.__vice = { game, ready: false, errors };

input.onPauseRequest = () => {
  if (game.state === 'playing') game.pause();
  else if (game.state === 'paused') game.resume();
};
input.onLockChange = (locked) => {
  if (!locked && game.state === 'playing' && !game.shotMode) game.pause();
};

window.addEventListener('resize', () => game.onResize());

if (shot && SHOT_NAMES.includes(shot)) {
  applyShot(game, shot);
}

// camera override for QA: ?cam=x,y,z,tx,ty,tz&fov=55
const camParam = params.get('cam');
if (camParam) {
  const v = camParam.split(',').map(Number);
  if (v.length === 6 && v.every((n) => Number.isFinite(n))) {
    game.shotMode = true;
    game.shotPose = {
      pos: new THREE.Vector3(v[0], v[1], v[2]),
      look: new THREE.Vector3(v[3], v[4], v[5]),
      fov: Number(params.get('fov')) || 55,
    };
    document.getElementById('menu')?.classList.add('hidden');
    game.hud.show(false);
  }
}

let last = performance.now();
let frames = 0;

function frame(now) {
  const dt = Math.min((now - last) / 1000 || 0.016, GAME.maxFrame);
  last = now;
  frames++;

  if (game.shotMode) {
    game.stage.update(dt, game.player.pos);
    shotPoseApply(game);
    game.updateHud();
    game.effects.update(dt);
  } else {
    game.update(dt);
  }
  game.render();
  input.endFrame();

  if (!window.__vice.ready) {
    window.__vice.ready = true;
    document.body.dataset.ready = '1';
  }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

// --- smoke test ----------------------------------------------------------------

function missionFlow(game) {
  const checks = [];
  const add = (name, ok, detail) => checks.push({ name, ok: !!ok, detail: detail === undefined ? '' : String(detail) });

  // --- job one: steal the Marlin and put it in the garage
  game.startNew();
  game.player.pos.x = game.world.spots.dockCar.x + 1.2;
  game.player.pos.z = game.world.spots.dockCar.z;
  game.tryEnterVehicle();
  add('job1.steal', game.player.vehicle === game.missionCar, game.player.vehicle ? game.player.vehicle.name : 'none');
  if (game.player.vehicle) {
    game.player.vehicle.x = game.world.spots.garage.x;
    game.player.vehicle.z = game.world.spots.garage.z;
  }
  game.mission.update(1 / 60);
  game.mission.update(1 / 60);
  add('job1.paid', game.money >= 250 + 1800 && !game.mission.active, game.money);

  // --- job two: clear the crew, then shake the heat
  if (game.player.vehicle) game.tryExitVehicle();
  game.mission.start(1);
  game.player.pos.x = game.world.spots.saltRow.x;
  game.player.pos.z = game.world.spots.saltRow.z;
  game.mission.update(1 / 60);
  add('job2.crew', game.mission.thugs.length === 4, game.mission.thugs.length);
  for (const t of game.mission.thugs.slice()) {
    t.hit(120);
    game.onPedDown(t);
  }
  game.heat = 0;
  game.mission.update(1 / 60);
  game.mission.update(1 / 60);
  game.mission.update(1 / 60);
  add('job2.paid', game.money >= 250 + 1800 + 3400, game.money);

  // --- job three: three crates, the berth, then out
  game.mission.start(2);
  for (const c of game.world.spots.crates) {
    game.player.pos.x = c.x;
    game.player.pos.z = c.z;
    for (let i = 0; i < 4; i++) game.update(1 / 60);
  }
  add('job3.crates', game.mission.crates >= 3, `${game.mission.crates}/${game.mission._cratePickups.length}@${game.player.pos.x.toFixed(0)},${game.player.pos.z.toFixed(0)} active=${game.mission.active}`);
  game.player.pos.x = game.world.spots.berth9.x;
  game.player.pos.z = game.world.spots.berth9.z;
  for (let i = 0; i < 4; i++) game.update(1 / 60);
  game.heat = 0;
  game.player.pos.x = 0;
  game.player.pos.z = 0;
  for (let i = 0; i < 6; i++) game.update(1 / 60);
  add('job3.paid', game.money >= 250 + 1800 + 3400 + 6500, game.money);
  add('story.done', game.stats.missions === 3, game.stats.missions);

  return checks;
}

function runSelfTest() {
  const checks = [];
  const add = (name, ok, detail) => checks.push({ name, ok: !!ok, detail: detail === undefined ? '' : String(detail) });

  try {
    add('world.colliders', game.world.colliders.length > 30, game.world.colliders.length);
    add('world.buildings', game.world.buildings.length > 40, game.world.buildings.length);
    add('world.graph', game.world.graph.nodes.length === 36, game.world.graph.nodes.length);
    add('traffic.cars', game.traffic.cars.length >= 10, game.traffic.cars.length);
    add('traffic.parked', game.traffic.parked.length >= 5, game.traffic.parked.length);
    add('crowd.peds', game.crowd.peds.length >= 20, game.crowd.peds.length);
    add('hud.nodes', game.hud.starEls.length === 5 && !!game.hud.map, game.hud.starEls.length);

    game.startNew();
    add('state.playing', game.state === 'playing', game.state);
    add('mission.started', game.mission.active && game.mission.index === 0, game.mission.index);

    // walking
    const start = { x: game.player.pos.x, z: game.player.pos.z };
    input.held.add('KeyW');
    for (let i = 0; i < 45; i++) game.update(1 / 60);
    input.held.delete('KeyW');
    const moved = Math.hypot(game.player.pos.x - start.x, game.player.pos.z - start.z);
    add('player.walks', moved > 1.2, moved.toFixed(2));

    // carjacking
    game.player.pos.x = game.world.spots.dockCar.x + 1.4;
    game.player.pos.z = game.world.spots.dockCar.z;
    game.tryEnterVehicle();
    add('vehicle.enter', !!game.player.vehicle, game.player.vehicle ? game.player.vehicle.name : 'none');
    input.held.add('KeyW');
    for (let i = 0; i < 40; i++) game.update(1 / 60);
    input.held.delete('KeyW');
    const carSpeed = game.player.vehicle ? game.player.vehicle.forwardSpeed : 0;
    add('vehicle.drives', carSpeed > 3, carSpeed.toFixed(2));
    game.tryExitVehicle();
    add('vehicle.exit', !game.player.vehicle, 'ok');

    // shooting
    const beforeAmmo = game.player.ammo;
    game.player.fireTimer = 0;
    game.player.fire(game);
    add('weapon.fires', game.player.ammo === beforeAmmo - 1, `${beforeAmmo}->${game.player.ammo}`);
    add('effects.tracer', game.effects.items.length > 0, game.effects.items.length);

    // heat and police
    game.addHeat(2.4, 'TEST');
    add('heat.stars', game.stars >= 2, game.stars);
    game.player.pos.x = 0;
    game.player.pos.z = 0;
    for (let i = 0; i < 90; i++) game.update(1 / 60);
    add('police.respond', game.police.count >= 1, game.police.count);

    // save round trip
    game.save();
    const save = game.readSave();
    add('save.roundtrip', !!save && typeof save.money === 'number', save ? save.money : 'none');

    // the whole three-job story, start to payout
    for (const check of missionFlow(game)) checks.push(check);

    // render
    game.render();
    const info = game.renderer.info.render;
    add('render.triangles', info.triangles > 5000, info.triangles);
    add('render.calls', info.calls > 5, info.calls);
    add('no.errors', errors.length === 0, errors.join(' | '));
  } catch (err) {
    add('exception', false, err && err.stack ? err.stack.split('\n').slice(0,4).join(' << ') : String(err));
  }

  const failed = checks.filter((c) => !c.ok);
  const out = { ok: failed.length === 0, failed: failed.length, checks };
  const pre = document.createElement('pre');
  pre.id = 'testout';
  pre.textContent = `__TEST__${JSON.stringify(out)}__END__`;
  pre.style.display = 'none';
  document.body.appendChild(pre);
  document.title = out.ok ? 'TEST OK' : `TEST FAIL ${failed.length}`;
  return out;
}

if (testMode) {
  window.setTimeout(() => {
    try {
      runSelfTest();
    } catch (err) {
      const pre = document.createElement('pre');
      pre.id = 'testout';
      pre.textContent = `__TEST__${JSON.stringify({ ok: false, failed: 1, checks: [{ name: 'harness', ok: false, detail: String(err) }] })}__END__`;
      document.body.appendChild(pre);
      document.title = 'TEST FAIL';
    }
  }, 350);
}

// tiny hook the screenshot rig can poll
window.__viceFrames = () => frames;
