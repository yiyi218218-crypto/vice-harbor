// Vice Harbor — the numbers the whole game agrees on.
// Nothing here is imported from outside: this file is the single source of truth for
// layout, handling, heat and the ten-minute curve of the story.

export const SCHEMA = 'vice-harbor/config/1';
export const SAVE_KEY = 'viceharbor.save.v1';

// --- the city -----------------------------------------------------------------
// Six avenue lines each way, five blocks between them. A block is 62 m of lots with a
// 4 m sidewalk, so the pitch is 76 m and the island is 456 m across, water to the east.
export const CITY = {
  lines: 6,
  pitch: 76,
  lot: 62,
  roadHalf: 7,
  get span() { return (this.lines - 1) * this.pitch; },   // 380 m between outer roads
  get half() { return this.span / 2; },                   // 190 m
  shoreX: 236,
  ground: 980,
  blockRows: 5,
};

export function roadLines() {
  const out = [];
  const start = -((CITY.lines - 1) * CITY.pitch) / 2;
  for (let i = 0; i < CITY.lines; i++) out.push(start + i * CITY.pitch);
  return out;
}

// --- player -------------------------------------------------------------------
export const PLAYER = {
  height: 1.72,
  radius: 0.46,
  walk: 4.4,
  sprint: 8.0,
  accel: 26,
  friction: 12,
  health: 100,
  respawnHealth: 78,
  mag: 12,
  reload: 1.25,
  fireDelay: 0.17,
  bulletRange: 140,
  aimSpread: 0.028,
};

// --- vehicles -----------------------------------------------------------------
// Arcade handling: top speed in m/s, accel in m/s^2, grip 0..1 (1 never slides).
export const CARS = {
  sedan:   { name: 'Corsair 4D',  len: 4.6, wid: 1.92, hgt: 1.42, top: 33, accel: 9.5,  brake: 18, grip: 0.90, turn: 1.55, mass: 1.0,  colors: ['#c8ccd4', '#7f8a99', '#2f3a4a', '#8e3b3b', '#48604f'] },
  coupe:   { name: 'Marlin GT',   len: 4.4, wid: 1.86, hgt: 1.22, top: 41, accel: 13.0, brake: 20, grip: 0.86, turn: 1.72, mass: 0.9,  colors: ['#d8a13c', '#b53a2e', '#20242c', '#e2e6ea'] },
  van:     { name: 'Harbor Van',  len: 5.4, wid: 2.10, hgt: 2.06, top: 27, accel: 7.0,  brake: 15, grip: 0.88, turn: 1.30, mass: 1.35, colors: ['#d9d4c6', '#4c6f8a', '#6b5a45'] },
  taxi:    { name: 'Bay Cab',     len: 4.7, wid: 1.94, hgt: 1.46, top: 32, accel: 9.0,  brake: 18, grip: 0.90, turn: 1.52, mass: 1.0,  colors: ['#e8b93f'] },
  police:  { name: 'Patrol 12',   len: 4.8, wid: 1.96, hgt: 1.48, top: 38, accel: 12.2, brake: 20, grip: 0.93, turn: 1.62, mass: 1.05, colors: ['#e9edf2'] },
  pickup:  { name: 'Dock Truck',  len: 5.6, wid: 2.16, hgt: 1.92, top: 29, accel: 7.8,  brake: 16, grip: 0.84, turn: 1.34, mass: 1.4,  colors: ['#7a4a33', '#3f4d3a', '#5d6470'] },
  cruiser: { name: 'Marlin Police', len: 4.5, wid: 1.88, hgt: 1.26, top: 44, accel: 14.5, brake: 21, grip: 0.87, turn: 1.78, mass: 0.95, colors: ['#20242c'] },
};

// --- heat / police ------------------------------------------------------------
export const HEAT = {
  max: 5,
  perShooting: 0.55,
  perKill: 1.6,
  perCarjack: 0.75,
  perCopHit: 0.9,
  decayIdle: 0.14,         // points per second with no police in sight
  decayDelay: 6.0,         // seconds of quiet before decay starts
  starAt: 1.0,             // points per star
  spawnStars: 1,           // police arrive from one star up
  unitsPerStar: 1,         // patrol cars per star
  bustRadius: 26,
  spotlight: 34,
};

// --- story --------------------------------------------------------------------
export const MISSION_ORDER = ['dock_run', 'harbor_lights', 'big_haul'];

export const MISSION_META = {
  dock_run: {
    title: 'DOCK RUN',
    brief: 'Lift the Marlin GT from the east pier and put it in the safehouse garage before the tide turns.',
    reward: 1800,
    par: 150,
  },
  harbor_lights: {
    title: 'HARBOR LIGHTS',
    brief: 'The Salt Row crew is shaking down the pier. Put four of them down, then lose the heat.',
    reward: 3400,
    par: 210,
  },
  big_haul: {
    title: 'THE BIG HAUL',
    brief: 'Three crates, one van, one freighter. Collect the cargo, load it at berth nine, and get clear.',
    reward: 6500,
    par: 300,
  },
};

export const GAME = {
  fixedStep: 1 / 60,
  maxFrame: 0.05,
  autosave: 12,
  startMoney: 250,
  medkitHeal: 45,
  respawnCost: 150,
};

// --- palette ------------------------------------------------------------------
export const SKY = {
  top: '#16203f',
  mid: '#3c406c',
  low: '#b06a5e',
  horizon: '#f2a868',
  sun: '#ffdcae',
  fog: '#363652',
  waterDeep: '#1b4557',
  waterShallow: '#3f8089',
  waterGlint: '#ffcf94',
};

export const UI = {
  gold: '#f2a541',
  coral: '#ff5c6c',
  teal: '#37e0c4',
};

// Sun sits low over the water so every shot reads as the same evening.
export const SUN = {
  position: [230, 58, -170],
  color: '#ffd2a1',
  intensity: 2.85,
  ambient: '#6d7cab',
  ambientIntensity: 0.9,
  fogNear: 170,
  fogFar: 940,
};
