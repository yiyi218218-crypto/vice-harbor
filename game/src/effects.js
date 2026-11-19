// Sparks, smoke, muzzle flashes and bullet streaks: one CPU-updated point cloud with per-particle
// colour and size, plus a small pool of tracer beams. Everything is additive and depth-writes
// nothing, so a firefight over a wet street reads at a glance and costs a single draw call.
import * as THREE from '../vendor/three.min.js';
import { glowTexture } from './city.js';

const MAX_PARTICLES = 900;

export function createEffects(scene) {
  const positions = new Float32Array(MAX_PARTICLES * 3);
  const colors = new Float32Array(MAX_PARTICLES * 3);
  const sizes = new Float32Array(MAX_PARTICLES);
  const alphas = new Float32Array(MAX_PARTICLES);
  const vel = new Float32Array(MAX_PARTICLES * 3);
  const life = new Float32Array(MAX_PARTICLES);
  const maxLife = new Float32Array(MAX_PARTICLES);
  const drag = new Float32Array(MAX_PARTICLES);
  const grav = new Float32Array(MAX_PARTICLES);
  let cursor = 0;

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.setAttribute('aColor', new THREE.BufferAttribute(colors, 3));
  geo.setAttribute('aSize', new THREE.BufferAttribute(sizes, 1));
  geo.setAttribute('aAlpha', new THREE.BufferAttribute(alphas, 1));
  geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 2000);

  const mat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    uniforms: { uMap: { value: glowTexture() } },
    vertexShader: `
      attribute vec3 aColor; attribute float aSize; attribute float aAlpha;
      varying vec3 vColor; varying float vAlpha;
      void main() {
        vColor = aColor; vAlpha = aAlpha;
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        gl_PointSize = clamp(aSize * 6.0 / max(-mv.z, 0.6), 1.0, 190.0);
        gl_Position = projectionMatrix * mv;
      }
    `,
    fragmentShader: `
      uniform sampler2D uMap;
      varying vec3 vColor; varying float vAlpha;
      void main() {
        vec4 t = texture2D(uMap, gl_PointCoord);
        gl_FragColor = vec4(vColor, 1.0) * t * vAlpha;
      }
    `,
  });
  const points = new THREE.Points(geo, mat);
  points.frustumCulled = false;
  scene.add(points);

  /** One particle: colour as a THREE.Color, size in pixels at 6 m, life in seconds. */
  function spawn(x, y, z, vx, vy, vz, color, size, ttl, dragK = 1.6, gravity = 6) {
    const i = cursor;
    cursor = (cursor + 1) % MAX_PARTICLES;
    positions[i * 3] = x;
    positions[i * 3 + 1] = y;
    positions[i * 3 + 2] = z;
    vel[i * 3] = vx;
    vel[i * 3 + 1] = vy;
    vel[i * 3 + 2] = vz;
    colors[i * 3] = color.r;
    colors[i * 3 + 1] = color.g;
    colors[i * 3 + 2] = color.b;
    sizes[i] = size;
    alphas[i] = 1;
    life[i] = ttl;
    maxLife[i] = ttl;
    drag[i] = dragK;
    grav[i] = gravity;
  }

  const tmpColor = new THREE.Color();

  /* --- tracers: a pool of thin beams that fade where they were fired ----------------- */
  const TRACERS = 20;
  const tracerMat = new THREE.MeshBasicMaterial({
    color: 0xffd9a0, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false, fog: false,
  });
  const tracerGeo = new THREE.BoxGeometry(0.09, 0.09, 1);
  const tracers = [];
  for (let i = 0; i < TRACERS; i += 1) {
    const m = new THREE.Mesh(tracerGeo, tracerMat.clone());
    m.visible = false;
    m.frustumCulled = false;
    scene.add(m);
    tracers.push({ mesh: m, life: 0 });
  }
  let tracerCursor = 0;
  const up = new THREE.Vector3(0, 1, 0);

  /** A streak from `from` to `to` (THREE.Vector3), lasting `ttl` seconds. */
  function tracer(from, to, ttl = 0.075, color = 0xffd9a0) {
    const t = tracers[tracerCursor];
    tracerCursor = (tracerCursor + 1) % TRACERS;
    const dir = to.clone().sub(from);
    const len = dir.length();
    if (len < 0.001) return;
    t.mesh.position.copy(from).addScaledVector(dir, 0.5);
    t.mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), dir.normalize());
    t.mesh.scale.set(1, 1, len);
    t.mesh.material.color.setHex(color);
    t.mesh.material.opacity = 1;
    t.mesh.visible = true;
    t.life = ttl;
  }

  function update(dt) {
    for (let i = 0; i < MAX_PARTICLES; i += 1) {
      if (life[i] <= 0) {
        if (alphas[i] !== 0) alphas[i] = 0;
        continue;
      }
      life[i] -= dt;
      const k = Math.max(0, life[i] / maxLife[i]);
      alphas[i] = k * k;
      vel[i * 3] *= 1 - drag[i] * dt;
      vel[i * 3 + 1] = vel[i * 3 + 1] * (1 - drag[i] * dt) - grav[i] * dt;
      vel[i * 3 + 2] *= 1 - drag[i] * dt;
      positions[i * 3] += vel[i * 3] * dt;
      positions[i * 3 + 1] += vel[i * 3 + 1] * dt;
      positions[i * 3 + 2] += vel[i * 3 + 2] * dt;
      if (positions[i * 3 + 1] < 0.06) {
        positions[i * 3 + 1] = 0.06;
        vel[i * 3 + 1] *= -0.28;
      }
    }
    geo.attributes.position.needsUpdate = true;
    geo.attributes.aColor.needsUpdate = true;
    geo.attributes.aSize.needsUpdate = true;
    geo.attributes.aAlpha.needsUpdate = true;

    for (const t of tracers) {
      if (t.life > 0) {
        t.life -= dt;
        t.mesh.material.opacity = Math.max(0, t.life * 12);
        if (t.life <= 0) t.mesh.visible = false;
      }
    }
  }

  /* --- the named bursts the game asks for ------------------------------------------- */

  /** Muzzle flame: a bright short cone of sparks out of the barrel. */
  function muzzle(pos, dir) {
    for (let i = 0; i < 7; i += 1) {
      const s = 0.6 + Math.random() * 0.9;
      tmpColor.setHex(i % 2 ? 0xfff0c0 : 0xffa04a);
      spawn(
        pos.x + dir.x * 0.2, pos.y + dir.y * 0.2, pos.z + dir.z * 0.2,
        dir.x * s * 7 + (Math.random() - 0.5) * 2, dir.y * s * 7 + (Math.random() - 0.5) * 2, dir.z * s * 7 + (Math.random() - 0.5) * 2,
        tmpColor, 9 + Math.random() * 8, 0.09, 6, 0,
      );
    }
    tmpColor.setHex(0xfff4d8);
    spawn(pos.x + dir.x * 0.3, pos.y + dir.y * 0.3, pos.z + dir.z * 0.3, 0, 0, 0, tmpColor, 34, 0.05, 0, 0);
  }

  /** Where a bullet stopped: sparks off metal or dust off concrete. */
  function impact(pos, normal, blood = false) {
    const count = blood ? 8 : 6;
    for (let i = 0; i < count; i += 1) {
      tmpColor.setHex(blood ? 0xd42338 : i % 2 ? 0xffc070 : 0xfff0c8);
      const s = blood ? 3.2 : 2.4;
      spawn(
        pos.x, pos.y, pos.z,
        normal.x * s * (1 + Math.random() * 2) + (Math.random() - 0.5) * 4,
        normal.y * s * (1 + Math.random() * 2) + Math.random() * 3,
        normal.z * s * (1 + Math.random() * 2) + (Math.random() - 0.5) * 4,
        tmpColor, 4 + Math.random() * 4, 0.34, 3.2, 9,
      );
    }
  }

  /** Tyre smoke and dust, for a car sliding or a body hitting the road. */
  function smoke(pos, amount = 4, color = 0x8a7f78) {
    for (let i = 0; i < amount; i += 1) {
      tmpColor.setHex(color);
      spawn(
        pos.x + (Math.random() - 0.5) * 1.2, pos.y + 0.2, pos.z + (Math.random() - 0.5) * 1.2,
        (Math.random() - 0.5) * 2.4, 1.2 + Math.random() * 1.6, (Math.random() - 0.5) * 2.4,
        tmpColor, 10 + Math.random() * 12, 0.7 + Math.random() * 0.5, 1.4, -0.6,
      );
    }
  }

  /** A car exploding into a fireball. */
  function explosion(pos) {
    for (let i = 0; i < 46; i += 1) {
      const a = Math.random() * Math.PI * 2;
      const r = 0.4 + Math.random() * 2.4;
      tmpColor.setHex(i % 5 === 0 ? 0xfff2c0 : i % 2 ? 0xff8a2c : 0xff4a1e);
      spawn(
        pos.x, pos.y + 0.5, pos.z,
        Math.cos(a) * r * 3.4, 2 + Math.random() * 6.5, Math.sin(a) * r * 3.4,
        tmpColor, 26 + Math.random() * 30, 0.6 + Math.random() * 0.7, 1.5, 3,
      );
    }
    for (let i = 0; i < 18; i += 1) {
      tmpColor.setHex(0x2b2422);
      spawn(
        pos.x + (Math.random() - 0.5) * 2, pos.y + 1 + Math.random(), pos.z + (Math.random() - 0.5) * 2,
        (Math.random() - 0.5) * 3, 2.5 + Math.random() * 3, (Math.random() - 0.5) * 3,
        tmpColor, 40 + Math.random() * 40, 1.6 + Math.random(), 0.8, -1.4,
      );
    }
  }

  /** The sun-caught dust that hangs in the air over the boulevard, for atmosphere. */
  function ambientDust(center, dt) {
    if (Math.random() > dt * 8) return;
    tmpColor.setHex(0xffc88a);
    spawn(
      center.x + (Math.random() - 0.5) * 70, 1 + Math.random() * 14, center.z + (Math.random() - 0.5) * 70,
      (Math.random() - 0.5) * 0.6, 0.15 + Math.random() * 0.3, (Math.random() - 0.5) * 0.6,
      tmpColor, 2.4 + Math.random() * 2, 3.4, 0.2, -0.1,
    );
  }

  return { muzzle, impact, smoke, explosion, tracer, spawn, update, ambientDust };
}
