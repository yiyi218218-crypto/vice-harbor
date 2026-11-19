// The Vice Harbor Police Department: the wanted meter, the cruisers that come for it, the officers
// who get out and shoot, and the helicopter that joins at four stars. Stars are a float, so the
// meter cools continuously once the player has broken line of sight for long enough.
import * as THREE from '../vendor/three.min.js';
import { WANTED, CITY } from './config.js';
import { buildCar } from './cars.js';
import { buildPerson } from './traffic.js';

const HALF = CITY.half;

/** The helicopter: a body, a spinning rotor and a searchlight that sweeps the street. */
function buildHeli() {
  const group = new THREE.Group();
  const dark = new THREE.MeshStandardMaterial({ color: 0x1b2230, roughness: 0.6, metalness: 0.3 });
  const body = new THREE.Mesh(new THREE.BoxGeometry(2.6, 2.2, 5.4), dark);
  body.position.y = 0;
  const glass = new THREE.Mesh(new THREE.BoxGeometry(2.2, 1.3, 2.2), new THREE.MeshStandardMaterial({ color: 0x2c4c66, roughness: 0.15, metalness: 0.7 }));
  glass.position.set(0, 0.5, 2.1);
  const tail = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.6, 4.4), dark);
  tail.position.set(0, 0.4, -4.4);
  const fin = new THREE.Mesh(new THREE.BoxGeometry(0.16, 1.5, 1.2), dark);
  fin.position.set(0, 1.0, -6.2);
  const rotor = new THREE.Mesh(new THREE.BoxGeometry(11, 0.1, 0.5), dark);
  rotor.position.y = 1.3;
  const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 1.2, 6), dark);
  mast.position.y = 1.1;
  const skidGeo = new THREE.BoxGeometry(0.14, 0.14, 3.6);
  const skidL = new THREE.Mesh(skidGeo, dark);
  const skidR = new THREE.Mesh(skidGeo, dark);
  skidL.position.set(-1.0, -1.3, 0.4);
  skidR.position.set(1.0, -1.3, 0.4);
  group.add(body, glass, tail, fin, rotor, mast, skidL, skidR);
  const lampGeo = new THREE.ConeGeometry(4.2, 34, 12, 1, true);
  lampGeo.rotateX(Math.PI);
  lampGeo.translate(0, -17, 0);
  const lamp = new THREE.Mesh(lampGeo, new THREE.MeshBasicMaterial({
    color: 0xdff0ff, transparent: true, opacity: 0.09, blending: THREE.AdditiveBlending,
    depthWrite: false, side: THREE.DoubleSide,
  }));
  lamp.position.y = -1.4;
  group.add(lamp);
  return { group, rotor, lamp };
}

export function createPolice(scene, city, audio, effects) {
  const units = [];
  const group = new THREE.Group();
  group.name = 'police';
  scene.add(group);

  const state = {
    wanted: 0,
    heat: 0,
    escape: 0,
    busted: 0,
    kills: 0,
    siren: 0,
  };

  function addUnit(unit) {
    units.push(unit);
    return unit;
  }

  /** A cruiser, spawned on a road near the player and pointed at them. */
  function spawnCruiser(player, minDist = 70) {
    for (let i = 0; i < 30; i += 1) {
      const p = city.randomRoadPoint();
      const d = Math.hypot(p.x - player.x, p.z - player.z);
      if (d < minDist || d > 230) continue;
      const car = buildCar('cruiser', 0x14161c, { police: true });
      car.group.position.set(p.x, 0, p.z);
      group.add(car.group);
      return addUnit({
        kind: 'car', car, x: p.x, z: p.z, heading: p.heading, speed: 0,
        hp: 160, alive: true, stuck: 0, wheelSpin: 0, sirenPhase: Math.random() * 6,
      });
    }
    return null;
  }

  /** An officer on foot, dropped 20 to 40 m away around the player. */
  function spawnCop(player, minDist = 18) {
    const a = Math.random() * Math.PI * 2;
    const d = minDist + Math.random() * 22;
    let x = player.x + Math.cos(a) * d;
    let z = player.z + Math.sin(a) * d;
    x = Math.max(-HALF + 12, Math.min(HALF - 12, x));
    z = Math.max(-HALF + 12, Math.min(HALF - 12, z));
    if (city.solidAt(x, z, 1)) return null;
    const person = buildPerson(0x1d2a44, 0x141b2b, 0xc79a72, 1.02);
    person.group.position.set(x, 0, z);
    group.add(person.group);
    return addUnit({
      kind: 'cop', person, x, z, heading: 0, hp: 60, alive: true,
      walk: Math.random() * 6, aim: Math.random(), wait: 0,
    });
  }

  let heli = null;
  function spawnHeli(player) {
    if (heli) return heli;
    const model = buildHeli();
    model.group.position.set(player.x + 70, 52, player.z + 70);
    group.add(model.group);
    heli = addUnit({ kind: 'heli', model, x: player.x + 70, z: player.z + 70, hp: 999, alive: true, phase: 0 });
    return heli;
  }

  function remove(unit) {
    unit.alive = false;
    if (unit.kind === 'car') group.remove(unit.car.group);
    else if (unit.kind === 'cop') group.remove(unit.person.group);
    else if (unit.kind === 'heli') {
      group.remove(unit.model.group);
      heli = null;
    }
  }

  function clear() {
    for (const unit of units) {
      if (unit.kind === 'car') group.remove(unit.car.group);
      else if (unit.kind === 'cop') group.remove(unit.person.group);
      else if (unit.kind === 'heli') group.remove(unit.model.group);
    }
    units.length = 0;
    heli = null;
    state.wanted = 0;
    state.heat = 0;
    state.escape = 0;
    state.siren = 0;
    audio.setSiren(0);
  }

  /** A crime pushes the meter up; the top of the ladder is five stars. */
  function crime(amount) {
    if (amount <= 0) return;
    state.wanted = Math.min(WANTED.max, state.wanted + amount);
    state.heat = 0;
    state.escape = 0;
    if (state.wanted > 0.4) audio.play('star');
  }

  function hurtUnit(unit, damage) {
    if (!unit.alive) return;
    unit.hp -= damage;
    if (unit.hp <= 0) {
      if (unit.kind === 'cop') {
        unit.alive = false;
        unit.person.group.rotation.z = 1.5;
        unit.person.group.position.y = 0.1;
        state.kills += 1;
        effects.impact(new THREE.Vector3(unit.x, 1, unit.z), new THREE.Vector3(0, 1, 0), true);
        crime(0.5);
      } else if (unit.kind === 'car') {
        remove(unit);
        effects.explosion(new THREE.Vector3(unit.x, 0.6, unit.z));
        audio.play('crash');
      }
    }
  }

  const tmp = new THREE.Vector3();
  let spawnTimer = 0;

  function update(dt, player, ctx) {
    const stars = Math.min(WANTED.max, Math.ceil(state.wanted));
    const spec = WANTED.stars[stars];
    const px = player.state.x;
    const pz = player.state.z;

    // Cool down when nobody has eyes on the player.
    const nearest = units.reduce((best, unit) => {
      if (!unit.alive) return best;
      const d = Math.hypot(unit.x - px, unit.z - pz);
      return Math.min(best, d);
    }, 9999);
    state.heat += dt;
    if (state.wanted > 0) {
      if (nearest > 95) {
        state.escape += dt;
        if (state.escape > 6) state.wanted = Math.max(0, state.wanted - dt * WANTED.decayRate * 2.4);
      } else {
        state.escape = Math.max(0, state.escape - dt);
      }
    }

    // Staff the ladder.
    spawnTimer -= dt;
    if (spawnTimer <= 0) {
      spawnTimer = 0.9;
      const cruisers = units.filter((u) => u.alive && u.kind === 'car').length;
      const cops = units.filter((u) => u.alive && u.kind === 'cop').length;
      if (cruisers < spec.cruisers) spawnCruiser(player.state);
      if (cops < spec.foot && player.state.onFoot) spawnCop(player.state);
      if (spec.heli && !heli && stars >= 4) spawnHeli(player.state);
    }

    for (const unit of units) {
      if (!unit.alive) continue;
      const dx = px - unit.x;
      const dz = pz - unit.z;
      const dist = Math.hypot(dx, dz);
      if (dist > 320 || (unit.kind === 'heli' && state.wanted === 0)) {
        remove(unit);
        continue;
      }

      if (unit.kind === 'car') {
        // Chase: point at the player, closed-loop on speed, and stay off the pavement.
        let want = Math.atan2(dx, dz);
        let diff = ((want - unit.heading + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
        unit.heading += Math.max(-2.4 * dt, Math.min(2.4 * dt, diff));
        const targetSpeed = dist > 22 ? 34 : dist > 12 ? 20 : 8;
        unit.speed += (targetSpeed - unit.speed) * Math.min(1, dt * 1.8);
        const nx = unit.x + Math.sin(unit.heading) * unit.speed * dt;
        const nz = unit.z + Math.cos(unit.heading) * unit.speed * dt;
        if (city.solidAt(nx, nz, 1.3) || city.overWater(nx, nz)) {
          unit.heading += 1.6 * dt * 6;
          unit.speed *= 0.35;
          unit.stuck += dt;
          if (unit.stuck > 3.5) {
            const p = city.randomRoadPoint();
            unit.x = p.x;
            unit.z = p.z;
            unit.heading = p.heading;
            unit.stuck = 0;
          }
        } else {
          unit.x = nx;
          unit.z = nz;
          unit.stuck = Math.max(0, unit.stuck - dt);
        }
        unit.wheelSpin += unit.speed * dt * 2.4;
        unit.car.group.position.set(unit.x, 0, unit.z);
        unit.car.group.rotation.y = unit.heading;
        unit.car.setRoll(unit.wheelSpin);
        unit.car.setBar((unit.sirenPhase += dt));
        // Ramming: a cruiser that reaches the player's car trades paint and hurts.
        if (!player.state.onFoot && dist < 3.4) {
          player.state.speed *= 0.55;
          player.shake(0.5);
          ctx.onBump?.(unit);
        }
        if (dist < 9 && Math.random() < dt * 0.8) {
          // Officers get out when the cruiser pulls up beside a player on foot.
          if (player.state.onFoot && units.filter((u) => u.alive && u.kind === 'cop').length < spec.foot + 2) {
            const cop = spawnCop(player.state, 8 + Math.random() * 8);
            if (cop) cop.wait = 0.4;
          }
        }
      } else if (unit.kind === 'cop') {
        unit.walk += dt * 7;
        const stop = 9.5;
        if (dist > stop) {
          const want = Math.atan2(dx, dz);
          let diff = ((want - unit.heading + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
          unit.heading += Math.max(-4 * dt, Math.min(4 * dt, diff));
          const nx = unit.x + Math.sin(unit.heading) * 4.6 * dt;
          const nz = unit.z + Math.cos(unit.heading) * 4.6 * dt;
          if (!city.solidAt(nx, nz, 0.5) && !city.overWater(nx, nz)) {
            unit.x = nx;
            unit.z = nz;
          } else {
            unit.heading += 2.4 * dt;
          }
        } else {
          unit.heading = Math.atan2(dx, dz);
        }
        unit.person.group.position.set(unit.x, Math.abs(Math.sin(unit.walk)) * 0.03, unit.z);
        unit.person.group.rotation.y = unit.heading;
        unit.person.legs[0].rotation.x = Math.sin(unit.walk) * 0.7;
        unit.person.legs[1].rotation.x = -Math.sin(unit.walk) * 0.7;
        // Fire on the player, with a hit chance that falls off with range.
        unit.wait -= dt;
        if (unit.wait <= 0 && dist < 42) {
          unit.wait = 0.85 + Math.random() * 0.9;
          const muzzle = tmp.set(unit.x + Math.sin(unit.heading) * 0.5, 1.3, unit.z + Math.cos(unit.heading) * 0.5);
          const aimAt = new THREE.Vector3(px, 1.1, pz);
          effects.tracer(muzzle.clone(), aimAt, 0.06, 0xffe9b0);
          effects.muzzle(muzzle.clone(), aimAt.clone().sub(muzzle).normalize());
          audio.play('pistol');
          const chance = Math.max(0.08, 0.62 - dist * 0.012);
          if (Math.random() < chance) ctx.onPlayerHit?.(6 + Math.random() * 7);
        }
      } else if (unit.kind === 'heli') {
        unit.phase += dt * 0.32;
        const radius = 46;
        const tx = px + Math.cos(unit.phase) * radius;
        const tz = pz + Math.sin(unit.phase) * radius;
        unit.x += (tx - unit.x) * Math.min(1, dt * 1.4);
        unit.z += (tz - unit.z) * Math.min(1, dt * 1.4);
        const alt = 44 + Math.sin(unit.phase * 2) * 3;
        unit.model.group.position.set(unit.x, alt, unit.z);
        unit.model.group.rotation.y = -unit.phase + Math.PI / 2;
        unit.model.rotor.rotation.y += dt * 26;
      }
    }

    // Keep the siren tied to the closest cruiser.
    let closest = 9999;
    for (const unit of units) {
      if (unit.alive && unit.kind === 'car') closest = Math.min(closest, Math.hypot(unit.x - px, unit.z - pz));
    }
    state.siren = state.wanted > 0 ? Math.max(0, 1 - closest / 220) : 0;
    audio.setSiren(state.siren > 0.02 ? state.siren : 0);

    // Clear the ones that died in place.
    for (let i = units.length - 1; i >= 0; i -= 1) {
      if (!units[i].alive && units[i].kind !== 'cop') units.splice(i, 1);
    }
  }

  return {
    state,
    units,
    update,
    crime,
    clear,
    hurtUnit,
    spawnCruiser,
    spawnCop,
    get wanted() {
      return state.wanted;
    },
    get stars() {
      return Math.min(WANTED.max, Math.ceil(state.wanted));
    },
  };
}
