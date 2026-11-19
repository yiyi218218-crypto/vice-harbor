// People, muzzle flashes and the things you pick up. Pedestrians are five boxes and a
// walk cycle; they exist to make the streets feel occupied and to react when you shoot.

import { WALK_H, resolveCircle } from './world.js';
import { clamp, Rng } from './random.js';
import { makeGlowTexture, spriteFromTexture } from './render.js';

const THREE = globalThis.THREE;

const SHIRTS = ['#c9d1d9', '#8a5a44', '#2f4858', '#a33b3b', '#4b6b4f', '#6b5b8a', '#d8b26a', '#39424d'];
const PANTS = ['#2b3038', '#3e3a33', '#4a4f57', '#22262c'];
const SKIN = ['#c99b74', '#8c6247', '#e0b491', '#6b4a35', '#d2a17c'];

export class Pedestrian {
  constructor(scene, rng, x, z, route) {
    this.rng = rng;
    this.route = route;
    this.routeIndex = 0;
    this.pos = { x, z };
    this.heading = rng.range(0, Math.PI * 2);
    this.speed = rng.range(1.1, 1.9);
    this.state = 'walk';
    this.health = 30;
    this.phase = rng.range(0, Math.PI * 2);
    this.deadTimer = 0;
    this.fleeTimer = 0;

    const shirt = rng.pick(SHIRTS);
    const pants = rng.pick(PANTS);
    const skin = rng.pick(SKIN);
    const g = new THREE.Group();
    const torso = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.62, 0.26), mat(shirt));
    torso.position.y = 1.18;
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.26, 0.24), mat(skin));
    head.position.y = 1.64;
    const hip = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.2, 0.24), mat(pants));
    hip.position.y = 0.82;
    const legL = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.72, 0.18), mat(pants));
    legL.position.set(-0.11, 0.4, 0);
    const legR = legL.clone();
    legR.position.x = 0.11;
    const armL = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.56, 0.14), mat(shirt));
    armL.position.set(-0.29, 1.18, 0);
    const armR = armL.clone();
    armR.position.x = 0.29;
    g.add(torso, head, hip, legL, legR, armL, armR);
    g.traverse((o) => { if (o.isMesh) { o.castShadow = true; } });
    g.position.set(x, WALK_H, z);
    scene.add(g);
    this.mesh = g;
    this.legs = [legL, legR];
    this.arms = [armL, armR];
    this.baseY = WALK_H;
  }

  get alive() {
    return this.state !== 'down';
  }

  scare(origin) {
    if (this.state === 'down') return;
    const d = Math.hypot(this.pos.x - origin.x, this.pos.z - origin.z);
    if (d < 34) {
      this.state = 'flee';
      this.fleeTimer = 3.4;
      this.speed = 3.6;
    }
  }

  hit(damage) {
    if (this.state === 'down') return false;
    this.health -= damage;
    if (this.health <= 0) {
      this.state = 'down';
      this.deadTimer = 0;
      this.mesh.rotation.z = Math.PI / 2 * (this.rng.chance(0.5) ? 1 : -1);
      this.mesh.position.y = this.baseY + 0.2;
      return true;
    }
    this.state = 'flee';
    this.fleeTimer = 4;
    this.speed = 3.9;
    return false;
  }

  update(dt, player, audio) {
    if (this.state === 'down') {
      this.deadTimer += dt;
      if (this.deadTimer > 18) {
        this.mesh.position.y = Math.max(-1.2, this.mesh.position.y - dt * 0.25);
      }
      return;
    }

    let targetX;
    let targetZ;
    if (this.state === 'flee') {
      this.fleeTimer -= dt;
      if (this.fleeTimer <= 0) {
        this.state = 'walk';
        this.speed = this.rng.range(1.1, 1.9);
      }
      const dx = this.pos.x - (player?.pos.x ?? 0);
      const dz = this.pos.z - (player?.pos.z ?? 0);
      const len = Math.hypot(dx, dz) || 1;
      targetX = this.pos.x + (dx / len) * 8;
      targetZ = this.pos.z + (dz / len) * 8;
    } else {
      const node = this.route[this.routeIndex];
      targetX = node.x;
      targetZ = node.z;
      if (Math.hypot(targetX - this.pos.x, targetZ - this.pos.z) < 1.6) {
        this.routeIndex = (this.routeIndex + 1) % this.route.length;
      }
    }

    const want = Math.atan2(targetX - this.pos.x, targetZ - this.pos.z);
    let diff = (want - this.heading) % (Math.PI * 2);
    if (diff > Math.PI) diff -= Math.PI * 2;
    if (diff < -Math.PI) diff += Math.PI * 2;
    this.heading += clamp(diff, -4 * dt, 4 * dt);

    const step = this.speed * dt;
    this.pos.x += Math.sin(this.heading) * step;
    this.pos.z += Math.cos(this.heading) * step;

    resolveCircle({ colliders: player?.world?.colliders ?? [], }, this.pos, 0.34);

    this.phase += step * 4.2;
    const swing = Math.sin(this.phase) * (this.state === 'flee' ? 0.85 : 0.5);
    this.legs[0].rotation.x = swing;
    this.legs[1].rotation.x = -swing;
    this.arms[0].rotation.x = -swing * 0.8;
    this.arms[1].rotation.x = swing * 0.8;
    this.mesh.position.set(this.pos.x, this.baseY + Math.abs(Math.sin(this.phase * 2)) * 0.02, this.pos.z);
    this.mesh.rotation.y = this.heading;
  }

  dispose(scene) {
    scene.remove(this.mesh);
  }
}

function mat(color) {
  return new THREE.MeshLambertMaterial({ color: new THREE.Color(color) });
}

export class Crowd {
  constructor(scene, world, rng, count = 34) {
    this.scene = scene;
    this.world = world;
    this.rng = rng;
    this.peds = [];
    this.count = count;
    const roads = world.roads;
    for (let i = 0; i < count; i++) {
      const bi = rng.int(0, roads.length - 2);
      const bj = rng.int(0, roads.length - 2);
      const cx = (roads[bi] + roads[bi + 1]) / 2;
      const cz = (roads[bj] + roads[bj + 1]) / 2;
      const h = 24;
      const route = [
        { x: cx - h, z: cz - h }, { x: cx + h, z: cz - h },
        { x: cx + h, z: cz + h }, { x: cx - h, z: cz + h },
      ];
      const start = route[rng.int(0, 3)];
      this.peds.push(new Pedestrian(scene, rng, start.x + rng.range(-2, 2), start.z + rng.range(-2, 2), route));
    }
  }

  scare(origin) {
    for (const p of this.peds) p.scare(origin);
  }

  nearestAlive(x, z, maxDist = Infinity) {
    let best = null;
    let bestD = maxDist;
    for (const p of this.peds) {
      if (!p.alive) continue;
      const d = Math.hypot(p.pos.x - x, p.pos.z - z);
      if (d < bestD) { bestD = d; best = p; }
    }
    return best;
  }

  update(dt, player) {
    for (const p of this.peds) p.update(dt, player, null);
  }
}

// --- effects -------------------------------------------------------------------

export class Effects {
  constructor(scene) {
    this.scene = scene;
    this.items = [];
    this.glow = makeGlowTexture();
  }

  tracer(from, to, color = '#ffe6b0') {
    const geo = new THREE.BufferGeometry().setFromPoints([from, to]);
    const mat = new THREE.LineBasicMaterial({
      color: new THREE.Color(color), transparent: true, opacity: 0.95,
      blending: THREE.AdditiveBlending, depthWrite: false,
    });
    const line = new THREE.Line(geo, mat);
    this.scene.add(line);
    this.items.push({ obj: line, life: 0.09, max: 0.09, kind: 'fade' });
  }

  flash(pos, color = '#ffd9a0', size = 1.2) {
    const s = spriteFromTexture(this.glow, color, size, 1);
    s.position.copy(pos);
    this.scene.add(s);
    this.items.push({ obj: s, life: 0.07, max: 0.07, kind: 'fade' });
  }

  burst(pos, color = '#ffb066', count = 8, speed = 6) {
    for (let i = 0; i < count; i++) {
      const s = spriteFromTexture(this.glow, color, 0.5 + Math.random() * 0.9, 0.9);
      s.position.copy(pos);
      const a = Math.random() * Math.PI * 2;
      const up = Math.random() * 3;
      this.scene.add(s);
      this.items.push({
        obj: s, life: 0.5 + Math.random() * 0.4, max: 0.9, kind: 'spark',
        vx: Math.cos(a) * speed * Math.random(), vy: up, vz: Math.sin(a) * speed * Math.random(),
      });
    }
  }

  smoke(pos, color = '#3a3a3f') {
    const s = spriteFromTexture(this.glow, color, 2.4, 0.5);
    s.position.copy(pos);
    this.scene.add(s);
    this.items.push({ obj: s, life: 1.4, max: 1.4, kind: 'smoke', vy: 1.4 });
  }

  update(dt) {
    for (let i = this.items.length - 1; i >= 0; i--) {
      const it = this.items[i];
      it.life -= dt;
      const t = clamp(it.life / it.max, 0, 1);
      if (it.kind === 'fade') {
        if (it.obj.material) it.obj.material.opacity = t;
      } else if (it.kind === 'spark') {
        it.obj.position.x += it.vx * dt;
        it.obj.position.y += it.vy * dt;
        it.obj.position.z += it.vz * dt;
        it.vy -= 9 * dt;
        it.obj.material.opacity = t;
      } else if (it.kind === 'smoke') {
        it.obj.position.y += it.vy * dt;
        it.obj.scale.multiplyScalar(1 + dt * 0.9);
        it.obj.material.opacity = t * 0.45;
      }
      if (it.life <= 0) {
        this.scene.remove(it.obj);
        if (it.obj.geometry) it.obj.geometry.dispose();
        if (it.obj.material) it.obj.material.dispose();
        this.items.splice(i, 1);
      }
    }
  }
}

// --- pickups -------------------------------------------------------------------

export class Pickup {
  constructor(scene, kind, x, z, glowTex) {
    this.kind = kind;
    this.x = x;
    this.z = z;
    this.taken = false;
    this.spin = 0;
    const g = new THREE.Group();
    if (kind === 'crate') {
      const box = new THREE.Mesh(
        new THREE.BoxGeometry(1.3, 1.1, 1.3),
        new THREE.MeshLambertMaterial({ color: new THREE.Color('#8a6234'), emissive: new THREE.Color('#3a2410'), emissiveIntensity: 0.6 })
      );
      box.position.y = 0.95;
      box.castShadow = true;
      g.add(box);
      const strap = new THREE.Mesh(new THREE.BoxGeometry(1.36, 1.16, 0.18), new THREE.MeshLambertMaterial({ color: 0x2a2a2e }));
      strap.position.y = 0.95;
      g.add(strap);
    } else if (kind === 'medkit') {
      const box = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.5, 0.6), new THREE.MeshLambertMaterial({ color: 0xe8e4d8 }));
      box.position.y = 0.7;
      g.add(box);
      const c1 = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.06, 0.16), new THREE.MeshBasicMaterial({ color: 0xd83a3a }));
      c1.position.y = 0.97;
      const c2 = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.06, 0.44), new THREE.MeshBasicMaterial({ color: 0xd83a3a }));
      c2.position.y = 0.97;
      g.add(c1, c2);
    }
    // beacon
    const beacon = new THREE.Mesh(
      new THREE.CylinderGeometry(1.5, 1.5, 14, 14, 1, true),
      new THREE.MeshBasicMaterial({
        color: new THREE.Color(kind === 'medkit' ? '#37e0c4' : '#f2a541'),
        transparent: true, opacity: 0.13, side: THREE.DoubleSide, depthWrite: false,
      })
    );
    beacon.position.y = 7;
    g.add(beacon);
    this.beacon = beacon;
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(1.5, 1.9, 24),
      new THREE.MeshBasicMaterial({ color: new THREE.Color(kind === 'medkit' ? '#37e0c4' : '#f2a541'), transparent: true, opacity: 0.55, side: THREE.DoubleSide })
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.06;
    g.add(ring);
    this.ring = ring;
    if (glowTex) {
      const s = spriteFromTexture(glowTex, kind === 'medkit' ? '#37e0c4' : '#f2a541', 3.2, 0.4);
      s.position.y = 1.2;
      g.add(s);
    }
    g.position.set(x, WALK_H, z);
    scene.add(g);
    this.mesh = g;
  }

  update(dt, t) {
    if (this.taken) return;
    this.spin += dt;
    this.mesh.rotation.y = this.spin * 0.8;
    this.beacon.material.opacity = 0.08 + (Math.sin(t * 2.4) * 0.5 + 0.5) * 0.12;
    this.ring.scale.setScalar(1 + Math.sin(t * 2.4) * 0.06);
  }

  take(scene) {
    this.taken = true;
    scene.remove(this.mesh);
  }
}
