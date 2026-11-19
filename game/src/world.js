// The city. One seeded pass builds geometry, colliders, the traffic graph and a
// prerendered minimap layer; nothing here is loaded from disk or the network.

import { CITY, SKY } from './config.js';
import { Rng, clamp, noise1 } from './random.js';
import { makeFacadeTextures, makeSignTexture, makeGlowTexture, makeAsphaltTexture, spriteFromTexture } from './render.js';

const THREE = globalThis.THREE;

const TILE = 12;            // metres of facade per texture tile (four windows across)
const WALK_H = 0.16;        // sidewalk height

// --- geometry builder ----------------------------------------------------------
// Boxes only, merged into a couple of buffers, with UVs measured in metres so one
// window texture tiles the same on every facade.
class Builder {
  constructor() {
    this.pos = [];
    this.nor = [];
    this.uv = [];
    this.col = [];
    this.idx = [];
    this.count = 0;
  }

  quad(a, b, c, d, n, color, uvs) {
    const base = this.count;
    const pts = [a, b, c, d];
    for (let i = 0; i < 4; i++) {
      this.pos.push(pts[i][0], pts[i][1], pts[i][2]);
      this.nor.push(n[0], n[1], n[2]);
      this.uv.push(uvs[i][0], uvs[i][1]);
      this.col.push(color.r, color.g, color.b);
    }
    this.idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
    this.count += 4;
  }

  box(cx, cy, cz, hx, hy, hz, color, opts = {}) {
    const yaw = opts.yaw || 0;
    const cos = Math.cos(yaw);
    const sin = Math.sin(yaw);
    const shade = opts.shade === undefined ? 1 : opts.shade;
    const faces = opts.faces || 'all';
    const uvScale = opts.uvScale || 1 / TILE;
    const uvOff = opts.uvOff || 0;
    const put = (x, y, z) => {
      const dx = x * cos - z * sin;
      const dz = x * sin + z * cos;
      return [cx + dx, cy + y, cz + dz];
    };
    const top = new THREE.Color(color).multiplyScalar(1.12 * shade);
    const side = new THREE.Color(color).multiplyScalar(0.94 * shade);
    const side2 = new THREE.Color(color).multiplyScalar(0.86 * shade);
    const bottom = new THREE.Color(color).multiplyScalar(0.55 * shade);

    const u0 = uvOff;
    const u1 = uvOff + hx * 2 * uvScale;
    const v0 = 0;
    const v1 = hy * 2 * uvScale;

    if (faces !== 'top') {
      // +z
      this.quad(put(-hx, -hy, hz), put(hx, -hy, hz), put(hx, hy, hz), put(-hx, hy, hz),
        [0, 0, 1], side, [[u0, v0], [u1, v0], [u1, v1], [u0, v1]]);
      // -z
      this.quad(put(hx, -hy, -hz), put(-hx, -hy, -hz), put(-hx, hy, -hz), put(hx, hy, -hz),
        [0, 0, -1], side, [[u0, v0], [u1, v0], [u1, v1], [u0, v1]]);
      // +x
      this.quad(put(hx, -hy, hz), put(hx, -hy, -hz), put(hx, hy, -hz), put(hx, hy, hz),
        [1, 0, 0], side2, [[u0, v0], [u1, v0], [u1, v1], [u0, v1]]);
      // -x
      this.quad(put(-hx, -hy, -hz), put(-hx, -hy, hz), put(-hx, hy, hz), put(-hx, hy, -hz),
        [-1, 0, 0], side2, [[u0, v0], [u1, v0], [u1, v1], [u0, v1]]);
    }
    if (faces !== 'sides') {
      this.quad(put(-hx, hy, hz), put(hx, hy, hz), put(hx, hy, -hz), put(-hx, hy, -hz),
        [0, 1, 0], top, [[0, 0], [u1, 0], [u1, v1], [0, v1]]);
      if (opts.bottom !== false) {
        this.quad(put(-hx, -hy, -hz), put(hx, -hy, -hz), put(hx, -hy, hz), put(-hx, -hy, hz),
          [0, -1, 0], bottom, [[0, 0], [u1, 0], [u1, v1], [0, v1]]);
      }
    }
  }

  geometry() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nor, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    g.setIndex(this.idx);
    g.computeBoundingSphere();
    return g;
  }

  get empty() {
    return this.count === 0;
  }
}

// --- city ---------------------------------------------------------------------

export function buildWorld(stage, seed = 1) {
  const rng = new Rng(seed);
  const roads = roadLinesLocal();

  const walls = new Builder();
  const solids = new Builder();
  const paint = new Builder();
  const props = new Builder();
  const colliders = [];
  const buildings = [];
  const signs = [];
  const lamps = [];
  const glowTex = makeGlowTexture();

  const group = new THREE.Group();
  group.name = 'city';
  stage.scene.add(group);

  // asphalt: one plane under the city only, so the harbor east of the quay stays water
  const asphaltTex = makeAsphaltTexture(rng.int(1, 999));
  asphaltTex.repeat.set(80, 80);
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(596, 620, 1, 1),
    new THREE.MeshLambertMaterial({ map: asphaltTex, color: 0xb2ada4 })
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.set(-62, 0, 0);
  ground.receiveShadow = true;
  group.add(ground);

  // quay apron: the concrete shelf the city sits on, stopping at the water
  const apron = new THREE.Mesh(
    new THREE.BoxGeometry(30, 0.5, CITY.ground),
    new THREE.MeshLambertMaterial({ color: 0x45474c })
  );
  apron.position.set(CITY.shoreX - 5, -0.1, 0);
  apron.receiveShadow = true;
  group.add(apron);

  // --- blocks -----------------------------------------------------------------
  const blockHalf = CITY.pitch / 2 - CITY.roadHalf; // 31
  const usable = blockHalf - 3.4;

  const parks = new Set(['1:3', '3:1']);
  const lots = new Set(['0:4', '4:0', '2:3']);

  for (let bi = 0; bi < CITY.lines - 1; bi++) {
    for (let bj = 0; bj < CITY.lines - 1; bj++) {
      const cx = (roads[bi] + roads[bi + 1]) / 2;
      const cz = (roads[bj] + roads[bj + 1]) / 2;
      const key = `${bi}:${bj}`;

      // sidewalk slab
      solids.box(cx, WALK_H / 2, cz, blockHalf, WALK_H / 2, blockHalf, 0x8d8b86, { faces: 'top', shade: 1 });
      // curb shadow line
      solids.box(cx, WALK_H + 0.01, cz, blockHalf - 0.35, 0.02, blockHalf - 0.35, 0x6f6d69, { faces: 'top' });

      if (parks.has(key)) {
        addPark(rng, props, solids, cx, cz, usable);
        continue;
      }
      if (lots.has(key)) {
        addParkingLot(rng, solids, paint, cx, cz, usable);
        continue;
      }

      const downtown = 1 - clamp(Math.hypot(cx, cz) / 250, 0, 1);
      const dockSide = cx > 110 ? 0.45 : 1;
      const split = rng.chance(0.42) ? 2 : rng.chance(0.5) ? 4 : 1;

      if (split === 1) {
        addBuilding(rng, walls, solids, colliders, buildings, cx, cz, usable * 1.7, usable * 1.7,
          heightFor(rng, downtown, dockSide, bi, bj), signs);
      } else if (split === 2) {
        const along = rng.chance(0.5);
        for (let k = 0; k < 2; k++) {
          const off = (k === 0 ? -1 : 1) * usable * 0.5;
          const w = usable * 0.92;
          const h = usable * 1.75;
          const bx = cx + (along ? off : 0);
          const bz = cz + (along ? 0 : off);
          addBuilding(rng, walls, solids, colliders, buildings, bx, bz,
            along ? w : h, along ? h : w, heightFor(rng, downtown, dockSide, bi + k, bj), signs);
        }
      } else {
        for (let a = 0; a < 2; a++) {
          for (let b = 0; b < 2; b++) {
            const off = usable * 0.5;
            const bx = cx + (a === 0 ? -off : off);
            const bz = cz + (b === 0 ? -off : off);
            addBuilding(rng, walls, solids, colliders, buildings, bx, bz,
              usable * 0.92, usable * 0.92, heightFor(rng, downtown, dockSide, bi + a, bj + b), signs);
          }
        }
      }
    }
  }

  // --- waterfront: piers, containers, cranes, freighter -----------------------
  buildHarbor(rng, walls, solids, props, colliders, buildings, group, glowTex);

  // --- road paint --------------------------------------------------------------
  for (let axis = 0; axis < 2; axis++) {
    const lines = roads;
    for (let a = 0; a < lines.length; a++) {
      for (let b = 0; b < lines.length - 1; b++) {
        const from = lines[b] + CITY.roadHalf;
        const to = lines[b + 1] - CITY.roadHalf;
        if (axis === 0) {
          paint.box(lines[a], 0.035, (from + to) / 2, 0.12, 0.01, (to - from) / 2 - 1.2, 0x8a8578, { faces: 'top' });
          paint.box(lines[a] + 3.4, 0.028, (from + to) / 2, 0.06, 0.01, (to - from) / 2 - 1.2, 0x5e5d58, { faces: 'top' });
          paint.box(lines[a] - 3.4, 0.028, (from + to) / 2, 0.06, 0.01, (to - from) / 2 - 1.2, 0x5e5d58, { faces: 'top' });
        } else {
          paint.box((from + to) / 2, 0.035, lines[a], (to - from) / 2 - 1.2, 0.01, 0.12, 0x8a8578, { faces: 'top' });
          paint.box((from + to) / 2, 0.028, lines[a] + 3.4, (to - from) / 2 - 1.2, 0.01, 0.06, 0x5e5d58, { faces: 'top' });
          paint.box((from + to) / 2, 0.028, lines[a] - 3.4, (to - from) / 2 - 1.2, 0.01, 0.06, 0x5e5d58, { faces: 'top' });
        }
      }
      // crosswalk stripes at every intersection
      for (let b = 0; b < lines.length; b++) {
        for (let s = -4; s <= 4; s++) {
          const nx = lines[a] + s * 1.5;
          paint.box(nx, 0.04, lines[b] - CITY.roadHalf - 1.9, 0.55, 0.012, 1.1, 0x9e9a8c, { faces: 'top' });
          paint.box(lines[b] - CITY.roadHalf - 1.9, 0.04, nx, 1.1, 0.012, 0.55, 0x9e9a8c, { faces: 'top' });
        }
      }
    }
  }

  // --- lamps -------------------------------------------------------------------
  for (let bi = 0; bi < CITY.lines - 1; bi++) {
    for (let bj = 0; bj < CITY.lines - 1; bj++) {
      const cx = (roads[bi] + roads[bi + 1]) / 2;
      const cz = (roads[bj] + roads[bj + 1]) / 2;
      if (rng.chance(0.55)) {
        const lx = cx + (rng.chance(0.5) ? -1 : 1) * (blockHalf - 0.9);
        const lz = cz + (rng.chance(0.5) ? -1 : 1) * (blockHalf - 0.9);
        lamps.push({ x: lx, z: lz });
        solids.box(lx, 3.1, lz, 0.13, 3.1, 0.13, 0x2c3038);
        solids.box(lx, 6.3, lz, 0.46, 0.1, 0.12, 0x2c3038);
        solids.box(lx + 0.4, 6.2, lz, 0.26, 0.09, 0.2, 0xffdca8, { shade: 1.4 });
      }
    }
  }
  // a handful of real bulbs for the streets nearest the player start
  const lampLights = [];
  for (let i = 0; i < Math.min(10, lamps.length); i++) {
    const l = lamps[(i * 5) % lamps.length];
    const light = new THREE.PointLight(new THREE.Color('#ffcf96'), 12, 26, 2);
    light.position.set(l.x + 0.4, 6.0, l.z);
    group.add(light);
    lampLights.push(light);
    const glow = spriteFromTexture(glowTex, '#ffcf96', 2.0, 0.30);
    glow.position.set(l.x + 0.4, 6.2, l.z);
    group.add(glow);
  }

  // --- house the merged builders ----------------------------------------------
  const facades = makeFacadeTextures(rng.int(1, 9999), 'warm');
  const wallMesh = new THREE.Mesh(
    walls.geometry(),
    new THREE.MeshLambertMaterial({
      map: facades.map,
      vertexColors: true,
      emissive: new THREE.Color('#ffffff'),
      emissiveMap: facades.emissive,
      emissiveIntensity: 0.9,
    })
  );
  wallMesh.castShadow = true;
  wallMesh.receiveShadow = true;
  wallMesh.name = 'facades';
  group.add(wallMesh);

  const solidMesh = new THREE.Mesh(
    solids.geometry(),
    new THREE.MeshLambertMaterial({ vertexColors: true })
  );
  solidMesh.receiveShadow = true;
  solidMesh.castShadow = true;
  solidMesh.name = 'solids';
  group.add(solidMesh);

  const paintMesh = new THREE.Mesh(
    paint.geometry(),
    new THREE.MeshBasicMaterial({ vertexColors: true })
  );
  paintMesh.name = 'paint';
  group.add(paintMesh);

  if (!props.empty) {
    const propMesh = new THREE.Mesh(props.geometry(), new THREE.MeshLambertMaterial({ vertexColors: true }));
    propMesh.castShadow = true;
    propMesh.receiveShadow = true;
    propMesh.name = 'props';
    group.add(propMesh);
  }

  // neon signs
  for (const s of signs) {
    const tex = makeSignTexture(s.text, s.sub, s.color);
    const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, side: THREE.DoubleSide, toneMapped: false });
    const plane = new THREE.Mesh(new THREE.PlaneGeometry(s.w, s.h), mat);
    plane.position.set(s.x, s.y, s.z);
    plane.rotation.y = s.yaw;
    group.add(plane);
    const glow = spriteFromTexture(glowTex, s.color, s.w * 1.6, 0.28);
    glow.position.set(s.x, s.y, s.z);
    group.add(glow);
  }

  const graph = buildGraph(roads);
  const minimap = renderMinimapLayer(roads, buildings, rng.seed);

  const spots = {
    start: { x: -152, z: -118, heading: 0 },
    garage: { x: -140, z: -110 },
    dockCar: { x: 212, z: -28, heading: Math.PI * 0.5 },
    saltRow: { x: -30, z: 34 },
    berth9: { x: 262, z: 58 },
    crates: [
      { x: 120, z: -120 },
      { x: -40, z: 118 },
      { x: 186, z: 34 },
    ],
    medkits: [
      { x: -146, z: -108 },
      { x: 60, z: -6 },
    ],
  };

  return {
    seed: rng.seed,
    group,
    colliders,
    buildings,
    roads,
    graph,
    spots,
    minimap,
    lamps: lampLights,
    waterEdge: CITY.shoreX,
    blockHalf,
    // height of the walkable ground at a point (sidewalks are 16 cm up)
    groundAt(x, z) {
      const nearRoadX = roads.some((r) => Math.abs(x - r) < CITY.roadHalf);
      const nearRoadZ = roads.some((r) => Math.abs(z - r) < CITY.roadHalf);
      return nearRoadX || nearRoadZ ? 0 : WALK_H;
    },
    insideBuilding(x, z, pad = 0) {
      for (const c of colliders) {
        if (Math.abs(x - c.x) < c.hx + pad && Math.abs(z - c.z) < c.hz + pad) return c;
      }
      return null;
    },
  };
}

function roadLinesLocal() {
  const out = [];
  const start = -((CITY.lines - 1) * CITY.pitch) / 2;
  for (let i = 0; i < CITY.lines; i++) out.push(start + i * CITY.pitch);
  return out;
}

function heightFor(rng, downtown, dockSide, bi, bj) {
  const base = 12 + downtown * 34 + noise1(bi * 1.7 + bj * 0.6, 91) * 18;
  return Math.max(7, (base * dockSide) * rng.range(0.72, 1.28));
}

function addBuilding(rng, walls, solids, colliders, buildings, cx, cz, w, d, h, signs) {
  const hx = w / 2;
  const hz = d / 2;
  const palette = ['#9a9084', '#a89078', '#7f8b9c', '#b0947a', '#8d7f72', '#75828f', '#b8a48c', '#6b7481'];
  const color = rng.pick(palette);
  const y0 = WALK_H;

  walls.box(cx, y0 + h / 2, cz, hx, h / 2, hz, color, { uvOff: rng.range(0, 4) });

  // roof slab and a little parapet
  solids.box(cx, y0 + h + 0.18, cz, hx + 0.18, 0.18, hz + 0.18, 0x4a4a4e, { shade: 1 });
  if (h > 16 && rng.chance(0.7)) {
    solids.box(cx, y0 + h + 0.75, cz, hx + 0.05, 0.55, 0.12, 0x3e3e44);
    solids.box(cx, y0 + h + 0.75, cz, 0.12, 0.55, hz + 0.05, 0x3e3e44);
  }
  // rooftop plant
  if (rng.chance(0.55)) {
    solids.box(cx + rng.range(-hx * 0.4, hx * 0.4), y0 + h + 1.1, cz + rng.range(-hz * 0.4, hz * 0.4),
      rng.range(1.2, 2.4), 0.9, rng.range(1.2, 2.2), 0x55585f);
  }

  colliders.push({ x: cx, z: cz, hx, hz, h: h + y0, kind: 'building' });
  buildings.push({ x: cx, z: cz, hx, hz, h });

  // a lit shopfront at street level on one face
  if (h < 48 && rng.chance(0.8)) {
    const face = rng.int(0, 3);
    const signColor = rng.pick(['#ff7a59', '#37e0c4', '#f2a541', '#ff5c6c', '#9ad1ff']);
    const names = ['MOTEL', 'DINER', 'LIQUOR', 'PAWN', 'BAIT', 'TATTOO', 'NOODLE', 'GARAGE'];
    const words = ['OPEN LATE', 'COLD BEER', 'CASH ONLY', 'PIER 9', 'SEA FOOD', 'VACANCY'];
    const sy = y0 + rng.range(4.0, Math.min(7.5, h - 1));
    if (face === 0) signs.push({ x: cx, y: sy, z: cz + hz + 0.12, yaw: 0, w: 9, h: 4.5, text: rng.pick(names), sub: rng.pick(words), color: signColor });
    if (face === 1) signs.push({ x: cx, y: sy, z: cz - hz - 0.12, yaw: Math.PI, w: 9, h: 4.5, text: rng.pick(names), sub: rng.pick(words), color: signColor });
    if (face === 2) signs.push({ x: cx + hx + 0.12, y: sy, z: cz, yaw: Math.PI / 2, w: 9, h: 4.5, text: rng.pick(names), sub: rng.pick(words), color: signColor });
    if (face === 3) signs.push({ x: cx - hx - 0.12, y: sy, z: cz, yaw: -Math.PI / 2, w: 9, h: 4.5, text: rng.pick(names), sub: rng.pick(words), color: signColor });
  }
}

function addPark(rng, props, solids, cx, cz, usable) {
  solids.box(cx, WALK_H + 0.02, cz, usable * 0.95, 0.02, usable * 0.95, 0x35513f, { faces: 'top' });
  solids.box(cx, WALK_H + 0.05, cz, usable * 0.55, 0.03, usable * 0.12, 0x6d6a5f, { faces: 'top' });
  const n = rng.int(5, 9);
  for (let i = 0; i < n; i++) {
    const x = cx + rng.range(-usable * 0.85, usable * 0.85);
    const z = cz + rng.range(-usable * 0.85, usable * 0.85);
    const h = rng.range(4.5, 8.5);
    props.box(x, WALK_H + h / 2, z, 0.22, h / 2, 0.22, 0x4a3a2c);
    for (let k = 0; k < 4; k++) {
      const a = (k / 4) * Math.PI * 2 + rng.range(-0.3, 0.3);
      props.box(x + Math.cos(a) * 1.5, WALK_H + h + 0.4, z + Math.sin(a) * 1.5, 1.6, 0.16, 0.5, 0x3f6b45, { yaw: a });
    }
    props.box(x, WALK_H + h + 0.85, z, 0.9, 0.3, 0.9, 0x4c7a4e);
  }
}

function addParkingLot(rng, solids, paint, cx, cz, usable) {
  solids.box(cx, WALK_H + 0.02, cz, usable * 0.95, 0.02, usable * 0.95, 0x2b2e34, { faces: 'top' });
  for (let i = -3; i <= 3; i++) {
    paint.box(cx + i * 7.2, WALK_H + 0.05, cz, 0.08, 0.01, usable * 0.8, 0xcfc9b6, { faces: 'top' });
  }
}

function buildHarbor(rng, walls, solids, props, colliders, buildings, group, glowTex) {
  const x0 = CITY.shoreX;

  // quay wall
  solids.box(x0 + 1, -1.2, 0, 2.2, 2.6, 250, 0x54524c);
  // apron stripes
  for (let z = -220; z <= 220; z += 12) {
    solids.box(x0 - 14, 0.03, z, 16, 0.02, 0.16, 0x8a8577, { faces: 'top' });
  }

  // piers reaching into the water
  const piers = [-70, 58];
  for (const pz of piers) {
    solids.box(x0 + 40, 0.12, pz, 40, 0.3, 9, 0x6a6355);
    solids.box(x0 + 40, 0.32, pz, 40, 0.06, 9.2, 0x7a7263, { faces: 'top' });
    for (let i = 0; i < 9; i++) {
      const px = x0 + 6 + i * 8.5;
      props.box(px, -1.4, pz + 8.2, 0.42, 2.2, 0.42, 0x4a4237);
      props.box(px, -1.4, pz - 8.2, 0.42, 2.2, 0.42, 0x4a4237);
    }
    // bollards
    for (let i = 0; i < 6; i++) {
      props.box(x0 + 12 + i * 11, 0.75, pz + 7.2, 0.28, 0.45, 0.28, 0x2f2f33);
    }
  }

  // containers in rows along the apron
  const colors = [0xa8452f, 0x2f6070, 0x6f6a3a, 0x3a5a45, 0x7a4a2a, 0x4a4a58];
  for (let i = 0; i < 26; i++) {
    const cx = x0 + 8 + rng.range(0, 26);
    const cz = -190 + i * 15 + rng.range(-2, 2);
    // keep both pier mouths clear so the berth and the stolen car stay reachable
    if (Math.abs(cz + 70) < 18 || Math.abs(cz - 58) < 18) continue;
    const stack = rng.int(1, 2);
    for (let s = 0; s < stack; s++) {
      const c = rng.pick(colors);
      props.box(cx, 1.5 + s * 2.6, cz, 4.2, 1.25, 1.2, c, { yaw: rng.chance(0.5) ? 0 : Math.PI / 2 });
      colliders.push({ x: cx, z: cz, hx: 4.2, hz: 1.4, h: 2.8 + s * 2.6, kind: 'container' });
      buildings.push({ x: cx, z: cz, hx: 4.2, hz: 1.4, h: 3 });
    }
  }

  // gantry cranes
  for (const cz of [-120, 10, 130]) {
    const cx = x0 + 22;
    for (const dz of [-6, 6]) {
      for (const dx of [-9, 9]) {
        props.box(cx + dx, 9, cz + dz, 0.55, 9, 0.55, 0x8a5a2a);
        colliders.push({ x: cx + dx, z: cz + dz, hx: 0.6, hz: 0.6, h: 18, kind: 'crane' });
      }
    }
    props.box(cx, 18.2, cz - 6, 10.5, 0.6, 0.6, 0x8a5a2a);
    props.box(cx, 18.2, cz + 6, 10.5, 0.6, 0.6, 0x8a5a2a);
    props.box(cx, 18.4, cz, 0.7, 0.5, 6.6, 0x9a6a36);
    props.box(cx + 3, 15.5, cz, 0.28, 3.0, 0.28, 0x2f3338);
    props.box(cx + 3, 12.3, cz, 1.4, 0.5, 1.4, 0x3f444a);
  }

  // warehouse
  const wx = x0 - 26;
  walls.box(wx, 4.2, -150, 14, 4.2, 22, '#6a5a4a', { uvOff: 2 });
  solids.box(wx, 8.6, -150, 14.3, 0.4, 22.3, 0x4a443c);
  colliders.push({ x: wx, z: -150, hx: 14, hz: 22, h: 8.6, kind: 'warehouse' });
  buildings.push({ x: wx, z: -150, hx: 14, hz: 22, h: 8.6 });

  // the freighter at berth nine
  const fx = x0 + 58;
  const fz = 58;
  props.box(fx, 2.2, fz, 34, 2.2, 7.4, 0x2b3038);
  props.box(fx, 4.6, fz, 33, 0.5, 7.0, 0x3a4048);
  props.box(fx - 26, 6.8, fz, 5.2, 2.2, 5.2, 0x555b63);
  props.box(fx - 26, 9.4, fz, 3.6, 0.4, 3.6, 0x444a52);
  for (let i = 0; i < 10; i++) {
    props.box(fx - 18 + i * 4.4, 7.1 + (i % 2) * 2.4, fz + (i % 2 ? 2.2 : -2.2), 2.0, 1.1, 1.2, i % 3 === 0 ? 0x8a4a32 : 0x3f5f6a);
  }
  props.box(fx + 30, 5.2, fz, 2.0, 1.2, 5.4, 0x2b3038);
  colliders.push({ x: fx, z: fz, hx: 34, hz: 7.4, h: 9, kind: 'ship' });

  // a couple of tugs
  for (const [tx, tz] of [[x0 + 26, -150], [x0 + 30, 160]]) {
    props.box(tx, 1.1, tz, 7, 1.1, 2.6, 0x9a3f34);
    props.box(tx - 1, 2.6, tz, 2.4, 1.0, 1.8, 0xd9d4c6);
    props.box(tx - 1, 4.0, tz, 0.5, 0.9, 0.5, 0x33383f);
  }

  // palms along the promenade
  for (let z = -200; z <= 200; z += 26) {
    const px = x0 - 6.5;
    props.box(px, 3.2, z, 0.26, 3.2, 0.26, 0x5a4632);
    for (let k = 0; k < 5; k++) {
      const a = (k / 5) * Math.PI * 2;
      props.box(px + Math.cos(a) * 1.7, 6.5, z + Math.sin(a) * 1.7, 1.8, 0.14, 0.5, 0x3d6b47, { yaw: a });
    }
  }

  // promenade railing
  for (let z = -230; z < 230; z += 5) {
    props.box(x0 - 1.2, 0.6, z, 0.08, 0.6, 0.08, 0x3a3d42);
  }
  props.box(x0 - 1.2, 1.15, 0, 0.1, 0.08, 230, 0x4a4d52);
}

// --- traffic graph -------------------------------------------------------------

function buildGraph(roads) {
  const nodes = [];
  const index = new Map();
  for (let i = 0; i < roads.length; i++) {
    for (let j = 0; j < roads.length; j++) {
      const id = i * roads.length + j;
      nodes.push({ id, i, j, x: roads[i], z: roads[j], next: [] });
      index.set(`${i}:${j}`, id);
    }
  }
  for (const node of nodes) {
    const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]];
    for (const [di, dj] of dirs) {
      const ni = node.i + di;
      const nj = node.j + dj;
      if (ni < 0 || nj < 0 || ni >= roads.length || nj >= roads.length) continue;
      node.next.push({ id: index.get(`${ni}:${nj}`), dx: Math.sign(di), dz: Math.sign(dj) });
    }
  }
  return {
    nodes,
    nearest(x, z) {
      let best = 0;
      let bestD = Infinity;
      for (const n of nodes) {
        const d = (n.x - x) * (n.x - x) + (n.z - z) * (n.z - z);
        if (d < bestD) { bestD = d; best = n.id; }
      }
      return nodes[best];
    },
    around(x, z, radius) {
      return nodes.filter((n) => (n.x - x) ** 2 + (n.z - z) ** 2 < radius * radius);
    },
  };
}

// --- minimap -------------------------------------------------------------------

function renderMinimapLayer(roads, buildings, seed) {
  const S = 600;
  const span = 560;
  const canvas = document.createElement('canvas');
  canvas.width = S;
  canvas.height = S;
  const ctx = canvas.getContext('2d');
  const toMap = (v) => ((v + span / 2) / span) * S;

  ctx.fillStyle = '#101a20';
  ctx.fillRect(0, 0, S, S);

  // water east of the shore
  const shore = toMap(CITY.shoreX);
  const grad = ctx.createLinearGradient(shore, 0, S, 0);
  grad.addColorStop(0, '#1b4a52');
  grad.addColorStop(1, '#0d2a33');
  ctx.fillStyle = grad;
  ctx.fillRect(shore, 0, S - shore, S);

  // blocks
  ctx.fillStyle = '#1b222b';
  for (let i = 0; i < roads.length - 1; i++) {
    for (let j = 0; j < roads.length - 1; j++) {
      const x = (roads[i] + roads[i + 1]) / 2;
      const z = (roads[j] + roads[j + 1]) / 2;
      const half = (roads[i + 1] - roads[i]) / 2 - CITY.roadHalf;
      ctx.fillRect(toMap(x - half), toMap(z - half), (half * 2 / span) * S, (half * 2 / span) * S);
    }
  }

  // buildings, brighter with height
  for (const b of buildings) {
    const v = Math.min(1, b.h / 50);
    ctx.fillStyle = `rgba(${90 + v * 90}, ${86 + v * 80}, ${80 + v * 70}, 0.95)`;
    ctx.fillRect(toMap(b.x - b.hx), toMap(b.z - b.hz), ((b.hx * 2) / span) * S, ((b.hz * 2) / span) * S);
  }

  // roads
  ctx.strokeStyle = '#39424d';
  ctx.lineWidth = (CITY.roadHalf * 2 / span) * S;
  for (const r of roads) {
    ctx.beginPath();
    ctx.moveTo(toMap(r), 0);
    ctx.lineTo(toMap(r), S);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(0, toMap(r));
    ctx.lineTo(S, toMap(r));
    ctx.stroke();
  }

  // piers
  ctx.fillStyle = '#2a2f36';
  for (const pz of [-70, 58]) {
    ctx.fillRect(toMap(CITY.shoreX), toMap(pz - 9), (80 / span) * S, (18 / span) * S);
  }

  ctx.strokeStyle = 'rgba(242,165,65,0.18)';
  ctx.lineWidth = 2;
  ctx.strokeRect(1, 1, S - 2, S - 2);
  return canvas;
}

// --- collisions ----------------------------------------------------------------

export function resolveCircle(world, pos, radius) {
  let hit = false;
  for (const c of world.colliders) {
    const dx = pos.x - c.x;
    const dz = pos.z - c.z;
    const px = c.hx + radius - Math.abs(dx);
    const pz = c.hz + radius - Math.abs(dz);
    if (px > 0 && pz > 0) {
      hit = true;
      if (px < pz) pos.x += Math.sign(dx || 1) * px;
      else pos.z += Math.sign(dz || 1) * pz;
    }
  }
  // the sea wall keeps everyone on the quay unless they are on a pier deck
  const onPier = Math.abs(pos.z + 70) < 10 || Math.abs(pos.z - 58) < 10;
  if (pos.x > CITY.shoreX - 1.2 && !onPier) {
    pos.x = CITY.shoreX - 1.2;
    hit = true;
  }
  return hit;
}

// Ray against the city's boxes, in 2D. Returns the nearest t and what it hit.
export function raycastWorld(world, origin, dir, maxDist) {
  let best = maxDist;
  let hit = null;
  for (const c of world.colliders) {
    const t = rayBox2D(origin, dir, c, best);
    if (t !== null && t < best) {
      best = t;
      hit = c;
    }
  }
  return { dist: best, collider: hit };
}

function rayBox2D(o, d, box, maxT) {
  let tmin = 0;
  let tmax = maxT;
  const axes = [
    ['x', box.x - box.hx, box.x + box.hx],
    ['z', box.z - box.hz, box.z + box.hz],
  ];
  for (const [axis, lo, hi] of axes) {
    const od = axis === 'x' ? o.x : o.z;
    const dd = axis === 'x' ? d.x : d.z;
    if (Math.abs(dd) < 1e-6) {
      if (od < lo || od > hi) return null;
    } else {
      let t1 = (lo - od) / dd;
      let t2 = (hi - od) / dd;
      if (t1 > t2) { const t = t1; t1 = t2; t2 = t; }
      tmin = Math.max(tmin, t1);
      tmax = Math.min(tmax, t2);
      if (tmin > tmax) return null;
    }
  }
  return tmin > 0 ? tmin : null;
}

export function districtAt(x, z) {
  if (x > 150) return 'PIER NINE';
  if (z < -120) return 'TIDE FLATS';
  if (z > 120) return 'SALT ROW';
  if (Math.abs(x) < 70 && Math.abs(z) < 70) return 'MARLIN HEIGHTS';
  return 'VICE HARBOR';
}

export { WALK_H };
