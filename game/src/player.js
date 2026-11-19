// The player: a body that walks, runs and jumps, a car that slides and roars when it is taken, and
// the camera that sits behind both of them. The character is built from boxes so the walk cycle can
// swing its legs; a stolen car is rebuilt in its own shape and colour, with wheels that turn.
import * as THREE from '../vendor/three.min.js';
import { ON_FOOT, DRIVING } from './config.js';
import { MeshBuilder } from './mesh.js';
import { buildCar } from './cars.js';

const JACKET = 0x3c6f86;
const SHIRT = 0xe6d6b4;
const PANTS = 0x1e2331;
const SKIN = 0xb98a63;

/** The player's body: jacket, collar, head, arms that swing and a pistol in the right hand. */
function buildPlayerModel() {
  const group = new THREE.Group();
  const body = new MeshBuilder();
  body.part(0, 1.14, 0, 0.5, 0.66, 0.28, 0, new THREE.Color(JACKET));
  body.part(0, 1.4, -0.02, 0.42, 0.22, 0.24, 0, new THREE.Color(SHIRT));
  body.part(0, 1.53, 0, 0.2, 0.2, 0.2, 0, new THREE.Color(SKIN));
  body.part(0, 1.65, -0.02, 0.24, 0.1, 0.24, 0, new THREE.Color(0x2a1c12));
  body.part(0, 1.36, 0.145, 0.14, 0.3, 0.02, 0, new THREE.Color(SHIRT));
  // A shoulder strap, a belt and a pocket, so the body is not one flat colour.
  body.part(0.06, 1.2, 0.15, 0.1, 0.62, 0.03, 0, new THREE.Color(0x2a2b33));
  body.part(0, 0.82, 0, 0.52, 0.07, 0.29, 0, new THREE.Color(0x211d22));
  const torso = new THREE.Mesh(body.geometry(), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.72 }));
  torso.castShadow = true;
  group.add(torso);

  const armGeo = new MeshBuilder();
  armGeo.part(0, -0.24, 0, 0.15, 0.5, 0.16, 0, new THREE.Color(JACKET));
  armGeo.part(0, -0.5, 0, 0.12, 0.1, 0.13, 0, new THREE.Color(SKIN));
  const armMeshGeo = armGeo.geometry();
  const armMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.75 });
  const armL = new THREE.Mesh(armMeshGeo, armMat);
  const armR = new THREE.Mesh(armMeshGeo, armMat);
  armL.position.set(-0.33, 1.4, 0);
  armR.position.set(0.33, 1.4, 0);
  armL.castShadow = true;
  armR.castShadow = true;
  group.add(armL, armR);

  const gun = new THREE.Group();
  const gunBody = new THREE.Mesh(
    new THREE.BoxGeometry(0.09, 0.13, 0.3),
    new THREE.MeshStandardMaterial({ color: 0x1b1d24, roughness: 0.5, metalness: 0.6 }),
  );
  gunBody.position.set(0, -0.55, 0.13);
  gun.add(gunBody);
  armR.add(gun);
  gun.visible = false;

  const legBuild = new MeshBuilder();
  legBuild.part(0, -0.4, 0, 0.19, 0.8, 0.21, 0, new THREE.Color(PANTS));
  legBuild.part(0, -0.78, 0.04, 0.2, 0.1, 0.28, 0, new THREE.Color(0x14141c));
  const legGeo = legBuild.geometry();
  const legMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.88 });
  const legL = new THREE.Mesh(legGeo, legMat);
  const legR = new THREE.Mesh(legGeo, legMat);
  legL.position.set(-0.13, 0.84, 0);
  legR.position.set(0.13, 0.84, 0);
  legL.castShadow = true;
  legR.castShadow = true;
  group.add(legL, legR);

  return { group, armL, armR, legL, legR, gun, torso };
}

export function createPlayer(scene, city, audio) {
  const model = buildPlayerModel();
  scene.add(model.group);

  let carModel = buildCar('muscle', 0x2fb3a6, { detailed: true });
  carModel.group.visible = false;
  scene.add(carModel.group);
  let carKind = 'muscle';
  let carColor = 0x2fb3a6;

  const state = {
    onFoot: true,
    x: 0, z: 0, y: 0,
    vy: 0,
    vx: 0, vz: 0,
    heading: 0,
    speed: 0,
    steer: 0,
    hp: 100,
    armor: 0,
    vehicle: null,
    wheelSpin: 0,
    walkPhase: 0,
    gunOut: false,
    recoil: 0,
    alive: true,
    skid: 0,
    inWater: false,
  };

  let yaw = 0;
  let pitch = 0.12;
  let camShake = 0;
  const camPos = new THREE.Vector3(0, 6, -8);
  const camLook = new THREE.Vector3();
  const tmpV = new THREE.Vector3();

  function spawn(x, z, heading = 0, inCar = false) {
    state.x = x;
    state.z = z;
    state.heading = heading;
    state.y = 0;
    state.vx = 0;
    state.vz = 0;
    state.vy = 0;
    state.speed = 0;
    state.alive = true;
    state.onFoot = !inCar;
    yaw = heading;
    pitch = 0.12;
    if (inCar) {
      carModel.group.visible = true;
      carModel.group.position.set(x, 0, z);
      carModel.group.rotation.y = heading;
      model.group.visible = false;
    } else {
      carModel.group.visible = false;
      model.group.visible = true;
      model.group.position.set(x, 0, z);
    }
    camPos.set(x - Math.sin(heading) * 7, 4, z - Math.cos(heading) * 7);
    camLook.set(x, 1.4, z);
  }

  /** Swap the player's car for the one just stolen: same shape, same paint. */
  function setVehicle(kind, color) {
    if (kind === carKind && color === carColor) return;
    scene.remove(carModel.group);
    carKind = kind;
    carColor = color;
    carModel = buildCar(kind, color, { detailed: true });
    carModel.group.visible = !state.onFoot;
    scene.add(carModel.group);
    carModel.group.position.set(state.x, 0, state.z);
    carModel.group.rotation.y = state.heading;
  }

  function lookDir(out = new THREE.Vector3()) {
    return out.set(Math.sin(yaw) * Math.cos(pitch), -Math.sin(pitch), Math.cos(yaw) * Math.cos(pitch)).normalize();
  }

  function muzzle(out = new THREE.Vector3()) {
    const d = lookDir(tmpV);
    if (state.onFoot) return out.set(state.x + d.x * 0.8, state.y + 1.32, state.z + d.z * 0.8);
    return out.set(state.x + Math.sin(state.heading) * 2.3, 0.95, state.z + Math.cos(state.heading) * 2.3);
  }

  function enter(vehicle) {
    state.onFoot = false;
    state.vehicle = vehicle ?? null;
    setVehicle(vehicle?.kind ?? 'muscle', vehicle?.color ?? 0x2fb3a6);
    carModel.group.visible = true;
    model.group.visible = false;
    if (vehicle) {
      state.x = vehicle.x;
      state.z = vehicle.z;
      state.heading = vehicle.heading;
      state.speed = Math.max(0, Math.min(vehicle.speed, 22));
    }
    yaw = state.heading;
    camPos.set(state.x - Math.sin(yaw) * 8, 3.6, state.z - Math.cos(yaw) * 8);
    audio?.engineStart();
  }

  function exit() {
    state.onFoot = true;
    state.vehicle = null;
    carModel.group.visible = false;
    model.group.visible = true;
    state.speed = 0;
    state.vx = 0;
    state.vz = 0;
    audio?.engineStop();
  }

  function hurt(amount) {
    if (!state.alive) return;
    let damage = amount;
    if (state.armor > 0) {
      const soak = Math.min(state.armor, damage * 0.7);
      state.armor -= soak;
      damage -= soak;
    }
    state.hp = Math.max(0, state.hp - damage);
    if (state.hp <= 0) state.alive = false;
  }

  function applyCamera(dt, input, ctx) {
    if (state.onFoot) {
      const dist = input.aiming ? 2.4 : 4.2;
      const shoulder = input.aiming ? 0.8 : 0.55;
      const ty = state.y + ON_FOOT.eye;
      const cp = Math.cos(pitch);
      let px = state.x - Math.sin(yaw) * cp * dist + Math.cos(yaw) * shoulder;
      let py = ty + Math.sin(pitch) * dist + 0.3;
      let pz = state.z - Math.cos(yaw) * cp * dist - Math.sin(yaw) * shoulder;
      for (let i = 0; i < 5; i += 1) {
        if (!city.solidAt(px, pz, 0.45)) break;
        px = (px + state.x) / 2;
        pz = (pz + state.z) / 2;
        py = (py + ty) / 2;
      }
      const k = 1 - Math.exp(-13 * dt);
      camPos.lerp(tmpV.set(px, py, pz), k);
      camLook.lerp(tmpV.set(state.x + Math.sin(yaw) * 5, ty - 0.1 - Math.sin(pitch) * 3, state.z + Math.cos(yaw) * 5), k);
    } else {
      // The camera sits behind the car's own heading, but the player may look around.
      let diff = ((state.heading - yaw + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
      yaw += diff * Math.min(1, dt * 3.2);
      const back = DRIVING.cameraBack + Math.min(1.3, Math.abs(state.speed) * 0.03);
      const px = state.x - Math.sin(yaw) * back;
      const pz = state.z - Math.cos(yaw) * back;
      const py = DRIVING.cameraUp + Math.min(0.7, Math.abs(state.speed) * 0.012);
      const k = 1 - Math.exp(-8 * dt);
      camPos.lerp(tmpV.set(px, py, pz), k);
      camLook.lerp(tmpV.set(state.x + Math.sin(yaw) * 8, 1.45, state.z + Math.cos(yaw) * 8), k);
    }
    const jitter = camShake * 0.3;
    ctx.camera.position.set(
      camPos.x + (Math.random() - 0.5) * jitter,
      camPos.y + (Math.random() - 0.5) * jitter,
      camPos.z + (Math.random() - 0.5) * jitter,
    );
    ctx.camera.lookAt(camLook);
    const wantFov = state.onFoot ? (input.aiming ? 60 : 70) : 68 + Math.min(10, Math.abs(state.speed) * 0.26);
    ctx.camera.fov += (wantFov - ctx.camera.fov) * Math.min(1, dt * 4);
    ctx.camera.updateProjectionMatrix();
  }

  function update(dt, input, ctx) {
    const move = input.move();
    const look = input.takeLook();
    yaw -= look.yaw;
    pitch = Math.max(-0.5, Math.min(1.0, pitch + look.pitch));
    if (camShake > 0) camShake = Math.max(0, camShake - dt * 2.4);

    if (state.onFoot) updateFoot(dt, move, input, ctx);
    else updateCar(dt, move, input, ctx);

    applyCamera(dt, input, ctx);

    if (state.onFoot) {
      model.group.position.set(state.x, state.y + Math.abs(Math.sin(state.walkPhase * 2)) * 0.02, state.z);
      model.group.rotation.y = state.heading;
      const swing = Math.sin(state.walkPhase) * 0.72 * Math.min(1, Math.hypot(state.vx, state.vz) / 3);
      model.legL.rotation.x = swing;
      model.legR.rotation.x = -swing;
      model.armL.rotation.x = -swing * 0.8;
      model.armR.rotation.x = state.gunOut ? -1.4 + Math.sin(state.recoil * 16) * 0.3 : swing * 0.8;
      model.armR.rotation.z = state.gunOut ? -0.1 : 0;
      model.gun.visible = state.gunOut;
      if (state.recoil > 0) state.recoil = Math.max(0, state.recoil - dt * 6);
    } else {
      carModel.group.position.set(state.x, 0, state.z);
      carModel.group.rotation.y = state.heading;
      carModel.group.rotation.z = -state.steer * Math.min(0.05, Math.abs(state.speed) * 0.0018);
      carModel.setRoll(state.wheelSpin);
    }
    audio?.setEngine?.(state.onFoot ? 0 : Math.abs(state.speed), 0.6);
  }

  function updateFoot(dt, move, input, ctx) {
    const maxSpeed = input.run() ? ON_FOOT.run : ON_FOOT.walk;
    const fx = Math.sin(yaw);
    const fz = Math.cos(yaw);
    const rx = Math.cos(yaw);
    const rz = -Math.sin(yaw);
    let dx = fx * move.forward + rx * move.right;
    let dz = fz * move.forward + rz * move.right;
    const len = Math.hypot(dx, dz);
    if (len > 0.001) {
      dx /= len;
      dz /= len;
    }
    const k = Math.min(1, dt * (len > 0 ? 15 : 11));
    state.vx += (dx * maxSpeed - state.vx) * k;
    state.vz += (dz * maxSpeed - state.vz) * k;
    if (len < 0.001) {
      const damp = Math.min(1, ON_FOOT.drag * dt);
      state.vx -= state.vx * damp;
      state.vz -= state.vz * damp;
    }

    const nx = state.x + state.vx * dt;
    const nz = state.z + state.vz * dt;
    if (!city.overWater(nx, nz)) {
      state.x = nx;
      state.z = nz;
    } else {
      state.vx *= 0.1;
      state.vz *= 0.1;
    }
    city.pushOut(state, ON_FOOT.radius);

    if (state.y > 0 || state.vy !== 0) {
      state.vy -= ON_FOOT.gravity * dt;
      state.y += state.vy * dt;
      if (state.y <= 0) {
        state.y = 0;
        state.vy = 0;
      }
    } else if (input.jump() && len > 0) {
      state.vy = ON_FOOT.jump;
      state.y = 0.01;
    }

    const speed = Math.hypot(state.vx, state.vz);
    state.walkPhase += dt * (4.4 + speed * 1.2);
    state.speed = speed;
    if (input.aiming || input.firing) state.heading = yaw;
    else if (speed > 0.35) {
      const want = Math.atan2(state.vx, state.vz);
      const d = ((want - state.heading + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
      state.heading += Math.max(-9 * dt, Math.min(9 * dt, d));
    }
    state.gunOut = Boolean(ctx.armed);
    if (speed > 3 && Math.random() < dt * 3) audio?.play('step');
  }

  function updateCar(dt, move, input, ctx) {
    const throttle = move.forward;
    state.steer += (move.right - state.steer) * Math.min(1, dt * 9);
    const brake = input.jump();

    if (throttle > 0) state.speed += DRIVING.accel * throttle * dt;
    else if (throttle < 0) state.speed -= (state.speed > 0.5 ? DRIVING.brake : DRIVING.accel * 0.55) * dt;
    if (brake) state.speed -= Math.sign(state.speed) * DRIVING.brake * 0.95 * dt;
    state.speed *= 1 - DRIVING.drag * dt * 0.4;
    state.speed = Math.max(-DRIVING.reverse, Math.min(DRIVING.maxSpeed, state.speed));
    if (Math.abs(state.speed) < 0.06 && throttle === 0) state.speed = 0;

    const grip = Math.max(0.45, 1 - Math.abs(state.speed) / DRIVING.maxSpeed * 0.48);
    const turn = state.steer * DRIVING.steer * grip * (state.speed >= 0 ? 1 : -1);
    state.heading -= turn * dt * Math.min(1, Math.abs(state.speed) / 6);
    state.skid = brake && Math.abs(state.speed) > 12 ? 1 : Math.max(0, state.skid - dt * 3);

    const nx = state.x + Math.sin(state.heading) * state.speed * dt;
    const nz = state.z + Math.cos(state.heading) * state.speed * dt;
    const blocked = city.solidAt(nx, nz, DRIVING.radius) || city.overWater(nx, nz);
    if (blocked) {
      const before = Math.abs(state.speed);
      state.speed *= -0.16;
      state.x += Math.sin(state.heading) * state.speed * dt * 2;
      state.z += Math.cos(state.heading) * state.speed * dt * 2;
      if (before > 9) {
        audio?.play('crash');
        camShake = Math.min(1.5, before * 0.07);
        ctx.onCrash?.(before);
      }
    } else {
      state.x = nx;
      state.z = nz;
    }
    state.wheelSpin += state.speed * dt * 2.6;
    if (state.skid > 0.2 && Math.abs(state.speed) > 6) ctx.onSkid?.(state);
  }

  return {
    state,
    model,
    spawn,
    enter,
    exit,
    hurt,
    update,
    lookDir,
    muzzle,
    setVehicle,
    get car() {
      return carModel;
    },
    get carKind() {
      return carKind;
    },
    get yaw() {
      return yaw;
    },
    set yaw(v) {
      yaw = v;
    },
    get pitch() {
      return pitch;
    },
    set pitch(v) {
      pitch = v;
    },
    shake(amount) {
      camShake = Math.max(camShake, amount);
    },
    cameraPos: camPos,
  };
}
