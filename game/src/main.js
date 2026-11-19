// Vice Harbor — game orchestration and main loop.
// Ties together world generation, input, rendering, the simulation (wanted
// level, police, missions, combat) and the HUD. Pure browser ES module, no
// network requests at runtime.

import * as THREE from 'three';
import { CFG, COLORS } from './config.js';
import { Rng, clamp, angleDelta, seedFromLocation } from './random.js';
import { Input } from './input.js';
import { readShotParams, shotPose, applyHudMode } from './shots.js';
import {
  makeGround, makeSkyAndLights, makeRoads, makeBuildings, makeStreetLights,
  makeMissionMarkers, makeTraffic, spawnPoliceCar, makePedestrians, makePlayerMesh,
  moveTraffic, movePedestrians,
} from './world.js';
import { createRenderer, createCamera, CameraRig, animateScene, handleResize } from './render.js';

const SAVE_KEY = 'vice-harbor-save-v1';

function loadSave() {
  try {
    const raw = globalThis.localStorage?.getItem(SAVE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function writeSave(data) {
  try {
    globalThis.localStorage?.setItem(SAVE_KEY, JSON.stringify(data));
  } catch {
    /* storage may be blocked; the game still runs */
  }
}

// ---------- boot ----------

const canvas = document.getElementById('scene');
const renderer = createRenderer(canvas);
const camera = createCamera();
const scene = new THREE.Scene();
const rig = new CameraRig(camera);
const input = new Input();

const shotParams = readShotParams();
const seed = shotParams.seed;
const rng = new Rng(seed ^ 0x1234beef);

const world = makeGround(scene);
makeSkyAndLights(scene);
makeRoads(scene);
makeBuildings(scene, seed);
makeStreetLights(scene, seed);
const missionVisuals = makeMissionMarkers(scene, seed);
const traffic = makeTraffic(scene, seed);
const peds = makePedestrians(scene, seed);

const playerMesh = makePlayerMesh();
scene.add(playerMesh);

// ---------- state ----------

const saved = loadSave();
const state = {
  phase: 'menu',             // menu | playing | won | lost
  player: {
    x: 0, z: 0, heading: 0,
    hp: CFG.playerMaxHp,
    inCar: null,             // a car object when driving
  },
  heat: 0,
  stars: 0,
  mission: 0,
  money: saved?.money || 0,
  kills: 0,
  bullets: [],
  police: [],
  fireTimer: 0,
  policeTimer: 0,
  elapsed: 0,
  message: '',
  messageTimer: 0,
  seed,
};

const keys = {};

function say(text, seconds = 2.6) {
  state.message = text;
  state.messageTimer = seconds;
}

// ---------- HUD elements ----------

const el = {
  hpFill: document.getElementById('hp-fill'),
  stars: document.getElementById('wanted-stars'),
  missionName: document.getElementById('mission-name'),
  missionHint: document.getElementById('mission-hint'),
  money: document.getElementById('money-value'),
  speed: document.getElementById('speed-value'),
  message: document.getElementById('toast'),
  minimap: document.getElementById('minimap'),
  startScreen: document.getElementById('start-screen'),
  endScreen: document.getElementById('end-screen'),
  endTitle: document.getElementById('end-title'),
  endStats: document.getElementById('end-stats'),
};
const mapCtx = el.minimap?.getContext('2d') || null;

function updateHud() {
  const hpPct = clamp(state.player.hp / CFG.playerMaxHp, 0, 1) * 100;
  if (el.hpFill) el.hpFill.style.width = `${hpPct}%`;
  if (el.stars) el.stars.textContent = '★'.repeat(state.stars) + '☆'.repeat(CFG.wantedMax - state.stars);
  const mission = CFG.missions[state.mission];
  if (el.missionName) el.missionName.textContent = mission ? `MISSION ${state.mission + 1}/3 · ${mission.name}` : 'ALL MISSIONS CLEAR';
  if (el.missionHint) el.missionHint.textContent = mission ? mission.hint : 'Vice Harbor is yours. Free roam.';
  if (el.money) el.money.textContent = `$${state.money}`;
  if (el.speed) {
    const v = state.player.inCar ? Math.abs(state.player.inCar.speed || 0) * 3.6 : 0;
    el.speed.textContent = state.player.inCar ? `${Math.round(v)} km/h` : 'ON FOOT';
  }
  if (el.message) {
    el.message.textContent = state.messageTimer > 0 ? state.message : '';
    el.message.style.opacity = state.messageTimer > 0 ? '1' : '0';
  }
}

// A top-down minimap: roads, water, mission marker, player and police dots.
function drawMinimap() {
  if (!mapCtx || !el.minimap) return;
  const w = el.minimap.width;
  const h = el.minimap.height;
  mapCtx.clearRect(0, 0, w, h);
  mapCtx.fillStyle = '#201d2a';
  mapCtx.fillRect(0, 0, w, h);

  const span = CFG.grid * CFG.block;
  const toMap = (x, z) => ({
    mx: w / 2 + (x / span) * w,
    my: h / 2 + (z / span) * h,
  });

  // Water band.
  const wy = toMap(0, CFG.seaStartZ).my;
  mapCtx.fillStyle = '#20435c';
  mapCtx.fillRect(0, wy, w, h - wy);

  // Roads.
  mapCtx.strokeStyle = '#4a4658';
  mapCtx.lineWidth = 2;
  for (let i = 0; i < CFG.grid; i++) {
    const c = (i - CFG.half) * CFG.block;
    const v = toMap(c, 0).mx;
    mapCtx.beginPath();
    mapCtx.moveTo(v, 0);
    mapCtx.lineTo(v, wy);
    mapCtx.stroke();
    const hh = toMap(0, c).my;
    if (hh < wy) {
      mapCtx.beginPath();
      mapCtx.moveTo(0, hh);
      mapCtx.lineTo(w, hh);
      mapCtx.stroke();
    }
  }

  // Mission marker.
  const mission = CFG.missions[state.mission];
  if (mission) {
    const m = toMap(mission.x, mission.z);
    mapCtx.fillStyle = '#54e0ff';
    mapCtx.beginPath();
    mapCtx.arc(m.mx, m.my, 4, 0, Math.PI * 2);
    mapCtx.fill();
  }

  // Police.
  mapCtx.fillStyle = '#4d7bff';
  for (const p of state.police) {
    const d = toMap(p.mesh.position.x, p.mesh.position.z);
    mapCtx.fillRect(d.mx - 1.5, d.my - 1.5, 3, 3);
  }

  // Player.
  const me = toMap(state.player.x, state.player.z);
  mapCtx.save();
  mapCtx.translate(me.mx, me.my);
  mapCtx.rotate(-state.player.heading);
  mapCtx.fillStyle = '#ffffff';
  mapCtx.beginPath();
  mapCtx.moveTo(0, -5);
  mapCtx.lineTo(3.5, 4);
  mapCtx.lineTo(-3.5, 4);
  mapCtx.closePath();
  mapCtx.fill();
  mapCtx.restore();
}

// ---------- interactions ----------

function nearestCar(maxDist = 3.4) {
  let best = null;
  let bestD = maxDist;
  const px = state.player.x;
  const pz = state.player.z;
  for (const car of [...traffic.cars, ...state.police]) {
    const d = Math.hypot(car.mesh.position.x - px, car.mesh.position.z - pz);
    if (d < bestD) { bestD = d; best = car; }
  }
  return best;
}

function tryEnterCar() {
  if (state.player.inCar) {
    const car = state.player.inCar;
    state.player.x = car.mesh.position.x + 2.2;
    state.player.z = car.mesh.position.z;
    state.player.inCar = null;
    playerMesh.visible = true;
    say('Left the vehicle.');
    return;
  }
  const car = nearestCar();
  if (!car) { say('No vehicle nearby.'); return; }
  state.player.inCar = car;
  car.stolen = true;
  playerMesh.visible = false;
  const isPolice = !!car.police;
  state.heat += isPolice ? CFG.carStealHeat * 1.6 : CFG.carStealHeat;
  say(isPolice ? 'Carjacked a cruiser! Cops are not amused.' : 'Vehicle acquired. Heat rising.');
}

function tryStealFromPed() {
  // Bumping a pedestrian at speed raises assault heat (a light crime) and
  // makes them stumble; this keeps the streets consequential.
  const px = state.player.x;
  const pz = state.player.z;
  for (const p of peds.peds) {
    const dx = p.mesh.position.x - px;
    const dz = p.mesh.position.z - pz;
    if (Math.hypot(dx, dz) < 1.1) {
      p.dir *= -1;
      return true;
    }
  }
  return false;
}

function updateStars(dt) {
  state.heat = Math.max(0, state.heat - CFG.heatDecay * dt);
  const target = clamp(Math.ceil(state.heat / CFG.heatPerStar), 0, CFG.wantedMax);
  if (target !== state.stars) {
    state.stars = target;
    if (target > 0) say(`WANTED · ${target} STAR${target > 1 ? 'S' : ''}`);
  }
}

function spawnBullet() {
  const p = state.player;
  const ox = p.x + Math.sin(p.heading) * 1.0;
  const oz = p.z + Math.cos(p.heading) * 1.0;
  const mesh = new THREE.Mesh(
    new THREE.SphereGeometry(0.13, 6, 6),
    new THREE.MeshBasicMaterial({ color: 0xffe680 }),
  );
  mesh.position.set(ox, 1.25, oz);
  scene.add(mesh);
  state.bullets.push({
    mesh,
    vx: Math.sin(p.heading) * CFG.bulletSpeed,
    vz: Math.cos(p.heading) * CFG.bulletSpeed,
    life: CFG.bulletLife,
    fromPlayer: true,
  });
  const muzzle = playerMesh.getObjectByName('muzzle');
  if (muzzle) muzzle.material.opacity = 1;
}

function updateBullets(dt) {
  const muzzle = playerMesh.getObjectByName('muzzle');
  if (muzzle) muzzle.material.opacity = Math.max(0, muzzle.material.opacity - dt * 6);
  for (let i = state.bullets.length - 1; i >= 0; i--) {
    const b = state.bullets[i];
    b.mesh.position.x += b.vx * dt;
    b.mesh.position.z += b.vz * dt;
    b.life -= dt;
    let hit = false;
    if (b.fromPlayer) {
      for (let j = state.police.length - 1; j >= 0; j--) {
        const cop = state.police[j];
        if (Math.hypot(cop.mesh.position.x - b.mesh.position.x, cop.mesh.position.z - b.mesh.position.z) < 2.1) {
          cop.health -= 25;
          hit = true;
          if (cop.health <= 0) {
            scene.remove(cop.mesh);
            state.police.splice(j, 1);
            state.money += 75;
            state.kills++;
            state.heat += 8;
            say('Cruiser down. +$75');
          }
          break;
        }
      }
    }
    if (hit || b.life <= 0) {
      scene.remove(b.mesh);
      b.mesh.geometry.dispose();
      state.bullets.splice(i, 1);
    }
  }
}

function updatePolice(dt) {
  state.policeTimer -= dt;
  if (state.stars >= 1 && state.police.length < state.stars + 1 && state.policeTimer <= 0) {
    state.police.push(spawnPoliceCar(scene, state.player, seed + state.police.length));
    state.policeTimer = 4 + (5 - state.stars) * 1.2;
  }
  const p = state.player;
  for (const cop of state.police) {
    const dx = p.x - cop.mesh.position.x;
    const dz = p.z - cop.mesh.position.z;
    const dist = Math.hypot(dx, dz) || 1;
    const desired = Math.atan2(dx, dz);
    cop.mesh.rotation.y += angleDelta(desired, cop.mesh.rotation.y) * Math.min(1, dt * 2.4);
    if (dist > 4) {
      const spd = cop.speed * (0.8 + state.stars * 0.12);
      cop.mesh.position.x += (dx / dist) * spd * dt;
      cop.mesh.position.z += (dz / dist) * spd * dt;
    } else if (state.phase === 'playing' && !p.inCar) {
      p.hp -= 9 * dt;
      state.heat = Math.max(state.heat, CFG.heatPerStar);
      if (p.hp <= 0) endGame(false);
    }
  }
}

function updateMissions() {
  const m = CFG.missions[state.mission];
  if (!m) return;
  const p = state.player;
  if (Math.hypot(p.x - m.x, p.z - m.z) > m.radius) return;
  if (m.needCar && !p.inCar) return;
  if (m.needStars && state.stars < m.needStars) return;
  state.money += 500 * (state.mission + 1);
  state.mission++;
  writeSave({ money: state.money, mission: state.mission });
  say(`MISSION CLEAR · +$${500 * state.mission}`);
  if (state.mission >= CFG.missions.length) endGame(true);
}

function endGame(won) {
  state.phase = won ? 'won' : 'lost';
  if (el.endScreen) el.endScreen.style.display = '';
  if (el.startScreen) el.startScreen.style.display = 'none';
  if (el.hud) el.hud.style.display = 'none';
  if (el.endTitle) el.endTitle.textContent = won ? 'VICE HARBOR CONQUERED' : 'BUSTED';
  if (el.endStats) {
    el.endStats.textContent = `Missions ${state.mission}/${CFG.missions.length} · Wanted ${state.stars}★ · $${state.money} · ${state.kills} cruisers down`;
  }
}

function startGame() {
  state.phase = 'playing';
  state.player.hp = CFG.playerMaxHp;
  if (el.startScreen) el.startScreen.style.display = 'none';
  if (el.endScreen) el.endScreen.style.display = 'none';
  if (el.hud) el.hud.style.display = '';
  say('Welcome to Vice Harbor. Head for the waterfront.');
}

// ---------- simulation ----------

function updatePlayer(dt) {
  const p = state.player;
  const axis = input.axis();
  const running = input.is('run');

  if (p.inCar) {
    const car = p.inCar;
    if (axis.z !== 0) {
      const target = axis.z < 0 ? CFG.carSpeed : -CFG.carSpeed * 0.6;
      if (running && axis.z < 0) car.speed = CFG.carBoost;
      else car.speed += (target - car.speed) * Math.min(1, dt * 2.4);
      if (Math.abs(axis.z) < 0.01) car.speed *= 0.96;
    } else {
      car.speed *= Math.max(0, 1 - dt * 1.4);
    }
    car.mesh.rotation.y += -axis.x * CFG.carTurn * dt * (car.speed >= 0 ? 1 : -1);
    car.mesh.position.x += Math.sin(car.mesh.rotation.y) * car.speed * dt;
    car.mesh.position.z += Math.cos(car.mesh.rotation.y) * car.speed * dt;
    car.mesh.position.x = clamp(car.mesh.position.x, -CFG.half * CFG.block - 10, CFG.half * CFG.block + 10);
    car.mesh.position.z = clamp(car.mesh.position.z, -CFG.half * CFG.block - 10, CFG.seaStartZ - 1);
    p.x = car.mesh.position.x;
    p.z = car.mesh.position.z;
    p.heading = car.mesh.rotation.y;
    if (Math.abs(car.speed) > 8 && tryStealFromPed()) {
      state.heat += CFG.assaultHeat * 0.3;
    }
  } else {
    const speed = running ? CFG.runSpeed : CFG.walkSpeed;
    const moveX = (Math.cos(p.heading) * axis.x + Math.sin(p.heading) * -axis.z) * speed * dt;
    const moveZ = (-Math.sin(p.heading) * axis.x + Math.cos(p.heading) * -axis.z) * speed * dt;
    p.x = clamp(p.x + moveX, -CFG.half * CFG.block, CFG.seaStartZ);
    p.z = clamp(p.z + moveZ, -CFG.half * CFG.block, CFG.seaStartZ);
    // Face the direction of travel.
    if (Math.hypot(axis.x, axis.z) > 0.01) {
      const face = Math.atan2(moveX, moveZ);
      p.heading += angleDelta(face, p.heading) * Math.min(1, dt * 12);
    }
    playerMesh.position.set(p.x, 0, p.z);
    playerMesh.rotation.y = p.heading;
  }

  if (input.pressed('enter')) tryEnterCar();
  if (input.pressed('reset')) {
    p.hp = CFG.playerMaxHp;
    state.heat = 0;
    if (p.inCar) { p.inCar.speed = 0; p.inCar = null; playerMesh.visible = true; }
    say('Respawned. Heat cleared.');
  }
  state.fireTimer -= dt;
  const firing = input.is('fire') || input.mouse.down || input.mouse.clicked;
  if (firing && state.fireTimer <= 0) {
    spawnBullet();
    state.fireTimer = CFG.fireCooldown;
  }
}

function update(dt, time) {
  state.elapsed += dt;
  if (state.messageTimer > 0) state.messageTimer -= dt;

  animateScene(scene, time, world.sea);
  moveTraffic(traffic.cars, dt);
  movePedestrians(peds.peds, dt);

  // Marker rings bob gently.
  missionVisuals.markers.forEach((mk, i) => {
    mk.ring.position.y = 0.35 + Math.sin(time * 2 + i) * 0.18;
    mk.ring.rotation.z += dt * 0.4;
  });

  if (state.phase !== 'playing') {
    updateHud();
    drawMinimap();
    return;
  }

  updatePlayer(dt);
  updateStars(dt);
  updateBullets(dt);
  updatePolice(dt);
  updateMissions();
  updateHud();
  drawMinimap();
}

// ---------- photo mode ----------

function enterPhotoMode() {
  const pose = shotPose(shotParams.mode);
  const p = state.player;
  p.x = pose.player.x;
  p.z = pose.player.z;
  p.heading = pose.player.heading;
  state.heat = pose.wanted * CFG.heatPerStar;
  state.stars = pose.wanted;
  state.mission = Math.min(pose.mission, CFG.missions.length);
  if (pose.player.inCar) {
    const car = traffic.cars[0];
    car.mesh.position.set(p.x, 0, p.z);
    car.mesh.rotation.y = p.heading;
    car.stolen = true;
    p.inCar = car;
    playerMesh.visible = false;
  }
  if (pose.police) {
    for (let i = 0; i < 3; i++) {
      const cop = spawnPoliceCar(scene, p, seed + i);
      // Park cruisers just behind and beside the player, toward the camera,
      // with flashing bars — a readable four-star chase in a still frame.
      cop.mesh.position.set(p.x + (i - 1) * 5.5, 0, p.z + 15 + i * 8);
      cop.mesh.rotation.y = Math.PI;
      state.police.push(cop);
    }
  } else {
    state.police.length = 0;
  }
  playerMesh.position.set(p.x, 0, p.z);
  playerMesh.rotation.y = p.heading;
  rig.useShot(pose);
  applyHudMode(pose.hud);
  if (pose.hud === 'end') {
    if (el.endScreen) el.endScreen.style.display = '';
    if (el.endTitle) el.endTitle.textContent = 'VICE HARBOR CONQUERED';
    if (el.endStats) el.endStats.textContent = 'Missions 3/3 · $3200 · The city is yours.';
    if (el.hud) el.hud.style.display = 'none';
  }
  state.phase = 'playing'; // keeps the world rendering, input stays inert
  input.enabled = false;
  updateHud();
  drawMinimap();
  // Mark readiness for the screenshot tool.
  document.documentElement.dataset.viceReady = '1';
}

// ---------- loop ----------

let last = performance.now();
function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  const time = now / 1000;

  if (state.phase === 'menu') {
    // Idle camera drifts slowly around the plaza behind the start screen.
    const a = time * 0.06;
    camera.position.set(Math.sin(a) * 30, 14, Math.cos(a) * 30 + 18);
    camera.lookAt(0, 2, 0);
  } else if (shotParams.freeze) {
    // Photo mode: only ambient animation runs, camera stays composed.
    animateScene(scene, time, world.sea);
    missionVisuals.markers.forEach((mk, i) => {
      mk.ring.position.y = 0.35 + Math.sin(time * 2 + i) * 0.18;
    });
  } else {
    rig.update(state.player, dt, !!state.player.inCar);
    update(dt, time);
  }

  renderer.render(scene, camera);
  input.endFrame();
  requestAnimationFrame(frame);
}

// ---------- wire up buttons ----------

document.getElementById('btn-start')?.addEventListener('click', startGame);
document.getElementById('btn-restart')?.addEventListener('click', () => {
  state.mission = 0;
  state.money = 0;
  state.kills = 0;
  startGame();
});

handleResize(renderer, camera);

if (shotParams.freeze) {
  enterPhotoMode();
} else {
  applyHudMode('start');
  document.documentElement.dataset.viceReady = '1';
}

requestAnimationFrame(frame);

// Expose a tiny debug handle (also used by playtest.mjs).
globalThis.__VICE__ = { state, CFG, startGame, scene, renderer, camera };
