// The cars of Vice Harbor, built from boxes: a low body, a glasshouse, four wheels and the lamps.
// Each car is merged into one shell mesh plus one lamp mesh, so a street of traffic is cheap; the
// player's car is asked for in detail and gets separate wheels that spin and brake lights that glow.
import * as THREE from '../vendor/three.min.js';
import { MeshBuilder } from './mesh.js';
import { glowTexture } from './city.js';

/* All the shapes face +Z. `w` is width, `l` length, `low` the sill height, `roof` the roof height. */
export const CAR_TYPES = {
  sedan: { w: 1.9, l: 4.5, low: 0.34, roof: 1.44, cabin: 2.3, cabinAt: -0.1, weight: 0.9, speed: 26 },
  coupe: { w: 1.92, l: 4.2, low: 0.3, roof: 1.3, cabin: 1.9, cabinAt: -0.3, weight: 1.0, speed: 30 },
  taxi: { w: 1.92, l: 4.6, low: 0.36, roof: 1.52, cabin: 2.4, cabinAt: -0.1, weight: 0.85, speed: 24 },
  van: { w: 2.12, l: 5.4, low: 0.42, roof: 2.05, cabin: 3.6, cabinAt: 0.1, weight: 0.6, speed: 21 },
  pickup: { w: 2.05, l: 5.1, low: 0.44, roof: 1.62, cabin: 1.9, cabinAt: 0.35, weight: 0.7, speed: 23 },
  sports: { w: 2.0, l: 4.35, low: 0.26, roof: 1.14, cabin: 1.6, cabinAt: -0.35, weight: 1.15, speed: 36 },
  cruiser: { w: 1.94, l: 4.7, low: 0.34, roof: 1.48, cabin: 2.4, cabinAt: -0.1, weight: 0.95, speed: 32 },
  muscle: { w: 2.0, l: 4.7, low: 0.32, roof: 1.34, cabin: 1.8, cabinAt: -0.15, weight: 1.05, speed: 34 },
};

/** The palette the traffic is painted from: sun-faded pastels and the odd loud colour. */
export const CAR_COLORS = [
  0xd94f4f, 0xe8a33d, 0x3f7fd4, 0x2fa88a, 0xb0b6bd, 0x1f2733, 0xf0e6d2, 0x7a4bb5,
  0xd96ea8, 0x4fb8d9, 0x8c6a4a, 0x2d3a2e, 0xc4552e, 0x5a6b7a,
];

function rimColor(base) {
  return new THREE.Color(base).multiplyScalar(0.55);
}

/**
 * Build one car. `color` paints the body; `type` picks the shape. Detailed cars get spinning
 * wheels, brake lights and a roof bar the caller can flash.
 */
export function buildCar(type, color, { detailed = false, police = false } = {}) {
  const spec = CAR_TYPES[type] ?? CAR_TYPES.sedan;
  const group = new THREE.Group();
  const body = new THREE.Color(color);
  const shell = new MeshBuilder();
  const glass = new MeshBuilder();
  const lamps = new MeshBuilder();

  const halfW = spec.w / 2;
  const halfL = spec.l / 2;
  const sill = spec.low;

  // Lower body, then a slightly narrower shoulder, so the car has a waist.
  shell.part(0, sill + 0.26, 0, spec.w, 0.52, spec.l, 0, body);
  shell.part(0, sill + 0.58, 0, spec.w * 0.97, 0.16, spec.l * 0.98, 0, body.clone().multiplyScalar(1.08));
  // The glasshouse: a dark box tucked inside the roof, then a painted roof on top of it.
  const roofY = spec.roof;
  const cabinH = Math.max(0.34, roofY - (sill + 0.62));
  glass.part(0, sill + 0.62 + cabinH / 2, spec.cabinAt, spec.w * 0.86, cabinH, spec.cabin, 0, new THREE.Color(0x18202e));
  shell.part(0, roofY - 0.09, spec.cabinAt, spec.w * 0.82, 0.14, spec.cabin * 0.94, 0, body.clone().multiplyScalar(1.05));
  // Pillars.
  for (const sz of [-1, 1]) {
    shell.part(0, sill + 0.62 + cabinH / 2, spec.cabinAt + sz * (spec.cabin / 2 - 0.06), spec.w * 0.84, cabinH, 0.1, 0, rimColor(color));
  }
  // Bumpers and a grille.
  shell.part(0, sill + 0.18, halfL - 0.06, spec.w * 0.94, 0.3, 0.16, 0, rimColor(color));
  shell.part(0, sill + 0.18, -halfL + 0.06, spec.w * 0.94, 0.3, 0.16, 0, rimColor(color));
  // Side mirrors.
  for (const sx of [-1, 1]) shell.part(sx * (halfW + 0.08), sill + 0.78, spec.cabinAt + spec.cabin / 2 - 0.2, 0.22, 0.14, 0.3, 0, rimColor(color));

  // Lamps: warm white at the front, red at the back.
  for (const sx of [-1, 1]) {
    lamps.part(sx * halfW * 0.62, sill + 0.5, halfL + 0.01, 0.42, 0.18, 0.06, 0, new THREE.Color(0xfff2cc));
    lamps.part(sx * halfW * 0.66, sill + 0.5, -halfL - 0.01, 0.36, 0.16, 0.06, 0, new THREE.Color(0xff3a2e));
  }

  const wheelR = type === 'van' || type === 'pickup' ? 0.42 : 0.36;
  const wheelAt = [
    [halfW - 0.06, halfL - 1.15],
    [-halfW + 0.06, halfL - 1.15],
    [halfW - 0.06, -halfL + 1.1],
    [-halfW + 0.06, -halfL + 1.1],
  ];
  const wheels = [];
  const tyre = new THREE.MeshStandardMaterial({ color: 0x14141a, roughness: 0.95 });
  if (detailed) {
    const wg = new THREE.CylinderGeometry(wheelR, wheelR, 0.28, 12);
    wg.rotateZ(Math.PI / 2);
    for (const [wx, wz] of wheelAt) {
      const wheel = new THREE.Mesh(wg, tyre);
      wheel.position.set(wx, wheelR, wz);
      wheel.castShadow = true;
      group.add(wheel);
      wheels.push(wheel);
    }
  } else {
    for (const [wx, wz] of wheelAt) shell.part(wx, wheelR, wz, 0.3, wheelR * 2, wheelR * 2, 0, new THREE.Color(0x14141a));
  }

  // The police livery: a white door panel and a light bar that the game flashes.
  let bar = null;
  if (police) {
    shell.part(0, sill + 0.34, 0, spec.w * 1.005, 0.5, 1.7, 0, new THREE.Color(0xf2f0ea));
    bar = new THREE.Group();
    const lampUnit = (color, x) => {
      const unit = new THREE.Group();
      const box = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.18, 0.3), new THREE.MeshBasicMaterial({ color }));
      const glow = new THREE.Mesh(
        new THREE.PlaneGeometry(2.3, 2.3),
        new THREE.MeshBasicMaterial({
          color, map: glowTexture(), transparent: true, opacity: 0.5,
          blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
        }),
      );
      unit.add(box, glow);
      unit.position.x = x;
      return unit;
    };
    bar.add(lampUnit(0xff2b3a, -0.34), lampUnit(0x2b6bff, 0.34));
    bar.position.set(0, roofY + 0.12, spec.cabinAt);
    group.add(bar);
  }

  const shellMesh = new THREE.Mesh(shell.geometry(), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.42, metalness: 0.35 }));
  shellMesh.castShadow = true;
  shellMesh.receiveShadow = true;
  group.add(shellMesh);
  const glassMesh = new THREE.Mesh(glass.geometry(), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.12, metalness: 0.6 }));
  group.add(glassMesh);
  const lampMesh = new THREE.Mesh(lamps.geometry(), new THREE.MeshBasicMaterial({ vertexColors: true }));
  group.add(lampMesh);

  // A pool of headlight on the road in front, which reads at night without a real light.
  const pool = new THREE.Mesh(
    new THREE.PlaneGeometry(7.5, 16),
    new THREE.MeshBasicMaterial({
      color: 0xffcf92, transparent: true, opacity: 0.16, blending: THREE.AdditiveBlending,
      depthWrite: false, map: glowTexture(),
    }),
  );
  pool.rotation.x = -Math.PI / 2;
  pool.position.set(0, 0.06, halfL + 7.2);
  group.add(pool);

  // And a red smear behind, which is what a car actually looks like at dusk from behind.
  const tailGlow = new THREE.Mesh(
    new THREE.PlaneGeometry(3.2, 1.7),
    new THREE.MeshBasicMaterial({
      color: 0xff2a18, map: glowTexture(), transparent: true, opacity: 0.4,
      blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
    }),
  );
  tailGlow.position.set(0, sill + 0.5, -halfL - 0.18);
  group.add(tailGlow);

  return {
    group,
    wheels,
    bar,
    spec,
    wheelR,
    setRoll(spin) {
      for (const wheel of wheels) wheel.rotation.x = spin;
    },
    setBar(phase) {
      if (!bar) return;
      const on = Math.sin(phase * 9) > 0;
      bar.children[0].visible = on;
      bar.children[1].visible = !on;
    },
  };
}
