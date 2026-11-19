// Vice Harbor - game orchestration.
// Wires input, world, render and HUD into a playable loop: walk, steal and
// drive cars, shoot, build a wanted level, survive police, run three jobs and
// save progress to localStorage. Also honours the deterministic ?shot= modes.

import * as THREE from 'three';
import { CFG, PAL, MISSIONS, SAVE_KEY } from './config.js';
import { makeRng } from './random.js';
import { createInput } from './input.js';
import { buildCity, spawnTraffic, spawnPedestrians, updateTraffic, updatePedestrians, makeCar } from './world.js';
import { createRenderer, followCamera } from './render.js';
import { readShot, shotSetup } from './shots.js';

const { mode, seed } = readShot();
const shot = shotSetup(mode);
const rng = makeRng(seed + '-viceharbor');

const canvas = document.getElementById('view');
const { renderer, scene, camera } = createRenderer(canvas);
const input = createInput(canvas);
buildCity(scene, rng);
const traffic = spawnTraffic(scene, rng);
const peds = spawnPedestrians(scene, rng);

// ---- persistent save -----------------------------------------------------
function loadSave() {
  try { return JSON.parse(localStorage.getItem(SAVE_KEY)) || {}; } catch { return {}; }
}
let save = loadSave();
const state = {
  phase: shot ? (shot.overlay === 'end' ? 'end' : 'play') : 'start',
  health: shot?.health ?? CFG.player.maxHealth,
  wanted: shot?.wanted ?? 0,
  money: save.money || 0,
  mission: save.mission || 0,
  completed: shot?.completed ?? (save.completed || 0),
  cleanTime: 0,
  fireTimer: 0,
  message: '',
  messageTimer: 0,
  time: 0,
  gameOver: false,
};

// ---- avatar --------------------------------------------------------------
const avatar = new THREE.Group();
const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.55, 1.5, 4, 10), new THREE.MeshLambertMaterial({ color: 0x1f6f8b }));
torso.position.y = 1.8;
avatar.add(torso);
const head = new THREE.Mesh(new THREE.SphereGeometry(0.5, 10, 10), new THREE.MeshLambertMaterial({ color: 0xd9a066 }));
head.position.y = 3.1;
avatar.add(head);
scene.add(avatar);

const player = {
  pos: new THREE.Vector3(shot?.pos?.x ?? 0, 0, shot?.pos?.z ?? 26),
  heading: shot?.heading ?? Math.PI,
  inCar: false,
  car: null,
};
avatar.position.copy(player.pos);

// The one car the player can enter/exit; spawned near the avatar.
const playerCar = makeCar(scene, 0xe74c3c);
playerCar.group.position.set(player.pos.x + 6, 0, player.pos.z + 4);
playerCar.group.rotation.y = player.heading;
let carSpeed = 0;

// ---- police, bullets, mission marker ------------------------------------
const police = [];
const bullets = [];
const marker = new THREE.Mesh(
  new THREE.CylinderGeometry(6, 6, 1.2, 24),
  new THREE.MeshBasicMaterial({ color: PAL.neonGold, transparent: true, opacity: 0.55 }),
);
scene.add(marker);

function spawnPolice() {
  while (police.length < state.wanted * CFG.wanted.policePerStar) {
    const p = makeCar(scene, 0xffffff, true);
    const a = rng() * Math.PI * 2;
    p.group.position.set(player.pos.x + Math.sin(a) * 60, 0, player.pos.z + Math.cos(a) * 60);
    police.push({ ...p, speed: 0 });
  }
  while (police.length > state.wanted * CFG.wanted.policePerStar) {
    const p = police.pop();
    scene.remove(p.group);
  }
}

function fire() {
  if (state.fireTimer > 0) return;
  state.fireTimer = CFG.player.fireCooldown;
  const dir = new THREE.Vector3(Math.sin(player.heading), 0, Math.cos(player.heading));
  const b = new THREE.Mesh(new THREE.SphereGeometry(0.3, 6, 6), new THREE.MeshBasicMaterial({ color: PAL.neonGold }));
  const origin = player.pos.clone().add(dir.clone().multiplyScalar(player.inCar ? 3 : 1.5));
  origin.y = player.inCar ? 1.6 : 2.2;
  b.position.copy(origin);
  scene.add(b);
  bullets.push({ mesh: b, vel: dir.clone().multiplyScalar(CFG.player.bulletSpeed), life: CFG.player.bulletLife });
  if (state.wanted < CFG.wanted.stars) {
    state.wanted += CFG.wanted.shootStars;
    toast('WANTED LEVEL ' + state.wanted);
  }
}

function toast(msg) {
  state.message = msg;
  state.messageTimer = 2.4;
}

// ---- mission logic -------------------------------------------------------
function currentMission() { return MISSIONS[state.mission] || null; }

function updateMarker() {
  const m = currentMission();
  if (!m) { marker.visible = false; return; }
  marker.visible = true;
  marker.position.set(m.target.x, 0.7 + Math.sin(state.time * 2) * 0.3, m.target.z);
}

function checkMission() {
  const m = currentMission();
  if (!m) return;
  if (m.needCar && !player.inCar) return;
  if (m.needStars && state.wanted < m.needStars) return;
  const d = Math.hypot(player.pos.x - m.target.x, player.pos.z - m.target.z);
  if (d < m.radius) {
    state.money += m.reward;
    state.completed += 1;
    state.mission += 1;
    save.money = state.money;
    save.mission = state.mission;
    save.completed = state.completed;
    try { localStorage.setItem(SAVE_KEY, JSON.stringify(save)); } catch {}
    toast(m.title + ' COMPLETE  +$' + m.reward);
    if (state.mission >= MISSIONS.length) {
      state.phase = 'end';
      showOverlay('end');
    }
  }
}

// ---- damage & police AI --------------------------------------------------
function takeDamage(amount) {
  state.health = Math.max(0, state.health - amount);
  if (state.health <= 0 && !state.gameOver) {
    state.gameOver = true;
    state.phase = 'end';
    showOverlay('end');
  }
}

function updatePolice(dt) {
  for (const p of police) {
    const dx = player.pos.x - p.group.position.x;
    const dz = player.pos.z - p.group.position.z;
    const dist = Math.hypot(dx, dz) || 1;
    const targetHeading = Math.atan2(dx, dz);
    p.group.rotation.y = targetHeading;
    p.speed = Math.min(CFG.car.topSpeed * 0.92, p.speed + CFG.car.accel * dt);
    p.group.position.x += Math.sin(targetHeading) * p.speed * dt;
    p.group.position.z += Math.cos(targetHeading) * p.speed * dt;
    if (p.bar) p.bar.material.color.setHex(Math.floor(state.time * 6) % 2 ? PAL.neonPink : 0x3355ff);
    if (dist < 4.5 && state.time % 1.2 < dt) takeDamage(6);
  }
}

function updateBullets(dt) {
  for (let i = bullets.length - 1; i >= 0; i--) {
    const b = bullets[i];
    b.mesh.position.addScaledVector(b.vel, dt);
    b.life -= dt;
    let hit = false;
    for (let j = police.length - 1; j >= 0; j--) {
      if (b.mesh.position.distanceTo(police[j].group.position) < 3) {
        scene.remove(police[j].group);
        police.splice(j, 1);
        hit = true;
        break;
      }
    }
    if (b.life <= 0 || hit) {
      scene.remove(b.mesh);
      bullets.splice(i, 1);
    }
  }
}

// ---- overlays & HUD ------------------------------------------------------
const elStart = document.getElementById('start');
const elEnd = document.getElementById('end');
const elHud = document.getElementById('hud');
const elHealth = document.getElementById('health-fill');
const elStars = document.getElementById('stars');
const elMission = document.getElementById('mission');
const elMsg = document.getElementById('toast');
const elStats = document.getElementById('stats');
const mini = document.getElementById('minimap');
const mctx = mini.getContext('2d');

function showOverlay(which) {
  elStart.classList.toggle('hidden', which !== 'start');
  elEnd.classList.toggle('hidden', which !== 'end');
  elHud.classList.toggle('hidden', which === 'start');
  if (which === 'end') {
    document.getElementById('end-stats').textContent =
      `Jobs cleared: ${state.completed}/${MISSIONS.length}   Cash: $${state.money}`;
  }
}

function drawMinimap() {
  const w = mini.width, h = mini.height;
  mctx.clearRect(0, 0, w, h);
  mctx.fillStyle = 'rgba(12,10,24,0.72)';
  mctx.fillRect(0, 0, w, h);
  const scale = w / (CFG.city.half * 2);
  const px = (x) => (x + CFG.city.half) * scale;
  const pz = (z) => (z + CFG.city.half) * scale;
  mctx.strokeStyle = 'rgba(180,180,210,0.18)';
  mctx.lineWidth = 1;
  for (let x = -CFG.city.half; x <= CFG.city.half; x += CFG.city.block) {
    mctx.beginPath(); mctx.moveTo(px(x), 0); mctx.lineTo(px(x), h); mctx.stroke();
    mctx.beginPath(); mctx.moveTo(0, pz(x)); mctx.lineTo(w, pz(x)); mctx.stroke();
  }
  // harbour water
  mctx.fillStyle = 'rgba(40,90,140,0.5)';
  mctx.fillRect(0, pz(CFG.city.seaZ), w, h - pz(CFG.city.seaZ));
  // mission marker
  const m = currentMission();
  if (m) {
    mctx.fillStyle = '#ffd23f';
    mctx.beginPath(); mctx.arc(px(m.target.x), pz(m.target.z), 4, 0, Math.PI * 2); mctx.fill();
  }
  // police
  mctx.fillStyle = '#ff2d95';
  for (const p of police) mctx.fillRect(px(p.group.position.x) - 2, pz(p.group.position.z) - 2, 4, 4);
  // player
  mctx.fillStyle = '#2ee6f2';
  mctx.save();
  mctx.translate(px(player.pos.x), pz(player.pos.z));
  mctx.rotate(-player.heading);
  mctx.beginPath(); mctx.moveTo(0, -6); mctx.lineTo(4, 5); mctx.lineTo(-4, 5); mctx.closePath(); mctx.fill();
  mctx.restore();
  mctx.strokeStyle = 'rgba(255,255,255,0.35)';
  mctx.strokeRect(0.5, 0.5, w - 1, h - 1);
}

function updateHud() {
  elHealth.style.width = state.health + '%';
  elHealth.style.background = state.health > 40 ? '#2ecc71' : '#e74c3c';
  elStars.textContent = '★'.repeat(state.wanted) + '☆'.repeat(CFG.wanted.stars - state.wanted);
  const m = currentMission();
  elMission.textContent = m ? `${m.title} — ${m.brief}` : 'ALL JOBS CLEAR — free roam';
  elMsg.textContent = state.messageTimer > 0 ? state.message : '';
  elStats.textContent = `$${state.money}  |  ${state.completed}/${MISSIONS.length} jobs`;
  drawMinimap();
}

// ---- controls ------------------------------------------------------------
function handleControls(dt) {
  if (state.phase !== 'play') {
    if (input.justPressed('Enter') || input.justPressed('Space')) {
      if (state.phase === 'end') {
        state.phase = 'play';
        state.health = CFG.player.maxHealth;
        state.gameOver = false;
      } else {
        state.phase = 'play';
        input.lock();
      }
      showOverlay(null);
    }
    return;
  }

  // enter / exit vehicle
  if (input.justPressed('KeyE')) {
    if (!player.inCar && player.pos.distanceTo(playerCar.group.position) < 6) {
      player.inCar = true;
      player.car = playerCar;
      toast('CARJACKED — +2 WANTED');
      state.wanted = Math.max(state.wanted, CFG.wanted.carjackStars);
    } else if (player.inCar) {
      player.inCar = false;
      player.pos.set(playerCar.group.position.x + 3, 0, playerCar.group.position.z);
      avatar.position.copy(player.pos);
      avatar.visible = true;
      player.car = null;
    }
  }

  const turn = (input.isDown('KeyA') ? 1 : 0) - (input.isDown('KeyD') ? 1 : 0);
  const fwd = (input.isDown('KeyW') ? 1 : 0) - (input.isDown('KeyS') ? 1 : 0);

  if (player.inCar) {
    carSpeed += turn * CFG.car.turnRate * dt * 12;
    carSpeed = THREE.MathUtils.clamp(carSpeed, -CFG.car.reverse, CFG.car.topSpeed);
    if (fwd > 0) carSpeed += CFG.car.accel * dt;
    else if (fwd < 0) carSpeed -= CFG.car.brake * dt;
    // natural drag: lift off the pedals and the car coasts to a stop
    carSpeed -= carSpeed * CFG.car.drag * dt * 0.15;
    player.heading += turn * CFG.car.turnRate * dt * (carSpeed > 0 ? 1 : -1);
    playerCar.group.rotation.y = player.heading;
    playerCar.group.position.x += Math.sin(player.heading) * carSpeed * dt;
    playerCar.group.position.z += Math.cos(player.heading) * carSpeed * dt;
    player.pos.copy(playerCar.group.position);
    avatar.visible = false;
  } else {
    const running = input.isDown('ShiftLeft') || input.isDown('ShiftRight');
    const speed = running ? CFG.player.run : CFG.player.walk;
    player.heading += turn * 3.2 * dt;
    player.pos.x += Math.sin(player.heading) * fwd * speed * dt;
    player.pos.z += Math.cos(player.heading) * fwd * speed * dt;
    avatar.position.copy(player.pos);
    avatar.rotation.y = player.heading;
  }

  // wanted cool-down when not committing crimes
  if (state.wanted > 0) {
    state.cleanTime += dt;
    if (state.cleanTime > CFG.wanted.coolDown) {
      state.cleanTime = 0;
      state.wanted -= 1;
      toast('WANTED LEVEL ' + state.wanted);
    }
  } else state.cleanTime = 0;

  if (input.mouse.left) fire();
  updateMarker();
  checkMission();
}

// ---- apply deterministic shot preset ------------------------------------
if (shot) {
  if (shot.police) {
    state.wanted = Math.max(state.wanted, shot.police);
  }
  spawnPolice();
  if (shot.inCar) {
    player.inCar = true;
    playerCar.group.position.set(player.pos.x, 0, player.pos.z);
    playerCar.group.rotation.y = player.heading;
    player.pos.copy(playerCar.group.position);
    avatar.visible = false;
  }
  updateMarker();
  showOverlay(shot.overlay);
} else {
  showOverlay('start');
}

// ---- main loop -----------------------------------------------------------
let last = performance.now();
function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  state.time += dt;
  state.fireTimer = Math.max(0, state.fireTimer - dt);
  state.messageTimer = Math.max(0, state.messageTimer - dt);

  handleControls(dt);
  updateTraffic(traffic, dt);
  updatePedestrians(peds, dt, state.time);
  updatePolice(dt);
  updateBullets(dt);
  followCamera(camera, player.pos, player.heading, dt, !!shot && shot.overlay !== null);
  updateHud();
  input.consume();
  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
