// Three jobs, in order, each a short chain of steps: reach, steal, kill, collect,
// deliver, shake the heat. A step is a predicate plus the line the HUD shows.

import { MISSION_ORDER, MISSION_META, CARS } from './config.js';
import { clamp, Rng } from './random.js';
import { Pedestrian } from './actors.js';
import { WALK_H } from './world.js';
import { makeGlowTexture, spriteFromTexture } from './render.js';

const THREE = globalThis.THREE;

export const STEPS = {
  dock_run: [
    {
      text: 'Steal the Marlin GT parked on the east pier',
      target: (g) => g.world.spots.dockCar,
      done: (g) => g.player.vehicle && g.player.vehicle.missionCar === true,
    },
    {
      text: 'Deliver it to the safehouse garage',
      target: (g) => g.world.spots.garage,
      done: (g) => {
        if (!g.player.vehicle || !g.player.vehicle.missionCar) return false;
        const s = g.world.spots.garage;
        return dist(g.player.vehicle, s) < 9;
      },
    },
  ],
  harbor_lights: [
    {
      text: 'Drive to Salt Row and find the crew',
      target: (g) => g.world.spots.saltRow,
      done: (g) => dist(g.player, g.world.spots.saltRow) < 16,
      onEnter: (g) => g.mission.spawnThugs(g, 4),
    },
    {
      text: (g) => `Take out the Salt Row crew (${g.mission.kills}/4)`,
      target: (g) => g.mission.firstThugPos(),
      done: (g) => g.mission.kills >= 4,
    },
    {
      text: 'Lose the police',
      target: () => null,
      done: (g) => g.heat < 0.4,
    },
  ],
  big_haul: [
    {
      text: (g) => `Collect the cargo crates (${g.mission.crates}/3)`,
      target: (g) => g.mission.nextCratePos(),
      done: (g) => g.mission.crates >= 3,
    },
    {
      text: 'Load the cargo at berth nine',
      target: (g) => g.world.spots.berth9,
      done: (g) => dist(g.player, g.world.spots.berth9) < 14 && g.mission.crates >= 3,
    },
    {
      text: 'Get clear of the harbor',
      target: () => null,
      done: (g) => g.heat < 0.4 && dist(g.player, g.world.spots.berth9) > 90,
    },
  ],
};

function dist(a, b) {
  const ax = a.pos ? a.pos.x : a.x;
  const az = a.pos ? a.pos.z : a.z;
  const bx = b.pos ? b.pos.x : b.x;
  const bz = b.pos ? b.pos.z : b.z;
  return Math.hypot(ax - bx, az - bz);
}

// A crew member: stands their ground, faces the player and fires back.
export class Thug extends Pedestrian {
  constructor(scene, rng, x, z, game) {
    const route = [{ x, z }, { x: x + 2, z }, { x: x + 2, z: z + 2 }, { x, z: z + 2 }];
    super(scene, new Rng(rng.int(1, 99999)), x, z, route);
    this.game = game;
    this.post = { x, z };
    this.fireTimer = 1.2 + Math.random();
    this.hostile = true;
    this.speed = 0.6;
    this.mesh.traverse((o) => {
      if (o.isMesh && o.material && o.material.color && o.material.color.getHex() === 0x2f4858) {
        o.material = o.material.clone();
        o.material.color = new THREE.Color('#7a2f36');
      }
    });
    this.marker = spriteFromTexture(makeGlowTexture(), '#ff5c6c', 2.6, 0.35);
    this.marker.position.set(x, 2.6, z);
    scene.add(this.marker);
  }

  scare() {
    // crew do not run from gunfire
  }

  update(dt, player) {
    if (this.state === 'down') {
      super.update(dt, player);
      if (this.marker) this.marker.visible = false;
      return;
    }
    const d = dist(this, player.pos);
    const want = Math.atan2(player.pos.x - this.pos.x, player.pos.z - this.pos.z);
    let diff = (want - this.heading) % (Math.PI * 2);
    if (diff > Math.PI) diff -= Math.PI * 2;
    if (diff < -Math.PI) diff += Math.PI * 2;
    this.heading += clamp(diff, -5 * dt, 5 * dt);

    // strafe a little around the post so they are not statues
    const away = d < 7 ? -1 : 1;
    const step = this.speed * away * dt;
    this.pos.x += Math.sin(want) * step;
    this.pos.z += Math.cos(want) * step;
    this.pos.x = clamp(this.pos.x, this.post.x - 6, this.post.x + 6);
    this.pos.z = clamp(this.pos.z, this.post.z - 6, this.post.z + 6);

    this.mesh.position.set(this.pos.x, WALK_H, this.pos.z);
    this.mesh.rotation.y = this.heading;
    if (this.marker) {
      this.marker.position.set(this.pos.x, 2.7, this.pos.z);
      this.marker.material.opacity = 0.22 + Math.sin(performance.now() * 0.004) * 0.1;
    }

    this.fireTimer -= dt;
    if (d < 44 && this.fireTimer <= 0) {
      this.fireTimer = 1.1 + Math.random() * 0.9;
      this.game.thugShoot(this);
    }
  }

  dispose(scene) {
    if (this.marker) scene.remove(this.marker);
    super.dispose(scene);
  }
}

// The floating ring that marks the current objective.
class Marker {
  constructor(scene) {
    this.group = new THREE.Group();
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(2.6, 3.3, 32),
      new THREE.MeshBasicMaterial({ color: new THREE.Color('#f2a541'), transparent: true, opacity: 0.8, side: THREE.DoubleSide })
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = WALK_H + 0.08;
    this.ring = ring;
    const beam = new THREE.Mesh(
      new THREE.CylinderGeometry(0.35, 1.1, 26, 12, 1, true),
      new THREE.MeshBasicMaterial({
        color: new THREE.Color('#f2a541'), transparent: true, opacity: 0.10,
        side: THREE.DoubleSide, depthWrite: false,
      })
    );
    beam.position.y = 13;
    this.beam = beam;
    this.group.add(ring, beam);
    this.group.visible = false;
    scene.add(this.group);
  }

  place(pos) {
    if (!pos) {
      this.group.visible = false;
      return;
    }
    this.group.visible = true;
    this.group.position.set(pos.x, 0, pos.z);
  }

  update(t) {
    this.ring.scale.setScalar(1 + Math.sin(t * 2.2) * 0.05);
    this.ring.material.opacity = 0.55 + Math.sin(t * 2.2) * 0.18;
  }
}

export class MissionRunner {
  constructor(game) {
    this.game = game;
    this.index = -1;
    this.step = 0;
    this.kills = 0;
    this.crates = 0;
    this.thugs = [];
    this.elapsed = 0;
    this.active = false;
    this.marker = new Marker(game.stage.scene);
    this.timer = 0;
    this._entered = false;
    this._cratePickups = [];
  }

  get meta() {
    return this.index >= 0 ? MISSION_META[MISSION_ORDER[this.index]] : null;
  }

  get currentSteps() {
    return this.index >= 0 ? STEPS[MISSION_ORDER[this.index]] : null;
  }

  start(index) {
    if (index < 0 || index >= MISSION_ORDER.length) return;
    this.index = index;
    this.step = 0;
    this.kills = 0;
    this.crates = 0;
    this.elapsed = 0;
    this.active = true;
    this._entered = false;
    this.clearThugs();
    this.clearCrates();
    const meta = this.meta;
    this.game.hud.toast(`NEW JOB · ${meta.title}`);
    this.game.audio.sting('mission');
    this.refreshHud();
  }

  clearThugs() {
    for (const t of this.thugs) {
      t.dispose(this.game.stage.scene);
      const i = this.game.crowd.peds.indexOf(t);
      if (i >= 0) this.game.crowd.peds.splice(i, 1);
    }
    this.thugs = [];
  }

  clearCrates() {
    for (const p of this._cratePickups) {
      if (!p.taken) p.take(this.game.stage.scene);
    }
    this._cratePickups = [];
  }

  spawnThugs(game, count) {
    if (this.thugs.length) return;
    const rng = new Rng(game.seed ^ 0x51ab);
    const base = game.world.spots.saltRow;
    for (let i = 0; i < count; i++) {
      const a = (i / count) * Math.PI * 2;
      const x = base.x + Math.cos(a) * 9 + rng.range(-2, 2);
      const z = base.z + Math.sin(a) * 9 + rng.range(-2, 2);
      const t = new Thug(game.stage.scene, rng, x, z, game);
      game.crowd.peds.push(t);
      this.thugs.push(t);
    }
  }

  spawnCrates(game) {
    if (this._cratePickups.length) return;
    const { Pickup } = game.actors;
    for (const spot of game.world.spots.crates) {
      const p = new Pickup(game.stage.scene, 'crate', spot.x, spot.z, game.glowTex);
      this._cratePickups.push(p);
      game.pickups.push(p);
    }
  }

  firstThugPos() {
    const alive = this.thugs.filter((t) => t.alive);
    if (!alive.length) return null;
    return { x: alive[0].pos.x, z: alive[0].pos.z };
  }

  nextCratePos() {
    const next = this._cratePickups.find((p) => !p.taken);
    return next ? { x: next.x, z: next.z } : null;
  }

  onThugDown() {
    this.kills++;
    this.refreshHud();
  }

  update(dt) {
    if (!this.active) return;
    this.elapsed += dt;
    const game = this.game;
    const steps = this.currentSteps;
    if (!steps) return;
    const step = steps[this.step];
    if (!step) return;

    if (!this._entered && step.onEnter) {
      this._entered = true;
      step.onEnter(game, this);
    }

    // crates and pickups exist only while the haul is running
    if (MISSION_ORDER[this.index] === 'big_haul' && this.step === 0) this.spawnCrates(game);

    if (step.done(game)) {
      this.step++;
      this._entered = false;
      if (this.step >= steps.length) {
        this.finish();
        return;
      }
      game.hud.toast('OBJECTIVE COMPLETE');
      game.audio.blip(780);
      this.refreshHud();
    }

    const target = step.target ? step.target(game) : null;
    this.marker.place(target);
    this.marker.update(game.time);

    // HUD distance
    if (target) {
      const d = Math.round(dist(game.player, target));
      game.hud.setMission(this.meta.title, typeof step.text === 'function' ? step.text(game) : step.text, `${d} M`);
    } else {
      game.hud.setMission(this.meta.title, typeof step.text === 'function' ? step.text(game) : step.text, '');
    }
  }

  refreshHud() {
    const steps = this.currentSteps;
    if (!steps) return;
    const step = steps[this.step];
    if (!step) return;
    const text = typeof step.text === 'function' ? step.text(this.game) : step.text;
    this.game.hud.setMission(this.meta.title, text, '');
  }

  finish() {
    const meta = this.meta;
    this.active = false;
    this.marker.place(null);
    this.clearThugs();
    this.clearCrates();
    this.game.completeMission(this.index, meta.reward);
  }

  toSave() {
    return { index: this.index, step: this.step, kills: this.kills, crates: this.crates, active: this.active };
  }

  fromSave(data) {
    if (!data) return;
    this.index = data.index ?? -1;
    this.step = data.step ?? 0;
    this.kills = data.kills ?? 0;
    this.crates = data.crates ?? 0;
    this.active = !!data.active;
    if (this.active) this.refreshHud();
  }
}

export { dist };
