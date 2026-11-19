// Deterministic photo-mode presets. tools/shoot.mjs opens the game with
// ?shot=<mode>&seed=1 and these setups force a known, repeatable frame so the
// four dossier screenshots always show the same composition.

export const SHOT_MODES = ['start', 'play', 'heat', 'end'];

export function readShot() {
  const q = new URLSearchParams(location.search);
  const mode = SHOT_MODES.includes(q.get('shot')) ? q.get('shot') : null;
  const seed = q.get('seed') || '1';
  return { mode, seed };
}

// Each preset describes the world state to force after normal initialisation.
// main.js applies these fields; nothing here imports three.js or the scene.
export function shotSetup(mode) {
  switch (mode) {
    case 'start':
      return {
        overlay: 'start',
        pos: { x: 0, z: 26 },
        heading: Math.PI,          // face the landmark tower
        camDist: 24,
        camHeight: 11,
        wanted: 0,
        mission: 0,
        inCar: false,
        health: 100,
      };
    case 'play':
      return {
        overlay: null,
        pos: { x: -44, z: -44 },
        heading: -Math.PI / 2,
        camDist: 19,
        camHeight: 9,
        wanted: 1,
        mission: 0,
        inCar: true,
        health: 92,
      };
    case 'heat':
      return {
        overlay: null,
        pos: { x: 44, z: 0 },
        heading: Math.PI / 2,
        camDist: 23,
        camHeight: 11,
        wanted: 5,
        mission: 1,
        inCar: true,
        health: 63,
        police: 5,
      };
    case 'end':
      return {
        overlay: 'end',
        pos: { x: 88, z: 66 },
        heading: 0,
        camDist: 26,
        camHeight: 12,
        wanted: 0,
        mission: 3,
        inCar: false,
        health: 100,
        completed: 3,
      };
    default:
      return null;
  }
}
