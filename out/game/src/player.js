// The player: on foot or behind a wheel, with an over-the-shoulder camera and a
// hitscan pistol. The camera pulls in when a wall gets between it and the player.

import { PLAYER, HEAT } from './config.js';
import { clamp, damp, dampAngle } from './random.js';
import { resolveCircle, raycastWorld } from './world.js';

const THREE = globalThis.THREE;

export class Player {
  constructor(stage, world, input, audio) {
    this.stage = stage;
    this.world = world;
    this.input = input;
    this.audio = audio;

    this.pos = { x: world.spots.start.x, z: world.spots.start.z };
    this.heading = world.spots.start.heading;
    this.vehicle = null;
    this.health = PLAYER.health;
    this.ammo = PLAYER.mag;
    this.reloading = 0;
    this.fireTimer = 0;
    this.yaw = this.heading + Math.PI;
    this.pitch = -0.06;
    this.camDist = 4.6;
    this.bob = 0;
    this.speed = 0;
    this.walkPhase = 0;
    this.hitFlash = 0;
    this.dead = false;

    this.buildBody();
  }

  buildBody() {
    const g = new THREE.Group();
    const jacket = new THREE.MeshLambertMaterial({ color: new THREE.Color('#2b3a4a') });
    const jeans = new THREE.MeshLambertMaterial({ color: new THREE.Color('#23262c') });
    const skin = new THREE.MeshLambertMaterial({ color: new THREE.Color('#c99b74') });

    const torso = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.66, 0.3), jacket);
    torso.position.y = 1.2;
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.28, 0.26), skin);
    head.position.y = 1.68;
    const hair = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.1, 0.28), new THREE.MeshLambertMaterial({ color: 0x1a1a1c }));
    hair.position.y = 1.82;
    const hips = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.2, 0.28), jeans);
    hips.position.y = 0.82;
    const legL = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.74, 0.2), jeans);
    legL.position.set(-0.12, 0.4, 0);
    const legR = legL.clone();
    legR.position.x = 0.12;
    const armL = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.58, 0.16), jacket);
    armL.position.set(-0.32, 1.2, 0);
    const armR = armL.clone();
    armR.position.x = 0.32;
    const gun = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.12, 0.34), new THREE.MeshLambertMaterial({ color: 0x15171b }));
    gun.position.set(0.32, 1.06, 0.34);

    g.add(torso, head, hair, hips, legL, legR, armL, armR, gun);
    g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
    this.mesh = g;
    this.legs = [legL, legR];
    this.arms = [armL, armR];
    this.gun = gun;
    this.stage.scene.add(g);
  }

  get eye() {
    return new THREE.Vector3(this.pos.x, 1.66, this.pos.z);
  }

  look(dx, dy) {
    this.yaw -= dx * 0.0024;
    this.pitch = clamp(this.pitch - dy * 0.0021, -0.55, 0.42);
  }

  update(dt, game) {
    this.fireTimer = Math.max(0, this.fireTimer - dt);
    this.hitFlash = Math.max(0, this.hitFlash - dt * 2);

    if (this.reloading > 0) {
      this.reloading -= dt;
      if (this.reloading <= 0) {
        this.ammo = PLAYER.mag;
        game.hud.prompt(null);
      }
    }

    const look = this.input.consumeLook();
    if (this.input.locked) this.look(look.dx, look.dy);

    if (this.input.take('KeyR') && this.ammo < PLAYER.mag && this.reloading <= 0) {
      this.reloading = PLAYER.reload;
      if (this.audio) this.audio.blip(320);
    }

    if (this.vehicle) this.updateDriving(dt, game);
    else this.updateFoot(dt, game);

    if (this.input.mouse.down && this.input.locked && !this.vehicle && this.fireTimer <= 0) {
      this.fire(game);
    }

    this.updateCamera(dt, game);
    this.syncMesh(dt);
  }

  updateFoot(dt, game) {
    const forward = this.input.axis('KeyS', 'KeyW');
    const strafe = this.input.axis('KeyA', 'KeyD');
    const sprint = this.input.isDown('ShiftLeft') || this.input.isDown('ShiftRight');
    const speed = sprint ? PLAYER.sprint : PLAYER.walk;

    const sin = Math.sin(this.yaw);
    const cos = Math.cos(this.yaw);
    let mx = (sin * forward + cos * strafe);
    let mz = (cos * forward - sin * strafe);
    const mag = Math.hypot(mx, mz);
    if (mag > 0.001) {
      mx /= mag;
      mz /= mag;
      this.heading = dampAngle(this.heading, Math.atan2(mx, mz), 12, dt);
    }

    const targetSpeed = mag > 0.001 ? speed : 0;
    this.speed = damp(this.speed, targetSpeed, 10, dt);
    this.pos.x += mx * this.speed * dt;
    this.pos.z += mz * this.speed * dt;

    resolveCircle(this.world, this.pos, PLAYER.radius);
    const lim = 300;
    this.pos.x = clamp(this.pos.x, -lim, lim);
    this.pos.z = clamp(this.pos.z, -lim, lim);

    this.walkPhase += this.speed * dt * 3.2;
    const swing = Math.sin(this.walkPhase) * (this.speed > 5 ? 0.75 : 0.45);
    this.legs[0].rotation.x = swing;
    this.legs[1].rotation.x = -swing;
    this.arms[0].rotation.x = -swing * 0.6;
    this.bob = Math.abs(Math.sin(this.walkPhase * 2)) * 0.03;

    if (this.input.take('KeyE')) game.tryEnterVehicle();
  }

  updateDriving(dt, game) {
    const car = this.vehicle;
    const throttle = this.input.axis('KeyS', 'KeyW');
    const steer = this.input.axis('KeyD', 'KeyA');
    const handbrake = this.input.isDown('Space');
    car.drive(dt, { throttle, steer, handbrake }, this.world);
    this.pos.x = car.x;
    this.pos.z = car.z;
    this.heading = car.heading;

    if (this.audio) this.audio.setEngine(true, clamp(Math.abs(car.forwardSpeed) / car.spec.top, 0, 1));
    if (this.input.take('KeyE')) game.tryExitVehicle();
  }

  updateCamera(dt, game) {
    const cam = this.stage.camera;
    let desired;
    let target;

    if (this.vehicle) {
      const car = this.vehicle;
      const back = 8.4 + clamp(Math.abs(car.forwardSpeed) * 0.09, 0, 2.4);
      const yaw = car.heading + Math.PI;
      this.yaw = dampAngle(this.yaw, yaw, 3.4, dt);
      const height = 3.5 + Math.sin(this.pitch) * -4;
      target = new THREE.Vector3(car.x, 1.7, car.z);
      desired = new THREE.Vector3(
        car.x + Math.sin(this.yaw) * back,
        height,
        car.z + Math.cos(this.yaw) * back
      );
      cam.fov = damp(cam.fov, 62 + clamp(Math.abs(car.forwardSpeed) * 0.55, 0, 18), 4, dt);
    } else {
      const back = this.camDist;
      const shoulder = 0.55;
      const forward = new THREE.Vector3(Math.sin(this.yaw), 0, Math.cos(this.yaw));
      const right = new THREE.Vector3(Math.cos(this.yaw), 0, -Math.sin(this.yaw));
      target = new THREE.Vector3(this.pos.x, 1.55 + this.bob, this.pos.z);
      desired = target.clone()
        .addScaledVector(forward, -back)
        .addScaledVector(right, shoulder);
      desired.y = 1.55 + this.bob - Math.sin(this.pitch) * 4.4;
      cam.fov = damp(cam.fov, 60, 5, dt);
    }
    cam.updateProjectionMatrix();

    // pull the camera in front of any wall between it and the player
    const dir = desired.clone().sub(target);
    const len = dir.length();
    dir.normalize();
    const hit = raycastWorld(this.world, target, dir, len);
    if (hit.collider && hit.dist < len) {
      desired = target.clone().addScaledVector(dir, Math.max(0.8, hit.dist - 0.35));
    }

    cam.position.lerp(desired, 1 - Math.exp(-14 * dt));
    cam.lookAt(target.x + Math.sin(this.yaw) * 1.2, target.y + (this.vehicle ? 0.4 : 0), target.z + Math.cos(this.yaw) * 1.2);
  }

  fire(game) {
    if (this.reloading > 0) return;
    if (this.ammo <= 0) {
      this.reloading = PLAYER.reload;
      game.hud.prompt('RELOADING');
      return;
    }
    this.ammo--;
    this.fireTimer = PLAYER.fireDelay;
    if (this.audio) this.audio.gunshot(0.5);

    const cam = this.stage.camera;
    const origin = cam.position.clone();
    const dir = new THREE.Vector3();
    cam.getWorldDirection(dir);
    const spread = PLAYER.aimSpread;
    dir.x += (Math.random() - 0.5) * spread;
    dir.y += (Math.random() - 0.5) * spread;
    dir.z += (Math.random() - 0.5) * spread;
    dir.normalize();

    const wall = raycastWorld(this.world, origin, dir, PLAYER.bulletRange);
    let dist = wall.dist;
    let hitTarget = null;

    for (const t of game.targets()) {
      if (!t.alive) continue;
      const p = t.aimPoint();
      const to = p.clone().sub(origin);
      const along = to.dot(dir);
      if (along < 0 || along > dist) continue;
      const perp = to.clone().addScaledVector(dir, -along).length();
      const radius = t.hitRadius ? t.hitRadius() : 0.6;
      if (perp < radius) {
        dist = along;
        hitTarget = t;
      }
    }

    const end = origin.clone().addScaledVector(dir, dist);
    game.effects.tracer(origin, end, '#ffe7b8');
    game.effects.flash(end, '#ffd9a0', 0.9);
    if (hitTarget) {
      hitTarget.hit(34);
      game.onBulletHit(hitTarget, end);
    } else if (wall.collider) {
      game.effects.burst(end, '#ffcf8a', 3, 2.4);
    }
    game.crowd.scare({ x: this.pos.x, z: this.pos.z });
  }

  damage(amount, game) {
    if (this.dead) return;
    this.health -= amount;
    this.hitFlash = 1;
    if (this.audio) this.audio.impact(0.25);
    if (this.health <= 0) {
      this.health = 0;
      this.dead = true;
      game.onPlayerDown();
    }
  }

  heal(amount) {
    this.health = clamp(this.health + amount, 0, PLAYER.health);
  }

  syncMesh(dt) {
    if (this.vehicle) {
      this.mesh.visible = false;
      return;
    }
    this.mesh.visible = true;
    const y = this.world.groundAt(this.pos.x, this.pos.z) + this.bob;
    this.mesh.position.set(this.pos.x, y, this.pos.z);
    this.mesh.rotation.y = this.heading;
    this.gun.visible = true;
  }

  aimPoint() {
    return new THREE.Vector3(this.pos.x, 1.2, this.pos.z);
  }

  hitRadius() {
    return 0.55;
  }

  get alive() {
    return !this.dead;
  }

  enter(car) {
    this.vehicle = car;
    car.setDriver('player');
    this.pos.x = car.x;
    this.pos.z = car.z;
    this.yaw = car.heading + Math.PI;
    this.mesh.visible = false;
  }

  exit() {
    const car = this.vehicle;
    if (!car) return;
    this.vehicle = null;
    car.setDriver(null);
    const forward = new THREE.Vector3(Math.sin(car.heading), 0, Math.cos(car.heading));
    const side = new THREE.Vector3(Math.cos(car.heading), 0, -Math.sin(car.heading));
    const spots = [
      { x: car.x + side.x * 2.4, z: car.z + side.z * 2.4 },
      { x: car.x - side.x * 2.4, z: car.z - side.z * 2.4 },
      { x: car.x - forward.x * 3.4, z: car.z - forward.z * 3.4 },
    ];
    let chosen = spots[0];
    for (const s of spots) {
      if (!this.world.insideBuilding(s.x, s.z, PLAYER.radius)) { chosen = s; break; }
    }
    this.pos.x = chosen.x;
    this.pos.z = chosen.z;
    this.heading = car.heading;
    this.yaw = car.heading + Math.PI;
    if (this.audio) this.audio.setEngine(false);
  }
}
