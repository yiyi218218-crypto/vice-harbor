// The sky, the sun and the fog: one shader dome paints the hour the game is set in — a sunset that
// runs violet at the zenith to a burnt-orange horizon — and a low warm sun rakes the city with long
// shadows. The dome and the shadow camera both follow the player, so the light never runs out.
import * as THREE from '../vendor/three.min.js';
import { LIGHT } from './config.js';

export function createSky(scene, renderer) {
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = LIGHT.exposure;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const sunDir = new THREE.Vector3(...LIGHT.sunDir).normalize();

  const dome = new THREE.Mesh(
    new THREE.SphereGeometry(1400, 40, 24),
    new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
      uniforms: {
        uTop: { value: new THREE.Color(LIGHT.skyTop) },
        uMid: { value: new THREE.Color(LIGHT.skyMid) },
        uLow: { value: new THREE.Color(LIGHT.skyLow) },
        uHorizon: { value: new THREE.Color(LIGHT.skyHorizon) },
        uSunColor: { value: new THREE.Color(LIGHT.sunColor) },
        uSunDir: { value: sunDir.clone() },
        uTime: { value: 0 },
      },
      vertexShader: `
        varying vec3 vDir;
        void main() {
          vDir = position;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform vec3 uTop, uMid, uLow, uHorizon, uSunColor, uSunDir;
        uniform float uTime;
        varying vec3 vDir;
        void main() {
          vec3 d = normalize(vDir);
          float h = clamp(d.y, -0.25, 1.0);
          vec3 col = mix(uHorizon, uLow, smoothstep(0.0, 0.13, h));
          col = mix(col, uMid, smoothstep(0.11, 0.36, h));
          col = mix(col, uTop, smoothstep(0.32, 0.86, h));
          float sun = max(dot(d, uSunDir), 0.0);
          col += uSunColor * pow(sun, 420.0) * 5.0;
          col += uSunColor * pow(sun, 14.0) * 0.62;
          col += uSunColor * pow(sun, 3.0) * 0.14;
          // Long streaky clouds, lit from below where the sun catches them.
          vec2 p = d.xz / max(abs(d.y) + 0.26, 0.06);
          float c = sin(p.x * 1.35 + uTime * 0.012) * sin(p.y * 1.85 - 0.6)
                  + 0.7 * sin((p.x + p.y * 0.6) * 2.7 + 1.3)
                  + 0.4 * sin(p.y * 4.1 - uTime * 0.02);
          float band = smoothstep(0.02, 0.16, d.y) * (1.0 - smoothstep(0.36, 0.72, d.y));
          float cloud = smoothstep(0.62, 1.35, c) * band;
          vec3 cloudCol = mix(vec3(0.30, 0.21, 0.29), uSunColor * 1.05, pow(sun, 2.2) * 0.85);
          col = mix(col, cloudCol, cloud * 0.62);
          // A faint haze hugging the waterline.
          col = mix(col, uHorizon * 1.06, smoothstep(0.05, -0.05, abs(d.y)) * 0.35);
          gl_FragColor = vec4(col, 1.0);
        }
      `,
    }),
  );
  dome.frustumCulled = false;
  dome.renderOrder = -10;
  scene.add(dome);

  // Stars, just the few that survive a sky this bright.
  const starPos = [];
  for (let i = 0; i < 260; i += 1) {
    const a = Math.random() * Math.PI * 2;
    const y = 0.28 + Math.random() * 0.72;
    const r = Math.sqrt(1 - y * y);
    starPos.push(Math.cos(a) * r * 1200, y * 1200, Math.sin(a) * r * 1200);
  }
  const starGeo = new THREE.BufferGeometry();
  starGeo.setAttribute('position', new THREE.Float32BufferAttribute(starPos, 3));
  const stars = new THREE.Points(starGeo, new THREE.PointsMaterial({
    color: 0xcfe0ff, size: 2.6, sizeAttenuation: false, transparent: true, opacity: 0.5, depthWrite: false, fog: false,
  }));
  stars.frustumCulled = false;
  scene.add(stars);

  scene.fog = new THREE.Fog(0xc98d72, LIGHT.fogNear, LIGHT.fogFar);

  const hemi = new THREE.HemisphereLight(LIGHT.ambientSky, LIGHT.ambientGround, 1.6);
  scene.add(hemi);
  // A warm bounce off the warm street, so shadowed walls keep a sunset colour rather than going blue.
  const bounce = new THREE.AmbientLight(0x8a5b52, 0.9);
  scene.add(bounce);

  const sun = new THREE.DirectionalLight(LIGHT.sunColor, 3.4);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.near = 8;
  sun.shadow.camera.far = 420;
  sun.shadow.camera.left = -120;
  sun.shadow.camera.right = 120;
  sun.shadow.camera.top = 120;
  sun.shadow.camera.bottom = -120;
  sun.shadow.bias = -0.0008;
  sun.shadow.normalBias = 0.6;
  scene.add(sun);
  scene.add(sun.target);

  // A cool fill from the opposite side so shadowed walls keep their shape.
  const fill = new THREE.DirectionalLight(0x7f95d0, 0.5);
  fill.position.set(-sunDir.x * 90, 70, -sunDir.z * 90);
  scene.add(fill);

  let time = 0;
  const focus = new THREE.Vector3();

  return {
    sunDir,
    sun,
    hemi,
    update(dt, target) {
      time += dt;
      dome.material.uniforms.uTime.value = time;
      if (target) {
        dome.position.set(target.x, 0, target.z);
        stars.position.set(target.x, 0, target.z);
        focus.copy(target);
        sun.position.set(target.x + sunDir.x * 190, sunDir.y * 190 + 12, target.z + sunDir.z * 190);
        sun.target.position.set(target.x, 0, target.z);
        sun.target.updateMatrixWorld();
        fill.position.set(target.x - sunDir.x * 90, 70, target.z - sunDir.z * 90);
        fill.target.position.set(target.x, 0, target.z);
        fill.target.updateMatrixWorld();
      }
    },
    /** Fog thickens as the hour turns; the player can push the hour with the R key. */
    setMood(mix) {
      const fog = new THREE.Color(0xb98070).lerp(new THREE.Color(0x2a3550), mix);
      scene.fog.color.copy(fog);
      scene.fog.near = LIGHT.fogNear - mix * 30;
      scene.fog.far = LIGHT.fogFar - mix * 200;
    },
  };
}
