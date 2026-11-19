// Every tunable number the city, the player and the police agree on, in one place: the world's
// size and its dusk palette, the walking and driving feel, the wanted ladder's timings. Modules
// import these rather than repeating a constant, so a change here moves the whole game.

/** Logical resolution: the renderer is stretched to the window, the camera keeps this aspect. */
export const VIEW = { width: 1280, height: 720 };

/** Fixed simulation step. The loop runs whole steps, so a slow frame never changes the outcome. */
export const STEP = 1 / 60;

/** The grid: blocks of city between roads, roads wide enough for four lanes and a kerb. */
export const CITY = {
  blocks: 10,
  block: 58,
  road: 18,
  sidewalk: 3.4,
  lampsPerRoad: 5,
  get pitch() { return this.block + this.road; },
  get half() { return (this.blocks * this.pitch) / 2; },
};

/** The harbour lies south of the last east-west road; its promenade is the city's front porch. */
export const HARBOR = {
  shoreZ: CITY.half + 22,
  waterZ: CITY.half + 34,
  pierCount: 3,
  wheelZ: CITY.half + 19,
  wheelX: -58,
};

/** Sun, sky and fog: the hour the whole game is lit for. */
export const LIGHT = {
  sunDir: [-0.36, 0.27, 0.89],
  sunColor: 0xffb066,
  skyTop: '#141b38',
  skyMid: '#5b3f78',
  skyLow: '#ff8455',
  skyHorizon: '#ffd39b',
  fogColor: 0xc98d72,
  fogNear: 110,
  fogFar: 720,
  ambientSky: 0xa9bde8,
  ambientGround: 0x4a3038,
  exposure: 1.18,
};

/** How the body moves on foot, and how the camera sits behind it. */
export const ON_FOOT = {
  walk: 4.6,
  run: 8.4,
  accel: 34,
  drag: 12,
  jump: 5.4,
  gravity: 22,
  radius: 0.42,
  height: 1.78,
  eye: 1.6,
};

/** How the car moves: arcade numbers, tuned so a sedan clears a boulevard in a few seconds. */
export const DRIVING = {
  maxSpeed: 47,
  reverse: 13,
  accel: 16,
  brake: 30,
  drag: 0.6,
  roll: 1.15,
  steer: 1.9,
  steerFalloff: 0.0026,
  radius: 1.15,
  enterRange: 4.2,
  cameraBack: 6.6,
  cameraUp: 2.9,
};

/** Wanted level: what a crime adds, how fast the heat cools, and what each star sends. */
export const WANTED = {
  max: 5,
  decayDelay: 8,
  decayRate: 0.06,
  stars: [
    { cruisers: 0, foot: 0, heli: false },
    { cruisers: 1, foot: 1, heli: false },
    { cruisers: 2, foot: 2, heli: false },
    { cruisers: 3, foot: 3, heli: false },
    { cruisers: 3, foot: 4, heli: true },
    { cruisers: 4, foot: 6, heli: true },
  ],
};

/** Combat: one pistol and one submachine gun, both hitscan with a visible tracer. */
export const WEAPONS = {
  pistol: { name: 'Harbor 9', damage: 34, rate: 0.24, spread: 0.012, range: 130, ammo: 12, reload: 1.15, auto: false },
  smg: { name: 'Squall SMG', damage: 14, rate: 0.072, spread: 0.034, range: 95, ammo: 30, reload: 1.7, auto: true },
  fists: { name: 'Fists', damage: 20, rate: 0.4, spread: 0, range: 2.2, ammo: 0, reload: 0, auto: true },
};

/** The story's money: what a job pays and what the player starts with. */
export const MONEY_START = 350;
export const SAVE_KEY = 'vice-harbor-save-v1';
