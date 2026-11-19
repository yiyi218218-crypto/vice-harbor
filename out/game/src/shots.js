// The four screenshots, staged from the same rules the player gets. Each scene puts the world in a
// named state, plays the real simulation forward for a fixed number of steps (so the traffic has
// moved, the wheels have turned and the camera has settled), paints two frames and raises
// `window.__shotReady`. Boulevard runs north to south into the sunset, so every shot faces the sun.
import { STEP } from './config.js';

const BEAT = { x: -4.4, z: 0 };
const BOULEVARD_Z = 380;
const SOUTH = 0;
const WEST = -Math.PI / 2;

/** Run the world forward with a scripted key held, the way a player would have driven it. */
function run(game, seconds, keys = []) {
  for (const key of keys) game.input.hold(key, true);
  for (let i = 0; i < seconds / STEP; i += 1) game.step(STEP);
  for (const key of keys) game.input.hold(key, false);
}

/** Put cars on the boulevard at chosen spots, so the street ahead is busy and framed. */
function placeTraffic(game, list) {
  const clamp = (v) => Math.max(0, Math.min(10, v));
  list.forEach(([x, z, heading], i) => {
    const car = game.traffic.cars[i];
    if (!car) return;
    const gi = clamp(Math.round((x + 380) / 76));
    const gj = clamp(Math.round((z + 380) / 76));
    const dx = Math.sin(heading);
    const dz = Math.cos(heading);
    const alongX = Math.abs(dx) > Math.abs(dz);
    car.x = x;
    car.z = z;
    car.heading = heading;
    car.speed = 13;
    car.parked = false;
    car.lastDir = [alongX ? Math.sign(dx) : 0, alongX ? 0 : Math.sign(dz)];
    car.node = { i: clamp(gi + (alongX ? Math.sign(dx) : 0)), j: clamp(gj + (alongX ? 0 : Math.sign(dz))) };
    car.car.group.position.set(x, 0, z);
    car.car.group.rotation.y = heading;
  });
}

/** A cruiser dropped at an exact spot, lights on. */
function deployCruiser(game, x, z, heading, speed = 16) {
  const unit = game.police.spawnCruiser(game.player.state, 26);
  if (!unit) return null;
  unit.x = x;
  unit.z = z;
  unit.heading = heading;
  unit.speed = speed;
  unit.stuck = 0;
  unit.car.group.position.set(x, 0, z);
  unit.car.group.rotation.y = heading;
  return unit;
}

function objective(game, title, text, dist) {
  game.missions.objective.title = title;
  game.missions.objective.text = text;
  game.missions.objective.dist = dist;
  game.missions.marker.group.visible = false;
}

export function stageShot(name, game) {
  const { player, hud, camera, traffic, police, combat, missions } = game;

  if (name === 'start') {
    game.setScreen('title');
    hud.showTitle(true);
    hud.setVisible(false);
    hud.setBest('No shift yet');
    player.spawn(BEAT.x, BEAT.z - 20, SOUTH, false);
    run(game, 2.2);
    camera.position.set(84, 112, -318);
    camera.lookAt(-52, 18, 168);
    camera.fov = 58;
    camera.updateProjectionMatrix();
  } else if (name === 'play') {
    game.setScreen('play');
    hud.showTitle(false);
    hud.setVisible(true);
    game.setMoney(4820);
    police.clear();
    player.spawn(238, BOULEVARD_Z - 9, WEST, true);
    player.state.speed = 27;
    run(game, 1.3, ['KeyW']);
    // Traffic laid out around wherever the run left the car, so the promenade ahead is full.
    const x0 = player.state.x;
    placeTraffic(game, [
      [x0 - 17, BOULEVARD_Z - 9, WEST],
      [x0 - 34, BOULEVARD_Z - 9, WEST],
      [x0 - 12, BOULEVARD_Z + 9, Math.PI / 2],
      [x0 - 52, BOULEVARD_Z - 9, WEST],
      [x0 - 46, BOULEVARD_Z + 9, Math.PI / 2],
      [x0 - 74, BOULEVARD_Z - 9, WEST],
      [x0 - 96, BOULEVARD_Z + 9, Math.PI / 2],
      [x0 - 120, BOULEVARD_Z - 9, WEST],
    ]);
    run(game, 0.2, ['KeyW']);
    objective(game, 'The Pickup', 'Collect the crate at the fish docks', 214);
    hud.say('<b>Wren</b> &nbsp;Keep it under the speed limit. Or do not.', 8);
    hud.toast('Neon Core');
  } else if (name === 'heat') {
    game.setScreen('play');
    hud.showTitle(false);
    hud.setVisible(true);
    game.setMoney(6300);
    police.clear();
    player.spawn(-5, 136, SOUTH, false);
    player.state.hp = 76;
    player.state.armor = 28;
    player.pitch = 0.06;
    player.yaw = 0.02;
    police.state.wanted = 3.0;
    police.state.heat = 0;
    combat.select('smg');
    combat.state.magazine.smg = 24;
    deployCruiser(game, -0.8, 146, Math.PI * 0.78, 11);
    deployCruiser(game, 6.4, 160, Math.PI * 0.9, 9);
    missions.spawnGang({ x: -3, z: 152 }, 3);
    run(game, 0.3);
    // One of the Crew already down, so the fight reads as a fight.
    const down = missions.enemies[0];
    if (down) {
      down.alive = false;
      down.dead = 0.9;
      down.x = 2.4;
      down.z = 146;
      down.group.rotation.z = 1.5;
      down.group.position.set(2.4, 0.1, 146);
    }
    objective(game, 'Bad Blood', 'Put the Crew down (2/3)', 0);
    hud.say('<b>Wren</b> &nbsp;They brought the whole Crew. Make it count.', 8);
    hud.toast('3 stars');
    hud.calm();
    // Three bursts up the street, so the frame has tracers and muzzle flame in it.
    for (let i = 0; i < 3; i += 1) {
      combat.state.cooldown = 0;
      combat.fire(player, { traffic, police, enemies: [], aiming: i > 0, onCrime() {}, onShot() {} });
      run(game, 0.035);
    }
    player.pitch = 0.0;
  } else if (name === 'end') {
    game.setScreen('play');
    hud.showTitle(false);
    hud.setVisible(true);
    game.setMoney(11840);
    police.clear();
    player.spawn(BEAT.x, BEAT.z + 96, SOUTH, true);
    player.state.speed = 32;
    player.state.hp = 88;
    player.state.armor = 14;
    police.state.wanted = 4.0;
    placeTraffic(game, [
      [BEAT.x, 250, SOUTH],
      [BEAT.x + 9, 214, Math.PI],
      [BEAT.x + 27, 176, Math.PI],
    ]);
    deployCruiser(game, -6.6, 158, SOUTH, 30);
    deployCruiser(game, 4.8, 174, Math.PI * 0.96, 12);
    deployCruiser(game, BEAT.x, 212, Math.PI, 18);
    run(game, 0.9, ['KeyW']);
    objective(game, 'Harbor Run', 'Lose the police', 0);
    hud.banner('Mission passed', '+$2,600', 12);
    hud.say('<b>Wren</b> &nbsp;Package delivered. Now lose them.', 9);
  } else {
    game.setScreen('title');
    hud.showTitle(true);
    run(game, 1);
  }

  // One last HUD pass, so the objective card matches the scene just staged.
  hud.update(1 / 60, game);

  // Two paints: the first settles the shadow map and the camera, the second is the frame.
  let painted = 0;
  function paint() {
    game.renderer.render(game.scene, camera);
    painted += 1;
    if (painted < 3) requestAnimationFrame(paint);
    else window.__shotReady = true;
  }
  requestAnimationFrame(paint);
}
