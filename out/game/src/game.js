// The game object ties the pieces together: world, traffic, crowd, police, player,
// missions, heat, money, saving and the four screen states.

import { CARS, HEAT, GAME, PLAYER, SAVE_KEY, MISSION_ORDER, MISSION_META } from './config.js';
import { Rng, clamp, lerp } from './random.js';
import { createStage, createRenderer, resize, makeGlowTexture } from './render.js';
import { buildWorld, districtAt } from './world.js';
import { Vehicle, Traffic, Police } from './vehicles.js';
import { Crowd, Effects, Pickup } from './actors.js';
import { Player } from './player.js';
import { Hud } from './hud.js';
import { AudioEngine } from './audio.js';
import { MissionRunner, dist } from './missions.js';

const THREE = globalThis.THREE;

export class Game {
  constructor(opts = {}) {
    this.canvas = opts.canvas;
    this.seed = opts.seed ?? 1;
    this.capture = !!opts.capture;
    this.rng = new Rng(this.seed);
    this.actors = { Pickup };

    this.renderer = createRenderer(this.canvas, { capture: this.capture });
    this.stage = createStage();
    this.world = buildWorld(this.stage, this.seed);
    this.hud = new Hud(document);
    this.hud.setMapLayer(this.world.minimap);
    this.audio = new AudioEngine();
    this.input = opts.input;
    this.glowTex = makeGlowTexture();

    this.traffic = new Traffic(this.stage.scene, this.world, this.rng.fork('traffic'), 18);
    this.crowd = new Crowd(this.stage.scene, this.world, this.rng.fork('crowd'), 34);
    this.effects = new Effects(this.stage.scene);
    this.player = new Player(this.stage, this.world, this.input, this.audio);
    this.police = new Police(this.stage.scene, this.world, this.rng.fork('police'), this);
    this.mission = new MissionRunner(this);

    this.time = 0;
    this.money = GAME.startMoney;
    this.heat = 0;
    this.stars = 0;
    this.quiet = 0;
    this.state = 'menu';
    this.pickups = [];
    this.missionCar = null;
    this.autosaveTimer = 0;
    this.stats = { missions: 0, arrests: 0, stolen: 0, kills: 0 };
    this.cameraShake = 0;
    this.blips = [];
    this.frame = 0;

    this.spawnMissionCar();
    this.spawnMedkits();
    this.bindUi();
    this.hud.setMoney(this.money);
    this.hud.setStars(0);
    this.hud.show(false);
    this.hud.screen('menu');
    this.refreshContinue();
  }

  bindUi() {
    const d = document;
    const on = (id, fn) => {
      const el = d.getElementById(id);
      if (el) el.addEventListener('click', (e) => { e.stopPropagation(); fn(); });
    };
    on('btn-new', () => this.startNew());
    on('btn-continue', () => this.continueGame());
    on('btn-resume', () => this.resume());
    on('btn-save', () => { this.save(); this.hud.toast('PROGRESS SAVED'); });
    on('btn-quit', () => this.toMenu());
    on('btn-respawn', () => this.respawn());
    on('btn-free', () => this.resumeFromEnd());
    on('btn-again', () => this.startNew());
  }

  refreshContinue() {
    const btn = document.getElementById('btn-continue');
    if (!btn) return;
    const has = !!this.readSave();
    btn.disabled = !has;
    btn.textContent = has ? 'CONTINUE' : 'NO SAVE';
  }

  spawnMissionCar() {
    const s = this.world.spots.dockCar;
    const car = new Vehicle(this.stage.scene, 'coupe', CARS.coupe.colors[0], s.x, s.z, s.heading, {
      name: 'Marlin GT', missionCar: true, parked: true,
    });
    car.missionCar = true;
    car.mesh.userData.mission = true;
    this.missionCar = car;
  }

  spawnMedkits() {
    for (const s of this.world.spots.medkits) {
      const p = new Pickup(this.stage.scene, 'medkit', s.x, s.z, this.glowTex);
      this.pickups.push(p);
    }
  }

  // --- screens ---------------------------------------------------------------

  startNew() {
    this.audio.ensure();
    this.money = GAME.startMoney;
    this.heat = 0;
    this.time = 0;
    this.stats = { missions: 0, arrests: 0, stolen: 0, kills: 0 };
    this.player.health = PLAYER.health;
    this.player.pos.x = this.world.spots.start.x;
    this.player.pos.z = this.world.spots.start.z;
    this.player.heading = this.world.spots.start.heading;
    this.player.yaw = this.player.heading + Math.PI;
    this.player.dead = false;
    this.player.vehicle = null;
    this.police.clear();
    this.mission.clearThugs();
    this.mission.clearCrates();
    this.mission.index = -1;
    this.mission.active = false;
    this.mission.step = 0;
    this.mission.kills = 0;
    this.mission.crates = 0;
    this.mission.marker.place(null);
    this.enterPlay();
    this.mission.start(0);
    this.save();
    this.hud.setFade(false);
  }

  continueGame() {
    const data = this.readSave();
    if (!data) return;
    this.audio.ensure();
    this.applySave(data);
    this.enterPlay();
    this.hud.toast('WELCOME BACK');
    if (this.mission.index >= 0 && this.mission.active) this.mission.refreshHud();
  }

  enterPlay() {
    this.state = 'playing';
    this.hud.show(true);
    this.hud.screen(null);
    this.hud.setFade(false);
    this.hud.setHealth(this.player.health);
    this.hud.setMoney(this.money);
    this.hud.setStars(0);
    this.hud.crosshair(true);
    this.audio.setEngine(false);
    this.audio.setSiren(false);
    if (!this.capture) this.input.requestLock();
    this.refreshContinue();
  }

  resume() {
    if (this.state !== 'paused') return;
    this.enterPlay();
  }

  pause() {
    if (this.state !== 'playing') return;
    this.state = 'paused';
    this.save();
    this.hud.screen('pause');
    this.input.releaseLock();
  }

  toMenu() {
    this.state = 'menu';
    this.save();
    this.hud.show(false);
    this.hud.screen('menu');
    this.hud.setFade(false);
    this.input.releaseLock();
    this.refreshContinue();
  }

  onPlayerDown() {
    if (this.state !== 'playing') return;
    this.state = 'wasted';
    this.hud.screen('wasted');
    this.hud.crosshair(false);
    this.input.releaseLock();
    this.audio.setEngine(false);
    this.audio.sting('fail');
    this.heat = 0;
    this.police.clear();
  }

  respawn() {
    this.money = Math.max(0, this.money - GAME.respawnCost);
    this.player.health = PLAYER.respawnHealth;
    this.player.dead = false;
    this.player.pos.x = this.world.spots.start.x;
    this.player.pos.z = this.world.spots.start.z;
    this.player.heading = this.world.spots.start.heading;
    this.player.yaw = this.player.heading + Math.PI;
    if (this.player.vehicle) this.player.exit();
    this.heat = 0;
    this.police.clear();
    this.enterPlay();
    this.hud.setHealth(this.player.health);
    this.hud.setMoney(this.money);
    this.save();
  }

  completeMission(index, reward) {
    this.money += reward;
    this.stats.missions = Math.max(this.stats.missions, index + 1);
    this.hud.setMoney(this.money);
    this.hud.toast(`JOB PAID · $${reward.toLocaleString('en-US')}`);
    this.audio.sting('win');
    this.stats.missions = index + 1;
    if (index + 1 < MISSION_ORDER.length) {
      window.setTimeout(() => {
        if (this.state === 'playing') this.mission.start(index + 1);
      }, 3200);
    } else {
      window.setTimeout(() => this.showEnd(), 1600);
    }
    this.save();
  }

  showEnd() {
    if (this.state === 'end') return;
    this.state = 'end';
    this.hud.crosshair(false);
    this.hud.screen('end');
    this.hud.setFade(false);
    this.input.releaseLock();
    this.hud.setEndStats({ money: this.money, missions: this.stats.missions, time: this.time });
    this.audio.sting('win');
    this.save();
  }

  resumeFromEnd() {
    this.state = 'playing';
    this.hud.screen(null);
    this.hud.crosshair(true);
    this.input.requestLock();
  }

  // --- heat ------------------------------------------------------------------

  addHeat(amount, reason) {
    if (this.state !== 'playing') return;
    const before = Math.floor(this.heat);
    this.heat = clamp(this.heat + amount, 0, HEAT.max);
    this.quiet = 0;
    const after = Math.floor(this.heat);
    if (after > before) {
      this.audio.sting('wanted');
      this.hud.toast(reason ? `WANTED ${after}★ · ${reason}` : `WANTED ${after}★`);
    }
    this.hud.setStars(after);
    this.stars = after;
  }

  updateHeat(dt) {
    const near = this.police.units.some((u) => !u.car.dead && dist(u.car, this.player) < HEAT.spotlight);
    if (near) {
      this.quiet = 0;
    } else {
      this.quiet += dt;
    }
    if (this.quiet > HEAT.decayDelay && this.heat > 0) {
      this.heat = Math.max(0, this.heat - HEAT.decayIdle * dt);
      this.hud.setStars(Math.floor(this.heat));
      this.stars = Math.floor(this.heat);
    }
    const anySiren = this.police.units.length > 0;
    this.audio.setSiren(anySiren);
  }

  // --- vehicles --------------------------------------------------------------

  allVehicles() {
    const out = this.traffic.cars.slice();
    for (const p of this.traffic.parked) out.push(p);
    for (const u of this.police.units) out.push(u.car);
    if (this.missionCar) out.push(this.missionCar);
    return out;
  }

  nearestVehicle(maxDist = 4.6) {
    let best = null;
    let bestD = maxDist;
    for (const car of this.allVehicles()) {
      if (car.dead || car === this.player.vehicle) continue;
      const d = Math.hypot(car.x - this.player.pos.x, car.z - this.player.pos.z);
      if (d < bestD) { bestD = d; best = car; }
    }
    return best;
  }

  tryEnterVehicle() {
    const car = this.nearestVehicle(4.8);
    if (!car) return;
    const occupied = car.driver === 'ai' || car.driver === 'police';
    if (occupied) {
      this.addHeat(car.driver === 'police' ? HEAT.perCopHit * 1.6 : HEAT.perCarjack, 'CARJACKING');
      this.stats.stolen++;
      this.crowd.scare({ x: car.x, z: car.z });
      this.audio.impact(0.3);
      this.traffic.removeAt(car);
      const pi = this.traffic.parked.indexOf(car);
      if (pi >= 0) this.traffic.parked.splice(pi, 1);
      if (car.driver === 'police') {
        const ui = this.police.units.findIndex((u) => u.car === car);
        if (ui >= 0) this.police.units.splice(ui, 1);
      }
    }
    car.parked = false;
    this.player.enter(car);
    this.hud.toast(`${car.name} · ${occupied ? 'STOLEN' : 'TAKEN'}`);
    this.audio.blip(520);
    this.save();
  }

  tryExitVehicle() {
    if (!this.player.vehicle) return;
    this.player.exit();
    this.save();
  }

  // --- combat ----------------------------------------------------------------

  targets() {
    const out = [];
    const THREEV = THREE.Vector3;
    for (const p of this.crowd.peds) {
      if (!p.alive) continue;
      const ped = p;
      out.push({
        ref: ped,
        alive: true,
        aimPoint: () => new THREEV(ped.pos.x, 1.05, ped.pos.z),
        hitRadius: () => 0.52,
        hit: (dmg) => {
          const died = ped.hit(dmg);
          if (died) this.onPedDown(ped);
          return died;
        },
      });
    }
    for (const u of this.police.units) {
      const car = u.car;
      if (car.dead) continue;
      out.push({
        ref: car,
        alive: true,
        aimPoint: () => new THREEV(car.x, 1.0, car.z),
        hitRadius: () => 2.0,
        hit: (dmg) => {
          const boom = car.damage(dmg);
          this.effects.burst(new THREEV(car.x, 1.1, car.z), '#ffd08a', 4, 3);
          if (boom) this.explodeCar(car);
          return boom;
        },
      });
    }
    for (const car of this.traffic.cars) {
      if (car.dead) continue;
      out.push({
        ref: car,
        alive: true,
        aimPoint: () => new THREEV(car.x, 0.9, car.z),
        hitRadius: () => 1.6,
        hit: (dmg) => {
          const boom = car.damage(dmg);
          if (boom) this.explodeCar(car);
          return boom;
        },
      });
    }
    return out;
  }

  onBulletHit(target, point) {
    if (target.ref && target.ref.hostile) this.addHeat(HEAT.perShooting * 0.4, 'SHOTS FIRED');
    else if (target.ref && target.ref.kind && !target.ref.hostile) this.addHeat(HEAT.perShooting * 0.5, 'SHOTS FIRED');
  }

  onPedDown(ped) {
    this.stats.kills++;
    this.effects.burst(new THREE.Vector3(ped.pos.x, 1, ped.pos.z), '#ff8a6a', 5, 2.4);
    if (ped.hostile) {
      this.mission.onThugDown();
      this.addHeat(HEAT.perKill * 0.5, 'CREW DOWN');
    } else {
      this.addHeat(HEAT.perKill, 'CIVILIAN DOWN');
    }
  }

  policeShoot(car, player) {
    const from = new THREE.Vector3(car.x, 1.2, car.z);
    const to = new THREE.Vector3(player.pos.x, 1.1, player.pos.z);
    const d = from.distanceTo(to);
    const hitChance = clamp(1 - d / 55, 0.12, 0.72);
    const aim = to.clone();
    if (Math.random() > hitChance) {
      aim.x += (Math.random() - 0.5) * 3;
      aim.z += (Math.random() - 0.5) * 3;
    }
    this.effects.tracer(from, aim, '#ffd0a0');
    this.effects.flash(from, '#ffd9a0', 1.1);
    this.audio.gunshot(0.28);
    if (Math.random() < hitChance) {
      this.player.damage(7 + Math.random() * 6, this);
      this.hud.setHealth(this.player.health);
      this.cameraShake = Math.max(this.cameraShake, 0.22);
    }
  }

  thugShoot(thug) {
    const from = new THREE.Vector3(thug.pos.x, 1.2, thug.pos.z);
    const to = new THREE.Vector3(this.player.pos.x, 1.1, this.player.pos.z);
    const d = from.distanceTo(to);
    const hitChance = clamp(1 - d / 50, 0.10, 0.6);
    const aim = to.clone();
    if (Math.random() > hitChance) {
      aim.x += (Math.random() - 0.5) * 4;
      aim.z += (Math.random() - 0.5) * 4;
    }
    this.effects.tracer(from, aim, '#ffb080');
    this.effects.flash(from, '#ffc080', 0.9);
    this.audio.gunshot(0.22);
    if (Math.random() < hitChance) {
      this.player.damage(5 + Math.random() * 5, this);
      this.hud.setHealth(this.player.health);
      this.cameraShake = Math.max(this.cameraShake, 0.18);
    }
  }

  explodeCar(car) {
    this.effects.burst(new THREE.Vector3(car.x, 1.4, car.z), '#ffb066', 16, 9);
    this.effects.smoke(new THREE.Vector3(car.x, 1.6, car.z));
    this.audio.impact(0.8);
    car.dead = true;
    car.mesh.visible = false;
    if (this.player.vehicle === car) {
      this.player.exit();
      this.player.damage(45, this);
    }
    if (dist(car, this.player) < 8) this.player.damage(12, this);
    this.hud.setHealth(this.player.health);
    this.traffic.removeAt(car);
  }

  onPoliceArrive(car) {
    this.hud.toast('PATROL INBOUND');
  }

  // --- saving ----------------------------------------------------------------

  save() {
    if (this.state === 'menu') return;
    try {
      const data = {
        version: 1,
        seed: this.seed,
        money: this.money,
        time: this.time,
        heat: this.heat,
        health: this.player.health,
        pos: { x: this.player.pos.x, z: this.player.pos.z },
        heading: this.player.heading,
        mission: this.mission.toSave(),
        stats: this.stats,
      };
      window.localStorage.setItem(SAVE_KEY, JSON.stringify(data));
    } catch (err) {
      // a browser with storage disabled still plays; it just cannot continue
    }
  }

  readSave() {
    try {
      const raw = window.localStorage.getItem(SAVE_KEY);
      if (!raw) return null;
      const data = JSON.parse(raw);
      if (!data || data.version !== 1) return null;
      return data;
    } catch (err) {
      return null;
    }
  }

  applySave(data) {
    this.money = data.money ?? GAME.startMoney;
    this.time = data.time ?? 0;
    this.heat = data.heat ?? 0;
    this.player.health = data.health ?? PLAYER.health;
    this.player.dead = false;
    this.player.pos.x = data.pos?.x ?? this.world.spots.start.x;
    this.player.pos.z = data.pos?.z ?? this.world.spots.start.z;
    this.player.heading = data.heading ?? 0;
    this.player.yaw = this.player.heading + Math.PI;
    this.stats = data.stats ?? this.stats;
    this.mission.fromSave(data.mission);
    this.hud.setMoney(this.money);
    this.hud.setHealth(this.player.health);
    this.hud.setStars(Math.floor(this.heat));
    if (this.mission.active && this.mission.index >= 0) {
      if (MISSION_ORDER[this.mission.index] === 'harbor_lights' && this.mission.step >= 1) {
        this.mission.spawnThugs(this, 4);
      }
    }
  }

  // --- loop ------------------------------------------------------------------

  update(dt) {
    if (this.state !== 'playing') {
      this.stage.update(dt, this.player.pos);
      if (this.state === 'menu' || this.state === 'end') this.demoCamera(dt);
      this.effects.update(dt);
      return;
    }

    this.time += dt;
    this.frame++;
    const reduced = dt;

    this.player.update(reduced, this);
    this.traffic.update(reduced, this.player, this);
    this.crowd.update(reduced, this.player);
    this.police.update(reduced, this.player);
    this.mission.update(reduced);
    this.updateHeat(reduced);
    this.stage.update(reduced, this.player.pos);

    for (const p of this.pickups) {
      p.update(reduced, this.time);
      if (p.taken) continue;
      const d = Math.hypot(p.x - this.player.pos.x, p.z - this.player.pos.z);
      if (d < 2.2) {
        if (p.kind === 'medkit') {
          if (this.player.health < PLAYER.health) {
            this.player.heal(GAME.medkitHeal);
            p.take(this.stage.scene);
            this.hud.setHealth(this.player.health);
            this.hud.toast('MEDKIT');
            this.audio.blip(880);
          }
        }
      }
    }

    // mission crates
    if (MISSION_ORDER[this.mission.index] === 'big_haul' && this.mission.active) {
      for (const p of this.mission._cratePickups) {
        if (p.taken) continue;
        p.update(reduced, this.time);
        const d = Math.hypot(p.x - this.player.pos.x, p.z - this.player.pos.z);
        if (d < 3.0) {
          p.take(this.stage.scene);
          this.mission.crates++;
          this.hud.toast(`CARGO ${this.mission.crates}/3`);
          this.audio.blip(700);
          this.mission.refreshHud();
        }
      }
    }

    this.effects.update(reduced);
    this.updateHud();
    this.autosaveTimer += reduced;
    if (this.autosaveTimer > GAME.autosave) {
      this.autosaveTimer = 0;
      this.save();
    }

    if (this.cameraShake > 0) {
      this.cameraShake = Math.max(0, this.cameraShake - reduced * 2);
      const cam = this.stage.camera;
      cam.position.x += (Math.random() - 0.5) * this.cameraShake * 0.5;
      cam.position.y += (Math.random() - 0.5) * this.cameraShake * 0.5;
    }
  }

  updateHud() {
    const p = this.player;
    this.hud.setHealth(p.health);
    this.hud.setSpeed(p.vehicle ? p.vehicle.speedKmh : 0);
    this.hud.updateDistrict(p.pos.x, p.pos.z);
    if (p.vehicle) {
      this.hud.crosshair(false);
      this.hud.prompt(p.vehicle.spec.name.toUpperCase());
    } else {
      const near = this.nearestVehicle(4.8);
      this.hud.prompt(near ? `E · ENTER ${near.name.toUpperCase()}` : null);
      this.hud.crosshair(true);
    }

    const blips = [];
    if (this.mission.active) {
      const steps = this.mission.currentSteps;
      const step = steps && steps[this.mission.step];
      const t = step && step.target ? step.target(this) : null;
      if (t) blips.push({ x: t.x, z: t.z, kind: 'mission', color: '#f2a541' });
    }
    for (const u of this.police.units) {
      if (!u.car.dead) blips.push({ x: u.car.x, z: u.car.z, kind: 'police', color: '#ff5c6c' });
    }
    this.hud.drawMinimap(this.player, blips, this.world);
  }

  demoCamera(dt) {
    const cam = this.stage.camera;
    const t = this.stage.time * 0.04;
    const r = 260;
    cam.position.set(Math.cos(t) * r, 86, Math.sin(t) * r - 30);
    cam.lookAt(0, 8, 0);
  }

  render() {
    this.renderer.render(this.stage.scene, this.stage.camera);
  }

  onResize() {
    resize(this.renderer, this.stage.camera);
  }
}
