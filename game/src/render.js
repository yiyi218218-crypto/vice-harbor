// Rendering layer: WebGL renderer setup, a third-person follow camera with
// separate walking/driving framing, small ambient animations, and a hook for
// the deterministic photo-mode camera.

import * as THREE from 'three';
import { CFG } from './config.js';
import { angleDelta, clamp } from './random.js';

export function createRenderer(canvas) {
  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    powerPreference: 'high-performance',
  });
  renderer.setPixelRatio(Math.min(globalThis.devicePixelRatio || 1, 1.6));
  renderer.setSize(globalThis.innerWidth, globalThis.innerHeight, false);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.34;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  return renderer;
}

export function createCamera() {
  const camera = new THREE.PerspectiveCamera(62, globalThis.innerWidth / globalThis.innerHeight, 0.1, 900);
  camera.position.set(0, CFG.camHeight, CFG.camDistance);
  return camera;
}

// The camera rig owns a smoothed focus point and heading so it never snaps.
export class CameraRig {
  constructor(camera) {
    this.camera = camera;
    this.focus = new THREE.Vector3(0, 1.2, 0);
    this.heading = 0;
    this.mode = 'foot';
    this.shot = null;
  }

  useShot(pose) {
    this.shot = pose;
    const c = pose.camera;
    this.camera.position.set(c.x, c.y, c.z);
    this.camera.lookAt(c.look.x, c.look.y, c.look.z);
  }

  clearShot() {
    this.shot = null;
  }

  update(target, dt, inCar = false) {
    if (this.shot) return; // frozen for screenshots
    this.mode = inCar ? 'car' : 'foot';
    const dist = inCar ? CFG.camDistance * 1.25 : CFG.camDistance;
    const height = inCar ? CFG.camHeight * 0.8 : CFG.camHeight;

    // Desired focus is slightly ahead of the player in their facing direction.
    const ahead = inCar ? CFG.camLookAhead * 1.6 : CFG.camLookAhead;
    const desiredFocus = new THREE.Vector3(
      target.x + Math.sin(target.heading) * ahead,
      1.2,
      target.z + Math.cos(target.heading) * ahead,
    );
    const k = 1 - Math.exp(-CFG.camLag * dt);
    this.focus.lerp(desiredFocus, k);

    // Camera trails behind the player, smoothly rotating toward their heading.
    const desiredHeading = target.heading + Math.PI;
    this.heading += angleDelta(desiredHeading, this.heading) * k;
    const bx = this.focus.x + Math.sin(this.heading) * dist;
    const bz = this.focus.z + Math.cos(this.heading) * dist;
    const desired = new THREE.Vector3(bx, height, bz);
    this.camera.position.lerp(desired, k);

    // Keep the camera above the streets and below the skyline.
    this.camera.position.y = clamp(this.camera.position.y, 2.2, 60);
    this.camera.lookAt(this.focus.x, this.focus.y + (inCar ? 0.6 : 1.0), this.focus.z);
  }
}

// Gentle life in the scene: bay shimmer and police light pulses.
export function animateScene(scene, time, sea) {
  if (sea && sea.material) {
    sea.material.emissiveIntensity = 0.5 + Math.sin(time * 0.8) * 0.12;
    sea.position.x = Math.sin(time * 0.15) * 1.2;
  }
  scene.traverse((obj) => {
    if (obj.name === 'policeBar' && obj.material) {
      obj.material.emissiveIntensity = 1.3 + Math.abs(Math.sin(time * 9)) * 1.7;
      obj.material.color.setHex(Math.sin(time * 9) > 0 ? 0x3d6bff : 0xff3040);
    }
  });
}

export function handleResize(renderer, camera) {
  const onResize = () => {
    camera.aspect = globalThis.innerWidth / globalThis.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(globalThis.innerWidth, globalThis.innerHeight, false);
  };
  globalThis.addEventListener('resize', onResize);
  return onResize;
}
