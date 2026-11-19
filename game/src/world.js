// The city of Vice Harbor: a gridded street plan, low-poly blocks, the harbour
// water and the moving population (traffic + pedestrians). Pure scene building;
// it knows nothing about input or the mission state machine.

import * as THREE from 'three';
import { CFG, PAL } from './config.js';
import { range, pick, chance } from './random.js';

const box = (w, h, d) => new THREE.BoxGeometry(w, h, d);

function roadLines(parent, rng) {
  const half = CFG.city.half;
  const step = CFG.city.block;
  const asphaltMat = new THREE.MeshLambertMaterial({ color: PAL.asphalt });
  const laneMat = new THREE.MeshBasicMaterial({ color: PAL.lane });
  const walkMat = new THREE.MeshLambertMaterial({ color: PAL.pavement });
  const roadLen = half * 2;

  for (let x = -half; x <= half; x += step) {
    const road = new THREE.Mesh(box(CFG.city.roadW, 0.2, roadLen), asphaltMat);
    road.position.set(x, 0.02, 0);
    parent.add(road);
    for (const s of [-1, 1]) {
      const walk = new THREE.Mesh(box(CFG.city.walkW, 0.5, roadLen), walkMat);
      walk.position.set(x + s * (CFG.city.roadW / 2 + CFG.city.walkW / 2), 0.25, 0);
      parent.add(walk);
    }
    const dash = new THREE.Mesh(box(0.35, 0.05, 3.2), laneMat);
    for (let z = -half; z <= half; z += 9) {
      const d = dash.clone();
      d.position.set(x, 0.14, z);
      parent.add(d);
    }
  }
  for (let z = -half; z <= half; z += step) {
    const road = new THREE.Mesh(box(roadLen, 0.2, CFG.city.roadW), asphaltMat);
    road.position.set(0, 0.03, z);
    parent.add(road);
    for (const s of [-1, 1]) {
      const walk = new THREE.Mesh(box(roadLen, 0.5, CFG.city.walkW), walkMat);
      walk.position.set(0, 0.25, z + s * (CFG.city.roadW / 2 + CFG.city.walkW / 2));
      parent.add(walk);
    }
  }
}

function buildingBlock(parent, rng, cx, cz) {
  // A block sits between four roads; leave the corners clear for intersections.
  const step = CFG.city.block;
  const inner = step - CFG.city.roadW - CFG.city.walkW * 2 - 6;
  const count = 1 + Math.floor(rng() * 3);
  for (let i = 0; i < count; i++) {
    const w = range(rng, inner * 0.35, inner * 0.8);
    const d = range(rng, inner * 0.35, inner * 0.8);
    const h = range(rng, CFG.city.minBuildingH, CFG.city.maxBuildingH);
    const ox = range(rng, -inner / 4, inner / 4);
    const oz = range(rng, -inner / 4, inner / 4);
    const color = pick(rng, PAL.building);
    const mat = new THREE.MeshLambertMaterial({ color });
    const mesh = new THREE.Mesh(box(w, h, d), mat);
    mesh.position.set(cx + ox, h / 2, cz + oz);
    parent.add(mesh);

    // glowing window strips give the dusk skyline its neon life
    const glowMat = new THREE.MeshBasicMaterial({
      color: chance(rng, 0.5) ? PAL.neonCyan : PAL.neonGold,
      transparent: true,
      opacity: 0.85,
    });
    const floors = Math.min(7, Math.floor(h / 5));
    for (let f = 1; f <= floors; f++) {
      if (!chance(rng, 0.6)) continue;
      const band = new THREE.Mesh(box(w * 0.82, 0.5, d * 0.82), glowMat);
      band.position.set(cx + ox, (h / floors) * f - 1, cz + oz);
      parent.add(band);
    }
  }
}

function makeWater(parent) {
  const sea = new THREE.Mesh(
    new THREE.PlaneGeometry(900, 460, 28, 14),
    new THREE.MeshPhongMaterial({ color: PAL.water, shininess: 90, specular: PAL.waterHi, flatShading: true }),
  );
  sea.rotation.x = -Math.PI / 2;
  sea.position.set(0, -0.6, CFG.city.seaZ + 210);
  parent.add(sea);

  // quay wall separating the streets from the harbour
  const quay = new THREE.Mesh(box(CFG.city.half * 2 + 40, 4, 8), new THREE.MeshLambertMaterial({ color: 0x555061 }));
  quay.position.set(0, 1.6, CFG.city.seaZ + 2);
  parent.add(quay);

  // a few parked container stacks read as a working port in the stills
  const colors = [0xc0392b, 0x2980b9, 0xd68910, 0x27ae60, 0x8e44ad];
  for (let i = 0; i < 14; i++) {
    const c = colors[i % colors.length];
    const m = new THREE.Mesh(box(12, 5, 5), new THREE.MeshLambertMaterial({ color: c }));
    m.position.set(-120 + (i % 7) * 18, 2.5 + Math.floor(i / 7) * 5, CFG.city.seaZ + 22);
    parent.add(m);
  }
}

export function buildCity(scene, rng) {
  const city = new THREE.Group();
  scene.add(city);

  // A dark ground plate under the whole grid stops the sunset sky dome from
  // showing through the empty lots between buildings and roads.
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(CFG.city.half * 2 + 80, CFG.city.half * 3),
    new THREE.MeshLambertMaterial({ color: 0x1c1a28 }),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.set(0, -0.15, 40);
  city.add(ground);

  roadLines(city, rng);
  const half = CFG.city.half;
  const step = CFG.city.block;
  for (let x = -half + step / 2; x <= half - step / 2; x += step) {
    for (let z = -half + step / 2; z <= CFG.city.seaZ - step / 2; z += step) {
      if (Math.abs(x) < step * 0.55 && Math.abs(z) < step * 0.55) continue; // central plaza
      buildingBlock(city, rng, x, z);
    }
  }
  makeWater(city);

  // a landmark tower and a lighthouse make the skyline legible from afar
  const tower = new THREE.Mesh(box(16, 82, 16), new THREE.MeshLambertMaterial({ color: 0x6a4a6e }));
  tower.position.set(0, 41, 0);
  city.add(tower);
  const beacon = new THREE.Mesh(new THREE.CylinderGeometry(3, 4, 26, 10), new THREE.MeshLambertMaterial({ color: 0xdddddd }));
  beacon.position.set(88, 13, CFG.city.seaZ - 30);
  city.add(beacon);
  const light = new THREE.PointLight(PAL.neonGold, 2.2, 120);
  light.position.set(88, 28, CFG.city.seaZ - 30);
  city.add(light);
  return city;
}

// A car is a small hierarchy so wheels and light bars can move independently.
export function makeCar(scene, color, police = false) {
  const g = new THREE.Group();
  const bodyMat = new THREE.MeshLambertMaterial({ color: police ? PAL.police : color });
  const body = new THREE.Mesh(box(4.2, 1.5, 2.2), bodyMat);
  body.position.y = 1.25;
  g.add(body);
  const cabin = new THREE.Mesh(box(2.2, 1.2, 1.9), new THREE.MeshLambertMaterial({ color: police ? PAL.policeDark : 0x2b3340 }));
  cabin.position.set(-0.2, 2.4, 0);
  g.add(cabin);
  const wheelGeo = new THREE.CylinderGeometry(0.62, 0.62, 0.4, 10);
  const wheelMat = new THREE.MeshLambertMaterial({ color: 0x111116 });
  for (const dx of [-1.35, 1.35]) {
    for (const dz of [-1.1, 1.1]) {
      const w = new THREE.Mesh(wheelGeo, wheelMat);
      w.rotation.x = Math.PI / 2;
      w.position.set(dx, 0.62, dz);
      g.add(w);
    }
  }
  let bar = null;
  if (police) {
    bar = new THREE.Mesh(box(1.4, 0.35, 1.6), new THREE.MeshBasicMaterial({ color: PAL.neonPink }));
    bar.position.set(-0.2, 3.15, 0);
    g.add(bar);
  }
  scene.add(g);
  return { group: g, bar };
}

export function makePedestrian(scene, rng) {
  const g = new THREE.Group();
  const color = pick(rng, [0xd35400, 0x2980b9, 0x8e44ad, 0xc0392b, 0x16a085, 0xf39c12]);
  const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.42, 1.2, 4, 8), new THREE.MeshLambertMaterial({ color }));
  torso.position.y = 1.5;
  g.add(torso);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.38, 8, 8), new THREE.MeshLambertMaterial({ color: 0xd9a066 }));
  head.position.y = 2.7;
  g.add(head);
  scene.add(g);
  return g;
}

// Traffic drives on a fixed grid lane and wraps around at the edge; pedestrians
// wander between intersections. Both are updated with a plain delta time.
export function spawnTraffic(scene, rng) {
  const cars = [];
  const palette = [0xe74c3c, 0x3498db, 0xf1c40f, 0x2ecc71, 0x9b59b6, 0xecf0f1, 0xe67e22];
  for (let i = 0; i < CFG.world.trafficCars; i++) {
    const horizontal = chance(rng, 0.5);
    const lane = (Math.floor(rng() * 7) - 3) * CFG.city.block + (horizontal ? 3 : -3);
    const car = makeCar(scene, pick(rng, palette));
    const dir = chance(rng, 0.5) ? 1 : -1;
    cars.push({
      ...car,
      horizontal,
      lane,
      dir,
      pos: range(rng, -CFG.city.half, CFG.city.half),
      speed: range(rng, 12, 22),
      police: false,
    });
  }
  return cars;
}

export function spawnPedestrians(scene, rng) {
  const peds = [];
  for (let i = 0; i < CFG.world.pedestrians; i++) {
    const g = makePedestrian(scene, rng);
    const x = (Math.floor(rng() * 7) - 3) * CFG.city.block + CFG.city.roadW / 2 + 2;
    const z = (Math.floor(rng() * 7) - 3) * CFG.city.block + CFG.city.roadW / 2 + 2;
    g.position.set(x, 0, z);
    peds.push({ group: g, angle: rng() * Math.PI * 2, speed: range(rng, 1.5, 3.5), t: range(rng, 0, 4) });
  }
  return peds;
}

export function updateTraffic(cars, dt) {
  for (const c of cars) {
    c.pos += c.speed * c.dir * dt;
    if (c.pos > CFG.city.half) c.pos = -CFG.city.half;
    if (c.pos < -CFG.city.half) c.pos = CFG.city.half;
    if (c.horizontal) {
      c.group.position.set(c.pos, 0, c.lane);
      c.group.rotation.y = c.dir > 0 ? Math.PI / 2 : -Math.PI / 2;
    } else {
      c.group.position.set(c.lane, 0, c.pos);
      c.group.rotation.y = c.dir > 0 ? Math.PI : 0;
    }
  }
}

export function updatePedestrians(peds, dt, time) {
  for (const p of peds) {
    p.t -= dt;
    if (p.t <= 0) { p.angle = (p.angle + (Math.random() - 0.5) * 2) % (Math.PI * 2); p.t = 1.5 + Math.random() * 3; }
    p.group.rotation.y = p.angle;
    p.group.position.x += Math.sin(p.angle) * p.speed * dt;
    p.group.position.z += Math.cos(p.angle) * p.speed * dt;
    p.group.position.y = Math.abs(Math.sin(time * 6 + p.speed)) * 0.08;
    const lim = CFG.city.half;
    if (Math.abs(p.group.position.x) > lim) p.group.position.x *= -0.98;
    if (Math.abs(p.group.position.z) > lim) p.group.position.z *= -0.98;
  }
}
