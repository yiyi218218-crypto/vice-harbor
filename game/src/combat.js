// Shooting: two hitscan weapons and a fist, fired from the muzzle along the crosshair. A ray finds
// the nearest wall, body or body panel, and the effects layer paints the tracer, the flash and the
// sparks where it stopped. Damage, ammo and reloading live here so the HUD has one source of truth.
import * as THREE from '../vendor/three.min.js';
import { WEAPONS } from './config.js';

/** Distance from point `p` to the segment origin→origin+dir*t, in the ground plane. */
function lateral(px, pz, ox, oz, dx, dz, t) {
  const cx = ox + dx * t;
  const cz = oz + dz * t;
  return Math.hypot(px - cx, pz - cz);
}

export function createCombat(effects, audio, city) {
  const state = {
    weapon: 'pistol',
    ammo: { pistol: 48, smg: 90 },
    magazine: { pistol: WEAPONS.pistol.ammo, smg: WEAPONS.smg.ammo },
    cooldown: 0,
    reloading: 0,
    hits: 0,
    shots: 0,
  };

  const origin = new THREE.Vector3();
  const dir = new THREE.Vector3();
  const point = new THREE.Vector3();
  const lastHit = { kind: 'none', target: null, point: new THREE.Vector3() };

  /** Look for the first thing the ray meets: a facade, a pedestrian, a car or a cop. */
  function cast(from, direction, range, ctx) {
    let wallT = range;
    let wall = null;
    // Walk the ray for geometry; buildings are the only tall solids.
    for (let t = 1.2; t < range; t += 0.9) {
      const x = from.x + direction.x * t;
      const y = from.y + direction.y * t;
      const z = from.z + direction.z * t;
      const solid = city.solidAt(x, z, 0.15);
      if (solid && y < solid.h) {
        wallT = t;
        wall = solid;
        break;
      }
      if (y < 0.02) {
        wallT = t;
        break;
      }
    }

    let best = wallT;
    let bestKind = wall ? 'wall' : 'none';
    let bestTarget = null;

    // Bodies first: project each onto the ray and keep the closest one in front of the wall.
    const consider = (x, y, z, radius, height, kind, target) => {
      const t = (x - from.x) * direction.x + (y - from.y) * direction.y + (z - from.z) * direction.z;
      if (t <= 0.4 || t >= best) return;
      if (lateral(x, z, from.x, from.z, direction.x, direction.z, t) > radius) return;
      best = t;
      bestKind = kind;
      bestTarget = target;
    };
    for (const ped of ctx.traffic.peds) {
      if (!ped.alive) continue;
      consider(ped.x, 1.05, ped.z, 0.55, 1.8, 'ped', ped);
    }
    for (const car of ctx.traffic.cars) {
      if (!car.alive) continue;
      consider(car.x, 0.85, car.z, 1.4, 1.6, 'car', car);
    }
    for (const unit of ctx.police.units) {
      if (!unit.alive) continue;
      if (unit.kind === 'car') consider(unit.x, 0.9, unit.z, 1.5, 1.6, 'cruiser', unit);
      else consider(unit.x, 1.05, unit.z, 0.55, 1.8, 'cop', unit);
    }

    point.copy(from).addScaledVector(direction, best);
    const normal = wall
      ? new THREE.Vector3(point.x - wall.x, 0, point.z - wall.z).normalize()
      : new THREE.Vector3(0, 1, 0);
    lastHit.kind = bestKind;
    lastHit.target = bestTarget;
    lastHit.point.copy(point);
    return { kind: bestKind, target: bestTarget, point, normal, distance: best };
  }

  /** Spend a round: tracer, flash, damage, and a wanted level if anyone saw it. */
  function fire(player, ctx) {
    const spec = WEAPONS[state.weapon];
    if (state.cooldown > 0 || state.reloading > 0) return null;
    if (state.weapon !== 'fists') {
      if (state.magazine[state.weapon] <= 0) {
        reload();
        return null;
      }
      state.magazine[state.weapon] -= 1;
    }
    state.cooldown = spec.rate;
    state.shots += 1;
    player.state.recoil = 1;

    player.muzzle(origin);
    player.lookDir(dir);
    // A little spread, tighter when the shot is aimed.
    const spread = spec.spread * (ctx.aiming ? 0.35 : 1);
    dir.x += (Math.random() - 0.5) * spread;
    dir.y += (Math.random() - 0.5) * spread;
    dir.z += (Math.random() - 0.5) * spread;
    dir.normalize();

    effects.muzzle(origin, dir);
    audio.play(state.weapon === 'fists' ? 'punch' : state.weapon);
    const hit = cast(origin, dir, state.weapon === 'fists' ? 2.2 : spec.range, ctx);
    effects.tracer(origin, hit.point, 0.1, state.weapon === 'smg' ? 0xffe0a0 : 0xfff0c0);

    if (hit.kind === 'ped') {
      hit.target.alive = false;
      effects.impact(hit.point, dir.clone().negate(), true);
      audio.play('hit');
      state.hits += 1;
      ctx.traffic.alarm(hit.point.x, hit.point.z, 34);
      ctx.onCrime?.(2.4, hit.point);
    } else if (hit.kind === 'car' || hit.kind === 'cruiser') {
      const car = hit.kind === 'car' ? hit.target : hit.target.car;
      effects.impact(hit.point, dir.clone().negate(), false);
      audio.play('hit');
      state.hits += 1;
      if (hit.kind === 'car') {
        ctx.traffic.damage(car, spec.damage * 1.4, (c) => {
          effects.explosion(new THREE.Vector3(c.x, 0.6, c.z));
          audio.play('crash');
        });
      } else {
        ctx.police.hurtUnit(hit.target, spec.damage * 0.8);
      }
      ctx.onCrime?.(0.8, hit.point);
    } else if (hit.kind === 'cop') {
      effects.impact(hit.point, dir.clone().negate(), true);
      audio.play('hit');
      state.hits += 1;
      ctx.police.hurtUnit(hit.target, spec.damage);
      ctx.onCrime?.(1.6, hit.point);
    } else if (hit.kind === 'wall') {
      effects.impact(hit.point, hit.normal, false);
      ctx.onCrime?.(0.35, hit.point);
    }
    ctx.onShot?.(hit);
    return hit;
  }

  function reload() {
    const name = state.weapon;
    if (name === 'fists' || state.reloading > 0) return;
    const spec = WEAPONS[name];
    if (state.magazine[name] >= spec.ammo || state.ammo[name] <= 0) return;
    state.reloading = spec.reload;
    audio.play('reload');
  }

  function select(name) {
    if (!WEAPONS[name] || state.weapon === name) return;
    state.weapon = name;
    state.reloading = 0;
  }

  function update(dt, input, player, ctx) {
    state.cooldown = Math.max(0, state.cooldown - dt);
    if (state.reloading > 0) {
      state.reloading -= dt;
      if (state.reloading <= 0) {
        const name = state.weapon;
        const spec = WEAPONS[name];
        const need = Math.min(spec.ammo - state.magazine[name], state.ammo[name]);
        state.magazine[name] += need;
        state.ammo[name] -= need;
      }
    }
    const spec = WEAPONS[state.weapon];
    if (input.firing) {
      if (spec.auto) fire(player, { ...ctx, aiming: input.aiming });
      else if (state.cooldown <= 0) {
        fire(player, { ...ctx, aiming: input.aiming });
        state.triggerHeld = true;
      }
    } else {
      state.triggerHeld = false;
    }
  }

  return {
    state,
    update,
    fire,
    reload,
    select,
    cast,
    get weapon() {
      return WEAPONS[state.weapon];
    },
    get name() {
      return state.weapon;
    },
  };
}
