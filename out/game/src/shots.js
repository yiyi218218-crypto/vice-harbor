// Four fixed poses, one per screenshot. They only move things that are already in the
// world, so ?shot=play&seed=1 gives the same frame on any machine.

import { Vehicle, Police } from './vehicles.js';
import { CARS } from './config.js';
import { dist } from './missions.js';

const THREE = globalThis.THREE;

export const SHOT_NAMES = ['start', 'play', 'heat', 'end'];

export const SHOT_META = {
  start: { file: '1-start.jpg', caption: 'The title card over the harbor at dusk.' },
  play: { file: '2-play.jpg', caption: 'Behind the wheel on Marlin Avenue, traffic and pedestrians around.' },
  heat: { file: '3-heat.jpg', caption: 'Four stars and three patrol cars closing in on the east pier.' },
  end: { file: '4-end.jpg', caption: 'The closing card after the third contract pays out.' },
};

export function applyShot(game, name) {
  game.shotMode = true;
  game.shotPose = null;
  const hud = game.hud;
  const player = game.player;

  if (name === 'start') {
    game.state = 'menu';
    hud.show(false);
    hud.screen('menu');
    hud.setFade(false);
    game.stage.camera.fov = 52;
    game.stage.camera.updateProjectionMatrix();
    game.shotPose = {
      pos: new THREE.Vector3(280, 24, 130),
      look: new THREE.Vector3(0, 22, -10),
      fov: 60,
    };
    dressHarbor(game, 6);
    return;
  }

  hud.show(true);
  hud.screen(null);
  hud.crosshair(false);
  hud.setFade(false);

  if (name === 'play') {
    game.state = 'playing';
    const car = pickCar(game, 'coupe', CARS.coupe.colors[0], -38, 96, 0);
    player.enter(car);
    car.vx = 0;
    car.vz = 12;
    hud.setHealth(82);
    hud.setMoney(4850);
    hud.setStars(0);
    hud.setMission('HARBOR LIGHTS', 'Take out the Salt Row crew (2/4)', '184 M');
    hud.setSpeed(64);
    hud.updateDistrict(-38, 96);
    trafficAround(game, [
      [-45.4, 126, 0, 'sedan'],
      [-30.6, 112, Math.PI, 'taxi'],
      [-38, 152, 0, 'van'],
      [-45.4, 58, 0, 'sedan'],
    ]);
    pedestriansAround(game, [[-48, 110], [-29, 102], [-50, 88], [-26, 130]]);
    game.shotPose = {
      pos: new THREE.Vector3(-46, 2.4, 88),
      look: new THREE.Vector3(-38, 1.35, 99),
      fov: 54,
    };
    return;
  }

  if (name === 'heat') {
    game.state = 'playing';
    const car = pickCar(game, 'coupe', '#20242c', 38, 4, 0);
    player.enter(car);
    game.heat = 4.2;
    game.stars = 4;
    hud.setHealth(46);
    hud.setMoney(4850);
    hud.setStars(4);
    hud.setMission('THE BIG HAUL', 'Get clear of the harbor', '');
    hud.setSpeed(0);
    hud.updateDistrict(38, 4);
    trafficAround(game, [
      [-38, 30, 0, 'sedan'],
      [114, -60, 0, 'van'],
    ]);
    // three patrol cars ahead of the player, lights already alternating
    const spots = [[32, 16, Math.PI], [44, 21, Math.PI - 0.2], [38, 28, Math.PI]];
    game.police.clear();
    for (let i = 0; i < spots.length; i++) {
      const [x, z, h] = spots[i];
      const cop = new Vehicle(game.stage.scene, i === 2 ? 'cruiser' : 'police', CARS.police.colors[0], x, z, h, {});
      cop.setDriver('police');
      cop.sirenOn = true;
      cop.sirenPhase = i * 2.1;
      game.police.units.push({ car: cop, fire: 2 });
      if (cop.mesh.userData.bar) {
        const on = i % 2 === 0;
        cop.mesh.userData.bar.material.emissiveIntensity = on ? 3.2 : 0.2;
        if (cop.mesh.userData.barBlue) cop.mesh.userData.barBlue.material.emissiveIntensity = on ? 0.2 : 3.2;
      }
    }
    game.effects.smoke(new THREE.Vector3(34, 0.6, 14));
    game.shotPose = {
      pos: new THREE.Vector3(38, 5.6, -13),
      look: new THREE.Vector3(38, 1.25, 22),
      fov: 60,
    };
    return;
  }

  if (name === 'end') {
    game.state = 'end';
    hud.show(false);
    hud.setEndStats({ money: 12050, missions: 3, time: 1284 });
    hud.screen('end');
    game.stage.camera.fov = 50;
    game.stage.camera.updateProjectionMatrix();
    dressHarbor(game, 4);
    game.shotPose = {
      pos: new THREE.Vector3(296, 32, 104),
      look: new THREE.Vector3(-8, 20, -26),
      fov: 54,
    };
  }
}

function pickCar(game, kind, color, x, z, heading) {
  let car = game.traffic.cars.find((c) => c.kind === kind && !c.dead);
  if (!car) {
    car = new Vehicle(game.stage.scene, kind, color, x, z, heading, {});
    game.traffic.cars.push(car);
  }
  game.traffic.removeAt(car);
  car.place(x, z, heading);
  car.setDriver('player');
  car.parked = false;
  return car;
}

function trafficAround(game, list) {
  let i = 0;
  for (const [x, z, heading, kind] of list) {
    const car = game.traffic.cars[i];
    if (car) {
      car.place(x, z, heading);
      car.vx = Math.sin(heading) * 8;
      car.vz = Math.cos(heading) * 8;
    }
    i++;
  }
}

function pedestriansAround(game, points) {
  for (let i = 0; i < points.length; i++) {
    const p = game.crowd.peds[i];
    if (!p) continue;
    p.pos.x = points[i][0];
    p.pos.z = points[i][1];
    p.route = points.map(([x, z]) => ({ x, z }));
    p.routeIndex = (i + 1) % points.length;
    p.mesh.position.set(p.pos.x, 0.16, p.pos.z);
  }
}

// Fill the quay with activity for the wide shots.
function dressHarbor(game, count) {
  for (let i = 0; i < count; i++) {
    const car = game.traffic.parked[i];
    if (!car) continue;
    car.place(214 + (i % 3) * 8, -120 + i * 34, Math.PI / 2);
  }
  for (let i = 0; i < 8; i++) {
    const p = game.crowd.peds[i];
    if (!p) continue;
    p.pos.x = 206 + (i % 4) * 7;
    p.pos.z = -60 + Math.floor(i / 4) * 14 + (i % 2) * 4;
    p.mesh.position.set(p.pos.x, 0.16, p.pos.z);
  }
}

export function shotPoseApply(game) {
  if (!game.shotPose) return;
  const cam = game.stage.camera;
  cam.position.copy(game.shotPose.pos);
  cam.lookAt(game.shotPose.look);
  if (Math.abs(cam.fov - game.shotPose.fov) > 0.001) {
    cam.fov = game.shotPose.fov;
    cam.updateProjectionMatrix();
  }
}
