// Rendering setup: WebGL renderer, a third-person follow camera, dusk lighting
// and a gradient sky dome. Kept separate from the simulation for clarity.

import * as THREE from 'three';
import { CFG, PAL } from './config.js';

export function createRenderer(canvas) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.15;

  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(PAL.fog, CFG.world.fogNear, CFG.world.fogFar);

  const camera = new THREE.PerspectiveCamera(CFG.camera.fov, window.innerWidth / window.innerHeight, 0.1, 1200);
  camera.position.set(0, 40, 60);

  // hemisphere fill + low warm sun make long dusk shadows
  const hemi = new THREE.HemisphereLight(PAL.sun, PAL.ambient, 1.25);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(PAL.sun, 1.5);
  sun.position.set(-120, 90, 60);
  scene.add(sun);
  const fill = new THREE.DirectionalLight(0x5577aa, 0.5);
  fill.position.set(80, 40, -100);
  scene.add(fill);

  scene.add(makeSky());

  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });

  return { renderer, scene, camera };
}

// A large inward-facing sphere with a vertical gradient shader: violet at the
// zenith melting into a hot orange horizon. No texture, no network request.
function makeSky() {
  const geo = new THREE.SphereGeometry(700, 32, 16);
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    uniforms: {
      topColor: { value: new THREE.Color(PAL.skyTop) },
      bottomColor: { value: new THREE.Color(PAL.skyBottom) },
      offset: { value: 60 },
      exponent: { value: 0.7 },
    },
    vertexShader: `
      varying vec3 vWorld;
      void main() {
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vWorld = wp.xyz;
        gl_Position = projectionMatrix * viewMatrix * wp;
      }
    `,
    fragmentShader: `
      uniform vec3 topColor;
      uniform vec3 bottomColor;
      uniform float offset;
      uniform float exponent;
      varying vec3 vWorld;
      void main() {
        float h = normalize(vWorld + vec3(0.0, offset, 0.0)).y;
        float t = pow(max(h, 0.0), exponent);
        gl_FragColor = vec4(mix(bottomColor, topColor, t), 1.0);
      }
    `,
  });
  const sky = new THREE.Mesh(geo, mat);
  sky.position.y = -40;
  return sky;
}

// Smoothly trail the target. Heading is in radians; the camera sits behind and
// above the subject and looks slightly ahead of it.
export function followCamera(camera, target, heading, dt, instant = false) {
  const back = new THREE.Vector3(Math.sin(heading), 0, Math.cos(heading)).multiplyScalar(CFG.camera.dist);
  const desired = new THREE.Vector3(target.x, target.y, target.z).add(back);
  desired.y += CFG.camera.height;
  const k = instant ? 1 : 1 - Math.exp(-CFG.camera.follow * dt);
  camera.position.lerp(desired, k);
  const look = new THREE.Vector3(
    target.x + Math.sin(heading) * CFG.camera.lookAhead,
    target.y + 2.5,
    target.z + Math.cos(heading) * CFG.camera.lookAhead,
  );
  camera.lookAt(look);
}
