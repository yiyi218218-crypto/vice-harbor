// Seeded randomness. The whole city, its traffic and its pedestrians come out of one
// integer, so `?seed=7` gives the same harbor on every machine and every screenshot.

export function hashString(text) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
}

export function mulberry32(seed) {
  let a = seed >>> 0;
  return function next() {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export class Rng {
  constructor(seed = 1) {
    this.seed = typeof seed === 'string' ? hashString(seed) : (seed >>> 0) || 1;
    this.next = mulberry32(this.seed);
    this.calls = 0;
  }

  float() {
    this.calls++;
    return this.next();
  }

  range(min, max) {
    return min + this.float() * (max - min);
  }

  int(min, max) {
    return Math.floor(this.range(min, max + 1));
  }

  chance(p) {
    return this.float() < p;
  }

  sign() {
    return this.float() < 0.5 ? -1 : 1;
  }

  pick(list) {
    if (!list || list.length === 0) return undefined;
    return list[Math.floor(this.float() * list.length) % list.length];
  }

  shuffle(list) {
    const out = list.slice();
    for (let i = out.length - 1; i > 0; i--) {
      const j = Math.floor(this.float() * (i + 1));
      const t = out[i];
      out[i] = out[j];
      out[j] = t;
    }
    return out;
  }

  // A stable child stream, so adding a feature later does not shift the whole city.
  fork(salt) {
    return new Rng((this.seed ^ hashString(String(salt))) >>> 0);
  }
}

// Smooth 1D value noise, used for building heights and crowd timing.
export function noise1(x, seed = 0) {
  const i = Math.floor(x);
  const f = x - i;
  const a = hashString(`${seed}:${i}`) / 4294967296;
  const b = hashString(`${seed}:${i + 1}`) / 4294967296;
  const t = f * f * (3 - 2 * f);
  return a + (b - a) * t;
}

export function clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}

export function lerp(a, b, t) {
  return a + (b - a) * t;
}

// Frame-rate independent smoothing for camera and steering.
export function damp(current, target, lambda, dt) {
  return lerp(current, target, 1 - Math.exp(-lambda * dt));
}

export function angleDelta(a, b) {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
}

export function dampAngle(current, target, lambda, dt) {
  return current + angleDelta(current, target) * (1 - Math.exp(-lambda * dt));
}
