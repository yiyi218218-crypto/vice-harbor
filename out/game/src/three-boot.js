// three.js ships here as an ES module (r160), so it is imported once and exposed on
// globalThis before any of the game's modules are evaluated.

import * as THREE from '../vendor/three.min.js';

globalThis.THREE = THREE;
