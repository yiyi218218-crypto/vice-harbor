// Vice Harbor itself: the grid of blocks and roads, the towers that fill them, the palms, lamps and
// neon of a harbour town at dusk, the water and the Starfish Pier wheel. Everything is grown from
// one seed and merged into a handful of meshes, so a city of two hundred buildings costs a few
// draw calls. It also owns collision (`solidAt`) and the road queries traffic and police steer by.
import * as THREE from '../vendor/three.min.js';
import { CITY, HARBOR, LIGHT } from './config.js';
import { createRandom } from './random.js';
import { MeshBuilder } from './mesh.js';

const PITCH = CITY.pitch;
const HALF = CITY.half;
const ROAD_HALF = CITY.road / 2;
const MODULE = 2.6; // metres of facade per window module
const TILE = MODULE * 4; // the facade texture is four modules square

/** Dark rooftop props and kerbs, in one material with no map. */
const TRIM_COLOR = 0x2b2833;

/* ------------------------------------------------------------------ textures */

/** The facade: four window modules square, some lit warm, some dark, a few cool. */
function facadeTexture(random) {
  const size = 512;
  const cell = size / 4;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const g = canvas.getContext('2d');
  g.fillStyle = '#2f2b36';
  g.fillRect(0, 0, size, size);
  // A course line per floor and a darker band at the bottom of each module.
  for (let f = 0; f < 4; f += 1) {
    g.fillStyle = 'rgba(18,16,22,0.45)';
    g.fillRect(0, f * cell + cell - 5, size, 5);
  }
  const warm = ['#ffd9a2', '#ffc478', '#ffe9c9', '#ffbb6a', '#f7d9b0'];
  for (let fy = 0; fy < 4; fy += 1) {
    for (let fx = 0; fx < 4; fx += 1) {
      const inset = 14;
      const x = fx * cell + inset;
      const y = fy * cell + inset * 0.7;
      const w = cell - inset * 2;
      const h = cell - inset * 2.1;
      const lit = random() < 0.42;
      if (lit) {
        g.fillStyle = warm[Math.floor(random() * warm.length)];
      } else {
        g.fillStyle = random() < 0.3 ? '#3b4a56' : '#171a22';
      }
      g.fillRect(x, y, w, h);
      if (lit) {
        g.fillStyle = 'rgba(0,0,0,0.2)';
        g.fillRect(x, y, w, h * 0.42);
      }
      // A sill and a mullion give the window some structure at distance.
      g.fillStyle = 'rgba(16,15,20,0.6)';
      g.fillRect(x + w * 0.47, y, Math.max(2, w * 0.06), h);
      g.fillStyle = 'rgba(255,255,255,0.06)';
      g.fillRect(x, y + h - 2, w, 2);
    }
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

/** The ground: asphalt between the blocks, pavement and lots inside them, all one plane. */
function groundTexture(blocks, random) {
  const span = HALF * 2 + 40;
  const size = 2048;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const g = canvas.getContext('2d');
  const px = size / span;
  const toX = (x) => (x + span / 2) * px;
  g.fillStyle = '#57515e';
  g.fillRect(0, 0, size, size);
  // Grain in the asphalt, so a big flat plane does not read as plastic.
  for (let i = 0; i < 9000; i += 1) {
    const v = 22 + random() * 22;
    g.fillStyle = `rgba(${v},${v - 2},${v + 4},${0.16 + random() * 0.2})`;
    const r = 1 + random() * 4;
    g.fillRect(random() * size, random() * size, r, r);
  }
  for (const block of blocks) {
    const x = toX(block.x - block.w / 2);
    const y = toX(block.z - block.d / 2);
    const w = block.w * px;
    const d = block.d * px;
    const sw = CITY.sidewalk * px;
    g.fillStyle = block.park ? '#4a5a40' : '#66616f';
    g.fillRect(x, y, w, d);
    g.fillStyle = block.park ? '#3d4c33' : '#4c4854';
    g.fillRect(x + sw, y + sw, w - sw * 2, d - sw * 2);
    // Kerb highlight.
    g.strokeStyle = 'rgba(180,175,190,0.16)';
    g.lineWidth = Math.max(1, px * 0.25);
    g.strokeRect(x + 0.5, y + 0.5, w - 1, d - 1);
    if (block.park) {
      for (let i = 0; i < 40; i += 1) {
        g.fillStyle = `rgba(${40 + random() * 26},${70 + random() * 40},${44 + random() * 24},0.7)`;
        g.beginPath();
        g.arc(x + sw + random() * (w - sw * 2), y + sw + random() * (d - sw * 2), 2 + random() * 5, 0, 7);
        g.fill();
      }
    }
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

/** A soft round glow, used for lamp pools, headlights and the sun's haze. */
export function glowTexture() {
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const g = canvas.getContext('2d');
  const grad = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.24, 'rgba(255,236,200,0.62)');
  grad.addColorStop(0.55, 'rgba(255,170,90,0.2)');
  grad.addColorStop(1, 'rgba(255,140,60,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, size, size);
  return new THREE.CanvasTexture(canvas);
}

/** A palm frond: one alpha-cut leaf fan, drawn once and instanced. */
function frondTexture() {
  const w = 128;
  const h = 128;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const g = canvas.getContext('2d');
  g.clearRect(0, 0, w, h);
  g.strokeStyle = '#486b3a';
  g.lineWidth = 3.4;
  g.beginPath();
  g.moveTo(w * 0.5, h);
  g.quadraticCurveTo(w * 0.55, h * 0.45, w * 0.5, h * 0.04);
  g.stroke();
  for (let i = 0; i < 26; i += 1) {
    const t = i / 26;
    const y = h - t * h * 0.94;
    const len = (0.44 - Math.abs(t - 0.45) * 0.34) * w;
    const bend = 0.5 + t * 0.5;
    for (const side of [-1, 1]) {
      g.strokeStyle = `rgba(${72 + t * 40},${112 + t * 46},${52 + t * 30},0.96)`;
      g.lineWidth = 2.6;
      g.beginPath();
      g.moveTo(w * 0.5, y);
      g.quadraticCurveTo(w * 0.5 + side * len * 0.6, y - len * 0.16 * bend, w * 0.5 + side * len, y - len * 0.52 * bend);
      g.stroke();
    }
  }
  return new THREE.CanvasTexture(canvas);
}

/* ------------------------------------------------------------------ collision grid */

class Grid {
  constructor(cellSize = 24) {
    this.cell = cellSize;
    this.map = new Map();
  }

  key(ix, iz) {
    return ix * 73856093 ^ iz * 19349663;
  }

  add(item) {
    const x0 = Math.floor((item.x - item.hx) / this.cell);
    const x1 = Math.floor((item.x + item.hx) / this.cell);
    const z0 = Math.floor((item.z - item.hz) / this.cell);
    const z1 = Math.floor((item.z + item.hz) / this.cell);
    for (let ix = x0; ix <= x1; ix += 1) {
      for (let iz = z0; iz <= z1; iz += 1) {
        const k = this.key(ix, iz);
        let list = this.map.get(k);
        if (!list) {
          list = [];
          this.map.set(k, list);
        }
        list.push(item);
      }
    }
  }

  near(x, z) {
    return this.map.get(this.key(Math.floor(x / this.cell), Math.floor(z / this.cell))) ?? [];
  }
}

/* ------------------------------------------------------------------ the city */

export function createCity(scene, random = createRandom(7)) {
  const group = new THREE.Group();
  group.name = 'Vice Harbor';
  scene.add(group);

  const walls = new MeshBuilder();
  const trim = new MeshBuilder();
  const neon = new MeshBuilder();
  const colliders = [];
  const grid = new Grid();
  const blocks = [];
  const lamps = [];
  const palms = [];
  const towers = [];
  const glowPoints = [];
  const lamps2 = [];

  const tint = (r, g, b) => new THREE.Color(r, g, b);

  /* --- blocks and neighbourhoods ------------------------------------------------ */
  for (let ix = 0; ix < CITY.blocks; ix += 1) {
    for (let iz = 0; iz < CITY.blocks; iz += 1) {
      const cx = -HALF + PITCH * 0.5 + ix * PITCH;
      const cz = -HALF + PITCH * 0.5 + iz * PITCH;
      const inner = CITY.block;
      const nearHarbor = cz > HALF - PITCH * 1.4;
      const park = (ix === 2 && iz === 2) || (ix === 7 && iz === 5);
      const plaza = ix === 3 && iz === 8;
      blocks.push({ x: cx, z: cz, w: inner, d: inner, park, nearHarbor });
      if (park) {
        buildPark(cx, cz, inner, ix * 31 + iz * 7);
        continue;
      }
      if (plaza) continue;
      buildLots(cx, cz, inner, ix, iz, nearHarbor);
    }
  }

  /* --- a lot: one to four buildings, or a low shed --------------------------------- */
  function buildLots(cx, cz, size, ix, iz, nearHarbor) {
    const usable = size - CITY.sidewalk * 2;
    const split = random.pick([1, 1, 2, 2, 4]);
    const lots = [];
    if (split === 1) lots.push([cx, cz, usable, usable]);
    else if (split === 2) {
      const half = usable / 2 - 1.2;
      if (random.chance(0.5)) {
        lots.push([cx - usable / 4 - 0.6, cz, half, usable]);
        lots.push([cx + usable / 4 + 0.6, cz, half, usable]);
      } else {
        lots.push([cx, cz - usable / 4 - 0.6, usable, half]);
        lots.push([cx, cz + usable / 4 + 0.6, usable, half]);
      }
    } else {
      const half = usable / 2 - 1.2;
      for (const sx of [-1, 1]) {
        for (const sz of [-1, 1]) lots.push([cx + sx * (usable / 4 + 0.6), cz + sz * (usable / 4 + 0.6), half, half]);
      }
    }
    for (const [lx, lz, lw, ld] of lots) {
      if (random.chance(0.08)) continue; // an empty lot, a car park
      buildTower(lx, lz, lw, ld, cx, cz, nearHarbor, ix, iz);
    }
  }

  /* --- a tower: facade walls, a parapet, a rooftop, sometimes neon ------------------ */
  function buildTower(x, z, w, d, blockX, blockZ, nearHarbor, ix, iz) {
    const dist = Math.hypot(x, z) / HALF;
    const central = Math.max(0, 1 - dist);
    let h;
    if (nearHarbor) h = 13 + random() * 17;
    else h = 17 + Math.pow(central, 1.4) * 118 * (0.5 + random() * 0.9);
    h = Math.min(h, 152);
    const floors = Math.max(2, Math.round(h / MODULE));
    const bays = Math.max(1, Math.round(w / MODULE));
    const warm = 0.74 + random() * 0.26;
    const cool = random() < 0.14 ? 0.84 : 1;
    const color = tint(warm * cool, warm * 0.98, warm * (1.02 + (1 - cool) * 0.6));
    // A tall tower gets a wider podium and a slimmer shaft above it, which gives the skyline a step.
    const podiumH = !nearHarbor && h > 44 && Math.min(w, d) > 16 ? 14 + random() * 10 : 0;
    let tx = x;
    let tz = z;
    let tw = w;
    let td = d;
    let topY = 0;
    if (podiumH > 0) {
      walls.box(x, 0, z, w, podiumH, d, color.clone().multiplyScalar(0.94), [bays, Math.round(podiumH / MODULE)]);
      trim.plate(x, podiumH + 0.02, z, w - 0.5, d - 0.5, 0, tint(0x2a2632));
      const shrink = 0.62 + random() * 0.18;
      tw = w * shrink;
      td = d * shrink;
      tx = x + (random() - 0.5) * (w - tw) * 0.2;
      tz = z + (random() - 0.5) * (d - td) * 0.2;
      topY = podiumH;
      h -= podiumH;
      walls.box(tx, topY, tz, tw, h, td, color, [Math.max(1, Math.round(tw / MODULE)), Math.round(h / MODULE)]);
    } else {
      walls.box(x, 0, z, w, h, d, color, [bays, floors]);
    }
    const roofY = topY + h;
    // A parapet ring and a dark roof deck keep the silhouette from looking like a plain box.
    const t = 0.5;
    trim.box(tx, roofY - 0.1, tz - td / 2 + t / 2, tw, 1.1, t, tint(TRIM_COLOR).multiplyScalar(0.9));
    trim.box(tx, roofY - 0.1, tz + td / 2 - t / 2, tw, 1.1, t, tint(TRIM_COLOR).multiplyScalar(0.9));
    trim.box(tx - tw / 2 + t / 2, roofY - 0.1, tz, t, 1.1, td, tint(TRIM_COLOR).multiplyScalar(0.9));
    trim.box(tx + tw / 2 - t / 2, roofY - 0.1, tz, t, 1.1, td, tint(TRIM_COLOR).multiplyScalar(0.9));
    trim.plate(tx, roofY + 0.02, tz, tw - 0.4, td - 0.4, 0, tint(0x24212c));
    // Rooftop machinery.
    const units = random.int(0, 3);
    for (let i = 0; i < units; i += 1) {
      const uw = 1.6 + random() * 3;
      const ud = 1.6 + random() * 3;
      const ux = tx + (random() - 0.5) * Math.max(0.5, tw - uw - 2);
      const uz = tz + (random() - 0.5) * Math.max(0.5, td - ud - 2);
      trim.box(ux, roofY + 0.02, uz, uw, 0.9 + random() * 1.5, ud, tint(0x33303c));
    }
    if (roofY > 46 && random.chance(0.5)) {
      const mast = 5 + random() * 10;
      trim.box(tx + (random() - 0.5) * tw * 0.4, roofY + 0.1, tz + (random() - 0.5) * td * 0.4, 0.28, mast, 0.28, tint(0x3a3542));
      glowPoints.push([tx, roofY + mast, tz, 0xff5544, 3.2]);
    }
    // A shopfront band at street level: dark glass, a lit fascia and an awning on a few.
    const shopH = 3.6;
    trim.box(x, 0.02, z - d / 2 - 0.16, w * 0.96, shopH, 0.3, tint(0x2e2b38));
    trim.box(x, 0.02, z + d / 2 + 0.16, w * 0.96, shopH, 0.3, tint(0x2e2b38));
    trim.box(x - w / 2 - 0.16, 0.02, z, 0.3, shopH, d * 0.96, tint(0x2e2b38));
    trim.box(x + w / 2 + 0.16, 0.02, z, 0.3, shopH, d * 0.96, tint(0x2e2b38));
    // Lit shop windows along the two street faces: the life at the bottom of the towers.
    const shopGlow = [0xffd9a2, 0xd8ecff, 0xffb98a, 0xfff0cd];
    for (let s = 0; s < 4; s += 1) {
      if (!random.chance(0.62)) continue;
      const sw = 2.0 + random() * 3.4;
      const sx = x + (random() - 0.5) * Math.max(0.2, w - sw - 1.2);
      neon.box(sx, 0.75, z - d / 2 - 0.24, sw, 2.0, 0.07, tint(random.pick(shopGlow)));
    }
    for (let s = 0; s < 3; s += 1) {
      if (!random.chance(0.5)) continue;
      const sw = 2.0 + random() * 3.0;
      const sz = z + (random() - 0.5) * Math.max(0.2, d - sw - 1.2);
      neon.box(x - w / 2 - 0.24, 0.75, sz, 0.07, 2.0, sw, tint(random.pick(shopGlow)));
      neon.box(x + w / 2 + 0.24, 0.75, sz, 0.07, 2.0, sw, tint(random.pick(shopGlow)));
    }
    for (let s = 0; s < 2; s += 1) {
      if (!random.chance(0.5)) continue;
      const sw = 2.0 + random() * 3.0;
      const sz = z + (random() - 0.5) * Math.max(0.2, d - sw - 1.2);
      neon.box(x, 0.75, z + d / 2 + 0.24, sw, 2.0, 0.07, tint(random.pick(shopGlow)));
    }
    if (random.chance(0.6)) {
      const seg = w * (0.28 + random() * 0.38);
      const sx = x + (random() - 0.5) * (w - seg);
      const fascia = tint(random.pick([0xff7a4d, 0xffb04a, 0x67e2d4, 0xff5f8f]));
      neon.box(sx, shopH, z - d / 2 - 0.2, seg, 0.11, 0.16, fascia);
      neon.box(sx, shopH, z + d / 2 + 0.2, seg, 0.11, 0.16, fascia);
    }
    if (random.chance(0.45)) {
      const aw = w * 0.5;
      neon.box(x, 2.9, z - d / 2 - 0.75, aw, 0.18, 1.3, tint(random.pick([0xff7a4d, 0xffb04a, 0x67e2d4, 0xff5f8f])));
    }
    towers.push({ x, z, w, d, h: roofY });
    addCollider(x, z, w / 2, d / 2, roofY);
    // Tall towers get a neon crown: a lit band near the top, unmistakably Vice Harbor.
    if (roofY > 58 && random.chance(0.55)) {
      const bandColor = tint(random.pick([0xff4d8d, 0x54e6ff, 0xffb347, 0xb07bff]));
      neon.box(tx, roofY - 2.2, tz - td / 2 - 0.22, tw * 0.94, 0.7, 0.2, bandColor);
      neon.box(tx, roofY - 2.2, tz + td / 2 + 0.22, tw * 0.94, 0.7, 0.2, bandColor);
      neon.box(tx - tw / 2 - 0.22, roofY - 2.2, tz, 0.2, 0.7, td * 0.94, bandColor);
      neon.box(tx + tw / 2 + 0.22, roofY - 2.2, tz, 0.2, 0.7, td * 0.94, bandColor);
    }
    // A vertical blade sign on the street corner.
    if (random.chance(0.2) && roofY > 20) {
      const signColor = tint(random.pick([0x3ce0d0, 0xff3f76, 0xffc247]));
      neon.box(x + w / 2 + 0.5, 5, z - d / 2 + 1.2, 0.25, 7, 1.7, signColor);
    }
  }

  /* --- a park: grass, palms, a fountain, benches ---------------------------------- */
  function buildPark(cx, cz, size, salt) {
    const r = createRandom(1000 + salt);
    trim.plate(cx, 0.06, cz, size - CITY.sidewalk * 2, size - CITY.sidewalk * 2, 0, tint(0x2f3a2a));
    const ring = size * 0.18;
    trim.box(cx, 0.06, cz, ring * 2, 0.55, ring * 2, tint(0x4a4550));
    trim.box(cx, 0.6, cz, ring * 1.7, 0.06, ring * 1.7, tint(0x2c5c66));
    for (let i = 0; i < 7; i += 1) {
      const a = r() * Math.PI * 2;
      const rad = size * (0.26 + r() * 0.16);
      palms.push([cx + Math.cos(a) * rad, cz + Math.sin(a) * rad, 1.3 + r() * 0.9, r() * 6.28]);
    }
    for (let i = 0; i < 4; i += 1) {
      const a = (i / 4) * Math.PI * 2 + 0.4;
      const rad = size * 0.3;
      const bx = cx + Math.cos(a) * rad;
      const bz = cz + Math.sin(a) * rad;
      trim.box(bx, 0.1, bz, 2.4, 0.5, 0.8, tint(0x4a3a30));
    }
  }

  /* --- street furniture along every road ------------------------------------------ */
  for (let i = 0; i <= CITY.blocks; i += 1) {
    const p = -HALF + i * PITCH;
    for (let k = 0; k < CITY.blocks; k += 1) {
      const mid = -HALF + PITCH * 0.5 + k * PITCH;
      if (i > 0 && i < CITY.blocks) {
        lamps.push([p - ROAD_HALF - 1.1, mid - 18, 0]);
        lamps.push([p + ROAD_HALF + 1.1, mid + 18, Math.PI]);
      }
      if (i > 0 && i < CITY.blocks) {
        lamps2.push([mid - 18, p - ROAD_HALF - 1.1, Math.PI / 2]);
        lamps2.push([mid + 18, p + ROAD_HALF + 1.1, -Math.PI / 2]);
      }
      // Palms down the promenade and at a few corners.
      if (k % 3 === 1) palms.push([p + ROAD_HALF + 2.2, mid + 12, 1.5 + random() * 0.7, random() * 6.28]);
      if (k % 4 === 2) palms.push([p - ROAD_HALF - 2.2, mid - 12, 1.4 + random() * 0.6, random() * 6.28]);
      // A row of them down the pavement, so every boulevard has a palm silhouette on it.
      palms.push([p + ROAD_HALF + 2.7, mid + (random() - 0.5) * 34, 1.3 + random() * 0.5, random() * 6.28]);
      palms.push([p - ROAD_HALF - 2.7, mid + (random() - 0.5) * 34, 1.3 + random() * 0.5, random() * 6.28]);
      palms.push([mid + (random() - 0.5) * 34, p + ROAD_HALF + 2.7, 1.25 + random() * 0.5, random() * 6.28]);
      palms.push([mid + (random() - 0.5) * 34, p - ROAD_HALF - 2.7, 1.25 + random() * 0.5, random() * 6.28]);
    }
  }

  /* --- the harbour: promenade, beach, water, piers, the wheel ---------------------- */
  const harbor = buildHarbor();

  function buildHarbor() {
    const z0 = HALF + ROAD_HALF;
    const promenade = new MeshBuilder();
    promenade.plate(0, 0.05, z0 + 11, HALF * 2 + 60, 22, 0, tint(0x46414c));
    promenade.plate(0, 0.07, z0 + 24, HALF * 2 + 60, 6, 0, tint(0x6b5b48));
    const pg = promenade.geometry();
    const pm = new THREE.Mesh(pg, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.94 }));
    pm.receiveShadow = true;
    group.add(pm);
    // Palms along the promenade, facing the water.
    for (let x = -HALF + 10; x < HALF - 6; x += 15) {
      palms.push([x, z0 + 8 + random() * 3, 1.7 + random() * 0.9, random() * 6.28]);
    }
    // The beach: a strip of sand that meets the water.
    const sand = new THREE.Mesh(
      new THREE.PlaneGeometry(HALF * 2 + 80, 26, 1, 1),
      new THREE.MeshStandardMaterial({ color: 0x9c7f5c, roughness: 1 }),
    );
    sand.rotation.x = -Math.PI / 2;
    sand.position.set(0, 0.02, z0 + 39);
    sand.receiveShadow = true;
    group.add(sand);
    // Piers out into the water, with a wheel at the end of the middle one.
    for (let i = 0; i < HARBOR.pierCount; i += 1) {
      const px = -150 + i * 150;
      const deckZ = z0 + 92;
      trim.box(px, -0.1, deckZ, 13, 0.9, 96, tint(0x5b4a3c));
      for (let k = 0; k < 9; k += 1) {
        trim.box(px - 5.6, -6, deckZ - 44 + k * 11, 0.6, 7, 0.6, tint(0x40342c));
        trim.box(px + 5.6, -6, deckZ - 44 + k * 11, 0.6, 7, 0.6, tint(0x40342c));
      }
      lamps.push([px - 5.2, deckZ + 20, 0]);
      lamps.push([px + 5.2, deckZ - 20, Math.PI]);
    }
    // The Starfish Wheel: ring, spokes and gondolas, turning slowly over the water.
    const wheel = new THREE.Group();
    wheel.position.set(HARBOR.wheelX, 0, HARBOR.wheelZ + 118);
    const R = 27;
    const ringMat = new THREE.MeshStandardMaterial({ color: 0x2f2a3a, roughness: 0.7, metalness: 0.4 });
    const ringGeo = new THREE.TorusGeometry(R, 0.42, 6, 44);
    for (const dz of [-1.4, 1.4]) {
      const ring = new THREE.Mesh(ringGeo, ringMat);
      ring.position.z = dz;
      wheel.add(ring);
    }
    const spokes = new THREE.Group();
    const spokeMat = new THREE.MeshStandardMaterial({ color: 0x3a3346, roughness: 0.8 });
    for (let i = 0; i < 16; i += 1) {
      const a = (i / 16) * Math.PI * 2;
      const spoke = new THREE.Mesh(new THREE.BoxGeometry(0.3, R, 0.3), spokeMat);
      spoke.position.set(Math.cos(a) * R * 0.5, Math.sin(a) * R * 0.5, 0);
      spoke.rotation.z = a - Math.PI / 2;
      spokes.add(spoke);
    }
    wheel.add(spokes);
    const gondolaMat = new THREE.MeshStandardMaterial({ color: 0xffc98a, emissive: 0xff9a4a, emissiveIntensity: 0.7, roughness: 0.6 });
    for (let i = 0; i < 16; i += 1) {
      const a = (i / 16) * Math.PI * 2;
      const gd = new THREE.Mesh(new THREE.BoxGeometry(2.6, 2.2, 2.2), gondolaMat);
      gd.position.set(Math.cos(a) * R, Math.sin(a) * R, 0);
      gd.rotation.z = 0;
      spokes.add(gd);
    }
    wheel.position.y = 30;
    // The A-frame that holds it up.
    for (const s of [-1, 1]) {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(1.1, 60, 1.1), ringMat);
      leg.position.set(s * 11, -12, 0);
      leg.rotation.z = s * 0.28;
      wheel.add(leg);
    }
    const hub = new THREE.Mesh(new THREE.CylinderGeometry(2.6, 2.6, 4.2, 12), ringMat);
    hub.rotation.x = Math.PI / 2;
    wheel.add(hub);
    group.add(wheel);

    // The water: a shader that mixes depth, sky and a sun glitter path.
    const waterGeo = new THREE.PlaneGeometry(9000, 6000, 1, 1);
    const waterMat = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uSunDir: { value: new THREE.Vector3(...LIGHT.sunDir).normalize() },
        uDeep: { value: new THREE.Color(0x121a33) },
        uShallow: { value: new THREE.Color(0x2a3f63) },
        uHorizon: { value: new THREE.Color(0xff9558) },
        uSunColor: { value: new THREE.Color(0xffd08a) },
        uCam: { value: new THREE.Vector3() },
      },
      vertexShader: `
        varying vec3 vWorld;
        void main() {
          vec4 world = modelMatrix * vec4(position, 1.0);
          vWorld = world.xyz;
          gl_Position = projectionMatrix * viewMatrix * world;
        }
      `,
      fragmentShader: `
        uniform float uTime;
        uniform vec3 uSunDir, uDeep, uShallow, uHorizon, uSunColor, uCam;
        varying vec3 vWorld;
        void main() {
          vec3 p = vWorld;
          float w1 = sin(p.x * 0.09 + uTime * 0.9) * 0.5 + sin(p.z * 0.13 - uTime * 1.22) * 0.5;
          float w2 = sin((p.x + p.z) * 0.31 + uTime * 1.7);
          vec3 n = normalize(vec3(w1 * 0.28 + w2 * 0.06, 1.0, w2 * 0.2 + w1 * 0.1));
          vec3 v = normalize(uCam - p);
          vec3 h = normalize(v + uSunDir);
          float spec = pow(max(dot(n, h), 0.0), 190.0) * 2.4;
          float sparkle = pow(max(dot(n, h), 0.0), 30.0) * 0.22;
          float fres = pow(1.0 - max(dot(n, v), 0.0), 3.2);
          float depthMix = smoothstep(-40.0, 420.0, p.z);
          vec3 body = mix(uShallow, uDeep, depthMix);
          vec3 col = mix(body, uHorizon, fres * 0.78);
          col += uSunColor * (spec + sparkle);
          float haze = smoothstep(150.0, 1800.0, length(p.xz - uCam.xz));
          col = mix(col, uHorizon * 0.96, haze * 0.85);
          gl_FragColor = vec4(col, 1.0);
        }
      `,
    });
    const water = new THREE.Mesh(waterGeo, waterMat);
    water.rotation.x = -Math.PI / 2;
    water.position.set(0, -0.7, z0 + 40 + 750);
    group.add(water);

    // Far skyline: a dark ring of towers past the fog, so the horizon is not empty.
    const far = new MeshBuilder();
    for (let i = 0; i < 90; i += 1) {
      const a = random() * Math.PI * 2;
      const rad = 780 + random() * 420;
      const fx = Math.cos(a) * rad;
      const fz = Math.sin(a) * rad;
      if (fz > HALF + 20 || Math.abs(fx) > 1400) continue; // never a tower standing in the sea
      const w = 22 + random() * 46;
      const h = 18 + random() * 96;
      far.box(fx, -2, fz, w, h, w * (0.6 + random() * 0.7), tint(0x2a2438));
    }
    const farMesh = new THREE.Mesh(far.geometry(), new THREE.MeshBasicMaterial({ vertexColors: true, fog: true }));
    group.add(farMesh);

    return { wheel, water, waterMat };
  }

  /* --- assemble the merged meshes -------------------------------------------------- */
  const facade = facadeTexture(random);
  const wallMesh = new THREE.Mesh(
    walls.geometry(),
    new THREE.MeshStandardMaterial({ map: facade, vertexColors: true, roughness: 0.82, metalness: 0.06, emissive: 0xffb066, emissiveIntensity: 0.5, emissiveMap: facade }),
  );
  wallMesh.castShadow = true;
  wallMesh.receiveShadow = true;
  group.add(wallMesh);

  const trimMesh = new THREE.Mesh(trim.geometry(), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95 }));
  trimMesh.castShadow = true;
  trimMesh.receiveShadow = true;
  group.add(trimMesh);

  const neonMesh = new THREE.Mesh(neon.geometry(), new THREE.MeshBasicMaterial({ vertexColors: true, fog: true }));
  group.add(neonMesh);

  // The ground plane.
  const groundGeo = new THREE.PlaneGeometry(HALF * 2 + 60, HALF * 2 + 60);
  const ground = new THREE.Mesh(
    groundGeo,
    new THREE.MeshStandardMaterial({ map: groundTexture(blocks, random), roughness: 0.86, metalness: 0.04 }),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = 0;
  ground.receiveShadow = true;
  group.add(ground);

  // A dark apron reaching to the fog so the city does not float.
  const apron = new THREE.Mesh(
    new THREE.PlaneGeometry(4000, 4000),
    new THREE.MeshStandardMaterial({ color: 0x1d1b24, roughness: 1 }),
  );
  apron.rotation.x = -Math.PI / 2;
  apron.position.y = -0.95;
  apron.receiveShadow = true;
  group.add(apron);

  /* --- road paint: lane dashes and crosswalks, one instanced mesh -------------------- */
  const dashes = [];
  const paint = new MeshBuilder();
  const addPaint = (x, z, w, d) => paint.plate(x, 0.05, z, w, d, 0, tint(0xf2e8cc));
  for (let i = 0; i <= CITY.blocks; i += 1) {
    const p = -HALF + i * PITCH;
    for (let s = 0; s < CITY.blocks; s += 1) {
      const from = -HALF + s * PITCH + ROAD_HALF + 4;
      const to = from + CITY.block - 8;
      for (let t = from; t < to; t += 7) {
        addPaint(p, t + 1.5, 0.22, 3.0);
        addPaint(t + 1.5, p, 3.0, 0.22);
      }
    }
  }
  // Crosswalks at every intersection, on all four approaches.
  for (let i = 0; i <= CITY.blocks; i += 1) {
    for (let j = 0; j <= CITY.blocks; j += 1) {
      const px = -HALF + i * PITCH;
      const pz = -HALF + j * PITCH;
      for (let s = 0; s < 5; s += 1) {
        const off = -6.4 + s * 3.2;
        addPaint(px + off, pz - ROAD_HALF - 2.6, 1.5, 2.6);
        addPaint(px + off, pz + ROAD_HALF + 2.6, 1.5, 2.6);
        addPaint(px - ROAD_HALF - 2.6, pz + off, 2.6, 1.5);
        addPaint(px + ROAD_HALF + 2.6, pz + off, 2.6, 1.5);
      }
    }
  }
  const paintMesh = new THREE.Mesh(paint.geometry(), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9 }));
  paintMesh.receiveShadow = true;
  group.add(paintMesh);

  /* --- lamps: posts, heads and a glow sprite at each ------------------------------- */
  buildLamps();

  function buildLamps() {
    const all = lamps.concat(lamps2);
    const post = new MeshBuilder();
    const head = new MeshBuilder();
    const glowPos = [];
    for (const [x, z, angle] of all) {
      const dx = Math.cos(angle);
      const dz = Math.sin(angle);
      post.box(x, 0, z, 0.24, 6.2, 0.24, tint(0x272430));
      post.box(x + dx * 1.1, 6.0, z + dz * 1.1, 2.4, 0.2, 0.2, tint(0x272430));
      head.box(x + dx * 2.1, 5.86, z + dz * 2.1, 0.9, 0.28, 0.5, tint(0xfff0c8));
      glowPos.push([x + dx * 2.1, 5.7, z + dz * 2.1, 0xffd08a, 5.4]);
      addCollider(x, z, 0.3, 0.3, 6);
    }
    const postMesh = new THREE.Mesh(post.geometry(), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8 }));
    postMesh.castShadow = true;
    group.add(postMesh);
    const headMesh = new THREE.Mesh(head.geometry(), new THREE.MeshBasicMaterial({ vertexColors: true }));
    group.add(headMesh);
    // A warm pool of light on the asphalt under each lamp.
    const pools = new MeshBuilder();
    for (const [x, z] of all) pools.plate(x, 0.045, z + 0, 9, 9, 0, tint(0x6a4a2a));
    group.add(new THREE.Mesh(pools.geometry(), new THREE.MeshBasicMaterial({
      vertexColors: true, transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false,
    })));
    glowPoints.push(...glowPos);
  }

  /* --- palms: instanced trunks and fronds ------------------------------------------ */
  buildPalms();

  function buildPalms() {
    if (palms.length === 0) return;
    const FRONDS = 7;
    const trunkGeo = new THREE.CylinderGeometry(0.17, 0.34, 1, 6, 1);
    trunkGeo.translate(0, 0.5, 0);
    const trunkMat = new THREE.MeshStandardMaterial({ color: 0x4a3b2c, roughness: 1 });
    const trunks = new THREE.InstancedMesh(trunkGeo, trunkMat, palms.length);
    trunks.castShadow = true;
    // One frond: a leaf fan lying flat, rooted at the trunk and reaching out along +X.
    const frondGeo = new THREE.PlaneGeometry(4.6, 1.9);
    frondGeo.rotateX(-Math.PI / 2);
    frondGeo.translate(2.3, 0, 0);
    const frondMat = new THREE.MeshStandardMaterial({
      map: frondTexture(), transparent: true, alphaTest: 0.4, side: THREE.DoubleSide, roughness: 0.92, color: 0xd8efb4,
    });
    const fronds = new THREE.InstancedMesh(frondGeo, frondMat, palms.length * FRONDS);
    fronds.castShadow = true;
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const qy = new THREE.Quaternion();
    const qz = new THREE.Quaternion();
    const axisY = new THREE.Vector3(0, 1, 0);
    const axisZ = new THREE.Vector3(0, 0, 1);
    const v = new THREE.Vector3();
    const s = new THREE.Vector3();
    palms.forEach(([x, z, scale, spin], i) => {
      const height = 3.2 + scale * 2.1;
      const crown = 0.82 + scale * 0.16;
      m.compose(new THREE.Vector3(x, 0, z), q.identity(), s.set(1, height, 1));
      trunks.setMatrixAt(i, m);
      for (let f = 0; f < FRONDS; f += 1) {
        const a = spin + (f / FRONDS) * Math.PI * 2;
        qy.setFromAxisAngle(axisY, a);
        qz.setFromAxisAngle(axisZ, -(0.1 + Math.random() * 0.3));
        q.copy(qy).multiply(qz);
        v.set(x, height - 0.15, z);
        m.compose(v, q, s.set(crown, crown, crown));
        fronds.setMatrixAt(i * FRONDS + f, m);
      }
      addCollider(x, z, 0.5, 0.5, height);
    });
    trunks.instanceMatrix.needsUpdate = true;
    fronds.instanceMatrix.needsUpdate = true;
    group.add(trunks, fronds);
  }

  /* --- one glow sprite cloud for lamps, crowns and the wheel ----------------------- */
  const glowGeo = new THREE.BufferGeometry();
  const gp = new Float32Array(glowPoints.length * 3);
  const gc = new Float32Array(glowPoints.length * 3);
  glowPoints.forEach(([x, y, z, color], i) => {
    gp[i * 3] = x;
    gp[i * 3 + 1] = y;
    gp[i * 3 + 2] = z;
    const c = new THREE.Color(color);
    gc[i * 3] = c.r;
    gc[i * 3 + 1] = c.g;
    gc[i * 3 + 2] = c.b;
  });
  glowGeo.setAttribute('position', new THREE.BufferAttribute(gp, 3));
  glowGeo.setAttribute('color', new THREE.BufferAttribute(gc, 3));
  const glow = new THREE.Points(glowGeo, new THREE.PointsMaterial({
    size: 7, map: glowTexture(), vertexColors: true, transparent: true,
    blending: THREE.AdditiveBlending, depthWrite: false, sizeAttenuation: true, opacity: 0.75,
  }));
  group.add(glow);

  /* --- collision ------------------------------------------------------------------ */
  function addCollider(x, z, hx, hz, h) {
    const item = { x, z, hx, hz, h };
    colliders.push(item);
    grid.add(item);
  }

  /** True when a circle of radius `r` at (x, z) is inside a building, a post or a palm. */
  function solidAt(x, z, r = 0.4) {
    const list = grid.near(x, z);
    for (let i = 0; i < list.length; i += 1) {
      const c = list[i];
      if (x > c.x - c.hx - r && x < c.x + c.hx + r && z > c.z - c.hz - r && z < c.z + c.hz + r) return c;
    }
    return null;
  }

  /** Which way out of a collider is shortest: used to slide along walls instead of sticking. */
  function pushOut(pos, r) {
    const c = solidAt(pos.x, pos.z, r);
    if (!c) return false;
    const dxr = c.x + c.hx + r - pos.x;
    const dxl = pos.x - (c.x - c.hx - r);
    const dzr = c.z + c.hz + r - pos.z;
    const dzl = pos.z - (c.z - c.hz - r);
    const m = Math.min(dxr, dxl, dzr, dzl);
    if (m === dxr) pos.x += dxr;
    else if (m === dxl) pos.x -= dxl;
    else if (m === dzr) pos.z += dzr;
    else pos.z -= dzl;
    return true;
  }

  /* --- road queries ---------------------------------------------------------------- */
  const roadLines = [];
  for (let i = 0; i <= CITY.blocks; i += 1) {
    const p = -HALF + i * PITCH;
    roadLines.push({ axis: 'x', at: p });
    roadLines.push({ axis: 'z', at: p });
  }

  /** Snap a point to the nearest road centre line and return a lane there. */
  function nearestLane(x, z, heading = null) {
    let best = null;
    let bestD = Infinity;
    for (const line of roadLines) {
      const d = Math.abs((line.axis === 'x' ? x - line.at : z - line.at));
      if (d < bestD) {
        bestD = d;
        best = line;
      }
    }
    if (!best) return { x, z, heading: 0 };
    const lane = 4.2;
    if (best.axis === 'x') {
      const h = heading ?? (Math.random() < 0.5 ? 0 : Math.PI);
      return { x: best.at + (h === 0 ? lane : -lane), z, heading: h };
    }
    const h = heading ?? (Math.random() < 0.5 ? Math.PI / 2 : -Math.PI / 2);
    return { x, z: best.at + (h === Math.PI / 2 ? -lane : lane), heading: h };
  }

  /** A random point on a road, away from the player, for spawning traffic and police. */
  function randomRoadPoint(tries = 24) {
    for (let i = 0; i < tries; i += 1) {
      const line = roadLines[Math.floor(random() * roadLines.length)];
      const along = -HALF + random() * HALF * 2;
      const lane = random.chance(0.5) ? 4.2 : -4.2;
      const heading = line.axis === 'x' ? (lane > 0 ? 0 : Math.PI) : (lane > 0 ? -Math.PI / 2 : Math.PI / 2);
      if (line.axis === 'x') return { x: line.at + lane, z: along, heading };
      return { x: along, z: line.at + lane, heading };
    }
    return { x: 0, z: 0, heading: 0 };
  }

  /** True past the waterline, except on a pier deck: a car that drives there is lost. */
  function overWater(x, z) {
    const shore = HALF + ROAD_HALF + 42;
    if (z < shore) return false;
    for (let i = 0; i < HARBOR.pierCount; i += 1) {
      const px = -150 + i * 150;
      if (Math.abs(x - px) < 6.2 && z < shore + 92) return false;
    }
    return Math.abs(x) < 1400;
  }

  /** The neighbourhood name for the minimap's label. */
  function districtAt(x, z) {    if (z > HALF) return 'Starfish Pier';
    if (z > HALF - PITCH * 1.5) return 'Harborfront';
    if (Math.hypot(x, z) < 180) return 'Neon Core';
    if (x < -180) return 'West Reef';
    if (x > 180) return 'East Docks';
    if (z < -180) return 'Palm Heights';
    return 'Midtown';
  }

  /** Road and block rectangles the minimap draws. */
  const minimapRoads = [];
  for (const line of roadLines) {
    if (line.axis === 'x') minimapRoads.push({ x0: line.at, z0: -HALF, x1: line.at, z1: HALF, w: CITY.road });
    else minimapRoads.push({ x0: -HALF, z0: line.at, x1: HALF, z1: line.at, w: CITY.road });
  }

  const clock = { time: 0 };

  return {
    group,
    blocks,
    towers,
    colliders,
    roadLines,
    minimapRoads,
    lamps: lamps.concat(lamps2),
    harborZ: HALF,
    waterZ: HALF + ROAD_HALF + 40,
    solidAt,
    pushOut,
    overWater,
    nearestLane,
    randomRoadPoint,
    districtAt,
    get wheel() { return harbor.wheel; },
    update(dt) {
      clock.time += dt;
      harbor.waterMat.uniforms.uTime.value = clock.time;
      harbor.wheel.rotation.z += dt * 0.045;
    },
    setCamera(pos) {
      harbor.waterMat.uniforms.uCam.value.copy(pos);
    },
  };
  // `harbor` is assigned by buildHarbor through closure hoisting below.
  // (declared with var-like semantics by the function declaration above)
}
