// Deterministic photo-mode. ?shot=start|play|heat|end&seed=N freezes the
// simulation into one of four composed scenes, so screenshots are stable and
// reproducible. The tool tools/shoot.mjs drives these URLs in a real browser.

export const SHOT_MODES = Object.freeze(['start', 'play', 'heat', 'end']);

export function readShotParams(search = globalThis.location?.search || '') {
  const p = new URLSearchParams(search);
  const raw = p.get('shot');
  const mode = SHOT_MODES.includes(raw) ? raw : null;
  const seedRaw = p.get('seed');
  const seed = seedRaw != null && /^-?\d+$/.test(seedRaw) ? Number(seedRaw) >>> 0 : 1337;
  return { mode, seed, freeze: mode != null };
}

// Where the camera looks and how far out it sits for each composed shot.
// Positions are world coordinates; the player is parked at `player` for the
// shot so the composition is identical every run.
export function shotPose(mode) {
  // City roads sit at x,z in {-138,-92,-46,0,46,92,138}; water is z>161.
  // Cameras are parked above intersections or out over the bay, high enough
  // to clear the towers so the street grid and skyline always read clearly.
  switch (mode) {
    case 'start':
      return {
        player: { x: 0, z: 46, heading: 0, inCar: false },
        camera: { x: 96, y: 54, z: 250, look: { x: -6, y: 16, z: 66 } },
        hud: 'start',
        wanted: 0,
        mission: 0,
      };
    case 'heat':
      return {
        // South-edge intersection: camera sits over open water looking north,
        // so the stolen car and the chasing cruisers are unobstructed.
        player: { x: 0, z: 92, heading: 3.14, inCar: true },
        camera: { x: 0, y: 12, z: 142, look: { x: 0, y: 1.8, z: 92 } },
        hud: 'play',
        wanted: 4,
        mission: 2,
        police: true,
      };
    case 'end':
      return {
        player: { x: -46, z: 150, heading: 3.14, inCar: false },
        camera: { x: -8, y: 42, z: 232, look: { x: -46, y: 4, z: 140 } },
        hud: 'end',
        wanted: 0,
        mission: 3,
      };
    case 'play':
    default:
      return {
        player: { x: 46, z: 92, heading: 3.14, inCar: true },
        camera: { x: 46, y: 12, z: 140, look: { x: 46, y: 1.8, z: 92 } },
        hud: 'play',
        wanted: 1,
        mission: 1,
      };
  }
}

// Show a specific HUD layer and hide the others. The DOM ids come from
// index.html; this is intentionally defensive so a missing node is harmless.
export function applyHudMode(mode) {
  const show = (id, on) => {
    const el = globalThis.document?.getElementById(id);
    if (el) el.style.display = on ? '' : 'none';
  };
  show('start-screen', mode === 'start');
  show('end-screen', mode === 'end');
  show('hud', mode === 'play' || mode === 'heat');
}
