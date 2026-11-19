// Vice Harbor — tuning constants.
// Everything that needs to agree between the world, simulation and HUD lives
// here. Distances are in world metres (Z is "north", X is "east", Y is up).

export const CFG = Object.freeze({
  // City layout: a grid of blocks separated by roads.
  grid: 7,                 // odd number of intersections per axis
  block: 46,               // metres between intersections
  road: 13,                // road width in metres
  sidewalk: 2.4,           // sidewalk strip on each side of a road
  half: (7 - 1) / 2,       // intersection index offset, derived from grid

  // Water sits south of the city; the boardwalk is the southern edge.
  waterLevel: -0.55,
  seaStartZ: 3.5 * 46,     // derived from block/grid; water is z > this

  // Player / movement.
  walkSpeed: 7.2,
  runSpeed: 12.4,
  playerRadius: 0.6,
  eyeHeight: 1.7,

  // Vehicles.
  carSpeed: 24,
  carBoost: 38,
  carTurn: 1.7,
  carRadius: 1.5,

  // Combat.
  bulletSpeed: 90,
  bulletLife: 1.4,
  fireCooldown: 0.16,
  playerMaxHp: 100,

  // Wanted system: one star per this much "heat", heat bleeds off over time.
  heatPerStar: 34,
  heatDecay: 3.4,
  wantedMax: 5,
  policeSpawnHeat: 18,

  // Traffic / pedestrians.
  trafficCount: 16,
  pedestrianCount: 18,
  carStealHeat: 22,
  assaultHeat: 12,

  // Camera.
  camDistance: 13,
  camHeight: 7.5,
  camLag: 4.2,
  camLookAhead: 5,

  // Fog / sky (dusk).
  fogNear: 70,
  fogFar: 360,
  sunAngle: 0.9,           // radians above the horizon at dusk

  // Missions are progressive checkpoints the player must reach in order.
  missions: Object.freeze([
    Object.freeze({ name: 'Waterfront Stroll', hint: 'Reach the harbor pier in the south.', x: -2 * 46, z: 3.5 * 46 - 3, radius: 7 }),
    Object.freeze({ name: 'Wheels of Fortune', hint: 'Steal any car, then drive to the neon junction.', x: 2 * 46, z: -1 * 46, radius: 9, needCar: true }),
    Object.freeze({ name: 'Heat Run', hint: 'Get 2 wanted stars and lose the police at the north gate.', x: 0, z: -3 * 46, radius: 11, needStars: 2 }),
  ]),
});

// A compact palette so every module shades the same dusk city consistently.
export const COLORS = Object.freeze({
  sky: 0x241b33,
  fog: 0x3a2c44,
  sun: 0xffb27a,
  ambient: 0x6a5a86,
  ground: 0x2b2733,
  road: 0x1c1b22,
  lane: 0xc9a24a,
  sidewalk: 0x4a4658,
  water: 0x1d3a52,
  waterEmissive: 0x0d2436,
  building: Object.freeze([0x322c42, 0x3b3446, 0x2c2d3d, 0x433447, 0x35394b, 0x2f3143]),
  window: Object.freeze([0xffd089, 0xff9f6e, 0x8fd0ff, 0xff7fae]),
  neon: Object.freeze([0xff4f9a, 0x54e0ff, 0xffc857, 0xb98bff]),
  carBody: Object.freeze([0xc84f5c, 0x4f8fd8, 0xe0a63c, 0x49b08a, 0xd7d2e4, 0x8a5fc0]),
  police: 0x24408f,
  policeLight: 0x3d6bff,
  ped: Object.freeze([0xd98a5a, 0x6f8fc0, 0xb0c46a, 0xc86f9a, 0x9a7fd0]),
});
