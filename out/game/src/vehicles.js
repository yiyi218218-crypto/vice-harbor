// Vehicles: the mesh each car type shares, arcade driving physics, the traffic that
// follows the avenue graph, and the patrol cars that answer the wanted level.

import { CARS, HEAT, CITY } from './config.js';
import { clamp, dampAngle, angleDelta, Rng } from './random.js';
import { resolveCircle } from './world.js';
import { makeGlowTexture, spriteFromTexture } from './render.js';

const THREE = globalThis.THREE;

const geoCache = new Map();
const matCache = new Map();
let GLOW_TEX = null;

function glowTexture() {
  if (!GLOW_TEX) GLOW_TEX = makeGlowTexture();
  return GLOW_TEX;
}

function boxGeo(w, h, d) {
  const key = `${w}|${h}|${d}`;
  if (!geoCache.has(key)) geoCache.set(key, new THREE.BoxGeometry(w, h, d));
  return geoCache.get(key);
}

function matFor(color, emissive = 0x000000, emissiveIntensity = 0) {
  const key = `${color}|${emissive}|${emissiveIntensity}`;
  if (!matCache.has(key)) {
    matCache.set(key, new THREE.MeshLambertMaterial({
      color: new THREE.Color(color),
      emissive: new THREE.Color(emissive),
      emissiveIntensity,
    }));
  }
  return matCache.get(key);
}

export function createCarMesh(kind, color, opts = {}) {
  const spec = CARS[kind] || CARS.sedan;
  const g = new THREE.Group();
  const L = spec.len;
  const W = spec.wid;
  const H = spec.hgt;
  const bodyColor = color || spec.colors[0];
  const isCop = kind === 'police' || kind === 'cruiser';

  const body = new THREE.Mesh(boxGeo(W, H * 0.52, L), matFor(bodyColor));
  body.position.y = H * 0.42;
  body.castShadow = true;
  body.receiveShadow = true;
  g.add(body);

  // lower skirt, darker, reads as a shadow line along the car
  const skirt = new THREE.Mesh(boxGeo(W * 1.01, H * 0.2, L * 0.98), matFor('#15181d'));
  skirt.position.y = H * 0.16;
  g.add(skirt);

  const cabinLen = kind === 'van' || kind === 'pickup' ? L * 0.5 : L * 0.46;
  const cabinH = H * 0.4;
  const cabin = new THREE.Mesh(boxGeo(W * 0.84, cabinH, cabinLen), matFor(bodyColor));
  cabin.position.set(0, H * 0.78, kind === 'pickup' ? -L * 0.18 : -L * 0.03);
  cabin.castShadow = true;
  g.add(cabin);

  // side glass, so the cabin reads as windows rather than a black block
  const sideGlassL = new THREE.Mesh(boxGeo(0.035, cabinH * 0.62, cabinLen * 0.8), matFor('#0e141c', '#0a1018', 0.4));
  sideGlassL.position.set(-W * 0.425, H * 0.8, cabin.position.z);
  const sideGlassR = sideGlassL.clone();
  sideGlassR.position.x = W * 0.425;
  g.add(sideGlassL, sideGlassR);

  // roof, short of the glass so the car reads from behind
  const roofTint = new THREE.Color(bodyColor).multiplyScalar(0.78).getStyle();
  const roof = new THREE.Mesh(boxGeo(W * 0.82, 0.07, cabinLen * 0.62), matFor(roofTint));
  roof.position.set(0, H * 0.99, cabin.position.z + cabinLen * 0.1);
  g.add(roof);

  const glassMat = matFor('#0e141c', '#0a1018', 0.5);
  const rearGlass = new THREE.Mesh(boxGeo(W * 0.76, H * 0.3, 0.05), glassMat);
  rearGlass.position.set(0, H * 0.82, cabin.position.z - cabinLen / 2 - 0.01);
  g.add(rearGlass);
  const frontGlass = new THREE.Mesh(boxGeo(W * 0.78, H * 0.28, 0.05), glassMat);
  frontGlass.position.set(0, H * 0.81, cabin.position.z + cabinLen / 2 + 0.01);
  g.add(frontGlass);

  // a slanted windshield is what tells the eye which end is the front
  const windshield = new THREE.Mesh(boxGeo(W * 0.8, 0.05, 0.66), glassMat);
  windshield.position.set(0, H * 0.88, cabin.position.z + cabinLen / 2 + 0.2);
  windshield.rotation.x = -0.58;
  g.add(windshield);

  // wheels
  const wheelGeo = new THREE.CylinderGeometry(0.34, 0.34, 0.26, 10);
  const wheelMat = matFor('#0d0e11');
  const axles = [[-W / 2, L * 0.31], [W / 2, L * 0.31], [-W / 2, -L * 0.31], [W / 2, -L * 0.31]];
  const wheels = [];
  for (const [wx, wz] of axles) {
    const w = new THREE.Mesh(wheelGeo, wheelMat);
    w.rotation.z = Math.PI / 2;
    w.position.set(wx, 0.32, wz);
    g.add(w);
    wheels.push(w);
  }

  // lights
  const head = new THREE.Mesh(boxGeo(W * 0.22, 0.13, 0.06), matFor('#ffe9c4', '#ffe9c4', 1.4));
  const head2 = head.clone();
  head.position.set(-W * 0.32, H * 0.44, L / 2 + 0.01);
  head2.position.set(W * 0.32, H * 0.44, L / 2 + 0.01);
  g.add(head, head2);

  const tail = new THREE.Mesh(boxGeo(W * 0.2, 0.11, 0.06), matFor('#8c1f24', '#ff3b3b', 0.9));
  const tail2 = tail.clone();
  tail.position.set(-W * 0.32, H * 0.44, -L / 2 - 0.01);
  tail2.position.set(W * 0.32, H * 0.44, -L / 2 - 0.01);
  g.add(tail, tail2);

  let bar = null;
  let barRed = null;
  let barBlue = null;
  let glowRed = null;
  let glowBlue = null;
  if (isCop) {
    // patrol livery: a dark band and a door shield
    const band = new THREE.Mesh(boxGeo(W * 1.005, H * 0.16, L * 0.5), matFor('#1a2029'));
    band.position.set(0, H * 0.5, 0);
    g.add(band);
    bar = new THREE.Mesh(boxGeo(W * 0.24, 0.13, 0.42), matFor('#ffffff', '#ff2b3a', 2.6));
    barRed = bar;
    bar.position.set(-W * 0.2, H * 1.06, cabin.position.z + 0.12);
    barBlue = bar.clone();
    barBlue.material = matFor('#ffffff', '#2b6bff', 2.6);
    barBlue.position.x = W * 0.2;
    g.add(bar, barBlue);

    const tex = glowTexture();
    glowRed = spriteFromTexture(tex, '#ff3346', 2.8, 0.9);
    glowRed.position.set(-W * 0.2, H * 1.14, cabin.position.z + 0.12);
    glowBlue = spriteFromTexture(tex, '#3a7bff', 2.8, 0.9);
    glowBlue.position.set(W * 0.2, H * 1.14, cabin.position.z + 0.12);
    g.add(glowRed, glowBlue);
  }

  if (kind === 'taxi') {
    const topper = new THREE.Mesh(boxGeo(0.52, 0.16, 0.9), matFor('#f2d27a', '#ffd166', 1.0));
    topper.position.set(0, H * 1.08, cabin.position.z);
    g.add(topper);
  }

  g.userData.wheels = wheels;
  g.userData.bar = bar;
  g.userData.barBlue = barBlue;
  g.userData.glowRed = glowRed;
  g.userData.glowBlue = glowBlue;
  g.userData.spec = spec;
  g.castShadow = true;
  return g;
}

// A car is a plane on wheels: position, heading, velocity. No suspension, no gravity,
// because the harbour is flat and the fun is in the weight transfer.
export class Vehicle {
  constructor(scene, kind, color, x, z, heading, opts = {}) {
    this.kind = kind;
    this.spec = CARS[kind] || CARS.sedan;
    this.mesh = createCarMesh(kind, color, opts);
    this.mesh.position.set(x, 0, z);
    this.mesh.rotation.y = heading;
    scene.add(this.mesh);

    this.x = x;
    this.z = z;
    this.heading = heading;
    this.vx = 0;
    this.vz = 0;
    this.steer = 0;
    this.health = 100;
    this.driver = null;             // 'player' | 'ai' | 'police' | null
    this.ai = null;
    this.parked = opts.parked === true;
    this.name = opts.name || this.spec.name;
    this.missionCar = opts.missionCar === true;
    this.radius = Math.max(this.spec.len, this.spec.wid) * 0.46;
    this.lastHit = 0;
    this.sirenOn = false;
    this.sirenPhase = Math.random() * Math.PI * 2;
    this.dead = false;
    this.wheelSpin = 0;
  }

  get forwardSpeed() {
    return this.vx * Math.sin(this.heading) + this.vz * Math.cos(this.heading);
  }

  get speedKmh() {
    return Math.abs(this.forwardSpeed) * 3.6;
  }

  setDriver(kind) {
    this.driver = kind;
    if (kind === null) {
      this.vx *= 0.2;
      this.vz *= 0.2;
    }
  }

  place(x, z, heading) {
    this.x = x;
    this.z = z;
    this.heading = heading;
    this.vx = 0;
    this.vz = 0;
    this.mesh.position.set(x, 0, z);
    this.mesh.rotation.y = heading;
  }

  // controls: { throttle, steer, handbrake }
  drive(dt, controls, world) {
    const spec = this.spec;
    const throttle = clamp(controls.throttle || 0, -1, 1);
    const steerInput = clamp(controls.steer || 0, -1, 1);
    const handbrake = !!controls.handbrake;

    const sin = Math.sin(this.heading);
    const cos = Math.cos(this.heading);
    let fwd = this.vx * sin + this.vz * cos;
    let lat = this.vx * cos - this.vz * sin;

    let engine = 0;
    if (throttle > 0) {
      engine = spec.accel * throttle * (1 - clamp(fwd / spec.top, 0, 1) * 0.88);
    } else if (throttle < 0) {
      engine = fwd > 0.6 ? -spec.brake : -spec.accel * 0.55;
      if (fwd < -spec.top * 0.35) engine = 0;
    } else {
      engine = -fwd * 0.9;
    }

    fwd += engine * dt;
    fwd *= Math.exp(-0.35 * dt);
    fwd = clamp(fwd, -spec.top * 0.4, spec.top);

    const gripK = handbrake ? 2.2 : spec.grip * 11.0;
    lat *= Math.exp(-gripK * dt);

    // steering authority falls away at speed so the car does not spin on a tap
    const speedFactor = clamp(Math.abs(fwd) / 7, 0, 1) * (1 - clamp(Math.abs(fwd) / (spec.top * 1.35), 0, 0.55));
    const dir = fwd >= 0 ? 1 : -1;
    this.heading += steerInput * spec.turn * speedFactor * dir * dt;

    const s2 = Math.sin(this.heading);
    const c2 = Math.cos(this.heading);
    this.vx = s2 * fwd + c2 * lat;
    this.vz = c2 * fwd - s2 * lat;

    this.x += this.vx * dt;
    this.z += this.vz * dt;

    this.collide(world);
    this.syncMesh(dt);
  }

  collide(world) {
    const pos = { x: this.x, z: this.z };
    const hit = resolveCircle(world, pos, this.radius * 0.9);
    if (hit) {
      const moved = Math.hypot(pos.x - this.x, pos.z - this.z);
      if (moved > 0.001) {
        this.x = pos.x;
        this.z = pos.z;
        this.vx *= 0.35;
        this.vz *= 0.35;
        this.health -= Math.min(14, moved * 22);
      }
    }
    // keep inside the playable island
    const lim = CITY.half + 34;
    if (Math.abs(this.x) > lim) { this.x = clamp(this.x, -lim, lim); this.vx *= -0.3; }
    if (Math.abs(this.z) > lim) { this.z = clamp(this.z, -lim, lim); this.vz *= -0.3; }
  }

  syncMesh(dt) {
    this.mesh.position.set(this.x, 0, this.z);
    this.mesh.rotation.y = this.heading;
    const speed = this.forwardSpeed;
    this.wheelSpin += speed * dt * 2.4;
    const wheels = this.mesh.userData.wheels;
    if (wheels) for (const w of wheels) w.rotation.x = this.wheelSpin;
    if (this.sirenOn && this.mesh.userData.bar) {
      this.sirenPhase += dt * 9;
      const on = Math.sin(this.sirenPhase) > 0;
      this.mesh.userData.bar.material.emissiveIntensity = on ? 3.2 : 0.15;
      if (this.mesh.userData.barBlue) {
        this.mesh.userData.barBlue.material.emissiveIntensity = on ? 0.15 : 3.2;
      }
      if (this.mesh.userData.glowRed) {
        this.mesh.userData.glowRed.material.opacity = on ? 0.95 : 0.08;
        this.mesh.userData.glowBlue.material.opacity = on ? 0.08 : 0.95;
      }
    }
  }

  damage(amount) {
    this.health -= amount;
    if (this.health <= 0 && !this.dead) {
      this.dead = true;
      this.vx *= 0.2;
      this.vz *= 0.2;
      return true;
    }
    return false;
  }

  dispose(scene) {
    scene.remove(this.mesh);
  }
}

// --- traffic -------------------------------------------------------------------

const TRAFFIC_KINDS = ['sedan', 'sedan', 'taxi', 'coupe', 'van', 'pickup'];

export class Traffic {
  constructor(scene, world, rng, count = 18) {
    this.scene = scene;
    this.world = world;
    this.rng = rng;
    this.cars = [];
    const nodes = world.graph.nodes;
    for (let i = 0; i < count; i++) {
      const start = nodes[rng.int(0, nodes.length - 1)];
      const kind = rng.pick(TRAFFIC_KINDS);
      const color = rng.pick(CARS[kind].colors);
      const car = new Vehicle(scene, kind, color, start.x, start.z, 0, { name: CARS[kind].name });
      car.setDriver('ai');
      car.ai = {
        from: start.id,
        to: null,
        cruise: rng.range(8.5, 13.5),
        lane: 3.4,
        stuck: 0,
      };
      this.pickNext(car);
      this.cars.push(car);
    }
    this.parked = [];
    this.spawnParked(rng);
  }

  spawnParked(rng) {
    const nodes = this.world.graph.nodes;
    for (let i = 0; i < 14; i++) {
      const n = nodes[rng.int(0, nodes.length - 1)];
      const kind = rng.pick(['sedan', 'coupe', 'van', 'taxi', 'pickup']);
      const color = rng.pick(CARS[kind].colors);
      const dir = rng.chance(0.5) ? Math.PI / 2 : 0;
      const off = 8.4;
      const x = n.x + (dir === 0 ? rng.range(-1, 1) : off);
      const z = n.z + (dir === 0 ? off : rng.range(-1, 1));
      if (this.world.insideBuilding(x, z, 1.4)) continue;
      const car = new Vehicle(this.scene, kind, color, x, z, dir + (rng.chance(0.5) ? 0 : Math.PI), { parked: true });
      this.parked.push(car);
    }
  }

  pickNext(car) {
    const nodes = this.world.graph.nodes;
    const from = nodes[car.ai.from];
    const prev = car.ai.to;
    const options = from.next.filter((n) => n.id !== prev);
    const list = options.length ? options : from.next;
    const pick = list[Math.floor(this.rng.float() * list.length)];
    car.ai.to = car.ai.from;
    car.ai.from = pick.id;
    car.ai.dx = pick.dx;
    car.ai.dz = pick.dz;
  }

  update(dt, player, game) {
    const all = this.cars;
    for (const car of all) {
      if (car.dead) continue;
      const target = this.world.graph.nodes[car.ai.from];
      // aim at the lane point on the outgoing avenue, not the intersection centre
      const dx = Math.sign(target.x - car.x);
      const dz = Math.sign(target.z - car.z);
      let tx = target.x;
      let tz = target.z;
      if (car.ai.dx) {
        tz = target.z + (car.ai.dx > 0 ? -car.ai.lane : car.ai.lane);
      } else {
        tx = target.x + (car.ai.dz > 0 ? car.ai.lane : -car.ai.lane);
      }
      const dist = Math.hypot(tx - car.x, tz - car.z);
      const want = Math.atan2(tx - car.x, tz - car.z);
      const diff = angleDelta(car.heading, want);
      const steer = clamp(diff * 2.2, -1, 1);

      let throttle = 0.55;
      if (Math.abs(diff) > 0.55) throttle = 0.18;
      if (dist < 9) throttle = 0.25;

      // brake for whatever is in front
      const ahead = this.obstacleAhead(car, all, player, 13);
      if (ahead) throttle = ahead < 7 ? -0.7 : 0;

      car.heading = dampAngle(car.heading, want, 3.2, dt);
      car.drive(dt, { throttle, steer: 0 }, this.world);

      if (dist < 6.5) {
        car.ai.from = car.ai.to;
        this.pickNext(car);
        car.ai.stuck = 0;
      }
      // nudge a car that has been pinned for a while
      if (Math.abs(car.forwardSpeed) < 0.4) {
        car.ai.stuck += dt;
        if (car.ai.stuck > 6) {
          this.pickNext(car);
          car.ai.stuck = 0;
        }
      } else {
        car.ai.stuck = 0;
      }
    }

    // one car pushing another
    for (let i = 0; i < all.length; i++) {
      for (let j = i + 1; j < all.length; j++) {
        separate(all[i], all[j]);
      }
      if (player && player.vehicle) separate(all[i], player.vehicle);
    }
  }

  obstacleAhead(car, all, player, range) {
    const sin = Math.sin(car.heading);
    const cos = Math.cos(car.heading);
    let best = Infinity;
    const check = (other) => {
      if (!other || other === car) return;
      const dx = other.x - car.x;
      const dz = other.z - car.z;
      const fwd = dx * sin + dz * cos;
      if (fwd < 1 || fwd > range) return;
      const side = Math.abs(dx * cos - dz * sin);
      if (side > 2.4) return;
      best = Math.min(best, fwd);
    };
    for (const o of all) check(o);
    if (player && player.vehicle) check(player.vehicle);
    if (player && !player.vehicle) {
      const dx = player.pos.x - car.x;
      const dz = player.pos.z - car.z;
      const fwd = dx * sin + dz * cos;
      const side = Math.abs(dx * cos - dz * sin);
      if (fwd > 1 && fwd < range && side < 2.0) best = Math.min(best, fwd);
    }
    return best === Infinity ? 0 : best;
  }

  removeAt(car) {
    const i = this.cars.indexOf(car);
    if (i >= 0) this.cars.splice(i, 1);
  }
}

function separate(a, b) {
  if (!a || !b || a === b) return;
  const dx = b.x - a.x;
  const dz = b.z - a.z;
  const min = a.radius + b.radius;
  const d2 = dx * dx + dz * dz;
  if (d2 > min * min || d2 < 1e-6) return;
  const d = Math.sqrt(d2);
  const push = (min - d) * 0.5;
  const nx = dx / d;
  const nz = dz / d;
  a.x -= nx * push;
  a.z -= nz * push;
  b.x += nx * push;
  b.z += nz * push;
  const rel = (b.vx - a.vx) * nx + (b.vz - a.vz) * nz;
  if (Math.abs(rel) > 3) {
    a.vx += nx * rel * 0.25;
    a.vz += nz * rel * 0.25;
    b.vx -= nx * rel * 0.25;
    b.vz -= nz * rel * 0.25;
    a.health -= 1.2;
    b.health -= 1.2;
  }
  a.mesh.position.x = a.x;
  a.mesh.position.z = a.z;
  b.mesh.position.x = b.x;
  b.mesh.position.z = b.z;
}

// --- police --------------------------------------------------------------------

export class Police {
  constructor(scene, world, rng, game) {
    this.scene = scene;
    this.world = world;
    this.rng = rng;
    this.game = game;
    this.units = [];
    this.cooldown = 0;
  }

  get count() {
    return this.units.length;
  }

  update(dt, player) {
    const heat = this.game.heat;
    const want = heat >= HEAT.spawnStars ? Math.min(6, Math.floor(heat / HEAT.starAt)) : 0;

    this.cooldown -= dt;
    if (this.units.length < want && this.cooldown <= 0) {
      this.spawn(player);
      this.cooldown = 2.2;
    }
    // stand down once the heat is gone
    if (heat < 0.4 && this.units.length) {
      for (const u of this.units) this.retire(u);
      this.units.length = 0;
    }

    for (const unit of this.units) {
      const car = unit.car;
      if (car.dead) continue;
      const dx = player.pos.x - car.x;
      const dz = player.pos.z - car.z;
      const dist = Math.hypot(dx, dz);
      const want = Math.atan2(dx, dz);
      car.heading = dampAngle(car.heading, want, 4.2, dt);
      let throttle = 1;
      if (dist < 10) throttle = player.vehicle ? 0.9 : 0;
      if (dist < 6) throttle = -0.4;
      car.drive(dt, { throttle, steer: 0 }, this.world);
      car.sirenOn = true;

      // officers fire from the car when the player is on foot and close
      unit.fire -= dt;
      if (!player.vehicle && dist < HEAT.bustRadius && unit.fire <= 0) {
        unit.fire = 1.15 + this.rng.float() * 0.6;
        this.game.policeShoot(car, player);
      }
      if (player.vehicle && dist < 7.5) {
        player.vehicle.damage(9 * dt);
      }
    }
  }

  spawn(player) {
    const nodes = this.world.graph.around(player.pos.x, player.pos.z, 150);
    if (!nodes.length) return;
    const pick = nodes[this.rng.int(0, nodes.length - 1)];
    const angle = this.rng.range(0, Math.PI * 2);
    const x = pick.x + Math.cos(angle) * 6;
    const z = pick.z + Math.sin(angle) * 6;
    const kind = this.rng.chance(0.25) ? 'cruiser' : 'police';
    const car = new Vehicle(this.scene, kind, this.rng.pick(CARS[kind].colors), x, z, angle, {});
    car.setDriver('police');
    car.sirenOn = true;
    this.units.push({ car, fire: 1 + this.rng.float() });
    if (this.game) this.game.onPoliceArrive(car);
  }

  retire(unit) {
    unit.car.dispose(this.scene);
    unit.car.dead = true;
  }

  clear() {
    for (const u of this.units) this.retire(u);
    this.units.length = 0;
  }
}
