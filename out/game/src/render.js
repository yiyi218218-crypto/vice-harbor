// Rendering: one WebGLRenderer, one dusk sky dome, one shader water plane and the
// procedural textures the city reuses. Everything is generated here with canvas 2D,
// so the game ships no images at all.

import { SKY, SUN } from './config.js';
import { Rng } from './random.js';

const THREE = globalThis.THREE;

export function createRenderer(canvas, opts = {}) {
  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    alpha: false,
    powerPreference: 'high-performance',
    preserveDrawingBuffer: opts.capture === true,
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
  renderer.setSize(window.innerWidth, window.innerHeight, false);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  if ('outputColorSpace' in renderer && THREE.SRGBColorSpace) {
    renderer.outputColorSpace = THREE.SRGBColorSpace;
  }
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.46;
  renderer.setClearColor(0x0a0d16, 1);
  return renderer;
}

const SKY_VERT = `
  varying vec3 vDir;
  void main() {
    vDir = normalize(position);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const SKY_FRAG = `
  varying vec3 vDir;
  uniform vec3 uTop;
  uniform vec3 uMid;
  uniform vec3 uLow;
  uniform vec3 uHorizon;
  uniform vec3 uSunDir;
  uniform vec3 uSunColor;
  uniform float uTime;

  void main() {
    vec3 d = normalize(vDir);
    float h = clamp(d.y * 1.05 + 0.06, 0.0, 1.0);
    vec3 col = mix(uHorizon, uLow, smoothstep(0.0, 0.10, h));
    col = mix(col, uMid, smoothstep(0.08, 0.34, h));
    col = mix(col, uTop, smoothstep(0.30, 0.82, h));

    float sun = max(dot(d, normalize(uSunDir)), 0.0);
    col += uSunColor * pow(sun, 220.0) * 2.2;
    col += uSunColor * pow(sun, 8.0) * 0.30;
    col += uSunColor * pow(sun, 2.0) * 0.06;

    // thin cloud bands, moving very slowly
    float band = sin(d.y * 26.0 + uTime * 0.03) * 0.5 + 0.5;
    float streak = smoothstep(0.55, 0.95, band) * smoothstep(0.02, 0.28, h) * (1.0 - smoothstep(0.30, 0.55, h));
    col = mix(col, uHorizon * 1.05, streak * 0.20);

    gl_FragColor = vec4(col, 1.0);
  }
`;

const WATER_VERT = `
  varying vec2 vUv;
  varying vec3 vWorld;
  void main() {
    vUv = uv;
    vec4 w = modelMatrix * vec4(position, 1.0);
    vWorld = w.xyz;
    gl_Position = projectionMatrix * viewMatrix * w;
  }
`;

const WATER_FRAG = `
  varying vec2 vUv;
  varying vec3 vWorld;
  uniform float uTime;
  uniform vec3 uDeep;
  uniform vec3 uShallow;
  uniform vec3 uGlint;
  uniform vec3 uFog;
  uniform vec3 uSunDir;
  uniform vec3 uSunColor;
  uniform float uFogNear;
  uniform float uFogFar;

  float wave(vec2 q, float t) {
    return sin(q.x * 0.35 + sin(q.y * 0.21 + t * 0.2) * 1.7 + t * 0.6)
         * cos(q.y * 0.29 + sin(q.x * 0.17 - t * 0.15) * 1.9 - t * 0.5);
  }

  void main() {
    vec2 p = vWorld.xz;
    float t = uTime;
    float swell = wave(p, t);
    float w2 = sin(p.x * 0.16 - t * 1.05 + p.y * 0.07) * 0.5;

    vec3 col = mix(uDeep, uShallow, 0.32 + swell * 0.22 + w2 * 0.12);

    // surface normal from the same wave, one metre either side
    float e = 0.9;
    float hx = wave(p + vec2(e, 0.0), t) - wave(p - vec2(e, 0.0), t);
    float hz = wave(p + vec2(0.0, e), t) - wave(p - vec2(0.0, e), t);
    vec3 n = normalize(vec3(-hx * 2.2, 1.0, -hz * 2.2));

    vec3 viewDir = normalize(cameraPosition - vWorld);
    float fres = pow(1.0 - clamp(viewDir.y, 0.0, 1.0), 2.2);
    vec3 refl = mix(uShallow * 1.1, uGlint * 0.85, clamp(0.4 + swell * 0.3, 0.0, 1.0));
    col = mix(col, refl, fres * 0.55);

    // sun path: a narrow specular lobe plus a wide sheen
    vec3 sunDir = normalize(uSunDir);
    vec3 hv = normalize(sunDir + viewDir);
    float d = max(dot(n, hv), 0.0);
    float spec = pow(d, 160.0);
    float sheen = pow(d, 10.0);
    col += uGlint * (spec * 1.6 + sheen * 0.08);

    // churned water near the quay wall
    float rim = smoothstep(0.0, 5.0, abs(p.x - 236.0));
    col = mix(col * 1.12, col, rim);

    float dist = length(cameraPosition - vWorld);
    float fog = smoothstep(uFogNear, uFogFar, dist);
    col = mix(col, uFog, fog * 0.92);
    gl_FragColor = vec4(col, 1.0);
  }
`;

export function createStage() {
  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(new THREE.Color(SKY.fog), SUN.fogNear, SUN.fogFar);

  const camera = new THREE.PerspectiveCamera(58, window.innerWidth / window.innerHeight, 0.12, 1600);
  camera.position.set(0, 8, 20);

  const hemi = new THREE.HemisphereLight(new THREE.Color('#93a1cf'), new THREE.Color('#463a33'), 1.55);
  scene.add(hemi);

  const ambient = new THREE.AmbientLight(new THREE.Color(SUN.ambient), SUN.ambientIntensity);
  scene.add(ambient);

  const sun = new THREE.DirectionalLight(new THREE.Color(SUN.color), SUN.intensity);
  sun.position.set(SUN.position[0], SUN.position[1], SUN.position[2]);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.near = 1;
  sun.shadow.camera.far = 900;
  const s = 150;
  sun.shadow.camera.left = -s;
  sun.shadow.camera.right = s;
  sun.shadow.camera.top = s;
  sun.shadow.camera.bottom = -s;
  sun.shadow.bias = -0.0006;
  sun.shadow.normalBias = 0.035;
  scene.add(sun);
  scene.add(sun.target);

  const skyUniforms = {
    uTop: { value: new THREE.Color(SKY.top) },
    uMid: { value: new THREE.Color(SKY.mid) },
    uLow: { value: new THREE.Color(SKY.low) },
    uHorizon: { value: new THREE.Color(SKY.horizon) },
    uSunDir: { value: new THREE.Vector3(...SUN.position).normalize() },
    uSunColor: { value: new THREE.Color(SKY.sun) },
    uTime: { value: 0 },
  };
  const sky = new THREE.Mesh(
    new THREE.SphereGeometry(760, 40, 24),
    new THREE.ShaderMaterial({
      uniforms: skyUniforms,
      vertexShader: SKY_VERT,
      fragmentShader: SKY_FRAG,
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
    })
  );
  sky.name = 'sky';
  scene.add(sky);

  const waterUniforms = {
    uTime: { value: 0 },
    uDeep: { value: new THREE.Color(SKY.waterDeep) },
    uShallow: { value: new THREE.Color(SKY.waterShallow) },
    uGlint: { value: new THREE.Color(SKY.waterGlint) },
    uFog: { value: new THREE.Color(SKY.fog) },
    uSunDir: { value: new THREE.Vector3(...SUN.position).normalize() },
    uSunColor: { value: new THREE.Color(SKY.sun) },
    uFogNear: { value: 160 },
    uFogFar: { value: 900 },
  };
  const water = new THREE.Mesh(
    new THREE.PlaneGeometry(2400, 2400, 1, 1),
    new THREE.ShaderMaterial({
      uniforms: waterUniforms,
      vertexShader: WATER_VERT,
      fragmentShader: WATER_FRAG,
      fog: false,
    })
  );
  water.rotation.x = -Math.PI / 2;
  water.position.set(650, -0.62, 0);
  water.name = 'water';
  scene.add(water);

  const stage = {
    scene,
    camera,
    sun,
    hemi,
    ambient,
    sky,
    water,
    time: 0,
    update(dt, focus) {
      stage.time += dt;
      skyUniforms.uTime.value = stage.time;
      waterUniforms.uTime.value = stage.time;
      sky.position.copy(camera.position);
      if (focus) {
        sun.target.position.set(focus.x, 0, focus.z);
        sun.target.updateMatrixWorld();
        sun.position.set(focus.x + SUN.position[0] * 0.55, SUN.position[1] * 1.7, focus.z + SUN.position[2] * 0.55);
      }
    },
  };
  return stage;
}

export function resize(renderer, camera) {
  const w = window.innerWidth;
  const h = window.innerHeight;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}

// --- procedural textures -------------------------------------------------------

// Two canvases per facade: the diffuse one keeps the wall pale so the building's own
// vertex colour shows through, and the emissive one is black except for the lit panes,
// which is what makes the windows glow at dusk without washing out the walls.
export function makeFacadeTextures(seed = 3, tint = 'warm') {
  const rng = new Rng(seed);
  const size = 256;
  const mapCanvas = document.createElement('canvas');
  const glowCanvas = document.createElement('canvas');
  mapCanvas.width = glowCanvas.width = size;
  mapCanvas.height = glowCanvas.height = size;
  const ctx = mapCanvas.getContext('2d');
  const gl = glowCanvas.getContext('2d');

  ctx.fillStyle = '#d8d5cf';
  ctx.fillRect(0, 0, size, size);
  gl.fillStyle = '#000000';
  gl.fillRect(0, 0, size, size);

  // faint grain so flat walls are not perfectly flat
  for (let i = 0; i < 1600; i++) {
    const v = Math.round(rng.range(186, 226));
    ctx.fillStyle = `rgba(${v},${v - 3},${v - 8},0.35)`;
    ctx.fillRect(rng.range(0, size), rng.range(0, size), rng.range(1, 4), rng.range(1, 3));
  }

  const cols = 6;
  const rows = 5;
  const cw = size / cols;
  const ch = size / rows;

  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      const lit = rng.chance(tint === 'warm' ? 0.38 : 0.26);
      const px = x * cw + cw * 0.20;
      const py = y * ch + ch * 0.18;
      const w = cw * 0.60;
      const h = ch * 0.46;

      // reveal: darker stone around the opening
      ctx.fillStyle = 'rgba(90,86,80,0.35)';
      ctx.fillRect(px - 3, py - 3, w + 6, h + 6);

      ctx.fillStyle = lit ? '#3a3026' : '#2b2f38';
      ctx.fillRect(px, py, w, h);

      if (lit) {
        const warmth = rng.range(0.7, 1);
        const r = Math.round(255 * warmth);
        const g = Math.round(196 * warmth);
        const b = Math.round(126 * warmth);
        ctx.fillStyle = `rgb(${r},${g},${b})`;
        ctx.fillRect(px + 1, py + 1, w - 2, h - 2);
        gl.fillStyle = `rgb(${r},${Math.round(g * 0.92)},${Math.round(b * 0.8)})`;
        gl.fillRect(px + 1, py + 1, w - 2, h - 2);
      } else {
        // a cold reflection in the unlit panes
        ctx.fillStyle = 'rgba(120,150,175,0.18)';
        ctx.fillRect(px + 1, py + 1, w - 2, h * 0.35);
      }

      // mullion
      ctx.fillStyle = 'rgba(30,30,34,0.75)';
      ctx.fillRect(px + w / 2 - 1, py, 2, h);
    }
  }

  // floor bands
  ctx.strokeStyle = 'rgba(60,58,54,0.5)';
  ctx.lineWidth = 3;
  for (let j = 0; j <= rows; j++) {
    ctx.beginPath();
    ctx.moveTo(0, j * ch);
    ctx.lineTo(size, j * ch);
    ctx.stroke();
  }

  const make = (canvas, srgb) => {
    const tex = new THREE.CanvasTexture(canvas);
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    if (srgb) tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 4;
    return tex;
  };

  return { map: make(mapCanvas, true), emissive: make(glowCanvas, true) };
}

export function makeSignTexture(text, sub, color) {
  const w = 512;
  const h = 256;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, w, h);

  ctx.fillStyle = 'rgba(8,10,16,0.92)';
  ctx.fillRect(0, 0, w, h);
  ctx.strokeStyle = color;
  ctx.lineWidth = 8;
  ctx.strokeRect(8, 8, w - 16, h - 16);

  ctx.shadowColor = color;
  ctx.shadowBlur = 26;
  ctx.fillStyle = color;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = 'bold 96px "Bahnschrift", "DIN Alternate", sans-serif';
  ctx.fillText(text, w / 2, sub ? h / 2 - 22 : h / 2);
  if (sub) {
    ctx.shadowBlur = 12;
    ctx.font = '34px "Bahnschrift", "DIN Alternate", sans-serif';
    ctx.fillStyle = 'rgba(255,244,226,0.88)';
    ctx.fillText(sub, w / 2, h / 2 + 56);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function makeGlowTexture() {
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.35, 'rgba(255,255,255,0.55)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function makeAsphaltTexture(seed = 11) {
  const rng = new Rng(seed);
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#23262c';
  ctx.fillRect(0, 0, size, size);
  for (let i = 0; i < 5200; i++) {
    const v = Math.round(rng.range(22, 58));
    ctx.fillStyle = `rgba(${v},${v + 2},${v + 6},${rng.range(0.25, 0.7)})`;
    const x = rng.range(0, size);
    const y = rng.range(0, size);
    const r = rng.range(0.4, 1.9);
    ctx.fillRect(x, y, r, r);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

export function spriteFromTexture(tex, color, scale = 1, opacity = 1) {
  const mat = new THREE.SpriteMaterial({
    map: tex,
    color: new THREE.Color(color),
    transparent: true,
    opacity,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const sprite = new THREE.Sprite(mat);
  sprite.scale.set(scale, scale, 1);
  return sprite;
}

export { THREE };
