// Boot and the one loop: the city is built from the seed, the player is dropped on the harborfront,
// and the world advances in fixed 1/60 s steps whatever the display does. Screens are title, play,
// paused, wasted and busted; `?shot=start|play|heat|end&seed=N` stages one of them for a screenshot.
import * as THREE from '../vendor/three.min.js';
import { VIEW, STEP, MONEY_START, SAVE_KEY, WEAPONS } from './config.js';
import { createRandom } from './random.js';
import { createCity } from './city.js';
import { createSky } from './sky.js';
import { createEffects } from './effects.js';
import { createAudio } from './audio.js';
import { createHud } from './hud.js';
import { createTraffic } from './traffic.js';
import { createPlayer } from './player.js';
import { createPolice } from './police.js';
import { createCombat } from './combat.js';
import { createMissions } from './missions.js';
import { ACTION_ENTER, ACTION_MUTE, ACTION_PAUSE, ACTION_QUIT, ACTION_WEAPON_1, ACTION_WEAPON_2, ACTION_RELOAD, createInput } from './input.js';
import { stageShot } from './shots.js';

const MAX_FRAME = 0.2;
const SPAWN = { x: 96, z: 371, heading: -Math.PI / 2 };

const params = new URLSearchParams(window.location.search);
const shotName = params.get('shot');
const seedParam = Number.parseInt(params.get('seed') ?? '', 10);
const seed = Number.isInteger(seedParam) ? seedParam : 1;

const canvas = document.getElementById('game');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
renderer.setSize(window.innerWidth, window.innerHeight, false);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(70, VIEW.width / VIEW.height, 0.12, 2800);

const city = createCity(scene, createRandom(seed));
const sky = createSky(scene, renderer);
const effects = createEffects(scene);
const audio = createAudio();
const hud = createHud();
const traffic = createTraffic(scene, city, createRandom(seed * 7919 + 13));
const player = createPlayer(scene, city, audio);
const police = createPolice(scene, city, audio, effects);
const combat = createCombat(effects, audio, city);
const missions = createMissions(scene, city, audio);
const input = createInput(canvas);

const game = { city, sky, effects, audio, hud, traffic, player, police, combat, missions, money: MONEY_START, clock: 0 };
let screen = 'title';
let money = MONEY_START;
let respawnTimer = 0;
let saveTimer = 0;
let accumulator = 0;
let last = performance.now();
let mutedToast = false;

/* ------------------------------------------------------------------ save */

function readSave() {
  try {
    const raw = window.localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch (e) {
    return null;
  }
}

function writeSave() {
  try {
    window.localStorage.setItem(SAVE_KEY, JSON.stringify({
      money,
      mission: missions.index,
      weapon: combat.name,
      ammo: combat.state.ammo,
      magazine: combat.state.magazine,
      savedAt: Date.now(),
    }));
  } catch (e) {
    /* storage can be off; the shift then lasts one visit */
  }
}

/* ------------------------------------------------------------------ screens */

function beginShift() {
  const save = readSave();
  if (save && Number.isFinite(save.money)) {
    money = save.money;
    if (save.weapon && WEAPONS[save.weapon]) combat.select(save.weapon);
    if (save.ammo) combat.state.ammo = { ...combat.state.ammo, ...save.ammo };
    if (save.magazine) combat.state.magazine = { ...combat.state.magazine, ...save.magazine };
  }
  player.spawn(SPAWN.x, SPAWN.z, SPAWN.heading, false);
  player.state.hp = 100;
  player.state.armor = 40;
  screen = 'play';
  hud.showTitle(false);
  hud.setVisible(true);
  hud.say('<b>Wren</b> &nbsp;Under the wheel. Bring a car and an appetite.', 5.5);
  hud.toast('Shift started');
  audio.play('pickup');
  input.lock();
  last = performance.now();
}

function toTitle() {
  screen = 'title';
  hud.showTitle(true);
  hud.showPause(false);
  hud.setVisible(false);
  hud.setBest(money > MONEY_START ? `Last shift: $${money.toLocaleString('en-US')}` : 'No shift yet');
  player.spawn(SPAWN.x, SPAWN.z, SPAWN.heading, false);
  input.unlock();
}

function pause(on) {
  if (screen === 'play' && on) {
    screen = 'paused';
    hud.showPause(true);
    input.unlock();
    writeSave();
  } else if (screen === 'paused' && !on) {
    screen = 'play';
    hud.showPause(false);
    input.lock();
  }
}

function wasted(reason) {
  if (screen !== 'play') return;
  screen = 'over';
  hud.banner(reason === 'busted' ? 'Busted' : 'Wasted', reason === 'busted' ? 'The harbor police win this one' : 'The harbor moves on', 4);
  hud.setVisible(true);
  audio.play('fail');
  money = Math.max(0, money - 120);
  respawnTimer = 3.4;
  input.unlock();
}

function respawn() {
  player.spawn(SPAWN.x, SPAWN.z, SPAWN.heading, false);
  player.state.hp = 100;
  player.state.armor = 30;
  police.clear();
  missions.clearGang();
  screen = 'play';
  hud.banner('', '', 0.01);
  hud.setVisible(true);
  hud.say('You walked it off. Mostly.', 3);
  input.lock();
  writeSave();
}

/* ------------------------------------------------------------------ the world's frame */

const worldCtx = {
  camera,
  armed: false,
  onCrash(power) {
    police.crime(1.1);
    hud.hurt();
  },
  onSkid(state) {
    effects.smoke(new THREE.Vector3(state.x, 0.1, state.z), 1, 0x6b6a70);
  },
};

function grant(amount, title) {
  money += amount;
  hud.banner('Mission passed', amount > 0 ? `+$${amount.toLocaleString('en-US')}` : title ?? '', 4.4);
  hud.toast(`${title ?? 'Job'} complete`);
  audio.play('mission');
  writeSave();
}

function interact() {
  if (player.state.onFoot) {
    const car = traffic.carNear(player.state, 4.6);
    if (car) {
      traffic.remove(car);
      player.enter(car);
      audio.play('horn');
      hud.toast(`Hot-wired the ${car.kind}`);
      police.crime(car.parked ? 0.35 : 1.0);
      worldCtx.armed = true;
      return;
    }
    hud.toast('Nothing to take here');
  } else {
    // Step out on the driver's side and leave the car parked.
    const side = { x: player.state.x - Math.cos(player.state.heading) * 1.8, z: player.state.z + Math.sin(player.state.heading) * 1.8 };
    traffic.abandon(side.x, side.z, player.state.heading, player.carKind);
    player.exit();
    player.state.x = side.x;
    player.state.z = side.z;
  }
}

function handleActions() {
  const actions = input.takeActions();
  if (actions & ACTION_MUTE) {
    const off = audio.toggleMute();
    mutedToast = true;
    hud.toast(off ? 'Sound off' : 'Sound on');
  }
  if (screen === 'title') {
    if (actions & (ACTION_ENTER | 1)) beginShift();
    return;
  }
  if (screen === 'over') return;
  if (actions & ACTION_PAUSE) {
    pause(screen === 'play');
    return;
  }
  if (screen === 'paused') {
    if (actions & ACTION_QUIT) toTitle();
    return;
  }
  if (actions & ACTION_ENTER) interact();
  if (actions & ACTION_RELOAD) combat.reload();
  if (actions & ACTION_WEAPON_1) combat.select('pistol');
  if (actions & ACTION_WEAPON_2) combat.select('smg');
  if (actions & ACTION_QUIT && screen === 'play') {
    pause(true);
  }
}

function step(dt) {
  game.clock += dt;
  game.money = money;

  if (screen === 'play') {
    worldCtx.armed = combat.name !== 'fists';
    player.update(dt, input, worldCtx);
    traffic.update(dt, { playerPos: player.state, playerOnFoot: player.state.onFoot, alarm: police.state.wanted > 0 });
    if (police.state.wanted < 0.3 && player.state.onFoot && combat.state.shots > 0) {
      // Gunfire in the street is heard even before anyone sees the gun.
      police.crime(0.3);
    }
    police.update(dt, player, {
      onPlayerHit(damage) {
        player.hurt(damage);
        hud.hurt();
      },
      onBump() {
        hud.hurt();
        police.crime(0.5);
      },
    });
    combat.update(dt, input, player, {
      traffic,
      police,
      enemies: missions.enemies,
      onCrime(amount) {
        police.crime(amount);
      },
      onShot(hit) {
        if (hit.kind === 'ped' || hit.kind === 'cop' || hit.kind === 'cruiser') hud.hitmark();
      },
    });
    missions.update(dt, {
      player,
      police,
      combat,
      spawnGang: (at, count) => missions.spawnGang(at, count),
      shootAt: (from, to) => {
        effects.tracer(from, to, 0.06, 0xffd9a0);
        effects.muzzle(from, to.clone().sub(from).normalize());
        audio.play('pistol');
        hud.hurt();
      },
      reward: (amount, title) => grant(amount, title),
      say: (line) => hud.say(line, 5),
      toast: (text) => hud.toast(text),
      notify: (text) => hud.toast(text),
    });

    // Ramming traffic: a fast car that touches another one dents both.
    if (!player.state.onFoot) {
      for (const car of traffic.cars) {
        if (!car.alive) continue;
        const d = Math.hypot(car.x - player.state.x, car.z - player.state.z);
        if (d < 3.0 && Math.abs(player.state.speed) > 6) {
          car.hp -= Math.abs(player.state.speed) * 0.6;
          player.state.speed *= 0.72;
          effects.impact(new THREE.Vector3(car.x, 0.8, car.z), new THREE.Vector3(0, 1, 0), false);
          audio.play('crash');
          player.shake(0.4);
        }
      }
    }

    if (player.state.hp <= 0) wasted(police.state.wanted > 1 ? 'busted' : 'wasted');
    saveTimer += dt;
    if (saveTimer > 25) {
      saveTimer = 0;
      writeSave();
    }
  } else if (screen === 'over') {
    respawnTimer -= dt;
    police.update(dt, player, {});
    traffic.update(dt, { playerPos: player.state, playerOnFoot: true, alarm: false });
    if (respawnTimer <= 0) respawn();
  } else if (screen === 'title') {
    // The city keeps living behind the menu.
    traffic.update(dt, { playerPos: { x: 9999, z: 9999 }, playerOnFoot: false, alarm: false });
    police.update(dt, player, {});
  }

  city.update(dt);
  effects.update(dt);
  sky.update(dt, player.state.y > -100 ? player.state : null);
  city.setCamera(camera.position);
  if (screen !== 'title') hud.update(dt, game);
}

/* ------------------------------------------------------------------ the title camera */

let titleClock = 0;
function titleCamera(dt) {
  titleClock += dt;
  const r = 250 + Math.sin(titleClock * 0.09) * 26;
  const a = 0.62 + Math.sin(titleClock * 0.055) * 0.16;
  const cx = Math.cos(a) * r - 40;
  const cz = Math.sin(a) * r - 150;
  camera.position.set(cx, 96 - Math.sin(titleClock * 0.07) * 10, cz);
  camera.lookAt(-30, 26, 240);
  camera.fov = 58;
  camera.updateProjectionMatrix();
}

/* ------------------------------------------------------------------ frame */

function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min((now - last) / 1000, MAX_FRAME);
  last = now;
  if (shotName) return;
  handleActions();
  accumulator += dt;
  let steps = 0;
  while (accumulator >= STEP && steps < 6) {
    step(STEP);
    accumulator -= STEP;
    steps += 1;
  }
  if (accumulator > STEP * 6) accumulator = 0;
  if (screen === 'title') titleCamera(dt);
  renderer.render(scene, camera);
}

/* ------------------------------------------------------------------ boot */

function resize() {
  const w = window.innerWidth;
  const h = window.innerHeight;
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  renderer.setSize(w, h, false);
}
window.addEventListener('resize', resize);
canvas.addEventListener('click', () => {
  audio.unlock();
  if (screen === 'play') input.lock();
});
window.addEventListener('keydown', () => audio.unlock(), { once: true });

// A handle for the console, and for the tools that stage and check the screenshots.
window.__viceharbor = {
  game,
  player,
  city,
  police,
  traffic,
  missions,
  combat,
  input,
  step,
  handleActions,
  writeSave,
  get screen() {
    return screen;
  },
  get money() {
    return money;
  },
};

// The cover: a starting state to look at before the first frame is drawn.
player.spawn(SPAWN.x, SPAWN.z, SPAWN.heading, false);
player.state.armor = 40;
hud.setVisible(false);
hud.setBest('No shift yet');
city.setCamera(new THREE.Vector3(0, 90, -200));
sky.update(0.016, player.state);
camera.position.set(-40, 92, -220);
camera.lookAt(-30, 26, 240);
renderer.render(scene, camera);

if (shotName) {
  stageShot(shotName, {
    ...game,
    hud,
    camera,
    renderer,
    scene,
    input,
    step,
    setScreen(next) {
      screen = next;
    },
    setMoney(value) {
      money = value;
    },
  });
} else {
  requestAnimationFrame(frame);
}
