// Procedural Vice Harbor: a dusk port city built entirely from three.js
// primitives. Everything is deterministic from the seed. The module exposes
// pure builders plus the arrays the simulation needs (cars, peds, lights).

import * as THREE from 'three';
import { CFG, COLORS } from './config.js';
import { Rng, clamp } from './random.js';

// ---------- ground, water, sky ----------

export function makeGround(scene) {
  const size = (CFG.grid + 1) * CFG.block;
  const land = new THREE.Mesh(
    new THREE.PlaneGeometry(size * 1.6, size * 1.6),
    new THREE.MeshStandardMaterial({ color: COLORS.ground, roughness: 1 }),
  );
  land.rotation.x = -Math.PI / 2;
  land.position.y = -0.25;
  land.receiveShadow = true;
  scene.add(land);

  // The bay south of the city. A translucent plane with a slow scroll is
  // animated in render.js via userData.
  const seaZStart = CFG.seaStartZ;
  const seaDepth = size;
  const sea = new THREE.Mesh(
    new THREE.PlaneGeometry(size * 1.6, seaDepth),
    new THREE.MeshStandardMaterial({
      color: COLORS.water,
      emissive: COLORS.waterEmissive,
      emissiveIntensity: 0.6,
      roughness: 0.32,
      metalness: 0.25,
      transparent: true,
      opacity: 0.94,
    }),
  );
  sea.rotation.x = -Math.PI / 2;
  sea.position.set(0, CFG.waterLevel, seaZStart + seaDepth / 2);
  sea.userData.scroll = 0;
  scene.add(sea);

  // A slim boardwalk strip marks the shoreline.
  const walk = new THREE.Mesh(
    new THREE.BoxGeometry(size, 0.5, 4),
    new THREE.MeshStandardMaterial({ color: COLORS.sidewalk, roughness: 0.9 }),
  );
  walk.position.set(0, CFG.waterLevel + 0.25, seaZStart - 2);
  scene.add(walk);
  return { land, sea, walk };
}

export function makeSkyAndLights(scene) {
  scene.background = new THREE.Color(COLORS.sky);
  scene.fog = new THREE.Fog(COLORS.fog, CFG.fogNear, CFG.fogFar);

  const hemi = new THREE.HemisphereLight(COLORS.sky, COLORS.ground, 1.3);
  scene.add(hemi);

  const sun = new THREE.DirectionalLight(COLORS.sun, 1.9);
  const a = CFG.sunAngle;
  sun.position.set(Math.cos(a) * 120, Math.sin(a) * 120 + 20, -90);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  sun.shadow.camera.left = -180;
  sun.shadow.camera.right = 180;
  sun.shadow.camera.top = 180;
  sun.shadow.camera.bottom = -180;
  sun.shadow.camera.near = 1;
  sun.shadow.camera.far = 420;
  scene.add(sun);

  const ambient = new THREE.AmbientLight(COLORS.ambient, 0.55);
  scene.add(ambient);

  // A warm glow low on the horizon sells the dusk.
  const dusk = new THREE.PointLight(0xff7a4a, 2.4, 520, 1.4);
  dusk.position.set(-40, 16, 260);
  scene.add(dusk);
  return { hemi, sun, ambient, dusk };
}

// ---------- roads and buildings ----------

function roadCoordinate(i) {
  return (i - CFG.half) * CFG.block;
}

export function makeRoads(scene) {
  const roads = new THREE.Group();
  const span = (CFG.grid + 1) * CFG.block;
  const asphalt = new THREE.MeshStandardMaterial({ color: COLORS.road, roughness: 0.95 });
  const laneMat = new THREE.MeshStandardMaterial({ color: COLORS.lane, emissive: 0x2a2008, roughness: 0.8 });
  const walkMat = new THREE.MeshStandardMaterial({ color: COLORS.sidewalk, roughness: 0.92 });

  for (let i = 0; i < CFG.grid; i++) {
    const c = roadCoordinate(i);
    // North-south road.
    const ns = new THREE.Mesh(new THREE.PlaneGeometry(CFG.road, span), asphalt);
    ns.rotation.x = -Math.PI / 2;
    ns.position.set(c, 0.01, 0);
    ns.receiveShadow = true;
    roads.add(ns);
    // East-west road.
    const ew = new THREE.Mesh(new THREE.PlaneGeometry(span, CFG.road), asphalt);
    ew.rotation.x = -Math.PI / 2;
    ew.position.set(0, 0.012, c);
    ew.receiveShadow = true;
    roads.add(ew);

    // Dashed centre lines.
    for (let k = -CFG.half * 2; k <= CFG.half * 2; k++) {
      const z = k * (CFG.block / 2);
      if (z > CFG.seaStartZ) continue;
      const dash = new THREE.Mesh(new THREE.PlaneGeometry(0.28, CFG.block * 0.3), laneMat);
      dash.rotation.x = -Math.PI / 2;
      dash.position.set(c, 0.02, z);
      roads.add(dash);
      const x = k * (CFG.block / 2);
      const dash2 = new THREE.Mesh(new THREE.PlaneGeometry(CFG.block * 0.3, 0.28), laneMat);
      dash2.rotation.x = -Math.PI / 2;
      dash2.position.set(x, 0.021, c);
      roads.add(dash2);
    }

    // Sidewalk kerbs along each road.
    for (const side of [-1, 1]) {
      const kerbNS = new THREE.Mesh(new THREE.BoxGeometry(CFG.sidewalk, 0.22, span), walkMat);
      kerbNS.position.set(c + side * (CFG.road / 2 + CFG.sidewalk / 2), 0.11, 0);
      roads.add(kerbNS);
      if (c + side * (CFG.road / 2) < CFG.seaStartZ) {
        const kerbEW = new THREE.Mesh(new THREE.BoxGeometry(span, 0.22, CFG.sidewalk), walkMat);
        kerbEW.position.set(0, 0.11, c + side * (CFG.road / 2 + CFG.sidewalk / 2));
        roads.add(kerbEW);
      }
    }
  }
  scene.add(roads);
  return roads;
}

// Build one block of buildings inside the square bounded by road lines.
function buildBlock(group, rng, cx, cz) {
  const inner = CFG.block - CFG.road - CFG.sidewalk * 2;
  if (inner <= 6) return;
  const lots = rng.int(2, 3);
  const step = inner / lots;
  for (let ix = 0; ix < lots; ix++) {
    for (let iz = 0; iz < lots; iz++) {
      if (rng.chance(0.14)) continue; // an empty lot / parking area
      const w = step * rng.float(0.62, 0.9);
      const d = step * rng.float(0.62, 0.9);
      const h = rng.float(10, 46) * (rng.chance(0.16) ? 1.7 : 1);
      const bx = cx - inner / 2 + step * (ix + 0.5) + rng.float(-1, 1);
      const bz = cz - inner / 2 + step * (iz + 0.5) + rng.float(-1, 1);
      if (bz > CFG.seaStartZ - 4) continue; // leave the waterfront open

      const body = new THREE.Mesh(
        new THREE.BoxGeometry(w, h, d),
        new THREE.MeshStandardMaterial({
          color: rng.pick(COLORS.building),
          roughness: 0.72,
          metalness: 0.12,
        }),
      );
      body.position.set(bx, h / 2, bz);
      body.castShadow = true;
      body.receiveShadow = true;
      group.add(body);

      // Rooftop cap for silhouette variety.
      if (rng.chance(0.5)) {
        const cap = new THREE.Mesh(
          new THREE.BoxGeometry(w * 0.55, rng.float(1, 4), d * 0.55),
          new THREE.MeshStandardMaterial({ color: 0x201d2a, roughness: 0.9 }),
        );
        cap.position.set(bx, h + 1, bz);
        group.add(cap);
      }

      // Emissive window strips on the four faces. Instanced look without the
      // cost: one thin box per lit band.
      const bands = Math.max(1, Math.floor(h / 4));
      const winColor = rng.pick(COLORS.window);
      const winMat = new THREE.MeshStandardMaterial({
        color: winColor,
        emissive: winColor,
        emissiveIntensity: rng.float(0.5, 1.3),
      });
      for (let b = 0; b < bands; b++) {
        if (rng.chance(0.35)) continue;
        const y = 2 + b * 4;
        if (y > h - 1) break;
        const front = new THREE.Mesh(new THREE.BoxGeometry(w * 0.7, 0.5, 0.12), winMat);
        front.position.set(bx, y, bz + d / 2 + 0.07);
        group.add(front);
        const back = front.clone();
        back.position.set(bx, y, bz - d / 2 - 0.07);
        group.add(back);
        const side = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.5, d * 0.7), winMat);
        side.position.set(bx + w / 2 + 0.07, y, bz);
        group.add(side);
        const side2 = side.clone();
        side2.position.set(bx - w / 2 - 0.07, y, bz);
        group.add(side2);
      }

      // Occasional neon sign on the lower floors near the core.
      if (rng.chance(0.22) && Math.abs(cx) < CFG.block * 2 && Math.abs(cz) < CFG.block * 2) {
        const neonC = rng.pick(COLORS.neon);
        const sign = new THREE.Mesh(
          new THREE.BoxGeometry(0.25, rng.float(1.6, 3.2), w * 0.5),
          new THREE.MeshStandardMaterial({ color: neonC, emissive: neonC, emissiveIntensity: 1.6 }),
        );
        sign.position.set(bx + w / 2 + 0.2, rng.float(3, 7), bz);
        group.add(sign);
      }
    }
  }
}

export function makeBuildings(scene, seed) {
  const rng = new Rng(seed ^ 0x5eed1234);
  const group = new THREE.Group();
  for (let i = 0; i < CFG.grid - 1; i++) {
    for (let j = 0; j < CFG.grid - 1; j++) {
      const cx = (roadCoordinate(i) + roadCoordinate(i + 1)) / 2;
      const cz = (roadCoordinate(j) + roadCoordinate(j + 1)) / 2;
      if (cz > CFG.seaStartZ) continue;
      buildBlock(group, rng, cx, cz);
    }
  }
  scene.add(group);
  return group;
}

// ---------- street furniture ----------

export function makeStreetLights(scene, seed) {
  const rng = new Rng(seed ^ 0x11abc);
  const group = new THREE.Group();
  const poleMat = new THREE.MeshStandardMaterial({ color: 0x15141c, roughness: 0.7, metalness: 0.4 });
  const bulbMat = new THREE.MeshStandardMaterial({ color: 0xffd7a0, emissive: 0xffb060, emissiveIntensity: 1.5 });
  for (let i = 0; i < CFG.grid; i++) {
    const c = roadCoordinate(i);
    for (let k = -CFG.half; k <= CFG.half; k++) {
      const along = k * CFG.block;
      for (const side of [-1, 1]) {
        const z = along + side * 12;
        if (z > CFG.seaStartZ) continue;
        const x = c + (CFG.road / 2 + CFG.sidewalk + 0.6) * side;
        const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.12, 5.2, 6), poleMat);
        pole.position.set(x, 2.6, z);
        group.add(pole);
        const arm = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.12, 0.12), poleMat);
        arm.position.set(x - side * 0.6, 5.1, z);
        group.add(arm);
        const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.24, 8, 6), bulbMat);
        bulb.position.set(x - side * 1.2, 5, z);
        group.add(bulb);
      }
    }
  }
  scene.add(group);
  return group;
}

// ---------- mission markers ----------

export function makeMissionMarkers(scene, seed) {
  const rng = new Rng(seed ^ 0x9117);
  const group = new THREE.Group();
  const markers = CFG.missions.map((m, idx) => {
    const color = [0x54e0ff, 0xffc857, 0xff4f9a][idx % 3];
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(m.radius, 0.32, 8, 40),
      new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 1.3, transparent: true, opacity: 0.85 }),
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(m.x, 0.35, m.z);
    group.add(ring);
    const beam = new THREE.Mesh(
      new THREE.CylinderGeometry(0.5, 0.5, 26, 10, 1, true),
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.18, side: THREE.DoubleSide, depthWrite: false }),
    );
    beam.position.set(m.x, 13, m.z);
    group.add(beam);
    const rngY = rng.float(0, 6);
    ring.userData.baseY = 0.35 + rngY * 0;
    return { ring, beam, color };
  });
  scene.add(group);
  return { group, markers };
}

// ---------- agents: cars and pedestrians ----------

function buildCarMesh(color, isPolice = false) {
  const car = new THREE.Group();
  const paint = isPolice ? COLORS.police : color;
  const body = new THREE.Mesh(
    new THREE.BoxGeometry(2.0, 0.8, 4.2),
    new THREE.MeshStandardMaterial({ color: paint, roughness: 0.42, metalness: 0.35 }),
  );
  body.position.y = 0.75;
  body.castShadow = true;
  car.add(body);
  const cabin = new THREE.Mesh(
    new THREE.BoxGeometry(1.72, 0.7, 2.1),
    new THREE.MeshStandardMaterial({ color: 0x12131a, roughness: 0.25, metalness: 0.5 }),
  );
  cabin.position.set(0, 1.42, -0.15);
  cabin.castShadow = true;
  car.add(cabin);
  const wheelMat = new THREE.MeshStandardMaterial({ color: 0x0b0b0f, roughness: 0.9 });
  const wheelGeo = new THREE.CylinderGeometry(0.46, 0.46, 0.3, 12);
  for (const [wx, wz] of [[-1.02, 1.35], [1.02, 1.35], [-1.02, -1.35], [1.02, -1.35]]) {
    const w = new THREE.Mesh(wheelGeo, wheelMat);
    w.rotation.z = Math.PI / 2;
    w.position.set(wx, 0.46, wz);
    car.add(w);
  }
  const lightMat = new THREE.MeshStandardMaterial({ color: 0xfff0c4, emissive: 0xffd98a, emissiveIntensity: 1.4 });
  for (const lx of [-0.66, 0.66]) {
    const l = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.2, 0.1), lightMat);
    l.position.set(lx, 0.95, 2.12);
    car.add(l);
    const tail = new THREE.Mesh(
      new THREE.BoxGeometry(0.5, 0.16, 0.1),
      new THREE.MeshStandardMaterial({ color: 0xff2a2a, emissive: 0xff1010, emissiveIntensity: 1.2 }),
    );
    tail.position.set(lx, 0.92, -2.12);
    car.add(tail);
  }
  if (isPolice) {
    const bar = new THREE.Mesh(
      new THREE.BoxGeometry(1.2, 0.18, 0.4),
      new THREE.MeshStandardMaterial({ color: COLORS.policeLight, emissive: COLORS.policeLight, emissiveIntensity: 2 }),
    );
    bar.position.set(0, 1.86, -0.15);
    bar.name = 'policeBar';
    car.add(bar);
  }
  return car;
}

export function makeTraffic(scene, seed) {
  const rng = new Rng((seed ^ 0x7aca750) >>> 0);
  const cars = [];
  const group = new THREE.Group();
  for (let i = 0; i < CFG.trafficCount; i++) {
    const lane = rng.int(0, CFG.grid - 1);
    const along = rng.float(-CFG.half * CFG.block, CFG.seaStartZ - 6);
    const horizontal = rng.chance(0.5);
    const dir = rng.sign();
    const laneOffset = dir > 0 ? 3.0 : -3.0;
    const pos = horizontal
      ? { x: along, z: roadCoordinate(lane) + laneOffset }
      : { x: roadCoordinate(lane) + laneOffset, z: along };
    const mesh = buildCarMesh(rng.pick(COLORS.carBody));
    mesh.position.set(pos.x, 0, pos.z);
    mesh.rotation.y = horizontal ? (dir > 0 ? Math.PI / 2 : -Math.PI / 2) : (dir > 0 ? Math.PI : 0);
    group.add(mesh);
    cars.push({
      mesh,
      horizontal,
      dir,
      speed: rng.float(7, 13),
      stolen: false,
    });
  }
  scene.add(group);
  return { group, cars };
}

export function spawnPoliceCar(scene, near, seed) {
  const rng = new Rng(seed ^ ((Date.now() & 0xffff) << 4));
  const lane = rng.int(0, CFG.grid - 1);
  const horizontal = rng.chance(0.5);
  const c = roadCoordinate(lane);
  let x;
  let z;
  if (horizontal) {
    x = clamp(near.x + rng.sign() * 120, -CFG.half * CFG.block, CFG.half * CFG.block);
    z = c + (rng.chance(0.5) ? 3 : -3);
  } else {
    x = c + (rng.chance(0.5) ? 3 : -3);
    z = clamp(near.z + rng.sign() * 120, -CFG.half * CFG.block, CFG.seaStartZ - 6);
  }
  const mesh = buildCarMesh(COLORS.police, true);
  mesh.position.set(x, 0, z);
  scene.add(mesh);
  return { mesh, horizontal, dir: 1, speed: 15, police: true, health: 60 };
}

function buildPedMesh(color) {
  const g = new THREE.Group();
  const torso = new THREE.Mesh(
    new THREE.CylinderGeometry(0.32, 0.36, 1.0, 8),
    new THREE.MeshStandardMaterial({ color, roughness: 0.85 }),
  );
  torso.position.y = 1.05;
  torso.castShadow = true;
  g.add(torso);
  const head = new THREE.Mesh(
    new THREE.SphereGeometry(0.26, 10, 8),
    new THREE.MeshStandardMaterial({ color: 0xd9a97f, roughness: 0.9 }),
  );
  head.position.y = 1.78;
  g.add(head);
  const legMat = new THREE.MeshStandardMaterial({ color: 0x20202a, roughness: 0.9 });
  for (const lx of [-0.15, 0.15]) {
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.11, 0.7, 6), legMat);
    leg.position.set(lx, 0.35, 0);
    g.add(leg);
  }
  return g;
}

export function makePedestrians(scene, seed) {
  const rng = new Rng(seed ^ 0x9ede5);
  const peds = [];
  const group = new THREE.Group();
  for (let i = 0; i < CFG.pedestrianCount; i++) {
    const lane = rng.int(0, CFG.grid - 1);
    const along = rng.float(-CFG.half * CFG.block, CFG.seaStartZ - 4);
    const horizontal = rng.chance(0.5);
    const side = rng.sign() * (CFG.road / 2 + CFG.sidewalk * 0.6);
    const pos = horizontal
      ? { x: along, z: roadCoordinate(lane) + side }
      : { x: roadCoordinate(lane) + side, z: along };
    const mesh = buildPedMesh(rng.pick(COLORS.ped));
    mesh.position.set(pos.x, 0, pos.z);
    mesh.rotation.y = rng.float(0, Math.PI * 2);
    group.add(mesh);
    peds.push({ mesh, horizontal, dir: rng.sign(), speed: rng.float(1.1, 2.0) });
  }
  scene.add(group);
  return { group, peds };
}

// ---------- the player avatar ----------

export function makePlayerMesh() {
  const g = new THREE.Group();
  const body = new THREE.Mesh(
    new THREE.CapsuleGeometry(0.42, 0.9, 4, 10),
    new THREE.MeshStandardMaterial({ color: 0xe8e2f0, roughness: 0.7 }),
  );
  body.position.y = 1.0;
  body.castShadow = true;
  g.add(body);
  const jacket = new THREE.Mesh(
    new THREE.CylinderGeometry(0.47, 0.42, 0.7, 10),
    new THREE.MeshStandardMaterial({ color: 0x8f3f6e, roughness: 0.8 }),
  );
  jacket.position.y = 1.2;
  g.add(jacket);
  const head = new THREE.Mesh(
    new THREE.SphereGeometry(0.28, 12, 10),
    new THREE.MeshStandardMaterial({ color: 0xc98e64, roughness: 0.85 }),
  );
  head.position.y = 1.86;
  g.add(head);
  // A small muzzle flash node, toggled by main.js when firing.
  const muzzle = new THREE.Mesh(
    new THREE.SphereGeometry(0.16, 8, 6),
    new THREE.MeshBasicMaterial({ color: 0xfff2a0, transparent: true, opacity: 0 }),
  );
  muzzle.position.set(0.45, 1.2, -0.6);
  muzzle.name = 'muzzle';
  g.add(muzzle);
  return g;
}

// ---------- simple update helpers used by main.js ----------

export function moveTraffic(cars, dt) {
  const limit = CFG.half * CFG.block;
  for (const car of cars) {
    if (car.stolen) continue;
    if (car.horizontal) {
      car.mesh.position.x += car.dir * car.speed * dt;
      if (car.mesh.position.x > limit) car.mesh.position.x = -limit;
      if (car.mesh.position.x < -limit) car.mesh.position.x = limit;
    } else {
      car.mesh.position.z += car.dir * car.speed * dt;
      if (car.mesh.position.z > CFG.seaStartZ - 4) car.mesh.position.z = -limit;
      if (car.mesh.position.z < -limit) car.mesh.position.z = CFG.seaStartZ - 6;
    }
  }
}

export function movePedestrians(peds, dt) {
  const limit = CFG.half * CFG.block;
  for (const p of peds) {
    if (p.horizontal) {
      p.mesh.position.x += p.dir * p.speed * dt;
      if (Math.abs(p.mesh.position.x) > limit) p.dir *= -1;
    } else {
      p.mesh.position.z += p.dir * p.speed * dt;
      if (p.mesh.position.z > CFG.seaStartZ - 3 || p.mesh.position.z < -limit) p.dir *= -1;
    }
  }
}
