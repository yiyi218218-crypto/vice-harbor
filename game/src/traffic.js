// The street life: cars that keep to their lane and turn at corners, and pedestrians who walk the
// pavements and scatter when a gun goes off. Both are steered by a small "aim at the next node"
// model, so nothing needs a navmesh and the whole crowd costs a handful of draws each.
import * as THREE from '../vendor/three.min.js';
import { CITY } from './config.js';
import { MeshBuilder } from './mesh.js';
import { buildCar, CAR_COLORS, CAR_TYPES } from './cars.js';

const PITCH = CITY.pitch;
const HALF = CITY.half;
const LANE = 4.4;

const SHIRTS = [0xe8544f, 0x3f7fd4, 0xf0e2c8, 0x2fa88a, 0xd9a13d, 0x7a4bb5, 0x1f2733, 0xe07fa8, 0x6d8f5a, 0xf2f2f2];
const PANTS = [0x2b3140, 0x40342c, 0x1c2430, 0x5a4a3a, 0x30303c];
const SKIN = [0xd9a878, 0xb07850, 0x8a5a3a, 0xefc9a0, 0x6b4229];

/** One person: a torso, a head, arms and a pair of legs that swing as they walk. */
export function buildPerson(shirt, pants, skin, scale = 1) {
  const group = new THREE.Group();
  const torso = new MeshBuilder();
  torso.part(0, 1.06, 0, 0.46, 0.62, 0.26, 0, new THREE.Color(shirt));
  torso.part(0, 1.44, 0, 0.2, 0.2, 0.2, 0, new THREE.Color(skin));
  torso.part(0, 1.56, 0.02, 0.26, 0.16, 0.24, 0, new THREE.Color(0x2a2118));
  for (const sx of [-1, 1]) torso.part(sx * 0.3, 1.04, 0, 0.13, 0.56, 0.15, 0, new THREE.Color(shirt).multiplyScalar(0.85));
  const torsoMesh = new THREE.Mesh(torso.geometry(), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85 }));
  torsoMesh.castShadow = true;
  group.add(torsoMesh);

  const legs = new THREE.Group();
  const legGeo = new MeshBuilder();
  legGeo.part(0, 0.42, 0.06, 0.16, 0.84, 0.18, 0, new THREE.Color(pants));
  const legMesh = new THREE.Mesh(legGeo.geometry(), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9 }));
  const legL = legMesh.clone();
  const legR = legMesh.clone();
  legL.position.set(-0.12, 0.84, 0);
  legR.position.set(0.12, 0.84, 0);
  legL.castShadow = true;
  legR.castShadow = true;
  legs.add(legL, legR);
  group.add(legs);
  group.scale.setScalar(scale);
  return { group, legs: [legL, legR], torso };
}

/** A node position on the road grid. */
function nodePos(i, j) {
  return { x: -HALF + i * PITCH, z: -HALF + j * PITCH };
}

/** Snap a world point to the nearest node. */
function nearestNode(x, z) {
  const i = Math.max(0, Math.min(CITY.blocks, Math.round((x + HALF) / PITCH)));
  const j = Math.max(0, Math.min(CITY.blocks, Math.round((z + HALF) / PITCH)));
  return { i, j };
}

export function createTraffic(scene, city, random) {
  const cars = [];
  const peds = [];
  const group = new THREE.Group();
  group.name = 'traffic';
  scene.add(group);

  /* --- traffic -------------------------------------------------------------------- */
  function spawnCar({ x, z, heading, parked = false, type = null } = {}) {
    const kind = type ?? random.pick(['sedan', 'sedan', 'coupe', 'taxi', 'van', 'pickup', 'sports', 'muscle']);
    const color = kind === 'taxi' ? 0xf0c03a : random.pick(CAR_COLORS);
    const car = buildCar(kind, color);
    group.add(car.group);
    const node = nearestNode(x, z);
    const body = {
      kind, car, color,
      x, z, heading,
      speed: parked ? 0 : random.range(8, 15),
      lane: random.chance(0.5) ? LANE : -LANE,
      node,
      lastDir: Math.abs(Math.sin(heading)) > Math.abs(Math.cos(heading))
        ? [Math.sign(Math.sin(heading)), 0]
        : [0, Math.sign(Math.cos(heading))],
      parked,
      alive: true,
      hp: 120,
      spec: CAR_TYPES[kind],
      wobble: random() * 6.28,
    };
    car.group.position.set(x, 0, z);
    car.group.rotation.y = heading;
    cars.push(body);
    return body;
  }

  // Fill the grid with moving traffic, spread over the whole map.
  for (let i = 0; i < 34; i += 1) {
    const p = city.randomRoadPoint();
    const car = spawnCar({ x: p.x, z: p.z, heading: p.heading });
    car.speed = random.range(9, 16);
  }
  // Parked cars along the kerbs, for the player to take.
  for (let i = 0; i < 22; i += 1) {
    const line = city.roadLines[Math.floor(random() * city.roadLines.length)];
    const along = -HALF + random() * HALF * 2;
    const side = random.chance(0.5) ? 1 : -1;
    const offset = side * (CITY.road / 2 - 1.6);
    const heading = line.axis === 'x' ? (side > 0 ? Math.PI : 0) : (side > 0 ? Math.PI / 2 : -Math.PI / 2);
    if (line.axis === 'x') spawnCar({ x: line.at + offset, z: along, heading, parked: true });
    else spawnCar({ x: along, z: line.at + offset, heading, parked: true });
  }

  /* --- pedestrians ---------------------------------------------------------------- */
  function spawnPed(x, z) {
    const scale = random.range(0.92, 1.06);
    const person = buildPerson(random.pick(SHIRTS), random.pick(PANTS), random.pick(SKIN), scale);
    group.add(person.group);
    const ped = {
      ...person,
      x, z,
      heading: random() * 6.28,
      speed: random.range(1.1, 1.8),
      walk: random() * 6.28,
      target: null,
      state: 'walk',
      panic: 0,
      alive: true,
      dead: 0,
    };
    ped.group.position.set(x, 0, z);
    peds.push(ped);
    return ped;
  }

  /** A point on the pavement ring of a random block. */
  function sidewalkPoint(cx, cz, size) {
    const side = Math.floor(random() * 4);
    const inset = CITY.sidewalk * 0.6;
    const half = size / 2 - inset;
    const t = random.range(-half, half);
    if (side === 0) return { x: cx + t, z: cz - half };
    if (side === 1) return { x: cx + half, z: cz + t };
    if (side === 2) return { x: cx + t, z: cz + half };
    return { x: cx - half, z: cz + t };
  }

  for (let i = 0; i < 46; i += 1) {
    const block = random.pick(city.blocks);
    const p = sidewalkPoint(block.x, block.z, CITY.block);
    spawnPed(p.x, p.z);
  }

  /* --- update --------------------------------------------------------------------- */
  const tmp = new THREE.Vector3();

  function update(dt, ctx) {
    const player = ctx.playerPos;

    for (const car of cars) {
      if (!car.alive) continue;
      if (!car.parked) {
        // Aim at the lane point beside the next node, then take the next one on arrival.
        const node = nodePos(car.node.i, car.node.j);
        const toNodeX = node.x - car.x;
        const toNodeZ = node.z - car.z;
        const dist = Math.hypot(toNodeX, toNodeZ);
        if (dist < 3.4) {
          turn(car);
        }
        const ahead = Math.hypot(player.x - car.x, player.z - car.z);
        let want = car.speed;
        // Brake for the car in front, and for the player standing in the road.
        for (const other of cars) {
          if (other === car || !other.alive) continue;
          const dx = other.x - car.x;
          const dz = other.z - car.z;
          const d = Math.hypot(dx, dz);
          if (d > 16) continue;
          const fwd = Math.cos(car.heading) * dz + Math.sin(car.heading) * dx;
          if (fwd > 0 && d < 11) want = Math.min(want, other.speed * 0.8);
        }
        if (ahead < 9 && ctx.playerOnFoot) want = Math.min(want, 2);
        car.speed += (want - car.speed) * Math.min(1, dt * 2.4);
        // Keep the lane: aim at the point beside the next node, on the right of travel.
        const dx = node.x - car.x;
        const dz = node.z - car.z;
        const len = Math.max(0.001, Math.hypot(dx, dz));
        const laneX = node.x + (-dz / len) * car.lane;
        const laneZ = node.z + (dx / len) * car.lane;
        const desired = Math.atan2(laneX - car.x, laneZ - car.z);
        let diff = ((desired - car.heading + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
        car.heading += Math.max(-1.9 * dt, Math.min(1.9 * dt, diff));
        car.x += Math.sin(car.heading) * car.speed * dt;
        car.z += Math.cos(car.heading) * car.speed * dt;
        // Never let one end up inside a building.
        if (city.solidAt(car.x, car.z, 1.2)) {
          car.x -= Math.sin(car.heading) * car.speed * dt;
          car.z -= Math.cos(car.heading) * car.speed * dt;
          turn(car);
        }
      }
      car.car.group.position.set(car.x, 0, car.z);
      car.car.group.rotation.y = car.heading;
    }

    /** Pick the next node: keep going straight most of the time, never U-turn. */
    function turn(car) {
      const { i, j } = car.node;
      const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]].filter(([a, b]) => {
        const ni = i + a;
        const nj = j + b;
        if (ni < 0 || ni > CITY.blocks || nj < 0 || nj > CITY.blocks) return false;
        return !(car.lastDir && a === -car.lastDir[0] && b === -car.lastDir[1]);
      });
      if (dirs.length === 0) return;
      const straight = dirs.find(([a, b]) => a === car.lastDir?.[0] && b === car.lastDir?.[1]);
      const choice = straight && random.chance(0.66) ? straight : random.pick(dirs);
      car.lastDir = choice;
      car.node = { i: i + choice[0], j: j + choice[1] };
    }

    /* --- people ------------------------------------------------------------------- */
    for (const ped of peds) {
      if (!ped.alive) {
        ped.dead += dt;
        ped.group.rotation.z = Math.min(1.5, ped.dead * 4);
        ped.group.position.y = Math.max(-0.1, 0.2 - ped.dead * 0.4);
        if (ped.dead > 6) ped.group.visible = false;
        continue;
      }
      const distToPlayer = Math.hypot(player.x - ped.x, player.z - ped.z);
      if (ped.panic > 0) ped.panic -= dt;
      if (ctx.alarm && distToPlayer < 26) ped.panic = Math.max(ped.panic, 2.4);

      if (ped.panic > 0 && distToPlayer < 40) {
        // Run from the player, away from the street, arms up.
        ped.state = 'flee';
        const away = Math.atan2(ped.x - player.x, ped.z - player.z);
        ped.heading = away;
        ped.x += Math.sin(away) * 5.4 * dt;
        ped.z += Math.cos(away) * 5.4 * dt;
        ped.walk += dt * 15;
      } else {
        if (!ped.target || Math.hypot(ped.target.x - ped.x, ped.target.z - ped.z) < 1.2) {
          const block = random.pick(city.blocks);
          ped.target = sidewalkPoint(block.x, block.z, CITY.block);
        }
        const desired = Math.atan2(ped.target.x - ped.x, ped.target.z - ped.z);
        let diff = ((desired - ped.heading + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
        ped.heading += Math.max(-3 * dt, Math.min(3 * dt, diff));
        ped.x += Math.sin(ped.heading) * ped.speed * dt;
        ped.z += Math.cos(ped.heading) * ped.speed * dt;
        ped.walk += dt * ped.speed * 3.4;
      }
      if (city.solidAt(ped.x, ped.z, 0.4)) {
        ped.x -= Math.sin(ped.heading) * 0.6;
        ped.z -= Math.cos(ped.heading) * 0.6;
        ped.target = null;
        ped.heading += 2.1;
      }
      ped.group.position.set(ped.x, Math.abs(Math.sin(ped.walk)) * 0.045, ped.z);
      ped.group.rotation.y = ped.heading;
      const swing = Math.sin(ped.walk) * 0.62;
      ped.legs[0].rotation.x = swing;
      ped.legs[1].rotation.x = -swing;
    }
  }

  /** True if a car is close enough to steal from `pos`. */
  function carNear(pos, range = 5) {
    let best = null;
    let bestD = range;
    for (const car of cars) {
      if (!car.alive) continue;
      const d = Math.hypot(car.x - pos.x, car.z - pos.z);
      if (d < bestD) {
        bestD = d;
        best = car;
      }
    }
    return best;
  }

  /** Take a car off the street: the player is driving it now. */
  function remove(car) {
    car.alive = false;
    car.parked = false;
    group.remove(car.car.group);
  }

  /** Put a car back on the street at the player's parking spot. */
  function abandon(x, z, heading, kind = 'sedan') {
    const car = spawnCar({ x, z, heading, parked: true, type: kind });
    car.speed = 0;
    return car;
  }

  /** A bullet or a bumper found a car: it slows, then burns. */
  function damage(car, amount, onDestroy) {
    car.hp -= amount;
    if (car.hp <= 0 && car.alive) {
      car.alive = false;
      car.wreck = true;
      car.car.group.rotation.z = 0.06;
      if (onDestroy) onDestroy(car);
    }
  }

  /** Everyone within `radius` of a bang runs. */
  function alarm(x, z, radius = 40) {
    for (const ped of peds) {
      if (ped.alive && Math.hypot(ped.x - x, ped.z - z) < radius) ped.panic = Math.max(ped.panic, 2.6);
    }
  }

  return {
    group,
    cars,
    peds,
    update,
    carNear,
    remove,
    abandon,
    damage,
    alarm,
    spawnCar,
    spawnPed,
    /** The nearest pedestrian to a shot, for a hit test. */
    pedNear(pos, range) {
      let best = null;
      let bestD = range;
      for (const ped of peds) {
        if (!ped.alive) continue;
        const d = Math.hypot(ped.x - pos.x, ped.z - pos.z);
        if (d < bestD) {
          bestD = d;
          best = ped;
        }
      }
      return best;
    },
  };
}
