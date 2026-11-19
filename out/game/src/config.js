// Vice Harbor - central tuning table.
// Every gameplay number and every story beat lives here, so the rest of the
// game reads like a description of the world instead of a pile of magic numbers.

export const CFG = {
  city: {
    half: 140,        // street grid spans -half .. +half on both axes
    block: 44,        // center-line distance between adjacent roads
    roadW: 13,        // asphalt width
    walkW: 3.5,       // pavement strip on each side
    seaZ: 96,         // harbour water begins past this +Z line
    maxBuildingH: 46,
    minBuildingH: 9,
  },
  player: {
    walk: 12,
    run: 20,
    radius: 1.3,
    maxHealth: 100,
    fireCooldown: 0.14,
    bulletSpeed: 150,
    bulletLife: 1.1,
  },
  car: {
    accel: 30,
    brake: 42,
    reverse: 18,
    topSpeed: 52,
    turnRate: 2.1,
    drag: 1.7,
    radius: 2.4,
  },
  wanted: {
    stars: 5,
    coolDown: 16,     // seconds of clean driving to shed one star
    policePerStar: 1,
    carjackStars: 2,
    shootStars: 1,
  },
  camera: {
    dist: 19,
    height: 10,
    fov: 62,
    follow: 4.5,
    lookAhead: 6,
  },
  world: {
    trafficCars: 18,
    pedestrians: 26,
    fogNear: 55,
    fogFar: 330,
  },
};

// Dusk palette: violet upper sky, burnt-orange horizon, teal water, neon signs.
export const PAL = {
  skyTop: 0x241a4a,
  skyBottom: 0xff7a45,
  fog: 0x9a6a72,
  sun: 0xffb27a,
  ambient: 0x6a5a86,
  water: 0x16304f,
  waterHi: 0x4f8fb5,
  asphalt: 0x24242c,
  lane: 0xf2c14e,
  pavement: 0x4a4652,
  neonPink: 0xff2d95,
  neonCyan: 0x2ee6f2,
  neonGold: 0xffd23f,
  police: 0xf2f2f2,
  policeDark: 0x141824,
  building: [0x3b3550, 0x5a3b46, 0x2f4a52, 0x4a4055, 0x6b4a3e, 0x33304a],
};

// Three escalating jobs. Coordinates sit on real road intersections, so each
// marker is reachable by car and every mission changes the play state.
export const MISSIONS = [
  {
    id: 'harbor-run',
    title: 'HARBOR RUN',
    brief: 'Take the wheels down to the container yard on the south pier.',
    target: { x: -88, z: 44 },
    radius: 12,
    reward: 500,
    needCar: false,
  },
  {
    id: 'hot-package',
    title: 'HOT PACKAGE',
    brief: 'Liberate a ride, then deliver it to the neon safehouse uptown.',
    target: { x: 44, z: -88 },
    radius: 12,
    reward: 1000,
    needCar: true,
  },
  {
    id: 'clean-getaway',
    title: 'CLEAN GETAWAY',
    brief: 'Spark a three-star chase and lose the heat at the lighthouse.',
    target: { x: 88, z: 88 },
    radius: 14,
    reward: 1800,
    needCar: true,
    needStars: 3,
  },
];

export const SAVE_KEY = 'vice-harbor-save-v1';
